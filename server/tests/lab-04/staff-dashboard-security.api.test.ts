import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Prisma, type Action, type ActionStatus, type Ticket, type User, type UserRole } from "@prisma/client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../../src/app.js";
import { IDLE_SESSION_MILLISECONDS } from "../../src/auth/session.js";
import { getPrisma } from "../../src/prisma.js";
import { configureTestDatabaseEnvironment } from "../../src/testing/test-database.js";
import { APPROVED_ORIGIN, cookieHeader, cookieValue, createAuthUser, loginRequest } from "../lab-03/auth-test-helpers.js";
import { actionSnapshot } from "./action-read-test-fixtures.js";

// Gap map (partial AC-01/02/25/26/28/34; T-01/25/26/28/34/54):
// - staff-dashboard.api: basic Dashboard denial, actor arithmetic, whitelist.
// - dashboard-drilldown.api: descriptor intersections and safe row projections.
// - staff-actions.api: expiry/inactivity/password guards, query/date validation.
// Here: new Dashboard/extended-list live-session boundaries; API-07's remaining
// invalid-cookie/real-logout/demotion paths; header spoofing with populated
// private sentinels; historical identities; injection-shaped inputs; safe
// business-failure classifications and the approved no-shared-cache policy.
// No backend outage, mutation-permission or naturally occurring race claim.
const db = getPrisma(), marker = `issue48-security-${randomUUID()}`;
const ids: number[] = [], parents: Ticket[] = [], actions: Action[] = [];
const secrets: string[] = [], privateValues = [
  `${marker} private Ticket description`, `${marker} private Internal Note`, `${marker} private comment`,
  `${marker}/private-storage-key`, `${marker} private receipt payload`, `${marker} internal fault details`,
];
type Actor = { user: User; cookie: string; csrf: string; sessionId: string };
type Descriptor = { path: string; query: Record<string, string | number> };
const actors = new Map<string, Actor>();
let category!: { id: number; name: string }, system!: { id: number; name: string };
let guarded = false, updatedAt: Date, resolvedAt: Date;
const who = (label: string) => actors.get(label)!;
const surfaces = [
  { name: "Dashboard", path: "/api/dashboard/staff", log: "Database error while fetching Staff Dashboard." },
  { name: "Ticket drill-down", path: "/api/staff/tickets", log: "Database error while listing the Staff Ticket Queue." },
  { name: "My Actions", path: "/api/staff/actions", log: "Database error while listing current-user Actions." },
] as const;
type Surface = typeof surfaces[number];
function safeEqual(actual: unknown, expected: unknown, label: string) {
  expect(isDeepStrictEqual(actual, expected), `${label}; comparison values withheld`).toBe(true);
}
function fixtureError(stage: string, error: unknown) {
  const candidate = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  const code = typeof candidate === "string" && /^(P\d{4}|[0-9A-Z]{5})$/u.test(candidate) ? candidate : "unclassified";
  return new Error(`Owned Staff security ${stage} failed (${code}); sensitive details withheld.`);
}
async function actor(label: string, role: UserRole = "IT_STAFF") {
  try {
    const value = await createAuthUser({ email: `${marker}-${label}-${randomUUID()}@example.test`, role });
    ids.push(value.user.id); secrets.push(value.password, value.user.passwordHash);
    // The inherited auth helper intentionally uses one default name. Distinct
    // owned names make incorrect cross-identity name projections detectable.
    value.user = await db.user.update({ where: { id: value.user.id }, data: { name: `Owned ${role} ${randomUUID().slice(0, 8)}` } });
    if (role !== "REQUESTER") privateValues.push(value.user.email);
    const login = await loginRequest(value.user.email, value.password);
    expect(login.status, "Real owned actor login; response withheld").toBe(200);
    const cookie = cookieHeader(login.headers["set-cookie"]), csrf = cookieValue(login.headers["set-cookie"], "toktickit_csrf");
    const session = await db.authSession.findFirstOrThrow({ where: { userId: value.user.id } });
    secrets.push(csrf, cookieValue(login.headers["set-cookie"], "toktickit_session"), session.tokenHash, session.csrfTokenHash);
    return { user: value.user, cookie, csrf, sessionId: session.id };
  } catch (error) { throw fixtureError("actor setup", error); }
}
function identity(id: number) {
  const value = [...actors.values()].find(({ user }) => user.id === id)!.user;
  return { id, name: value.name };
}
function expectedAction(value: Action) {
  return { id: value.id, ticketId: value.ticketId, actionAt: value.actionAt.toISOString(), description: value.description,
    result: value.result, createdBy: identity(value.createdById), assignee: identity(value.assigneeId),
    performedBy: value.performedById === null ? null : identity(value.performedById), status: value.status,
    followUpRequired: value.followUpRequired, followUpNote: value.followUpNote, attachmentNotes: value.attachmentNotes,
    cancellationReason: value.cancellationReason, createdAt: value.createdAt.toISOString(), updatedAt: value.updatedAt.toISOString(),
    completedAt: value.completedAt?.toISOString() ?? null, cancelledAt: value.cancelledAt?.toISOString() ?? null, version: value.version };
}
function expectedAssigned(value: Action) {
  const parent = parents.find(({ id }) => id === value.ticketId)!;
  return { ticket: { id: parent.id, ticketNumber: parent.ticketNumber, summary: parent.summary, currentStatus: parent.currentStatus }, action: expectedAction(value) };
}
function ticketRow(value: Ticket, dashboard: boolean, resolved = false) {
  const owner = [...actors.values()].find(({ user }) => user.id === value.ownerId)!.user;
  const common = { id: value.id, ticketNumber: value.ticketNumber, summary: value.summary, currentStatus: value.currentStatus,
    requestedPriority: "HIGH", itPriority: "MEDIUM", owner: { id: owner.id, name: owner.name, role: owner.role },
    updatedAt: value.updatedAt.toISOString(), ...(resolved ? { resolvedAt: resolvedAt.toISOString() } : {}) };
  return dashboard ? common : { ...common, ticketDate: value.ticketDate.toISOString(),
    requester: { ...identity(who("requester").user.id), email: who("requester").user.email }, category, relatedSystem: system,
    requesterResolutionIndicatedAt: null };
}
async function addAction(parent: Ticket, assignee: "A" | "B", status: ActionStatus) {
  const createdAt = new Date(updatedAt.getTime() - 7_200_000 + actions.length * 100);
  let value = await db.action.create({ data: { ticketId: parent.id, createdById: who("history").user.id,
    assigneeId: who(assignee).user.id, description: `Literal <script>Action ${actions.length}</script>`, result: "Retained literal draft",
    followUpRequired: true, followUpNote: "Retained valid follow-up", attachmentNotes: "<script>literal Attachment Notes</script>",
    createdAt, actionAt: createdAt, updatedAt: createdAt } });
  await db.actionHistory.create({ data: { actionId: value.id, actorId: value.createdById, event: "ACTION_CREATED", actionVersion: 1,
    before: Prisma.DbNull, after: actionSnapshot(value), createdAt } });
  if (status === "IN_PROGRESS" || status === "COMPLETED") {
    const before = value, instant = new Date(createdAt.getTime() + 1);
    value = await db.action.update({ where: { id: value.id }, data: { status: "IN_PROGRESS", version: 2, updatedAt: instant } });
    await db.actionHistory.create({ data: { actionId: value.id, actorId: who("history").user.id, event: "ACTION_STARTED", actionVersion: 2,
      before: actionSnapshot(before), after: actionSnapshot(value), createdAt: instant } });
  }
  if (status === "COMPLETED" || status === "CANCELLED") {
    const before = value, instant = new Date(createdAt.getTime() + value.version);
    value = await db.action.update({ where: { id: value.id }, data: { status, version: before.version + 1, updatedAt: instant,
      ...(status === "COMPLETED" ? { performedById: who("history").user.id, completedAt: instant, result: "Actual historical completion" }
        : { cancelledAt: instant, cancellationReason: "Owned historical cancellation" }) } });
    await db.actionHistory.create({ data: { actionId: value.id, actorId: who("history").user.id,
      event: status === "COMPLETED" ? "ACTION_COMPLETED" : "ACTION_CANCELLED", actionVersion: value.version,
      before: actionSnapshot(before), after: actionSnapshot(value), createdAt: instant } });
  }
  actions.push(value);
}

beforeAll(async () => {
  try {
    const target = configureTestDatabaseEnvironment(), operational = process.env.TOKTICKIT_DEVELOPMENT_DATABASE_URL;
    expect(Boolean(operational) && decodeURIComponent(new URL(operational!).pathname.slice(1)) !== target.databaseName,
      "Dedicated target differs from operational; identities withheld").toBe(true);
    const [live] = await db.$queryRaw<Array<{ database: string; schema: string; now: Date }>>`
      SELECT current_database() AS database,current_schema() AS schema,CURRENT_TIMESTAMP AS now`;
    expect(live.database === target.databaseName && live.schema === target.schema, "Actual guard matches live dedicated target; values withheld").toBe(true);
    guarded = true; updatedAt = new Date(live.now.getTime() - 3_600_000); resolvedAt = new Date(live.now.getTime() - 7_200_000);
    for (const [name, role] of [["A", "IT_STAFF"], ["B", "ADMINISTRATOR"], ["requester", "REQUESTER"], ["history", "IT_STAFF"]] as const) actors.set(name, await actor(name, role));
    category = await db.category.create({ data: { name: marker }, select: { id: true, name: true } });
    system = await db.relatedSystem.create({ data: { name: marker }, select: { id: true, name: true } });
    for (const [index, owner] of ["B", "B", "A", "history"].entries()) {
      const row = await db.ticket.create({ data: { ticketNumber: `D48SEC-${randomUUID().replaceAll("-", "").slice(0, 12)}`,
        clientSubmissionId: randomUUID(), requesterId: who("requester").user.id, ownerId: who(owner).user.id,
        categoryId: category.id, relatedSystemId: system.id, requestedPriority: "HIGH", itPriority: "MEDIUM", currentStatus: index === 3 ? "CLOSED" : "OPEN",
        summary: index === 0 ? "Literal %') OR TRUE;--_\\ <script>summary</script>" : `Owned safe summary ${index}`,
        description: privateValues[0]!, ticketDate: new Date(updatedAt.getTime() - 86_400_000),
        createdAt: new Date(updatedAt.getTime() - 86_400_000), updatedAt } });
      parents.push(row);
      await db.ticketStatusHistory.create({ data: { ticketId: row.id, actorId: who("history").user.id, fromStatus: "NEW", toStatus: "OPEN", reason: null,
        createdAt: new Date(resolvedAt.getTime() - 3_600_000) } });
      if (index === 3) await db.ticketStatusHistory.createMany({ data: [
        { ticketId: row.id, actorId: who("history").user.id, fromStatus: "OPEN", toStatus: "RESOLVED", reason: "Historical resolution", createdAt: resolvedAt },
        { ticketId: row.id, actorId: who("history").user.id, fromStatus: "RESOLVED", toStatus: "CLOSED", reason: "Historical closure", createdAt: updatedAt },
      ] });
    }
    await addAction(parents[0]!, "A", "PLANNED"); await addAction(parents[1]!, "A", "PLANNED");
    await addAction(parents[2]!, "B", "IN_PROGRESS"); await addAction(parents[3]!, "A", "COMPLETED"); await addAction(parents[3]!, "B", "CANCELLED");
    // Historical owner/creator/performer was eligible when these records were
    // created. Only terminal assignments/parent remain when deactivated.
    await db.user.update({ where: { id: who("history").user.id }, data: { isActive: false } });
    await db.internalNote.create({ data: { ticketId: parents[0]!.id, authorId: who("B").user.id, content: privateValues[1]! } });
    await db.publicComment.create({ data: { ticketId: parents[0]!.id, authorId: who("requester").user.id, content: privateValues[2]! } });
    await db.attachment.create({ data: { ticketId: parents[0]!.id, uploadedByUserId: who("requester").user.id, originalFilename: "owned.png",
      storageKey: privateValues[3]!, mimeType: "image/png", sizeBytes: 32 } });
    const fingerprint = createHash("sha256").update(randomUUID()).digest("hex"); secrets.push(fingerprint);
    await db.mutationReceipt.create({ data: { actorId: who("history").user.id, clientMutationId: randomUUID(), operation: "CREATE_ACTION",
      ticketId: parents[0]!.id, actionId: actions[0]!.id, inputFingerprint: fingerprint,
      safeResponse: { action: expectedAction(actions[0]!), ticketUpdatedAt: actions[0]!.createdAt.toISOString() }, createdAt: actions[0]!.createdAt } });
  } catch (error) { throw fixtureError("cohort setup", error); }
});

async function digest() {
  const owned = { ticketId: { in: parents.map(({ id }) => id) } };
  const values = await Promise.all([
    db.user.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" } }),
    db.ticket.findMany({ where: { id: { in: parents.map(({ id }) => id) } }, orderBy: { id: "asc" } }),
    db.ticketStatusHistory.findMany({ where: owned, orderBy: { id: "asc" } }), db.action.findMany({ where: owned, orderBy: { id: "asc" } }),
    db.actionHistory.findMany({ where: { action: owned }, orderBy: { id: "asc" } }), db.mutationReceipt.findMany({ where: owned, orderBy: { id: "asc" } }),
    db.internalNote.findMany({ where: owned, orderBy: { id: "asc" } }), db.publicComment.findMany({ where: owned, orderBy: { id: "asc" } }),
    db.attachment.findMany({ where: owned, orderBy: { id: "asc" } }), db.category.findMany({ where: { id: category.id } }),
    db.relatedSystem.findMany({ where: { id: system.id } }), db.ticketNumberSequence.findMany({ orderBy: { year: "asc" } }),
  ]);
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}
function params(surface: Surface) {
  return new URLSearchParams({ categoryId: String(category.id), ...(surface.name === "Ticket drill-down" ? { dashboardWidget: "mine", statusGroup: "active" } : {}),
    ...(surface.name === "My Actions" ? { assignee: "me", actionStatusGroup: "unfinished" } : {}) });
}
async function get(path: string, query: URLSearchParams, cookie?: string, headers: Record<string, string> = {}) {
  const before = await digest();
  try {
    const pending = request(app).get(`${path}?${query.toString()}`).set(headers);
    if (cookie !== undefined) pending.set("Cookie", cookie);
    return await pending;
  } finally { expect(await digest() === before, "Read/denial/fault preserves complete domain state; credential comparisons withheld; auth bookkeeping excluded").toBe(true); }
}
function noLeaks(body: unknown) {
  const text = JSON.stringify(body);
  expect(/passwordHash|tokenHash|csrfTokenHash|inputFingerprint|safeResponse|internalNotes|storageKey|PrismaClient|"stack"/u.test(text), "No private projection keys; response withheld").toBe(false);
  expect([...secrets, ...privateValues].some((value) => text.includes(value)), "No populated sensitive sentinels escape; values withheld").toBe(false);
}
function safeError(response: request.Response, status: number, code: string, field?: string) {
  expect(response.status).toBe(status); expect(response.headers["content-type"]).toMatch(/^application\/json\b/u);
  expect(Object.keys(response.body)).toEqual(["error"]);
  expect(Object.keys(response.body.error).sort()).toEqual(field === undefined ? ["code", "message"] : ["code", "fields", "message"]);
  expect(response.body.error.code).toBe(code);
  expect(typeof response.body.error.message === "string" && response.body.error.message.trim().length > 0).toBe(true);
  if (field !== undefined) expect(typeof response.body.error.fields[field] === "string" && response.body.error.fields[field].trim().length > 0).toBe(true);
  noLeaks(response.body);
  expect(/postgres(?:ql)?:|SELECT\s|INSERT\s|schema|\bat\s+\S+\.[jt]s:/iu.test(JSON.stringify(response.body)), "No SQL/schema/stack/connection disclosure; body withheld").toBe(false);
}
function follow(descriptor: Descriptor) {
  expect(["/api/staff/tickets", "/api/staff/actions"]).toContain(descriptor.path);
  expect(String(descriptor.query.categoryId)).toBe(String(category.id));
  const query = new URLSearchParams(); for (const [name, value] of Object.entries(descriptor.query)) query.set(name, String(value));
  return query;
}
function pagination(totalItems: number) { return { page: 1, pageSize: 10, totalItems, totalPages: totalItems === 0 ? 0 : 1, hasPreviousPage: false, hasNextPage: false }; }

afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  try {
    if (!guarded) return;
    const owned = { ticketId: { in: parents.map(({ id }) => id) } };
    await db.$transaction([
      db.mutationReceipt.deleteMany({ where: owned }), db.actionHistory.deleteMany({ where: { action: owned } }), db.action.deleteMany({ where: owned }),
      db.attachment.deleteMany({ where: owned }), db.internalNote.deleteMany({ where: owned }), db.publicComment.deleteMany({ where: owned }),
      db.ticketStatusHistory.deleteMany({ where: owned }), db.ticket.deleteMany({ where: { id: { in: parents.map(({ id }) => id) } } }),
      db.authSession.deleteMany({ where: { userId: { in: ids } } }), db.user.deleteMany({ where: { id: { in: ids } } }),
      db.category.deleteMany({ where: { id: category?.id ?? -1 } }), db.relatedSystem.deleteMany({ where: { id: system?.id ?? -1 } }),
    ]);
    const remaining = await Promise.all([
      db.user.count({ where: { id: { in: ids } } }), db.authSession.count({ where: { userId: { in: ids } } }),
      db.ticket.count({ where: { id: { in: parents.map(({ id }) => id) } } }), db.ticketStatusHistory.count({ where: owned }),
      db.action.count({ where: owned }), db.actionHistory.count({ where: { action: owned } }), db.mutationReceipt.count({ where: owned }),
      db.attachment.count({ where: owned }), db.internalNote.count({ where: owned }), db.publicComment.count({ where: owned }),
      db.category.count({ where: { id: category?.id ?? -1 } }), db.relatedSystem.count({ where: { id: system?.id ?? -1 } }),
    ]);
    safeEqual(remaining, Array(12).fill(0), "Zero owned security identities/sessions/domain/reference fixtures after FK-safe cleanup");
    console.info("Staff security cleanup: zero owned fixtures/sessions/references; all spies restored; no environment changes or fault resources; client disconnects.");
  } catch (error) { throw fixtureError("cleanup", error); }
  finally { vi.restoreAllMocks(); await db.$disconnect(); }
});

const conditions = ["invalid cookie", "idle expiry", "absolute expiry", "real logout", "now inactive", "now Requester", "password change before role denial"] as const;
type Condition = typeof conditions[number];
async function sessionCase(surface: Surface, condition: Condition) {
  const current = condition === "invalid cookie" ? undefined : await actor(`session-${randomUUID()}`);
  if (current !== undefined) {
    expect((await request(app).get("/api/auth/me").set("Cookie", current.cookie)).status).toBe(200);
    const now = Date.now();
    if (condition === "idle expiry") await db.authSession.update({ where: { id: current.sessionId }, data: {
      createdAt: new Date(now - IDLE_SESSION_MILLISECONDS - 120_000), lastSeenAt: new Date(now - IDLE_SESSION_MILLISECONDS - 60_000) } });
    if (condition === "absolute expiry") await db.authSession.update({ where: { id: current.sessionId }, data: {
      createdAt: new Date(now - 9 * 3_600_000), lastSeenAt: new Date(now), expiresAt: new Date(now - 60_000) } });
    if (condition === "real logout") {
      const logout = await request(app).post("/api/auth/logout").set("Cookie", current.cookie).set("Origin", APPROVED_ORIGIN).set("X-CSRF-Token", current.csrf);
      expect(logout.status).toBe(204); expect(await db.authSession.count({ where: { id: current.sessionId } })).toBe(0);
    }
    if (condition === "now inactive") await db.user.update({ where: { id: current.user.id }, data: { isActive: false } });
    if (condition === "now Requester" || condition === "password change before role denial") await db.user.update({ where: { id: current.user.id }, data: {
      role: "REQUESTER", mustChangePassword: condition === "password change before role denial" } });
  }
  const cookie = current?.cookie ?? `toktickit_session=${randomUUID()}`;
  const spy = vi.spyOn(db, "$transaction");
  try {
    const response = await get(surface.path, params(surface), cookie);
    const password = condition === "password change before role denial", role = condition === "now Requester";
    safeError(response, password || role ? 403 : 401, password ? "PASSWORD_CHANGE_REQUIRED" : role ? "ROLE_FORBIDDEN" : "AUTHENTICATION_REQUIRED");
    expect(spy).not.toHaveBeenCalled(); // Auth denial precedes the business snapshot.
    if (surface.name !== "Ticket drill-down") expect(response.headers["cache-control"]).toBe("private, no-store");
    if (current !== undefined && !password && !role) expect(await db.authSession.count({ where: { id: current.sessionId } })).toBe(0);
  } finally { spy.mockRestore(); }
}
describe.each(surfaces.slice(0, 2))("$name live-session security gaps", (surface) => {
  it.each(conditions)("enforces %s before business reads", (condition) => sessionCase(surface, condition));
  it.each(["missing", "Requester"])("keeps %s denial ahead of malformed query validation", async (condition) => {
    const query = params(surface); query.set("actorId", "1 OR TRUE --");
    const spy = vi.spyOn(db, "$transaction");
    try {
      safeError(await get(surface.path, query, condition === "missing" ? undefined : who("requester").cookie),
        condition === "missing" ? 401 : 403, condition === "missing" ? "AUTHENTICATION_REQUIRED" : "ROLE_FORBIDDEN");
      expect(spy).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); }
  });
});
describe("API-07 remaining session paths (existing expiry/password matrix retained)", () => {
  it.each(["invalid cookie", "real logout", "now Requester"] as const)("enforces %s", (condition) => sessionCase(surfaces[2], condition));
});

describe("Staff security: session-derived identity and complete safe projections", () => {
  it.each(["A", "B"])("%s ignores spoofed identity headers and executes authoritative descriptors", async (label) => {
    const current = who(label), other = who(label === "A" ? "B" : "A");
    const headers = { "X-User-Id": String(other.user.id), "X-Actor-Id": String(other.user.id), "X-Assignee-Id": String(other.user.id) };
    const response = await get(surfaces[0].path, params(surfaces[0]), current.cookie, headers);
    expect(response.status).toBe(200); expect(response.headers["cache-control"]).toBe("private, no-store"); noLeaks(response.body);
    expect(Object.keys(response.body).sort()).toEqual(["asOf", "drillDown", "filters", "lists", "metrics", "recentWindow", "timezone"]);
    expect(response.body.timezone).toBe("Asia/Bangkok"); expect(new Date(response.body.asOf).toISOString()).toBe(response.body.asOf);
    safeEqual(response.body.filters, { search: "", categoryId: category.id, relatedSystemId: null, requestedPriority: null, itPriority: null, currentStatus: null, owner: null }, "Normalized base filter allowlist");
    const bins = label === "A" ? { PLANNED: 2, IN_PROGRESS: 0, COMPLETED: 1, CANCELLED: 0 } : { PLANNED: 0, IN_PROGRESS: 1, COMPLETED: 0, CANCELLED: 1 };
    safeEqual(response.body.metrics, { unassigned: 0, mine: label === "A" ? 1 : 2,
      byStatus: { NEW: 0, OPEN: 3, IN_PROGRESS: 0, WAITING_FOR_REQUESTER: 0, RESOLVED: 0, CLOSED: 1, REOPENED: 0, CANCELLED: 0 },
      byItPriority: { LOW: 0, MEDIUM: 3, HIGH: 0, URGENT: 0 }, recentUpdated: 4, recentResolved: 1,
      myActionsByStatus: bins, myUnfinishedActions: label === "A" ? 2 : 1 }, "Complete metric allowlist; global/actor scope remains distinct");
    const unfinished = label === "A" ? actions.slice(0, 2) : [actions[2]!];
    safeEqual(response.body.lists, { recentUpdated: [...parents].reverse().map((row) => ticketRow(row, true)),
      recentResolved: [ticketRow(parents[3]!, true, true)], myUnfinishedActions: unfinished.map(expectedAssigned) }, "Complete safe bounded lists, inactive historical owner, exact server order and literal text");
    const base = { categoryId: String(category.id) }, window = response.body.recentWindow;
    expect(Object.keys(window).sort()).toEqual(["before", "from"]);
    for (const instant of [window.from, window.before]) expect(new Date(instant).toISOString()).toBe(instant);
    const ticket = (widget: string, extra: Record<string, string> = {}) => ({ path: "/api/staff/tickets", query: { ...base, dashboardWidget: widget, ...extra } });
    const action = (extra: Record<string, string>) => ({ path: "/api/staff/actions", query: { ...base, assignee: "me", ...extra } });
    safeEqual(response.body.drillDown, { unassigned: ticket("unassigned", { statusGroup: "active" }), mine: ticket("mine", { statusGroup: "active" }),
      byStatus: Object.fromEntries(["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"].map((status) => [status, ticket("status", { widgetStatus: status })])),
      byItPriority: Object.fromEntries(["LOW", "MEDIUM", "HIGH", "URGENT"].map((priority) => [priority, ticket("itPriority", { widgetItPriority: priority, statusGroup: "active" })])),
      recentUpdated: ticket("recentUpdated", { updatedFrom: window.from, updatedBefore: window.before, sortBy: "updatedAt", sortOrder: "desc" }),
      recentResolved: ticket("recentResolved", { statusGroup: "resolved", resolvedFrom: window.from, resolvedBefore: window.before, sortBy: "resolvedAt", sortOrder: "desc" }),
      myActionsByStatus: Object.fromEntries(["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"].map((status) => [status, action({ status })])),
      myUnfinishedActions: action({ actionStatusGroup: "unfinished" }) }, "Complete existing descriptor convention, no private selectors or payloads");
    const mine: Descriptor = response.body.drillDown.mine, mineQuery = follow(mine); mineQuery.set("page", "1"); mineQuery.set("pageSize", "10");
    const owned = label === "A" ? [parents[2]!] : [parents[1]!, parents[0]!];
    const list = await get(mine.path, mineQuery, current.cookie, headers); expect(list.status).toBe(200);
    safeEqual(list.body, { items: owned.map((row) => ticketRow(row, false)), counts: { matching: owned.length, mine: owned.length, unassigned: 0 }, pagination: pagination(owned.length) }, "Complete inherited Staff representation, actual session mine, exact IDs/totals"); noLeaks(list.body);
    const historical: Descriptor = response.body.drillDown.byStatus.CLOSED;
    const historicalRows = await get(historical.path, follow(historical), current.cookie, headers);
    expect(historicalRows.status).toBe(200);
    safeEqual(historicalRows.body, { items: [ticketRow(parents[3]!, false)], counts: { matching: 1, mine: 0, unassigned: 0 }, pagination: pagination(1) },
      "Globally readable terminal Ticket retains its inactive historical owner's safe id/name/role, without activation or private User fields");
    noLeaks(historicalRows.body);
    for (const [descriptor, expected] of [[response.body.drillDown.myUnfinishedActions, unfinished],
      [response.body.drillDown.myActionsByStatus[label === "A" ? "COMPLETED" : "CANCELLED"], [actions[label === "A" ? 3 : 4]!]]] as Array<[Descriptor, Action[]]>) {
      const result = await get(descriptor.path, follow(descriptor), current.cookie, headers);
      expect(result.status).toBe(200); expect(result.headers["cache-control"]).toBe("private, no-store");
      safeEqual(result.body, { items: expected.map(expectedAssigned), pagination: pagination(expected.length) }, "Exact safe API-07 row including inactive historical creator/performer, explicit nullable identities"); noLeaks(result.body);
    }
    // Explicit eligible numeric owner is a supported GLOBAL filter, never a
    // substituted current actor. It intersects rather than overrides mine.
    const foreignOwner = params(surfaces[0]); foreignOwner.set("owner", String(other.user.id));
    const filtered = await get(surfaces[0].path, foreignOwner, current.cookie, headers); expect(filtered.status).toBe(200);
    expect(filtered.body.metrics.byStatus.OPEN).toBe(label === "A" ? 2 : 1); expect(filtered.body.metrics.mine).toBe(0);
    expect(filtered.body.metrics.myUnfinishedActions).toBe(label === "A" ? 2 : 1);
    const conflict = filtered.body.drillDown.mine as Descriptor, empty = await get(conflict.path, follow(conflict), current.cookie, headers);
    expect(empty.status).toBe(200); expect(empty.body.pagination.totalItems).toBe(0); safeEqual(empty.body.items, [], "Owner/actor intersection is empty without imposing ownership-only Staff access");
  });

  it("extended Staff Ticket data explicitly prevents shared public caching", async () => {
    const response = await get(surfaces[1].path, params(surfaces[1]), who("A").cookie);
    expect(response.status).toBe(200); expect(response.body.pagination.totalItems).toBe(1);
    // API-spec section 2 permits no shared public cache. Accept either private
    // or no-store: do not invent an exact inherited Queue header spelling.
    const cache = response.headers["cache-control"] ?? "";
    console.info(`Extended Staff Ticket cache evidence: headerPresent=${response.headers["cache-control"] !== undefined}; explicitlyPrivateOrNoStore=${/(?:^|,)\s*(?:private|no-store)(?:\s*(?:,|$))/iu.test(cache)}.`);
    expect(/(?:^|,)\s*(?:private|no-store)(?:\s*(?:,|$))/iu.test(cache),
      "Authorized extended Staff Ticket response must explicitly prohibit shared caching").toBe(true);
  });
});

describe.each(surfaces)("$name literal injection-shaped search", (surface) => {
  it("treats SQL/wildcard-shaped text literally rather than broadening selection", async () => {
    const query = params(surface); query.set("search", "%') OR TRUE;--_\\");
    // Use the global status widget, not mine: matching parent is owned by B,
    // but A is allowed to see it and is its Action's actual assignee.
    if (surface.name === "Ticket drill-down") { query.set("dashboardWidget", "status"); query.set("widgetStatus", "OPEN"); }
    const response = await get(surface.path, query, who("A").cookie); expect(response.status).toBe(200); noLeaks(response.body);
    if (surface.name === "Dashboard") {
      expect(response.body.metrics.byStatus.OPEN).toBe(1); expect(response.body.metrics.recentUpdated).toBe(1); expect(response.body.metrics.mine).toBe(0);
      safeEqual(response.body.lists.recentUpdated, [ticketRow(parents[0]!, true)], "Only exact literal matching parent");
      expect(response.body.metrics.myUnfinishedActions).toBe(1);
    } else if (surface.name === "Ticket drill-down") {
      expect(response.body.pagination.totalItems).toBe(1); safeEqual(response.body.items, [ticketRow(parents[0]!, false)], "Parameterized literal Staff parent query");
    } else {
      safeEqual(response.body, { items: [expectedAssigned(actions[0]!)], pagination: pagination(1) }, "Parameterized actor-specific literal Action query");
    }
  });
});
describe("Staff security-specific query rejections", () => {
  it.each([
    { surface: 0, field: "owner", entries: [["owner", "1 OR TRUE --"]] },
    { surface: 0, field: "search", entries: [["search[operator]", "anything"]] },
    { surface: 1, field: "widgetStatus", entries: [["dashboardWidget", "status"], ["widgetStatus", "OPEN' OR TRUE --"]] },
    { surface: 1, field: "widgetStatus", entries: [["dashboardWidget", "status"], ["widgetStatus", "OPEN"], ["widgetStatus", "CLOSED"]] },
    { surface: 1, field: "updatedFrom", entries: [["updatedFrom", "2026-10-01T00:00:00.000Z'; SELECT 1 --"], ["updatedBefore", "2026-10-02T00:00:00.000Z"]] },
    { surface: 2, field: "assignee", entries: [["assignee", "me' OR TRUE --"]] },
  ])("surface $surface rejects $field without business reads", async ({ surface: index, field, entries }) => {
    const surface = surfaces[index]!, query = new URLSearchParams({ categoryId: String(category.id) });
    for (const [name, value] of entries) query.append(name!, value!);
    const spy = vi.spyOn(db, "$transaction");
    try { safeError(await get(surface.path, query, who("A").cookie), 400, "INVALID_QUERY", field); expect(spy).not.toHaveBeenCalled(); }
    finally { spy.mockRestore(); }
  });
});

describe.each(surfaces)("$name safe business-read failures", (surface) => {
  it.each([
    { kind: "simulated proven P1001 classification", status: 503, code: "SERVICE_UNAVAILABLE" },
    { kind: "simulated unexpected read fault", status: 500, code: "INTERNAL_ERROR" },
  ])("$kind is sanitized and a subsequent real request recovers", async ({ kind, status, code }) => {
    type Operation = (tx: Prisma.TransactionClient) => Promise<unknown>;
    type Options = { isolationLevel?: Prisma.TransactionIsolationLevel };
    const original = db.$transaction.bind(db) as (operation: Operation, options?: Options) => Promise<unknown>;
    const fault = status === 503 ? new Prisma.PrismaClientKnownRequestError(privateValues[5]!, { code: "P1001", clientVersion: Prisma.prismaVersion.client }) : new Error(privateValues[5]!);
    const evidence = { transactions: 0, completedBusinessReads: 0, faults: 0, rolledBack: false };
    const logging = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const spy = vi.spyOn(db, "$transaction").mockImplementation((async (operation: Operation, options?: Options) => {
      evidence.transactions++;
      try {
        return await original(async (tx) => {
          async function failAfterRead() {
            evidence.completedBusinessReads++;
            const [settings] = await tx.$queryRaw<Array<{ isolation: string; readOnly: string }>>`
              SELECT current_setting('transaction_isolation') AS isolation,current_setting('transaction_read_only') AS "readOnly"`;
            safeEqual(settings, { isolation: "repeatable read", readOnly: "on" }, "Actual business transaction controls before injected fault");
            evidence.faults++; throw fault;
          }
          const wrapped = new Proxy(tx, { get(target, property) {
            const value = Reflect.get(target, property);
            if (surface.name === "Ticket drill-down" && property === "$queryRaw") return async (...args: unknown[]) => {
              const result: unknown = await Reflect.apply(value, target, args);
              const sql = args[0] as { strings?: string[] } | undefined;
              if (sql?.strings?.join(" ").includes("SELECT COUNT(*) FILTER")) await failAfterRead();
              return result;
            };
            if ((surface.name === "Dashboard" && property === "ticket") || (surface.name === "My Actions" && property === "action")) return new Proxy(value, { get(delegate, method) {
              const call = Reflect.get(delegate, method);
              if (method !== "count") return typeof call === "function" ? call.bind(delegate) : call;
              return async (...args: unknown[]) => { const result: unknown = await Reflect.apply(call, delegate, args); await failAfterRead(); return result; };
            } });
            return typeof value === "function" ? value.bind(target) : value;
          } });
          return operation(wrapped);
        }, options);
      } catch (error) { evidence.rolledBack = true; throw error; }
    }) as typeof db.$transaction);
    try {
      safeError(await get(surface.path, params(surface), who("A").cookie), status, code);
      safeEqual(evidence, { transactions: 1, completedBusinessReads: 1, faults: 1, rolledBack: true }, "One real authenticated read-only transaction rejects and rolls back; no retry or partial success");
      safeEqual(logging.mock.calls, [[surface.log]], "Only sanitized inherited operation-stage logging, no raw fault object");
    } finally { spy.mockRestore(); logging.mockRestore(); }
    const recovered = await get(surface.path, params(surface), who("A").cookie); expect(recovered.status).toBe(200); noLeaks(recovered.body);
    if (surface.name === "Dashboard") { expect(recovered.body.metrics.mine).toBe(1); expect(recovered.body.metrics.myUnfinishedActions).toBe(2); }
    else if (surface.name === "Ticket drill-down") { expect(recovered.body.pagination.totalItems).toBe(1); safeEqual(recovered.body.items, [ticketRow(parents[2]!, false)], "Real authoritative Staff data after fault removal"); }
    else safeEqual(recovered.body, { items: actions.slice(0, 2).map(expectedAssigned), pagination: pagination(2) }, "Real authoritative Action data after fault removal");
  });
});
