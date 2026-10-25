import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Prisma, type RequestedPriority, type Ticket, type TicketStatus, type User } from "@prisma/client";
import request from "supertest";
import { expect } from "vitest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { configureTestDatabaseEnvironment } from "../../src/testing/test-database.js";
import { cookieHeader, createAuthUser, loginRequest } from "../lab-03/auth-test-helpers.js";
import { actionSnapshot } from "./action-read-test-fixtures.js";

export type StaffActor = "A" | "B";
export type StaffDescriptor = { path: string; query: Record<string, string | number> };
export type StaffTicketMetrics = {
  unassigned: number; mine: number; byStatus: Record<TicketStatus, number>;
  byItPriority: Record<RequestedPriority, number>; recentUpdated: number; recentResolved: number;
};
export type StaffDrilldownDashboard = {
  metrics: StaffTicketMetrics;
  recentWindow: { from: string; before: string };
  lists: { recentUpdated: Array<{ id: number }>; recentResolved: Array<{ id: number }> };
  drillDown: {
    unassigned: StaffDescriptor; mine: StaffDescriptor;
    byStatus: Record<TicketStatus, StaffDescriptor>; byItPriority: Record<RequestedPriority, StaffDescriptor>;
    recentUpdated: StaffDescriptor; recentResolved: StaffDescriptor;
  };
};
type StaffListRow = {
  id: number; ticketNumber: string; ticketDate: string; summary: string;
  requester: { id: number; name: string; email: string };
  category: { id: number; name: string }; relatedSystem: { id: number; name: string };
  requestedPriority: string; itPriority: string; currentStatus: string;
  owner: { id: number; name: string; role: string } | null;
  requesterResolutionIndicatedAt: string | null; updatedAt: string; resolvedAt?: string;
};
export type StaffDrilldownList = {
  items: StaffListRow[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number; hasPreviousPage: boolean; hasNextPage: boolean };
};

function safeEqual(actual: unknown, expected: unknown, label: string) {
  expect(isDeepStrictEqual(actual, expected), `${label}; comparison values withheld`).toBe(true);
}
function fixtureError(stage: string, error: unknown) {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  const safeCode = typeof code === "string" && /^(P\d{4}|[0-9A-Z]{5})$/u.test(code) ? code : "unclassified";
  return new Error(`Owned Staff drill-down ${stage} failed (${safeCode}); sensitive details withheld.`);
}

// Scoped read fixtures, not workflow-endpoint evidence. No production predicate,
// query parser or projection is used to calculate expected membership or order.
export function createStaffDrilldownFixture() {
  const prisma = getPrisma();
  const marker = `issue48-drilldown-${randomUUID()}`;
  const search = `Staff literal %_\\ & ${randomUUID().slice(0, 8)}`;
  const users = new Map<string, User>(), cookies = new Map<StaffActor, string>(), rows = new Map<string, Ticket>();
  const userIds: number[] = [], ticketIds: number[] = [], categories: Array<{ id: number; name: string }> = [];
  const systems: Array<{ id: number; name: string }> = [], resolutionHours = new Map<string, number>();
  let clock = 0, guarded = false;
  const at = (hours: number) => new Date(clock - hours * 3_600_000);
  const user = (name: string) => users.get(name)!;
  const ticket = (name: string) => rows.get(name)!;

  async function addUser(name: string, role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR") {
    const value = await createAuthUser({ email: `${marker}-${name}@example.test`, role });
    userIds.push(value.user.id);
    users.set(name, value.user);
    if (name === "A" || name === "B") {
      const response = await loginRequest(value.user.email, value.password);
      expect(response.status, "Real inherited Staff/Admin login succeeds; body withheld").toBe(200);
      cookies.set(name, cookieHeader(response.headers["set-cookie"]));
    }
  }

  async function addTicket(name: string, status: TicketStatus, owner: StaffActor | null,
    priority: RequestedPriority, updatedHours: number,
    options: { resolution?: number; repeatedResolution?: boolean; category?: number; system?: number; requested?: RequestedPriority; decoyRequester?: boolean; legacy?: boolean } = {}) {
    const row = await prisma.ticket.create({ data: {
      ticketNumber: `D48D-${randomUUID().replaceAll("-", "").slice(0, 12)}`, clientSubmissionId: randomUUID(),
      requesterId: user(options.decoyRequester ? "decoy" : "requester").id,
      categoryId: categories[options.category ?? 0]!.id, relatedSystemId: systems[options.system ?? 0]!.id,
      requestedPriority: options.requested ?? (priority === "LOW" ? "URGENT" : priority === "MEDIUM" ? "HIGH" : "LOW"),
      itPriority: priority, ownerId: owner === null ? null : user(owner).id, currentStatus: status,
      summary: `${name} <script>literal Staff summary</script>`, description: `${marker} private body`,
      ticketDate: at(30 * 24), createdAt: at(30 * 24), updatedAt: at(updatedHours),
    } });
    ticketIds.push(row.id); rows.set(name, row);
    if (options.legacy || status === "NEW") return;
    const history: Array<[TicketStatus, TicketStatus, number]> = status === "CANCELLED"
      ? [["NEW", "CANCELLED", updatedHours]] : [["NEW", "OPEN", 20 * 24]];
    if (status === "IN_PROGRESS" || status === "WAITING_FOR_REQUESTER") history.push(["OPEN", status, updatedHours]);
    if (status === "REOPENED") history.push(["OPEN", "RESOLVED", 240], ["RESOLVED", "REOPENED", updatedHours]);
    if (status === "RESOLVED" || status === "CLOSED") {
      if (options.resolution === undefined) throw new Error("Explicit fixture resolution time is required.");
      if (options.repeatedResolution) history.push(["OPEN", "RESOLVED", 120], ["RESOLVED", "REOPENED", 110],
        ["REOPENED", "IN_PROGRESS", 100], ["IN_PROGRESS", "RESOLVED", options.resolution]);
      else history.push(["OPEN", "RESOLVED", options.resolution]);
      resolutionHours.set(name, options.resolution);
      if (status === "CLOSED") history.push(["RESOLVED", "CLOSED", updatedHours]);
    }
    await prisma.ticketStatusHistory.createMany({ data: history.map(([fromStatus, toStatus, hours]) => ({
      ticketId: row.id, actorId: user("B").id, fromStatus, toStatus, createdAt: at(hours),
      reason: toStatus === "CANCELLED" ? "Synthetic read fixture cancellation" : null,
    })) });
  }

  async function setup() {
    try {
      const identity = configureTestDatabaseEnvironment();
      const operational = process.env.TOKTICKIT_DEVELOPMENT_DATABASE_URL;
      expect(Boolean(operational) && decodeURIComponent(new URL(operational!).pathname.slice(1)) !== identity.databaseName,
        "Dedicated target differs from operational; values withheld").toBe(true);
      const [live] = await prisma.$queryRaw<Array<{ database: string; schema: string }>>`SELECT current_database() AS database,current_schema() AS schema`;
      expect(live.database === identity.databaseName && live.schema === identity.schema, "Live identity matches actual guard; values withheld").toBe(true);
      guarded = true;
      await addUser("A", "IT_STAFF"); await addUser("B", "ADMINISTRATOR");
      await addUser("requester", "REQUESTER"); await addUser("decoy", "REQUESTER");
      users.set("requester", await prisma.user.update({ where: { id: user("requester").id }, data: { name: search } }));
      // Wildcard-looking characters must match literally, including in requester
      // names. This near-match must not become a match by SQL wildcard expansion.
      users.set("decoy", await prisma.user.update({ where: { id: user("decoy").id }, data: { name: search.replace("%_\\", "XX") } }));
      for (const name of ["matching", "other"]) {
        categories.push(await prisma.category.create({ data: { name: `${marker}-${name}` }, select: { id: true, name: true } }));
        systems.push(await prisma.relatedSystem.create({ data: { name: `${marker}-${name}` }, select: { id: true, name: true } }));
      }
      const [observed] = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT CURRENT_TIMESTAMP AS now`;
      clock = observed.now.getTime();
      for (const name of ["O01", "O02", "O03", "O04", "O05", "O06", "O07", "O08", "O09", "O10", "O11"]) {
        await addTicket(name, "OPEN", "A", "HIGH", 72);
      }
      await addTicket("N01", "NEW", null, "LOW", 96);
      await addTicket("W01", "WAITING_FOR_REQUESTER", null, "MEDIUM", 48);
      await addTicket("P01", "IN_PROGRESS", "B", "URGENT", 60);
      await addTicket("E01", "REOPENED", "A", "HIGH", 36);
      for (const [number, resolution, closedResolution] of [[1, 48, 36], [2, 48, 36], [3, 72, 48], [4, 72, 48], [5, 96, 72], [6, 96, 72]] as const) {
        await addTicket(`R0${number}`, "RESOLVED", "A", "MEDIUM", 24, { resolution, repeatedResolution: number === 2 });
        await addTicket(`C0${number}`, "CLOSED", "B", "URGENT", 12, { resolution: closedResolution });
      }
      await addTicket("X01", "CANCELLED", null, "HIGH", 240);
      await addTicket("L01", "RESOLVED", null, "LOW", 6, { legacy: true });
      await addTicket("D-system", "OPEN", "A", "HIGH", 4, { system: 1 });
      await addTicket("D-requested", "OPEN", "A", "HIGH", 4, { requested: "URGENT" });
      await addTicket("D-it", "OPEN", "A", "LOW", 4, { requested: "LOW" });
      await addTicket("D-search", "OPEN", "A", "HIGH", 1, { decoyRequester: true });
      await addTicket("D-category", "OPEN", "A", "HIGH", 1, { category: 1 });
      const action = await prisma.action.create({ data: { ticketId: ticket("O01").id, createdById: user("A").id,
        assigneeId: user("B").id, description: "Read preservation witness Action", actionAt: at(72), createdAt: at(72), updatedAt: at(72) } });
      await prisma.actionHistory.create({ data: { actionId: action.id, actorId: user("A").id, event: "ACTION_CREATED",
        actionVersion: 1, before: Prisma.DbNull, after: actionSnapshot(action), createdAt: at(72) } });
      await prisma.mutationReceipt.create({ data: { actorId: user("A").id, ticketId: action.ticketId, actionId: action.id,
        operation: "CREATE_ACTION", clientMutationId: randomUUID(), inputFingerprint: createHash("sha256").update(randomUUID()).digest("hex"),
        safeResponse: { action: { id: action.id, ticketId: action.ticketId, actionAt: action.actionAt.toISOString(),
          description: action.description, result: null, createdBy: { id: user("A").id, name: user("A").name },
          assignee: { id: user("B").id, name: user("B").name }, performedBy: null, status: "PLANNED",
          followUpRequired: false, followUpNote: null, attachmentNotes: null, cancellationReason: null,
          createdAt: action.createdAt.toISOString(), updatedAt: action.updatedAt.toISOString(), completedAt: null, cancelledAt: null, version: 1 },
          ticketUpdatedAt: ticket("O01").updatedAt.toISOString() } } });
      await prisma.internalNote.create({ data: { ticketId: ticket("O01").id, authorId: user("B").id, content: `${marker} private Note` } });
      // Explicit independent cohort arithmetic; excludes exactly search/category
      // decoys. The API requests below still perform their own real predicates.
      expect(ticketIds.length).toBe(34);
      expect(await prisma.ticket.count({ where: { id: { in: ticketIds }, categoryId: categories[0]!.id, requesterId: user("requester").id } })).toBe(32);
      expect(await prisma.ticketStatusHistory.count({ where: { ticketId: ticket("L01").id } })).toBe(0);
      expect(await prisma.ticketStatusHistory.count({ where: { ticketId: ticket("R02").id, toStatus: "RESOLVED" } })).toBe(2);
    } catch (error) { throw fixtureError("setup", error); }
  }

  async function digest() {
    const owned = { ticketId: { in: ticketIds } };
    const values = await Promise.all([
      prisma.user.findMany({ where: { id: { in: userIds } }, orderBy: { id: "asc" } }),
      prisma.category.findMany({ where: { id: { in: categories.map(({ id }) => id) } }, orderBy: { id: "asc" } }),
      prisma.relatedSystem.findMany({ where: { id: { in: systems.map(({ id }) => id) } }, orderBy: { id: "asc" } }),
      prisma.ticket.findMany({ where: { id: { in: ticketIds } }, orderBy: { id: "asc" } }),
      prisma.ticketStatusHistory.findMany({ where: owned, orderBy: { id: "asc" } }),
      prisma.action.findMany({ where: owned, orderBy: { id: "asc" } }),
      prisma.actionHistory.findMany({ where: { action: owned }, orderBy: { id: "asc" } }),
      prisma.mutationReceipt.findMany({ where: owned, orderBy: { id: "asc" } }),
      prisma.publicComment.findMany({ where: owned, orderBy: { id: "asc" } }),
      prisma.internalNote.findMany({ where: owned, orderBy: { id: "asc" } }),
      prisma.attachment.findMany({ where: owned, orderBy: { id: "asc" } }),
      prisma.seedFixture.findMany({ where: { OR: [{ userId: { in: userIds } }, { ticketId: { in: ticketIds } },
        { categoryId: { in: categories.map(({ id }) => id) } }, { relatedSystemId: { in: systems.map(({ id }) => id) } }] }, orderBy: { id: "asc" } }),
      prisma.ticketNumberSequence.findMany({ orderBy: { year: "asc" } }),
    ]);
    return createHash("sha256").update(JSON.stringify(values)).digest("hex");
  }
  async function read(actor: StaffActor, path: string, params: URLSearchParams) {
    expect(["/api/dashboard/staff", "/api/staff/tickets"]).toContain(path);
    const before = await digest();
    try { return await request(app).get(`${path}?${params.toString()}`).set("Cookie", cookies.get(actor)!); }
    finally { expect(await digest() === before, "Read/denial preserves exact owned domain state; sensitive digests withheld").toBe(true); }
  }
  function base() { return new URLSearchParams({ categoryId: String(categories[0]!.id), search }); }
  function combined() {
    const params = base(); params.set("relatedSystemId", String(systems[0]!.id)); params.set("requestedPriority", "LOW");
    params.set("itPriority", "HIGH"); params.set("currentStatus", "OPEN"); params.set("owner", String(user("A").id));
    return params;
  }
  function ids(labels: readonly string[]) { return labels.map((label) => ticket(label).id); }
  function assertRows(items: StaffListRow[], labels: readonly string[], resolved: boolean) {
    expect(items.map((item) => item.id)).toEqual(ids(labels));
    for (const [index, item] of items.entries()) {
      const source = ticket(labels[index]!), requester = [...users.values()].find(({ id }) => id === source.requesterId)!;
      const owner = source.ownerId === null ? null : [...users.values()].find(({ id }) => id === source.ownerId)!;
      const keys = ["id", "ticketNumber", "ticketDate", "summary", "requester", "category", "relatedSystem", "requestedPriority", "itPriority",
        "currentStatus", "owner", "requesterResolutionIndicatedAt", "updatedAt"];
      expect(Object.keys(item).every((key) => [...keys, "resolvedAt"].includes(key))).toBe(true);
      safeEqual(Object.fromEntries(keys.map((key) => [key, item[key as keyof StaffListRow]])), {
        id: source.id, ticketNumber: source.ticketNumber, ticketDate: source.ticketDate.toISOString(), summary: source.summary,
        requester: { id: requester.id, name: requester.name, email: requester.email },
        category: categories.find(({ id }) => id === source.categoryId), relatedSystem: systems.find(({ id }) => id === source.relatedSystemId),
        requestedPriority: source.requestedPriority, itPriority: source.itPriority, currentStatus: source.currentStatus,
        owner: owner === null ? null : { id: owner.id, name: owner.name, role: owner.role },
        requesterResolutionIndicatedAt: null, updatedAt: source.updatedAt.toISOString(),
      }, "Inherited safe Staff Queue projection and literal text");
      if (resolved) expect(item.resolvedAt).toBe(at(resolutionHours.get(labels[index]!)!).toISOString());
    }
    expect(/passwordHash|tokenHash|csrfTokenHash|inputFingerprint|safeResponse|internalNotes|storageKey|"description"/u.test(JSON.stringify(items))).toBe(false);
  }
  async function cleanup() {
    try {
      if (!guarded) return;
      const owned = { ticketId: { in: ticketIds } }, categoryIds = categories.map(({ id }) => id), systemIds = systems.map(({ id }) => id);
      const registry = { OR: [{ userId: { in: userIds } }, { ticketId: { in: ticketIds } }, { categoryId: { in: categoryIds } }, { relatedSystemId: { in: systemIds } }] };
      await prisma.$transaction([
        prisma.seedFixture.deleteMany({ where: registry }), prisma.mutationReceipt.deleteMany({ where: owned }),
        prisma.actionHistory.deleteMany({ where: { action: owned } }), prisma.action.deleteMany({ where: owned }),
        prisma.ticketStatusHistory.deleteMany({ where: owned }), prisma.publicComment.deleteMany({ where: owned }),
        prisma.internalNote.deleteMany({ where: owned }), prisma.attachment.deleteMany({ where: owned }),
        prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } }), prisma.authSession.deleteMany({ where: { userId: { in: userIds } } }),
        prisma.user.deleteMany({ where: { id: { in: userIds } } }), prisma.category.deleteMany({ where: { id: { in: categoryIds } } }),
        prisma.relatedSystem.deleteMany({ where: { id: { in: systemIds } } }),
      ]);
      const remaining = await Promise.all([
        prisma.user.count({ where: { id: { in: userIds } } }), prisma.authSession.count({ where: { userId: { in: userIds } } }),
        prisma.ticket.count({ where: { id: { in: ticketIds } } }), prisma.ticketStatusHistory.count({ where: owned }),
        prisma.action.count({ where: owned }), prisma.actionHistory.count({ where: { action: owned } }), prisma.mutationReceipt.count({ where: owned }),
        prisma.publicComment.count({ where: owned }), prisma.internalNote.count({ where: owned }), prisma.attachment.count({ where: owned }),
        prisma.seedFixture.count({ where: registry }), prisma.category.count({ where: { id: { in: categoryIds } } }), prisma.relatedSystem.count({ where: { id: { in: systemIds } } }),
      ]);
      safeEqual(remaining, Array(13).fill(0), "Zero owned Staff fixture/domain/session/reference rows after cleanup");
      console.info("Issue48 Staff drill-down cleanup: zero owned rows/sessions/references; no schema/fault resources created.");
    } catch (error) { throw fixtureError("cleanup", error); }
    finally { await prisma.$disconnect(); }
  }
  return { setup, cleanup, read, base, combined, ids, assertRows, actorId: (actor: StaffActor) => user(actor).id };
}
