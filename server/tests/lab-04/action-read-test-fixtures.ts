import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Prisma, type Action, type ActionHistoryEvent, type ActionStatus, type TicketStatus, type UserRole } from "@prisma/client";
import request from "supertest";
import { expect } from "vitest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { configureTestDatabaseEnvironment } from "../../src/testing/test-database.js";
import { APPROVED_ORIGIN, cookieHeader, createAuthUser, loginRequest } from "../lab-03/auth-test-helpers.js";

// Test-only observations, independent of seed/API projection implementations.
export const ACTION_KEYS = [
  "id", "ticketId", "actionAt", "description", "result", "createdBy", "assignee", "performedBy",
  "status", "followUpRequired", "followUpNote", "attachmentNotes", "cancellationReason",
  "createdAt", "updatedAt", "completedAt", "cancelledAt", "version",
];
export const SNAPSHOT_KEYS = [
  "id", "ticketId", "createdById", "assigneeId", "performedById", "status", "description", "result",
  "followUpRequired", "followUpNote", "attachmentNotes", "actionAt", "createdAt", "updatedAt",
  "completedAt", "cancelledAt", "cancellationReason", "version",
];
export const HISTORY_KEYS = [
  "id", "actionId", "actor", "event", "createdAt", "actionVersion", "sourceTicketStatusHistoryId", "before", "after",
];
export const LITERAL = "<script>alert('literal')</script> & diagnostic text";
export const PRIVATE_NOTE = "Internal Note must never appear in Action reads";
export const MISSING_ID = 2_147_483_647;
export const READ_OPERATIONS = ["list", "detail", "history"] as const;
export type ReadOperation = typeof READ_OPERATIONS[number];
type Actor = { user: { id: number; name: string }; cookie: string };
type Snapshot = ReturnType<typeof actionSnapshot>;

export function actionSnapshot(action: Action) {
  return {
    id: action.id, ticketId: action.ticketId, createdById: action.createdById,
    assigneeId: action.assigneeId, performedById: action.performedById, status: action.status,
    description: action.description, result: action.result, followUpRequired: action.followUpRequired,
    followUpNote: action.followUpNote, attachmentNotes: action.attachmentNotes,
    actionAt: action.actionAt.toISOString(), createdAt: action.createdAt.toISOString(),
    updatedAt: action.updatedAt.toISOString(), completedAt: action.completedAt?.toISOString() ?? null,
    cancelledAt: action.cancelledAt?.toISOString() ?? null, cancellationReason: action.cancellationReason,
    version: action.version,
  };
}

export function assertSafeEqual(actual: unknown, expected: unknown, label: string) {
  // A broken projection must not print private User/session/receipt values.
  expect(isDeepStrictEqual(actual, expected), `${label}; comparison values redacted`).toBe(true);
}

export function assertSafeError(response: request.Response, status: number, code?: string) {
  expect(response.status).toBe(status);
  expect(response.headers["content-type"]).toMatch(/application\/json/u);
  expect(response.body).toHaveProperty("error");
  expect(Object.keys(response.body)).toEqual(["error"]);
  expect(Object.keys(response.body.error).every((key) => ["code", "message", "fields", "requestId"].includes(key))).toBe(true);
  expect(typeof response.body.error.code).toBe("string");
  if (code) expect(response.body.error.code).toBe(code);
  expect(typeof response.body.error.message).toBe("string");
  expect(response.body.error.message.length).toBeGreaterThan(0);
  // PASSWORD_CHANGE_REQUIRED and its inherited password message are public error content.
  expect(/passwordHash|tokenHash|csrfTokenHash|inputFingerprint|safeResponse|internalNotes|stack|SELECT\s+.+\s+FROM|INSERT\s+INTO|postgres|PrismaClient/iu.test(JSON.stringify(response.body)),
    "Safe error contains no private data or database internals").toBe(false);
}

export function pagination(page: number, pageSize: number, totalItems: number) {
  const totalPages = Math.ceil(totalItems / pageSize);
  return { page, pageSize, totalItems, totalPages, hasPreviousPage: totalItems > 0 && page > 1, hasNextPage: page < totalPages };
}

export class ActionReadFixtures {
  readonly prisma = getPrisma();
  readonly userIds: number[] = [];
  readonly ticketIds: number[] = [];
  readonly referenceIds: { categoryId?: number; relatedSystemId?: number } = {};
  readonly actors = new Map<string, Actor>();
  readonly actions: Action[] = [];
  readonly histories: Array<{
    id: number; actionId: number; actor: { id: number; name: string }; event: ActionHistoryEvent;
    createdAt: string; actionVersion: number; sourceTicketStatusHistoryId: number | null;
    before: Snapshot | null; after: Snapshot;
  }> = [];
  mainTicket!: Awaited<ReturnType<ActionReadFixtures["ticket"]>>;
  emptyTicket!: Awaited<ReturnType<ActionReadFixtures["ticket"]>>;
  foreignTicket!: Awaited<ReturnType<ActionReadFixtures["ticket"]>>;
  completed!: Action;
  cancelled!: Action;
  historical!: Action;
  cascade!: Action;
  foreignAction!: Action;
  frozen: Array<{ ticketId: number; action: Action }> = [];

  async actor(label: string, role: UserRole = "REQUESTER") {
    const { user, password } = await createAuthUser({
      email: `issue44-read-${label}-${randomUUID()}@example.test`, role,
    });
    this.userIds.push(user.id); // Track ownership before login can fail.
    const login = await loginRequest(user.email, password);
    expect(login.status, "Inherited real login fixture succeeds").toBe(200);
    const actor = { user: { id: user.id, name: user.name }, cookie: cookieHeader(login.headers["set-cookie"]) };
    this.actors.set(label, actor);
    return actor;
  }

  who(label: string) {
    const actor = this.actors.get(label);
    if (!actor) throw new Error("Missing owned read fixture actor.");
    return actor;
  }

  async ticket(requesterId: number, currentStatus: TicketStatus = "OPEN") {
    const ticket = await this.prisma.ticket.create({ data: {
      ticketNumber: `R44-${randomUUID().replaceAll("-", "").slice(0, 12)}`,
      clientSubmissionId: randomUUID(), requesterId,
      categoryId: this.referenceIds.categoryId!, relatedSystemId: this.referenceIds.relatedSystemId!,
      ownerId: this.who("coordinator").user.id, requestedPriority: "HIGH", itPriority: "MEDIUM",
      currentStatus, summary: "Action read fixture", description: "Synthetic read API parent.",
      updatedAt: new Date("2026-10-04T03:00:00.000Z"),
    } });
    this.ticketIds.push(ticket.id);
    return ticket;
  }

  async action(ticketId: number, status: ActionStatus = "PLANNED", at = new Date("2026-10-04T01:00:00.000Z")) {
    const action = await this.prisma.action.create({ data: {
      ticketId, createdById: this.who("creator").user.id, assigneeId: this.who("assignee").user.id,
      performedById: status === "COMPLETED" ? this.who("completer").user.id : null,
      description: LITERAL, result: status === "COMPLETED" ? LITERAL : null, status,
      followUpRequired: false, followUpNote: null, attachmentNotes: `${LITERAL} file is text only`,
      actionAt: at, createdAt: at, updatedAt: at,
      completedAt: status === "COMPLETED" ? at : null,
      cancelledAt: status === "CANCELLED" ? at : null,
      cancellationReason: status === "CANCELLED" ? "Cancelled diagnostic work" : null,
    } });
    this.actions.push(action);
    return action;
  }

  dto(action: Action) {
    const identity = (id: number) => {
      const actor = [...this.actors.values()].find((entry) => entry.user.id === id);
      if (!actor) throw new Error("Missing observed identity.");
      return { id, name: actor.user.name };
    };
    return {
      id: action.id, ticketId: action.ticketId, actionAt: action.actionAt.toISOString(),
      description: action.description, result: action.result, createdBy: identity(action.createdById),
      assignee: identity(action.assigneeId), performedBy: action.performedById === null ? null : identity(action.performedById),
      status: action.status, followUpRequired: action.followUpRequired, followUpNote: action.followUpNote,
      attachmentNotes: action.attachmentNotes, cancellationReason: action.cancellationReason,
      createdAt: action.createdAt.toISOString(), updatedAt: action.updatedAt.toISOString(),
      completedAt: action.completedAt?.toISOString() ?? null, cancelledAt: action.cancelledAt?.toISOString() ?? null,
      version: action.version,
    };
  }

  assertDTO(actual: Record<string, unknown>, action: Action) {
    expect(Object.keys(actual).sort()).toEqual([...ACTION_KEYS].sort());
    for (const key of ["createdBy", "assignee", "performedBy"]) {
      if (actual[key] !== null) expect(Object.keys(actual[key] as object).sort()).toEqual(["id", "name"]);
    }
    assertSafeEqual(actual, this.dto(action), "Exact ActionDTO including explicit nulls and literal text");
  }

  sortedActions(ticketId = this.mainTicket.id, status?: ActionStatus) {
    return this.actions.filter((action) => action.ticketId === ticketId && (!status || action.status === status))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id);
  }

  sortedHistory(actionId: number) {
    return this.histories.filter((history) => history.actionId === actionId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id);
  }

  path(operation: ReadOperation, ticketId = this.mainTicket.id, actionId = this.completed.id) {
    const base = `/api/tickets/${ticketId}/actions`;
    return operation === "list" ? base : `${base}/${actionId}${operation === "history" ? "/history" : ""}`;
  }

  async domainDigest() {
    const where = { ticketId: { in: this.ticketIds } };
    const rows = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: this.userIds } }, orderBy: { id: "asc" } }),
      this.prisma.category.findMany({ where: { id: this.referenceIds.categoryId }, orderBy: { id: "asc" } }),
      this.prisma.relatedSystem.findMany({ where: { id: this.referenceIds.relatedSystemId }, orderBy: { id: "asc" } }),
      this.prisma.ticket.findMany({ where: { id: { in: this.ticketIds } }, orderBy: { id: "asc" } }),
      this.prisma.action.findMany({ where, orderBy: { id: "asc" } }),
      this.prisma.actionHistory.findMany({ where: { action: where }, orderBy: { id: "asc" } }),
      this.prisma.mutationReceipt.findMany({ where, orderBy: { id: "asc" } }),
      this.prisma.internalNote.findMany({ where, orderBy: { id: "asc" } }),
      this.prisma.publicComment.findMany({ where, orderBy: { id: "asc" } }),
      this.prisma.attachment.findMany({ where, orderBy: { id: "asc" } }),
      this.prisma.ticketStatusHistory.findMany({ where, orderBy: { id: "asc" } }),
      this.prisma.seedFixture.findMany({ where: { ticketId: { in: this.ticketIds } }, orderBy: { id: "asc" } }),
      this.prisma.ticketNumberSequence.findMany({ orderBy: { year: "asc" } }),
    ]);
    // AuthSession/lastSeenAt, expiry/revocation cleanup and LoginThrottle are deliberately excluded.
    return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  }

  async get(path: string, actor?: Actor) {
    const before = await this.domainDigest();
    try {
      const call = request(app).get(path);
      if (actor) call.set("Cookie", actor.cookie);
      return await call;
    } finally {
      expect(await this.domainDigest() === before, "Read preserves domain rows, versions, timestamps, history and receipts; digests redacted").toBe(true);
    }
  }

  async initialize() {
    const identity = configureTestDatabaseEnvironment();
    const operational = process.env.TOKTICKIT_DEVELOPMENT_DATABASE_URL;
    expect(!!operational && decodeURIComponent(new URL(operational).pathname.slice(1)) !== identity.databaseName,
      "Dedicated test database differs from operational database; names redacted").toBe(true);
    const live = await this.prisma.$queryRaw<Array<{ database: string; schema: string }>>`
      SELECT current_database() AS database, current_schema() AS schema`;
    expect(live[0]?.database === identity.databaseName && live[0]?.schema === identity.schema,
      "Live connection agrees with isolation guard; names redacted").toBe(true);
    for (const [label, role] of [
      ["requester", "REQUESTER"], ["foreign", "REQUESTER"], ["coordinator", "IT_STAFF"],
      ["creator", "IT_STAFF"], ["assignee", "IT_STAFF"], ["completer", "ADMINISTRATOR"], ["historical", "IT_STAFF"],
    ] as const) await this.actor(label, role);
    const suffix = randomUUID();
    this.referenceIds.categoryId = (await this.prisma.category.create({ data: { name: `Read category ${suffix}` } })).id;
    this.referenceIds.relatedSystemId = (await this.prisma.relatedSystem.create({ data: { name: `Read system ${suffix}` } })).id;
    this.mainTicket = await this.ticket(this.who("requester").user.id);
    this.emptyTicket = await this.ticket(this.who("requester").user.id);
    this.foreignTicket = await this.ticket(this.who("foreign").user.id);
    this.foreignAction = await this.action(this.foreignTicket.id);
    // Insert in reverse date order, with ties, so an ID-only/default order is observably wrong.
    for (let index = 0; index < 55; index += 1) {
      const status = (["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const)[index % 4];
      await this.action(this.mainTicket.id, status, new Date(Date.UTC(2026, 9, 4, 2, 0, 0, Math.floor((54 - index) / 2))));
    }
    this.completed = await this.historyChain("COMPLETED");
    this.cancelled = await this.historyChain("CANCELLED");
    const historical = await this.action(this.mainTicket.id, "COMPLETED");
    this.historical = await this.prisma.action.update({ where: { id: historical.id }, data: {
      assigneeId: this.who("historical").user.id, performedById: this.who("historical").user.id,
    } });
    this.actions[this.actions.findIndex((action) => action.id === historical.id)] = this.historical;
    for (const status of ["RESOLVED", "CLOSED", "CANCELLED"] as const) {
      const ticket = await this.ticket(this.who("requester").user.id, status);
      const action = await this.action(ticket.id, "COMPLETED");
      this.frozen.push({ ticketId: ticket.id, action });
    }
    this.cascade = await this.historyChain("CANCELLED", this.frozen[2].ticketId);
    await this.prisma.internalNote.create({ data: { ticketId: this.mainTicket.id, authorId: this.who("creator").user.id, content: PRIVATE_NOTE } });
    await this.prisma.publicComment.create({ data: { ticketId: this.mainTicket.id, authorId: this.who("requester").user.id, content: "Retained public discussion" } });
    await this.prisma.attachment.create({ data: { ticketId: this.mainTicket.id, uploadedByUserId: this.who("requester").user.id,
      originalFilename: "read-fixture.txt", storageKey: `read-${suffix}`, mimeType: "text/plain", sizeBytes: 12 } });
    await this.prisma.mutationReceipt.create({ data: {
      actorId: this.who("creator").user.id, clientMutationId: randomUUID(), operation: "CREATE_ACTION",
      ticketId: this.mainTicket.id, actionId: this.completed.id,
      inputFingerprint: createHash("sha256").update(randomUUID()).digest("hex"), safeResponse: { action: { id: this.completed.id } },
    } });
    // Historical identities remain readable despite current ineligibility/role changes.
    await this.prisma.user.update({ where: { id: this.who("historical").user.id }, data: { isActive: false } });
    await this.prisma.user.update({ where: { id: this.who("creator").user.id }, data: { role: "REQUESTER" } });
    console.info("Action read fixtures: guarded dedicated database; 55 paginated rows, full history chain and owned cleanup IDs.");
  }

  async historyChain(target: "COMPLETED" | "CANCELLED", ticketId = this.mainTicket.id) {
    let action = await this.action(ticketId);
    action = await this.prisma.action.update({ where: { id: action.id }, data: {
      assigneeId: this.who("creator").user.id, followUpRequired: true, followUpNote: "Retain this old note in history",
    } });
    const records: Array<{ before: Snapshot | null; after: Snapshot; event: ActionHistoryEvent; actorId: number; source: number | null }> = [
      { before: null, after: actionSnapshot(action), event: "ACTION_CREATED", actorId: action.createdById, source: null },
    ];
    const advance = async (event: ActionHistoryEvent, data: Prisma.ActionUncheckedUpdateInput, actorId: number, source: number | null = null) => {
      const before = actionSnapshot(action);
      // Synthetic ties test read ordering only; these fixtures do not exercise mutation timestamp guards.
      const at = new Date(action.createdAt.getTime() + Math.floor((action.version + 1) / 2));
      action = await this.prisma.action.update({ where: { id: action.id }, data: { ...data, version: action.version + 1, updatedAt: at } });
      records.push({ before, after: actionSnapshot(action), event, actorId, source });
    };
    if (target === "COMPLETED") {
      for (let index = 0; index < 22; index += 1) await advance("ACTION_EDITED", {
        description: `${LITERAL} revision ${index}`, followUpRequired: false, followUpNote: null,
      }, this.who("coordinator").user.id);
      await advance("ACTION_REASSIGNED", { assigneeId: this.who("assignee").user.id, description: `${LITERAL} reassigned content` }, this.who("coordinator").user.id);
      await advance("ACTION_STARTED", { status: "IN_PROGRESS" }, this.who("assignee").user.id);
      await advance("ACTION_COMPLETED", { status: "COMPLETED", result: LITERAL, performedById: this.who("completer").user.id,
        completedAt: new Date(action.createdAt.getTime() + Math.floor((action.version + 1) / 2)) }, this.who("completer").user.id);
    } else {
      let source: number | null = null;
      if (ticketId !== this.mainTicket.id) source = (await this.prisma.ticketStatusHistory.create({ data: {
        ticketId, actorId: this.who("coordinator").user.id, fromStatus: "OPEN", toStatus: "CANCELLED", reason: "Cancel parent work",
      } })).id;
      await advance(source === null ? "ACTION_CANCELLED" : "ACTION_CANCELLED_BY_TICKET", {
        status: "CANCELLED", result: "Retained draft result", cancellationReason: source === null ? "Cancel diagnostic work" : "Cancel parent work",
        cancelledAt: new Date(action.createdAt.getTime() + 1),
      }, this.who("coordinator").user.id, source);
    }
    // Reverse insertion within equal-time cohorts makes createdAt,id ordering meaningful.
    for (const record of [...records].reverse()) {
      const history = await this.prisma.actionHistory.create({ data: {
        actionId: action.id, actorId: record.actorId, event: record.event, actionVersion: record.after.version,
        createdAt: new Date(record.after.updatedAt), before: record.before ?? Prisma.DbNull,
        after: record.after, sourceTicketStatusHistoryId: record.source,
      } });
      const actor = [...this.actors.values()].find((entry) => entry.user.id === record.actorId)!;
      this.histories.push({ id: history.id, actionId: action.id, actor: { id: actor.user.id, name: actor.user.name },
        event: record.event, createdAt: history.createdAt.toISOString(), actionVersion: record.after.version,
        sourceTicketStatusHistoryId: record.source, before: record.before, after: record.after });
    }
    this.actions[this.actions.findIndex((entry) => entry.id === action.id)] = action;
    return action;
  }

  async cleanup() {
    // No broad prefix cleanup, table truncation, seed changes or operational database access.
    configureTestDatabaseEnvironment();
    const where = { ticketId: { in: this.ticketIds } };
    await this.prisma.$transaction([
      this.prisma.mutationReceipt.deleteMany({ where }),
      this.prisma.actionHistory.deleteMany({ where: { action: where } }),
      this.prisma.action.deleteMany({ where }),
      this.prisma.ticketStatusHistory.deleteMany({ where }),
      this.prisma.internalNote.deleteMany({ where }), this.prisma.publicComment.deleteMany({ where }),
      this.prisma.attachment.deleteMany({ where }),
      this.prisma.ticket.deleteMany({ where: { id: { in: this.ticketIds } } }),
      this.prisma.authSession.deleteMany({ where: { userId: { in: this.userIds } } }),
      this.prisma.user.deleteMany({ where: { id: { in: this.userIds } } }),
      this.prisma.category.deleteMany({ where: { id: this.referenceIds.categoryId ?? -1 } }),
      this.prisma.relatedSystem.deleteMany({ where: { id: this.referenceIds.relatedSystemId ?? -1 } }),
    ]);
    expect(await this.prisma.ticket.count({ where: { id: { in: this.ticketIds } } })).toBe(0);
    expect(await this.prisma.user.count({ where: { id: { in: this.userIds } } })).toBe(0);
    await this.prisma.$disconnect();
    console.info("Action read fixtures cleaned: exact owned Ticket/User IDs absent; Prisma disconnected.");
  }
}
