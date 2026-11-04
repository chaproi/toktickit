import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer, Agent, type Server } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Client } from "pg";
import { expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { APPROVED_ORIGIN, createAuthUser, loginRequest, cookieHeader, cookieValue } from "../lab-03/auth-test-helpers.js";
import { applyLab3Baseline, applyLaterMigrations, query, serverDirectory, verifiedTestTarget, withDisposableSchema } from "./migration-test-fixtures.js";
import { host, jsonHttp, object, plan, safePlan, Traffic, type Actor, type Command, type Phase } from "./performance-test-helpers.js";

// AC-40/T-47 only. Validation is explicitly separate from the specified workload.
// Default execution always performs all 5,000 warm-up + 500 measured requests.
const validationOnly = process.env.TOKTICKIT_T47_VALIDATE_ONLY === "1";
const environmentKeys = ["DATABASE_URL", "TEST_DATABASE_URL", "TOKTICKIT_DEVELOPMENT_DATABASE_URL", "NODE_ENV"];

function command(actor: Actor, step: number, cycle: number): Command {
  const write = `/api/tickets/${actor.writeTicketId}`;
  const read = `/api/tickets/${actor.readTicketId}`;
  const action = `${write}/actions/${actor.actionId ?? -1}`;
  if (actor.role === "REQUESTER") {
    switch (step) {
      case 0: case 5: return { operation: "requester.ticket.detail", method: "GET", path: read, template: "/api/tickets/:ticketId", expectedStatus: 200 };
      case 1: case 6: return { operation: "requester.dashboard", method: "GET", path: "/api/dashboard/requester", template: "/api/dashboard/requester", expectedStatus: 200 };
      case 2: return { operation: "requester.tickets.list", method: "GET", path: "/api/tickets?page=1&pageSize=25&sortBy=updatedAt&sortOrder=desc", template: "/api/tickets", expectedStatus: 200 };
      case 3: case 9: return { operation: "comments.list", method: "GET", path: `${write}/comments?page=1&pageSize=20`, template: "/api/tickets/:ticketId/comments", expectedStatus: 200 };
      case 4: return { operation: "ticket.actions.list", method: "GET", path: `${read}/actions?page=1&pageSize=20`, template: "/api/tickets/:ticketId/actions", expectedStatus: 200 };
      case 7: return { operation: "requester.tickets.filtered-list", method: "GET", path: "/api/tickets?currentStatus=OPEN&page=1&pageSize=25&sortBy=updatedAt&sortOrder=desc", template: "/api/tickets", expectedStatus: 200 };
      case 8: return { operation: "comments.create", method: "POST", path: `${write}/comments`, template: "/api/tickets/:ticketId/comments", expectedStatus: 201,
        body: { content: `Synthetic benchmark comment ${cycle}; literal <script>text</script>.` } };
    }
  } else {
    const tokens = () => ({ expectedVersion: actor.actionVersion, expectedTicketUpdatedAt: actor.ticketToken, clientMutationId: randomUUID() });
    switch (step) {
      case 0: return { operation: "staff.ticket.detail", method: "GET", path: `/api/staff/tickets/${actor.writeTicketId}`, template: "/api/staff/tickets/:ticketId", expectedStatus: 200 };
      case 1: return { operation: "staff.dashboard", method: "GET", path: "/api/dashboard/staff", template: "/api/dashboard/staff", expectedStatus: 200 };
      case 2: return { operation: "staff.tickets.list", method: "GET", path: "/api/staff/tickets?page=1&pageSize=25&sortBy=updatedAt&sortOrder=desc", template: "/api/staff/tickets", expectedStatus: 200 };
      case 3: return { operation: "staff.actions.list", method: "GET", path: "/api/staff/actions?assignee=me&actionStatusGroup=unfinished&page=1&pageSize=10", template: "/api/staff/actions", expectedStatus: 200 };
      case 4: return { operation: "action.create", method: "POST", path: `${write}/actions`, template: "/api/tickets/:ticketId/actions", expectedStatus: 201,
        body: { description: `Synthetic benchmark create ${cycle}; ${"literal diagnostic text ".repeat(12)}`,
          result: null, assigneeId: actor.id, followUpRequired: false, followUpNote: null, attachmentNotes: "Literal benchmark attachment reference; no upload.",
          expectedTicketUpdatedAt: actor.ticketToken, clientMutationId: randomUUID() } };
      case 5: return { operation: "action.detail", method: "GET", path: action, template: "/api/tickets/:ticketId/actions/:actionId", expectedStatus: 200 };
      case 6: return { operation: "action.edit", method: "PATCH", path: action, template: "/api/tickets/:ticketId/actions/:actionId", expectedStatus: 200,
        body: { ...tokens(), description: `Synthetic benchmark edited ${cycle}; ${"updated literal diagnostic text ".repeat(10)}` } };
      case 7: return { operation: "action.start", method: "PATCH", path: `${action}/status`, template: "/api/tickets/:ticketId/actions/:actionId/status", expectedStatus: 200,
        body: { ...tokens(), targetStatus: "IN_PROGRESS" } };
      case 8: return actor.ordinal % 2 === 0
        ? { operation: "action.complete", method: "PATCH", path: `${action}/status`, template: "/api/tickets/:ticketId/actions/:actionId/status", expectedStatus: 200,
          body: { ...tokens(), targetStatus: "COMPLETED", confirm: true, result: "Completed real benchmark diagnostic operation." } }
        : { operation: "action.cancel", method: "PATCH", path: `${action}/status`, template: "/api/tickets/:ticketId/actions/:actionId/status", expectedStatus: 200,
          body: { ...tokens(), targetStatus: "CANCELLED", confirm: true, reason: "Cancelled synthetic benchmark operation." } };
      case 9: return { operation: "action.history", method: "GET", path: `${action}/history?page=1&pageSize=20`, template: "/api/tickets/:ticketId/actions/:actionId/history", expectedStatus: 200 };
    }
  }
  throw new Error("Invalid benchmark schedule step.");
}

async function runActor(traffic: Traffic, actor: Actor, phase: Phase, count: number, cycleOffset: number) {
  for (let sequence = 0; sequence < count; sequence++) {
    const call = command(actor, sequence % 10, cycleOffset + Math.floor(sequence / 10));
    const { sample, body } = await traffic.send(phase, actor, sequence, call);
    if (sample.status !== call.expectedStatus || sample.transportError) continue;
    // Basic real-response readiness, not a substitute for the business suites.
    if (call.operation.endsWith("dashboard")) {
      if (!body.metrics || !body.lists || body.timezone !== "Asia/Bangkok") sample.semanticError = "dashboard-shape";
    } else if (["staff.ticket.detail", "requester.ticket.detail"].includes(call.operation)) {
      const expectedId = actor.role === "REQUESTER" ? actor.readTicketId : actor.writeTicketId;
      if (body.id !== expectedId || !Number.isFinite(Date.parse(body.updatedAt))) sample.semanticError = "ticket-shape";
      else if (actor.role !== "REQUESTER") actor.ticketToken = body.updatedAt;
    } else if (call.operation === "comments.create") {
      if (!Number.isSafeInteger(body.id) || body.ticketId !== actor.writeTicketId) sample.semanticError = "comment-shape";
    } else if (["action.create", "action.edit", "action.start", "action.complete", "action.cancel"].includes(call.operation)) {
      const row = object(body.action);
      const previous = Date.parse(actor.ticketToken);
      const expectedVersion = call.operation === "action.create" ? 1 : actor.actionVersion + 1;
      if (body.replayed === true || !Number.isSafeInteger(row.id) || row.ticketId !== actor.writeTicketId ||
          row.version !== expectedVersion || !Number.isFinite(Date.parse(body.ticketUpdatedAt)) ||
          Date.parse(body.ticketUpdatedAt) <= previous) sample.semanticError = "mutation-response-or-replay";
      // Only acknowledge actual server values. No fabricated time/version/key or retry.
      if (Number.isSafeInteger(row.id) && Number.isSafeInteger(row.version) && typeof body.ticketUpdatedAt === "string") {
        actor.actionId = row.id; actor.actionVersion = row.version; actor.lastActionStatus = row.status;
        actor.ticketToken = body.ticketUpdatedAt;
      }
    } else if (call.operation === "action.detail") {
      if (object(body.action).id !== actor.actionId || typeof body.ticketUpdatedAt !== "string") sample.semanticError = "action-shape";
    } else if (!Array.isArray(body.items) || !Number.isSafeInteger(object(body.pagination).totalItems)) {
      sample.semanticError = "list-shape";
    }
  }
}

async function seedBusinessRows(client: Client, actors: Actor[], categoryIds: number[], systemIds: number[]) {
  const requesterIds = actors.slice(0, 20).map(actor => actor.id);
  const workerIds = actors.slice(20).map(actor => actor.id);
  // Literal fixture distribution, using the actual committed constraints/indexes.
  await query(client, `INSERT INTO "Ticket" (id,"ticketNumber","clientSubmissionId","requesterId","ownerId","categoryId","relatedSystemId",
      summary,description,"requestedPriority","itPriority","currentStatus","ticketDate","createdAt","updatedAt")
    SELECT g,'P47-'||lpad(g::text,6,'0'),('47000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,
      ($1::int[])[((g-1)/8)%20+1],CASE WHEN g%4=0 THEN null ELSE ($2::int[])[((g-1)/8)%30+1] END,
      ($3::int[])[((g-1)/160)%4+1],($4::int[])[((g-1)/40)%4+1],
      'Synthetic indexed Ticket '||g,repeat('Representative literal diagnostic context. ',24),
      (ARRAY['LOW','MEDIUM','HIGH','URGENT'])[(g-1)%4+1]::"RequestedPriority",
      (ARRAY['URGENT','HIGH','MEDIUM','LOW'])[(g-1)%4+1]::"RequestedPriority",
      (ARRAY['NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','RESOLVED','CLOSED','REOPENED','CANCELLED'])[(g-1)%8+1]::"TicketStatus",
      timezone('UTC',CURRENT_TIMESTAMP)-interval '30 days',timezone('UTC',CURRENT_TIMESTAMP)-interval '30 days',
      timezone('UTC',CURRENT_TIMESTAMP)-((g-1)%14)*interval '1 day'-interval '1 hour'
    FROM generate_series(1,2000) g`, [requesterIds, workerIds, categoryIds, systemIds]);
  for (const actor of actors) {
    const id = 2001 + actor.ordinal;
    const row = await query<{ updatedAt: Date }>(client, `INSERT INTO "Ticket" (id,"ticketNumber","clientSubmissionId","requesterId","ownerId","categoryId","relatedSystemId",
        summary,description,"requestedPriority","itPriority","currentStatus","ticketDate","createdAt","updatedAt")
      VALUES ($1,$2,$3::uuid,$4,$5,$6,$7,'Independent benchmark mutation Ticket','Synthetic mutation context','HIGH','MEDIUM','OPEN',
        timezone('UTC',CURRENT_TIMESTAMP)-interval '20 days',timezone('UTC',CURRENT_TIMESTAMP)-interval '20 days',timezone('UTC',CURRENT_TIMESTAMP)-interval '2 hours') RETURNING "updatedAt"`,
      [id, `P47-W-${actor.ordinal}`, randomUUID(), actor.role === "REQUESTER" ? actor.id : requesterIds[actor.ordinal % 20],
        actor.role === "REQUESTER" ? workerIds[actor.ordinal % 30] : actor.id, categoryIds[actor.ordinal % 4], systemIds[actor.ordinal % 4]]);
    actor.writeTicketId = id; actor.ticketToken = row.rows[0]!.updatedAt.toISOString();
    const selected = await query<{ id: number }>(client, 'SELECT id FROM "Ticket" WHERE id<=2000 AND "requesterId"=$1 AND "currentStatus"=\'OPEN\' ORDER BY id LIMIT 1',
      [actor.role === "REQUESTER" ? actor.id : requesterIds[actor.ordinal % 20]]);
    actor.readTicketId = selected.rows[0]!.id;
  }
  await query(client, `INSERT INTO "TicketStatusHistory" ("ticketId","actorId","fromStatus","toStatus",reason,"createdAt")
    SELECT t.id,$1,e.f::"TicketStatus",e.t::"TicketStatus",'Synthetic historical transition',t."updatedAt"-(3-e.n)*interval '1 millisecond'
    FROM "Ticket" t CROSS JOIN LATERAL (
      SELECT 1 AS n,'NEW' AS f,'OPEN' AS t WHERE t."currentStatus"<>'NEW'
      UNION ALL SELECT 2,'OPEN',CASE WHEN t."currentStatus" IN ('CLOSED','REOPENED') THEN 'RESOLVED' ELSE t."currentStatus"::text END
        WHERE t."currentStatus" NOT IN ('NEW','OPEN')
      UNION ALL SELECT 3,'RESOLVED',t."currentStatus"::text WHERE t."currentStatus" IN ('CLOSED','REOPENED')
    ) e`, [workerIds[0]]);
  await query(client, `INSERT INTO "Action" (id,"ticketId","createdById","assigneeId","performedById",description,result,status,
      "followUpRequired","followUpNote","attachmentNotes","actionAt","createdAt","updatedAt","completedAt","cancelledAt","cancellationReason",version)
    SELECT g,t.id,($1::int[])[g%30+1],($1::int[])[(g-1)%30+1],CASE WHEN s.status='COMPLETED' THEN ($1::int[])[(g+1)%30+1] ELSE null END,
      btrim(repeat('Representative literal Action context. ',14)),CASE WHEN s.status='COMPLETED' THEN btrim(repeat('Verified result. ',16)) ELSE 'Retained draft result' END,s.status::"ActionStatus",
      g%3=0,CASE WHEN g%3=0 THEN 'Valid retained follow-up work note.' ELSE null END,'Literal attachment notes; no binary upload.',
      t."createdAt"+g*interval '1 millisecond',t."createdAt"+g*interval '1 millisecond',t."updatedAt"-interval '1 second'+(g%4)*interval '1 millisecond',
      CASE WHEN s.status='COMPLETED' THEN t."updatedAt"-interval '1 second'+(g%4)*interval '1 millisecond' ELSE null END,
      CASE WHEN s.status='CANCELLED' THEN t."updatedAt"-interval '1 second'+(g%4)*interval '1 millisecond' ELSE null END,
      CASE WHEN s.status='CANCELLED' THEN 'Synthetic historical cancellation.' ELSE null END,3
    FROM generate_series(1,8000) g JOIN "Ticket" t ON t.id=1+(g-1)/4 CROSS JOIN LATERAL (
      SELECT CASE WHEN t."currentStatus" IN ('RESOLVED','CLOSED','CANCELLED')
        THEN CASE WHEN g%2=0 THEN 'COMPLETED' ELSE 'CANCELLED' END
        ELSE (ARRAY['PLANNED','IN_PROGRESS','COMPLETED','CANCELLED'])[(g-1)%4+1] END AS status
    ) s`, [workerIds]);
  await query(client, `WITH snapshots AS (
    SELECT a.id,a."createdById",a.status,v,CASE WHEN v=1 THEN 'ACTION_CREATED'
      WHEN v=2 AND a.status IN ('COMPLETED','CANCELLED') THEN 'ACTION_STARTED'
      WHEN v=3 AND a.status='IN_PROGRESS' THEN 'ACTION_STARTED'
      WHEN v=3 AND a.status='COMPLETED' THEN 'ACTION_COMPLETED'
      WHEN v=3 AND a.status='CANCELLED' THEN 'ACTION_CANCELLED' ELSE 'ACTION_EDITED' END AS event,
      CASE WHEN v=3 THEN a."updatedAt" ELSE a."createdAt"+(v-1)*interval '1 millisecond' END AS time,
      to_jsonb(a)||jsonb_build_object('version',v,
        'status',CASE WHEN v=1 OR a.status='PLANNED' OR (v=2 AND a.status='IN_PROGRESS') THEN 'PLANNED' WHEN v=2 THEN 'IN_PROGRESS' ELSE a.status::text END,
        'description',CASE WHEN v=1 THEN 'Initial representative Action description' WHEN v=2 THEN 'Intermediate representative Action description' ELSE a.description END,
        'actionAt',to_char(a."actionAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'createdAt',to_char(a."createdAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'updatedAt',to_char(CASE WHEN v=3 THEN a."updatedAt" ELSE a."createdAt"+(v-1)*interval '1 millisecond' END,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'performedById',CASE WHEN v=3 THEN a."performedById" ELSE null END,
        'completedAt',CASE WHEN v=3 AND a."completedAt" IS NOT NULL THEN to_char(a."completedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') ELSE null END,
        'cancelledAt',CASE WHEN v=3 AND a."cancelledAt" IS NOT NULL THEN to_char(a."cancelledAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') ELSE null END,
        'cancellationReason',CASE WHEN v=3 THEN a."cancellationReason" ELSE null END) AS value FROM "Action" a CROSS JOIN generate_series(1,3) v
    ), events AS (SELECT *,lag(value) OVER (PARTITION BY id ORDER BY v) AS previous FROM snapshots)
    INSERT INTO "ActionHistory" ("actionId","actorId",event,"actionVersion","before","after","createdAt")
      SELECT id,"createdById",event::"ActionHistoryEvent",v,previous,value,time FROM events`);
  for (const table of ["Ticket", "Action"]) await query(client, `SELECT setval(pg_get_serial_sequence($1,'id'),(SELECT max(id) FROM "${table}"))`, [`"${table}"`]);
  for (const table of ["User", "AuthSession", "Ticket", "Action", "ActionHistory", "TicketStatusHistory", "MutationReceipt"]) await query(client, `ANALYZE "${table}"`);
}

async function counts(client: Client) {
  return (await query<{ tickets: number; actions: number; actionHistory: number; ticketHistory: number; receipts: number; comments: number; users: number; sessions: number }>(client,
    `SELECT (SELECT count(*)::int FROM "Ticket") AS tickets,(SELECT count(*)::int FROM "Action") AS actions,
      (SELECT count(*)::int FROM "ActionHistory") AS "actionHistory",(SELECT count(*)::int FROM "TicketStatusHistory") AS "ticketHistory",
      (SELECT count(*)::int FROM "MutationReceipt") AS receipts,(SELECT count(*)::int FROM "PublicComment") AS comments,
      (SELECT count(*)::int FROM "User") AS users,(SELECT count(*)::int FROM "AuthSession") AS sessions`)).rows[0]!;
}

async function queryPlans(client: Client, actor: Actor, workerId: number) {
  const plans: unknown[] = [];
  for (const [label, sql, parameters] of [
    ["requester-list", 'SELECT id FROM "Ticket" WHERE "requesterId"=$1 ORDER BY "updatedAt" DESC,id DESC LIMIT 25', [actor.id]],
    ["ticket-actions", 'SELECT id FROM "Action" WHERE "ticketId"=$1 ORDER BY "createdAt",id LIMIT 20', [actor.readTicketId]],
    ["action-history", 'SELECT id FROM "ActionHistory" WHERE "actionId"=$1 ORDER BY "createdAt",id LIMIT 20', [1]],
    ["assignee-unfinished", 'SELECT id FROM "Action" WHERE "assigneeId"=$1 AND status IN (\'PLANNED\',\'IN_PROGRESS\') ORDER BY "createdAt",id LIMIT 5', [workerId]],
    ["dashboard-resolutions", `SELECT t.id,max(h."createdAt") FROM "Ticket" t JOIN "TicketStatusHistory" h ON h."ticketId"=t.id
      WHERE t."currentStatus" IN ('RESOLVED','CLOSED') AND h."toStatus"='RESOLVED'
        AND h."createdAt">=timezone('UTC',CURRENT_TIMESTAMP)-interval '7 days' AND h."createdAt"<=timezone('UTC',CURRENT_TIMESTAMP)
      GROUP BY t.id ORDER BY max(h."createdAt") DESC,t.id DESC LIMIT 5`, []],
  ] as const) {
    const result = await query<any>(client, `EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${sql}`, [...parameters]);
    const value = result.rows[0]["QUERY PLAN"][0];
    plans.push({ label, planningMs: value["Planning Time"], executionMs: value["Execution Time"], tree: safePlan(value.Plan) });
  }
  return plans;
}

it(validationOnly ? "validates the T-47 owned fixtures and real HTTP operation schedule (not a performance result)"
  : "executes T-47: 50 authenticated concurrent users, 5000 warm-up then 500 measured real HTTP requests", async () => {
  const started = new Date();
  const monotonicStart = performance.now();
  const token = randomUUID();
  const mode = validationOnly ? "validation" : "measurement";
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(started);
  const artifact = resolve(serverDirectory, "../artifacts/lab-04/hardening", `t47-performance-${date}-${mode}-${token.slice(0, 8)}.json`);
  const previous = Object.fromEntries(environmentKeys.map(key => [key, process.env[key]]));
  const report: Record<string, any> = { format: 1, mode, startedAt: started.toISOString(), timezone: "Asia/Bangkok", plan,
    executionHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim(),
    trackedWorkingTreeCleanAtStart: execFileSync("git", ["diff", "HEAD", "--name-only"], { encoding: "utf8", windowsHide: true }).trim() === "",
    hostBefore: host(), prismaVersion: Prisma.prismaVersion.client,
    primaryFailure: null, cleanupFailure: null, transactionFailures: [],
    cleanup: { listenerClosed: false, prismaDisconnected: false, ownedSchemaRemoved: false, environmentRestored: false }, samples: [] };
  const actors: Actor[] = [];
  const control = new Agent({ keepAlive: true, maxSockets: 1, maxFreeSockets: 1 });
  let listener: Server | undefined, traffic: Traffic | undefined;
  let restoreTransactionObserver: (() => void) | undefined;
  let primaryError: unknown;
  let phase = "isolation";
  const safeFailure = (error: unknown) => {
    const code = object(error).code;
    return { phase, name: error instanceof Error && /^[A-Za-z]{1,64}$/.test(error.name) ? error.name : "Error",
      code: typeof code === "string" && /^(P\d{4}|[A-Z0-9]{5})$/.test(code) ? code : null };
  };
  try {
    const target = verifiedTestTarget();
    const url = new URL(target.databaseUrl);
    report.pool = Object.fromEntries(["connection_limit", "pool_timeout", "connect_timeout"].map(key => {
      const value = url.searchParams.get(key); return [key, value !== null && /^\d+$/.test(value) ? Number(value) : "unset; inherited engine default"];
    }));
    await withDisposableSchema("indexes", async (client, schema) => {
      try {
        phase = "committed-migrations";
        await applyLab3Baseline(client); await applyLaterMigrations(client);
        url.searchParams.set("schema", schema);
        process.env.DATABASE_URL = url.toString(); process.env.TEST_DATABASE_URL = url.toString(); process.env.NODE_ENV = "test";
        const prisma = getPrisma();
        const [live] = await prisma.$queryRaw<Array<{ db: string; schema: string }>>`SELECT current_database() AS db,current_schema() AS schema`;
        expect(live.db === target.identity.databaseName && live.schema === schema, "Live app matches exact dedicated owned schema; values withheld").toBe(true);
        report.isolationVerified = true;
        report.postgresVersion = (await query(client, "SHOW server_version")).rows[0].server_version;
        report.postgresSettings = {};
        for (const setting of ["max_connections", "shared_buffers", "work_mem", "effective_cache_size", "jit", "track_io_timing"]) {
          report.postgresSettings[setting] = (await query(client, `SHOW ${setting}`)).rows[0][setting];
        }
        listener = createServer(app);
        await new Promise<void>((resolve, reject) => { listener!.once("error", reject); listener!.listen(0, "127.0.0.1", resolve); });
        const address = listener.address();
        if (!address || typeof address === "string") throw new Error("Owned loopback listener unavailable.");
        traffic = new Traffic(address.port, APPROVED_ORIGIN);
        phase = "users-and-real-login-provisioning";
        for (let ordinal = 0; ordinal < 50; ordinal++) {
          const role = ordinal < 20 ? "REQUESTER" : ordinal < 40 ? "IT_STAFF" : "ADMINISTRATOR";
          const created = await createAuthUser({ email: `issue49-t47-${token}-${ordinal}@example.test`, role });
          await prisma.user.update({ where: { id: created.user.id }, data: { name: `Synthetic benchmark ${role} ${ordinal}` } });
          const login = await loginRequest(created.user.email, created.password);
          expect(login.status, "Unmeasured real login; body/credentials withheld").toBe(200);
          const actor: Actor = { ordinal, id: created.user.id, role, cookie: cookieHeader(login.headers["set-cookie"]),
            csrf: cookieValue(login.headers["set-cookie"], "toktickit_csrf"), agent: new Agent({ keepAlive: true, maxSockets: 1, maxFreeSockets: 1 }),
            readTicketId: 0, writeTicketId: 0, ticketToken: "", actionId: null, actionVersion: 0, lastActionStatus: null };
          actors.push(actor);
          const me = await jsonHttp(address.port, control, "GET", "/api/auth/me", { Cookie: actor.cookie });
          expect(me.status).toBe(200); expect(object(object(me.body).user).id === actor.id, "Each real live session matches its distinct actor").toBe(true);
        }
        expect(new Set(actors.map(actor => actor.id)).size).toBe(50);
        phase = "business-fixtures";
        const categories: number[] = [], systems: number[] = [];
        for (let index = 0; index < 4; index++) {
          categories.push((await prisma.category.create({ data: { name: `T47 ${token} category ${index}` } })).id);
          systems.push((await prisma.relatedSystem.create({ data: { name: `T47 ${token} system ${index}` } })).id);
        }
        await seedBusinessRows(client, actors, categories, systems);
        report.fixtureBefore = await counts(client);
        expect(report.fixtureBefore).toEqual({ ...plan.fixture, receipts: 0, comments: 0, users: 50, sessions: 50 });
        report.distributions = {
          tickets: (await query(client, 'SELECT "currentStatus" AS status,count(*)::int AS count FROM "Ticket" GROUP BY "currentStatus" ORDER BY "currentStatus"')).rows,
          actions: (await query(client, 'SELECT status,count(*)::int AS count FROM "Action" GROUP BY status ORDER BY status')).rows,
          priorities: (await query(client, 'SELECT "itPriority" AS priority,count(*)::int AS count FROM "Ticket" GROUP BY "itPriority" ORDER BY "itPriority"')).rows,
        };
        expect(report.distributions.actions.map((row: any) => row.count)).toEqual([1250, 1250, 2750, 2750]);
        const frozen = await query<{ count: number }>(client, 'SELECT count(*)::int AS count FROM "Action" a JOIN "Ticket" t ON t.id=a."ticketId" WHERE t."currentStatus" IN (\'RESOLVED\',\'CLOSED\',\'CANCELLED\') AND a.status IN (\'PLANNED\',\'IN_PROGRESS\')');
        expect(frozen.rows[0]!.count).toBe(0);
        phase = "query-plans-outside-latency-measurement";
        report.queryPlans = await queryPlans(client, actors[0]!, actors[20]!.id);
        // Pass through unchanged callbacks/options; observe real rejections only.
        // No fault injection, callback replacement, transaction retry or result mock.
        const realTransaction = prisma.$transaction.bind(prisma);
        const observer = vi.spyOn(prisma, "$transaction").mockImplementation((...args: unknown[]) => {
          const begin = performance.now();
          return Reflect.apply(realTransaction, prisma, args).catch((error: unknown) => {
            const states = new Set<string>();
            const visited = new Set<object>();
            const visit = (value: unknown) => {
              if (value === null || typeof value !== "object" || visited.has(value)) return;
              visited.add(value);
              const row = object(value);
              if (typeof row.code === "string" && /^(40001|40P01|23505|23514)$/.test(row.code)) states.add(row.code);
              visit(row.meta); visit(row.cause);
            };
            visit(error);
            const meta = object(object(error).meta), code = object(error).code;
            const isolation = object(args[1]).isolationLevel;
            report.transactionFailures.push({ phase, atCaseMs: performance.now() - monotonicStart,
              elapsedMs: performance.now() - begin,
              code: typeof code === "string" && /^P\d{4}$/.test(code) ? code : "unclassified",
              confirmedSqlStates: [...states],
              model: ["Action", "ActionHistory", "MutationReceipt", "PublicComment", "Ticket"].includes(meta.modelName) ? meta.modelName : null,
              isolation: ["Serializable", "RepeatableRead"].includes(isolation) ? isolation : "batch-or-default" });
            throw error;
          });
        });
        restoreTransactionObserver = () => observer.mockRestore();
        const perform = async (phaseName: Phase, selected: Actor[], count: number, cycleOffset: number) => {
          phase = phaseName; traffic!.begin(phaseName);
          // allSettled drains every VU before inspection/cleanup, even if a harness task rejects.
          const outcomes = await Promise.allSettled(selected.map(actor => runActor(traffic!, actor, phaseName, count, cycleOffset)));
          if (outcomes.some(value => value.status === "rejected")) throw new Error("A virtual user task failed; request samples retained.");
          report[phaseName] = traffic!.summary(phaseName);
          console.info("T47 phase complete", { phase: phaseName, count: report[phaseName].count, errors: report[phaseName].errors,
            p50Ms: report[phaseName].p50Ms, p95Ms: report[phaseName].p95Ms, elapsedMs: report[phaseName].elapsedMs, peakHttpInFlight: report[phaseName].peakHttpInFlight });
        };
        if (validationOnly) {
          // One Requester, one even Staff completion, one odd Admin cancellation.
          await perform("validation", [actors[0]!, actors[20]!, actors[41]!], 10, 0);
        } else {
          await perform("warmup", actors, 100, 0);
          report.connectionsAfterWarmup = (await query(client, "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database()" )).rows[0].count;
          // Explicit barrier: no measured request starts until all 5,000 warm-ups finish.
          await perform("measured", actors, 10, 10);
        }
        phase = "post-workload-state";
        report.fixtureAfter = await counts(client);
        const cycles = validationOnly ? 1 : 11;
        const workerUsers = validationOnly ? 2 : 30, requesterUsers = validationOnly ? 1 : 20;
        report.expectedFixtureAfter = { ...report.fixtureBefore, actions: 8000 + workerUsers * cycles,
          actionHistory: 24000 + workerUsers * cycles * 4, receipts: workerUsers * cycles * 4, comments: requesterUsers * cycles };
        report.persistedCountsMatchExpected = JSON.stringify(report.fixtureAfter) === JSON.stringify(report.expectedFixtureAfter);
        report.receiptReplays = traffic!.samples.filter(sample => sample.replayed).length;
      } catch (error) {
        primaryError = error;
        report.primaryFailure = safeFailure(error);
        throw error;
      } finally {
        // Traffic tasks are awaited before entering here; no cleanup races with owned requests.
        restoreTransactionObserver?.(); report.cleanup.transactionObserverRestored = true;
        try {
          for (const actor of actors) actor.agent.destroy(); control.destroy();
          if (listener) await new Promise<void>((resolve, reject) => listener!.close(error => error ? reject(error) : resolve()));
          report.cleanup.listenerClosed = !listener?.listening;
        } catch (error) { report.cleanupFailure = safeFailure(error); }
        try { await getPrisma().$disconnect(); report.cleanup.prismaDisconnected = true; }
        catch (error) { report.cleanupFailure ??= safeFailure(error); }
      }
    });
    report.cleanup.ownedSchemaRemoved = true;
  } catch (error) {
    if (report.primaryFailure && error !== primaryError) report.cleanupFailure ??= safeFailure(error);
    else if (!report.primaryFailure) report.primaryFailure = safeFailure(error);
  }
  finally {
    for (const key of environmentKeys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
    report.cleanup.environmentRestored = environmentKeys.every(key => process.env[key] === previous[key]);
    report.samples = traffic?.samples ?? [];
    report.hostAfter = host(); report.totalCaseElapsedMs = performance.now() - monotonicStart;
    if (!validationOnly && report.measured) {
      report.target = { overallP95Below500: report.measured.p95Below500,
        allOperationsP95Below500: Object.values(report.measured.operations).every((value: any) => value.p95Below500),
        zeroMeasuredErrors: report.measured.errors === 0, zeroWarmupErrors: report.warmup?.errors === 0 };
    }
    mkdirSync(resolve(artifact, ".."), { recursive: true });
    writeFileSync(artifact, JSON.stringify(report) + "\n", { flag: "wx" });
    console.info("T47 redacted artifact written", { file: artifact.split(/[\\/]/).at(-1), mode,
      primaryFailure: report.primaryFailure, cleanup: report.cleanup });
  }
  expect(report.primaryFailure, "Safe harness/fixture classification; see redacted artifact").toBeNull();
  expect(report.cleanupFailure, "Cleanup failure is retained separately from the primary failure").toBeNull();
  expect(Object.values(report.cleanup).every(Boolean)).toBe(true);
  expect(report.persistedCountsMatchExpected, "Independent expected real write/history/receipt/comment totals").toBe(true);
  expect(report.receiptReplays).toBe(0);
  if (validationOnly) {
    expect(report.validation.count).toBe(30); expect(report.validation.errors).toBe(0);
  } else {
    expect(report.warmup.count).toBe(5000); expect(report.measured.count).toBe(500);
    for (const actor of actors) {
      expect(report.samples.filter((sample: any) => sample.phase === "warmup" && sample.user === actor.ordinal).length).toBe(100);
      expect(report.samples.filter((sample: any) => sample.phase === "measured" && sample.user === actor.ordinal).length).toBe(10);
    }
    expect(report.measured.peakHttpInFlight).toBe(50);
    expect(Object.fromEntries(Object.entries(report.measured.operations).map(([name, value]: [string, any]) => [name, value.count])))
      .toEqual(plan.expectedMeasuredMix);
    expect(report.warmup.errors, "All warm-up failures are retained, not retried/removed").toBe(0);
    expect(report.measured.errors, "All measured failures are retained, not retried/removed").toBe(0);
    expect(report.measured.p95Ms, "Reviewed T-47 aggregate p95 <500ms target").toBeLessThan(500);
    expect(report.target.allOperationsP95Below500, "Per-operation p95 target evaluated separately; no slow endpoint excluded").toBe(true);
  }
}, plan.caseBudgetMs); // Initial finite budget: 110 sequential waves/VU at inherited 5s transactions (~550s), plus fixture/plans/cleanup and bounded margin; no existing budget changes.
