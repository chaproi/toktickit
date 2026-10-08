import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ActionCreateFixtures } from "./action-create-test-fixtures.js";
import { MISSING_ID, assertSafeError } from "./action-read-test-fixtures.js";

const creates = new ActionCreateFixtures();
beforeAll(() => creates.initialize());
afterAll(() => creates.cleanup());

describe("API-04 initial assignee eligibility (partial AC-07; T-07)", () => {
  it.each(["inactive", "requester", "missing", "outside-database-ID-range"])("rejects %s with INVALID_ASSIGNEE and no domain writes", async (kind) => {
    const parent = await creates.parent();
    const assigneeId = kind === "inactive" ? creates.read.who("historical").user.id :
      kind === "requester" ? creates.read.who("requester").user.id :
      kind === "missing" ? MISSING_ID : Number.MAX_SAFE_INTEGER;
    // A positive safe numeric body ID passes syntax validation; absence/eligibility is a service check.
    // This is not an invented 32-bit body-validation cap, and must never leak a Prisma overflow error.
    const response = await creates.rejected(creates.path(parent.id), creates.input(parent, assigneeId));
    assertSafeError(response, 400, "INVALID_ASSIGNEE");
    expect(typeof response.body.error.fields.assigneeId).toBe("string");
    expect(Object.keys(response.body.error.fields)).toEqual(["assigneeId"]);
    expect(/email|isActive|role|passwordHash/u.test(JSON.stringify(response.body))).toBe(false);
  });
  // Concurrent demotion/deactivation, reassign eligibility and admin account guards remain later work.
});

import { ActionPatchFixtures } from "./action-patch-test-fixtures.js";

describe("API-05/06 initial eligibility (partial AC-07/09/10; T-07/09/10)", () => {
  const patches = new ActionPatchFixtures();
  beforeAll(() => patches.initialize());
  afterAll(() => patches.cleanup());

  it.each(["inactive", "requester", "missing", "outside-database-range"])("reassignment rejects %s without any writes", async (kind) => {
    const source = await patches.setup();
    const assigneeId = kind === "inactive" ? patches.read.who("historical").user.id : kind === "requester" ? patches.read.who("requester").user.id :
      kind === "missing" ? MISSING_ID : Number.MAX_SAFE_INTEGER;
    const response = await patches.rejected(patches.path(source, "edit"), patches.editInput(source, { assigneeId }));
    assertSafeError(response, 400, "INVALID_ASSIGNEE");
    expect(typeof response.body.error.fields.assigneeId).toBe("string");
  });

  it.each(["start", "complete"].flatMap((operation) => ["inactive", "requester"].map((ineligible) => ({ operation, ineligible }))) as Array<{ operation: "start" | "complete"; ineligible: string }>)(
    "$operation rejects an initially $ineligible assigned worker", async ({ operation, ineligible }) => {
      const worker = await patches.read.actor(`legacy-worker-${operation}-${ineligible}`, "IT_STAFF");
      const source = await patches.setup(operation === "complete" ? "IN_PROGRESS" : "PLANNED", { assigneeId: worker.user.id });
      // Explicit legacy/bypassed-guard state construction. No Admin guard implementation is claimed.
      await patches.prisma.user.update({ where: { id: worker.user.id }, data: ineligible === "inactive" ? { isActive: false } : { role: "REQUESTER" } });
      const response = await patches.rejected(patches.path(source, operation), patches.input(source, operation));
      assertSafeError(response, 400, "INVALID_ASSIGNEE"); // API contract: initial eligibility failure before a race.
      expect(typeof response.body.error.fields.assigneeId).toBe("string");
    },
  );
});

import { randomUUID } from "node:crypto";
import { ActionAdminGuardFixtures, type AdminGuardChange } from "./action-admin-guard-test-fixtures.js";

// Accepted D-11/D-12, FR-14/BR-25, partial AC-22/T-22. All cases
// below are sequential; they do not establish T-45 race/lock-order coverage.
describe("D-11 sequential Administrator assignment guards (partial AC-22; T-22)", () => {
  const guards = new ActionAdminGuardFixtures();
  beforeAll(() => guards.initialize());
  afterAll(() => guards.cleanup());

  const ineligibleChanges: Array<{ label: string; change: AdminGuardChange }> = [
    { label: "deactivation", change: { isActive: false } },
    { label: "demotion", change: { role: "REQUESTER" } },
    { label: "combined demotion/deactivation", change: { role: "REQUESTER", isActive: false } },
  ];
  it.each((["PLANNED", "IN_PROGRESS"] as const).flatMap((status) =>
    ineligibleChanges.map(({ label, change }) => ({ status, label, change })),
  ))("$status assignment blocks $label independently of Ticket ownership", async ({ status, change }) => {
    const target = await guards.target("blocked-staff");
    await guards.assigned(target, status);
    await guards.noNonterminalOwnership(target);
    await guards.rejected(target, change, "USER_HAS_OPEN_ACTIONS");
  });

  it.each([
    { status: "PLANNED" as const, change: { isActive: false } },
    { status: "IN_PROGRESS" as const, change: { role: "REQUESTER" as const } },
  ])("$status assignment also blocks an otherwise valid Administrator eligibility loss", async ({ status, change }) => {
    const target = await guards.target("blocked-admin", "ADMINISTRATOR");
    // The separate live operator remains an active Administrator. No unrelated
    // accounts are changed to manufacture a last-admin or precedence condition.
    expect(await guards.prisma.user.count({ where: { role: "ADMINISTRATOR", isActive: true } })).toBeGreaterThanOrEqual(2);
    await guards.assigned(target, status);
    await guards.noNonterminalOwnership(target);
    await guards.rejected(target, change, "USER_HAS_OPEN_ACTIONS");
  });

  it("one unfinished assignment among terminal assignments still blocks eligibility loss", async () => {
    const target = await guards.target("mixed-assignments");
    await guards.assigned(target, "COMPLETED");
    await guards.assigned(target, "CANCELLED");
    await guards.assigned(target, "IN_PROGRESS");
    const terminalOwner = await guards.read.ticket(guards.read.who("requester").user.id, "CLOSED");
    await guards.prisma.ticket.update({ where: { id: terminalOwner.id }, data: { ownerId: target.user.id } });
    await guards.noNonterminalOwnership(target);
    expect(await guards.prisma.action.count({ where: { assigneeId: target.user.id } })).toBe(3);
    await guards.rejected(target, { role: "REQUESTER", isActive: false }, "USER_HAS_OPEN_ACTIONS");
  });

  it.each(ineligibleChanges.slice(0, 2))("nonterminal Ticket ownership retains conflict priority for $label", async ({ change }) => {
    const target = await guards.target("owner-priority");
    const source = await guards.assigned(target, "PLANNED");
    await guards.prisma.ticket.update({ where: { id: source.parent.id }, data: { ownerId: target.user.id } });
    const response = await guards.rejected(target, change, "USER_HAS_NON_TERMINAL_TICKETS");
    expect(JSON.stringify(response.body).includes(source.parent.ticketNumber)).toBe(false);
    expect(JSON.stringify(response.body).includes(source.parent.summary)).toBe(false);
    expect(Object.keys(response.body.error)).not.toContain("actions");
  });

  it.each(ineligibleChanges.slice(0, 2))("only COMPLETED/CANCELLED assignments permit $label and retain historical FKs", async ({ change }) => {
    const target = await guards.target("terminal-only");
    await guards.assigned(target, "COMPLETED");
    await guards.assigned(target, "CANCELLED");
    await guards.noNonterminalOwnership(target);
    expect(await guards.prisma.action.count({ where: { assigneeId: target.user.id, status: { in: ["PLANNED", "IN_PROGRESS"] } } })).toBe(0);
    await guards.successful(target, change);
  });

  it.each(ineligibleChanges.slice(0, 2))("creator/performer history without unfinished assignment permits $label", async ({ change }) => {
    const target = await guards.target("historical-actor");
    const parent = await guards.patches.creates.parent();
    const assignee = guards.read.who("assignee");
    const created = await guards.patches.creates.create(parent,
      guards.patches.creates.input(parent, assignee.user.id), target);
    const started = await guards.patches.successful({ action: created.action, parent: created.parent }, "start");
    const completed = await guards.patches.successful(started, "complete", guards.patches.input(started, "complete"), target);
    expect(completed.action.createdById).toBe(target.user.id);
    expect(completed.action.performedById).toBe(target.user.id);
    expect(completed.action.assigneeId).not.toBe(target.user.id);
    const unfinished = await guards.patches.creates.parent();
    const extra = await guards.patches.creates.create(unfinished,
      guards.patches.creates.input(unfinished, assignee.user.id), target);
    expect(extra.action.createdById).toBe(target.user.id);
    expect(extra.action.status).toBe("PLANNED");
    expect(await guards.prisma.action.count({ where: { assigneeId: target.user.id } })).toBe(0);
    await guards.noNonterminalOwnership(target);
    await guards.successful(target, change);
  });

  it.each([
    { from: "IT_STAFF" as const, to: "ADMINISTRATOR" as const, status: "PLANNED" as const },
    { from: "ADMINISTRATOR" as const, to: "IT_STAFF" as const, status: "IN_PROGRESS" as const },
  ])("active $from to $to remains eligible with $status assignments and revokes every target session", async ({ from, to, status }) => {
    const target = await guards.target("eligible-swap", from);
    await guards.assigned(target, status);
    const oldAdministrators = await guards.prisma.user.count({ where: { role: "ADMINISTRATOR", isActive: true } });
    expect(oldAdministrators).toBeGreaterThanOrEqual(from === "ADMINISTRATOR" ? 2 : 1);
    await guards.successful(target, { role: to });
    expect(await guards.prisma.user.count({ where: { role: "ADMINISTRATOR", isActive: true } }))
      .toBe(oldAdministrators + (to === "ADMINISTRATOR" ? 1 : -1));
  });

  it("ordinary name/email edits remain permitted with unfinished assignments and preserve target sessions", async () => {
    const target = await guards.target("ordinary-profile");
    await guards.assigned(target, "PLANNED");
    await guards.successful(target, { name: "Edited assigned worker", email: `issue44-profile-${randomUUID()}@example.test` });
  });

  it.each([
    { label: "deactivation", change: { isActive: false } },
    { label: "Staff role change", change: { role: "IT_STAFF" as const } },
    { label: "Requester role change", change: { role: "REQUESTER" as const } },
  ])("self $label retains SELF_ADMIN_CHANGE_FORBIDDEN with unfinished assignments", async ({ change }) => {
    const target = await guards.target("self-protected", "ADMINISTRATOR");
    await guards.assigned(target, "PLANNED");
    const oldAdministrators = await guards.prisma.user.count({ where: { role: "ADMINISTRATOR", isActive: true } });
    await guards.rejected(target, change, "SELF_ADMIN_CHANGE_FORBIDDEN", target);
    expect(await guards.prisma.user.count({ where: { role: "ADMINISTRATOR", isActive: true } })).toBe(oldAdministrators);
    // An authenticated distinct Administrator necessarily means at least two
    // active Administrators when the target is one. Last-admin removal is not
    // reachable here without self protection or a race: no invented precedence.
  });

  it("stale User tokens retain STALE_WRITE before the assignment guard", async () => {
    const target = await guards.target("stale-token");
    await guards.assigned(target, "IN_PROGRESS");
    const user = await guards.prisma.user.findUniqueOrThrow({ where: { id: target.user.id } });
    await guards.rejected(target, { role: "REQUESTER", isActive: false }, "STALE_WRITE", guards.operator,
      new Date(user.updatedAt.getTime() - 1).toISOString());
  });

  it.each(["complete", "cancel"] as const)("real API-06 %s releases the final unfinished assignment and permits deactivation", async (operation) => {
    const target = await guards.target(`release-${operation}`);
    const source = await guards.assigned(target, operation === "complete" ? "IN_PROGRESS" : "PLANNED");
    await guards.noNonterminalOwnership(target);
    expect(guards.operator.user.id).not.toBe(target.user.id);
    expect(await guards.prisma.action.count({ where: { assigneeId: target.user.id, status: { in: ["PLANNED", "IN_PROGRESS"] } } })).toBe(1);
    const released = await guards.release(source, operation);
    expect(released.action.assigneeId).toBe(target.user.id);
    expect(released.action.status).toBe(operation === "complete" ? "COMPLETED" : "CANCELLED");
    expect(released.action.performedById).toBe(operation === "complete" ? guards.operator.user.id : null);
    expect(await guards.prisma.action.count({ where: { assigneeId: target.user.id, status: { in: ["PLANNED", "IN_PROGRESS"] } } })).toBe(0);
    await guards.successful(target, { isActive: false });
  });
});
