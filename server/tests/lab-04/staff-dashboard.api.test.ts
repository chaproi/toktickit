import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Prisma, type Action, type ActionStatus, type RequestedPriority, type Ticket, type TicketStatus, type UserRole } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import type { ActionDTO } from "../../src/actions/action-projection.js";
import { getPrisma } from "../../src/prisma.js";
import { configureTestDatabaseEnvironment } from "../../src/testing/test-database.js";
import { cookieHeader, createAuthUser, loginRequest } from "../lab-03/auth-test-helpers.js";
import { ACTION_KEYS, actionSnapshot } from "./action-read-test-fixtures.js";

// First API-09 RED: partial AC-25/T-25, AC-26/T-26, AC-01/T-01,
// AC-02/T-02, AC-29/T-29; bounded history/order observations contribute to
// AC-24/T-24 and AC-27/T-27. No workflow, drill-down execution or snapshot-race claim.
type Identity = { id: number; name: string };
type Actor = Identity & { role: UserRole; cookie: string };
type TicketRow = Pick<Ticket, "id" | "ticketNumber" | "summary" | "currentStatus" | "requestedPriority" | "itPriority"> & {
  updatedAt: string; owner: (Identity & { role: UserRole }) | null; resolvedAt?: string;
};
// Reuse the existing safe ActionDTO TYPE only, never its production projector
// to generate expectations. Assigned rows have API-07's {ticket,action} shape.
type AssignedRow = {
  ticket: Pick<Ticket, "id" | "ticketNumber" | "summary" | "currentStatus">;
  action: ActionDTO;
};
type Descriptor = { path: string; query: Record<string, string | number> };
type StaffMetrics = {
  unassigned: number; mine: number; byStatus: Record<TicketStatus, number>;
  byItPriority: Record<RequestedPriority, number>; recentUpdated: number; recentResolved: number;
  myActionsByStatus: Record<ActionStatus, number>; myUnfinishedActions: number;
};
interface StaffDashboardResponse {
  asOf: string; timezone: "Asia/Bangkok"; recentWindow: { from: string; before: string };
  filters: Partial<Record<"search" | "categoryId" | "relatedSystemId" | "requestedPriority" | "itPriority" | "currentStatus" | "owner", string | number | null>>;
  metrics: StaffMetrics;
  lists: { recentUpdated: TicketRow[]; recentResolved: TicketRow[]; myUnfinishedActions: AssignedRow[] };
  // Minimal test-local convention for unspecified nesting: descriptors mirror
  // metric names, with maps for bins. No invented actor/business fields and no
  // exact whole-response/drillDown key restriction beyond the approved metrics.
  drillDown: {
    unassigned: Descriptor; mine: Descriptor; byStatus: Record<TicketStatus, Descriptor>;
    byItPriority: Record<RequestedPriority, Descriptor>; recentUpdated: Descriptor; recentResolved: Descriptor;
    myActionsByStatus: Record<ActionStatus, Descriptor>; myUnfinishedActions: Descriptor;
  };
}

const prisma = getPrisma();
const marker = `issue48-first-${randomUUID()}`;
const privateNote = `${marker} private Internal Note must not be projected`;
const userIds: number[] = [], ticketIds: number[] = [], categoryIds: number[] = [], systemIds: number[] = [];
const actors = new Map<string, Actor>(), tickets = new Map<string, Ticket>(), actions = new Map<string, Action>();
let isolated = false, clock = 0;
const ago = (hours: number) => new Date(clock - hours * 3_600_000);
const who = (name: string) => actors.get(name)!;
const parent = (name: string) => tickets.get(name)!;
const child = (name: string) => actions.get(name)!;

function safeEqual(actual: unknown, expected: unknown, label: string) {
  expect(isDeepStrictEqual(actual, expected), `${label}; comparison values withheld`).toBe(true);
}
function fixtureError(stage: string, error: unknown) {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  const allowed = typeof code === "string" && /^(P\d{4}|[A-Z0-9]{5})$/u.test(code) ? code : "unclassified";
  return new Error(`Staff Dashboard fixture ${stage} failed (${allowed}); sensitive details withheld.`);
}

// Independently authored arithmetic, not values derived from production helpers.
// Active eight = ten minus CLOSED/CANCELLED. LOW/MEDIUM/HIGH/URGENT each have two active rows.
const statusCounts: Record<TicketStatus, number> = {
  NEW: 1, OPEN: 2, IN_PROGRESS: 1, WAITING_FOR_REQUESTER: 1,
  RESOLVED: 2, CLOSED: 1, REOPENED: 1, CANCELLED: 1,
};
const priorities: Record<RequestedPriority, number> = { LOW: 2, MEDIUM: 2, HIGH: 2, URGENT: 2 };
const zeroStatuses: Record<TicketStatus, number> = {
  NEW: 0, OPEN: 0, IN_PROGRESS: 0, WAITING_FOR_REQUESTER: 0, RESOLVED: 0, CLOSED: 0, REOPENED: 0, CANCELLED: 0,
};
const zeroPriorities: Record<RequestedPriority, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, URGENT: 0 };
const zeroActions: Record<ActionStatus, number> = { PLANNED: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELLED: 0 };
const aActions: Record<ActionStatus, number> = { PLANNED: 4, IN_PROGRESS: 2, COMPLETED: 1, CANCELLED: 1 };
const bActions: Record<ActionStatus, number> = { PLANNED: 1, IN_PROGRESS: 1, COMPLETED: 1, CANCELLED: 0 };
const ticketSpecs: Array<{ name: string; status: TicketStatus; owner: "A" | "B" | null; priority: RequestedPriority; hours: number }> = [
  { name: "new", status: "NEW", owner: null, priority: "LOW", hours: 9 },
  { name: "open-A", status: "OPEN", owner: "A", priority: "HIGH", hours: 8 },
  { name: "progress-B", status: "IN_PROGRESS", owner: "B", priority: "URGENT", hours: 7 },
  { name: "waiting", status: "WAITING_FOR_REQUESTER", owner: null, priority: "MEDIUM", hours: 6 },
  { name: "reopened-A", status: "REOPENED", owner: "A", priority: "HIGH", hours: 4 },
  { name: "resolved-A", status: "RESOLVED", owner: "A", priority: "MEDIUM", hours: 3 },
  { name: "closed-B", status: "CLOSED", owner: "B", priority: "URGENT", hours: 2 },
  { name: "cancelled", status: "CANCELLED", owner: null, priority: "HIGH", hours: 240 },
  { name: "legacy-resolved", status: "RESOLVED", owner: null, priority: "LOW", hours: 240 },
  { name: "open-B", status: "OPEN", owner: "B", priority: "URGENT", hours: 2 },
];
const aFirstFive = ["A-planned-1", "A-started-1", "A-planned-2", "A-planned-3", "A-started-2"];
const bFirstFive = ["B-planned", "B-started"];

async function addActor(name: string, role: UserRole) {
  const { user, password } = await createAuthUser({ email: `${marker}-${name}@example.test`, role });
  userIds.push(user.id); // Track before any subsequent login failure.
  const login = await loginRequest(user.email, password);
  expect(login.status, "Real inherited login succeeds; response withheld").toBe(200);
  actors.set(name, { id: user.id, name: user.name, role, cookie: cookieHeader(login.headers["set-cookie"]) });
}

async function addTicket(spec: typeof ticketSpecs[number]) {
  const ticket = await prisma.ticket.create({ data: {
    ticketNumber: `D48-${randomUUID().replaceAll("-", "").slice(0, 12)}`, clientSubmissionId: randomUUID(),
    requesterId: who("requester").id, categoryId: categoryIds[0]!, relatedSystemId: systemIds[0]!,
    ownerId: spec.owner === null ? null : who(spec.owner).id, currentStatus: spec.status,
    requestedPriority: spec.priority === "LOW" ? "URGENT" : "LOW", itPriority: spec.priority,
    summary: `${spec.name} <script>literal dashboard summary</script>`, description: `${marker} private Ticket body`,
    ticketDate: ago(30 * 24), createdAt: ago(30 * 24), updatedAt: ago(spec.hours),
  } });
  ticketIds.push(ticket.id); tickets.set(spec.name, ticket);
  // Valid historical edges in directly constructed read fixtures. The legacy
  // RESOLVED parent intentionally has NO event; these are not endpoint workflows.
  if (spec.name === "legacy-resolved" || spec.status === "NEW") return;
  const steps: Array<[TicketStatus, TicketStatus, number]> = spec.status === "CANCELLED"
    ? [["NEW", "CANCELLED", 240]] : [["NEW", "OPEN", 20 * 24]];
  if (spec.status === "IN_PROGRESS" || spec.status === "WAITING_FOR_REQUESTER") steps.push(["OPEN", spec.status, spec.hours]);
  if (spec.status === "REOPENED") steps.push(["OPEN", "RESOLVED", 240], ["RESOLVED", "REOPENED", 4]);
  if (spec.status === "RESOLVED") steps.push(["OPEN", "RESOLVED", 10], ["RESOLVED", "REOPENED", 9],
    ["REOPENED", "IN_PROGRESS", 8], ["IN_PROGRESS", "RESOLVED", 3]);
  if (spec.status === "CLOSED") steps.push(["OPEN", "RESOLVED", 3], ["RESOLVED", "CLOSED", 2]);
  await prisma.ticketStatusHistory.createMany({ data: steps.map(([fromStatus, toStatus, hours]) => ({
    ticketId: ticket.id, actorId: who("B").id, fromStatus, toStatus, createdAt: ago(hours),
    reason: toStatus === "CANCELLED" ? "Synthetic read cohort cancellation" : null,
  })) });
}

async function addAction(name: string, ticketName: string, assignee: "A" | "B", status: ActionStatus, hours: number) {
  const createdAt = ago(hours);
  let action = await prisma.action.create({ data: {
    ticketId: parent(ticketName).id, createdById: who("C").id, assigneeId: who(assignee).id,
    description: `${name} <script>literal Action</script>`, attachmentNotes: "<script>literal notes, not a file</script>",
    followUpRequired: true, followUpNote: "Retained informative follow-up", actionAt: createdAt, createdAt, updatedAt: createdAt,
  } });
  actions.set(name, action); // Own by parent immediately, even if history later fails.
  await prisma.actionHistory.create({ data: { actionId: action.id, actorId: who("C").id,
    event: "ACTION_CREATED", actionVersion: 1, before: Prisma.DbNull, after: actionSnapshot(action), createdAt } });
  const initial = action;
  if (status === "IN_PROGRESS" || status === "COMPLETED") {
    const before = action, instant = new Date(createdAt.getTime() + 1);
    action = await prisma.action.update({ where: { id: action.id }, data: { status: "IN_PROGRESS", version: 2, updatedAt: instant } });
    await prisma.actionHistory.create({ data: { actionId: action.id, actorId: who(assignee).id,
      event: "ACTION_STARTED", actionVersion: 2, before: actionSnapshot(before), after: actionSnapshot(action), createdAt: instant } });
  }
  if (status === "COMPLETED" || status === "CANCELLED") {
    const before = action, instant = new Date(createdAt.getTime() + before.version);
    const performer = assignee === "A" ? who("C") : who("A"); // Not the assignee; C still has zero assignments.
    action = await prisma.action.update({ where: { id: action.id }, data: {
      status, version: before.version + 1, updatedAt: instant,
      ...(status === "COMPLETED" ? { result: "Completed literal result", performedById: performer.id, completedAt: instant }
        : { cancelledAt: instant, cancellationReason: "Synthetic terminal assignment", result: "Retained cancelled draft" }),
    } });
    await prisma.actionHistory.create({ data: { actionId: action.id,
      actorId: status === "COMPLETED" ? performer.id : who("B").id,
      event: status === "COMPLETED" ? "ACTION_COMPLETED" : "ACTION_CANCELLED", actionVersion: action.version,
      before: actionSnapshot(before), after: actionSnapshot(action), createdAt: instant } });
  }
  actions.set(name, action);
  if (name === "A-planned-1") await prisma.mutationReceipt.create({ data: {
    actorId: initial.createdById, clientMutationId: randomUUID(), operation: "CREATE_ACTION", ticketId: initial.ticketId, actionId: initial.id,
    inputFingerprint: createHash("sha256").update(randomUUID()).digest("hex"),
    safeResponse: { action: expectedAction(initial), ticketUpdatedAt: parent(ticketName).updatedAt.toISOString() }, createdAt,
  } });
}

// Explicit safe representation from fixture scalar observations; no production projector.
function expectedAction(action: Action): ActionDTO {
  const identity = (id: number) => {
    const actor = [...actors.values()].find((value) => value.id === id)!;
    return { id: actor.id, name: actor.name };
  };
  return {
    id: action.id, ticketId: action.ticketId, actionAt: action.actionAt.toISOString(), description: action.description,
    result: action.result, createdBy: identity(action.createdById), assignee: identity(action.assigneeId),
    performedBy: action.performedById === null ? null : identity(action.performedById), status: action.status,
    followUpRequired: action.followUpRequired, followUpNote: action.followUpNote, attachmentNotes: action.attachmentNotes,
    cancellationReason: action.cancellationReason, createdAt: action.createdAt.toISOString(), updatedAt: action.updatedAt.toISOString(),
    completedAt: action.completedAt?.toISOString() ?? null, cancelledAt: action.cancelledAt?.toISOString() ?? null, version: action.version,
  };
}

beforeAll(async () => {
  try {
    const identity = configureTestDatabaseEnvironment();
    const operational = process.env.TOKTICKIT_DEVELOPMENT_DATABASE_URL;
    expect(Boolean(operational) && decodeURIComponent(new URL(operational!).pathname.slice(1)) !== identity.databaseName,
      "Dedicated database distinct from operational; identities withheld").toBe(true);
    const [live] = await prisma.$queryRaw<Array<{ database: string; schema: string }>>`SELECT current_database() AS database,current_schema() AS schema`;
    expect(live.database === identity.databaseName && live.schema === identity.schema, "Actual guard matches live target; identities withheld").toBe(true);
    isolated = true;
    await addActor("A", "IT_STAFF"); await addActor("B", "ADMINISTRATOR");
    await addActor("C", "IT_STAFF"); await addActor("requester", "REQUESTER");
    categoryIds.push((await prisma.category.create({ data: { name: `${marker} cohort` } })).id);
    categoryIds.push((await prisma.category.create({ data: { name: `${marker} unmatched` } })).id);
    systemIds.push((await prisma.relatedSystem.create({ data: { name: marker } })).id);
    const [observed] = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT CURRENT_TIMESTAMP AS now`;
    clock = observed.now.getTime(); // No global fake clock or altered authentication lifetime.
    for (const spec of ticketSpecs) await addTicket(spec);
    await addAction("A-planned-1", "progress-B", "A", "PLANNED", 72);
    await addAction("A-started-1", "open-B", "A", "IN_PROGRESS", 60);
    await addAction("A-planned-2", "waiting", "A", "PLANNED", 48);
    await addAction("A-planned-3", "open-A", "A", "PLANNED", 36);
    await addAction("A-started-2", "reopened-A", "A", "IN_PROGRESS", 36);
    await addAction("A-planned-4", "new", "A", "PLANNED", 24);
    await addAction("A-completed", "closed-B", "A", "COMPLETED", 80);
    await addAction("A-cancelled", "cancelled", "A", "CANCELLED", 80);
    await addAction("B-planned", "open-A", "B", "PLANNED", 20);
    await addAction("B-started", "open-A", "B", "IN_PROGRESS", 18);
    await addAction("B-completed", "resolved-A", "B", "COMPLETED", 80);
    await prisma.internalNote.create({ data: { ticketId: parent("open-A").id, authorId: who("B").id, content: privateNote } });
    await prisma.publicComment.create({ data: { ticketId: parent("open-A").id, authorId: who("requester").id, content: "Not a Dashboard collection" } });
    const scope = { categoryId: categoryIds[0]! };
    const active: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED", "RESOLVED"];
    const recent = { gte: ago(6 * 24), lte: new Date(clock) };
    const sanity = await Promise.all([
      prisma.ticket.count({ where: scope }), prisma.ticket.count({ where: { ...scope, currentStatus: { in: active } } }),
      prisma.ticket.count({ where: { ...scope, currentStatus: { in: active }, ownerId: null } }),
      ...["A", "B", "C"].map((name) => prisma.ticket.count({ where: { ...scope, currentStatus: { in: active }, ownerId: who(name).id } })),
      prisma.ticket.count({ where: { ...scope, updatedAt: recent } }),
      prisma.ticket.count({ where: { ...scope, currentStatus: { in: ["RESOLVED", "CLOSED"] }, statusHistory: { some: { toStatus: "RESOLVED", createdAt: recent } } } }),
    ]);
    safeEqual(sanity, [10, 8, 3, 3, 2, 0, 8, 2], "Independently confirmed ten-Ticket fixture arithmetic");
    for (const [name, count] of Object.entries(statusCounts)) expect(await prisma.ticket.count({ where: { ...scope, currentStatus: name as TicketStatus } })).toBe(count);
    for (const priority of ["LOW", "MEDIUM", "HIGH", "URGENT"] as const) expect(await prisma.ticket.count({ where: { ...scope, currentStatus: { in: active }, itPriority: priority } })).toBe(2);
    for (const [name, counts] of [["A", aActions], ["B", bActions], ["C", zeroActions]] as const) {
      for (const status of ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const) {
        expect(await prisma.action.count({ where: { ticket: scope, assigneeId: who(name).id, status } })).toBe(counts[status]);
      }
    }
    expect(await prisma.action.count({ where: { ticket: { ...scope, currentStatus: { in: ["RESOLVED", "CLOSED", "CANCELLED"] } }, status: { in: ["PLANNED", "IN_PROGRESS"] } } })).toBe(0);
    expect(await prisma.ticketStatusHistory.count({ where: { ticketId: parent("legacy-resolved").id } })).toBe(0);
    expect(await prisma.ticketStatusHistory.count({ where: { ticketId: parent("resolved-A").id, toStatus: "RESOLVED" } })).toBe(2);
  } catch (error) { throw fixtureError("setup", error); }
});

async function domainDigest() {
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
    prisma.internalNote.findMany({ where: owned, orderBy: { id: "asc" } }),
    prisma.publicComment.findMany({ where: owned, orderBy: { id: "asc" } }),
    prisma.attachment.findMany({ where: owned, orderBy: { id: "asc" } }),
    prisma.seedFixture.findMany({ where: { OR: [{ userId: { in: userIds } }, { ticketId: { in: ticketIds } },
      { categoryId: { in: categoryIds } }, { relatedSystemId: { in: systemIds } }] }, orderBy: { id: "asc" } }),
    prisma.ticketNumberSequence.findMany({ orderBy: { year: "asc" } }),
  ]);
  // Real auth/session/throttle bookkeeping is excluded, never domain timestamps.
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

async function readDashboard(current?: Actor, categoryId = categoryIds[0]!) {
  const before = await domainDigest(), startedAt = Date.now();
  try {
    const call = request(app).get("/api/dashboard/staff").query({ categoryId });
    if (current) call.set("Cookie", current.cookie);
    const response = await call;
    return { response, startedAt, finishedAt: Date.now(), categoryId };
  } finally {
    expect(await domainDigest() === before, "Read/denial preserves exact owned domain rows/history/receipts/numbering; digests withheld").toBe(true);
  }
}

function utc(value: string) {
  expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
  expect(new Date(value).toISOString()).toBe(value);
}
function assertMetadata(body: StaffDashboardResponse, observed: Awaited<ReturnType<typeof readDashboard>>) {
  utc(body.asOf); expect(body.timezone).toBe("Asia/Bangkok");
  expect(Date.parse(body.asOf)).toBeGreaterThanOrEqual(observed.startedAt);
  expect(Date.parse(body.asOf)).toBeLessThanOrEqual(observed.finishedAt);
  utc(body.recentWindow.from); utc(body.recentWindow.before);
  const bangkokDate = new Date(Date.parse(body.asOf) + 7 * 3_600_000).toISOString().slice(0, 10);
  const midnight = Date.parse(`${bangkokDate}T00:00:00.000+07:00`);
  safeEqual(body.recentWindow, { from: new Date(midnight - 6 * 86_400_000).toISOString(), before: new Date(midnight + 86_400_000).toISOString() }, "Bangkok calendar window, not rolling hours");
  expect(body.filters.categoryId).toBe(observed.categoryId);
  for (const [name, value] of Object.entries(body.filters)) {
    expect(["search", "categoryId", "relatedSystemId", "requestedPriority", "itPriority", "currentStatus", "owner"]).toContain(name);
    if (name !== "categoryId") expect(value === (name === "search" ? "" : null), "No invented effective base filter").toBe(true);
  }
}
function descriptor(actual: Descriptor, categoryId: number, path: string, predicates: Record<string, string>) {
  expect(actual.path).toBe(path);
  expect(actual.query !== null && typeof actual.query === "object" && !Array.isArray(actual.query)).toBe(true);
  expect(String(actual.query.categoryId)).toBe(String(categoryId));
  for (const [name, value] of Object.entries(predicates)) expect(String(actual.query[name])).toBe(value);
  const allowed = ["search", "categoryId", "relatedSystemId", "requestedPriority", "itPriority", "currentStatus", "owner", "statusGroup",
    "dashboardWidget", "widgetStatus", "widgetItPriority", "updatedFrom", "updatedBefore", "resolvedFrom", "resolvedBefore", "sortBy", "sortOrder", "page", "pageSize", "assignee", "status", "actionStatusGroup"];
  for (const name of Object.keys(actual.query)) expect(allowed).toContain(name);
}
function assertDescriptors(body: StaffDashboardResponse, categoryId: number) {
  const drill = body.drillDown, path = "/api/staff/tickets";
  descriptor(drill.unassigned, categoryId, path, { dashboardWidget: "unassigned", statusGroup: "active" });
  descriptor(drill.mine, categoryId, path, { dashboardWidget: "mine", statusGroup: "active" });
  expect(drill.mine.query.actorId).toBeUndefined(); // Identity is session-derived, not an ID selector.
  for (const status of Object.keys(statusCounts) as TicketStatus[]) descriptor(drill.byStatus[status], categoryId, path, { dashboardWidget: "status", widgetStatus: status });
  for (const priority of Object.keys(priorities) as RequestedPriority[]) descriptor(drill.byItPriority[priority], categoryId, path, { dashboardWidget: "itPriority", widgetItPriority: priority, statusGroup: "active" });
  descriptor(drill.recentUpdated, categoryId, path, { dashboardWidget: "recentUpdated", updatedFrom: body.recentWindow.from,
    updatedBefore: body.recentWindow.before, sortBy: "updatedAt", sortOrder: "desc" });
  descriptor(drill.recentResolved, categoryId, path, { dashboardWidget: "recentResolved", resolvedFrom: body.recentWindow.from,
    resolvedBefore: body.recentWindow.before, sortBy: "resolvedAt", sortOrder: "desc" });
  descriptor(drill.myUnfinishedActions, categoryId, "/api/staff/actions", { assignee: "me", actionStatusGroup: "unfinished" });
  expect(drill.myUnfinishedActions.query.status).toBeUndefined();
  for (const status of Object.keys(zeroActions) as ActionStatus[]) {
    descriptor(drill.myActionsByStatus[status], categoryId, "/api/staff/actions", { assignee: "me", status });
    expect(drill.myActionsByStatus[status].query.actionStatusGroup).toBeUndefined();
  }
}
function assertTicketRows(rows: TicketRow[], names: string[], resolution: boolean) {
  expect(Array.isArray(rows)).toBe(true); expect(rows.length).toBeLessThanOrEqual(5);
  expect(rows.map((row) => row.id)).toEqual(names.map((name) => parent(name).id));
  rows.forEach((row, index) => {
    const source = parent(names[index]!);
    const owner = source.ownerId === null ? null : [...actors.values()].find((actor) => actor.id === source.ownerId)!;
    const expected = { id: source.id, ticketNumber: source.ticketNumber, summary: source.summary, currentStatus: source.currentStatus,
      requestedPriority: source.requestedPriority, itPriority: source.itPriority, updatedAt: source.updatedAt.toISOString(),
      owner: owner === null ? null : { id: owner.id, name: owner.name, role: owner.role } };
    const keys = ["id", "ticketNumber", "summary", "currentStatus", "requestedPriority", "itPriority", "owner", "updatedAt"];
    expect(Object.keys(row).every((key) => [...keys, "resolvedAt"].includes(key))).toBe(true);
    safeEqual(Object.fromEntries(keys.map((key) => [key, row[key as keyof TicketRow]])), expected, "Exact safe Ticket projection/literal text");
    if (resolution) expect(row.resolvedAt).toBe(ago(3).toISOString());
  });
}
function assertAssignedRows(rows: AssignedRow[], names: string[], current: Actor) {
  expect(Array.isArray(rows)).toBe(true); expect(rows.length).toBeLessThanOrEqual(5);
  expect(rows.map((row) => row.action.id)).toEqual(names.map((name) => child(name).id));
  for (const [index, row] of rows.entries()) {
    const source = child(names[index]!), ticket = [...tickets.values()].find((value) => value.id === source.ticketId)!;
    safeEqual(row.ticket, { id: ticket.id, ticketNumber: ticket.ticketNumber, summary: ticket.summary, currentStatus: ticket.currentStatus }, "API-07 bounded parent projection");
    expect(Object.keys(row.action).sort()).toEqual([...ACTION_KEYS].sort());
    safeEqual(row.action, expectedAction(source), "Complete safe ActionDTO, literal text, scalar times and current identities");
    expect(row.action.assignee.id).toBe(current.id); expect(row.action.performedBy).toBeNull();
    expect(Object.keys(row.action.createdBy).sort()).toEqual(["id", "name"]);
    expect(Object.keys(row.action.assignee).sort()).toEqual(["id", "name"]);
  }
}
function assertSuccess(observed: Awaited<ReturnType<typeof readDashboard>>, current: Actor, mine: number, bins: Record<ActionStatus, number>, unfinished: number, names: string[], empty = false) {
  expect(observed.response.status, "API-09 returns an authorized Dashboard, not an unmatched route").toBe(200);
  expect(observed.response.headers["content-type"]).toMatch(/application\/json/u);
  expect(observed.response.headers["cache-control"]).toBe("private, no-store");
  const body = observed.response.body as StaffDashboardResponse;
  assertMetadata(body, observed);
  safeEqual(body.metrics, {
    unassigned: empty ? 0 : 3, mine, byStatus: empty ? zeroStatuses : statusCounts,
    byItPriority: empty ? zeroPriorities : priorities, recentUpdated: empty ? 0 : 8, recentResolved: empty ? 0 : 2,
    myActionsByStatus: bins, myUnfinishedActions: unfinished,
  }, "Exactly eight approved metric keys, all Ticket/priority/Action bins and independent actor/global counts");
  assertTicketRows(body.lists.recentUpdated, empty ? [] : ["open-B", "closed-B", "resolved-A", "reopened-A", "waiting"], false);
  assertTicketRows(body.lists.recentResolved, empty ? [] : ["closed-B", "resolved-A"], true);
  assertAssignedRows(body.lists.myUnfinishedActions, names, current);
  assertDescriptors(body, observed.categoryId);
  const serialized = JSON.stringify(body);
  expect(serialized.includes(privateNote) || serialized.includes("private Ticket body")).toBe(false);
  expect(/passwordHash|tokenHash|csrfTokenHash|inputFingerprint|safeResponse|internalNotes|storageKey|"email"/u.test(serialized), "No private User/session/Notes/receipt/storage material").toBe(false);
}
function assertDenial(response: request.Response, status: number, code: string) {
  expect(response.status, "Missing/unauthorized sessions reach the inherited safe API boundary").toBe(status);
  expect(response.headers["content-type"]).toMatch(/application\/json/u);
  expect(response.headers["cache-control"]).toBe("private, no-store");
  expect(Object.keys(response.body)).toEqual(["error"]);
  expect(response.body.error.code).toBe(code);
  expect(typeof response.body.error.message).toBe("string"); expect(response.body.error.message.trim().length).toBeGreaterThan(0);
  expect(Object.keys(response.body.error).every((key) => ["code", "message", "fields", "requestId"].includes(key))).toBe(true);
  expect(/passwordHash|tokenHash|csrfTokenHash|inputFingerprint|safeResponse|internalNotes|PrismaClient|stack|postgres/iu.test(JSON.stringify(response.body)), "Safe denial only; no business/private content").toBe(false);
}

describe("API-09 Staff Dashboard: first six metric/assignment/authorization RED cases", () => {
  it("Staff A receives global category-filtered metrics and independent A-specific ownership/assignments", async () => {
    assertSuccess(await readDashboard(who("A")), who("A"), 3, aActions, 6, aFirstFive);
  });
  it("Administrator B has the same global metrics but B-specific mine and My Actions values", async () => {
    assertSuccess(await readDashboard(who("B")), who("B"), 2, bActions, 2, bFirstFive);
  });
  it("Staff C has zero assignments despite creating/performing other workers' Actions and nonempty global metrics", async () => {
    assertSuccess(await readDashboard(who("C")), who("C"), 0, zeroActions, 0, []);
  });
  it("a genuinely unmatched owned category returns all zero bins and empty bounded lists with metadata", async () => {
    assertSuccess(await readDashboard(who("A"), categoryIds[1]!), who("A"), 0, zeroActions, 0, [], true);
  });
  it("missing session receives safe 401 AUTHENTICATION_REQUIRED without domain changes", async () => {
    assertDenial((await readDashboard()).response, 401, "AUTHENTICATION_REQUIRED");
  });
  it("Requester receives inherited safe 403 ROLE_FORBIDDEN without domain changes", async () => {
    assertDenial((await readDashboard(who("requester"))).response, 403, "ROLE_FORBIDDEN");
  });
});

afterAll(async () => {
  try {
    if (!isolated) return;
    const owned = { ticketId: { in: ticketIds } };
    await prisma.$transaction([
      prisma.seedFixture.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { ticketId: { in: ticketIds } },
        { categoryId: { in: categoryIds } }, { relatedSystemId: { in: systemIds } }] } }),
      prisma.mutationReceipt.deleteMany({ where: owned }),
      prisma.actionHistory.deleteMany({ where: { action: owned } }), prisma.action.deleteMany({ where: owned }),
      prisma.ticketStatusHistory.deleteMany({ where: owned }), prisma.internalNote.deleteMany({ where: owned }),
      prisma.publicComment.deleteMany({ where: owned }), prisma.attachment.deleteMany({ where: owned }),
      prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } }),
      prisma.authSession.deleteMany({ where: { userId: { in: userIds } } }), prisma.user.deleteMany({ where: { id: { in: userIds } } }),
      prisma.category.deleteMany({ where: { id: { in: categoryIds } } }), prisma.relatedSystem.deleteMany({ where: { id: { in: systemIds } } }),
    ]);
    const remaining = await Promise.all([
      prisma.user.count({ where: { id: { in: userIds } } }), prisma.authSession.count({ where: { userId: { in: userIds } } }),
      prisma.ticket.count({ where: { id: { in: ticketIds } } }), prisma.ticketStatusHistory.count({ where: owned }),
      prisma.action.count({ where: owned }), prisma.actionHistory.count({ where: { action: owned } }), prisma.mutationReceipt.count({ where: owned }),
      prisma.internalNote.count({ where: owned }), prisma.publicComment.count({ where: owned }), prisma.attachment.count({ where: owned }),
      prisma.category.count({ where: { id: { in: categoryIds } } }), prisma.relatedSystem.count({ where: { id: { in: systemIds } } }),
    ]);
    safeEqual(remaining, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "Zero owned fixture/session/domain/reference rows after FK-safe cleanup");
    console.info("Issue48 first Dashboard RED: guarded live target, independently checked arithmetic, owned cleanup verified; no fault/schema resources created.");
  } catch (error) { throw fixtureError("cleanup", error); }
  finally { await prisma.$disconnect(); }
});
