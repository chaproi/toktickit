import { randomBytes, randomUUID } from "node:crypto";
import { Prisma, PrismaClient, type Action } from "@prisma/client";
import type { Client } from "pg";
import { describe, expect, it, vi } from "vitest";
import { LAB3_SEEDED_USERS, seedDatabase } from "../../prisma/seed.js";
import { hashPassword } from "../../src/auth/password.js";
import {
  applyLab3Baseline, applyLaterMigrations, identifier, oldTables, query, snapshot,
  ticketStates, verifiedTestTarget, withDisposableSchema, type Snapshot,
} from "./migration-test-fixtures.js";

// D-17 / section 9 / AC-32,T-32 / AC-33,T-33. Real seedDatabase and real
// Prisma/PostgreSQL only. Operational fixtures below are not substitute seed
// implementations. A missing production cohort must fail its own assertion.
const tables = { ...oldTables, Action: "id", ActionHistory: "id", MutationReceipt: "id", SeedFixture: "id" };
// A simulated subsequent operational instant, always after initial seed times.
const later = new Date(Date.now() + 60_000);
const frozen = ["CLOSED", "CANCELLED"] as const;
const unfinished = ["PLANNED", "IN_PROGRESS"] as const;
const credential = () => `Aa1!${randomBytes(24).toString("base64url")}`;

async function withSeedSchema(
  work: (prisma: PrismaClient, client: Client, schema: string) => Promise<void>,
) {
  await withDisposableSchema("populated", async (client, schema) => {
    await applyLab3Baseline(client);
    await applyLaterMigrations(client);
    const url = new URL(verifiedTestTarget().databaseUrl);
    url.searchParams.set("schema", schema);
    const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [] });
    const previous = process.env.LAB3_SEED_INITIAL_CREDENTIALS;
    process.env.LAB3_SEED_INITIAL_CREDENTIALS = JSON.stringify(Object.fromEntries(
      LAB3_SEEDED_USERS.map((user) => [user.email, credential()]),
    ));
    try {
      const [identity] = await prisma.$queryRaw<Array<{ schema: string; database: string }>>`
        SELECT current_schema() AS schema,current_database() AS database
      `;
      expect(identity?.schema === schema, "Prisma explicitly targets the owned schema; names redacted").toBe(true);
      expect(identity?.database === verifiedTestTarget().identity.databaseName,
        "Prisma target matches the dedicated database guard; names redacted").toBe(true);
      await work(prisma, client, schema);
    } finally {
      try { await prisma.$disconnect(); }
      finally {
        if (previous === undefined) delete process.env.LAB3_SEED_INITIAL_CREDENTIALS;
        else process.env.LAB3_SEED_INITIAL_CREDENTIALS = previous;
        expect(process.env.LAB3_SEED_INITIAL_CREDENTIALS === previous,
          "Test-local credential environment restored; values redacted").toBe(true);
        console.info("Seed isolation cleanup: schema-targeted Prisma disconnected; credential environment restored.");
      }
    }
  });
}

async function reportedSeed(prisma: PrismaClient): Promise<string[]> {
  const records: string[] = [];
  // Observe existing reporting channels without requiring a new return type or
  // particular prose. Report contents stay in memory, including on failure.
  const spies = (["log", "info", "warn", "error"] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation((...values: unknown[]) => {
      records.push(values.map((value) => {
        if (typeof value === "string") return value;
        try { return JSON.stringify(value); } catch { return "[unserializable report]"; }
      }).join(" "));
    }));
  try { await seedDatabase(prisma); }
  catch {
    throw new Error("Unexpected real seed failure; credential/session and database details redacted.");
  } finally { for (const spy of spies) spy.mockRestore(); }
  return records;
}

async function assertPreserved(client: Client, schema: string, before: Snapshot, label: string) {
  const after = await snapshot(client, schema, before, tables);
  for (const table of Object.keys(tables)) {
    expect.soft(after[table]?.count, `${label}: ${table} row count`).toBe(before[table]!.count);
    expect.soft(after[table]?.checksum === before[table]!.checksum,
      `${label}: ${table} IDs/content/credentials/attribution/timestamps unchanged; values redacted`).toBe(true);
  }
}

async function assertRegistry(prisma: PrismaClient) {
  const entries = await prisma.seedFixture.findMany({
    include: { user: true, category: true, relatedSystem: true, ticket: true, action: true },
  });
  expect.soft(entries.length, "Real seed produces stable typed registry entries").toBeGreaterThan(0);
  expect.soft(new Set(entries.map((entry) => entry.fixtureKey)).size).toBe(entries.length);
  for (const entry of entries) {
    expect.soft(entry.fixtureKey.trim().length, "Registry key is nonempty; no invented key vocabulary").toBeGreaterThan(0);
    const pairs = [[entry.userId, entry.user], [entry.categoryId, entry.category],
      [entry.relatedSystemId, entry.relatedSystem], [entry.ticketId, entry.ticket], [entry.actionId, entry.action]] as const;
    expect.soft(pairs.filter(([id]) => id !== null)).toHaveLength(1);
    for (const [id, target] of pairs) expect.soft(target?.id ?? null).toBe(id);
  }
  for (const field of ["userId", "categoryId", "relatedSystemId", "ticketId", "actionId"] as const) {
    expect.soft(entries.some((entry) => entry[field] !== null), `Registry includes seeded ${field} identities`).toBe(true);
  }
}

function actionJson(value: Action): Prisma.InputJsonObject {
  // Serialization makes fixture timestamps explicit ISO text, not secret or
  // relation data. This is fixture history, not a production validation helper.
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}
async function changeAction(
  prisma: PrismaClient, before: Action, actorId: number,
  event: "ACTION_EDITED" | "ACTION_REASSIGNED" | "ACTION_STARTED" | "ACTION_COMPLETED" | "ACTION_CANCELLED",
  data: Prisma.ActionUncheckedUpdateInput,
) {
  const updatedAt = new Date(Math.max(later.getTime(), before.updatedAt.getTime()) + 1);
  return prisma.$transaction(async (transaction) => {
    const after = await transaction.action.update({ where: { id: before.id },
      data: { ...data, version: before.version + 1, updatedAt } });
    await transaction.actionHistory.create({ data: {
      actionId: before.id, actorId, event, actionVersion: after.version,
      before: actionJson(before), after: actionJson(after), createdAt: updatedAt,
    } });
    return after;
  });
}
async function operationalAction(prisma: PrismaClient, ticketId: number, actorId: number, assigneeId: number) {
  return prisma.$transaction(async (transaction) => {
    const value = await transaction.action.create({ data: {
      ticketId, createdById: actorId, assigneeId, description: "Unrelated operational action <script>literal</script>",
      actionAt: later, createdAt: later, updatedAt: later,
    } });
    await transaction.actionHistory.create({ data: {
      actionId: value.id, actorId, event: "ACTION_CREATED", actionVersion: 1,
      before: Prisma.DbNull, after: actionJson(value), createdAt: later,
    } });
    return value;
  });
}

describe("AC-32 / T-32: real clean seed cohorts and stable rerun", () => {
  it("creates all approved Ticket/Action/assignment and empty/nonempty dashboard cohorts", async () => {
    await withSeedSchema(async (prisma) => {
      await reportedSeed(prisma);
      const tickets = await prisma.ticket.findMany({ include: { actions: true } });
      const users = await prisma.user.findMany({ select: { id: true, role: true, isActive: true } });
      const actions = await prisma.action.findMany();
      expect.soft(new Set(tickets.map((ticket) => ticket.currentStatus))).toEqual(new Set(ticketStates));
      for (const field of ["requestedPriority", "itPriority"] as const) {
        expect.soft(new Set(tickets.map((ticket) => ticket[field]))).toEqual(new Set(["LOW", "MEDIUM", "HIGH", "URGENT"]));
      }
      expect.soft(tickets.some((ticket) => ticket.ownerId === null)).toBe(true);
      expect.soft(tickets.some((ticket) => ticket.ownerId !== null)).toBe(true);
      expect.soft(tickets.some((ticket) => ticket.actions.length === 0), "Zero-action cohort").toBe(true);
      expect.soft(tickets.some((ticket) => ticket.actions.length === 1), "One-action cohort").toBe(true);
      expect.soft(tickets.some((ticket) => ticket.actions.length > 1), "Multiple-action cohort").toBe(true);
      expect.soft(new Set(actions.map((action) => action.status)), "All four real seeded Action states")
        .toEqual(new Set(["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]));
      const workers = users.filter((user) => user.isActive && ["IT_STAFF", "ADMINISTRATOR"].includes(user.role));
      const requesters = users.filter((user) => user.isActive && user.role === "REQUESTER");
      expect.soft(actions.some((action) => action.assigneeId === action.createdById), "Current-user assignment").toBe(true);
      expect.soft(actions.some((action) => action.assigneeId !== action.createdById), "Delegated assignment").toBe(true);
      expect.soft(workers.some((user) => !actions.some((action) => action.assigneeId === user.id && unfinished.includes(action.status as "PLANNED" | "IN_PROGRESS"))),
        "Staff empty unfinished-action cohort").toBe(true);
      expect.soft(workers.some((user) => actions.some((action) => action.assigneeId === user.id && unfinished.includes(action.status as "PLANNED" | "IN_PROGRESS"))),
        "Staff nonempty unfinished-action cohort").toBe(true);
      expect.soft(requesters.some((user) => !tickets.some((ticket) => ticket.requesterId === user.id)), "Requester empty cohort").toBe(true);
      expect.soft(requesters.some((user) => tickets.some((ticket) => ticket.requesterId === user.id)), "Requester nonempty cohort").toBe(true);
      expect.soft(actions.filter((action) => unfinished.includes(action.status as "PLANNED" | "IN_PROGRESS"))
        .every((action) => workers.some((user) => user.id === action.assigneeId)), "Eligible unfinished assignees").toBe(true);
      expect.soft(tickets.filter((ticket) => frozen.includes(ticket.currentStatus as "CLOSED" | "CANCELLED"))
        .every((ticket) => ticket.actions.every((action) => !unfinished.includes(action.status as "PLANNED" | "IN_PROGRESS"))),
      "Frozen Tickets have no unfinished seed Actions").toBe(true);
    });
  }, 30_000);

  it("binds typed registry identities and reruns without any row, key, history, receipt or numbering changes", async () => {
    await withSeedSchema(async (prisma, client, schema) => {
      await reportedSeed(prisma);
      await assertRegistry(prisma);
      const before = await snapshot(client, schema, undefined, tables);
      await reportedSeed(prisma);
      await assertPreserved(client, schema, before, "Clean stable rerun");
      await assertRegistry(prisma);
    });
  }, 30_000);
});

describe("AC-33 / T-33: operational edits remain authoritative", () => {
  it("preserves edited users/references/Tickets, unrelated Actions, credentials, sessions and history on two reruns", async () => {
    await withSeedSchema(async (prisma, client, schema) => {
      await reportedSeed(prisma);
      const workers = await prisma.user.findMany({ where: { role: "IT_STAFF", isActive: true }, orderBy: { id: "asc" } });
      expect(workers.length, "Fixture has workers for safe reassignment before deactivation").toBeGreaterThanOrEqual(3);
      const [renamed, changed, replacement] = workers;
      const retiring = [renamed!.id, changed!.id];
      for (const row of await prisma.action.findMany({ where: { assigneeId: { in: retiring }, status: { in: [...unfinished] } } })) {
        await changeAction(prisma, row, replacement!.id, "ACTION_REASSIGNED", { assigneeId: replacement!.id });
      }
      await prisma.ticket.updateMany({ where: { ownerId: { in: retiring }, currentStatus: { notIn: [...frozen] } },
        data: { ownerId: replacement!.id, updatedAt: later } });
      const category = await prisma.category.findFirstOrThrow({ where: { name: "Hardware" } });
      const system = await prisma.relatedSystem.findFirstOrThrow({ where: { name: "Corporate Laptop" } });
      const requester = await prisma.user.findFirstOrThrow({ where: { role: "REQUESTER", isActive: true } });
      const open = await prisma.ticket.findFirstOrThrow({ where: { currentStatus: "OPEN" } });
      await prisma.ticket.update({ where: { id: open.id }, data: {
        summary: "Operational summary", description: "Operational literal Ticket <script>text</script>",
        requestedPriority: "URGENT", itPriority: "LOW", ownerId: replacement!.id,
        currentStatus: "IN_PROGRESS", ticketDate: later, updatedAt: later,
      } });
      await prisma.ticketStatusHistory.create({ data: { ticketId: open.id, actorId: replacement!.id,
        fromStatus: "OPEN", toStatus: "IN_PROGRESS", reason: "Operational history retained", createdAt: later } });
      const unrelatedUser = await prisma.user.create({ data: { name: "Unrelated requester", email: `${randomUUID()}@example.test`,
        role: "REQUESTER", isActive: true, passwordHash: await hashPassword(credential()), mustChangePassword: false,
        passwordChangedAt: later, createdAt: later, updatedAt: later } });
      const unrelatedCategory = await prisma.category.create({ data: { name: `Unrelated ${randomUUID()}`, createdAt: later, updatedAt: later } });
      const unrelatedSystem = await prisma.relatedSystem.create({ data: { name: `Unrelated ${randomUUID()}`, createdAt: later, updatedAt: later } });
      const year = new Date().getUTCFullYear();
      const sequence = await prisma.ticketNumberSequence.findUniqueOrThrow({ where: { year } });
      const next = sequence.lastValue + 1;
      const unrelatedTicket = await prisma.ticket.create({ data: { ticketNumber: `TKT-${year}-${String(next).padStart(5, "0")}`,
        clientSubmissionId: randomUUID(), requesterId: unrelatedUser.id, categoryId: unrelatedCategory.id,
        relatedSystemId: unrelatedSystem.id, summary: "Unrelated operational Ticket", description: "Unrelated operational content",
        requestedPriority: "HIGH", itPriority: "HIGH", ownerId: replacement!.id, currentStatus: "OPEN",
        createdAt: later, ticketDate: later, updatedAt: later } });
      await prisma.ticketNumberSequence.update({ where: { year }, data: { lastValue: next, updatedAt: later } });
      await prisma.ticketStatusHistory.create({ data: { ticketId: unrelatedTicket.id, actorId: replacement!.id,
        fromStatus: "NEW", toStatus: "OPEN", createdAt: later } });
      let action = await operationalAction(prisma, unrelatedTicket.id, renamed!.id, renamed!.id);
      action = await changeAction(prisma, action, replacement!.id, "ACTION_REASSIGNED", { assigneeId: replacement!.id,
        description: "Changed operational Action", result: "Retained draft", attachmentNotes: "Literal attachment note",
        followUpRequired: true, followUpNote: "Follow-up retained in history" });
      action = await changeAction(prisma, action, replacement!.id, "ACTION_STARTED", { status: "IN_PROGRESS" });
      action = await changeAction(prisma, action, replacement!.id, "ACTION_COMPLETED", {
        status: "COMPLETED", performedById: replacement!.id,
        completedAt: new Date(action.updatedAt.getTime() + 1), result: "Operational completion with follow-up retained",
      });
      let cancelled = await operationalAction(prisma, unrelatedTicket.id, replacement!.id, replacement!.id);
      cancelled = await changeAction(prisma, cancelled, replacement!.id, "ACTION_CANCELLED", {
        status: "CANCELLED", cancelledAt: new Date(cancelled.updatedAt.getTime() + 1), cancellationReason: "Operational cancellation retained",
      });
      await prisma.mutationReceipt.create({ data: { actorId: replacement!.id, clientMutationId: randomUUID(),
        operation: "COMPLETE_ACTION", ticketId: unrelatedTicket.id, actionId: action.id,
        inputFingerprint: randomBytes(32).toString("hex"), safeResponse: { action: actionJson(action) }, createdAt: later } });
      await prisma.publicComment.create({ data: { ticketId: unrelatedTicket.id, authorId: unrelatedUser.id, content: "Unrelated public history", createdAt: later } });
      await prisma.internalNote.create({ data: { ticketId: unrelatedTicket.id, authorId: replacement!.id, content: "Unrelated private history", createdAt: later } });
      await prisma.authSession.create({ data: { userId: requester.id, tokenHash: randomBytes(32).toString("hex"),
        csrfTokenHash: randomBytes(32).toString("hex"), createdAt: later, lastSeenAt: later,
        expiresAt: new Date(later.getTime() + 86_400_000) } });
      const changedPassword = await hashPassword(credential());
      const changedEmail = `${randomUUID()}@example.test`;
      await prisma.user.update({ where: { id: renamed!.id }, data: { name: "Renamed operational worker", email: changedEmail,
        role: "REQUESTER", isActive: false, passwordHash: changedPassword, mustChangePassword: false,
        passwordChangedAt: later, updatedAt: later } });
      await prisma.user.update({ where: { id: changed!.id }, data: { name: "Changed operational worker", role: "REQUESTER",
        isActive: false, mustChangePassword: false, passwordChangedAt: later, updatedAt: later } });
      await prisma.category.update({ where: { id: category.id }, data: { name: `Renamed ${randomUUID()}`, isActive: false, updatedAt: later } });
      await prisma.relatedSystem.update({ where: { id: system.id }, data: { name: `Renamed ${randomUUID()}`, isActive: false, updatedAt: later } });
      expect(await prisma.user.count({ where: { role: "ADMINISTRATOR", isActive: true } })).toBeGreaterThan(0);
      expect(await prisma.action.count({ where: { assigneeId: { in: retiring }, status: { in: [...unfinished] } } })).toBe(0);
      expect(await prisma.ticket.count({ where: { ownerId: { in: retiring }, currentStatus: { notIn: [...frozen] } } })).toBe(0);
      const before = await snapshot(client, schema, undefined, tables);
      const originalBinding = await prisma.seedFixture.findMany({ where: { userId: renamed!.id } });
      for (const run of [1, 2]) {
        await reportedSeed(prisma);
        await assertPreserved(client, schema, before, `Operational rerun ${run}`);
        expect.soft(await prisma.user.count({ where: { email: renamed!.email } }), "Original email must not create a duplicate account").toBe(0);
        const currentUser = await prisma.user.findUniqueOrThrow({ where: { id: renamed!.id } });
        expect.soft(currentUser.email === changedEmail && currentUser.passwordHash === changedPassword,
          "Renamed identity and operational credential retained; values redacted").toBe(true);
        expect.soft(await prisma.seedFixture.findMany({ where: { userId: renamed!.id } })).toEqual(originalBinding);
      }
    });
  }, 30_000);

  it("retains a registered seeded Action's content, attribution, assignment, lifecycle and version history", async () => {
    await withSeedSchema(async (prisma, client, schema) => {
      await reportedSeed(prisma);
      const registered = await prisma.seedFixture.findFirst({ where: { action: { status: { in: [...unfinished] },
        ticket: { currentStatus: { notIn: [...frozen] } } } }, include: { action: true } });
      expect(registered?.action, "Seed must provide a registered editable Action before operational-edit assertions").toBeTruthy();
      let action = registered!.action!;
      const actor = await prisma.user.findFirstOrThrow({ where: { isActive: true, role: { in: ["IT_STAFF", "ADMINISTRATOR"] }, id: { not: action.assigneeId } } });
      action = await changeAction(prisma, action, actor.id, "ACTION_REASSIGNED", { assigneeId: actor.id,
        description: "Edited registered action <script>literal</script>", result: "Operational draft",
        attachmentNotes: "Operational attachment description", followUpRequired: true, followUpNote: "Operational next step" });
      if (action.status === "PLANNED") action = await changeAction(prisma, action, actor.id, "ACTION_STARTED", { status: "IN_PROGRESS" });
      await changeAction(prisma, action, actor.id, "ACTION_COMPLETED", { status: "COMPLETED", performedById: actor.id,
        result: "Operational completed result", completedAt: new Date(action.updatedAt.getTime() + 1) });
      const before = await snapshot(client, schema, undefined, tables);
      for (const run of [1, 2]) {
        await reportedSeed(prisma);
        await assertPreserved(client, schema, before, `Registered Action rerun ${run}`);
      }
    });
  }, 30_000);
});

describe("AC-33 / T-33: ambiguous legacy mapping and illegal missing dependents", () => {
  it("reports an ambiguous renamed legacy identity without guessing a duplicate or registry binding", async () => {
    await withSeedSchema(async (prisma) => {
      const fixture = LAB3_SEEDED_USERS.find((user) => user.role === "IT_STAFF" && user.isActive)!;
      const encoded = await hashPassword(credential());
      const candidates = [];
      for (const role of ["IT_STAFF", "REQUESTER"] as const) candidates.push(await prisma.user.create({ data: {
        name: fixture.name, email: `${randomUUID()}@example.test`, role, isActive: role === "REQUESTER",
        passwordHash: encoded, mustChangePassword: false, passwordChangedAt: later, createdAt: later, updatedAt: later,
      } }));
      const before = JSON.stringify(candidates);
      const reports = await reportedSeed(prisma);
      const after = await prisma.user.findMany({ where: { id: { in: candidates.map((user) => user.id) } }, orderBy: { id: "asc" } });
      expect.soft(JSON.stringify(after) === before, "Ambiguous legacy identities/credentials remain unchanged; values redacted").toBe(true);
      expect.soft(await prisma.user.count({ where: { email: fixture.email } }), "Do not guess a new original-email user").toBe(0);
      expect.soft(await prisma.seedFixture.count({ where: { userId: { in: candidates.map((user) => user.id) } } }), "Do not guess an ambiguous registry binding").toBe(0);
      expect.soft(reports.some((record) => record.includes(fixture.name) || record.includes(fixture.email)),
        "Affected legacy fixture is observably reported; exact prose is unspecified").toBe(true);
    });
  }, 30_000);

  it("preserves an identifiable inactive legacy worker and reports/skips illegal missing dependent fixtures", async () => {
    await withSeedSchema(async (prisma) => {
      const fixture = LAB3_SEEDED_USERS.find((user) => user.role === "IT_STAFF" && user.isActive)!;
      const worker = await prisma.user.create({ data: { ...fixture, isActive: false, passwordHash: await hashPassword(credential()),
        mustChangePassword: false, passwordChangedAt: later, createdAt: later, updatedAt: later } });
      const reports = await reportedSeed(prisma);
      const after = await prisma.user.findUniqueOrThrow({ where: { id: worker.id } });
      expect.soft(JSON.stringify(after) === JSON.stringify(worker), "Inactive legacy worker is not reset/reactivated; values redacted").toBe(true);
      expect.soft(await prisma.action.count({ where: { assigneeId: worker.id, status: { in: [...unfinished] } } })).toBe(0);
      expect.soft(await prisma.ticket.count({ where: { ownerId: worker.id, currentStatus: { notIn: [...frozen] } } }), "Do not create open ownership for an inactive worker").toBe(0);
      expect.soft(reports.some((record) => record.includes(fixture.name) || record.includes(fixture.email)),
        "Affected ineligible fixture is observably reported").toBe(true);
    });
  }, 30_000);

  it("reports/skips missing Action dependents of a frozen legacy parent without reopening it", async () => {
    await withSeedSchema(async (source) => {
      await reportedSeed(source);
      const template = await source.ticket.findFirst({ where: { currentStatus: { notIn: [...frozen] },
        actions: { some: { status: { in: [...unfinished] } } } }, include: { requester: true, category: true, relatedSystem: true } });
      expect(template, "Real seed must supply a parent with dependent unfinished Action fixtures").toBeTruthy();
      await withSeedSchema(async (prisma, client, schema) => {
        // Reconstruct only inherited Lab 3 identities and the discovered real
        // Ticket submission identity. No future registry key/Action is invented.
        const ids = new Map<string, number>();
        for (const fixture of LAB3_SEEDED_USERS) {
          const user = await prisma.user.create({ data: { ...fixture, passwordHash: await hashPassword(credential()), mustChangePassword: false } });
          ids.set(fixture.email, user.id);
        }
        const category = await prisma.category.upsert({ where: { name: template!.category.name }, update: {}, create: { name: template!.category.name } });
        const system = await prisma.relatedSystem.create({ data: { name: template!.relatedSystem.name } });
        const actor = await prisma.user.findFirstOrThrow({ where: { role: "IT_STAFF", isActive: true } });
        const parent = await prisma.ticket.create({ data: { ticketNumber: template!.ticketNumber, clientSubmissionId: template!.clientSubmissionId,
          requesterId: ids.get(template!.requester.email)!, categoryId: category.id, relatedSystemId: system.id,
          summary: template!.summary, description: "Operationally cancelled legacy parent", currentStatus: "CANCELLED",
          ownerId: null, requestedPriority: template!.requestedPriority, itPriority: template!.itPriority,
          ticketDate: later, createdAt: later, updatedAt: later } });
        await prisma.ticketStatusHistory.create({ data: { ticketId: parent.id, actorId: actor.id,
          fromStatus: "NEW", toStatus: "CANCELLED", reason: "Operational cancellation before Lab 4 seed", createdAt: later } });
        const ticketBefore = JSON.stringify(parent);
        const historyBefore = await snapshot(client, schema, undefined, { TicketStatusHistory: "id" });
        const reports = await reportedSeed(prisma);
        expect.soft(JSON.stringify(await prisma.ticket.findUniqueOrThrow({ where: { id: parent.id } })) === ticketBefore,
          "Frozen legacy parent status/content/identity/times retained").toBe(true);
        expect.soft(await prisma.action.count({ where: { ticketId: parent.id } }), "Illegal missing Action fixtures are skipped").toBe(0);
        const originalHistories = await prisma.ticketStatusHistory.findMany({ where: { ticketId: parent.id } });
        expect.soft(originalHistories).toHaveLength(historyBefore.TicketStatusHistory!.count);
        expect.soft(reports.some((record) => record.includes(parent.ticketNumber) || record.includes(parent.clientSubmissionId)),
          "Affected frozen parent is observably reported").toBe(true);
      });
    });
  }, 30_000);
});

describe("AC-32 / T-32: whole-seed failure and safe retry", () => {
  it("rolls back a deterministic late database failure, then succeeds and remains stable on another rerun", async () => {
    await withSeedSchema(async (prisma, client, schema) => {
      const before = await snapshot(client, schema, undefined, tables);
      // This owned, nontransactional probe proves the trigger was reached even
      // if the production transaction rolls back. It is not a domain sequence.
      await query(client, 'CREATE SEQUENCE "seed_failure_probe"');
      await query(client, `CREATE FUNCTION "seed_fail_late"() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          PERFORM nextval('${identifier(schema)}."seed_failure_probe"'::regclass);
          RAISE EXCEPTION USING ERRCODE='P4401',MESSAGE='Owned seed failure injection';
        END $$`);
      await query(client, `CREATE TRIGGER "seed_fail_late" BEFORE INSERT ON "InternalNote"
        FOR EACH ROW EXECUTE FUNCTION "seed_fail_late"()`);
      let failed = false;
      try {
        try { await reportedSeed(prisma); } catch { failed = true; }
        expect(failed, "Real seed encounters the deterministic late database failure").toBe(true);
        const probe = await query<{ is_called: boolean }>(client, 'SELECT is_called FROM "seed_failure_probe"');
        expect(probe.rows[0]?.is_called, "Owned late-write trigger actually executed").toBe(true);
        // There is deliberately NO test transaction around seedDatabase.
        await assertPreserved(client, schema, before, "Failed seed must be atomic");
      } finally { await query(client, 'DROP TRIGGER "seed_fail_late" ON "InternalNote"'); }
      await reportedSeed(prisma);
      await assertRegistry(prisma);
      const successful = await snapshot(client, schema, undefined, tables);
      await reportedSeed(prisma);
      await assertPreserved(client, schema, successful, "Retry then stable rerun");
    });
  }, 30_000);
});
