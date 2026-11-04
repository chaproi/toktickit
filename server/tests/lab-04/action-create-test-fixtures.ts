import { randomUUID } from "node:crypto";
import type { Ticket, TicketStatus } from "@prisma/client";
import request from "supertest";
import { expect } from "vitest";
import { app } from "../../src/app.js";
import { configureTestDatabaseEnvironment } from "../../src/testing/test-database.js";
import { APPROVED_ORIGIN, cookieValue } from "../lab-03/auth-test-helpers.js";
import { ActionReadFixtures, LITERAL, actionSnapshot, assertSafeEqual } from "./action-read-test-fixtures.js";

export type CreateActor = ReturnType<ActionReadFixtures["who"]>;
type RequestOptions = { origin?: string; csrf?: string; omitCsrfCookie?: boolean };
export type ExpectedContent = {
  description: string; result: string | null; followUpRequired: boolean;
  followUpNote: string | null; attachmentNotes: string | null;
};
export const MINIMUM_CONTENT: ExpectedContent = {
  description: LITERAL, result: null, followUpRequired: false, followUpNote: null, attachmentNotes: null,
};
export const FULL_CONTENT: ExpectedContent = {
  description: LITERAL, result: `${LITERAL} draft`, followUpRequired: true,
  followUpNote: `${LITERAL} follow-up`, attachmentNotes: `${LITERAL} attachment text`,
};

export class ActionCreateFixtures {
  readonly read = new ActionReadFixtures();
  readonly prisma = this.read.prisma;
  staff!: CreateActor;
  administrator!: CreateActor;

  async initialize() {
    await this.read.initialize();
    // The read fixture's creator is deliberately demoted. It is never a writer here.
    this.staff = await this.read.actor("create-staff", "IT_STAFF");
    this.administrator = await this.read.actor("create-admin", "ADMINISTRATOR");
  }

  cleanup() { return this.read.cleanup(); }

  async parent(status: TicketStatus = "OPEN", unassigned = false) {
    const ticket = await this.read.ticket(this.read.who("requester").user.id, status);
    return unassigned ? this.prisma.ticket.update({ where: { id: ticket.id }, data: { ownerId: null, updatedAt: ticket.updatedAt } }) : ticket;
  }

  input(ticket: Ticket, assigneeId = this.read.who("assignee").user.id): Record<string, unknown> {
    return {
      description: `  ${LITERAL}  `, assigneeId, followUpRequired: false,
      expectedTicketUpdatedAt: ticket.updatedAt.toISOString(), clientMutationId: randomUUID(),
    };
  }

  fullInput(ticket: Ticket, assigneeId: number): Record<string, unknown> {
    return { ...this.input(ticket, assigneeId), result: `  ${FULL_CONTENT.result}  `,
      followUpRequired: true, followUpNote: `  ${FULL_CONTENT.followUpNote}  `,
      attachmentNotes: `  ${FULL_CONTENT.attachmentNotes}  ` };
  }

  post(path: string, body: unknown, actor: CreateActor | null = this.staff, options: RequestOptions = {}) {
    const call = request(app).post(path).set("Content-Type", "application/json");
    const origin = Object.hasOwn(options, "origin") ? options.origin : APPROVED_ORIGIN;
    if (origin !== undefined) call.set("Origin", origin);
    if (actor) {
      const cookies = actor.cookie.split("; ");
      call.set("Cookie", options.omitCsrfCookie ? cookies.filter((cookie) => !cookie.startsWith("toktickit_csrf=")).join("; ") : actor.cookie);
      const csrf = Object.hasOwn(options, "csrf") ? options.csrf : cookieValue(cookies, "toktickit_csrf");
      if (csrf !== undefined) call.set("X-CSRF-Token", csrf);
    }
    return call.send(typeof body === "string" || (typeof body === "object" && body !== null) ? body : JSON.stringify(body));
  }

  path(ticketId: number | string) { return `/api/tickets/${ticketId}/actions`; }

  async rejected(path: string, body: unknown, actor: CreateActor | null = this.staff, options: RequestOptions = {}) {
    const before = await this.read.domainDigest();
    try { return await this.post(path, body, actor, options); }
    finally {
      expect(await this.read.domainDigest() === before,
        "Rejected create/replay preserves domain rows, versions, times, history and receipts; values redacted; sessions excluded").toBe(true);
    }
  }

  async create(ticket: Ticket, input: Record<string, unknown>, actor: CreateActor, content = MINIMUM_CONTENT) {
    const oldActions = await this.prisma.action.findMany({ where: { ticketId: { in: this.read.ticketIds } }, orderBy: { id: "asc" } });
    const oldHistory = await this.prisma.actionHistory.findMany({ where: { action: { ticketId: { in: this.read.ticketIds } } }, orderBy: { id: "asc" } });
    const oldReceipts = await this.prisma.mutationReceipt.findMany({ where: { ticketId: { in: this.read.ticketIds } }, orderBy: { id: "asc" } });
    const startedAt = Date.now();
    const response = await this.post(this.path(ticket.id), input, actor);
    const finishedAt = Date.now();
    expect(response.status).toBe(201); // RED must fail here, rather than querying an absent new row.
    expect(Object.keys(response.body).sort()).toEqual(["action", "ticketUpdatedAt"]);
    const actions = await this.prisma.action.findMany({ where: { ticketId: ticket.id } });
    expect(actions).toHaveLength(1);
    const action = actions[0];
    expect({ ticketId: action.ticketId, createdById: action.createdById, assigneeId: action.assigneeId,
      performedById: action.performedById, status: action.status, version: action.version,
      completedAt: action.completedAt, cancelledAt: action.cancelledAt, cancellationReason: action.cancellationReason,
      description: action.description, result: action.result, followUpRequired: action.followUpRequired,
      followUpNote: action.followUpNote, attachmentNotes: action.attachmentNotes }).toEqual({
      ticketId: ticket.id, createdById: actor.user.id, assigneeId: input.assigneeId,
      performedById: null, status: "PLANNED", version: 1, completedAt: null, cancelledAt: null,
      cancellationReason: null, ...content,
    });
    expect(action.actionAt.getTime()).toBe(action.createdAt.getTime());
    expect(action.updatedAt.getTime()).toBe(action.createdAt.getTime());
    expect(action.createdAt.getTime()).toBeGreaterThanOrEqual(startedAt);
    expect(action.createdAt.getTime()).toBeLessThanOrEqual(finishedAt);
    this.read.assertDTO(response.body.action, action); // Independent explicit test projection, not production code.
    const afterParent = await this.prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(afterParent.updatedAt.getTime()).toBeGreaterThan(ticket.updatedAt.getTime());
    expect(response.body.ticketUpdatedAt).toBe(afterParent.updatedAt.toISOString());
    assertSafeEqual({ ...afterParent, updatedAt: ticket.updatedAt }, ticket, "Only parent updatedAt advances; ownership/content retained");
    const history = await this.prisma.actionHistory.findMany({ where: { actionId: action.id } });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ actionId: action.id, actorId: actor.user.id, event: "ACTION_CREATED",
      actionVersion: 1, before: null, sourceTicketStatusHistoryId: null });
    const [storedNull] = await this.prisma.$queryRaw<Array<{ isDatabaseNull: boolean }>>`
      SELECT "before" IS NULL AS "isDatabaseNull" FROM "ActionHistory" WHERE "id"=${history[0].id}`;
    expect(storedNull.isDatabaseNull, "Creation before is SQL NULL, not JSON null").toBe(true);
    assertSafeEqual(history[0].after, actionSnapshot(action), "Complete approved creation snapshot");
    expect(history[0].createdAt.toISOString()).toBe(action.createdAt.toISOString());
    const receipts = await this.prisma.mutationReceipt.findMany({ where: { actorId: actor.user.id, clientMutationId: String(input.clientMutationId) } });
    expect(receipts).toHaveLength(1);
    const receipt = receipts[0];
    expect({ actorId: receipt.actorId, operation: receipt.operation, ticketId: receipt.ticketId, actionId: receipt.actionId })
      .toEqual({ actorId: actor.user.id, operation: "CREATE_ACTION", ticketId: ticket.id, actionId: action.id });
    expect(/^[a-f0-9]{64}$/u.test(receipt.inputFingerprint), "Fingerprint has approved representation; value redacted").toBe(true);
    assertSafeEqual(receipt.safeResponse, response.body, "Receipt retains exact original safe response, without credentials/fingerprint fields");
    expect(receipt.createdAt.getTime()).toBeGreaterThanOrEqual(startedAt);
    expect(receipt.createdAt.getTime()).toBeLessThanOrEqual(finishedAt);
    const scope = { ticketId: { in: this.read.ticketIds } };
    expect(await this.prisma.action.count({ where: scope })).toBe(oldActions.length + 1);
    expect(await this.prisma.actionHistory.count({ where: { action: scope } })).toBe(oldHistory.length + 1);
    expect(await this.prisma.mutationReceipt.count({ where: scope })).toBe(oldReceipts.length + 1);
    for (const [before, after, label] of [
      [oldActions, await this.prisma.action.findMany({ where: { id: { in: oldActions.map((row) => row.id) } }, orderBy: { id: "asc" } }), "Actions"],
      [oldHistory, await this.prisma.actionHistory.findMany({ where: { id: { in: oldHistory.map((row) => row.id) } }, orderBy: { id: "asc" } }), "history"],
      [oldReceipts, await this.prisma.mutationReceipt.findMany({ where: { id: { in: oldReceipts.map((row) => row.id) } }, orderBy: { id: "asc" } }), "receipts"],
    ]) assertSafeEqual(after, before, `Existing ${label} retained`);
    return { response, action, parent: afterParent, receipt };
  }

  async constructLaterFrozenState(created: Awaited<ReturnType<ActionCreateFixtures["create"]>>) {
    const at = new Date(Math.max(Date.now(), created.parent.updatedAt.getTime() + 1));
    const action = await this.prisma.action.update({ where: { id: created.action.id }, data: {
      status: "CANCELLED", version: 2, cancelledAt: at, updatedAt: at, cancellationReason: "Constructed later cancellation",
    } });
    await this.prisma.actionHistory.create({ data: { actionId: action.id, actorId: this.staff.user.id,
      event: "ACTION_CANCELLED", actionVersion: 2, before: actionSnapshot(created.action), after: actionSnapshot(action), createdAt: at } });
    await this.prisma.ticket.update({ where: { id: action.ticketId }, data: { currentStatus: "CLOSED", updatedAt: at } });
    // Direct later fixture state only: no claim of Action/Ticket workflow implementation.
  }

  async withReceiptFailure(actor: CreateActor, input: Record<string, unknown>, ticket: Ticket, work: (reached: () => Promise<boolean>) => Promise<void>) {
    const identity = configureTestDatabaseEnvironment();
    const [live] = await this.prisma.$queryRaw<Array<{ database: string; schema: string }>>`SELECT current_database() AS database, current_schema() AS schema`;
    expect(live.database === identity.databaseName && live.schema === identity.schema, "Failpoint target agrees with guard; identifiers redacted").toBe(true);
    const key = String(input.clientMutationId);
    if (!/^[a-f0-9-]{36}$/u.test(key) || !Number.isSafeInteger(actor.user.id) || actor.user.id <= 0) throw new Error("Invalid owned failpoint identity.");
    const suffix = randomUUID().replaceAll("-", "");
    const functionName = `issue44_receipt_fn_${suffix}`;
    const triggerName = `issue44_receipt_trigger_${suffix}`;
    const sequenceName = `issue44_receipt_marker_${suffix}`;
    const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const schema = quote(identity.schema);
    const marker = `${schema}.${quote(sequenceName)}`;
    let sequenceOwned = false;
    let functionOwned = false;
    let triggerOwned = false;
    const reached = async () => (await this.prisma.$queryRawUnsafe<Array<{ called: boolean }>>(`SELECT is_called AS called FROM ${marker}`))[0].called;
    try {
      await this.prisma.$executeRawUnsafe(`CREATE SEQUENCE ${marker}`);
      sequenceOwned = true;
      await this.prisma.$executeRawUnsafe(`CREATE FUNCTION ${schema}.${quote(functionName)}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW."actorId"=${actor.user.id} AND NEW."clientMutationId"='${key}'::uuid THEN
            IF EXISTS (SELECT 1 FROM ${schema}."Action" WHERE "id"=NEW."actionId" AND "ticketId"=${ticket.id} AND "createdById"=${actor.user.id} AND "status"='PLANNED')
              AND EXISTS (SELECT 1 FROM ${schema}."ActionHistory" WHERE "actionId"=NEW."actionId" AND "actorId"=${actor.user.id} AND "event"='ACTION_CREATED' AND "actionVersion"=1)
              AND EXISTS (SELECT 1 FROM ${schema}."Ticket" WHERE "id"=${ticket.id} AND "updatedAt">'${ticket.updatedAt.toISOString()}'::timestamp)
            THEN PERFORM nextval('${marker.replaceAll("'", "''")}'::regclass); END IF;
            RAISE EXCEPTION 'Owned receipt insertion failure' USING ERRCODE='P0001';
          END IF;
          RETURN NEW;
        END; $$`);
      functionOwned = true;
      await this.prisma.$executeRawUnsafe(`CREATE TRIGGER ${quote(triggerName)} BEFORE INSERT ON ${schema}."MutationReceipt" FOR EACH ROW EXECUTE FUNCTION ${schema}.${quote(functionName)}()`);
      triggerOwned = true;
      // The owned nontransactional marker proves prior writes were visible inside the failed transaction.
      // It is test infrastructure, not a domain sequence; no test-only transaction wraps the request.
      await work(reached);
    } finally {
      if (sequenceOwned) console.info(`API-04 owned receipt failpoint: earlier writes observed=${await reached()}.`);
      if (triggerOwned) await this.prisma.$executeRawUnsafe(`DROP TRIGGER ${quote(triggerName)} ON ${schema}."MutationReceipt"`);
      if (functionOwned) await this.prisma.$executeRawUnsafe(`DROP FUNCTION ${schema}.${quote(functionName)}()`);
      if (sequenceOwned) await this.prisma.$executeRawUnsafe(`DROP SEQUENCE ${marker}`);
      const [remaining] = await this.prisma.$queryRaw<Array<{ count: number }>>`
        SELECT ((SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=${identity.schema} AND c.relname=${sequenceName})
          + (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=${identity.schema} AND p.proname=${functionName})
          + (SELECT count(*) FROM pg_trigger WHERE tgname=${triggerName}))::int AS count`;
      expect(remaining.count, "Owned trigger/function/sequence removed").toBe(0);
      console.info("API-04 receipt injection cleanup: owned resources remaining=0.");
    }
  }
}
