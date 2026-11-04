import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { Ticket, TicketStatus, UserRole } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { configureTestDatabaseEnvironment } from "../../src/testing/test-database.js";
import { cookieHeader, createAuthUser, loginRequest } from "../lab-03/auth-test-helpers.js";

// Six API-08 cases: partial AC-23/T-23, AC-01/02 (T-01/02), and the
// backend-empty contribution to AC-29/T-29. Basic resolution/order observations
// contribute to T-24/T-27; boundary, query, drill-down and snapshot races follow.
const prisma = getPrisma();
const marker = `issue47-dashboard-${randomUUID()}`;
const privateNote = `${marker} private Internal Note, never public dashboard data`;
const userIds: number[] = [];
const ticketIds: number[] = [];
const categoryIds: number[] = [];
const systemIds: number[] = [];
type Actor = { id: number; name: string; role: UserRole; cookie: string };
const actors = new Map<string, Actor>();
const tickets = new Map<string, Ticket>();
const resolutionTimes = new Map<number, Date>();
let verifiedTarget = false;
let clock: number;

function safeEqual(actual: unknown, expected: unknown, label: string) {
  expect(isDeepStrictEqual(actual, expected), `${label}; comparison values redacted`).toBe(true);
}

function safeFixtureError(stage: string, error: unknown) {
  const candidate = typeof error === "object" && error !== null
    ? (error as { code?: unknown }).code : undefined;
  const code = typeof candidate === "string" && /^(P\d{4}|[0-9A-Z]{5})$/u.test(candidate)
    ? candidate : "unclassified";
  return new Error(`Dashboard fixture ${stage} failed (${code}); sensitive details withheld.`);
}

function actor(label: string): Actor {
  const value = actors.get(label);
  if (!value) throw new Error("Owned Dashboard actor is not initialized.");
  return value;
}

function ticket(label: string): Ticket {
  const value = tickets.get(label);
  if (!value) throw new Error("Owned Dashboard Ticket is not initialized.");
  return value;
}

function hoursAgo(hours: number) {
  return new Date(clock - hours * 60 * 60 * 1000);
}

async function addActor(label: string, role: UserRole) {
  const { user, password } = await createAuthUser({
    email: `${marker}-${label}@example.test`, role,
  });
  userIds.push(user.id); // Own the identity before any later login/setup failure.
  const response = await loginRequest(user.email, password);
  expect(response.status, "Inherited real login succeeds; response values withheld").toBe(200);
  actors.set(label, { id: user.id, name: user.name, role,
    cookie: cookieHeader(response.headers["set-cookie"]) });
}

async function addTicket(
  label: string, requester: "A" | "B", status: TicketStatus,
  updatedHoursAgo: number, resolvedHoursAgo?: number,
) {
  const value = await prisma.ticket.create({ data: {
    ticketNumber: `D47-${randomUUID().replaceAll("-", "").slice(0, 12)}`,
    clientSubmissionId: randomUUID(), requesterId: actor(requester).id,
    categoryId: categoryIds[0]!, relatedSystemId: systemIds[0]!,
    ownerId: label === "A-closed-1" || status === "NEW" ? null : actor("staff").id,
    summary: `${label} <script>literal dashboard text</script>`,
    description: `${marker} private Ticket body, not a Dashboard row`,
    requestedPriority: requester === "A" ? "HIGH" : "LOW",
    itPriority: requester === "A" ? "MEDIUM" : "URGENT",
    currentStatus: status, ticketDate: hoursAgo(20 * 24),
    createdAt: hoursAgo(20 * 24), updatedAt: hoursAgo(updatedHoursAgo),
  } });
  ticketIds.push(value.id);
  tickets.set(label, value);

  // Direct read fixtures use valid matrix edges and real status-history rows;
  // they do not claim to execute the Ticket workflow endpoints.
  const events: Array<{ fromStatus: TicketStatus; toStatus: TicketStatus; createdAt: Date }> = [];
  const event = (fromStatus: TicketStatus, toStatus: TicketStatus, at: Date) =>
    events.push({ fromStatus, toStatus, createdAt: at });
  if (status === "CANCELLED") event("NEW", "CANCELLED", value.updatedAt);
  else if (status !== "NEW") {
    event("NEW", "OPEN", hoursAgo(19 * 24));
    if (status === "IN_PROGRESS") event("OPEN", "IN_PROGRESS", value.updatedAt);
    if (status === "WAITING_FOR_REQUESTER") event("OPEN", "WAITING_FOR_REQUESTER", value.updatedAt);
    if (status === "REOPENED") {
      event("OPEN", "RESOLVED", hoursAgo(4 * 24));
      event("RESOLVED", "REOPENED", value.updatedAt);
    }
    if (status === "RESOLVED" || status === "CLOSED") {
      if (resolvedHoursAgo === undefined) throw new Error("Resolved fixture needs an explicit real history time.");
      if (label === "A-resolved-2") {
        // Two qualifying resolutions of ONE currently resolved Ticket.
        event("OPEN", "RESOLVED", hoursAgo(5 * 24));
        event("RESOLVED", "REOPENED", hoursAgo(4 * 24));
        event("REOPENED", "IN_PROGRESS", hoursAgo(3 * 24));
        event("IN_PROGRESS", "RESOLVED", hoursAgo(resolvedHoursAgo));
      } else event("OPEN", "RESOLVED", hoursAgo(resolvedHoursAgo));
      resolutionTimes.set(value.id, hoursAgo(resolvedHoursAgo));
      if (status === "CLOSED") event("RESOLVED", "CLOSED", value.updatedAt);
    }
  }
  if (events.length) await prisma.ticketStatusHistory.createMany({ data: events.map((entry) => ({
    ...entry, ticketId: value.id, actorId: actor("staff").id,
    reason: entry.toStatus === "CANCELLED" ? "Cancel synthetic read fixture" : null,
  })) });
}

beforeAll(async () => {
  try {
    const identity = configureTestDatabaseEnvironment();
    const operational = process.env.TOKTICKIT_DEVELOPMENT_DATABASE_URL;
    expect(Boolean(operational) &&
      decodeURIComponent(new URL(operational!).pathname.slice(1)) !== identity.databaseName,
    "Dedicated test database differs from operational; values withheld").toBe(true);
    const [live] = await prisma.$queryRaw<Array<{ database: string; schema: string }>>`
      SELECT current_database() AS database, current_schema() AS schema`;
    expect(live?.database === identity.databaseName && live?.schema === identity.schema,
      "Live database/schema matches the actual repository guard; values withheld").toBe(true);
    verifiedTarget = true;

    for (const label of ["A", "B", "C"] as const) await addActor(label, "REQUESTER");
    await addActor("staff", "IT_STAFF");
    await addActor("admin", "ADMINISTRATOR");
    categoryIds.push((await prisma.category.create({ data: { name: `${marker} category` } })).id);
    systemIds.push((await prisma.relatedSystem.create({ data: { name: `${marker} system` } })).id);
    const [observed] = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT CURRENT_TIMESTAMP AS now`;
    clock = observed.now.getTime(); // Fixture anchor only; never fake authentication clocks.

    await addTicket("A-new", "A", "NEW", 72);
    await addTicket("A-open", "A", "OPEN", 72);
    await addTicket("A-progress", "A", "IN_PROGRESS", 72);
    await addTicket("A-waiting", "A", "WAITING_FOR_REQUESTER", 72);
    await addTicket("A-reopened", "A", "REOPENED", 72);
    await addTicket("A-resolved-1", "A", "RESOLVED", 24, 72);
    await addTicket("A-closed-1", "A", "CLOSED", 24, 72);
    await addTicket("A-cancelled", "A", "CANCELLED", 10 * 24);
    await addTicket("A-resolved-2", "A", "RESOLVED", 6, 48);
    await addTicket("A-closed-2", "A", "CLOSED", 6, 48);
    await addTicket("A-resolved-3", "A", "RESOLVED", 12, 18);
    await addTicket("A-closed-3", "A", "CLOSED", 12, 18);
    await addTicket("A-old-resolved", "A", "RESOLVED", 10 * 24, 11 * 24);
    await addTicket("B-open", "B", "OPEN", 72);
    await addTicket("B-waiting-1", "B", "WAITING_FOR_REQUESTER", 24);
    await addTicket("B-waiting-2", "B", "WAITING_FOR_REQUESTER", 12);
    await addTicket("B-resolved", "B", "RESOLVED", 6, 18);
    await addTicket("B-cancelled", "B", "CANCELLED", 10 * 24);
    await prisma.internalNote.create({ data: {
      ticketId: ticket("A-open").id, authorId: actor("staff").id, content: privateNote,
    } });
    expect(new Set([...tickets.values()].map((value) => value.currentStatus)).size).toBe(8);
    expect(await prisma.ticket.count({ where: { requesterId: actor("C").id } })).toBe(0);
    for (const [label, expected] of [["A", [5, 1, 11, 6]], ["B", [3, 2, 4, 1]]] as const) {
      const scope = { requesterId: actor(label).id };
      // All recent fixtures are comfortably within six days; old ones exceed
      // ten days. This setup sanity check is not a midnight-boundary test.
      const recent = { gte: hoursAgo(6 * 24), lte: new Date(clock) };
      const observed = await Promise.all([
        prisma.ticket.count({ where: { ...scope, currentStatus: {
          in: ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"],
        } } }),
        prisma.ticket.count({ where: { ...scope, currentStatus: "WAITING_FOR_REQUESTER" } }),
        prisma.ticket.count({ where: { ...scope, updatedAt: recent } }),
        prisma.ticket.count({ where: { ...scope, currentStatus: { in: ["RESOLVED", "CLOSED"] },
          statusHistory: { some: { toStatus: "RESOLVED", createdAt: recent } },
        } }),
      ]);
      safeEqual(observed, [...expected], "Independent database sanity check of the authored fixture counts");
    }
    expect(await prisma.ticketStatusHistory.count({ where: {
      ticketId: ticket("A-resolved-2").id, toStatus: "RESOLVED",
    } })).toBe(2);
  } catch (error) { throw safeFixtureError("setup", error); }
});

async function domainDigest() {
  try {
    const owned = { ticketId: { in: ticketIds } };
    const rows = await Promise.all([
      prisma.user.findMany({ where: { id: { in: userIds } }, orderBy: { id: "asc" } }),
      prisma.category.findMany({ where: { id: { in: categoryIds } }, orderBy: { id: "asc" } }),
      prisma.relatedSystem.findMany({ where: { id: { in: systemIds } }, orderBy: { id: "asc" } }),
      prisma.ticket.findMany({ where: { id: { in: ticketIds } }, orderBy: { id: "asc" } }),
      prisma.ticketStatusHistory.findMany({ where: owned, orderBy: { id: "asc" } }),
      prisma.action.findMany({ where: owned, orderBy: { id: "asc" } }),
      prisma.actionHistory.findMany({ where: { action: owned }, orderBy: { id: "asc" } }),
      prisma.mutationReceipt.findMany({ where: owned, orderBy: { id: "asc" } }),
      prisma.publicComment.findMany({ where: owned, orderBy: { id: "asc" } }),
      prisma.internalNote.findMany({ where: owned, orderBy: { id: "asc" } }),
      prisma.attachment.findMany({ where: owned, orderBy: { id: "asc" } }),
      prisma.seedFixture.findMany({ where: { OR: [
        { userId: { in: userIds } }, { ticketId: { in: ticketIds } },
        { categoryId: { in: categoryIds } }, { relatedSystemId: { in: systemIds } },
      ] }, orderBy: { id: "asc" } }),
      prisma.ticketNumberSequence.findMany({ orderBy: { year: "asc" } }),
    ]);
    // Session lastSeenAt/expiry/revocation and throttle bookkeeping are excluded.
    return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  } catch (error) { throw safeFixtureError("domain observation", error); }
}

async function dashboard(current?: Actor) {
  const before = await domainDigest();
  const startedAt = Date.now();
  try {
    const call = request(app).get("/api/dashboard/requester");
    if (current) call.set("Cookie", current.cookie);
    const response = await call;
    return { response, startedAt, finishedAt: Date.now() };
  } finally {
    expect(await domainDigest() === before,
      "Dashboard read/denial preserves all owned domain rows, times, histories, receipts and numbering; digests withheld").toBe(true);
  }
}

function assertMetadata(body: Record<string, any>, startedAt: number, finishedAt: number) {
  expect(Object.keys(body).sort()).toEqual(["asOf", "drillDown", "filters", "lists", "metrics", "recentWindow", "timezone"]);
  expect(body.timezone).toBe("Asia/Bangkok");
  expect(typeof body.asOf).toBe("string");
  const asOf = new Date(body.asOf);
  expect(Number.isFinite(asOf.getTime())).toBe(true);
  expect(asOf.toISOString()).toBe(body.asOf);
  expect(asOf.getTime()).toBeGreaterThanOrEqual(startedAt);
  expect(asOf.getTime()).toBeLessThanOrEqual(finishedAt);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(asOf);
  const part = (name: string) => Number(parts.find((value) => value.type === name)!.value);
  const expectedFrom = new Date(Date.UTC(part("year"), part("month") - 1, part("day") - 6) - 7 * 60 * 60 * 1000).toISOString();
  const expectedBefore = new Date(Date.UTC(part("year"), part("month") - 1, part("day") + 1) - 7 * 60 * 60 * 1000).toISOString();
  safeEqual(body.recentWindow, { from: expectedFrom, before: expectedBefore },
    "One server-owned Bangkok seven-calendar-day window derived independently from observed asOf");
  expect(body.filters !== null && typeof body.filters === "object" && !Array.isArray(body.filters)).toBe(true);
  // No-filter responses may omit neutral entries or expose normalized empty
  // defaults. Do not invent a choice between those equivalent representations.
  for (const [key, value] of Object.entries(body.filters)) {
    expect(["search", "categoryId", "relatedSystemId", "requestedPriority", "itPriority", "currentStatus"]).toContain(key);
    expect(value === (key === "search" ? "" : null), "No invented effective filter in an unfiltered request").toBe(true);
  }
  expect(Object.keys(body.drillDown).sort()).toEqual(["needsAttention", "outstanding", "recentResolved", "recentUpdated"]);
  const allowedQuery = ["search", "categoryId", "relatedSystemId", "requestedPriority", "itPriority", "currentStatus",
    "statusGroup", "updatedFrom", "updatedBefore", "resolvedFrom", "resolvedBefore", "sortBy", "sortOrder", "page", "pageSize", "dashboardWidget"];
  for (const value of Object.values(body.drillDown) as Array<Record<string, any>>) {
    expect(Object.keys(value).sort()).toEqual(["path", "query"]);
    expect(value.path).toBe("/api/tickets");
    expect(value.query !== null && typeof value.query === "object" && !Array.isArray(value.query)).toBe(true);
    for (const key of Object.keys(value.query)) expect(allowedQuery).toContain(key);
  }
  expect(body.drillDown.outstanding.query.statusGroup).toBe("outstanding");
  const attention = body.drillDown.needsAttention.query;
  expect(attention.dashboardWidget === "attention" || attention.currentStatus === "WAITING_FOR_REQUESTER").toBe(true);
  expect(body.drillDown.recentUpdated.query).toMatchObject({
    updatedFrom: expectedFrom, updatedBefore: expectedBefore, sortBy: "updatedAt", sortOrder: "desc",
  });
  expect(body.drillDown.recentResolved.query).toMatchObject({
    resolvedFrom: expectedFrom, resolvedBefore: expectedBefore, sortBy: "resolvedAt", sortOrder: "desc",
  });
  const resolved = body.drillDown.recentResolved.query;
  expect(resolved.statusGroup === "resolved" || resolved.dashboardWidget === "recentResolved").toBe(true);
  // Metadata only: target-list execution/equivalence is a later T-28 batch.
}

function assertRows(actual: Array<Record<string, any>>, expectedLabels: string[], resolved: boolean) {
  expect(Array.isArray(actual)).toBe(true);
  expect(actual.length).toBeLessThanOrEqual(5);
  expect(actual.map((row) => row.id)).toEqual(expectedLabels.map((label) => ticket(label).id));
  actual.forEach((row, index) => {
    const value = ticket(expectedLabels[index]!);
    const required = ["id", "ticketNumber", "summary", "currentStatus", "requestedPriority", "itPriority", "owner", "updatedAt"];
    expect(required.every((key) => Object.hasOwn(row, key))).toBe(true);
    expect(Object.keys(row).every((key) => [...required, "resolvedAt"].includes(key))).toBe(true);
    safeEqual(Object.fromEntries(required.filter((key) => key !== "owner").map((key) => [key, row[key]])), {
      id: value.id, ticketNumber: value.ticketNumber, summary: value.summary, currentStatus: value.currentStatus,
      requestedPriority: value.requestedPriority, itPriority: value.itPriority, updatedAt: value.updatedAt.toISOString(),
    }, "Exact independently observed owned row, UTC time and literal summary");
    if (value.ownerId === null) expect(row.owner).toBeNull();
    else {
      expect(Object.keys(row.owner).every((key) => ["id", "name", "role"].includes(key))).toBe(true);
      expect(row.owner.id).toBe(actor("staff").id);
      expect(row.owner.name).toBe(actor("staff").name);
      if (Object.hasOwn(row.owner, "role")) expect(row.owner.role).toBe("IT_STAFF");
    }
    if (resolved) expect(row.resolvedAt).toBe(resolutionTimes.get(value.id)!.toISOString());
    else if (Object.hasOwn(row, "resolvedAt")) {
      expect(row.resolvedAt).toBe(resolutionTimes.get(value.id)?.toISOString() ?? null);
    }
  });
}

function assertSuccess(observed: Awaited<ReturnType<typeof dashboard>>, metrics: object, updated: string[], resolved: string[]) {
  const { response, startedAt, finishedAt } = observed;
  expect(response.status).toBe(200);
  expect(response.headers["content-type"]).toMatch(/application\/json/u);
  assertMetadata(response.body, startedAt, finishedAt);
  safeEqual(response.body.metrics, metrics, "Exactly four explicitly expected, independently scoped metrics");
  expect(Object.keys(response.body.lists).sort()).toEqual(["recentResolved", "recentUpdated"]);
  assertRows(response.body.lists.recentUpdated, updated, false);
  assertRows(response.body.lists.recentResolved, resolved, true);
  const serialized = JSON.stringify(response.body);
  expect(serialized.includes(privateNote) || serialized.includes("private Ticket body")).toBe(false);
  expect(/passwordHash|tokenHash|csrfTokenHash|inputFingerprint|safeResponse|internalNotes|storageKey|"email"/u.test(serialized),
    "Dashboard exposes no private User/session/receipt/Notes/storage fields").toBe(false);
}

function assertDenial(response: request.Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers["content-type"]).toMatch(/application\/json/u);
  expect(Object.keys(response.body)).toEqual(["error"]);
  expect(Object.keys(response.body.error).every((key) => ["code", "message", "fields", "requestId"].includes(key))).toBe(true);
  expect(response.body.error.code).toBe(code);
  expect(typeof response.body.error.message).toBe("string");
  expect(response.body.error.message.length).toBeGreaterThan(0);
  expect(/passwordHash|tokenHash|csrfTokenHash|inputFingerprint|safeResponse|internalNotes|PrismaClient|stack/u.test(JSON.stringify(response.body))).toBe(false);
}

describe("API-08 Requester Dashboard: first ownership/authentication/empty RED batch", () => {
  it("Requester A receives only owned metrics and five-item recent lists in independent time/id orders", async () => {
    assertSuccess(await dashboard(actor("A")), {
      outstanding: 5, needsAttention: 1, recentUpdated: 11, recentResolved: 6,
    }, ["A-closed-2", "A-resolved-2", "A-closed-3", "A-resolved-3", "A-closed-1"],
    ["A-closed-3", "A-resolved-3", "A-closed-2", "A-resolved-2", "A-closed-1"]);
  });

  it("Requester B independently receives different owned counts and recent rows", async () => {
    assertSuccess(await dashboard(actor("B")), {
      outstanding: 3, needsAttention: 2, recentUpdated: 4, recentResolved: 1,
    }, ["B-resolved", "B-waiting-2", "B-waiting-1", "B-open"], ["B-resolved"]);
  });

  it("Requester C with no Tickets receives genuine zero metrics, empty lists and valid metadata", async () => {
    assertSuccess(await dashboard(actor("C")), {
      outstanding: 0, needsAttention: 0, recentUpdated: 0, recentResolved: 0,
    }, [], []);
  });

  it("missing session receives safe 401 AUTHENTICATION_REQUIRED", async () => {
    assertDenial((await dashboard()).response, 401, "AUTHENTICATION_REQUIRED");
  });

  it("IT_STAFF receives inherited safe 403 ROLE_FORBIDDEN", async () => {
    assertDenial((await dashboard(actor("staff"))).response, 403, "ROLE_FORBIDDEN");
  });

  it("ADMINISTRATOR receives inherited safe 403 ROLE_FORBIDDEN", async () => {
    assertDenial((await dashboard(actor("admin"))).response, 403, "ROLE_FORBIDDEN");
  });
});

afterAll(async () => {
  try {
    if (!verifiedTarget) return; // No fixtures were written before guard success.
    const owned = { ticketId: { in: ticketIds } };
    await prisma.$transaction([
      prisma.seedFixture.deleteMany({ where: { OR: [
        { userId: { in: userIds } }, { ticketId: { in: ticketIds } },
        { categoryId: { in: categoryIds } }, { relatedSystemId: { in: systemIds } },
      ] } }),
      prisma.mutationReceipt.deleteMany({ where: owned }),
      prisma.actionHistory.deleteMany({ where: { action: owned } }),
      prisma.action.deleteMany({ where: owned }),
      prisma.ticketStatusHistory.deleteMany({ where: owned }),
      prisma.publicComment.deleteMany({ where: owned }),
      prisma.internalNote.deleteMany({ where: owned }),
      prisma.attachment.deleteMany({ where: owned }),
      prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } }),
      prisma.authSession.deleteMany({ where: { userId: { in: userIds } } }),
      prisma.user.deleteMany({ where: { id: { in: userIds } } }),
      prisma.category.deleteMany({ where: { id: { in: categoryIds } } }),
      prisma.relatedSystem.deleteMany({ where: { id: { in: systemIds } } }),
    ]);
    const remaining = await Promise.all([
      prisma.user.count({ where: { id: { in: userIds } } }),
      prisma.authSession.count({ where: { userId: { in: userIds } } }),
      prisma.ticket.count({ where: { id: { in: ticketIds } } }),
      prisma.ticketStatusHistory.count({ where: owned }),
      prisma.action.count({ where: owned }),
      prisma.actionHistory.count({ where: { action: owned } }),
      prisma.mutationReceipt.count({ where: owned }),
      prisma.internalNote.count({ where: owned }),
      prisma.publicComment.count({ where: owned }),
      prisma.attachment.count({ where: owned }),
      prisma.category.count({ where: { id: { in: categoryIds } } }),
      prisma.relatedSystem.count({ where: { id: { in: systemIds } } }),
    ]);
    expect(remaining).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    console.info("Issue47 Dashboard cleanup verified: zero owned identities/sessions/domain/reference rows; no fault resources created.");
  } catch (error) { throw safeFixtureError("cleanup", error); }
  finally { await prisma.$disconnect(); }
});

// Additional AC-24/T-24 and AC-27/T-27 resolution-history verification.
// Each case owns a new Requester and bounded Ticket cohort. These constructed
// read fixtures do not execute workflow transitions or prove snapshot races.
type ResolutionCohort = {
  requester: Actor;
  ids: number[];
  rows: Map<string, Ticket>;
  clock: number;
};
type ResolutionStep = readonly [TicketStatus, TicketStatus, number];

async function withResolutionCohort(run: (cohort: ResolutionCohort) => Promise<void>) {
  const ownedUsers: number[] = [];
  const ownedTickets: number[] = [];
  let isolated = false;
  try {
    const identity = configureTestDatabaseEnvironment();
    const operational = process.env.TOKTICKIT_DEVELOPMENT_DATABASE_URL;
    expect(Boolean(operational) &&
      decodeURIComponent(new URL(operational!).pathname.slice(1)) !== identity.databaseName,
    "Resolution fixture uses the dedicated database; values withheld").toBe(true);
    const [live] = await prisma.$queryRaw<Array<{ database: string; schema: string }>>`
      SELECT current_database() AS database, current_schema() AS schema`;
    expect(live.database === identity.databaseName && live.schema === identity.schema,
      "Resolution fixture live identity matches the repository guard; values withheld").toBe(true);
    isolated = true;

    const { user, password } = await createAuthUser({
      email: `${marker}-history-${randomUUID()}@example.test`, role: "REQUESTER",
    });
    ownedUsers.push(user.id);
    const login = await loginRequest(user.email, password);
    expect(login.status, "Real resolution-cohort login; sensitive response withheld").toBe(200);
    const [observed] = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT CURRENT_TIMESTAMP AS now`;
    await run({
      requester: { id: user.id, name: user.name, role: user.role,
        cookie: cookieHeader(login.headers["set-cookie"]) },
      ids: ownedTickets, rows: new Map(), clock: observed.now.getTime(),
    });
  } finally {
    if (isolated) {
      try {
        const owned = { ticketId: { in: ownedTickets } };
        await prisma.$transaction([
          prisma.seedFixture.deleteMany({ where: { OR: [
            { userId: { in: ownedUsers } }, { ticketId: { in: ownedTickets } },
          ] } }),
          prisma.mutationReceipt.deleteMany({ where: owned }),
          prisma.actionHistory.deleteMany({ where: { action: owned } }),
          prisma.action.deleteMany({ where: owned }),
          prisma.ticketStatusHistory.deleteMany({ where: owned }),
          prisma.publicComment.deleteMany({ where: owned }),
          prisma.internalNote.deleteMany({ where: owned }),
          prisma.attachment.deleteMany({ where: owned }),
          prisma.ticket.deleteMany({ where: { id: { in: ownedTickets } } }),
          prisma.authSession.deleteMany({ where: { userId: { in: ownedUsers } } }),
          prisma.user.deleteMany({ where: { id: { in: ownedUsers } } }),
        ]);
        const remaining = await Promise.all([
          prisma.user.count({ where: { id: { in: ownedUsers } } }),
          prisma.authSession.count({ where: { userId: { in: ownedUsers } } }),
          prisma.ticket.count({ where: { id: { in: ownedTickets } } }),
          prisma.ticketStatusHistory.count({ where: owned }),
          prisma.action.count({ where: owned }),
          prisma.actionHistory.count({ where: { action: owned } }),
          prisma.mutationReceipt.count({ where: owned }),
          prisma.publicComment.count({ where: owned }),
          prisma.internalNote.count({ where: owned }),
          prisma.attachment.count({ where: owned }),
          prisma.seedFixture.count({ where: { OR: [
            { userId: { in: ownedUsers } }, { ticketId: { in: ownedTickets } },
          ] } }),
        ]);
        expect(remaining).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        console.info("Issue47 resolution cohort cleanup verified: zero owned rows/sessions; shared client disconnects in the existing final hook.");
      } catch (error) { throw safeFixtureError("resolution cohort cleanup", error); }
    }
  }
}

function resolutionTime(cohort: ResolutionCohort, hours: number) {
  return new Date(cohort.clock - hours * 60 * 60 * 1000);
}

async function addResolutionTicket(
  cohort: ResolutionCohort, label: string, currentStatus: TicketStatus,
  updatedHours: number, events: readonly ResolutionStep[],
) {
  try {
    const value = await prisma.ticket.create({ data: {
      ticketNumber: `D47-${randomUUID().replaceAll("-", "").slice(0, 12)}`,
      clientSubmissionId: randomUUID(), requesterId: cohort.requester.id,
      categoryId: categoryIds[0]!, relatedSystemId: systemIds[0]!,
      ownerId: label === "closed-no-history" ? null : actor("staff").id,
      summary: `${label} <script>literal resolution summary</script>`,
      description: `${marker} private resolution-cohort Ticket body`,
      currentStatus, requestedPriority: "HIGH", itPriority: "MEDIUM",
      ticketDate: resolutionTime(cohort, 20 * 24), createdAt: resolutionTime(cohort, 20 * 24),
      updatedAt: resolutionTime(cohort, updatedHours),
    } });
    cohort.ids.push(value.id); // Ledger before any dependent insert can fail.
    cohort.rows.set(label, value);
    if (events.length) await prisma.ticketStatusHistory.createMany({ data: events.map(([fromStatus, toStatus, hours]) => ({
      ticketId: value.id, actorId: actor("staff").id, fromStatus, toStatus,
      createdAt: resolutionTime(cohort, hours),
      reason: toStatus === "CANCELLED" ? "Cancel synthetic resolution read fixture" : null,
    })) });
  } catch (error) { throw safeFixtureError("resolution Ticket setup", error); }
}

async function resolutionDomainDigest(cohort: ResolutionCohort) {
  try {
    const owned = { ticketId: { in: cohort.ids } };
    const rows = await Promise.all([
      domainDigest(), // Also preserve the original cohort, references and numbering.
      prisma.user.findMany({ where: { id: cohort.requester.id }, orderBy: { id: "asc" } }),
      prisma.ticket.findMany({ where: { id: { in: cohort.ids } }, orderBy: { id: "asc" } }),
      prisma.ticketStatusHistory.findMany({ where: owned, orderBy: { id: "asc" } }),
      prisma.action.findMany({ where: owned, orderBy: { id: "asc" } }),
      prisma.actionHistory.findMany({ where: { action: owned }, orderBy: { id: "asc" } }),
      prisma.mutationReceipt.findMany({ where: owned, orderBy: { id: "asc" } }),
      prisma.publicComment.findMany({ where: owned, orderBy: { id: "asc" } }),
      prisma.internalNote.findMany({ where: owned, orderBy: { id: "asc" } }),
      prisma.attachment.findMany({ where: owned, orderBy: { id: "asc" } }),
      prisma.seedFixture.findMany({ where: { OR: [
        { userId: cohort.requester.id }, { ticketId: { in: cohort.ids } },
      ] }, orderBy: { id: "asc" } }),
    ]);
    // AuthSession bookkeeping is deliberately outside the domain comparison.
    return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  } catch (error) { throw safeFixtureError("resolution domain observation", error); }
}

function assertResolutionRows(
  actual: Array<Record<string, any>>, cohort: ResolutionCohort,
  labels: readonly string[], resolved: readonly number[] | null,
) {
  expect(Array.isArray(actual)).toBe(true);
  expect(actual.length).toBeLessThanOrEqual(5);
  expect(actual.map((row) => row.id)).toEqual(labels.map((label) => cohort.rows.get(label)!.id));
  actual.forEach((row, index) => {
    const value = cohort.rows.get(labels[index]!)!;
    const keys = ["id", "ticketNumber", "summary", "currentStatus", "requestedPriority", "itPriority", "owner", "updatedAt"];
    expect(keys.every((key) => Object.hasOwn(row, key))).toBe(true);
    expect(Object.keys(row).every((key) => [...keys, "resolvedAt"].includes(key))).toBe(true);
    safeEqual(Object.fromEntries(keys.filter((key) => key !== "owner").map((key) => [key, row[key]])), {
      id: value.id, ticketNumber: value.ticketNumber, summary: value.summary,
      currentStatus: value.currentStatus, requestedPriority: "HIGH", itPriority: "MEDIUM",
      updatedAt: value.updatedAt.toISOString(),
    }, "Safe observed resolution row preserves literal content and UTC timestamp");
    if (value.ownerId === null) expect(row.owner).toBeNull();
    else {
      expect(Object.keys(row.owner).every((key) => ["id", "name", "role"].includes(key))).toBe(true);
      expect(row.owner.id).toBe(actor("staff").id);
      expect(row.owner.name).toBe(actor("staff").name);
      if (Object.hasOwn(row.owner, "role")) expect(row.owner.role).toBe("IT_STAFF");
    }
    if (resolved !== null) expect(row.resolvedAt).toBe(resolutionTime(cohort, resolved[index]!).toISOString());
  });
}

async function assertResolutionDashboard(
  cohort: ResolutionCohort, metrics: object, updated: readonly string[],
  resolved: readonly string[], resolutionHours: readonly number[],
) {
  const before = await resolutionDomainDigest(cohort);
  const earlierHistory = await prisma.ticketStatusHistory.findMany({
    where: { ticketId: { in: cohort.ids } }, orderBy: { id: "asc" },
  });
  const startedAt = Date.now();
  try {
    const response = await request(app).get("/api/dashboard/requester").set("Cookie", cohort.requester.cookie);
    const finishedAt = Date.now();
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/u);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    assertMetadata(response.body, startedAt, finishedAt);
    safeEqual(response.body.metrics, metrics, "Independently authored, isolated distinct-Ticket metrics");
    expect(Object.keys(response.body.lists).sort()).toEqual(["recentResolved", "recentUpdated"]);
    assertResolutionRows(response.body.lists.recentUpdated, cohort, updated, null);
    assertResolutionRows(response.body.lists.recentResolved, cohort, resolved, resolutionHours);
    expect(/passwordHash|tokenHash|csrfTokenHash|inputFingerprint|safeResponse|internalNotes|storageKey|"email"|"description"/u
      .test(JSON.stringify(response.body)), "No private/receipt/body fields in the resolution response").toBe(false);
  } finally {
    expect(await resolutionDomainDigest(cohort) === before,
      "Resolution read preserves all owned domain state and earlier records; sensitive digests withheld").toBe(true);
    safeEqual(await prisma.ticketStatusHistory.findMany({
      where: { ticketId: { in: cohort.ids } }, orderBy: { id: "asc" },
    }), earlierHistory, "Every earlier history row, including null reasons, remains unchanged");
  }
}

describe("API-08 actual resolution history: partial AC-24/T-24 and AC-27/T-27", () => {
  it("excludes current RESOLVED without history despite recent updatedAt", async () => {
    await withResolutionCohort(async (cohort) => {
      await addResolutionTicket(cohort, "resolved-no-history", "RESOLVED", 6, []);
      await assertResolutionDashboard(cohort, {
        outstanding: 0, needsAttention: 0, recentUpdated: 1, recentResolved: 0,
      }, ["resolved-no-history"], [], []);
    });
  });

  it("excludes current CLOSED without history despite recent updatedAt", async () => {
    await withResolutionCohort(async (cohort) => {
      await addResolutionTicket(cohort, "closed-no-history", "CLOSED", 6, []);
      await assertResolutionDashboard(cohort, {
        outstanding: 0, needsAttention: 0, recentUpdated: 1, recentResolved: 0,
      }, ["closed-no-history"], [], []);
    });
  });

  it("counts repeated qualifying resolutions once and displays the latest event", async () => {
    await withResolutionCohort(async (cohort) => {
      await addResolutionTicket(cohort, "resolved-twice", "RESOLVED", 24, [
        ["NEW", "OPEN", 19 * 24], ["OPEN", "RESOLVED", 72],
        ["RESOLVED", "REOPENED", 60], ["REOPENED", "IN_PROGRESS", 48],
        ["IN_PROGRESS", "RESOLVED", 24],
      ]);
      expect(await prisma.ticketStatusHistory.count({ where: {
        ticketId: { in: cohort.ids }, toStatus: "RESOLVED",
      } })).toBe(2);
      await assertResolutionDashboard(cohort, {
        outstanding: 0, needsAttention: 0, recentUpdated: 1, recentResolved: 1,
      }, ["resolved-twice"], ["resolved-twice"], [24]);
    });
  });

  it("excludes a currently REOPENED Ticket with a recent resolution", async () => {
    await withResolutionCohort(async (cohort) => {
      await addResolutionTicket(cohort, "now-reopened", "REOPENED", 24, [
        ["NEW", "OPEN", 19 * 24], ["OPEN", "RESOLVED", 48], ["RESOLVED", "REOPENED", 24],
      ]);
      await assertResolutionDashboard(cohort, {
        outstanding: 1, needsAttention: 0, recentUpdated: 1, recentResolved: 0,
      }, ["now-reopened"], [], []);
    });
  });

  it("excludes current CANCELLED after legitimate resolution/reopening history", async () => {
    await withResolutionCohort(async (cohort) => {
      await addResolutionTicket(cohort, "now-cancelled", "CANCELLED", 24, [
        ["NEW", "OPEN", 19 * 24], ["OPEN", "RESOLVED", 72],
        ["RESOLVED", "REOPENED", 48], ["REOPENED", "CANCELLED", 24],
      ]);
      await assertResolutionDashboard(cohort, {
        outstanding: 0, needsAttention: 0, recentUpdated: 1, recentResolved: 0,
      }, ["now-cancelled"], [], []);
    });
  });

  it("uses actual resolution time for CLOSED rather than newer closure/update time", async () => {
    await withResolutionCohort(async (cohort) => {
      await addResolutionTicket(cohort, "closed-later", "CLOSED", 6, [
        ["NEW", "OPEN", 19 * 24], ["OPEN", "RESOLVED", 48], ["RESOLVED", "CLOSED", 6],
      ]);
      await assertResolutionDashboard(cohort, {
        outstanding: 0, needsAttention: 0, recentUpdated: 1, recentResolved: 1,
      }, ["closed-later"], ["closed-later"], [48]);
    });
  });

  it("keeps recent updates distinct from an old out-of-window resolution", async () => {
    await withResolutionCohort(async (cohort) => {
      await addResolutionTicket(cohort, "old-resolution-new-update", "RESOLVED", 6, [
        ["NEW", "OPEN", 19 * 24], ["OPEN", "RESOLVED", 10 * 24],
      ]);
      await assertResolutionDashboard(cohort, {
        outstanding: 0, needsAttention: 0, recentUpdated: 1, recentResolved: 0,
      }, ["old-resolution-new-update"], [], []);
    });
  });

  it("counts all seven distinct Tickets but bounds tied resolution ordering to five", async () => {
    await withResolutionCohort(async (cohort) => {
      for (const [label, resolutionHours] of [
        ["old-tie-1", 72], ["new-tie-1", 24], ["middle-tie-1", 48],
        ["new-tie-2", 24], ["new-tie-3", 24], ["middle-tie-2", 48], ["old-tie-2", 72],
      ] as const) {
        await addResolutionTicket(cohort, label, "RESOLVED", 6, [
          ["NEW", "OPEN", 19 * 24], ["OPEN", "RESOLVED", resolutionHours],
        ]);
      }
      await assertResolutionDashboard(cohort, {
        outstanding: 0, needsAttention: 0, recentUpdated: 7, recentResolved: 7,
      }, ["old-tie-2", "middle-tie-2", "new-tie-3", "new-tie-2", "middle-tie-1"],
      ["new-tie-3", "new-tie-2", "new-tie-1", "middle-tie-2", "middle-tie-1"], [24, 24, 24, 48, 48]);
    });
  });
});

// Partial AC-28/T-28: the Dashboard boundary rejects actor/policy overrides,
// repeated values and invalid base filters without altering any domain state.
describe("API-08 Dashboard query rejection", () => {
  it.each([
    { label: "owner selector", field: "owner", entries: [["owner", "me"]] },
    { label: "requester selector", field: "requesterId", entries: [["requesterId", "1"]] },
    { label: "client asOf", field: "asOf", entries: [["asOf", "2026-10-01T00:00:00.000Z"]] },
    { label: "client timezone", field: "timezone", entries: [["timezone", "UTC"]] },
    { label: "repeated search", field: "search", entries: [["search", "first"], ["search", "second"]] },
    { label: "repeated category", field: "categoryId", entries: [["categoryId", "1"], ["categoryId", "2"]] },
    { label: "zero category", field: "categoryId", entries: [["categoryId", "0"]] },
    { label: "out-of-range related system", field: "relatedSystemId", entries: [["relatedSystemId", "2147483648"]] },
    { label: "invalid requested priority", field: "requestedPriority", entries: [["requestedPriority", "CRITICAL"]] },
    { label: "invalid IT priority", field: "itPriority", entries: [["itPriority", "CRITICAL"]] },
    { label: "invalid status", field: "currentStatus", entries: [["currentStatus", "PLANNED"]] },
    { label: "search over 100 characters", field: "search", entries: [["search", "x".repeat(101)]] },
  ])("rejects $label safely and preserves domain rows", async ({ field, entries }) => {
    const before = await domainDigest();
    try {
      const query = new URLSearchParams(entries).toString();
      const response = await request(app).get(`/api/dashboard/requester?${query}`).set("Cookie", actor("A").cookie);
      assertDenial(response, 400, "INVALID_QUERY");
      expect(Object.hasOwn(response.body.error.fields, field)).toBe(true);
      expect(typeof response.body.error.fields[field]).toBe("string");
      expect(response.body.error.fields[field].trim().length).toBeGreaterThan(0);
    } finally {
      expect(await domainDigest() === before,
        "Invalid Dashboard query preserves exact domain state; sensitive digests withheld").toBe(true);
    }
  });
});

// Partial AC-27/T-27: controlled-clock SQL boundaries through real HTTP and
// real PostgreSQL business queries. Authentication clocks remain real. Future
// events below are defensive read fixtures, not legitimate workflow evidence.
const sqlBoundaryContexts = [
  {
    label: "Bangkok midday", asOf: "2026-06-15T05:00:00.000Z",
    from: "2026-06-08T17:00:00.000Z", before: "2026-06-15T17:00:00.000Z",
    positions: [
      ["from-minus", "2026-06-08T16:59:59.999Z"], ["from", "2026-06-08T17:00:00.000Z"],
      ["asof-minus", "2026-06-15T04:59:59.999Z"], ["asof", "2026-06-15T05:00:00.000Z"],
      ["asof-plus", "2026-06-15T05:00:00.001Z"], ["before-minus", "2026-06-15T16:59:59.999Z"],
      ["before", "2026-06-15T17:00:00.000Z"],
    ],
    updated: ["asof", "asof-minus", "from"],
    resolved: ["asof", "future-repeat", "asof-minus", "from"],
    retainedResolution: "2026-06-15T04:59:59.999Z",
  },
  {
    label: "final millisecond before Bangkok midnight", asOf: "2026-06-15T16:59:59.999Z",
    from: "2026-06-08T17:00:00.000Z", before: "2026-06-15T17:00:00.000Z",
    positions: [
      ["from-minus", "2026-06-08T16:59:59.999Z"], ["from", "2026-06-08T17:00:00.000Z"],
      ["asof-minus", "2026-06-15T16:59:59.998Z"], ["asof", "2026-06-15T16:59:59.999Z"],
      ["asof-plus", "2026-06-15T17:00:00.000Z"], ["before-minus", "2026-06-15T16:59:59.999Z"],
      ["before", "2026-06-15T17:00:00.000Z"],
    ],
    updated: ["before-minus", "asof", "asof-minus", "from"],
    resolved: ["before-minus", "asof", "future-repeat", "asof-minus", "from"],
    retainedResolution: "2026-06-15T16:59:59.998Z",
  },
] as const;

type SqlBoundaryContext = (typeof sqlBoundaryContexts)[number];
async function addBoundaryTicket(
  cohort: ResolutionCohort, label: string, instant: string, resolved: boolean,
  context: SqlBoundaryContext, foreign = false,
) {
  const value = await prisma.ticket.create({ data: {
    ticketNumber: `D47-${randomUUID().replaceAll("-", "").slice(0, 12)}`,
    clientSubmissionId: randomUUID(), requesterId: foreign ? actor("B").id : cohort.requester.id,
    categoryId: categoryIds[0]!, relatedSystemId: systemIds[0]!, ownerId: actor("staff").id,
    summary: `${label} <script>literal SQL boundary</script>`, description: `${marker} private boundary body`,
    requestedPriority: "HIGH", itPriority: "MEDIUM", currentStatus: resolved ? "RESOLVED" : "OPEN",
    ticketDate: new Date("2026-05-01T00:00:00.000Z"), createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date(instant),
  } });
  cohort.ids.push(value.id); cohort.rows.set(label, value);
  const history: Array<{ fromStatus: TicketStatus; toStatus: TicketStatus; createdAt: Date }> = [
    { fromStatus: "NEW", toStatus: "OPEN", createdAt: new Date("2026-05-02T00:00:00.000Z") },
  ];
  if (resolved && label === "future-repeat") {
    history.push(
      { fromStatus: "OPEN", toStatus: "RESOLVED", createdAt: new Date(context.retainedResolution) },
      { fromStatus: "RESOLVED", toStatus: "REOPENED", createdAt: new Date(context.asOf) },
      { fromStatus: "REOPENED", toStatus: "RESOLVED", createdAt: new Date(instant) },
    );
  } else if (resolved) history.push({ fromStatus: "OPEN", toStatus: "RESOLVED", createdAt: new Date(instant) });
  await prisma.ticketStatusHistory.createMany({ data: history.map((event) => ({
    ...event, ticketId: value.id, actorId: actor("staff").id, reason: null,
  })) });
}

describe("Controlled-clock actual SQL: [from,before) and inclusive asOf", () => {
  for (const context of sqlBoundaryContexts) {
    it.each(["dashboardUpdated", "dashboardResolved", "listUpdated", "listResolved"] as const)(
      `${context.label}: %s`, async (surface) => {
        const { withDashboardReadProbe } = await import("./dashboard-snapshot-test-helpers.js");
        await withResolutionCohort(async (cohort) => {
          const resolved = surface === "dashboardResolved" || surface === "listResolved";
          for (const [label, instant] of context.positions) {
            await addBoundaryTicket(cohort, label, instant, resolved, context);
          }
          if (resolved) {
            const future = context.positions.find(([label]) => label === "asof-plus")![1];
            await addBoundaryTicket(cohort, "future-repeat", future, true, context);
          }
          await addBoundaryTicket(cohort, "foreign-boundary", context.asOf, resolved, context, true);
          const before = await resolutionDomainDigest(cohort);
          const labels = resolved ? context.resolved : context.updated;
          const expectedTimes = new Map<string, string>(context.positions);
          expectedTimes.set("future-repeat", context.retainedResolution);
          try {
            await withDashboardReadProbe({ clock: new Date(context.asOf) }, async (probe) => {
              const dashboardSurface = surface.startsWith("dashboard");
              const params = new URLSearchParams();
              if (!dashboardSurface) {
                params.set(resolved ? "resolvedFrom" : "updatedFrom", context.from);
                params.set(resolved ? "resolvedBefore" : "updatedBefore", context.before);
                params.set("sortBy", resolved ? "resolvedAt" : "updatedAt"); params.set("sortOrder", "desc");
              }
              const response = await probe.track(request(app)
                .get(`${dashboardSurface ? "/api/dashboard/requester" : "/api/tickets"}?${params.toString()}`)
                .set("Cookie", cohort.requester.cookie).then((value) => value));
              expect(response.status).toBe(200);
              expect(response.headers["cache-control"]).toBe("private, no-store");
              let actual: Array<Record<string, any>>;
              if (dashboardSurface) {
                expect(response.body.asOf).toBe(context.asOf);
                expect(response.body.timezone).toBe("Asia/Bangkok");
                expect(response.body.recentWindow).toEqual({ from: context.from, before: context.before });
                expect(response.body.metrics).toEqual({
                  outstanding: resolved ? 0 : 7, needsAttention: 0,
                  recentUpdated: context.updated.length, recentResolved: resolved ? context.resolved.length : 0,
                });
                actual = response.body.lists[resolved ? "recentResolved" : "recentUpdated"];
              } else {
                expect(response.body.pagination).toEqual({ page: 1, pageSize: 10, totalItems: labels.length,
                  totalPages: 1, hasPreviousPage: false, hasNextPage: false });
                actual = response.body.items;
              }
              expect(actual.map((row) => row.id)).toEqual(labels.map((label) => cohort.rows.get(label)!.id));
              expect(new Set(actual.map((row) => row.id)).size).toBe(labels.length);
              for (const [index, row] of actual.entries()) {
                const label = labels[index]!; const ticket = cohort.rows.get(label)!;
                expect(row.summary).toBe(ticket.summary); expect(row.updatedAt).toBe(ticket.updatedAt.toISOString());
                expect(row.currentStatus).toBe(resolved ? "RESOLVED" : "OPEN");
                expect(Object.keys(row.owner).every((key) => ["id", "name", "role"].includes(key))).toBe(true);
                expect(row.owner.id).toBe(actor("staff").id); expect(row.owner.name).toBe(actor("staff").name);
                if (resolved) expect(row.resolvedAt).toBe(expectedTimes.get(label));
                if (dashboardSurface) {
                  expect(Object.keys(row).every((key) => ["id", "ticketNumber", "summary", "currentStatus",
                    "requestedPriority", "itPriority", "owner", "updatedAt", "resolvedAt"].includes(key))).toBe(true);
                } else {
                  expect(row.requester.id).toBe(cohort.requester.id);
                  expect(Object.keys(row.requester).sort()).toEqual(["id", "name"]);
                }
              }
              expect(/passwordHash|tokenHash|csrfTokenHash|inputFingerprint|safeResponse|internalNotes|storageKey|"description"|"email"/u
                .test(JSON.stringify(response.body))).toBe(false);
              expect(probe.evidence.transactions).toBe(1); expect(probe.evidence.clockReads).toBe(1);
              expect(probe.evidence.clockOverrides).toBe(1); expect(probe.evidence.countCompleted).toBe(true);
              expect(probe.evidence.reads.length).toBeGreaterThan(1);
              for (const read of probe.evidence.reads) {
                expect(read.isolation).toBe("repeatable read"); expect(read.readOnly).toBe("on");
              }
              expect(new Set(probe.evidence.reads.map((read) => read.pid)).size).toBe(1);
              console.info(`Controlled-clock SQL boundary verified: ${context.label}; ${surface}; actual business SQL; one clock substitution.`);
            });
          } finally {
            expect(await resolutionDomainDigest(cohort) === before,
              "Controlled-clock HTTP read preserves all domain/history/receipt state; sensitive digests withheld").toBe(true);
          }
        });
      },
    );
  }
});
