import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { ActionStatus } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { configureTestDatabaseEnvironment } from "../../src/testing/test-database.js";
import { APPROVED_ORIGIN, cookieValue } from "../lab-03/auth-test-helpers.js";
import { ActionReadFixtures, assertSafeEqual, assertSafeError } from "./action-read-test-fixtures.js";

// Partial AC-18/T-18 and AC-17/T-17; AC-19/T-19 positive gate coverage.
// No cascade, D-20, complete matrix, migration or race acceptance is claimed.
const fixtures = new ActionReadFixtures();
type Actor = ReturnType<ActionReadFixtures["who"]>;
const roles = ["IT_STAFF", "ADMINISTRATOR"] as const;
const targets = ["RESOLVED", "CLOSED"] as const;
const unfinished = ["PLANNED", "IN_PROGRESS"] as const;
const cohorts = ["zero", "all-cancelled", "completed-follow-up"] as const;
type Target = typeof targets[number];
type Cohort = typeof cohorts[number];
const followUpNote = "Arrange the optional follow-up visit; completed work remains complete.";

beforeAll(async () => {
  const identity = configureTestDatabaseEnvironment();
  const operational = process.env.TOKTICKIT_DEVELOPMENT_DATABASE_URL;
  expect(Boolean(operational) &&
    decodeURIComponent(new URL(operational!).pathname.slice(1)) !== identity.databaseName,
  "Dedicated test database differs from operational; connection values withheld").toBe(true);
  const [live] = await fixtures.prisma.$queryRaw<Array<{ database: string; schema: string }>>`
    SELECT current_database() AS database, current_schema() AS schema`;
  expect(live?.database === identity.databaseName && live?.schema === identity.schema,
    "Live connection matches the actual repository isolation guard; values withheld").toBe(true);

  // Reuse only the existing owned ledger/auth/cleanup, not its larger read cohorts.
  for (const [label, role] of [
    ["requester", "REQUESTER"], ["coordinator", "IT_STAFF"],
    ["creator", "IT_STAFF"], ["assignee", "IT_STAFF"],
    ["completer", "ADMINISTRATOR"], ["IT_STAFF", "IT_STAFF"],
    ["ADMINISTRATOR", "ADMINISTRATOR"],
  ] as const) await fixtures.actor(label, role);
  fixtures.referenceIds.categoryId = (await fixtures.prisma.category.create({
    data: { name: `Workflow46 category ${randomUUID()}` },
  })).id;
  fixtures.referenceIds.relatedSystemId = (await fixtures.prisma.relatedSystem.create({
    data: { name: `Workflow46 system ${randomUUID()}` },
  })).id;
});

afterAll(async () => {
  const ticketIds = [...fixtures.ticketIds];
  const userIds = [...fixtures.userIds];
  const actionScope = { ticketId: { in: ticketIds } };
  try {
    await fixtures.cleanup(); // Existing Lab 4 receipt/history/Action FK-safe order.
    // Explicitly verify every owned dependent type, not only parent/user absence.
    const counts = await Promise.all([
      fixtures.prisma.ticket.count({ where: { id: { in: ticketIds } } }),
      fixtures.prisma.action.count({ where: actionScope }),
      fixtures.prisma.actionHistory.count({ where: { action: actionScope } }),
      fixtures.prisma.ticketStatusHistory.count({ where: actionScope }),
      fixtures.prisma.mutationReceipt.count({ where: actionScope }),
      fixtures.prisma.publicComment.count({ where: actionScope }),
      fixtures.prisma.internalNote.count({ where: actionScope }),
      fixtures.prisma.attachment.count({ where: actionScope }),
      fixtures.prisma.user.count({ where: { id: { in: userIds } } }),
      fixtures.prisma.authSession.count({ where: { userId: { in: userIds } } }),
      fixtures.prisma.category.count({ where: { id: fixtures.referenceIds.categoryId ?? -1 } }),
      fixtures.prisma.relatedSystem.count({ where: { id: fixtures.referenceIds.relatedSystemId ?? -1 } }),
    ]);
    expect(counts).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    console.info("Workflow46 cleanup verified: zero owned domain/reference/session records; no fault resources created.");
  } finally {
    // Also disconnect when setup, assertions, cleanup or verification fails.
    await fixtures.prisma.$disconnect();
  }
});

function mutation(method: "post" | "patch", path: string, actor: Actor, input: object) {
  const csrf = cookieValue(actor.cookie.split("; "), "toktickit_csrf");
  expect(typeof csrf, "Real login supplies the inherited CSRF cookie").toBe("string");
  return request(app)[method](path)
    .set("Origin", APPROVED_ORIGIN)
    .set("Cookie", actor.cookie)
    .set("X-CSRF-Token", csrf!)
    .send(input);
}

async function actionFixture(ticketId: number, status: ActionStatus, withFollowUp = false) {
  const creator = fixtures.who("creator");
  const assignee = fixtures.who("assignee");
  const parent = await fixtures.prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
  const created = await mutation("post", `/api/tickets/${ticketId}/actions`, creator, {
    description: "Workflow gate fixture: literal <script>text</script> diagnostic action",
    result: null, attachmentNotes: "Fixture text only; no binary relationship.",
    assigneeId: assignee.user.id, followUpRequired: withFollowUp,
    followUpNote: withFollowUp ? followUpNote : null,
    expectedTicketUpdatedAt: parent.updatedAt.toISOString(), clientMutationId: randomUUID(),
  });
  expect(created.status, "Existing Action create API succeeds during fixture setup").toBe(201);
  const actionId = created.body.action.id as number;

  async function advance(targetStatus: "IN_PROGRESS" | "COMPLETED" | "CANCELLED", actor: Actor) {
    const [action, currentParent] = await Promise.all([
      fixtures.prisma.action.findUniqueOrThrow({ where: { id: actionId } }),
      fixtures.prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } }),
    ]);
    const response = await mutation("patch", `/api/tickets/${ticketId}/actions/${actionId}/status`, actor, {
      targetStatus, expectedVersion: action.version,
      expectedTicketUpdatedAt: currentParent.updatedAt.toISOString(), clientMutationId: randomUUID(),
      ...(targetStatus === "COMPLETED" ? { confirm: true, result: "Completed diagnostic work; informative follow-up may remain." } : {}),
      ...(targetStatus === "CANCELLED" ? { confirm: true, reason: "Diagnostic task cancelled by its worker." } : {}),
    });
    expect(response.status, "Existing Action lifecycle API succeeds during fixture setup").toBe(200);
  }

  if (status === "IN_PROGRESS" || status === "COMPLETED") await advance("IN_PROGRESS", assignee);
  if (status === "COMPLETED") await advance("COMPLETED", fixtures.who("completer"));
  if (status === "CANCELLED") await advance("CANCELLED", creator);
  return fixtures.prisma.action.findUniqueOrThrow({ where: { id: actionId } });
}

async function parentFixture(target: Target, buildChildren: (ticketId: number) => Promise<void>) {
  const parent = await fixtures.ticket(fixtures.who("requester").user.id, "OPEN");
  await fixtures.prisma.ticketStatusHistory.create({ data: {
    ticketId: parent.id, actorId: fixtures.who("coordinator").user.id,
    fromStatus: "NEW", toStatus: "OPEN", reason: "Retained original handoff reason",
  } });
  await buildChildren(parent.id);
  if (target === "CLOSED") {
    // Directly constructed RESOLVED predecessor. In blocked cases the unfinished
    // children are defensive inconsistent-parent fixtures, NOT proof that a real
    // workflow legitimately resolved a Ticket with unfinished work.
    await fixtures.prisma.$transaction([
      fixtures.prisma.ticket.update({ where: { id: parent.id }, data: { currentStatus: "RESOLVED" } }),
      fixtures.prisma.ticketStatusHistory.create({ data: {
        ticketId: parent.id, actorId: fixtures.who("coordinator").user.id,
        fromStatus: "OPEN", toStatus: "RESOLVED", reason: "Constructed predecessor for close coverage",
      } }),
    ]);
  }
  return parent.id;
}

async function state(ticketId: number) {
  const [ticket, actions, ticketHistory, actionHistory, receipts] = await Promise.all([
    fixtures.prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } }),
    fixtures.prisma.action.findMany({ where: { ticketId }, orderBy: { id: "asc" } }),
    fixtures.prisma.ticketStatusHistory.findMany({ where: { ticketId }, orderBy: { id: "asc" } }),
    fixtures.prisma.actionHistory.findMany({ where: { action: { ticketId } }, orderBy: { id: "asc" } }),
    fixtures.prisma.mutationReceipt.findMany({ where: { ticketId }, orderBy: { id: "asc" } }),
  ]);
  return { ticket, actions, ticketHistory, actionHistory, receipts };
}

async function otherwiseValid(ticketId: number, role: typeof roles[number], target: Target) {
  const actor = fixtures.who(role);
  const [parent, currentActor] = await Promise.all([
    fixtures.prisma.ticket.findUniqueOrThrow({ where: { id: ticketId }, include: { owner: true } }),
    fixtures.prisma.user.findUniqueOrThrow({ where: { id: actor.user.id } }),
  ]);
  expect(parent.currentStatus).toBe(target === "RESOLVED" ? "OPEN" : "RESOLVED");
  expect(currentActor.role).toBe(role);
  expect(currentActor.isActive && !currentActor.mustChangePassword).toBe(true);
  expect(parent.owner?.isActive && parent.owner.role === "IT_STAFF").toBe(true);
  expect(actor.user.id).not.toBe(parent.ownerId);
  return {
    actor,
    // Only the inherited Ticket status fields. Action tokens/UUIDs above are
    // confined to already implemented Action APIs used for fixture preparation.
    input: { targetStatus: target, expectedUpdatedAt: parent.updatedAt.toISOString(), confirm: true, reason: null },
  };
}

describe("AC-18/T-18: unfinished Actions block otherwise-valid resolve AND close", () => {
  const cases = roles.flatMap((role) => targets.flatMap((target) => unfinished.map((child) => ({ role, target, child }))));

  it.each(cases)("$role → $target blocked by $child; exact rejection preservation", async ({ role, target, child }) => {
    const ticketId = await parentFixture(target, async (id) => {
      await actionFixture(id, "COMPLETED", true);
      await actionFixture(id, "CANCELLED");
      await actionFixture(id, child);
    });
    const { actor, input } = await otherwiseValid(ticketId, role, target);
    const before = await state(ticketId);
    expect(before.actions.map((action) => action.status).sort()).toEqual(["COMPLETED", "CANCELLED", child].sort());
    expect(before.actionHistory.length).toBeGreaterThan(0);
    expect(before.receipts.length).toBeGreaterThan(0);
    expect(before.actions.find((action) => action.status === "COMPLETED")?.performedById)
      .toBe(fixtures.who("completer").user.id);
    const digest = await fixtures.domainDigest();
    const response = await mutation("patch", `/api/staff/tickets/${ticketId}/status`, actor, input);
    const after = await state(ticketId);

    // Soft, redacted comparisons ensure missing-gate RED observes the actual
    // persisted effects BEFORE the HTTP check; no private receipt/User values
    // are attached to assertion diffs. AuthSession bookkeeping is excluded only
    // by the established domainDigest contract, never domain changes.
    for (const key of ["ticket", "actions", "ticketHistory", "actionHistory", "receipts"] as const) {
      expect.soft(isDeepStrictEqual(after[key], before[key]), `Rejected transition preserves exact ${key}; values redacted`).toBe(true);
    }
    const terminal = (rows: typeof before.actions) => rows.filter((action) => ["COMPLETED", "CANCELLED"].includes(action.status));
    expect.soft(isDeepStrictEqual(terminal(after.actions), terminal(before.actions)),
      "Terminal siblings retain every field and historical identity; values redacted").toBe(true);
    expect.soft(await fixtures.domainDigest() === digest,
      "No owned domain writes/time/version/history/receipt changes; session bookkeeping excluded; digest withheld").toBe(true);
    assertSafeError(response, 409, "ACTIONS_OUTSTANDING");
  });
});

describe("AC-19/T-19: zero, cancelled and completed follow-up cohorts permit valid transitions", () => {
  const cases = roles.flatMap((role) => targets.flatMap((target) => cohorts.map((cohort) => ({ role, target, cohort }))));

  it.each(cases)("$role → $target permits $cohort without fabricated completion/workCycle", async ({ role, target, cohort }) => {
    const ticketId = await parentFixture(target, async (id) => {
      if (cohort === "all-cancelled") {
        await actionFixture(id, "CANCELLED");
        await actionFixture(id, "CANCELLED");
      } else if (cohort === "completed-follow-up") await actionFixture(id, "COMPLETED", true);
    });
    const { actor, input } = await otherwiseValid(ticketId, role, target);
    const before = await state(ticketId);
    const expectedStates: Record<Cohort, ActionStatus[]> = {
      zero: [], "all-cancelled": ["CANCELLED", "CANCELLED"], "completed-follow-up": ["COMPLETED"],
    };
    expect(before.actions.map((action) => action.status)).toEqual(expectedStates[cohort]);
    if (cohort === "completed-follow-up") assertSafeEqual({
      required: before.actions[0].followUpRequired, note: before.actions[0].followUpNote,
    }, { required: true, note: followUpNote }, "Completed fixture retains informative follow-up");
    const response = await mutation("patch", `/api/staff/tickets/${ticketId}/status`, actor, input);
    expect(response.status).toBe(200);
    const after = await state(ticketId);
    expect(after.ticket.updatedAt.getTime()).toBeGreaterThan(before.ticket.updatedAt.getTime());
    assertSafeEqual(after.ticket, { ...before.ticket, currentStatus: target, updatedAt: after.ticket.updatedAt },
      "Only the permitted Ticket transition and timestamp change");
    assertSafeEqual(response.body, { ticket: {
      id: ticketId,
      owner: { id: fixtures.who("coordinator").user.id, name: fixtures.who("coordinator").user.name, role: "IT_STAFF" },
      requestedPriority: before.ticket.requestedPriority, itPriority: before.ticket.itPriority,
      currentStatus: target, requesterResolutionIndicatedAt: before.ticket.requesterResolutionIndicatedAt?.toISOString() ?? null,
      updatedAt: after.ticket.updatedAt.toISOString(),
    } }, "Exact inherited authoritative Ticket mutation DTO, with no extra fields");
    expect(after.ticketHistory).toHaveLength(before.ticketHistory.length + 1);
    assertSafeEqual(after.ticketHistory.slice(0, -1), before.ticketHistory, "All earlier Ticket history stays unchanged");
    const event = after.ticketHistory.at(-1)!;
    expect(event.id).toBeGreaterThan(before.ticketHistory.at(-1)!.id);
    expect(event.createdAt.getTime()).toBeGreaterThanOrEqual(before.ticketHistory.at(-1)!.createdAt.getTime());
    assertSafeEqual(event, {
      id: event.id, ticketId, actorId: actor.user.id, fromStatus: before.ticket.currentStatus,
      toStatus: target, reason: null, createdAt: event.createdAt,
    }, "Exactly one correctly attributed status event with inherited null reason");
    for (const key of ["actions", "actionHistory", "receipts"] as const) {
      assertSafeEqual(after[key], before[key], `Successful transition preserves exact ${key}, including old notes/attribution`);
    }
  });
});

// Cancellation contribution: partial AC-21/T-21 and AC-45/T-55. The earlier
// gate-only batch and helpers above are retained byte-for-byte as history.
import { withLateCascadeFailure } from "./ticket-cascade-fault-test-helper.js";

type CascadeAction = Awaited<ReturnType<typeof state>>["actions"][number];
type CascadeCohort = "mixed-owned" | "mixed-unassigned" | "zero" | "terminal-only";
const cancellationReason = "Cancel this Ticket: literal <script>text</script> retained for audit.";
const cancellationInputReason = `  ${cancellationReason}  `;
const cascadeCohorts: CascadeCohort[] = ["mixed-owned", "mixed-unassigned", "zero", "terminal-only"];

// Independent full scalar-ID expectation; never import the production projector.
function cascadeSnapshot(action: CascadeAction) {
  return {
    id: action.id, ticketId: action.ticketId, createdById: action.createdById,
    assigneeId: action.assigneeId, performedById: action.performedById,
    status: action.status, description: action.description, result: action.result,
    followUpRequired: action.followUpRequired, followUpNote: action.followUpNote,
    attachmentNotes: action.attachmentNotes, actionAt: action.actionAt.toISOString(),
    createdAt: action.createdAt.toISOString(), updatedAt: action.updatedAt.toISOString(),
    completedAt: action.completedAt?.toISOString() ?? null,
    cancelledAt: action.cancelledAt?.toISOString() ?? null,
    cancellationReason: action.cancellationReason, version: action.version,
  };
}

async function cascadeParent(cohort: CascadeCohort) {
  const parent = await fixtures.ticket(fixtures.who("requester").user.id, "OPEN");
  if (cohort === "mixed-unassigned") {
    // A genuinely nullable coordinator, not a fabricated cancellation owner.
    await fixtures.prisma.ticket.update({ where: { id: parent.id }, data: { ownerId: null } });
  }
  await fixtures.prisma.ticketStatusHistory.create({ data: {
    ticketId: parent.id, actorId: fixtures.who("coordinator").user.id,
    fromStatus: "NEW", toStatus: "OPEN", reason: "Earlier retained Ticket handoff",
  } });
  if (cohort !== "zero") {
    await actionFixture(parent.id, "COMPLETED", true);
    await actionFixture(parent.id, "CANCELLED", true);
  }
  if (cohort === "mixed-owned" || cohort === "mixed-unassigned") {
    for (const status of ["PLANNED", "IN_PROGRESS"] as const) {
      const child = await actionFixture(parent.id, status, true);
      const ticket = await fixtures.prisma.ticket.findUniqueOrThrow({ where: { id: parent.id } });
      const response = await mutation("patch", `/api/tickets/${parent.id}/actions/${child.id}`,
        fixtures.who("creator"), {
          result: `Retained ${status} draft result: <script>literal</script>`,
          expectedVersion: child.version, expectedTicketUpdatedAt: ticket.updatedAt.toISOString(),
          clientMutationId: randomUUID(),
        });
      expect(response.status, "Real Action edit prepares retained draft content").toBe(200);
    }
  }
  return parent.id;
}

async function cancellationCommand(ticketId: number, role: typeof roles[number]) {
  const actor = fixtures.who(role);
  const parent = await fixtures.prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
  expect(parent.currentStatus).toBe("OPEN");
  const currentActor = await fixtures.prisma.user.findUniqueOrThrow({ where: { id: actor.user.id } });
  expect(currentActor.role).toBe(role);
  expect(currentActor.isActive && !currentActor.mustChangePassword).toBe(true);
  expect(actor.user.id).not.toBe(fixtures.who("creator").user.id);
  expect(actor.user.id).not.toBe(fixtures.who("assignee").user.id);
  expect(actor.user.id).not.toBe(fixtures.who("completer").user.id);
  return { actor, input: {
    targetStatus: "CANCELLED", expectedUpdatedAt: parent.updatedAt.toISOString(),
    confirm: true, reason: cancellationInputReason,
  } };
}

describe("AC-21/T-21, AC-45/T-55: atomic cancellation/source-linked history", () => {
  const cases = roles.flatMap((role) => cascadeCohorts.map((cohort) => ({ role, cohort })));

  it.each(cases)("$role cancels $cohort; only unfinished children cascade", async ({ role, cohort }) => {
    const ticketId = await cascadeParent(cohort);
    const { actor, input } = await cancellationCommand(ticketId, role);
    const before = await state(ticketId);
    const affected = before.actions.filter((action) => unfinished.includes(action.status as typeof unfinished[number]));
    expect(affected).toHaveLength(cohort.startsWith("mixed") ? 2 : 0);
    expect(before.ticket.ownerId === null).toBe(cohort === "mixed-unassigned");
    if (affected.length) {
      expect(affected.map((action) => action.status).sort()).toEqual(["IN_PROGRESS", "PLANNED"]);
      for (const action of affected) {
        expect(action.result).toContain("draft result");
        expect(action.followUpRequired).toBe(true);
        expect(action.followUpNote).toBe(followUpNote);
      }
    }
    const response = await mutation("patch", `/api/staff/tickets/${ticketId}/status`, actor, input);
    expect(response.status).toBe(200);
    const after = await state(ticketId);
    expect(after.ticket.updatedAt.getTime()).toBeGreaterThan(before.ticket.updatedAt.getTime());
    assertSafeEqual(after.ticket, {
      ...before.ticket, currentStatus: "CANCELLED", updatedAt: after.ticket.updatedAt,
    }, "Cancellation preserves every other parent field, including nullable ownership");
    assertSafeEqual(response.body, { ticket: {
      id: ticketId,
      owner: before.ticket.ownerId === null ? null : {
        id: fixtures.who("coordinator").user.id, name: fixtures.who("coordinator").user.name, role: "IT_STAFF",
      },
      requestedPriority: before.ticket.requestedPriority, itPriority: before.ticket.itPriority,
      currentStatus: "CANCELLED",
      requesterResolutionIndicatedAt: before.ticket.requesterResolutionIndicatedAt?.toISOString() ?? null,
      updatedAt: after.ticket.updatedAt.toISOString(),
    } }, "Exact inherited safe cancellation DTO");
    expect(after.ticketHistory).toHaveLength(before.ticketHistory.length + 1);
    assertSafeEqual(after.ticketHistory.slice(0, -1), before.ticketHistory, "Earlier Ticket events preserved");
    const source = after.ticketHistory.at(-1)!;
    expect(source.createdAt.getTime()).toBeGreaterThanOrEqual(before.ticketHistory.at(-1)!.createdAt.getTime());
    assertSafeEqual(source, {
      id: source.id, ticketId, actorId: actor.user.id,
      fromStatus: "OPEN", toStatus: "CANCELLED", reason: cancellationReason, createdAt: source.createdAt,
    }, "One real, correctly attributed same-Ticket source event with trimmed reason");

    // Reach terminal/earlier-audit/receipt preservation even while cascade is RED.
    const terminalIds = before.actions.filter((action) => !affected.some((row) => row.id === action.id)).map((row) => row.id);
    assertSafeEqual(after.actions.filter((action) => terminalIds.includes(action.id)),
      before.actions.filter((action) => terminalIds.includes(action.id)), "Terminal siblings retain attribution and every field");
    assertSafeEqual(after.actionHistory.filter((event) => terminalIds.includes(event.actionId)),
      before.actionHistory.filter((event) => terminalIds.includes(event.actionId)), "Terminal sibling history unchanged");
    const oldIds = new Set(before.actionHistory.map((event) => event.id));
    assertSafeEqual(after.actionHistory.filter((event) => oldIds.has(event.id)), before.actionHistory, "Every earlier Action event unchanged");
    assertSafeEqual(after.receipts, before.receipts, "Existing receipts untouched; no invented Ticket mutation receipt");
    expect(after.actions.map((action) => action.id)).toEqual(before.actions.map((action) => action.id));
    expect.soft(after.actionHistory.length, "Exactly one new cascade event per unfinished child; none for zero/terminal-only cohorts")
      .toBe(before.actionHistory.length + affected.length);
    for (const previous of affected) {
      const current = after.actions.find((action) => action.id === previous.id)!;
      expect(current.status).toBe("CANCELLED");
      expect(current.version).toBe(previous.version + 1);
      expect(current.updatedAt.getTime()).toBeGreaterThan(previous.updatedAt.getTime());
      expect(current.cancelledAt?.getTime()).toBe(current.updatedAt.getTime());
      const expected = {
        ...previous, status: "CANCELLED" as const, version: previous.version + 1,
        updatedAt: current.updatedAt, cancelledAt: current.updatedAt,
        cancellationReason, performedById: null, completedAt: null,
      };
      assertSafeEqual(current, expected, "Only cancellation lifecycle fields/version/time change; all content and identities retained");
      const events = after.actionHistory.filter((event) => event.actionId === previous.id && !oldIds.has(event.id));
      expect(events).toHaveLength(1);
      const event = events[0];
      assertSafeEqual(event, {
        id: event.id, actionId: previous.id, actorId: actor.user.id,
        event: "ACTION_CANCELLED_BY_TICKET", actionVersion: previous.version + 1,
        createdAt: current.updatedAt, sourceTicketStatusHistoryId: source.id,
        before: cascadeSnapshot(previous), after: cascadeSnapshot(expected),
      }, "Exact independent full before/after snapshots and real same-Ticket source link");
    }
  });

  it.each(roles)("%s stale cancellation preserves the entire mixed cohort", async (role) => {
    const ticketId = await cascadeParent("mixed-owned");
    const { actor, input } = await cancellationCommand(ticketId, role);
    const before = await state(ticketId);
    const digest = await fixtures.domainDigest();
    const response = await mutation("patch", `/api/staff/tickets/${ticketId}/status`, actor, {
      ...input, expectedUpdatedAt: new Date(before.ticket.updatedAt.getTime() - 1).toISOString(),
    });
    assertSafeEqual(await state(ticketId), before, "Stale cancellation preserves parent/children/both histories/receipts exactly");
    expect(await fixtures.domainDigest() === digest, "All owned domain data preserved; digest withheld").toBe(true);
    assertSafeError(response, 409, "STALE_WRITE");
  });

  it.each(roles)("%s later cascade failure rolls back earlier real writes", async (role) => {
    const ticketId = await cascadeParent("mixed-owned");
    const { actor, input } = await cancellationCommand(ticketId, role);
    const before = await state(ticketId);
    const affected = before.actions.filter((action) => ["PLANNED", "IN_PROGRESS"].includes(action.status));
    expect(affected).toHaveLength(2);
    const digest = await fixtures.domainDigest();
    await withLateCascadeFailure(fixtures.prisma, ticketId, actor.user.id, affected, async (observe) => {
      // Await the real HTTP transaction before independent pooled observations.
      const response = await mutation("patch", `/api/staff/tickets/${ticketId}/status`, actor, input);
      const observation = await observe();
      expect.soft(observation.entries, "Late injection must reach the second owned cascade event").toBe(2);
      expect.soft(observation.earlierWritesObserved,
        "Rollback-surviving proof of an earlier changed Action/full history/real same-Ticket source").toBe(true);
      const after = await state(ticketId);
      for (const key of ["ticket", "actions", "ticketHistory", "actionHistory", "receipts"] as const) {
        expect.soft(isDeepStrictEqual(after[key], before[key]),
          `Late failure rolls back exact ${key}; values redacted`).toBe(true);
      }
      expect.soft(await fixtures.domainDigest() === digest, "All staged domain writes rolled back; digest withheld").toBe(true);
      assertSafeError(response, 500, "INTERNAL_ERROR");
    });
  });
});

// D-20: partial AC-43/T-53; conflict cases also contribute AC-18/T-18.
// Existing validation semantics, not a new text/Unicode validation policy.
const statusReasonCases = [
  { label: "omitted", supplied: false, value: undefined, expected: null },
  { label: "explicit null", supplied: true, value: null, expected: null },
  { label: "empty string", supplied: true, value: "", expected: "" },
  { label: "whitespace-only", supplied: true, value: " \t\r\n ", expected: "" },
  { label: "one character", supplied: true, value: "A", expected: "A" },
  { label: "four characters", supplied: true, value: "four", expected: "four" },
  {
    label: "padded literal text", supplied: true,
    value: "  <script>alert('reason')</script> & retained literally  ",
    expected: "<script>alert('reason')</script> & retained literally",
  },
  { label: "500 ASCII characters", supplied: true, value: "R".repeat(500), expected: "R".repeat(500) },
] as const;

async function reasonParent(withUnfinished = false) {
  const parent = await fixtures.ticket(fixtures.who("requester").user.id, "OPEN");
  // A legitimate historical null must stay null; no retrospective backfill.
  await fixtures.prisma.ticketStatusHistory.create({ data: {
    ticketId: parent.id, actorId: fixtures.who("coordinator").user.id,
    fromStatus: "NEW", toStatus: "OPEN", reason: null,
  } });
  // Non-vacuous terminal/content/attribution/history/receipt preservation.
  await actionFixture(parent.id, "COMPLETED", true);
  await actionFixture(parent.id, "CANCELLED", true);
  if (withUnfinished) await actionFixture(parent.id, "IN_PROGRESS", true);
  return parent.id;
}

describe("D-20 AC-43/T-53: preserve validated non-cancellation reasons", () => {
  const cases = roles.flatMap((role) => statusReasonCases.map((reasonCase) => ({ role, ...reasonCase })));

  it.each(cases)("$role OPEN to RESOLVED preserves $label", async ({ role, supplied, value, expected }) => {
    const ticketId = await reasonParent();
    const { actor, input: defaults } = await otherwiseValid(ticketId, role, "RESOLVED");
    const { reason: _defaultReason, ...tokensAndTransition } = defaults;
    const input = { ...tokensAndTransition, ...(supplied ? { reason: value } : {}) };
    expect(Object.hasOwn(input, "reason"), "Omitted case genuinely excludes the property").toBe(supplied);
    const before = await state(ticketId);
    expect(before.ticketHistory.some((event) => event.reason === null)).toBe(true);
    expect(before.actions.every((action) => ["COMPLETED", "CANCELLED"].includes(action.status))).toBe(true);
    expect(before.receipts.length).toBeGreaterThan(0);

    const response = await mutation("patch", `/api/staff/tickets/${ticketId}/status`, actor, input);
    expect(response.status).toBe(200);
    const after = await state(ticketId);
    expect(after.ticket.updatedAt.getTime()).toBeGreaterThan(before.ticket.updatedAt.getTime());
    assertSafeEqual(after.ticket, {
      ...before.ticket, currentStatus: "RESOLVED", updatedAt: after.ticket.updatedAt,
    }, "Reason-bearing resolution changes only status and parent timestamp");
    assertSafeEqual(response.body, { ticket: {
      id: ticketId,
      owner: { id: fixtures.who("coordinator").user.id, name: fixtures.who("coordinator").user.name, role: "IT_STAFF" },
      requestedPriority: before.ticket.requestedPriority, itPriority: before.ticket.itPriority,
      currentStatus: "RESOLVED",
      requesterResolutionIndicatedAt: before.ticket.requesterResolutionIndicatedAt?.toISOString() ?? null,
      updatedAt: after.ticket.updatedAt.toISOString(),
    } }, "Reason preservation retains the exact inherited mutation DTO");
    expect(after.ticketHistory).toHaveLength(before.ticketHistory.length + 1);
    assertSafeEqual(after.ticketHistory.slice(0, -1), before.ticketHistory,
      "Every earlier event and historical null remains byte-for-byte unchanged");
    const event = after.ticketHistory.at(-1)!;
    expect(event.createdAt.getTime()).toBeGreaterThanOrEqual(before.ticketHistory.at(-1)!.createdAt.getTime());
    assertSafeEqual(event, {
      id: event.id, ticketId, actorId: actor.user.id, fromStatus: "OPEN", toStatus: "RESOLVED",
      createdAt: event.createdAt, reason: event.reason,
    }, "One correctly attributed event; its reason is independently asserted below");
    for (const key of ["actions", "actionHistory", "receipts"] as const) {
      assertSafeEqual(after[key], before[key], `Reason-bearing transition preserves exact ${key}`);
    }
    // Soft assertions deliberately reach both stored and projected reason checks
    // in RED, without accepting the service's current reason loss as correct.
    expect.soft(event.reason, "Stored reason equals the explicit D-20 expected value").toBe(expected);

    const detail = await request(app).get(`/api/staff/tickets/${ticketId}`).set("Cookie", actor.cookie);
    expect(detail.status).toBe(200);
    expect(detail.headers["content-type"]).toMatch(/application\/json/u);
    const history = detail.body.statusHistory as Array<Record<string, unknown>>;
    expect(Array.isArray(history)).toBe(true);
    expect(history).toHaveLength(after.ticketHistory.length);
    const projected = history.find((row) => row.id === event.id)!;
    expect(projected).toBeDefined();
    expect(Object.keys(projected).sort()).toEqual(["actor", "createdAt", "fromStatus", "id", "reason", "toStatus"]);
    assertSafeEqual(projected.actor, { id: actor.user.id, name: actor.user.name, role },
      "Inherited safe status-history actor projection");
    assertSafeEqual({ ...projected, reason: null }, {
      id: event.id, fromStatus: "OPEN", toStatus: "RESOLVED", reason: null,
      createdAt: event.createdAt.toISOString(), actor: { id: actor.user.id, name: actor.user.name, role },
    }, "Status-history projection retains only the inherited event fields");
    const oldIds = new Set(before.ticketHistory.map((row) => row.id));
    assertSafeEqual(history.filter((row) => oldIds.has(row.id as number)), before.ticketHistory.map((row) => ({
      id: row.id, fromStatus: row.fromStatus, toStatus: row.toStatus, reason: row.reason,
      createdAt: row.createdAt.toISOString(), actor: {
        id: fixtures.who("coordinator").user.id, name: fixtures.who("coordinator").user.name, role: "IT_STAFF",
      },
    })), "GET preserves the earlier null reason without invented backfill");
    expect.soft(projected.reason, "GET statusHistory exposes the exact literal D-20 reason").toBe(expected);
  });

  const invalidCases = roles.flatMap((role) => [
    { role, label: "wrong-type", reason: 37 },
    { role, label: "501 ASCII characters", reason: "R".repeat(501) },
  ]);
  it.each(invalidCases)("$role rejects $label reason without writes", async ({ role, reason }) => {
    const ticketId = await reasonParent();
    const { actor, input } = await otherwiseValid(ticketId, role, "RESOLVED");
    const before = await state(ticketId);
    const digest = await fixtures.domainDigest();
    const response = await mutation("patch", `/api/staff/tickets/${ticketId}/status`, actor, { ...input, reason });
    assertSafeError(response, 400, "VALIDATION_ERROR");
    expect(Object.keys(response.body.error.fields)).toEqual(["reason"]);
    expect(typeof response.body.error.fields.reason).toBe("string");
    expect(response.body.error.fields.reason.length).toBeGreaterThan(0);
    assertSafeEqual(await state(ticketId), before, "Invalid reason preserves parent/children/both histories/receipts exactly");
    expect(await fixtures.domainDigest() === digest, "Invalid reason has no owned domain writes; digest withheld").toBe(true);
  });

  const conflicts = roles.flatMap((role) =>
    (["stale", "unfinished"] as const).map((conflict) => ({ role, conflict })));
  it.each(conflicts)("$role rejects reason-bearing $conflict resolution without history", async ({ role, conflict }) => {
    const ticketId = await reasonParent(conflict === "unfinished");
    const { actor, input } = await otherwiseValid(ticketId, role, "RESOLVED");
    const before = await state(ticketId);
    const digest = await fixtures.domainDigest();
    const response = await mutation("patch", `/api/staff/tickets/${ticketId}/status`, actor, {
      ...input, reason: "Keep this valid reason only if the transition commits.",
      ...(conflict === "stale" ? {
        expectedUpdatedAt: new Date(before.ticket.updatedAt.getTime() - 1).toISOString(),
      } : {}),
    });
    assertSafeError(response, 409, conflict === "stale" ? "STALE_WRITE" : "ACTIONS_OUTSTANDING");
    assertSafeEqual(await state(ticketId), before, "Rejected transition preserves exact parent/children/both histories/receipts");
    expect(await fixtures.domainDigest() === digest, "Rejected reason-bearing transition has no owned writes; digest withheld").toBe(true);
  });
});
