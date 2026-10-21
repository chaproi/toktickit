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
