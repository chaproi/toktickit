import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Response } from "supertest";
import { ActionPatchFixtures, COMPLETION_TEXT, CANCELLATION_TEXT } from "./action-patch-test-fixtures.js";
import { actionSnapshot, assertSafeEqual, assertSafeError, LITERAL } from "./action-read-test-fixtures.js";
import { orderedUserRace, ticketState } from "./actions-concurrency-test-helpers.js";

// Partial AC-42/T-52, D-12/D-13: cooperating actor gates, not defensive T-51
// uniqueness recovery, induced serialization exhaustion/T-42 or workflow races.
describe("T-52 cooperating Action receipt races", () => {
  const fixtures = new ActionPatchFixtures();
  let receiptAssigneeId: number;
  beforeAll(async () => {
    await fixtures.initialize();
    // User gates sort by ID. A later assignee ensures same-actor requests wait
    // on the ACTOR gate first, rather than an older shared assignee gate.
    receiptAssigneeId = (await fixtures.read.actor("receipt-race-assignee", "IT_STAFF")).user.id;
    expect(receiptAssigneeId).toBeGreaterThan(fixtures.staff.user.id);
  });
  afterAll(() => fixtures.cleanup());
  const actor = () => fixtures.staff;
  type State = Awaited<ReturnType<typeof ticketState>>;
  async function committed(before: State, response: Response, operation: "create" | "edit" | "start" | "complete" | "cancel", key: string, actorId = actor().user.id) {
    expect(response.status).toBe(operation === "create" ? 201 : 200);
    const after = await ticketState(fixtures.prisma, before.ticket.id);
    expect(after.actions).toHaveLength(before.actions.length + (operation === "create" ? 1 : 0));
    expect(after.history).toHaveLength(before.history.length + 1);
    expect(after.receipts.length).toBe(before.receipts.length + 1);
    assertSafeEqual(after.history.slice(0, before.history.length), before.history, "Existing history retained");
    assertSafeEqual(after.receipts.slice(0, before.receipts.length), before.receipts, "Existing receipts never overwritten");
    const action = after.actions[0];
    expect(action.version).toBe(operation === "create" ? 1 : before.actions[0].version + 1);
    const status = operation === "complete" ? "COMPLETED" : operation === "cancel" ? "CANCELLED" : operation === "start" ? "IN_PROGRESS" : "PLANNED";
    expect(action.status).toBe(status);
    expect(action.performedById).toBe(operation === "complete" ? actorId : null);
    const expected = operation === "create" ? {
      ticketId: before.ticket.id, createdById: actorId, assigneeId: receiptAssigneeId,
      performedById: null, description: LITERAL, result: null, followUpRequired: false, followUpNote: null,
      attachmentNotes: null, status: "PLANNED", version: 1, completedAt: null, cancelledAt: null, cancellationReason: null,
      id: action.id, createdAt: action.updatedAt, actionAt: action.updatedAt, updatedAt: action.updatedAt,
    } : { ...before.actions[0], version: before.actions[0].version + 1, updatedAt: action.updatedAt,
      ...(operation === "edit" ? { description: "Concurrent edited description" } : {}),
      ...(operation === "start" ? { status: "IN_PROGRESS" } : {}),
      ...(operation === "complete" ? { status: "COMPLETED", result: COMPLETION_TEXT, performedById: actorId, completedAt: action.updatedAt } : {}),
      ...(operation === "cancel" ? { status: "CANCELLED", cancellationReason: CANCELLATION_TEXT, cancelledAt: action.updatedAt, performedById: null, completedAt: null } : {}),
    };
    assertSafeEqual(action, expected, "Exact one winning Action mutation, attribution and immutable fields");
    fixtures.read.assertDTO(response.body.action, action);
    expect(after.ticket.updatedAt.getTime()).toBeGreaterThan(before.ticket.updatedAt.getTime());
    expect(response.body.ticketUpdatedAt).toBe(after.ticket.updatedAt.toISOString());
    expect(action.updatedAt.toISOString()).toBe(after.ticket.updatedAt.toISOString());
    assertSafeEqual({ ...after.ticket, updatedAt: before.ticket.updatedAt }, before.ticket, "Only winning parent time advances");
    const history = after.history.at(-1)!;
    expect(history.actionId).toBe(action.id);
    expect(history.actorId).toBe(actorId); expect(history.actionVersion).toBe(action.version);
    expect(history.event).toBe(operation === "create" ? "ACTION_CREATED" : operation === "edit" ? "ACTION_EDITED" : operation === "start" ? "ACTION_STARTED" : operation === "complete" ? "ACTION_COMPLETED" : "ACTION_CANCELLED");
    expect(history.sourceTicketStatusHistoryId).toBeNull();
    expect(history.createdAt.toISOString()).toBe(action.updatedAt.toISOString());
    assertSafeEqual(history.before, operation === "create" ? null : actionSnapshot(before.actions[0]), "Complete previous history values");
    assertSafeEqual(history.after, actionSnapshot(action), "Complete committed history values");
    const receipt = after.receipts.at(-1)!;
    expect({ actorId: receipt.actorId, clientMutationId: receipt.clientMutationId, ticketId: receipt.ticketId, actionId: receipt.actionId, operation: receipt.operation }).toEqual({
      actorId, clientMutationId: key, ticketId: before.ticket.id, actionId: action.id,
      operation: operation === "create" ? "CREATE_ACTION" : operation === "edit" ? "EDIT_ACTION" : operation === "start" ? "START_ACTION" : operation === "complete" ? "COMPLETE_ACTION" : "CANCEL_ACTION",
    });
    expect(/^[a-f0-9]{64}$/u.test(receipt.inputFingerprint), "Valid fingerprint representation; content redacted").toBe(true);
    expect(receipt.createdAt.toISOString()).toBe(action.updatedAt.toISOString());
    assertSafeEqual(receipt.safeResponse, response.body, "Exact winning operation-time response stored once");
    expect(await fixtures.prisma.mutationReceipt.count({ where: { actorId, clientMutationId: key } })).toBe(1);
    return after;
  }

  it.each([0, 1])("same actor/key across Tickets: target %i wins without mutating the other target", async (winner) => {
    const parents = [await fixtures.creates.parent(), await fixtures.creates.parent()];
    const before = await Promise.all(parents.map((parent) => ticketState(fixtures.prisma, parent.id)));
    const key = randomUUID();
    const inputs = parents.map((parent) => ({ ...fixtures.creates.input(parent, receiptAssigneeId), clientMutationId: key }));
    const calls = parents.map((parent, index) => () => fixtures.creates.post(fixtures.creates.path(parent.id), inputs[index], actor()));
    const result = await orderedUserRace(actor().user.id, calls[winner], calls[1 - winner]);
    assertSafeError(result.second, 409, "DUPLICATE_REQUEST_CONFLICT");
    const winning = await committed(before[winner], result.first, "create", key);
    assertSafeEqual(await ticketState(fixtures.prisma, parents[1 - winner].id), before[1 - winner], "Cross-Ticket loser has no Action/history/receipt or parent-time change");
    assertSafeEqual(winning.receipts.at(-1)!.safeResponse, result.first.body, "Original receipt never replaced by losing target");
  }, 15_000);

  it.each(["create", "complete", "cancel"] as const)("identical concurrent %s replays the exact original response once", async (operation) => {
    const source = operation === "create" ? null : await fixtures.setup(operation === "complete" ? "IN_PROGRESS" : "PLANNED", { assigneeId: receiptAssigneeId });
    const parent = source?.parent ?? await fixtures.creates.parent();
    const input = operation === "create" ? fixtures.creates.input(parent, receiptAssigneeId) : fixtures.input(source!, operation);
    const before = await ticketState(fixtures.prisma, parent.id);
    const call = () => operation === "create" ? fixtures.creates.post(fixtures.creates.path(parent.id), input, actor()) : fixtures.patch(fixtures.path(source!, operation), input, actor());
    const result = await orderedUserRace(actor().user.id, call, call);
    expect(result.second.status).toBe(200);
    assertSafeEqual(result.second.body, { ...result.first.body, replayed: true }, "Exact original snapshot/timestamps replay, even after completion/cancellation");
    await committed(before, result.first, operation, String(input.clientMutationId));
  }, 15_000);

  it("changed original input sharing actor/key conflicts without extra writes", async () => {
    const parent = await fixtures.creates.parent(); const key = randomUUID();
    const original = { ...fixtures.creates.input(parent, receiptAssigneeId), clientMutationId: key };
    const changed = { ...original, description: "Different concurrent original input" };
    const before = await ticketState(fixtures.prisma, parent.id);
    const result = await orderedUserRace(actor().user.id,
      () => fixtures.creates.post(fixtures.creates.path(parent.id), original, actor()),
      () => fixtures.creates.post(fixtures.creates.path(parent.id), changed, actor()));
    assertSafeError(result.second, 409, "DUPLICATE_REQUEST_CONFLICT");
    await committed(before, result.first, "create", key);
  }, 15_000);

  it.each(["edit", "start"] as const)("different operations sharing actor/key: %s wins and original receipt is retained", async (winner) => {
    const source = await fixtures.setup("PLANNED", { assigneeId: receiptAssigneeId }); const before = await ticketState(fixtures.prisma, source.parent.id); const key = randomUUID();
    const loser = winner === "edit" ? "start" : "edit";
    const inputs = {
      edit: { ...fixtures.editInput(source, { description: "Concurrent edited description" }), clientMutationId: key },
      start: { ...fixtures.input(source, "start"), clientMutationId: key },
    };
    const result = await orderedUserRace(actor().user.id,
      () => fixtures.patch(fixtures.path(source, winner), inputs[winner], actor()),
      () => fixtures.patch(fixtures.path(source, loser), inputs[loser], actor()));
    assertSafeError(result.second, 409, "DUPLICATE_REQUEST_CONFLICT");
    await committed(before, result.first, winner, key);
  }, 15_000);

  it.each([0, 1])("different actors sharing UUID: actor %i first, independent target mutations and receipts", async (winner) => {
    const other = await fixtures.read.actor("independent-receipt-actor", "IT_STAFF");
    const actors = [actor(), other]; const parents = [await fixtures.creates.parent(), await fixtures.creates.parent()];
    const before = await Promise.all(parents.map((parent) => ticketState(fixtures.prisma, parent.id))); const key = randomUUID();
    const inputs = parents.map((parent) => ({ ...fixtures.creates.input(parent, receiptAssigneeId), clientMutationId: key }));
    const calls = parents.map((parent, index) => () => fixtures.creates.post(fixtures.creates.path(parent.id), inputs[index], actors[index]));
    // These distinct actor gates share only the assignee User gate; both target
    // requests overlap there, but UUID uniqueness is scoped independently.
    const result = await orderedUserRace(receiptAssigneeId, calls[winner], calls[1 - winner]);
    await committed(before[winner], result.first, "create", key, actors[winner].user.id);
    await committed(before[1 - winner], result.second, "create", key, actors[1 - winner].user.id);
    expect(await fixtures.prisma.mutationReceipt.count({ where: { actorId: { in: actors.map((value) => value.user.id) }, clientMutationId: key } })).toBe(2);
  }, 15_000);
  // Same-actor gates precede receipt lookup/insertion across every Ticket.
  // A waiter takes a confirmed-40001 fresh attempt and observes the committed
  // receipt; a normal cooperating insertion collision is therefore prevented.
});


import { Prisma } from "@prisma/client";
import { getPrisma } from "../../src/prisma.js";
import { editableUser } from "../lab-03/issue35-test-helpers.js";
import { retryState, withLateActionFaults, type AttemptEvidence, type LateFault } from "./action-retry-test-helpers.js";

// AC-15/T-15: real distinct editors, original Action/parent tokens and observed
// shared assignee gate. No sequential-request overlap or mocked mutation.
describe("T-15 real concurrent Action edits", () => {
  const edits = new ActionPatchFixtures();
  beforeAll(() => edits.initialize());
  afterAll(() => edits.cleanup());
  it.each([0, 1])("editor %i wins once; other original-token edit is stale", async (winner) => {
    const other = await edits.read.actor("concurrent-editor", "IT_STAFF");
    const actors = [edits.staff, other]; const source = await edits.setup();
    const before = await ticketState(edits.prisma, source.parent.id);
    const text = ["First editor literal <script>text</script>", "Second editor distinct material content"];
    const input = actors.map((_, index) => edits.editInput(source, { description: text[index] }));
    expect(input[0].clientMutationId === input[1].clientMutationId).toBe(false);
    const calls = actors.map((actor, index) => () => edits.patch(edits.path(source, "edit"), input[index], actor));
    const result = await orderedUserRace(source.action.assigneeId, calls[winner], calls[1 - winner]);
    expect(result.first.status).toBe(200);
    // This controlled two-request order does not observe retry exhaustion.
    assertSafeError(result.second, 409, "STALE_WRITE");
    const after = await ticketState(edits.prisma, source.parent.id);
    expect(after.actions.length).toBe(1); expect(after.history.length).toBe(before.history.length + 1);
    expect(after.receipts.length).toBe(before.receipts.length + 1);
    const action = after.actions[0];
    assertSafeEqual(action, { ...source.action, description: text[winner], version: source.action.version + 1, updatedAt: action.updatedAt }, "Only winning edit/time/version changes; no overwrite or immutable-field change");
    expect(action.updatedAt.getTime()).toBeGreaterThan(source.action.updatedAt.getTime());
    expect(after.ticket.updatedAt.getTime()).toBeGreaterThan(source.parent.updatedAt.getTime());
    expect(after.ticket.updatedAt.toISOString()).toBe(action.updatedAt.toISOString());
    const [precision] = await edits.prisma.$queryRaw<Array<{ milliseconds: boolean }>>`SELECT
      (a."updatedAt"=date_trunc('milliseconds',a."updatedAt") AND t."updatedAt"=date_trunc('milliseconds',t."updatedAt")) AS milliseconds
      FROM "Action" a JOIN "Ticket" t ON t.id=a."ticketId" WHERE a.id=${action.id}`;
    expect(precision.milliseconds).toBe(true);
    assertSafeEqual({ ...after.ticket, updatedAt: source.parent.updatedAt }, source.parent, "Only parent time advances");
    edits.read.assertDTO(result.first.body.action, action);
    expect(result.first.body.ticketUpdatedAt).toBe(after.ticket.updatedAt.toISOString());
    assertSafeEqual(after.history.slice(0, before.history.length), before.history, "Earlier audit unchanged");
    assertSafeEqual(after.receipts.slice(0, before.receipts.length), before.receipts, "Earlier receipts unchanged");
    const history = after.history.at(-1)!;
    expect({ actionId: history.actionId, actorId: history.actorId, actionVersion: history.actionVersion, event: history.event, source: history.sourceTicketStatusHistoryId })
      .toEqual({ actionId: action.id, actorId: actors[winner].user.id, actionVersion: action.version, event: "ACTION_EDITED", source: null });
    assertSafeEqual(history.before, actionSnapshot(source.action), "Original complete values retained");
    assertSafeEqual(history.after, actionSnapshot(action), "Winning complete values recorded");
    expect(history.createdAt.toISOString()).toBe(action.updatedAt.toISOString());
    const receipt = after.receipts.at(-1)!;
    expect(receipt.actorId).toBe(actors[winner].user.id); expect(receipt.clientMutationId).toBe(input[winner].clientMutationId);
    expect(receipt.operation).toBe("EDIT_ACTION"); expect(receipt.actionId).toBe(action.id); expect(receipt.ticketId).toBe(source.parent.id);
    assertSafeEqual(receipt.safeResponse, result.first.body, "One winning operation-time receipt");
    expect(await edits.prisma.mutationReceipt.count({ where: { actorId: actors[1 - winner].user.id, clientMutationId: String(input[1 - winner].clientMutationId) } })).toBe(0);
  });
});

// AC-16/T-42: actual app SERIALIZABLE transactions with controlled late SQL
// faults, plus honestly synthetic Prisma classification boundaries. No T-51.
describe("T-42 confirmed serialization retry boundaries", () => {
  const retries = new ActionPatchFixtures();
  beforeAll(() => retries.initialize());
  afterAll(async () => { try { await retries.cleanup(); } finally { await getPrisma().$disconnect(); } });
  const description = "One committed retry edit <script>literal</script>";
  function fresh(attempts: AttemptEvidence[]) {
    expect(new Set(attempts.map((attempt) => attempt.transactionId)).size).toBe(attempts.length);
    for (const attempt of attempts) {
      expect(/^\d+$/u.test(attempt.transactionId)).toBe(true);
      expect(attempt.isolation).toBe("serializable");
    }
  }
  function authorizedReads(attempt: AttemptEvidence, before: Awaited<ReturnType<typeof retryState>>) {
    expect(attempt.stages).toEqual(["users", "session", "ticket", "action"]);
    expect(attempt.actorActive).toBe(true); expect(attempt.actorRole).toBe("IT_STAFF"); expect(attempt.sessionFound).toBe(true);
    expect(attempt.assigneeActive).toBe(true); expect(["IT_STAFF", "ADMINISTRATOR"]).toContain(attempt.assigneeRole);
    expect(attempt.parentUpdatedAt).toBe(before.ticket.updatedAt.toISOString()); expect(attempt.actionVersion).toBe(before.actions[0].version);
  }
  function stagedAndRolledBack(attempt: AttemptEvidence, before: Awaited<ReturnType<typeof retryState>>) {
    expect(attempt.staged).toBeDefined(); expect(attempt.rolledBack).toBeDefined();
    const staged = attempt.staged!;
    expect(staged.actions.length).toBe(before.actions.length);
    assertSafeEqual(staged.actions[0], { ...before.actions[0], description, version: before.actions[0].version + 1, updatedAt: staged.actions[0].updatedAt }, "Complete staged Action change, immutable fields retained");
    expect(staged.actions[0].version).toBe(before.actions[0].version + 1);
    expect(staged.actions[0].description).toBe(description);
    expect(staged.history.length).toBe(before.history.length + 1); expect(staged.receipts.length).toBe(before.receipts.length + 1);
    expect(staged.ticket.updatedAt.getTime()).toBeGreaterThan(before.ticket.updatedAt.getTime());
    expect(staged.actions[0].updatedAt.toISOString()).toBe(staged.ticket.updatedAt.toISOString());
    const stored = staged.receipts.at(-1)!.safeResponse;
    expect(typeof stored === "object" && stored !== null && !Array.isArray(stored), "Staged receipt is a safe response object").toBe(true);
    const response = stored as Record<string, unknown>;
    expect(Object.keys(response).sort()).toEqual(["action", "ticketUpdatedAt"]);
    expect(typeof response.action === "object" && response.action !== null && !Array.isArray(response.action), "Staged ActionDTO is an object").toBe(true);
    retries.read.assertDTO(response.action as Record<string, unknown>, staged.actions[0]);
    expect(response.ticketUpdatedAt).toBe(staged.ticket.updatedAt.toISOString());
    const history = staged.history.at(-1)!;
    expect(history.actorId).toBe(staged.receipts.at(-1)!.actorId);
    expect(history.event).toBe("ACTION_EDITED"); expect(history.actionVersion).toBe(staged.actions[0].version);
    assertSafeEqual(history.before, actionSnapshot(before.actions[0]), "Failed-attempt complete history.before was staged");
    assertSafeEqual(history.after, actionSnapshot(staged.actions[0]), "Failed-attempt complete history.after was staged");
    assertSafeEqual(attempt.rolledBack, before, "Separate client confirms all staged Action/history/parent/receipt writes disappeared before another attempt");
  }
  async function scenario() {
    const source = await retries.setup(); const before = await retryState(retries.prisma, source.parent.id);
    const actor = await retries.read.actor("independent-retry-actor", "IT_STAFF");
    const input = retries.editInput(source, { description, assigneeId: source.action.assigneeId });
    const inject = { fixture: retries.prisma, ticketId: source.parent.id, actorId: actor.user.id, assigneeId: source.action.assigneeId };
    const request = () => retries.patch(retries.path(source, "edit"), input, actor);
    return { source, before, input, inject, request, actor };
  }
  async function committed(s: Awaited<ReturnType<typeof scenario>>, response: Response) {
    expect(response.status).toBe(200);
    const after = await retryState(retries.prisma, s.source.parent.id); const action = after.actions[0];
    expect(after.actions.length).toBe(s.before.actions.length);
    assertSafeEqual(action, { ...s.source.action, description, version: s.source.action.version + 1, updatedAt: action.updatedAt }, "Only final successful attempt survives with one version increment");
    retries.read.assertDTO(response.body.action, action);
    expect(action.updatedAt.getTime()).toBeGreaterThan(s.source.action.updatedAt.getTime());
    expect(after.ticket.updatedAt.toISOString()).toBe(action.updatedAt.toISOString());
    assertSafeEqual({ ...after.ticket, updatedAt: s.source.parent.updatedAt }, s.source.parent, "Only parent time advances once");
    expect(after.history.length).toBe(s.before.history.length + 1); expect(after.receipts.length).toBe(s.before.receipts.length + 1);
    assertSafeEqual(after.history.slice(0, s.before.history.length), s.before.history, "Original audit preserved");
    assertSafeEqual(after.receipts.slice(0, s.before.receipts.length), s.before.receipts, "Original receipts preserved");
    const history = after.history.at(-1)!;
    expect(history.event).toBe("ACTION_EDITED"); expect(history.actionVersion).toBe(action.version); expect(history.actorId).toBe(s.actor.user.id);
    expect(history.actionId).toBe(action.id); expect(history.sourceTicketStatusHistoryId).toBeNull();
    expect(history.createdAt.toISOString()).toBe(action.updatedAt.toISOString());
    assertSafeEqual(history.before, actionSnapshot(s.source.action), "Committed before snapshot"); assertSafeEqual(history.after, actionSnapshot(action), "Committed after snapshot");
    const receipt = after.receipts.at(-1)!;
    expect({ actorId: receipt.actorId, clientMutationId: receipt.clientMutationId, operation: receipt.operation, ticketId: receipt.ticketId, actionId: receipt.actionId }).toEqual({
      actorId: s.actor.user.id, clientMutationId: s.input.clientMutationId, operation: "EDIT_ACTION", ticketId: s.source.parent.id, actionId: action.id,
    });
    expect(receipt.createdAt.toISOString()).toBe(action.updatedAt.toISOString());
    assertSafeEqual(after.receipts.at(-1)!.safeResponse, response.body, "Only final original response retained");
    return after;
  }

  it.each([1, 2])("%i PostgreSQL 40001 late faults roll back, then a fresh attempt succeeds", async (failures) => {
    const s = await scenario();
    await withLateActionFaults({ ...s.inject, faults: Array<LateFault>(failures).fill("40001") }, async (attempts) => {
      const response = await s.request(); expect(attempts.length).toBe(failures + 1); fresh(attempts);
      for (const attempt of attempts) authorizedReads(attempt, s.before);
      for (const attempt of attempts.slice(0, failures)) { expect(attempt.code).toBe("P2010"); expect(attempt.sqlState).toBe("40001"); stagedAndRolledBack(attempt, s.before); }
      await committed(s, response);
    });
  });

  it("three PostgreSQL 40001 faults exhaust exactly three attempts without surviving writes", async () => {
    const s = await scenario();
    await withLateActionFaults({ ...s.inject, faults: ["40001", "40001", "40001"] }, async (attempts) => {
      const response = await s.request(); assertSafeError(response, 409, "CONCURRENT_UPDATE"); expect(attempts.length).toBe(3); fresh(attempts);
      for (const attempt of attempts) { authorizedReads(attempt, s.before); expect(attempt.sqlState).toBe("40001"); stagedAndRolledBack(attempt, s.before); }
      assertSafeEqual(await retryState(retries.prisma, s.source.parent.id), s.before, "Exhaustion leaves no mutation receipt, extra history or timestamp/version changes");
    });
  });

  it.each(["revoke-actor", "promote-assignee", "competing-edit"] as const)("observes %s committed only after failed transaction rollback", async (change) => {
    const s = await scenario(); let externalState = s.before;
    await withLateActionFaults({ ...s.inject, faults: ["40001"], afterRollback: async (attempt) => {
      expect(attempt.attempt).toBe(1); stagedAndRolledBack(attempt, s.before);
      if (change === "competing-edit") {
        const external = await retries.patch(retries.path(s.source, "edit"), retries.editInput(s.source, { description: "Independent committed concurrent edit" }), retries.administrator);
        expect(external.status).toBe(200); externalState = await retryState(retries.prisma, s.source.parent.id);
      } else {
        const targetId = change === "revoke-actor" ? s.actor.user.id : s.source.action.assigneeId;
        const user = await retries.prisma.user.findUniqueOrThrow({ where: { id: targetId } });
        const edited = await retries.patch(`/api/admin/users/${targetId}`, editableUser(user, change === "revoke-actor" ? { isActive: false } : { role: "ADMINISTRATOR" }), retries.administrator);
        expect(edited.status).toBe(200);
      }
    } }, async (attempts) => {
      const response = await s.request(); expect(attempts.length).toBe(2); fresh(attempts); authorizedReads(attempts[0], s.before);
      expect(attempts[0].sqlState).toBe("40001");
      if (change === "revoke-actor") {
        assertSafeError(response, 401, "AUTHENTICATION_REQUIRED"); expect(attempts[1].actorActive).toBe(false); expect(attempts[1].sessionFound).toBe(false);
        expect(attempts[1].stages).toEqual(["users", "session"]);
        expect(await retries.prisma.authSession.count({ where: { userId: s.actor.user.id } })).toBe(0);
        assertSafeEqual(await retryState(retries.prisma, s.source.parent.id), s.before, "Revoked actor's next attempt denies before protected reads/writes");
      } else if (change === "promote-assignee") {
        authorizedReads(attempts[1], s.before); expect(attempts[1].assigneeRole).toBe("ADMINISTRATOR"); await committed(s, response);
      } else {
        assertSafeError(response, 409, "STALE_WRITE"); authorizedReads(attempts[1], externalState);
        assertSafeEqual(await retryState(retries.prisma, s.source.parent.id), externalState, "Retry reads committed newer version/time, preserving the external winner only");
        expect(await retries.prisma.mutationReceipt.count({ where: { actorId: s.actor.user.id, clientMutationId: String(s.input.clientMutationId) } })).toBe(0);
      }
    });
  });

  const synthetic = (code: string) => new Prisma.PrismaClientKnownRequestError("Synthetic message-only 40001 classification probe", { code, clientVersion: Prisma.prismaVersion.client });
  it.each([
    { label: "synthetic ambiguous P2034", fault: synthetic("P2034"), code: "P2034", state: null },
    { label: "synthetic generic P2002", fault: synthetic("P2002"), code: "P2002", state: null },
    { label: "controlled PostgreSQL 23505 (not receipt-key recovery)", fault: "23505", code: "P2010", state: "23505" },
    { label: "controlled PostgreSQL 40P01 (not a naturally occurring deadlock)", fault: "40P01", code: "P2010", state: "40P01" },
    { label: "synthetic unexpected error with message-only 40001", fault: new Error("Synthetic message-only 40001"), code: null, state: null },
  ] as Array<{ label: string; fault: LateFault; code: string | null; state: string | null }>)("$label is not retried and staged writes roll back", async ({ fault, code, state }) => {
    const s = await scenario();
    await withLateActionFaults({ ...s.inject, faults: [fault] }, async (attempts) => {
      const response = await s.request(); assertSafeError(response, 500, "INTERNAL_ERROR"); expect(attempts.length).toBe(1); fresh(attempts);
      authorizedReads(attempts[0], s.before); expect(attempts[0].code).toBe(code); expect(attempts[0].sqlState).toBe(state); stagedAndRolledBack(attempts[0], s.before);
      assertSafeEqual(await retryState(retries.prisma, s.source.parent.id), s.before, "Nonserialization failure is atomic with no retry or receipt");
    });
  });
});
