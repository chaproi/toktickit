import { createHash, randomUUID } from "node:crypto";
import { Prisma, type Action, type ActionHistoryEvent, type ActionStatus, type Ticket, type TicketStatus } from "@prisma/client";
import request from "supertest";
import { expect } from "vitest";
import { app } from "../../src/app.js";
import { configureTestDatabaseEnvironment } from "../../src/testing/test-database.js";
import { ActionReadFixtures, LITERAL, PRIVATE_NOTE, actionSnapshot, assertSafeEqual, pagination } from "./action-read-test-fixtures.js";

export type StaffActionActor = ReturnType<ActionReadFixtures["who"]>;
export const FROM = "2026-10-06T00:00:00.000Z";
export const BEFORE = "2026-10-07T00:00:00.000Z";
const created = new Date("2026-09-30T00:00:00.000Z");
const actionDate = new Date("2026-10-01T01:00:00.000Z");

export class StaffActionFixtures {
  readonly read = new ActionReadFixtures();
  readonly prisma = this.read.prisma;
  readonly parents = new Map<string, Ticket>();
  readonly cohorts = new Map<string, Action[]>();
  readonly categories: number[] = [];
  readonly systems: number[] = [];
  searchRequester!: StaffActionActor;
  searchName = `SearchPerson${randomUUID().slice(0, 8)}`;
  searchEmail!: string;
  get staff() { return this.read.who("assignee"); }
  get admin() { return this.read.who("completer"); }
  get owner() { return this.read.who("coordinator"); }

  async parent(key: string, status: TicketStatus = "OPEN", changes: Prisma.TicketUncheckedUpdateInput = {}) {
    const original = await this.read.ticket(this.read.who("requester").user.id, status);
    const parent = await this.prisma.ticket.update({ where: { id: original.id }, data: {
      createdAt: created, ticketDate: created, updatedAt: new Date("2026-10-04T03:00:00.000Z"),
      summary: "Synthetic staff action parent", ...changes,
    } });
    this.parents.set(key, parent); this.cohorts.set(key, []);
    return parent;
  }

  async action(key: string, status: ActionStatus = "PLANNED", assignee = this.staff, at = actionDate,
    identities: { creator?: StaffActionActor; performer?: StaffActionActor } = {}) {
    const parent = this.parents.get(key)!;
    let action = await this.read.action(parent.id, "PLANNED", at);
    // Direct coherent read setup; these fixtures do not prove any write/workflow API.
    action = await this.prisma.action.update({ where: { id: action.id }, data: {
      createdById: identities.creator?.user.id ?? action.createdById,
      assigneeId: assignee.user.id, result: LITERAL, followUpRequired: true, followUpNote: `${LITERAL} follow-up`, updatedAt: at,
    } });
    const initial = action;
    await this.prisma.actionHistory.create({ data: { actionId: action.id, actorId: action.createdById,
      event: "ACTION_CREATED", actionVersion: 1, before: Prisma.DbNull, after: actionSnapshot(action), createdAt: at } });
    const advance = async (event: ActionHistoryEvent, data: Prisma.ActionUncheckedUpdateInput, actorId: number) => {
      const before = action;
      const instant = new Date(at.getTime() + before.version);
      action = await this.prisma.action.update({ where: { id: action.id }, data: { ...data, version: before.version + 1, updatedAt: instant } });
      await this.prisma.actionHistory.create({ data: { actionId: action.id, actorId, event, actionVersion: action.version,
        before: actionSnapshot(before), after: actionSnapshot(action), createdAt: instant, sourceTicketStatusHistoryId: null } });
    };
    if (status === "IN_PROGRESS" || status === "COMPLETED") await advance("ACTION_STARTED", { status: "IN_PROGRESS" }, assignee.user.id);
    const performer = identities.performer ?? this.read.who("historical");
    if (status === "COMPLETED") await advance("ACTION_COMPLETED", { status: "COMPLETED", result: `${LITERAL} completed`,
      performedById: performer.user.id, completedAt: new Date(at.getTime() + 2) }, performer.user.id);
    if (status === "CANCELLED") await advance("ACTION_CANCELLED", { status: "CANCELLED", cancellationReason: "Cancelled synthetic work",
      cancelledAt: new Date(at.getTime() + 1) }, this.owner.user.id);
    this.read.actions[this.read.actions.findIndex((row) => row.id === action.id)] = action;
    this.cohorts.get(key)!.push(action);
    if (key === "projection") await this.prisma.mutationReceipt.create({ data: {
      actorId: initial.createdById, clientMutationId: randomUUID(), operation: "CREATE_ACTION", ticketId: parent.id, actionId: action.id,
      inputFingerprint: createHash("sha256").update(randomUUID()).digest("hex"),
      safeResponse: { action: this.read.dto(initial), ticketUpdatedAt: parent.updatedAt.toISOString() }, createdAt: at,
    } });
    return action;
  }

  async resolution(key: string, instants: string[], closed = false, reopened = false) {
    const ticket = this.parents.get(key)!;
    const events: Array<{ from: TicketStatus; to: TicketStatus; at: string }> = [
      { from: "NEW", to: "OPEN", at: "2026-09-30T12:00:00.000Z" },
      { from: "OPEN", to: "IN_PROGRESS", at: "2026-09-30T23:00:00.000Z" },
    ];
    instants.forEach((instant, index) => {
      if (index > 0) {
        const previous = Date.parse(instants[index - 1]);
        events.push({ from: "RESOLVED", to: "REOPENED", at: new Date(previous + 1).toISOString() },
          { from: "REOPENED", to: "IN_PROGRESS", at: new Date(previous + 2).toISOString() });
      }
      events.push({ from: "IN_PROGRESS", to: "RESOLVED", at: instant });
    });
    if (closed || reopened) events.push({ from: "RESOLVED", to: closed ? "CLOSED" : "REOPENED",
      at: new Date(Date.parse(instants[instants.length - 1]) + 1).toISOString() });
    for (const event of events) await this.prisma.ticketStatusHistory.create({ data: {
      ticketId: ticket.id, actorId: this.owner.user.id, fromStatus: event.from, toStatus: event.to, reason: null, createdAt: new Date(event.at),
    } });
  }

  async initialize() {
    const identity = configureTestDatabaseEnvironment();
    const operational = process.env.TOKTICKIT_DEVELOPMENT_DATABASE_URL;
    expect(!!operational && decodeURIComponent(new URL(operational).pathname.slice(1)) !== identity.databaseName,
      "Dedicated database differs from operational target; details redacted").toBe(true);
    const [live] = await this.prisma.$queryRaw<Array<{ database: string; schema: string }>>`SELECT current_database() AS database,current_schema() AS schema`;
    expect(live.database === identity.databaseName && live.schema === identity.schema, "Live guard matches; details redacted").toBe(true);
    for (const [label, role] of [["requester", "REQUESTER"], ["coordinator", "IT_STAFF"], ["creator", "IT_STAFF"],
      ["assignee", "IT_STAFF"], ["completer", "ADMINISTRATOR"], ["historical", "IT_STAFF"], ["empty", "IT_STAFF"]] as const) {
      await this.read.actor(label, role);
    }
    this.searchRequester = await this.read.actor("search-requester");
    const observedRequester = await this.prisma.user.update({ where: { id: this.searchRequester.user.id }, data: { name: this.searchName } });
    this.searchEmail = observedRequester.email;
    for (const index of [0, 1]) {
      this.categories.push((await this.prisma.category.create({ data: { name: `Staff action category ${index} ${randomUUID()}` } })).id);
      this.systems.push((await this.prisma.relatedSystem.create({ data: { name: `Staff action system ${index} ${randomUUID()}` } })).id);
    }
    this.read.referenceIds.categoryId = this.categories[0]; this.read.referenceIds.relatedSystemId = this.systems[0];
    await this.parent("pagination");
    // Reverse insertion by date plus ties makes ID-only/DESC ordering observably wrong.
    for (let index = 0; index < 55; index++) await this.action("pagination",
      (["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const)[index % 4], this.staff,
      new Date(Date.UTC(2026, 9, 1, 2, 0, 0, Math.floor((54 - index) / 2))));
    await this.action("pagination", "PLANNED", this.read.who("creator"));
    await this.action("pagination", "IN_PROGRESS", this.admin);
    await this.parent("projection", "OPEN", { summary: LITERAL });
    for (const status of ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const) await this.action("projection", status);
    await this.prisma.internalNote.create({ data: { ticketId: this.parents.get("projection")!.id, authorId: this.owner.user.id, content: PRIVATE_NOTE } });
    for (const status of ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED", "RESOLVED", "CLOSED", "CANCELLED"] as const) {
      const key = `state-${status}`;
      await this.parent(key, status);
      await this.action(key, status === "RESOLVED" || status === "CLOSED" ? "COMPLETED" : status === "CANCELLED" ? "CANCELLED" : "PLANNED");
      if (status === "RESOLVED" || status === "CLOSED") await this.resolution(key, ["2026-10-03T12:00:00.000Z"], status === "CLOSED");
    }
    await this.parent("category-other", "OPEN", { categoryId: this.categories[1] }); await this.action("category-other");
    await this.parent("system-other", "OPEN", { relatedSystemId: this.systems[1] }); await this.action("system-other");
    await this.parent("mine", "OPEN", { ownerId: this.staff.user.id }); await this.action("mine");
    await this.action("mine", "PLANNED", this.read.who("creator")); // Owning the parent must not grant assignment scope.
    await this.parent("unassigned", "OPEN", { ownerId: null }); await this.action("unassigned");
    await this.parent("admin-owned", "OPEN", { ownerId: this.admin.user.id }); await this.action("admin-owned", "COMPLETED", this.admin);
    await this.parent("other-assignee-only", "OPEN", { ownerId: this.staff.user.id });
    // Staff appears as creator+performer+owner, but is NOT the assignee of this row.
    await this.action("other-assignee-only", "COMPLETED", this.read.who("creator"), actionDate,
      { creator: this.staff, performer: this.staff });
    for (const [key, summary] of [["search-summary", "UniqueNeedleSummary"], ["literal-percent", "literal % parent"],
      ["literal-underscore", "literal _ parent"], ["literal-backslash", "literal \\ parent"], ["wildcard-decoy", "literal X parent"],
      ["search-boundary", "S".repeat(100)]] as const) { await this.parent(key, "OPEN", { summary }); await this.action(key); }
    await this.parent("search-requester", "OPEN", { requesterId: this.searchRequester.user.id }); await this.action("search-requester");
    for (const [key, at] of [["updated-earlier", "2026-10-05T23:59:59.999Z"], ["updated-from", FROM],
      ["updated-inside", "2026-10-06T23:59:59.999Z"], ["updated-before", BEFORE]] as const) {
      await this.parent(key, "OPEN", { updatedAt: new Date(at) }); await this.action(key);
    }
    for (const [key, status] of [["resolved-repeated", "RESOLVED"], ["resolved-from", "CLOSED"], ["resolved-earlier", "RESOLVED"],
      ["resolved-before", "CLOSED"], ["resolved-missing", "RESOLVED"], ["resolved-reopened", "REOPENED"]] as const) {
      await this.parent(key, status, { updatedAt: new Date("2026-10-07T12:00:00.000Z"),
        ...(key === "resolved-repeated" ? { categoryId: this.categories[1], relatedSystemId: this.systems[1], requestedPriority: "URGENT", itPriority: "HIGH", summary: "ResolvedIntersectionNeedle" } : {}) });
      await this.action(key, "COMPLETED");
    }
    await this.action("resolved-repeated", "COMPLETED"); await this.action("resolved-repeated", "COMPLETED", this.read.who("creator"));
    await this.resolution("resolved-repeated", ["2026-10-05T22:00:00.000Z", "2026-10-06T12:00:00.000Z", "2026-10-06T14:00:00.000Z"]);
    await this.resolution("resolved-from", [FROM], true);
    await this.resolution("resolved-earlier", ["2026-10-05T23:59:59.999Z"]);
    await this.resolution("resolved-before", [BEFORE], true);
    await this.resolution("resolved-reopened", ["2026-10-06T12:00:00.000Z"], false, true);
    // Deliberately future-dated legacy observations exercise the server asOf
    // cap; they are not evidence of permitted backdating/workflow mutations.
    await this.parent("future-resolution", "RESOLVED", { updatedAt: new Date("2099-01-01T00:00:00.000Z") });
    await this.action("future-resolution", "COMPLETED");
    await this.resolution("future-resolution", ["2099-01-01T00:00:00.000Z"]);
    // Missing history is a legacy read fixture; no resolution fallback is invented.
    await this.prisma.user.update({ where: { id: this.read.who("historical").user.id }, data: { isActive: false } });
    console.info("API-07 fixtures: unique owned actors/references/parents, assignment decoys, 55-row tie cohort and coherent read histories.");
  }

  assigned(actor = this.staff) { return this.read.actions.filter((action) => action.assigneeId === actor.user.id); }
  rows(keys: string[], actor = this.staff) { return keys.flatMap((key) => this.cohorts.get(key)!).filter((action) => action.assigneeId === actor.user.id); }
  sorted(actions: Action[]) { return [...actions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id); }
  async digest() {
    const domain = await this.read.domainDigest();
    const categories = await this.prisma.category.findMany({ where: { id: { in: this.categories } }, orderBy: { id: "asc" } });
    const systems = await this.prisma.relatedSystem.findMany({ where: { id: { in: this.systems } }, orderBy: { id: "asc" } });
    return createHash("sha256").update(JSON.stringify([domain, categories, systems])).digest("hex");
  }
  async get(query = "", actor: StaffActionActor | null = this.staff) {
    const before = await this.digest();
    try {
      const call = request(app).get(`/api/staff/actions${query ? `?${query}` : ""}`);
      if (actor) call.set("Cookie", actor.cookie);
      return await call;
    } finally { expect(await this.digest() === before, "Domain rows/times/versions/histories/receipts unchanged; values redacted; session bookkeeping excluded").toBe(true); }
  }
  async success(query: string, expected: Action[], actor = this.staff, page = 1, pageSize = 50) {
    const response = await this.get(query, actor);
    expect(response.status).toBe(200); // Absent route must reach HTTP RED, not fixture/collection failure.
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(Object.keys(response.body).sort()).toEqual(["items", "pagination"]);
    expect(response.body.pagination).toEqual(pagination(page, pageSize, expected.length));
    const selected = this.sorted(expected).slice((page - 1) * pageSize, page * pageSize);
    expect(response.body.items.length).toBeLessThanOrEqual(pageSize);
    expect(response.body.items).toHaveLength(selected.length);
    for (const [index, row] of response.body.items.entries()) {
      expect(Object.keys(row).sort()).toEqual(["action", "ticket"]);
      expect(Object.keys(row.ticket).sort()).toEqual(["currentStatus", "id", "summary", "ticketNumber"]);
      const action = selected[index], parent = [...this.parents.values()].find((ticket) => ticket.id === action.ticketId)!;
      this.read.assertDTO(row.action, action);
      assertSafeEqual(row.ticket, { id: parent.id, ticketNumber: parent.ticketNumber, summary: parent.summary, currentStatus: parent.currentStatus }, "Exact safe parent projection");
    }
    expect(/passwordHash|tokenHash|csrfTokenHash|internalNotes|inputFingerprint|safeResponse|storageKey|requesterId/u.test(JSON.stringify(response.body))).toBe(false);
    expect(JSON.stringify(response.body).includes(PRIVATE_NOTE)).toBe(false);
    return response;
  }
  async cleanup() {
    configureTestDatabaseEnvironment();
    const where = { ticketId: { in: this.read.ticketIds } };
    await this.prisma.$transaction([
      this.prisma.mutationReceipt.deleteMany({ where }), this.prisma.actionHistory.deleteMany({ where: { action: where } }),
      this.prisma.action.deleteMany({ where }), this.prisma.ticketStatusHistory.deleteMany({ where }),
      this.prisma.internalNote.deleteMany({ where }), this.prisma.publicComment.deleteMany({ where }), this.prisma.attachment.deleteMany({ where }),
      this.prisma.ticket.deleteMany({ where: { id: { in: this.read.ticketIds } } }),
      this.prisma.authSession.deleteMany({ where: { userId: { in: this.read.userIds } } }),
      this.prisma.user.deleteMany({ where: { id: { in: this.read.userIds } } }),
      this.prisma.category.deleteMany({ where: { id: { in: this.categories } } }),
      this.prisma.relatedSystem.deleteMany({ where: { id: { in: this.systems } } }),
    ]);
    expect(await this.prisma.ticket.count({ where: { id: { in: this.read.ticketIds } } })).toBe(0);
    expect(await this.prisma.user.count({ where: { id: { in: this.read.userIds } } })).toBe(0);
    expect(await this.prisma.category.count({ where: { id: { in: this.categories } } })).toBe(0);
    expect(await this.prisma.relatedSystem.count({ where: { id: { in: this.systems } } })).toBe(0);
    await this.prisma.$disconnect();
    console.info("API-07 cleanup: exact owned Tickets/Users/references absent; Prisma disconnected; no injection resources created.");
  }
}
