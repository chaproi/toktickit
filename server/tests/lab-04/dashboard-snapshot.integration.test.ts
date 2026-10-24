import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { Ticket, TicketStatus } from "@prisma/client";
import { Client } from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { configureTestDatabaseEnvironment } from "../../src/testing/test-database.js";
import { APPROVED_ORIGIN, cookieHeader, cookieValue, createAuthUser, loginRequest } from "../lab-03/auth-test-helpers.js";
import { withDashboardReadProbe } from "./dashboard-snapshot-test-helpers.js";

// Partial AC-28/T-28/T-46. Real clocks, HTTP, SQL reads, independent writer
// COMMIT and an explicit after-count barrier. The direct writer is controlled
// fixture data maintaining valid edges/history, NOT workflow-endpoint evidence.
const prisma = getPrisma();
const marker = `issue47-snapshot-${randomUUID()}`;
const users: number[] = [], categories: number[] = [], systems: number[] = [], tickets: number[] = [];
let requesterId: number, foreignId: number, staffId: number;
let requesterCookie: string, staffCookie: string, staffCsrf: string;
let verified = false;

function safeEqual(actual: unknown, expected: unknown, label: string) {
  expect(isDeepStrictEqual(actual, expected), `${label}; sensitive values redacted`).toBe(true);
}
function fixtureError(stage: string, error: unknown) {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  const safe = typeof code === "string" && /^(P\d{4}|[0-9A-Z]{5})$/u.test(code) ? code : "unclassified";
  return new Error(`Dashboard snapshot ${stage} failed (${safe}); sensitive details withheld.`);
}

beforeAll(async () => {
  try {
    const identity = configureTestDatabaseEnvironment();
    const operational = process.env.TOKTICKIT_DEVELOPMENT_DATABASE_URL;
    expect(Boolean(operational) && decodeURIComponent(new URL(operational!).pathname.slice(1)) !== identity.databaseName,
      "Dedicated snapshot test database differs from operational; values withheld").toBe(true);
    const [live] = await prisma.$queryRaw<Array<{ database: string; schema: string }>>`
      SELECT current_database() AS database,current_schema() AS schema`;
    expect(live.database === identity.databaseName && live.schema === identity.schema,
      "Actual guard agrees with live snapshot fixture target; values withheld").toBe(true);
    verified = true;
    for (const [label, role] of [["requester", "REQUESTER"], ["foreign", "REQUESTER"], ["staff", "IT_STAFF"]] as const) {
      const value = await createAuthUser({ email: `${marker}-${label}@example.test`, role });
      users.push(value.user.id);
      if (label === "foreign") { foreignId = value.user.id; continue; }
      const login = await loginRequest(value.user.email, value.password);
      expect(login.status, "Real snapshot fixture login; response redacted").toBe(200);
      if (label === "requester") { requesterId = value.user.id; requesterCookie = cookieHeader(login.headers["set-cookie"]); }
      else {
        staffId = value.user.id; staffCookie = cookieHeader(login.headers["set-cookie"]);
        staffCsrf = cookieValue(login.headers["set-cookie"], "toktickit_csrf");
      }
    }
    categories.push((await prisma.category.create({ data: { name: marker } })).id);
    systems.push((await prisma.relatedSystem.create({ data: { name: marker } })).id);
  } catch (error) { throw fixtureError("setup", error); }
});

async function addTicket(owner: number, status: "OPEN" | "RESOLVED", scope: number[]) {
  const [clock] = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT CURRENT_TIMESTAMP AS now`;
  const old = new Date(clock.now.getTime() - 2 * 3_600_000);
  const ticket = await prisma.ticket.create({ data: {
    ticketNumber: `D47S-${randomUUID().replaceAll("-", "").slice(0, 12)}`,
    clientSubmissionId: randomUUID(), requesterId: owner, ownerId: staffId,
    categoryId: categories[0]!, relatedSystemId: systems[0]!, requestedPriority: "HIGH", itPriority: "MEDIUM",
    summary: "snapshot match <script>literal summary</script>", description: `${marker} private body`,
    currentStatus: status, createdAt: new Date(clock.now.getTime() - 4 * 86_400_000),
    ticketDate: new Date(clock.now.getTime() - 4 * 86_400_000), updatedAt: old,
  } });
  tickets.push(ticket.id); scope.push(ticket.id);
  await prisma.ticketStatusHistory.create({ data: { ticketId: ticket.id, actorId: staffId,
    fromStatus: "NEW", toStatus: "OPEN", reason: null, createdAt: new Date(clock.now.getTime() - 3 * 86_400_000) } });
  if (status === "RESOLVED") await prisma.ticketStatusHistory.create({ data: {
    ticketId: ticket.id, actorId: staffId, fromStatus: "OPEN", toStatus: "RESOLVED", reason: null, createdAt: old,
  } });
  return ticket;
}

async function state(scope: number[]) {
  const owned = { ticketId: { in: scope } };
  return {
    users: await prisma.user.findMany({ where: { id: { in: users } }, orderBy: { id: "asc" } }),
    categories: await prisma.category.findMany({ where: { id: { in: categories } }, orderBy: { id: "asc" } }),
    systems: await prisma.relatedSystem.findMany({ where: { id: { in: systems } }, orderBy: { id: "asc" } }),
    tickets: await prisma.ticket.findMany({ where: { id: { in: scope } }, orderBy: { id: "asc" } }),
    history: await prisma.ticketStatusHistory.findMany({ where: owned, orderBy: { id: "asc" } }),
    actions: await prisma.action.findMany({ where: owned, orderBy: { id: "asc" } }),
    actionHistory: await prisma.actionHistory.findMany({ where: { action: owned }, orderBy: { id: "asc" } }),
    receipts: await prisma.mutationReceipt.findMany({ where: owned, orderBy: { id: "asc" } }),
    comments: await prisma.publicComment.findMany({ where: owned, orderBy: { id: "asc" } }),
    notes: await prisma.internalNote.findMany({ where: owned, orderBy: { id: "asc" } }),
    attachments: await prisma.attachment.findMany({ where: owned, orderBy: { id: "asc" } }),
    fixtures: await prisma.seedFixture.findMany({ where: { OR: [{ ticketId: { in: scope } }, { userId: { in: users } },
      { categoryId: { in: categories } }, { relatedSystemId: { in: systems } }] }, orderBy: { id: "asc" } }),
    numbering: await prisma.ticketNumberSequence.findMany({ orderBy: { year: "asc" } }),
  };
}

async function removeTickets(scope: number[]) {
  const owned = { ticketId: { in: scope } };
  await prisma.$transaction([
    prisma.seedFixture.deleteMany({ where: { ticketId: { in: scope } } }),
    prisma.mutationReceipt.deleteMany({ where: owned }),
    prisma.actionHistory.deleteMany({ where: { action: owned } }),
    prisma.action.deleteMany({ where: owned }),
    prisma.ticketStatusHistory.deleteMany({ where: owned }),
    prisma.publicComment.deleteMany({ where: owned }), prisma.internalNote.deleteMany({ where: owned }),
    prisma.attachment.deleteMany({ where: owned }), prisma.ticket.deleteMany({ where: { id: { in: scope } } }),
  ]);
  const counts = await Promise.all([
    prisma.ticket.count({ where: { id: { in: scope } } }), prisma.ticketStatusHistory.count({ where: owned }),
    prisma.action.count({ where: owned }), prisma.actionHistory.count({ where: { action: owned } }),
    prisma.mutationReceipt.count({ where: owned }), prisma.publicComment.count({ where: owned }),
    prisma.internalNote.count({ where: owned }), prisma.attachment.count({ where: owned }),
    prisma.seedFixture.count({ where: { ticketId: { in: scope } } }),
  ]);
  expect(counts).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
}

const search = new URLSearchParams({ search: "snapshot match" });
function dashboard() { return request(app).get(`/api/dashboard/requester?${search}`).set("Cookie", requesterCookie); }
function descriptorParams(descriptor: { path: string; query: Record<string, string | number> }) {
  expect(descriptor.path).toBe("/api/tickets");
  return new URLSearchParams(Object.entries(descriptor.query).map(([key, value]) => [key, String(value)]));
}
function assertRow(row: Record<string, any>, ticket: Ticket, status: TicketStatus, updatedAt: Date) {
  expect(row.id).toBe(ticket.id); expect(row.summary).toBe(ticket.summary);
  expect(row.currentStatus).toBe(status); expect(row.updatedAt).toBe(updatedAt.toISOString());
  expect(Object.keys(row.owner).every((key) => ["id", "name", "role"].includes(key))).toBe(true);
  expect(row.owner.id).toBe(staffId);
  expect(/passwordHash|tokenHash|csrfTokenHash|inputFingerprint|safeResponse|internalNotes|storageKey|"email"|"description"/u
    .test(JSON.stringify(row))).toBe(false);
}

describe("Real-clock PostgreSQL snapshot coherence with independently committed writers", () => {
  it.each([
    { label: "Dashboard resolve between aggregates", surface: "dashboard", initial: "OPEN", change: "resolve" },
    { label: "Dashboard reopen between aggregates", surface: "dashboard", initial: "RESOLVED", change: "reopen" },
    { label: "updated list changes membership after count", surface: "updated", initial: "OPEN", change: "summary" },
    { label: "resolved list reopens after count", surface: "resolved", initial: "RESOLVED", change: "reopen" },
  ] as const)("$label", async ({ label, surface, initial, change }) => {
    const scope: number[] = [];
    const writer = new Client({ connectionString: process.env.DATABASE_URL, application_name: `issue47-snapshot-writer-${randomUUID()}` });
    const observer = new Client({ connectionString: process.env.DATABASE_URL, application_name: `issue47-snapshot-observer-${randomUUID()}` });
    let writerOpen = false;
    try {
      const ticket = await addTicket(requesterId, initial, scope);
      const foreign = await addTicket(foreignId, "OPEN", scope);
      // A real committed Action/history/receipt is an unrelated preservation witness.
      const witness = await request(app).post(`/api/tickets/${foreign.id}/actions`)
        .set("Cookie", staffCookie).set("Origin", APPROVED_ORIGIN).set("X-CSRF-Token", staffCsrf)
        .send({ description: "Unrelated snapshot receipt witness", result: null, attachmentNotes: null,
          followUpRequired: false, followUpNote: null, assigneeId: staffId,
          expectedTicketUpdatedAt: foreign.updatedAt.toISOString(), clientMutationId: randomUUID() });
      expect(witness.status, "Real owned witness creation succeeds; response redacted").toBe(201);
      const before = await state(scope);
      expect(before.receipts.length).toBe(1); expect(before.actionHistory.length).toBe(1);
      const baseline = await dashboard(); expect(baseline.status).toBe(200);
      safeEqual(await state(scope), before, "Baseline read introduces no writes");
      const params = surface === "dashboard" ? search : descriptorParams(
        baseline.body.drillDown[surface === "updated" ? "recentUpdated" : "recentResolved"]);

      await writer.connect(); await observer.connect();
      const identity = configureTestDatabaseEnvironment();
      for (const connection of [writer, observer]) {
        const live = (await connection.query<{ database: string; schema: string }>(
          "SELECT current_database() AS database,current_schema() AS schema")).rows[0];
        expect(live.database === identity.databaseName && live.schema === identity.schema,
          "Independent coordination connection matches the guarded target; values withheld").toBe(true);
      }
      let instant!: Date, historyId: number | undefined;
      const target: TicketStatus = change === "resolve" ? "RESOLVED" : change === "reopen" ? "REOPENED" : initial;
      const summary = change === "summary" ? "snapshot moved <script>literal summary</script>" : ticket.summary;
      const originalResponse = await withDashboardReadProbe({ pauseAfterFirstCount: true }, async (probe) => {
        const pending = probe.track((surface === "dashboard" ? dashboard() : request(app)
          .get(`/api/tickets?${params}`).set("Cookie", requesterCookie)).then((value) => value));
        const reader = await probe.waitForCount();
        expect(probe.evidence.countCompleted).toBe(true);
        expect(reader.isolation).toBe("repeatable read"); expect(reader.readOnly).toBe("on");
        await writer.query("BEGIN"); writerOpen = true;
        const writerPid = (await writer.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
        const observerPid = (await observer.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
        expect(new Set([reader.pid, writerPid, observerPid]).size).toBe(3);
        instant = (await writer.query<{ now: Date }>("SELECT clock_timestamp() AS now")).rows[0].now;
        expect(instant.getTime()).toBeGreaterThan(ticket.updatedAt.getTime());
        if (change === "summary") {
          await writer.query('UPDATE "Ticket" SET summary=$1,"updatedAt"=$2::timestamptz AT TIME ZONE \'UTC\' WHERE id=$3',
            [summary, instant, ticket.id]);
        } else {
          await writer.query('UPDATE "Ticket" SET "currentStatus"=$1::"TicketStatus","updatedAt"=$2::timestamptz AT TIME ZONE \'UTC\' WHERE id=$3',
            [target, instant, ticket.id]);
          historyId = (await writer.query<{ id: number }>(`INSERT INTO "TicketStatusHistory"
            ("ticketId","actorId","fromStatus","toStatus",reason,"createdAt")
            VALUES ($1,$2,$3::"TicketStatus",$4::"TicketStatus",$5,$6::timestamptz AT TIME ZONE 'UTC') RETURNING id`,
          [ticket.id, staffId, initial, target, "Controlled snapshot writer", instant])).rows[0].id;
        }
        await writer.query("COMMIT"); writerOpen = false;
        // Independent post-COMMIT observation precedes reader release. No sleeps.
        const visible = (await observer.query<{ status: string; summary: string; at: string; history: number }>(`
          SELECT "currentStatus" AS status,summary,to_char("updatedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at,
          (SELECT count(*)::int FROM "TicketStatusHistory" WHERE id=$2) AS history FROM "Ticket" WHERE id=$1`,
        [ticket.id, historyId ?? -1])).rows[0];
        expect(visible.status).toBe(target); expect(visible.summary).toBe(summary); expect(visible.at).toBe(instant.toISOString());
        expect(visible.history).toBe(historyId === undefined ? 0 : 1);
        const active = (await observer.query<{ state: string; open: boolean; snapshot: boolean }>(`
          SELECT state,xact_start IS NOT NULL AS open,backend_xmin IS NOT NULL AS snapshot
          FROM pg_stat_activity WHERE pid=$1`, [reader.pid])).rows[0];
        expect(active).toMatchObject({ state: "idle in transaction", open: true, snapshot: true });
        expect(probe.evidence.released).toBe(false);
        probe.release();
        const response = await pending;
        expect(response.status).toBe(200);
        expect(probe.evidence.transactions).toBe(1); expect(probe.evidence.clockReads).toBe(1);
        expect(probe.evidence.clockOverrides).toBe(0);
        for (const read of probe.evidence.reads) {
          expect(read.pid).toBe(reader.pid); expect(read.isolation).toBe("repeatable read"); expect(read.readOnly).toBe("on");
        }
        console.info(`Real-clock snapshot verified: ${label}; readerPid=${reader.pid}; writerPid=${writerPid}; observerPid=${observerPid}; repeatable read/read-only; real count completed; independent COMMIT observed with reader open; released then drained.`);
        return response;
      });

      if (surface === "dashboard") {
        expect(originalResponse.body.metrics).toEqual({ outstanding: initial === "OPEN" ? 1 : 0,
          needsAttention: 0, recentUpdated: 1, recentResolved: initial === "RESOLVED" ? 1 : 0 });
        expect(originalResponse.body.lists.recentUpdated).toHaveLength(1);
        assertRow(originalResponse.body.lists.recentUpdated[0], ticket, initial, ticket.updatedAt);
        expect(originalResponse.body.lists.recentResolved).toHaveLength(initial === "RESOLVED" ? 1 : 0);
        if (initial === "RESOLVED") expect(originalResponse.body.lists.recentResolved[0].resolvedAt).toBe(ticket.updatedAt.toISOString());
      } else {
        expect(originalResponse.body.pagination).toEqual({ page: 1, pageSize: 10, totalItems: 1,
          totalPages: 1, hasPreviousPage: false, hasNextPage: false });
        expect(originalResponse.body.items).toHaveLength(1);
        assertRow(originalResponse.body.items[0], ticket, initial, ticket.updatedAt);
        if (surface === "resolved") expect(originalResponse.body.items[0].resolvedAt).toBe(ticket.updatedAt.toISOString());
      }
      const expected = structuredClone(before);
      expected.tickets = expected.tickets.map((value) => value.id === ticket.id ? {
        ...value, summary, currentStatus: target, updatedAt: instant,
      } : value);
      if (historyId !== undefined) expected.history.push({ id: historyId, ticketId: ticket.id, actorId: staffId,
        fromStatus: initial, toStatus: target, reason: "Controlled snapshot writer", createdAt: instant });
      safeEqual(await state(scope), expected, "Only exact writer changes persist; unrelated history/receipts/foreign records remain intact");
      const fresh = await dashboard(); expect(fresh.status).toBe(200);
      expect(fresh.body.metrics).toEqual(change === "summary"
        ? { outstanding: 0, needsAttention: 0, recentUpdated: 0, recentResolved: 0 }
        : { outstanding: target === "REOPENED" ? 1 : 0, needsAttention: 0, recentUpdated: 1,
          recentResolved: target === "RESOLVED" ? 1 : 0 });
      if (change !== "summary") assertRow(fresh.body.lists.recentUpdated[0], ticket, target, instant);
      if (change === "resolve") expect(fresh.body.lists.recentResolved[0].resolvedAt).toBe(instant.toISOString());
      const widget = change === "resolve" ? "recentResolved" : surface === "resolved" ? "recentResolved"
        : change === "summary" ? "recentUpdated" : "outstanding";
      const follow = await request(app).get(`/api/tickets?${descriptorParams(fresh.body.drillDown[widget])}`)
        .set("Cookie", requesterCookie);
      expect(follow.status).toBe(200);
      const matches = change === "summary" || surface === "resolved" ? 0 : 1;
      expect(follow.body.pagination.totalItems).toBe(matches);
      expect(follow.body.items.map((value: { id: number }) => value.id)).toEqual(matches ? [ticket.id] : []);
      safeEqual(await state(scope), expected, "Later fresh-snapshot HTTP reads add no domain writes");
    } finally {
      if (writerOpen) await writer.query("ROLLBACK");
      const closed = await Promise.allSettled([writer.end(), observer.end()]);
      expect(closed.every((value) => value.status === "fulfilled"), "Owned writer/observer clients disconnect after draining requests").toBe(true);
      await removeTickets(scope);
    }
  });
});

afterAll(async () => {
  try {
    if (!verified) return;
    await removeTickets(tickets);
    await prisma.$transaction([
      prisma.seedFixture.deleteMany({ where: { OR: [{ userId: { in: users } }, { categoryId: { in: categories } }, { relatedSystemId: { in: systems } }] } }),
      prisma.authSession.deleteMany({ where: { userId: { in: users } } }),
      prisma.user.deleteMany({ where: { id: { in: users } } }),
      prisma.category.deleteMany({ where: { id: { in: categories } } }),
      prisma.relatedSystem.deleteMany({ where: { id: { in: systems } } }),
    ]);
    const counts = await Promise.all([
      prisma.user.count({ where: { id: { in: users } } }), prisma.authSession.count({ where: { userId: { in: users } } }),
      prisma.category.count({ where: { id: { in: categories } } }), prisma.relatedSystem.count({ where: { id: { in: systems } } }),
    ]);
    expect(counts).toEqual([0, 0, 0, 0]);
    const [clients] = await prisma.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count
      FROM pg_stat_activity WHERE application_name LIKE 'issue47-snapshot-%'`;
    expect(clients.count).toBe(0);
    console.info("Issue47 snapshot cleanup verified: zero owned rows/sessions/references/coordination clients; no fault resources or environment changes.");
  } catch (error) { throw fixtureError("cleanup", error); }
  finally { await prisma.$disconnect(); }
});
