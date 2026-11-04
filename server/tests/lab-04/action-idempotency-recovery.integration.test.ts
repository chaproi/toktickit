import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { ActionPatchFixtures, PATCH_OPERATIONS, type PatchOperation } from "./action-patch-test-fixtures.js";
import { assertSafeEqual, assertSafeError } from "./action-read-test-fixtures.js";
import { assertSingleRecovery, ownedReceiptState, withReceiptCollision, type RecoveryFault } from "./receipt-recovery-test-helpers.js";

// AC-42/T-51, D-12/D-13. These controlled entry-point cases do not imply an
// ordinary receipt collision is reachable through the cooperating actor gate.
describe("T-51 real receipt constraint rollback and defensive HTTP recovery", () => {
  const fixtures = new ActionPatchFixtures();
  beforeAll(() => fixtures.initialize());
  afterAll(async () => { try { await fixtures.cleanup(); } finally { await getPrisma().$disconnect(); } });

  async function scenario(operation: PatchOperation | "create" = "edit") {
    const actor = await fixtures.read.actor(`recovery-${operation}`, "IT_STAFF");
    let source; let input; let first;
    if (operation === "create") {
      const parent = await fixtures.creates.parent(); input = fixtures.creates.input(parent);
      first = await fixtures.creates.create(parent, input, actor);
      source = { action: first.action, parent: first.parent };
    } else {
      source = await fixtures.setup(operation === "complete" ? "IN_PROGRESS" : "PLANNED");
      input = fixtures.input(source, operation); first = await fixtures.successful(source, operation, input, actor);
    }
    // A separate owned PLANNED Action permits valid bounded harness writes even
    // when the original receipt references a terminal Action.
    const witness = await fixtures.setup();
    const request = () => operation === "create" ? fixtures.creates.post(fixtures.creates.path(source.parent.id), input, actor) :
      fixtures.patch(fixtures.path(source, operation), input, actor);
    const before = await ownedReceiptState(fixtures.prisma, fixtures.read.ticketIds);
    const inject = { receipt: first.receipt, ticketIds: [...fixtures.read.ticketIds], witnessActionId: witness.action.id };
    return { source, input, first, witness, actor, before, inject, request };
  }

  it.each(["create", ...PATCH_OPERATIONS] as const)("%s returns the original operation-time response after actual receipt-key rollback", async (operation) => {
    const s = await scenario(operation);
    // Real later advancement for create/edit, proving recovery returns stored
    // values rather than manufacturing a DTO from current state.
    if (operation === "create" || operation === "edit") {
      const current = { action: s.first.action, parent: s.first.parent };
      await fixtures.successful(current, "start", fixtures.input(current, "start"), s.actor);
      s.before = await ownedReceiptState(fixtures.prisma, fixtures.read.ticketIds);
    }
    await withReceiptCollision(s.inject, async (evidence) => {
      const response = await s.request();
      // Preservation checks execute even while recovery response assertions are RED.
      assertSafeEqual(await ownedReceiptState(fixtures.prisma, fixtures.read.ticketIds), s.before, "Recovery preserves exact Action/version/history/parent times and every receipt");
      expect(evidence.staged && evidence.rolledBack && evidence.independentObserver).toBe(true);
      expect(response.status).toBe(200);
      assertSafeEqual(response.body, { ...s.first.response.body, replayed: true }, "Exact original safe replay, including old version/time");
      expect(response.headers["cache-control"]).toBe("private, no-store");
      assertSingleRecovery(evidence);
    });
  });

  it.each(["operation", "target", "input"] as const)("changed %s returns DUPLICATE_REQUEST_CONFLICT after verified rollback", async (change) => {
    const s = await scenario();
    const target = change === "target" ? await fixtures.sibling(s.first) : s.source;
    const operation = change === "operation" ? "start" : "edit";
    const input = change === "operation" ? { ...fixtures.input(s.source, "start"),
      expectedVersion: s.input.expectedVersion, expectedTicketUpdatedAt: s.input.expectedTicketUpdatedAt,
      clientMutationId: s.input.clientMutationId } : { ...s.input,
      ...(change === "input" ? { description: "Different original request content" } : {}) };
    const before = await ownedReceiptState(fixtures.prisma, fixtures.read.ticketIds);
    await withReceiptCollision(s.inject, async (evidence) => {
      const response = await fixtures.patch(fixtures.path(target, operation), input, s.actor);
      assertSafeEqual(await ownedReceiptState(fixtures.prisma, fixtures.read.ticketIds), before, "Changed request preserves all receipts and domain rows");
      expect(evidence.rolledBack).toBe(true);
      assertSafeError(response, 409, "DUPLICATE_REQUEST_CONFLICT");
      assertSingleRecovery(evidence);
    });
  });

  it.each(["revoked", "inactive", "demoted"] as const)("fresh recovery denies actor %s after rollback without returning stored DTO", async (state) => {
    const s = await scenario();
    await withReceiptCollision({ ...s.inject, afterRollback: async (observer) => {
      if (state === "revoked") await observer.authSession.deleteMany({ where: { userId: s.actor.user.id } });
      else await observer.user.update({ where: { id: s.actor.user.id }, data: state === "inactive" ? { isActive: false } : { role: "REQUESTER" } });
    } }, async (evidence) => {
      const response = await s.request();
      assertSafeEqual(await ownedReceiptState(fixtures.prisma, fixtures.read.ticketIds), s.before, "Denied recovery keeps all domain rows and original receipts");
      expect(evidence.rolledBack).toBe(true);
      assertSafeError(response, state === "demoted" ? 403 : 401, state === "demoted" ? "ROLE_FORBIDDEN" : "AUTHENTICATION_REQUIRED");
      expect(response.body).not.toHaveProperty("action"); expect(response.body).not.toHaveProperty("replayed");
      assertSingleRecovery(evidence, false);
    });
  });

  it.each(["revoked", "inactive", "demoted"] as const)("already %s actor is denied by inherited authorization before defensive entry", async (state) => {
    const s = await scenario();
    if (state === "revoked") await fixtures.prisma.authSession.deleteMany({ where: { userId: s.actor.user.id } });
    else await fixtures.prisma.user.update({ where: { id: s.actor.user.id }, data: state === "inactive" ? { isActive: false } : { role: "REQUESTER" } });
    const response = await s.request();
    assertSafeError(response, state === "demoted" ? 403 : 401, state === "demoted" ? "ROLE_FORBIDDEN" : "AUTHENTICATION_REQUIRED");
    assertSafeEqual(await ownedReceiptState(fixtures.prisma, fixtures.read.ticketIds), s.before, "Existing authorization denies without leaking DTO or changing domain data");
  });

  it.each([
    { fault: "missing", status: 409, code: "CONCURRENT_UPDATE" },
    { fault: "unavailable", status: 503, code: "SERVICE_UNAVAILABLE" },
    { fault: "unexpected", status: 500, code: "INTERNAL_ERROR" },
    { fault: "40001", status: 409, code: "CONCURRENT_UPDATE" },
  ] satisfies Array<{ fault: RecoveryFault; status: number; code: string }>)("$fault on one fresh recovery read is safely bounded without mutation restart", async ({ fault, status, code }) => {
    const s = await scenario();
    await withReceiptCollision({ ...s.inject, recoveryFault: fault }, async (evidence) => {
      const response = await s.request();
      assertSafeEqual(await ownedReceiptState(fixtures.prisma, fixtures.read.ticketIds), s.before, "Recovery read failure preserves complete rollback and original receipt");
      expect(evidence.rolledBack).toBe(true);
      assertSafeError(response, status, code);
      assertSingleRecovery(evidence);
    });
  });
});
