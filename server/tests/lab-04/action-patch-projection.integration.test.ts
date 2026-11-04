import { monitorEventLoopDelay, performance as perf } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer, Agent, type Server } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it, vi } from "vitest";
import { app } from "../../src/app.js";
import * as prismaModule from "../../src/prisma.js";
import { createPrismaClient } from "../../src/prisma-client.js";
import { APPROVED_ORIGIN, createAuthUser, loginRequest, cookieHeader, cookieValue } from "../lab-03/auth-test-helpers.js";
import { applyLab3Baseline, applyLaterMigrations, serverDirectory, verifiedTestTarget, withDisposableSchema } from "./migration-test-fixtures.js";
import { jsonHttp, object, type Actor } from "./performance-test-helpers.js";
import { counts, seedBusinessRows } from "./t47-diagnostic-fixtures.js";
import { CreatePhaseObserver, safeCreateError } from "./create-phase-observer.js";

// Bounded diagnostic and shared projection regression, not a replacement T-47.
// The original indexed 2,050/8,000/24,000 fixture is reused unchanged.
it("preserves PATCH identities and bounds projection reads during one EDIT-START-terminal cohort", async () => {
  const keys = ["DATABASE_URL", "TEST_DATABASE_URL", "NODE_ENV"], saved = keys.map(key => process.env[key]);
  const target = verifiedTestTarget(), observer = new CreatePhaseObserver(), actors: Actor[] = [];
  const report: Record<string, any> = { startedAt: new Date().toISOString(),
    executionHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim(),
    mode: "bounded-PATCH-chain-with-Requester-reads-not-T47", phase: "guard", preparationResponses: [], responses: [], cleanup: {} };
  let db: ReturnType<typeof createPrismaClient> | undefined, listener: Server | undefined;
  const reads: Agent[] = [], inFlight: Promise<unknown>[] = [];
  const loop = monitorEventLoopDelay({ resolution: 5 });
  observer.install();
  try {
    await withDisposableSchema("indexes", async (native, schema) => {
      try {
        report.phase = "migrations"; await applyLab3Baseline(native); await applyLaterMigrations(native);
        const url = new URL(target.databaseUrl); url.searchParams.set("schema", schema);
        process.env.DATABASE_URL = url.href; process.env.TEST_DATABASE_URL = url.href; process.env.NODE_ENV = "test";
        db = createPrismaClient(); vi.spyOn(prismaModule, "getPrisma").mockReturnValue(db);
        const [live] = await db.$queryRaw<Array<{ db: string; schema: string }>>`SELECT current_database() AS db,current_schema() AS schema`;
        expect(live.db === target.identity.databaseName && live.schema === schema, "Guarded dedicated owned target; values withheld").toBe(true);
        report.isolationVerified = true;
        listener = createServer((req, res) => {
          const id = String(req.headers["x-diagnostic-request"] ?? "unobserved");
          observer.context.run({ request: /^[a-z0-9-]{1,50}$/.test(id) ? id : "unobserved", attempt: 0 }, () => { observer.record("http-entry"); app(req, res); });
        });
        await new Promise<void>((accept, reject) => { listener!.once("error", reject); listener!.listen(0, "127.0.0.1", accept); });
        const address = listener.address(); if (!address || typeof address === "string") throw new Error("Owned HTTP listener unavailable.");
        const port = address.port;
        report.phase = "identities-and-real-login";
        for (let ordinal = 0; ordinal < 50; ordinal++) {
          report.preparationOrdinal = ordinal;
          const role = ordinal < 20 ? "REQUESTER" : ordinal < 40 ? "IT_STAFF" : "ADMINISTRATOR";
          const created = await createAuthUser({ role });
          // Real authentication is outside the observed cohort.
          const login = await loginRequest(created.user.email, created.password);
          if (login) expect(login.status).toBe(200);
          actors.push({ ordinal, id: created.user.id, role, cookie: login ? cookieHeader(login.headers["set-cookie"]) : "",
            csrf: login ? cookieValue(login.headers["set-cookie"], "toktickit_csrf") : "",
            agent: new Agent({ keepAlive: true, maxSockets: 1, maxFreeSockets: 1 }), readTicketId: 0, writeTicketId: 0,
            ticketToken: "", actionId: null, actionVersion: 0, lastActionStatus: null });
        }
        report.phase = "reference-data";
        const categories: number[] = [], systems: number[] = [];
        for (let i = 0; i < 4; i++) {
          categories.push((await db.category.create({ data: { name: `Complete diagnostic category ${i}` } })).id);
          systems.push((await db.relatedSystem.create({ data: { name: `Complete diagnostic system ${i}` } })).id);
        }
        report.phase = "indexed-business-fixture"; await seedBusinessRows(native, actors, categories, systems);
        const workers = actors.slice(20);
        for (const [i, actor] of workers.entries()) {
          report.phase = "real-CREATE-START-preparation"; report.preparationOrdinal = i;
          const headers = { Cookie: actor.cookie, Origin: APPROVED_ORIGIN, "X-CSRF-Token": actor.csrf };
          // Native pg decodes timestamp-without-time-zone in the host timezone.
          // Obtain the optimistic token from the real authorized application
          // DTO, as the benchmark's initial Staff detail operation does.
          const detail = await jsonHttp(port, actor.agent, "GET", `/api/staff/tickets/${actor.writeTicketId}`, headers);
          report.preparationResponses.push({ operation: "detail", ordinal: i, status: detail.status,
            error: object(object(detail.body).error).code ?? null });
          expect(detail.status).toBe(200);
          const ticket = object(detail.body); expect(ticket.id).toBe(actor.writeTicketId);
          expect(new Date(ticket.updatedAt).toISOString()).toBe(ticket.updatedAt);
          actor.ticketToken = ticket.updatedAt;
          const created = await jsonHttp(port, actor.agent, "POST", `/api/tickets/${actor.writeTicketId}/actions`, headers,
            { description: "Independent real COMPLETE diagnostic Action", result: null, assigneeId: workers[(i + 1) % 30].id,
              followUpRequired: false, followUpNote: null, attachmentNotes: null,
              expectedTicketUpdatedAt: actor.ticketToken, clientMutationId: randomUUID() });
          report.preparationResponses.push({ operation: "create", ordinal: i, status: created.status,
            error: object(object(created.body).error).code ?? null });
          expect(created.status).toBe(201); const value = object(created.body); actor.actionId = value.action.id;
          actor.ticketToken = value.ticketUpdatedAt; actor.actionVersion = value.action.version;
        }
        // Constructed historical-creator read fixture: creator is not in the
        // actor/current/new-assignee lock set. This is not workflow-path evidence.
        const historicalName = "Current historical creator <literal>";
        await db.user.update({ where: { id: actors[0].id }, data: { name: historicalName, isActive: false } });
        for (const actor of workers) await db.action.update({ where: { id: actor.actionId! }, data: { createdById: actors[0].id } });
        const names = new Map((await db.user.findMany({ select: { id: true, name: true } })).map(user => [user.id, user.name]));
        report.before = await counts(native); observer.observeTransactions(db); observer.enabled = true;
        report.plan = { workers: 30, commandsPerWorker: 3, requesterUsers: 19, readsPerRequester: 3,
          writes: 90, reads: 57, retries: 0, fixtureTickets: 2050, fixtureActions: 8030,
          note: "One un-warmed diagnostic; historical creator requester excluded from live read cohort after deactivation." };
        report.phase = "observed-overlap"; observer.sample(native, schema); loop.enable();
        const utilization = perf.eventLoopUtilization();
        async function send(actor: Actor, id: string, method: string, path: string, body?: unknown) {
          const start = performance.now();
          observer.context.run({ request: id, attempt: 0 }, () => observer.record("http-dispatch"));
          const response = await jsonHttp(port, actor.agent, method, path,
            { Cookie: actor.cookie, Origin: APPROVED_ORIGIN, "X-CSRF-Token": actor.csrf, "X-Diagnostic-Request": id }, body);
          report.responses.push({ id, operation: id.split("-")[0], status: response.status,
            error: object(object(response.body).error).code ?? null, elapsedMs: performance.now() - start });
          observer.context.run({ request: id, attempt: 0 }, () => observer.record("http-result"));
          return response;
        }
        const writes = workers.map(async (actor, i) => {
          const headers = () => ({ expectedVersion: actor.actionVersion, expectedTicketUpdatedAt: actor.ticketToken, clientMutationId: randomUUID() });
          const path = `/api/tickets/${actor.writeTicketId}/actions/${actor.actionId}`;
          for (const operation of ["edit", "start", i % 2 === 0 ? "complete" : "cancel"]) {
            const body = operation === "edit" ? { ...headers(), description: "Retained literal updated PATCH description <script>", assigneeId: workers[(i + 2) % 30].id }
              : operation === "start" ? { ...headers(), targetStatus: "IN_PROGRESS" }
              : operation === "complete" ? { ...headers(), targetStatus: "COMPLETED", confirm: true, result: "Authoritative completed diagnostic work." }
              : { ...headers(), targetStatus: "CANCELLED", confirm: true, reason: "Explicit diagnostic cancellation." };
            const response = await send(actor, `${operation}-${i}`, "PATCH", operation === "edit" ? path : `${path}/status`, body);
            expect(response.status).toBe(200);
            const value = object(response.body), action = object(value.action);
            expect(action.createdBy).toEqual({ id: actors[0].id, name: historicalName });
            expect(action.assignee).toEqual({ id: workers[(i + 2) % 30].id,
              name: names.get(workers[(i + 2) % 30].id) });
            expect(action.performedBy).toEqual(operation === "complete" ? { id: actor.id,
              name: names.get(actor.id) } : null);
            expect(action.version).toBe(actor.actionVersion + 1);
            expect(Date.parse(value.ticketUpdatedAt)).toBeGreaterThan(Date.parse(actor.ticketToken));
            actor.ticketToken = value.ticketUpdatedAt; actor.actionVersion = action.version;
          }
        });
        inFlight.push(...writes);
        const overlap = actors.slice(1, 20).map(async actor => {
          for (const [index, path] of ["/api/dashboard/requester", "/api/tickets?page=1&pageSize=25", `/api/tickets/${actor.readTicketId}`].entries()) {
            const response = await send(actor, `requester${index}-${actor.ordinal}`, "GET", path);
            expect(response.status).toBe(200);
          }
        });
        inFlight.push(...overlap); await Promise.all(inFlight);
        report.runtime = { eventLoopDelayMs: { mean: loop.mean / 1e6, p95: loop.percentile(95) / 1e6, max: loop.max / 1e6 },
          utilization: perf.eventLoopUtilization(utilization) };
        loop.disable(); await observer.stop(); observer.enabled = false;
        report.after = await counts(native);
        expect(report.after.actions).toBe(report.before.actions);
        expect(report.after.actionHistory - report.before.actionHistory).toBe(90);
        expect(report.after.receipts - report.before.receipts).toBe(90);
        expect(report.after.ticketHistory).toBe(report.before.ticketHistory);
        for (const [i, actor] of workers.entries()) {
          const action = await db.action.findUniqueOrThrow({ where: { id: actor.actionId! } });
          expect(action.version).toBe(4); expect(action.status).toBe(i % 2 === 0 ? "COMPLETED" : "CANCELLED");
          const history = await db.actionHistory.findMany({ where: { actionId: actor.actionId! }, orderBy: { actionVersion: "asc" } });
          expect(history.map(row => row.event)).toEqual(["ACTION_CREATED", "ACTION_REASSIGNED", "ACTION_STARTED", i % 2 === 0 ? "ACTION_COMPLETED" : "ACTION_CANCELLED"]);
          expect(history.map(row => row.actionVersion)).toEqual([1, 2, 3, 4]);
          expect(await db.mutationReceipt.count({ where: { actionId: actor.actionId! } })).toBe(4);
          expect((await db.ticket.findUniqueOrThrow({ where: { id: actor.writeTicketId } })).updatedAt.toISOString()).toBe(actor.ticketToken);
        }
        report.phase = "domain-verified";
        const projectionReads = workers.flatMap((_, i) => ["edit", "start", i % 2 === 0 ? "complete" : "cancel"].map(operation => {
          const id = `${operation}-${i}`, events = observer.events.filter(event => event.request === id && event.attempt > 0);
          const update = events.find(event => event.stage === "query-end" && event.kind === "Action" && event.operation === "UPDATE");
          const receipt = events.find(event => event.stage === "query-start" && event.kind === "MutationReceipt" && event.operation === "INSERT");
          expect(update).toBeDefined(); expect(receipt).toBeDefined();
          const queries = events.filter(event => event.stage === "query-start" && event.operation === "SELECT" && event.atMs > update!.atMs && event.atMs < receipt!.atMs);
          return { id, count: queries.length, models: queries.map(event => event.kind) };
        }));
        report.projectionReads = projectionReads;
        // Actual pass-through wire observations, not delegate arguments. UPDATE
        // already returned authoritative scalars; one identity lookup is enough.
        expect(projectionReads.every(read => read.count <= 1), "PATCH post-update projection needs at most one actual SELECT").toBe(true);
        report.phase = "verified";
      } finally {
        await Promise.allSettled(inFlight); await observer.stop(); observer.enabled = false;
        for (const actor of actors) actor.agent.destroy(); for (const agent of reads) agent.destroy();
        if (listener) await new Promise<void>((accept, reject) => listener!.close(error => error ? reject(error) : accept()));
        await db?.$disconnect(); report.cleanup.listenerClosed = !listener?.listening;
        report.cleanup.checkedOut = observer.pools.reduce((n, pool) => n + pool.totalCount - pool.idleCount, 0);
        expect(report.cleanup.checkedOut).toBe(0);
        expect(await observer.locks(native, schema)).toEqual({ waiters: 0, owners: 0, databaseResourceWaiters: 0, databaseResourceOwners: 0 });
      }
    });
    report.cleanup.ownedSchemaRemoved = true;
  } catch (error) {
    report.failure = safeCreateError(error); throw error;
  } finally {
    loop.disable(); observer.restore(); vi.restoreAllMocks(); keys.forEach((key, i) => saved[i] === undefined ? delete process.env[key] : process.env[key] = saved[i]);
    report.finishedAt = new Date().toISOString(); report.events = observer.events; report.poolAndDatabaseSamples = observer.samples;
    const directory = resolve(serverDirectory, "../artifacts/lab-04/hardening"); mkdirSync(directory, { recursive: true });
    const name = `patch-chain-phases-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}.json`;
    writeFileSync(resolve(directory, name), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    console.info(`PATCH chain phase artifact: ${name}`);
  }
}, 120_000);
