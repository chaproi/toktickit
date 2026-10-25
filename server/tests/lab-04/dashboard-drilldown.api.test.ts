import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { Ticket, TicketStatus } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { configureTestDatabaseEnvironment } from "../../src/testing/test-database.js";
import { cookieHeader, createAuthUser, loginRequest } from "../lab-03/auth-test-helpers.js";
import { createStaffDrilldownFixture, type StaffActor, type StaffDescriptor, type StaffDrilldownDashboard, type StaffDrilldownList, type StaffTicketMetrics } from "./staff-drilldown-test-fixtures.js";
import { staffVerificationFixture } from "./staff-dashboard-verification-fixtures.js";

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

// Staff contribution to AC-25/T-25, AC-27/T-27, AC-28/T-28 and safe
// errors AC-34/T-34. These are fresh HTTP snapshots over unchanged fixtures,
// not retained snapshots or concurrency/workflow evidence. Legacy Queue owner
// replacement counters remain outside this equivalence comparison.
describe("Staff Dashboard descriptors execute as intersected Staff Ticket-list predicates", () => {
  const fixture = createStaffDrilldownFixture();
  beforeAll(fixture.setup);
  afterAll(fixture.cleanup);
  const opens = ["O11", "O10", "O09", "O08", "O07", "O06", "O05", "O04", "O03", "O02", "O01"];
  const closed = ["C06", "C05", "C04", "C03", "C02", "C01"];
  const resolved = ["R06", "R05", "R04", "R03", "R02", "R01"];
  const mismatches = ["D-it", "D-requested", "D-system"];
  const updated = [...mismatches, "L01", ...closed, ...resolved, "E01", "W01", "P01", ...opens, "N01"];
  const resolutionOrder = ["C02", "C01", "C04", "C03", "R02", "R01", "C06", "C05", "R04", "R03", "R06", "R05"];
  type StaffWidget = "unassigned" | "mine" | "status" | "itPriority" | "recentUpdated" | "recentResolved";
  type StaffWidgetCase = {
    label: string; widget: StaffWidget; status?: TicketStatus; priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    count: number | { A: number; B: number }; order: string[] | { A: string[]; B: string[] };
  };
  // Literal counts and independently specified membership/order, not production
  // predicates. All priority counts below exclude CLOSED/CANCELLED.
  const widgets: StaffWidgetCase[] = [
    { label: "unassigned", widget: "unassigned", count: 3, order: ["L01", "W01", "N01"] },
    { label: "mine", widget: "mine", count: { A: 21, B: 1 }, order: { A: [...mismatches, ...resolved, "E01", ...opens], B: ["P01"] } },
    { label: "NEW", widget: "status", status: "NEW", count: 1, order: ["N01"] },
    { label: "OPEN", widget: "status", status: "OPEN", count: 14, order: [...mismatches, ...opens] },
    { label: "IN_PROGRESS", widget: "status", status: "IN_PROGRESS", count: 1, order: ["P01"] },
    { label: "WAITING_FOR_REQUESTER", widget: "status", status: "WAITING_FOR_REQUESTER", count: 1, order: ["W01"] },
    { label: "RESOLVED", widget: "status", status: "RESOLVED", count: 7, order: ["L01", ...resolved] },
    { label: "CLOSED", widget: "status", status: "CLOSED", count: 6, order: closed },
    { label: "REOPENED", widget: "status", status: "REOPENED", count: 1, order: ["E01"] },
    { label: "CANCELLED", widget: "status", status: "CANCELLED", count: 1, order: ["X01"] },
    { label: "LOW", widget: "itPriority", priority: "LOW", count: 3, order: ["D-it", "L01", "N01"] },
    { label: "MEDIUM", widget: "itPriority", priority: "MEDIUM", count: 7, order: [...resolved, "W01"] },
    { label: "HIGH", widget: "itPriority", priority: "HIGH", count: 14, order: ["D-requested", "D-system", "E01", ...opens] },
    { label: "URGENT", widget: "itPriority", priority: "URGENT", count: 1, order: ["P01"] },
    { label: "recent updated", widget: "recentUpdated", count: 31, order: updated },
    { label: "recent resolved", widget: "recentResolved", count: 12, order: resolutionOrder },
  ];
  function metric(body: StaffDrilldownDashboard, spec: StaffWidgetCase) {
    return spec.widget === "status" ? body.metrics.byStatus[spec.status!]
      : spec.widget === "itPriority" ? body.metrics.byItPriority[spec.priority!] : body.metrics[spec.widget];
  }
  function selectedDescriptor(body: StaffDrilldownDashboard, spec: StaffWidgetCase) {
    return spec.widget === "status" ? body.drillDown.byStatus[spec.status!]
      : spec.widget === "itPriority" ? body.drillDown.byItPriority[spec.priority!] : body.drillDown[spec.widget];
  }
  async function dashboard(actor: StaffActor, filters = fixture.base()) {
    const response = await fixture.read(actor, "/api/dashboard/staff", filters);
    expect(response.status, "Real Staff Dashboard accepts the base query before descriptor execution").toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    return response.body as StaffDrilldownDashboard;
  }
  function paramsFor(descriptor: StaffDescriptor, filters: URLSearchParams, body: StaffDrilldownDashboard, spec: StaffWidgetCase) {
    expect(descriptor.path).toBe("/api/staff/tickets");
    const params = new URLSearchParams();
    const allowed = ["search", "categoryId", "relatedSystemId", "requestedPriority", "itPriority", "currentStatus", "owner",
      "statusGroup", "dashboardWidget", "widgetStatus", "widgetItPriority", "updatedFrom", "updatedBefore", "resolvedFrom", "resolvedBefore", "sortBy", "sortOrder", "page", "pageSize"];
    for (const [name, value] of Object.entries(descriptor.query)) {
      expect(allowed).toContain(name); expect(["string", "number"]).toContain(typeof value); params.set(name, String(value));
    }
    for (const [name, value] of filters) expect(params.get(name), `Descriptor retains intersected ${name}`).toBe(value);
    expect(params.get("dashboardWidget")).toBe(spec.widget);
    if (spec.widget === "status") expect(params.get("widgetStatus")).toBe(spec.status);
    if (spec.widget === "itPriority") expect(params.get("widgetItPriority")).toBe(spec.priority);
    if (["unassigned", "mine", "itPriority"].includes(spec.widget)) expect(params.get("statusGroup")).toBe("active");
    expect(params.has("actorId") || params.has("requesterId")).toBe(false);
    if (spec.widget === "recentUpdated" || spec.widget === "recentResolved") {
      const prefix = spec.widget === "recentUpdated" ? "updated" : "resolved";
      expect(params.get(`${prefix}From`)).toBe(body.recentWindow.from);
      expect(params.get(`${prefix}Before`)).toBe(body.recentWindow.before);
      expect(params.get("sortBy")).toBe(spec.widget === "recentUpdated" ? "updatedAt" : "resolvedAt");
      expect(params.get("sortOrder")).toBe("desc");
    } else {
      expect(params.get("sortBy") ?? "updatedAt").toBe("updatedAt");
      expect(params.get("sortOrder") ?? "desc").toBe("desc");
    }
    return params;
  }
  async function followPages(actor: StaffActor, descriptor: StaffDescriptor, params: URLSearchParams,
    labels: string[], expectedCount: number, resolvedRows: boolean) {
    expect(labels.length, "Independent membership agrees with independently specified count").toBe(expectedCount);
    const totalPages = Math.ceil(expectedCount / 10), seen: number[] = [];
    for (let page = 1; page <= Math.max(1, totalPages); page++) {
      params.set("page", String(page)); params.set("pageSize", "10");
      const response = await fixture.read(actor, descriptor.path, params);
      expect(response.status, "Valid returned Staff Ticket descriptor must execute, not reject new list predicates").toBe(200);
      expect(response.headers["content-type"]).toMatch(/application\/json/u);
      const body = response.body as StaffDrilldownList;
      expect(body.pagination).toEqual({ page, pageSize: 10, totalItems: expectedCount, totalPages,
        hasPreviousPage: expectedCount > 0 && page > 1, hasNextPage: expectedCount > 0 && page < totalPages });
      const pageLabels = labels.slice((page - 1) * 10, page * 10);
      fixture.assertRows(body.items, pageLabels, resolvedRows);
      seen.push(...body.items.map((item) => item.id));
      // counts.mine/unassigned intentionally remain the inherited replacement
      // counters. Only filtered pagination.totalItems is a widget equivalent.
      expect(body.pagination.totalItems).toBe(expectedCount);
    }
    expect(seen).toEqual(fixture.ids(labels)); expect(new Set(seen).size).toBe(seen.length);
    expect(seen.some((id) => fixture.ids(["D-search", "D-category"]).includes(id))).toBe(false);
  }
  for (const actor of ["A", "B"] as const) {
    it.each(widgets)(`${actor}: $label descriptor matches independently expected filtered pagination`, async (spec) => {
      const filters = fixture.base(), body = await dashboard(actor, filters);
      const count = typeof spec.count === "number" ? spec.count : spec.count[actor];
      const order = Array.isArray(spec.order) ? spec.order : spec.order[actor];
      const expectedMetrics: StaffTicketMetrics = { unassigned: 3, mine: actor === "A" ? 21 : 1,
        byStatus: { NEW: 1, OPEN: 14, IN_PROGRESS: 1, WAITING_FOR_REQUESTER: 1, RESOLVED: 7, CLOSED: 6, REOPENED: 1, CANCELLED: 1 },
        byItPriority: { LOW: 3, MEDIUM: 7, HIGH: 14, URGENT: 1 }, recentUpdated: 31, recentResolved: 12 };
      safeEqual(Object.fromEntries(Object.keys(expectedMetrics).map((key) => [key, body.metrics[key as keyof StaffTicketMetrics]])), expectedMetrics,
        "Independent global versus actor-specific Staff Ticket metrics");
      expect(metric(body, spec)).toBe(count);
      expect(body.lists.recentUpdated.map((row) => row.id)).toEqual(fixture.ids(updated.slice(0, 5)));
      expect(body.lists.recentResolved.map((row) => row.id)).toEqual(fixture.ids(resolutionOrder.slice(0, 5)));
      const descriptor = selectedDescriptor(body, spec), params = paramsFor(descriptor, filters, body, spec);
      await followPages(actor, descriptor, params, order, count, spec.widget === "recentResolved");
    });
  }
  it.each([
    { label: "all seven base filters intersect positively", scenario: "combined", spec: widgets[3]!, expected: 11, order: opens },
    { label: "B owner intersects A mine to zero", scenario: "owner", spec: widgets[1]!, expected: 0, order: [] },
    { label: "OPEN intersects IN_PROGRESS status bin to zero", scenario: "status", spec: widgets[4]!, expected: 0, order: [] },
    { label: "HIGH IT priority intersects LOW priority bin to zero", scenario: "priority", spec: widgets[10]!, expected: 0, order: [] },
  ])("$label", async ({ scenario, spec, expected: count, order }) => {
    const filters = scenario === "combined" ? fixture.combined() : fixture.base();
    if (scenario === "owner") filters.set("owner", String(fixture.actorId("B")));
    if (scenario === "status") filters.set("currentStatus", "OPEN");
    if (scenario === "priority") filters.set("itPriority", "HIGH");
    const body = await dashboard("A", filters);
    expect(metric(body, spec)).toBe(count);
    const descriptor = selectedDescriptor(body, spec), params = paramsFor(descriptor, filters, body, spec);
    await followPages("A", descriptor, params, order, count, false);
  });
  it.each([
    { label: "Requester-only widget", fields: ["dashboardWidget"], entries: [["dashboardWidget", "attention"]] },
    { label: "status widget missing bucket", fields: ["dashboardWidget", "widgetStatus"], entries: [["dashboardWidget", "status"]] },
    { label: "irrelevant bucket on mine", fields: ["widgetStatus"], entries: [["dashboardWidget", "mine"], ["widgetStatus", "OPEN"]] },
    { label: "repeated widget", fields: ["dashboardWidget"], entries: [["dashboardWidget", "mine"], ["dashboardWidget", "unassigned"]] },
    { label: "incomplete updated pair", fields: ["updatedFrom", "updatedBefore"], entries: [["updatedFrom", "2026-01-01T00:00:00.000Z"]] },
    { label: "incomplete resolved pair", fields: ["resolvedFrom", "resolvedBefore"], entries: [["resolvedFrom", "2026-01-01T00:00:00.000Z"]] },
    { label: "reversed resolved pair", fields: ["resolvedBefore"], entries: [["resolvedFrom", "2026-01-03T00:00:00.000Z"], ["resolvedBefore", "2026-01-02T00:00:00.000Z"]] },
    { label: "impossible calendar date", fields: ["updatedFrom"], entries: [["updatedFrom", "2026-02-30T00:00:00.000Z"], ["updatedBefore", "2026-03-03T00:00:00.000Z"]] },
  ])("Staff list rejects $label", async ({ fields, entries }) => {
    const params = fixture.base();
    for (const [name, value] of entries) params.append(name, value);
    const response = await fixture.read("A", "/api/staff/tickets", params);
    expect(response.status).toBe(400); expect(response.headers["content-type"]).toMatch(/application\/json/u);
    expect(Object.keys(response.body)).toEqual(["error"]); expect(response.body.error.code).toBe("INVALID_QUERY");
    expect(typeof response.body.error.message).toBe("string");
    expect(fields.some((field) => typeof response.body.error.fields?.[field] === "string" && response.body.error.fields[field].trim().length > 0),
      "Field feedback identifies the invalid extension/combination without prescribing prose").toBe(true);
    expect(/passwordHash|tokenHash|csrfTokenHash|inputFingerprint|safeResponse|internalNotes|PrismaClient|stack|postgres/iu.test(JSON.stringify(response.body))).toBe(false);
  });
});

// Partial AC-26/T-26, AC-28/T-28 and AC-44/T-54. Real descriptors and
// API-07 reads verify assignment selection, not who may operate an Action.
describe("Staff current-user Action widgets execute their returned API-07 descriptors", () => {
  const fixture = staffVerificationFixture("actions");
  let base: URLSearchParams;
  beforeAll(async () => { await fixture.setup(); base = await fixture.actionCohort(); });
  afterAll(fixture.cleanup);
  const planned = ["P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08", "P09", "P10", "P11"];
  const unfinished = [...planned, "S01", "S02"];
  const cases = [
    { name: "PLANNED status", status: "PLANNED", count: 11, suffixes: planned },
    { name: "IN_PROGRESS status", status: "IN_PROGRESS", count: 2, suffixes: ["S01", "S02"] },
    { name: "COMPLETED status", status: "COMPLETED", count: 2, suffixes: ["C01", "C02"] },
    { name: "CANCELLED status", status: "CANCELLED", count: 1, suffixes: ["X01"] },
    { name: "unfinished PLANNED/IN_PROGRESS aggregate", status: null, count: 13, suffixes: unfinished },
  ];
  for (const actor of ["A", "B"] as const) {
    it.each(cases)(`${actor}: $name descriptor preserves actor assignment, exact order and pagination`, async ({ status, count, suffixes }) => {
      const dashboard = await fixture.read(actor, "/api/dashboard/staff", base);
      expect(dashboard.status).toBe(200); expect(dashboard.headers["cache-control"]).toBe("private, no-store");
      expect(dashboard.body.metrics.myActionsByStatus).toEqual({ PLANNED: 11, IN_PROGRESS: 2, COMPLETED: 2, CANCELLED: 1 });
      expect(dashboard.body.metrics.myUnfinishedActions).toBe(13);
      const preview = unfinished.slice(0, 5).map((suffix) => `${actor}-${suffix}`);
      expect(dashboard.body.lists.myUnfinishedActions.map((row: { action: { id: number } }) => row.action.id))
        .toEqual(preview.map(fixture.actionId));
      fixture.assertActionRows(dashboard.body.lists.myUnfinishedActions, preview);
      const descriptor = status === null ? dashboard.body.drillDown.myUnfinishedActions : dashboard.body.drillDown.myActionsByStatus[status];
      const params = fixture.descriptorParams(descriptor, "/api/staff/actions", base);
      expect(params.get("assignee")).toBe("me");
      if (status === null) { expect(params.get("actionStatusGroup")).toBe("unfinished"); expect(params.has("status")).toBe(false); }
      else { expect(params.get("status")).toBe(status); expect(params.has("actionStatusGroup")).toBe(false); }
      expect(params.has("actorId") || params.has("assigneeId") || params.has("dashboardWidget")).toBe(false);
      const labels = suffixes.map((suffix) => `${actor}-${suffix}`), seen: number[] = [];
      const totalPages = Math.ceil(count / 10);
      for (let page = 1; page <= totalPages; page++) {
        params.set("page", String(page)); params.set("pageSize", "10");
        const response = await fixture.read(actor, descriptor.path, params);
        expect(response.status).toBe(200); expect(response.headers["cache-control"]).toBe("private, no-store");
        expect(response.body.pagination).toEqual({ page, pageSize: 10, totalItems: count, totalPages,
          hasPreviousPage: page > 1, hasNextPage: page < totalPages });
        expect(response.body.pagination.totalItems).toBe(status === null ? dashboard.body.metrics.myUnfinishedActions : dashboard.body.metrics.myActionsByStatus[status]);
        const pageLabels = labels.slice((page - 1) * 10, page * 10);
        expect(response.body.items.map((row: { action: { id: number } }) => row.action.id)).toEqual(pageLabels.map(fixture.actionId));
        fixture.assertActionRows(response.body.items, pageLabels);
        for (const row of response.body.items) {
          expect(row.action.assignee.id).toBe(fixture.actorId(actor));
          expect(row.ticket.id).toBe(fixture.ticketId(`${actor}-${status === "COMPLETED" || status === "CANCELLED" ? "terminal" : "editable"}`));
          if (status === null) expect(["PLANNED", "IN_PROGRESS"]).toContain(row.action.status);
          else expect(row.action.status).toBe(status);
          seen.push(row.action.id);
        }
      }
      expect(seen).toEqual(labels.map(fixture.actionId)); expect(new Set(seen).size).toBe(count);
      expect(seen).not.toContain(fixture.actionId(`${actor}-decoy`));
      expect(seen).not.toContain(fixture.actionId("historical-decoy"));
      expect(seen.some((id) => suffixes.some((suffix) => id === fixture.actionId(`${actor === "A" ? "B" : "A"}-${suffix}`)))).toBe(false);
    });
  }
});
