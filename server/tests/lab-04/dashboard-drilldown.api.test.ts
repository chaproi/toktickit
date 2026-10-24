import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { Ticket, TicketStatus } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { configureTestDatabaseEnvironment } from "../../src/testing/test-database.js";
import { cookieHeader, createAuthUser, loginRequest } from "../lab-03/auth-test-helpers.js";

// Partial AC-27/T-27 and AC-28/T-28. Real authenticated HTTP/database reads
// follow actual descriptors against unchanged fixtures. Each HTTP request has
// a fresh snapshot; no retained Dashboard snapshot or writer coordination is claimed.
const prisma = getPrisma();
const marker = `issue47-drilldown-${randomUUID()}`;
const searchText = "dashboard & literal + cohort";
const userIds: number[] = [];
const ticketIds: number[] = [];
const categoryIds: number[] = [];
const systemIds: number[] = [];
const rows = new Map<string, Ticket>();
const resolutionHours = new Map<string, number>();
let requesterId: number;
let foreignId: number;
let staffId: number;
let staffName: string;
let cookie: string;
let clock: number;
let guarded = false;

function safeEqual(actual: unknown, expected: unknown, label: string) {
  expect(isDeepStrictEqual(actual, expected), `${label}; sensitive values redacted`).toBe(true);
}

function fixtureError(stage: string, error: unknown) {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  const safeCode = typeof code === "string" && /^(P\d{4}|[0-9A-Z]{5})$/u.test(code) ? code : "unclassified";
  return new Error(`Dashboard drill-down ${stage} failed (${safeCode}); details withheld.`);
}

function at(hours: number) { return new Date(clock - hours * 3_600_000); }
function ids(labels: readonly string[]) {
  return labels.map((label) => {
    const row = rows.get(label);
    if (!row) throw new Error("Expected owned drill-down fixture is missing.");
    return row.id;
  });
}

async function addUser(label: string, role: "REQUESTER" | "IT_STAFF") {
  const value = await createAuthUser({ email: `${marker}-${label}@example.test`, role });
  userIds.push(value.user.id); // Track before any dependent work or authentication.
  return value;
}

type Mismatch = "search" | "category" | "system" | "requested" | "it";
async function addTicket(
  label: string, status: TicketStatus, updatedHours: number,
  options: { resolution?: number; mismatch?: Mismatch; foreign?: boolean; repeatedResolution?: boolean } = {},
) {
  const ticket = await prisma.ticket.create({ data: {
    ticketNumber: `D47D-${randomUUID().replaceAll("-", "").slice(0, 12)}`,
    clientSubmissionId: randomUUID(), requesterId: options.foreign ? foreignId : requesterId,
    categoryId: categoryIds[options.mismatch === "category" ? 1 : 0]!,
    relatedSystemId: systemIds[options.mismatch === "system" ? 1 : 0]!,
    requestedPriority: options.mismatch === "requested" ? "LOW" : "HIGH",
    itPriority: options.mismatch === "it" ? "URGENT" : "MEDIUM",
    ownerId: status === "NEW" ? null : staffId,
    summary: `${label} ${options.mismatch === "search" ? "unrelated summary" : searchText} <script>literal</script>`,
    description: `${marker} private body`, currentStatus: status,
    createdAt: at(20 * 24), ticketDate: at(20 * 24), updatedAt: at(updatedHours),
  } });
  ticketIds.push(ticket.id);
  rows.set(label, ticket);
  const history: Array<{ fromStatus: TicketStatus; toStatus: TicketStatus; createdAt: Date }> = [];
  const event = (fromStatus: TicketStatus, toStatus: TicketStatus, hours: number) =>
    history.push({ fromStatus, toStatus, createdAt: at(hours) });
  if (status === "CANCELLED") event("NEW", "CANCELLED", updatedHours);
  else if (status !== "NEW") {
    event("NEW", "OPEN", 19 * 24);
    if (status === "IN_PROGRESS") event("OPEN", "IN_PROGRESS", updatedHours);
    if (status === "WAITING_FOR_REQUESTER") event("OPEN", "WAITING_FOR_REQUESTER", updatedHours);
    if (status === "REOPENED") {
      event("OPEN", "RESOLVED", 48);
      event("RESOLVED", "REOPENED", updatedHours);
    }
    if (status === "RESOLVED" || status === "CLOSED") {
      if (options.resolution === undefined) throw new Error("Resolution time must be explicit in read fixtures.");
      if (options.repeatedResolution) {
        event("OPEN", "RESOLVED", 5 * 24);
        event("RESOLVED", "REOPENED", 4 * 24);
        event("REOPENED", "IN_PROGRESS", 3 * 24);
        event("IN_PROGRESS", "RESOLVED", options.resolution);
      } else event("OPEN", "RESOLVED", options.resolution);
      resolutionHours.set(label, options.resolution);
      if (status === "CLOSED") event("RESOLVED", "CLOSED", updatedHours);
    }
  }
  if (history.length) await prisma.ticketStatusHistory.createMany({ data: history.map((entry) => ({
    ...entry, ticketId: ticket.id, actorId: staffId,
    reason: entry.toStatus === "CANCELLED" ? "Cancel synthetic drill-down fixture" : null,
  })) });
}

beforeAll(async () => {
  try {
    const identity = configureTestDatabaseEnvironment();
    const operational = process.env.TOKTICKIT_DEVELOPMENT_DATABASE_URL;
    expect(Boolean(operational) && decodeURIComponent(new URL(operational!).pathname.slice(1)) !== identity.databaseName,
      "Dedicated database differs from operational; values withheld").toBe(true);
    const [live] = await prisma.$queryRaw<Array<{ database: string; schema: string }>>`
      SELECT current_database() AS database,current_schema() AS schema`;
    expect(live.database === identity.databaseName && live.schema === identity.schema,
      "Live target agrees with actual isolation guard; values withheld").toBe(true);
    guarded = true;
    const requester = await addUser("owned", "REQUESTER"); requesterId = requester.user.id;
    const foreign = await addUser("foreign", "REQUESTER"); foreignId = foreign.user.id;
    const staff = await addUser("staff", "IT_STAFF"); staffId = staff.user.id; staffName = staff.user.name;
    const login = await loginRequest(requester.user.email, requester.password);
    expect(login.status, "Inherited real authentication succeeds; response redacted").toBe(200);
    cookie = cookieHeader(login.headers["set-cookie"]);
    for (const label of ["matching", "other"]) {
      categoryIds.push((await prisma.category.create({ data: { name: `${marker}-${label}` } })).id);
      systemIds.push((await prisma.relatedSystem.create({ data: { name: `${marker}-${label}` } })).id);
    }
    const [observed] = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT CURRENT_TIMESTAMP AS now`;
    clock = observed.now.getTime();
    for (const label of ["O01", "O02", "O03", "O04", "O05", "O06", "O07", "O08", "O09", "O10", "O11"]) {
      await addTicket(label, "OPEN", 72);
    }
    await addTicket("W01", "WAITING_FOR_REQUESTER", 48);
    for (const [number, resolved, closed] of [
      [1, 48, 24], [2, 48, 24], [3, 72, 48], [4, 72, 48], [5, 96, 72], [6, 96, 72],
    ] as const) {
      await addTicket(`R0${number}`, "RESOLVED", 24, { resolution: resolved, repeatedResolution: number === 2 });
      await addTicket(`C0${number}`, "CLOSED", 12, { resolution: closed });
    }
    await addTicket("X01", "CANCELLED", 10 * 24);
    await addTicket("L01", "RESOLVED", 6, { resolution: 10 * 24 });
    await addTicket("N01", "NEW", 72);
    await addTicket("P01", "IN_PROGRESS", 72);
    await addTicket("E01", "REOPENED", 24);
    for (const mismatch of ["search", "category", "system", "requested", "it"] as const) {
      await addTicket(`decoy-${mismatch}`, "WAITING_FOR_REQUESTER", 3, { mismatch });
    }
    await addTicket("foreign-open", "OPEN", 1, { foreign: true });
    await addTicket("foreign-waiting", "WAITING_FOR_REQUESTER", 1, { foreign: true });
    await addTicket("foreign-resolved", "RESOLVED", 1, { foreign: true, resolution: 2 });
    await prisma.internalNote.create({ data: { ticketId: rows.get("O01")!.id,
      authorId: staffId, content: `${marker} private Internal Note` } });
    expect(await prisma.ticket.count({ where: { requesterId } })).toBe(34);
    expect(await prisma.ticket.count({ where: { requesterId: foreignId } })).toBe(3);
    expect(new Set([...rows.values()].map((ticket) => ticket.currentStatus)).size).toBe(8);
  } catch (error) { throw fixtureError("setup", error); }
});

async function domainDigest() {
  try {
    const owned = { ticketId: { in: ticketIds } };
    const data = await Promise.all([
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
      prisma.seedFixture.findMany({ where: { OR: [{ userId: { in: userIds } }, { ticketId: { in: ticketIds } },
        { categoryId: { in: categoryIds } }, { relatedSystemId: { in: systemIds } }] }, orderBy: { id: "asc" } }),
      prisma.ticketNumberSequence.findMany({ orderBy: { year: "asc" } }),
    ]);
    // Authentication lastSeen/expiry bookkeeping is deliberately excluded.
    return createHash("sha256").update(JSON.stringify(data)).digest("hex");
  } catch (error) { throw fixtureError("domain observation", error); }
}

async function preservedRead(path: string, params: URLSearchParams) {
  expect(["/api/dashboard/requester", "/api/tickets"]).toContain(path);
  const before = await domainDigest();
  try { return await request(app).get(`${path}?${params.toString()}`).set("Cookie", cookie); }
  finally { expect(await domainDigest() === before, "Every read/denial preserves exact domain state; digests withheld").toBe(true); }
}

const openOrder = ["O11", "O10", "O09", "O08", "O07", "O06", "O05", "O04", "O03", "O02", "O01"];
const mismatchOrder = ["decoy-it", "decoy-requested", "decoy-system", "decoy-category", "decoy-search"];
const mainOutstanding = ["E01", "W01", "P01", "N01", ...openOrder];
const mainUpdated = ["L01", "C06", "C05", "C04", "C03", "C02", "C01", "E01",
  "R06", "R05", "R04", "R03", "R02", "R01", "W01", "P01", "N01", ...openOrder];
const resolvedOrder = ["C02", "C01", "C04", "C03", "R02", "R01", "C06", "C05", "R04", "R03", "R06", "R05"];
type Widget = "outstanding" | "needsAttention" | "recentUpdated" | "recentResolved";
type Context = "unfiltered" | "combined" | "open";
const expected: Record<Context, {
  metrics: Record<Widget, number>; updated: string[]; resolved: string[]; lists: Record<Widget, string[]>;
}> = {
  unfiltered: {
    metrics: { outstanding: 20, needsAttention: 6, recentUpdated: 33, recentResolved: 12 },
    updated: mismatchOrder, resolved: resolvedOrder.slice(0, 5),
    lists: { outstanding: [...mismatchOrder, ...mainOutstanding], needsAttention: [...mismatchOrder, "W01"],
      recentUpdated: [...mismatchOrder, ...mainUpdated], recentResolved: resolvedOrder },
  },
  combined: {
    metrics: { outstanding: 15, needsAttention: 1, recentUpdated: 28, recentResolved: 12 },
    updated: ["L01", "C06", "C05", "C04", "C03"], resolved: resolvedOrder.slice(0, 5),
    lists: { outstanding: mainOutstanding, needsAttention: ["W01"], recentUpdated: mainUpdated, recentResolved: resolvedOrder },
  },
  open: {
    metrics: { outstanding: 11, needsAttention: 0, recentUpdated: 11, recentResolved: 0 },
    updated: openOrder.slice(0, 5), resolved: [],
    lists: { outstanding: openOrder, needsAttention: [], recentUpdated: openOrder, recentResolved: [] },
  },
};

function baseFilters(context: Context) {
  const params = new URLSearchParams();
  if (context !== "unfiltered") {
    params.set("search", searchText); params.set("categoryId", String(categoryIds[0]));
    params.set("relatedSystemId", String(systemIds[0])); params.set("requestedPriority", "HIGH");
    params.set("itPriority", "MEDIUM");
  }
  if (context === "open") params.set("currentStatus", "OPEN");
  return params;
}

function assertDashboardRows(actual: Array<Record<string, any>>, labels: string[], resolved: boolean) {
  expect(actual.map((row) => row.id)).toEqual(ids(labels));
  expect(actual.length).toBeLessThanOrEqual(5);
  actual.forEach((row, index) => {
    const ticket = rows.get(labels[index]!)!;
    const required = ["id", "ticketNumber", "summary", "currentStatus", "requestedPriority", "itPriority", "owner", "updatedAt"];
    expect(required.every((key) => Object.hasOwn(row, key))).toBe(true);
    expect(Object.keys(row).every((key) => [...required, "resolvedAt"].includes(key))).toBe(true);
    safeEqual(Object.fromEntries(required.filter((key) => key !== "owner").map((key) => [key, row[key]])), {
      id: ticket.id, ticketNumber: ticket.ticketNumber, summary: ticket.summary, currentStatus: ticket.currentStatus,
      requestedPriority: ticket.requestedPriority, itPriority: ticket.itPriority, updatedAt: ticket.updatedAt.toISOString(),
    }, "Explicit safe Dashboard row from independent fixture observation");
    if (ticket.ownerId === null) expect(row.owner).toBeNull();
    else {
      expect(Object.keys(row.owner).every((key) => ["id", "name", "role"].includes(key))).toBe(true);
      expect(row.owner.id).toBe(staffId); expect(row.owner.name).toBe(staffName);
    }
    if (resolved) expect(row.resolvedAt).toBe(at(resolutionHours.get(labels[index]!)!).toISOString());
  });
}

describe("Requester widget descriptors execute as equivalent list predicates", () => {
  for (const context of ["unfiltered", "combined", "open"] as const) {
    it.each<Widget>(["outstanding", "needsAttention", "recentUpdated", "recentResolved"])(`${context}: %s`, async (widget) => {
      const filters = baseFilters(context);
      const dashboard = await preservedRead("/api/dashboard/requester", filters);
      expect(dashboard.status, "Authorized Dashboard accepts the valid base filters").toBe(200);
      safeEqual(dashboard.body.metrics, expected[context].metrics, "Independently authored four widget counts");
      assertDashboardRows(dashboard.body.lists.recentUpdated, expected[context].updated, false);
      assertDashboardRows(dashboard.body.lists.recentResolved, expected[context].resolved, true);

      const descriptor = dashboard.body.drillDown[widget];
      expect(Object.keys(descriptor).sort()).toEqual(["path", "query"]);
      expect(descriptor.path).toBe("/api/tickets");
      expect(descriptor.query !== null && typeof descriptor.query === "object" && !Array.isArray(descriptor.query)).toBe(true);
      const approved = ["search", "categoryId", "relatedSystemId", "requestedPriority", "itPriority", "currentStatus",
        "statusGroup", "dashboardWidget", "updatedFrom", "updatedBefore", "resolvedFrom", "resolvedBefore",
        "sortBy", "sortOrder", "page", "pageSize"];
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(descriptor.query)) {
        expect(approved).toContain(key);
        expect(["string", "number"]).toContain(typeof value);
        params.set(key, String(value)); // One encoding pass; never concatenate raw values.
      }
      for (const [key, value] of filters) expect(params.get(key), `Descriptor retains ${key}`).toBe(value);
      const labels = expected[context].lists[widget];
      const fullIds: number[] = [];
      const totalPages = Math.ceil(labels.length / 10);
      // A zero result still makes one request and must retain its contradictory filters.
      for (let page = 1; page <= Math.max(1, totalPages); page++) {
        params.set("page", String(page)); params.set("pageSize", "10");
        const response = await preservedRead(descriptor.path, params);
        expect(response.status, "Accepted Dashboard descriptor must execute on the Requester list").toBe(200);
        expect(response.headers["content-type"]).toMatch(/application\/json/u);
        expect(response.body.pagination).toEqual({
          page, pageSize: 10, totalItems: labels.length, totalPages,
          hasPreviousPage: labels.length > 0 && page > 1,
          hasNextPage: labels.length > 0 && page < totalPages,
        });
        expect(response.body.pagination.totalItems).toBe(dashboard.body.metrics[widget]);
        expect(response.body.pagination.totalItems).toBe(expected[context].metrics[widget]);
        const pageLabels = labels.slice((page - 1) * 10, page * 10);
        expect(response.body.items.map((row: { id: number }) => row.id)).toEqual(ids(pageLabels));
        for (const [index, item] of response.body.items.entries()) {
          const ticket = rows.get(pageLabels[index]!)!;
          expect(item.summary).toBe(ticket.summary);
          expect(item.updatedAt).toBe(ticket.updatedAt.toISOString());
          expect(item.requester.id).toBe(requesterId);
          expect(Object.keys(item.requester).sort()).toEqual(["id", "name"]);
          if (widget === "recentResolved") expect(item.resolvedAt).toBe(at(resolutionHours.get(pageLabels[index]!)!).toISOString());
          fullIds.push(item.id);
        }
        expect(/passwordHash|tokenHash|csrfTokenHash|inputFingerprint|safeResponse|internalNotes|storageKey|"email"|"description"/u
          .test(JSON.stringify(response.body)), "Safe list excludes private material").toBe(false);
      }
      expect(fullIds).toEqual(ids(labels));
      expect(new Set(fullIds).size).toBe(fullIds.length);
      expect(fullIds.some((id) => ["foreign-open", "foreign-waiting", "foreign-resolved"].some((label) => rows.get(label)!.id === id))).toBe(false);
    });
  }
});

describe("Requester list rejects invalid Dashboard extensions", () => {
  it.each([
    { label: "Staff-only widget", fields: ["dashboardWidget"], entries: [["dashboardWidget", "mine"]] },
    { label: "bucket on attention", fields: ["widgetStatus"], entries: [["dashboardWidget", "attention"], ["widgetStatus", "OPEN"]] },
    { label: "repeated widget", fields: ["dashboardWidget"], entries: [["dashboardWidget", "attention"], ["dashboardWidget", "outstanding"]] },
    { label: "incomplete updated pair", fields: ["updatedFrom", "updatedBefore"], entries: [["updatedFrom", "2026-01-01T00:00:00.000Z"]] },
    { label: "incomplete resolved pair", fields: ["resolvedFrom", "resolvedBefore"], entries: [["resolvedFrom", "2026-01-01T00:00:00.000Z"]] },
    { label: "reversed resolved pair", fields: ["resolvedFrom", "resolvedBefore"], entries: [["resolvedFrom", "2026-01-03T00:00:00.000Z"], ["resolvedBefore", "2026-01-02T00:00:00.000Z"]] },
    { label: "impossible calendar date", fields: ["updatedFrom"], entries: [["updatedFrom", "2026-02-30T00:00:00.000Z"], ["updatedBefore", "2026-03-03T00:00:00.000Z"]] },
    { label: "resolved sorting without pair", fields: ["sortBy", "resolvedFrom", "resolvedBefore"], entries: [["sortBy", "resolvedAt"]] },
  ])("$label", async ({ fields, entries }) => {
    const response = await preservedRead("/api/tickets", new URLSearchParams(entries));
    expect(response.status).toBe(400);
    expect(response.headers["content-type"]).toMatch(/application\/json/u);
    expect(Object.keys(response.body)).toEqual(["error"]);
    expect(response.body.error.code).toBe("INVALID_QUERY");
    expect(typeof response.body.error.message).toBe("string");
    expect(response.body.error.fields !== null && typeof response.body.error.fields === "object").toBe(true);
    expect(fields.some((field) => typeof response.body.error.fields[field] === "string" &&
      response.body.error.fields[field].trim().length > 0), "Relevant field feedback without prescribing prose").toBe(true);
    expect(/PrismaClient|stack|passwordHash|tokenHash|inputFingerprint|safeResponse/u.test(JSON.stringify(response.body))).toBe(false);
  });
});

afterAll(async () => {
  try {
    if (!guarded) return;
    const owned = { ticketId: { in: ticketIds } };
    await prisma.$transaction([
      prisma.seedFixture.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { ticketId: { in: ticketIds } },
        { categoryId: { in: categoryIds } }, { relatedSystemId: { in: systemIds } }] } }),
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
      prisma.publicComment.count({ where: owned }),
      prisma.internalNote.count({ where: owned }),
      prisma.attachment.count({ where: owned }),
      prisma.category.count({ where: { id: { in: categoryIds } } }),
      prisma.relatedSystem.count({ where: { id: { in: systemIds } } }),
      prisma.seedFixture.count({ where: { OR: [{ userId: { in: userIds } }, { ticketId: { in: ticketIds } },
        { categoryId: { in: categoryIds } }, { relatedSystemId: { in: systemIds } }] } }),
    ]);
    expect(remaining).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    console.info("Issue47 drill-down cleanup verified: zero owned rows/sessions/references; no fault resources created.");
  } catch (error) { throw fixtureError("cleanup", error); }
  finally { await prisma.$disconnect(); }
});
