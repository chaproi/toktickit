import { randomUUID } from "node:crypto";
import type { Action } from "@prisma/client";
import { Client } from "pg";
import request, { type Response } from "supertest";
import { expect } from "vitest";
import { app } from "../../src/app.js";
import { configureTestDatabaseEnvironment } from "../../src/testing/test-database.js";
import { APPROVED_ORIGIN, cookieValue } from "../lab-03/auth-test-helpers.js";
import { ActionReadFixtures, actionSnapshot, assertSafeEqual } from "./action-read-test-fixtures.js";

export type WorkflowOperation = "create" | "start" | "edit" | "reassign" | "complete";
type Actor = ReturnType<ActionReadFixtures["who"]>;
export const WORKFLOW_REASON = "Workflow race reason <script>literal</script>.";
export const WORKFLOW_EDIT = "Workflow concurrent edited content <script>literal</script>.";
export const WORKFLOW_RESULT = "Workflow completed result <script>literal</script>.";
const description = "Workflow race delegated diagnostic task <script>literal</script>.";
const note = "Optional follow-up retained after completion.";

// Dedicated fixtures, not a replacement for existing shared race/setup helpers.
export class WorkflowRaceFixtures {
  readonly read = new ActionReadFixtures();
  readonly prisma = this.read.prisma;
  who(label: string) { return this.read.who(label); }

  async initialize() {
    const identity = configureTestDatabaseEnvironment();
    const operational = process.env.TOKTICKIT_DEVELOPMENT_DATABASE_URL;
    expect(Boolean(operational) && decodeURIComponent(new URL(operational!).pathname.slice(1)) !== identity.databaseName,
      "Workflow races require a distinct dedicated test database; identifiers withheld").toBe(true);
    const [live] = await this.prisma.$queryRaw<Array<{ database: string; schema: string }>>`
      SELECT current_database() AS database,current_schema() AS schema`;
    expect(live.database === identity.databaseName && live.schema === identity.schema, "Live workflow race target agrees with isolation guard").toBe(true);
    for (const [label, role] of [
      ["requester", "REQUESTER"], ["coordinator", "IT_STAFF"], ["creator", "IT_STAFF"],
      ["assignee", "IT_STAFF"], ["completer", "ADMINISTRATOR"], ["replacement", "IT_STAFF"],
      ["workflow", "ADMINISTRATOR"], ["operator", "IT_STAFF"],
    ] as const) await this.read.actor(`workflow-race-${label}`, role).then((actor) => this.read.actors.set(label, actor));
    this.read.referenceIds.categoryId = (await this.prisma.category.create({ data: { name: `Workflow race category ${randomUUID()}` } })).id;
    this.read.referenceIds.relatedSystemId = (await this.prisma.relatedSystem.create({ data: { name: `Workflow race system ${randomUUID()}` } })).id;
  }

  mutation(method: "post" | "patch", path: string, actor: Actor, input: object) {
    const csrf = cookieValue(actor.cookie.split("; "), "toktickit_csrf");
    expect(typeof csrf).toBe("string");
    return request(app)[method](path).set("Origin", APPROVED_ORIGIN).set("Cookie", actor.cookie).set("X-CSRF-Token", csrf!).send(input);
  }

  async state(ticketId: number) {
    const [ticket, actions, history, ticketHistory, receipts] = await Promise.all([
      this.prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } }),
      this.prisma.action.findMany({ where: { ticketId }, orderBy: { id: "asc" } }),
      this.prisma.actionHistory.findMany({ where: { action: { ticketId } }, orderBy: { id: "asc" } }),
      this.prisma.ticketStatusHistory.findMany({ where: { ticketId }, orderBy: { id: "asc" } }),
      this.prisma.mutationReceipt.findMany({ where: { ticketId }, orderBy: { id: "asc" } }),
    ]);
    return { ticket, actions, history, ticketHistory, receipts };
  }

  createInput(parent: { updatedAt: Date }) {
    return { description, result: "Retained optional draft result", assigneeId: this.who("assignee").user.id,
      followUpRequired: true, followUpNote: note, attachmentNotes: "Literal <script>attachment note</script>; no binary link.",
      expectedTicketUpdatedAt: parent.updatedAt.toISOString(), clientMutationId: randomUUID() };
  }

  statusInput(parent: { updatedAt: Date }, action: Action, targetStatus: "IN_PROGRESS" | "COMPLETED" | "CANCELLED") {
    return { expectedTicketUpdatedAt: parent.updatedAt.toISOString(), expectedVersion: action.version, clientMutationId: randomUUID(), targetStatus,
      ...(targetStatus === "COMPLETED" ? { confirm: true, result: WORKFLOW_RESULT } : {}),
      ...(targetStatus === "CANCELLED" ? { confirm: true, reason: WORKFLOW_REASON } : {}) };
  }

  async setup(operation: WorkflowOperation, closing = false) {
    const parent = await this.read.ticket(this.who("requester").user.id);
    await this.prisma.ticketStatusHistory.create({ data: { ticketId: parent.id, actorId: this.who("coordinator").user.id,
      fromStatus: "NEW", toStatus: "OPEN", reason: "Prior workflow handoff" } });
    const create = async () => {
      const current = await this.state(parent.id);
      const response = await this.mutation("post", `/api/tickets/${parent.id}/actions`, this.who("creator"), this.createInput(current.ticket));
      expect(response.status, "Real API fixture creation succeeds").toBe(201);
      return this.prisma.action.findUniqueOrThrow({ where: { id: response.body.action.id as number } });
    };
    const advance = async (actionId: number, target: "IN_PROGRESS" | "COMPLETED" | "CANCELLED") => {
      const current = await this.state(parent.id), action = current.actions.find((row) => row.id === actionId)!;
      const response = await this.mutation("patch", `/api/tickets/${parent.id}/actions/${actionId}/status`,
        this.who(target === "COMPLETED" ? "completer" : "creator"), this.statusInput(current.ticket, action, target));
      expect(response.status, "Real API fixture lifecycle succeeds").toBe(200);
    };
    // Two terminal siblings give every race non-vacuous earlier histories,
    // operation-time receipts and historical completer references to preserve.
    const completed = await create(); await advance(completed.id, "IN_PROGRESS"); await advance(completed.id, "COMPLETED");
    const cancelled = await create(); await advance(cancelled.id, "CANCELLED");
    let actionId: number | null = null;
    if (operation !== "create") {
      actionId = (await create()).id;
      if (operation === "complete") await advance(actionId, "IN_PROGRESS");
    }
    if (closing) {
      // A real otherwise-valid resolution establishes a legal frozen parent;
      // there is no invented creation-winning outcome under RESOLVED.
      const resolved = await this.transition(await this.state(parent.id), "RESOLVED");
      expect(resolved.status).toBe(200);
    }
    const before = await this.state(parent.id);
    const target = before.actions.find((row) => row.id === actionId);
    const input = operation === "create" ? this.createInput(before.ticket)
      : operation === "edit" || operation === "reassign" ? {
        expectedTicketUpdatedAt: before.ticket.updatedAt.toISOString(), expectedVersion: target!.version, clientMutationId: randomUUID(),
        description: WORKFLOW_EDIT, ...(operation === "reassign" ? { assigneeId: this.who("replacement").user.id } : {}),
      } : this.statusInput(before.ticket, target!, operation === "start" ? "IN_PROGRESS" : "COMPLETED");
    const actionCall = () => this.mutation(operation === "create" ? "post" : "patch",
      `/api/tickets/${parent.id}/actions${actionId === null ? "" : `/${actionId}${operation === "start" || operation === "complete" ? "/status" : ""}`}`,
      this.who("operator"), input);
    const actionUsers = [this.who("assignee").user.id, this.who("operator").user.id,
      ...(operation === "reassign" ? [this.who("replacement").user.id] : [])];
    const ticketUsers = [this.who("workflow").user.id, this.who("coordinator").user.id];
    expect(actionUsers.some((id) => ticketUsers.includes(id)), "Disjoint User gates: shared parent serialization, not a shared actor/assignee gate").toBe(false);
    return { before, operation, input, actionId, actionCall, actionUsers, ticketUsers };
  }

  transition(before: WorkflowState, targetStatus: "RESOLVED" | "CLOSED" | "CANCELLED") {
    return this.mutation("patch", `/api/staff/tickets/${before.ticket.id}/status`, this.who("workflow"), {
      targetStatus, expectedUpdatedAt: before.ticket.updatedAt.toISOString(), confirm: true, reason: `  ${WORKFLOW_REASON}  `,
    });
  }

  async cleanup() {
    const tickets = [...this.read.ticketIds], users = [...this.read.userIds];
    try {
      await this.read.cleanup();
      const scope = { ticketId: { in: tickets } };
      const counts = await Promise.all([
        this.prisma.ticket.count({ where: { id: { in: tickets } } }), this.prisma.action.count({ where: scope }),
        this.prisma.actionHistory.count({ where: { action: scope } }), this.prisma.ticketStatusHistory.count({ where: scope }),
        this.prisma.mutationReceipt.count({ where: scope }), this.prisma.user.count({ where: { id: { in: users } } }),
        this.prisma.authSession.count({ where: { userId: { in: users } } }),
      ]);
      expect(counts).toEqual([0, 0, 0, 0, 0, 0, 0]);
      const [clients] = await this.prisma.$queryRaw<Array<{ count: number }>>`
        SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name LIKE 'workflow46-race-%'`;
      expect(clients.count).toBe(0);
      console.info("Workflow race cleanup: zero owned domain/session rows and coordination clients; no injection resources created.");
    } finally { await this.prisma.$disconnect(); }
  }
}

export type WorkflowState = Awaited<ReturnType<WorkflowRaceFixtures["state"]>>;
export type WorkflowScenario = Awaited<ReturnType<WorkflowRaceFixtures["setup"]>>;

// No service mocks, artificial SQL failures, or timeout changes. First holds
// the actual shared Ticket gate while an owned row lock pauses its real SQL.
export async function orderedWorkflowRace(ticketId: number,
  first: { users: number[]; call: () => PromiseLike<Response> }, second: { users: number[]; call: () => PromiseLike<Response> }) {
  const identity = configureTestDatabaseEnvironment();
  const blocker = new Client({ connectionString: process.env.DATABASE_URL, application_name: `workflow46-race-blocker-${randomUUID()}` });
  const observer = new Client({ connectionString: process.env.DATABASE_URL, application_name: `workflow46-race-observer-${randomUUID()}` });
  const pending: Array<Promise<{ response: Response } | { failed: true }>> = [];
  let open = false;
  const launch = (call: () => PromiseLike<Response>) => {
    const result = Promise.resolve().then(call).then((response) => ({ response }), () => ({ failed: true as const }));
    pending.push(result); return result;
  };
  const observe = async (sql: string, values: number[]) => {
    const deadline = performance.now() + 2_500;
    while (performance.now() < deadline) {
      const rows = (await observer.query<{ pid: number }>(sql, values)).rows;
      if (rows.length === 1) return rows[0].pid;
      await new Promise((resolve) => setTimeout(resolve, 10)); // Bounded condition polling, not sleep-based ordering.
    }
    throw new Error("Workflow race required lock chain not observed within finite coordination budget.");
  };
  try {
    await blocker.connect(); await observer.connect();
    const live = (await blocker.query<{ database: string; schema: string }>("SELECT current_database() AS database,current_schema() AS schema")).rows[0];
    expect(live.database === identity.databaseName && live.schema === identity.schema, "Coordination live database matches isolation guard").toBe(true);
    await blocker.query("BEGIN"); open = true;
    const blockerPid = (await blocker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    await blocker.query('SELECT id FROM "Ticket" WHERE id=$1 FOR UPDATE', [ticketId]);
    const firstPending = launch(first.call);
    const firstPid = await observe(`SELECT a.pid FROM pg_stat_activity a
      WHERE $1::int=ANY(pg_blocking_pids(a.pid)) AND EXISTS (
        SELECT 1 FROM pg_locks g WHERE g.pid=a.pid AND g.locktype='advisory'
          AND g.classid=2::oid AND g.objid=$2::oid AND g.objsubid=2 AND g.granted)`, [blockerPid, ticketId]);
    const secondPending = launch(second.call);
    const secondPid = await observe(`SELECT g.pid FROM pg_locks g WHERE g.locktype='advisory'
      AND g.classid=2::oid AND g.objid=$1::oid AND g.objsubid=2 AND NOT g.granted
      AND $2::int=ANY(pg_blocking_pids(g.pid))`, [ticketId, firstPid]);
    expect(firstPid).not.toBe(secondPid);
    for (const [pid, expected] of [[firstPid, first.users], [secondPid, second.users]] as const) {
      const gates = (await observer.query<{ id: number }>(`SELECT objid::int AS id FROM pg_locks
        WHERE pid=$1 AND locktype='advisory' AND classid=1::oid AND objsubid=2 AND granted ORDER BY objid`, [pid])).rows.map((row) => row.id);
      expect(gates).toEqual([...new Set(expected)].sort((a, b) => a - b));
    }
    await blocker.query("COMMIT"); open = false;
    const [a, b] = await Promise.all([firstPending, secondPending]);
    if (!("response" in a) || !("response" in b)) throw new Error("Workflow race HTTP transport failure; details withheld.");
    const locks = await observer.query<{ count: number }>(`SELECT count(*)::int AS count FROM pg_locks
      WHERE pid=ANY($1::int[]) AND locktype='advisory'`, [[firstPid, secondPid]]);
    expect(locks.rows[0].count, "Completed requests retain no transaction gates").toBe(0);
    console.info(`Workflow race overlap: firstPid=${firstPid}; secondPid=${secondPid}; disjoint User gates observed; first holds Ticket gate/awaits owned row; second awaits first Ticket gate; released and drained.`);
    return { first: a.response, second: b.response };
  } finally {
    if (open) await blocker.query("ROLLBACK").catch(() => undefined);
    await Promise.all(pending);
    const closed = await Promise.allSettled([observer.end(), blocker.end()]);
    expect(closed.every((item) => item.status === "fulfilled"), "Owned workflow barrier clients disconnect after draining HTTP requests").toBe(true);
  }
}

export function assertEarlier(before: WorkflowState, after: WorkflowState) {
  for (const key of ["history", "ticketHistory", "receipts"] as const) {
    assertSafeEqual(after[key].filter((row) => before[key].some((old) => old.id === row.id)), before[key], `Exact original ${key} retained; original receipts never rewritten`);
  }
}

export function assertTicketMutation(fixtures: WorkflowRaceFixtures, before: WorkflowState, after: WorkflowState,
  response: Response, target: "RESOLVED" | "CLOSED" | "CANCELLED") {
  expect(response.status).toBe(200);
  expect(Object.keys(response.body)).toEqual(["ticket"]);
  expect(after.ticket.updatedAt.getTime()).toBeGreaterThan(before.ticket.updatedAt.getTime());
  assertSafeEqual(after.ticket, { ...before.ticket, currentStatus: target, updatedAt: after.ticket.updatedAt }, "Exact Ticket status/time transition only");
  const owner = fixtures.who("coordinator");
  assertSafeEqual(response.body.ticket, { id: before.ticket.id, owner: { ...owner.user, role: "IT_STAFF" },
    requestedPriority: before.ticket.requestedPriority, itPriority: before.ticket.itPriority,
    currentStatus: target, updatedAt: after.ticket.updatedAt.toISOString(), requesterResolutionIndicatedAt: null }, "Exact inherited Ticket mutation DTO");
  expect(after.ticketHistory).toHaveLength(before.ticketHistory.length + 1);
  const event = after.ticketHistory.at(-1)!;
  assertSafeEqual(event, { id: event.id, ticketId: before.ticket.id, actorId: fixtures.who("workflow").user.id,
    fromStatus: before.ticket.currentStatus, toStatus: target, reason: WORKFLOW_REASON, createdAt: event.createdAt }, "One real attributed reason-bearing Ticket event");
  if (target === "CANCELLED") expect(event.createdAt.toISOString()).toBe(after.ticket.updatedAt.toISOString());
  assertEarlier(before, after);
  assertSafeEqual(after.receipts, before.receipts, "Ticket workflow creates no receipts or rewrites original responses");
  const unfinished = before.actions.filter((row) => row.status === "PLANNED" || row.status === "IN_PROGRESS");
  expect(after.history).toHaveLength(before.history.length + (target === "CANCELLED" ? unfinished.length : 0));
  expect(after.actions).toHaveLength(before.actions.length);
  for (const old of before.actions) {
    const action = after.actions.find((row) => row.id === old.id)!;
    if (target !== "CANCELLED" || !unfinished.some((row) => row.id === old.id)) {
      assertSafeEqual(action, old, "Terminal/unaffected child fields, performer and timestamps unchanged"); continue;
    }
    assertSafeEqual(action, { ...old, status: "CANCELLED", version: old.version + 1, cancellationReason: WORKFLOW_REASON,
      updatedAt: after.ticket.updatedAt, cancelledAt: after.ticket.updatedAt, performedById: null, completedAt: null }, "Exact unfinished cancellation preserving draft/follow-up/identities");
    expect(action.updatedAt.getTime()).toBeGreaterThan(old.updatedAt.getTime());
    const events = after.history.filter((row) => row.actionId === action.id && row.actionVersion === action.version);
    expect(events).toHaveLength(1);
    assertSafeEqual(events[0], { id: events[0].id, actionId: action.id, actorId: fixtures.who("workflow").user.id,
      event: "ACTION_CANCELLED_BY_TICKET", actionVersion: action.version, createdAt: after.ticket.updatedAt,
      sourceTicketStatusHistoryId: event.id, before: actionSnapshot(old), after: actionSnapshot(action) }, "Full same-Ticket source-linked cascade snapshot");
  }
  expect(after.actions.some((row) => row.status === "PLANNED" || row.status === "IN_PROGRESS"), "No newly frozen Ticket has unfinished children").toBe(false);
}

export function assertActionMutation(fixtures: WorkflowRaceFixtures, scenario: WorkflowScenario, after: WorkflowState, response: Response) {
  const { before, operation, actionId, input } = scenario;
  expect(response.status).toBe(operation === "create" ? 201 : 200);
  expect(Object.keys(response.body).sort()).toEqual(["action", "ticketUpdatedAt"]);
  const action = after.actions.find((row) => operation === "create" ? !before.actions.some((old) => old.id === row.id) : row.id === actionId)!;
  expect(action).toBeDefined();
  const actorId = fixtures.who("operator").user.id;
  const old = before.actions.find((row) => row.id === actionId);
  const expected = operation === "create" ? {
    id: action.id, ticketId: before.ticket.id, createdById: actorId, assigneeId: fixtures.who("assignee").user.id, performedById: null,
    description, result: "Retained optional draft result", followUpRequired: true, followUpNote: note,
    attachmentNotes: "Literal <script>attachment note</script>; no binary link.", status: "PLANNED", version: 1,
    actionAt: action.updatedAt, createdAt: action.updatedAt, updatedAt: action.updatedAt, completedAt: null, cancelledAt: null, cancellationReason: null,
  } : { ...old!, version: old!.version + 1, updatedAt: action.updatedAt,
    ...(operation === "edit" || operation === "reassign" ? { description: WORKFLOW_EDIT } : {}),
    ...(operation === "reassign" ? { assigneeId: fixtures.who("replacement").user.id } : {}),
    ...(operation === "start" ? { status: "IN_PROGRESS" } : {}),
    ...(operation === "complete" ? { status: "COMPLETED", performedById: actorId, completedAt: action.updatedAt, result: WORKFLOW_RESULT } : {}),
  };
  assertSafeEqual(action, expected, "Exact winning Action fields/version/immutable attribution and retained follow-up");
  expect(action.updatedAt.getTime()).toBeGreaterThan((old ?? before.ticket).updatedAt.getTime());
  expect(after.ticket.updatedAt.getTime()).toBeGreaterThan(before.ticket.updatedAt.getTime());
  expect(after.ticket.updatedAt.toISOString()).toBe(action.updatedAt.toISOString());
  assertSafeEqual(after.ticket, { ...before.ticket, updatedAt: action.updatedAt }, "Winning Action advances only parent timestamp");
  fixtures.read.assertDTO(response.body.action, action);
  expect(response.body.ticketUpdatedAt).toBe(after.ticket.updatedAt.toISOString());
  expect(after.actions).toHaveLength(before.actions.length + (operation === "create" ? 1 : 0));
  assertSafeEqual(after.actions.filter((row) => row.id !== action.id), before.actions.filter((row) => row.id !== action.id), "Unaffected terminal siblings remain byte-for-byte unchanged");
  assertEarlier(before, after);
  assertSafeEqual(after.ticketHistory, before.ticketHistory, "Losing/rejected Ticket request appends no status event");
  expect(after.history).toHaveLength(before.history.length + 1);
  const eventName = { create: "ACTION_CREATED", edit: "ACTION_EDITED", reassign: "ACTION_REASSIGNED", start: "ACTION_STARTED", complete: "ACTION_COMPLETED" } as const;
  const history = after.history.at(-1)!;
  assertSafeEqual(history, { id: history.id, actionId: action.id, actorId, event: eventName[operation], actionVersion: action.version,
    createdAt: action.updatedAt, sourceTicketStatusHistoryId: null, before: old ? actionSnapshot(old) : null, after: actionSnapshot(action) }, "One full Action audit event for actual winning operation");
  expect(after.receipts).toHaveLength(before.receipts.length + 1);
  const receipt = after.receipts.at(-1)!;
  const receiptOperations = { create: "CREATE_ACTION", edit: "EDIT_ACTION", reassign: "EDIT_ACTION", start: "START_ACTION", complete: "COMPLETE_ACTION" } as const;
  expect({ actorId: receipt.actorId, ticketId: receipt.ticketId, actionId: receipt.actionId, operation: receipt.operation, key: receipt.clientMutationId })
    .toEqual({ actorId, ticketId: before.ticket.id, actionId: action.id, operation: receiptOperations[operation], key: input.clientMutationId });
  expect(receipt.createdAt.toISOString()).toBe(action.updatedAt.toISOString());
  expect(/^[a-f0-9]{64}$/u.test(receipt.inputFingerprint), "Receipt fingerprint shape valid; value withheld").toBe(true);
  assertSafeEqual(receipt.safeResponse, response.body, "One immutable committed operation-time receipt");
  return action;
}
