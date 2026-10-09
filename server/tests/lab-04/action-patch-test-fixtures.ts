import { randomUUID } from "node:crypto";
import { Prisma, type Action, type ActionHistoryEvent, type ActionStatus, type Ticket } from "@prisma/client";
import request from "supertest";
import { expect } from "vitest";
import { app } from "../../src/app.js";
import { configureTestDatabaseEnvironment } from "../../src/testing/test-database.js";
import { APPROVED_ORIGIN, cookieValue } from "../lab-03/auth-test-helpers.js";
import { ActionCreateFixtures, FULL_CONTENT, type CreateActor } from "./action-create-test-fixtures.js";
import { LITERAL, actionSnapshot, assertSafeEqual } from "./action-read-test-fixtures.js";

export const PATCH_OPERATIONS = ["edit", "start", "complete", "cancel"] as const;
export type PatchOperation = typeof PATCH_OPERATIONS[number];
export type ActionCase = { action: Action; parent: Ticket };
export const EDIT_TEXT = `${LITERAL} edited content`;
export const COMPLETION_TEXT = `${LITERAL} completed diagnostics`;
export const CANCELLATION_TEXT = `${LITERAL} cancelled work`;
export const operationNames = { edit: "EDIT_ACTION", start: "START_ACTION", complete: "COMPLETE_ACTION", cancel: "CANCEL_ACTION" } as const;
export const operationEvents = { edit: "ACTION_EDITED", start: "ACTION_STARTED", complete: "ACTION_COMPLETED", cancel: "ACTION_CANCELLED" } as const;
type RequestOptions = { origin?: string; csrf?: string; omitCsrfCookie?: boolean };

export class ActionPatchFixtures {
  readonly creates = new ActionCreateFixtures();
  readonly prisma = this.creates.prisma;
  get read() { return this.creates.read; }
  get staff() { return this.creates.staff; }
  get administrator() { return this.creates.administrator; }
  initialize() { return this.creates.initialize(); }
  cleanup() { return this.creates.cleanup(); }

  async setup(status: ActionStatus = "PLANNED", options: { followUpRequired?: boolean; assigneeId?: number; attachmentNotes?: string | null } = {}): Promise<ActionCase> {
    const parent = await this.creates.parent();
    const input = this.creates.fullInput(parent, options.assigneeId ?? this.read.who("assignee").user.id);
    const content = { ...FULL_CONTENT };
    if (options.followUpRequired === false) {
      input.followUpRequired = false; input.followUpNote = null;
      content.followUpRequired = false; content.followUpNote = null;
    }
    if (Object.hasOwn(options, "attachmentNotes")) {
      input.attachmentNotes = options.attachmentNotes; content.attachmentNotes = options.attachmentNotes ?? null;
    }
    const created = await this.creates.create(parent, input, this.staff, content);
    let source: ActionCase = { action: created.action, parent: created.parent };
    if (status === "IN_PROGRESS" || status === "COMPLETED") source = await this.construct(source, "IN_PROGRESS");
    if (status === "COMPLETED" || status === "CANCELLED") source = await this.construct(source, status);
    return source;
  }

  async construct(source: ActionCase, status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED"): Promise<ActionCase> {
    // Coherent direct source/later-state setup only. No unimplemented PATCH route is used or proved.
    return this.prisma.$transaction(async (transaction) => {
      const at = new Date(Math.max(Date.now(), source.action.updatedAt.getTime() + 1, source.parent.updatedAt.getTime() + 1));
      const actor = status === "COMPLETED" ? this.administrator : this.staff;
      const action = await transaction.action.update({ where: { id: source.action.id }, data: {
        status, version: source.action.version + 1, updatedAt: at,
        ...(status === "COMPLETED" ? { performedById: actor.user.id, completedAt: at, result: COMPLETION_TEXT } : {}),
        ...(status === "CANCELLED" ? { performedById: null, completedAt: null, cancelledAt: at, cancellationReason: CANCELLATION_TEXT } : {}),
      } });
      const event = status === "IN_PROGRESS" ? "ACTION_STARTED" : status === "COMPLETED" ? "ACTION_COMPLETED" : "ACTION_CANCELLED";
      await transaction.actionHistory.create({ data: { actionId: action.id, actorId: actor.user.id, event,
        actionVersion: action.version, before: actionSnapshot(source.action), after: actionSnapshot(action), createdAt: at } });
      const parent = await transaction.ticket.update({ where: { id: source.parent.id }, data: { updatedAt: at } });
      return { action, parent };
    });
  }

  tokens(source: ActionCase): Record<string, unknown> {
    return { expectedVersion: source.action.version, expectedTicketUpdatedAt: source.parent.updatedAt.toISOString(), clientMutationId: randomUUID() };
  }
  editInput(source: ActionCase, patch: Record<string, unknown> = { description: `  ${EDIT_TEXT}  ` }) {
    return { ...this.tokens(source), ...patch };
  }
  statusInput(source: ActionCase, targetStatus: ActionStatus): Record<string, unknown> {
    return { ...this.tokens(source), targetStatus,
      ...(targetStatus === "COMPLETED" ? { confirm: true, result: `  ${COMPLETION_TEXT}  ` } : {}),
      ...(targetStatus === "CANCELLED" ? { confirm: true, reason: `  ${CANCELLATION_TEXT}  ` } : {}),
    };
  }
  input(source: ActionCase, operation: PatchOperation) {
    return operation === "edit" ? this.editInput(source) : this.statusInput(source, operation === "start" ? "IN_PROGRESS" : operation === "complete" ? "COMPLETED" : "CANCELLED");
  }
  path(source: ActionCase, operation: PatchOperation, ticketId: number | string = source.parent.id, actionId: number | string = source.action.id) {
    return `/api/tickets/${ticketId}/actions/${actionId}${operation === "edit" ? "" : "/status"}`;
  }
  patch(path: string, input: Record<string, unknown>, actor: CreateActor | null = this.administrator, options: RequestOptions = {}) {
    const call = request(app).patch(path).set("Content-Type", "application/json");
    const origin = Object.hasOwn(options, "origin") ? options.origin : APPROVED_ORIGIN;
    if (origin !== undefined) call.set("Origin", origin);
    if (actor) {
      const cookies = actor.cookie.split("; ");
      call.set("Cookie", options.omitCsrfCookie ? cookies.filter((cookie) => !cookie.startsWith("toktickit_csrf=")).join("; ") : actor.cookie);
      const csrf = Object.hasOwn(options, "csrf") ? options.csrf : cookieValue(cookies, "toktickit_csrf");
      if (csrf !== undefined) call.set("X-CSRF-Token", csrf);
    }
    return call.send(input);
  }
  async rejected(path: string, input: Record<string, unknown>, actor: CreateActor | null = this.administrator, options: RequestOptions = {}) {
    const before = await this.read.domainDigest();
    try { return await this.patch(path, input, actor, options); }
    finally { expect(await this.read.domainDigest() === before, "Rejected PATCH preserves all owned domain rows/time/version/history/receipts; values redacted; session bookkeeping excluded").toBe(true); }
  }

  async successful(source: ActionCase, operation: PatchOperation, input = this.input(source, operation), actor = this.administrator,
    changes: Partial<Action> = operation === "edit" ? { description: EDIT_TEXT } : {}, event: ActionHistoryEvent = operationEvents[operation]) {
    const scope = { ticketId: { in: this.read.ticketIds } };
    const oldActions = await this.prisma.action.findMany({ where: scope, orderBy: { id: "asc" } });
    const oldHistory = await this.prisma.actionHistory.findMany({ where: { action: scope }, orderBy: { id: "asc" } });
    const oldReceipts = await this.prisma.mutationReceipt.findMany({ where: scope, orderBy: { id: "asc" } });
    const response = await this.patch(this.path(source, operation), input, actor);
    expect(response.status).toBe(200); // Missing PATCH routes must reach HTTP RED before persistence assertions.
    expect(Object.keys(response.body).sort()).toEqual(["action", "ticketUpdatedAt"]);
    const action = await this.prisma.action.findUniqueOrThrow({ where: { id: source.action.id } });
    const parent = await this.prisma.ticket.findUniqueOrThrow({ where: { id: source.parent.id } });
    const lifecycle = operation === "start" ? { status: "IN_PROGRESS" as const } : operation === "complete" ? {
      status: "COMPLETED" as const, performedById: actor.user.id, completedAt: action.updatedAt, result: COMPLETION_TEXT,
    } : operation === "cancel" ? { status: "CANCELLED" as const, performedById: null, completedAt: null,
      cancelledAt: action.updatedAt, cancellationReason: CANCELLATION_TEXT } : {};
    assertSafeEqual(action, { ...source.action, ...changes, ...lifecycle, version: source.action.version + 1, updatedAt: action.updatedAt },
      "Exact final values, omitted fields, immutable attribution/parent/creation time and lifecycle nulls");
    expect(action.updatedAt.getTime()).toBeGreaterThan(source.action.updatedAt.getTime());
    expect(parent.updatedAt.getTime()).toBeGreaterThan(source.parent.updatedAt.getTime());
    assertSafeEqual({ ...parent, updatedAt: source.parent.updatedAt }, source.parent, "Only parent time changes; ownership and all other fields retained");
    this.read.assertDTO(response.body.action, action);
    expect(response.body.ticketUpdatedAt).toBe(parent.updatedAt.toISOString());
    const histories = await this.prisma.actionHistory.findMany({ where: { actionId: action.id, actionVersion: action.version } });
    expect(histories).toHaveLength(1);
    const history = histories[0];
    expect({ actionId: history.actionId, actorId: history.actorId, event: history.event, actionVersion: history.actionVersion,
      sourceTicketStatusHistoryId: history.sourceTicketStatusHistoryId }).toEqual({
      actionId: action.id, actorId: actor.user.id, event, actionVersion: source.action.version + 1, sourceTicketStatusHistoryId: null,
    });
    expect(history.createdAt.toISOString()).toBe(action.updatedAt.toISOString());
    assertSafeEqual(history.before, actionSnapshot(source.action), "Complete immutable history.before including old note");
    assertSafeEqual(history.after, actionSnapshot(action), "Complete approved history.after with explicit nulls");
    const receipts = await this.prisma.mutationReceipt.findMany({ where: { actorId: actor.user.id, clientMutationId: String(input.clientMutationId) } });
    expect(receipts).toHaveLength(1);
    const receipt = receipts[0];
    expect({ actorId: receipt.actorId, operation: receipt.operation, ticketId: receipt.ticketId, actionId: receipt.actionId })
      .toEqual({ actorId: actor.user.id, operation: operationNames[operation], ticketId: parent.id, actionId: action.id });
    expect(/^[a-f0-9]{64}$/u.test(receipt.inputFingerprint), "Fingerprint representation valid; value redacted").toBe(true);
    assertSafeEqual(receipt.safeResponse, response.body, "Exact original safe response stored at operation time");
    expect(await this.prisma.action.count({ where: scope })).toBe(oldActions.length);
    expect(await this.prisma.actionHistory.count({ where: { action: scope } })).toBe(oldHistory.length + 1);
    expect(await this.prisma.mutationReceipt.count({ where: scope })).toBe(oldReceipts.length + 1);
    assertSafeEqual(await this.prisma.action.findMany({ where: { id: { in: oldActions.filter((row) => row.id !== action.id).map((row) => row.id) } }, orderBy: { id: "asc" } }), oldActions.filter((row) => row.id !== action.id), "Other Actions unchanged");
    assertSafeEqual(await this.prisma.actionHistory.findMany({ where: { id: { in: oldHistory.map((row) => row.id) } }, orderBy: { id: "asc" } }), oldHistory, "All old history unchanged");
    assertSafeEqual(await this.prisma.mutationReceipt.findMany({ where: { id: { in: oldReceipts.map((row) => row.id) } }, orderBy: { id: "asc" } }), oldReceipts, "All old receipts unchanged");
    return { action, parent, response, history, receipt };
  }

  async freezeLater(source: ActionCase) {
    const terminal = source.action.status === "PLANNED" || source.action.status === "IN_PROGRESS" ? await this.construct(source, "CANCELLED") : source;
    const at = new Date(Math.max(Date.now(), terminal.parent.updatedAt.getTime() + 1));
    const parent = await this.prisma.ticket.update({ where: { id: terminal.parent.id }, data: { currentStatus: "CLOSED", updatedAt: at } });
    return { action: terminal.action, parent }; // Explicit later fixture state, not workflow evidence.
  }

  async sibling(source: ActionCase) {
    const parent = await this.prisma.ticket.findUniqueOrThrow({ where: { id: source.parent.id } });
    const response = await this.creates.post(this.creates.path(parent.id), this.creates.input(parent), this.staff);
    expect(response.status, "Existing API-04 creates coherent sibling setup").toBe(201);
    return { action: await this.prisma.action.findUniqueOrThrow({ where: { id: response.body.action.id } }),
      parent: await this.prisma.ticket.findUniqueOrThrow({ where: { id: parent.id } }) };
  }

  async withReceiptFailure(source: ActionCase, operation: PatchOperation, input: Record<string, unknown>, actor: CreateActor,
    work: (reached: () => Promise<boolean>) => Promise<void>) {
    const identity = configureTestDatabaseEnvironment();
    const [live] = await this.prisma.$queryRaw<Array<{ database: string; schema: string }>>`SELECT current_database() AS database,current_schema() AS schema`;
    expect(live.database === identity.databaseName && live.schema === identity.schema, "Owned PATCH failpoint matches live guard; identifiers redacted").toBe(true);
    const key = String(input.clientMutationId);
    if (!/^[a-f0-9-]{36}$/u.test(key)) throw new Error("Invalid owned mutation key.");
    const suffix = randomUUID().replaceAll("-", "");
    const functionName = `issue44_patch_fn_${suffix}`, triggerName = `issue44_patch_trigger_${suffix}`, sequenceName = `issue44_patch_marker_${suffix}`;
    const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const schema = quote(identity.schema), marker = `${schema}.${quote(sequenceName)}`;
    const expectedStatus = operation === "edit" ? source.action.status : operation === "start" ? "IN_PROGRESS" : operation === "complete" ? "COMPLETED" : "CANCELLED";
    let sequenceOwned = false, functionOwned = false, triggerOwned = false;
    const reached = async () => (await this.prisma.$queryRawUnsafe<Array<{ called: boolean }>>(`SELECT is_called AS called FROM ${marker}`))[0].called;
    try {
      await this.prisma.$executeRawUnsafe(`CREATE SEQUENCE ${marker}`); sequenceOwned = true;
      await this.prisma.$executeRawUnsafe(`CREATE FUNCTION ${schema}.${quote(functionName)}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW."actorId"=${actor.user.id} AND NEW."clientMutationId"='${key}'::uuid AND NEW."operation"='${operationNames[operation]}' THEN
            IF EXISTS (SELECT 1 FROM ${schema}."Action" a JOIN ${schema}."ActionHistory" h ON h."actionId"=a."id"
              JOIN ${schema}."Ticket" t ON t."id"=a."ticketId"
              WHERE a."id"=${source.action.id} AND a."ticketId"=${source.parent.id} AND NEW."actionId"=a."id" AND NEW."ticketId"=t."id"
                AND a."version"=${source.action.version + 1} AND a."status"='${expectedStatus}'
                AND a."updatedAt">'${source.action.updatedAt.toISOString()}'::timestamp AND t."updatedAt">'${source.parent.updatedAt.toISOString()}'::timestamp
                AND h."event"='${operationEvents[operation]}' AND h."actorId"=${actor.user.id} AND h."actionVersion"=a."version"
                AND h."before"->>'version'='${source.action.version}' AND h."after"->>'version'='${source.action.version + 1}')
            THEN PERFORM nextval('${marker.replaceAll("'", "''")}'::regclass); END IF;
            RAISE EXCEPTION 'Owned PATCH receipt insertion failure' USING ERRCODE='P0001';
          END IF;
          RETURN NEW;
        END; $$`); functionOwned = true;
      await this.prisma.$executeRawUnsafe(`CREATE TRIGGER ${quote(triggerName)} BEFORE INSERT ON ${schema}."MutationReceipt" FOR EACH ROW EXECUTE FUNCTION ${schema}.${quote(functionName)}()`); triggerOwned = true;
      // Each operation has its own version/status/event-aware marker, separate from API-04.
      // The nontransactional sequence is test infrastructure. No test transaction wraps HTTP.
      await work(reached);
    } finally {
      if (sequenceOwned) console.info(`PATCH ${operation} failpoint: updated Action/history/parent observed=${await reached()}.`);
      if (triggerOwned) await this.prisma.$executeRawUnsafe(`DROP TRIGGER ${quote(triggerName)} ON ${schema}."MutationReceipt"`);
      if (functionOwned) await this.prisma.$executeRawUnsafe(`DROP FUNCTION ${schema}.${quote(functionName)}()`);
      if (sequenceOwned) await this.prisma.$executeRawUnsafe(`DROP SEQUENCE ${marker}`);
      const [remaining] = await this.prisma.$queryRaw<Array<{ count: number }>>`SELECT
        ((SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=${identity.schema} AND c.relname=${sequenceName})
        +(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=${identity.schema} AND p.proname=${functionName})
        +(SELECT count(*) FROM pg_trigger WHERE tgname=${triggerName}))::int AS count`;
      expect(remaining.count, "Only owned PATCH injection resources are removed").toBe(0);
      console.info(`PATCH ${operation} injection cleanup: owned resources remaining=0.`);
    }
  }
}
