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
import { CompletePhaseObserver, safePhaseError } from "./complete-phase-observer.js";

// Bounded diagnostic, NOT a replacement benchmark or an all-success claim.
// The original indexed 2,050/8,000/24,000 fixture is reused unchanged.
it("attributes one independent COMPLETE cohort and overlapping real reads", async () => {
  const keys = ["DATABASE_URL", "TEST_DATABASE_URL", "NODE_ENV"], saved = keys.map(key => process.env[key]);
  const target = verifiedTestTarget(), observer = new CompletePhaseObserver(), actors: Actor[] = [];
  const report: Record<string, any> = { startedAt: new Date().toISOString(),
    executionHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim(),
    mode: "bounded-natural-COMPLETE-cohort-not-T47", phase: "guard", preparationResponses: [], responses: [], cleanup: {} };
  let db: ReturnType<typeof createPrismaClient> | undefined, listener: Server | undefined;
  const reads: Agent[] = [], inFlight: Promise<unknown>[] = [];
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
          observer.context.run({ request: /^[a-z0-9-]{1,50}$/.test(id) ? id : "unobserved", attempt: 0 }, () => app(req, res));
        });
        await new Promise<void>((accept, reject) => { listener!.once("error", reject); listener!.listen(0, "127.0.0.1", accept); });
        const address = listener.address(); if (!address || typeof address === "string") throw new Error("Owned HTTP listener unavailable.");
        const port = address.port;
        report.phase = "identities-and-real-login";
        for (let ordinal = 0; ordinal < 50; ordinal++) {
          report.preparationOrdinal = ordinal;
          const role = ordinal < 20 ? "REQUESTER" : ordinal < 40 ? "IT_STAFF" : "ADMINISTRATOR";
          const created = await createAuthUser({ role });
          // Authentication is real and outside diagnostic traffic. Requester
          // fixture identities need no session in this Staff-only cohort.
          const login = ordinal >= 20 ? await loginRequest(created.user.email, created.password) : undefined;
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
          const created = await jsonHttp(port, actor.agent, "POST", `/api/tickets/${actor.writeTicketId}/actions`, headers,
            { description: "Independent real COMPLETE diagnostic Action", result: null, assigneeId: workers[(i + 1) % 30].id,
              followUpRequired: false, followUpNote: null, attachmentNotes: null,
              expectedTicketUpdatedAt: actor.ticketToken, clientMutationId: randomUUID() });
          report.preparationResponses.push({ operation: "create", ordinal: i, status: created.status,
            error: object(object(created.body).error).code ?? null });
          expect(created.status).toBe(201); const value = object(created.body); actor.actionId = value.action.id;
          const started = await jsonHttp(port, actor.agent, "PATCH", `/api/tickets/${actor.writeTicketId}/actions/${actor.actionId}/status`, headers,
            { targetStatus: "IN_PROGRESS", expectedVersion: value.action.version, expectedTicketUpdatedAt: value.ticketUpdatedAt, clientMutationId: randomUUID() });
          report.preparationResponses.push({ operation: "start", ordinal: i, status: started.status,
            error: object(object(started.body).error).code ?? null });
          expect(started.status).toBe(200); const current = object(started.body);
          actor.ticketToken = current.ticketUpdatedAt; actor.actionVersion = current.action.version;
        }
        report.phase = "observed-baseline"; report.before = await counts(native); observer.observeTransactions(db); observer.enabled = true;
        const paths = [ `/api/staff/tickets/${workers[0].writeTicketId}`, "/api/dashboard/staff",
          "/api/staff/tickets?page=1&pageSize=25&sortBy=updatedAt&sortOrder=desc", "/api/staff/actions?assignee=me&page=1&pageSize=10" ];
        async function read(index: number, baseline: boolean) {
          const agent = new Agent({ keepAlive: true, maxSockets: 1 }); reads.push(agent);
          const id = `${baseline ? "baseline" : "overlap"}-${index}`, start = performance.now();
          const response = await jsonHttp(port, agent, "GET", paths[index % 4],
            { Cookie: workers[index % 30].cookie, "X-Diagnostic-Request": id });
          report.responses.push({ id, operation: ["detail", "dashboard", "tickets", "actions"][index % 4],
            status: response.status, error: object(object(response.body).error).code ?? null, elapsedMs: performance.now() - start });
          expect(response.status).toBe(200);
        }
        for (let i = 0; i < 4; i++) await read(i, true);
        report.phase = "observed-overlap"; observer.sample(native, schema);
        const writes = workers.map(async (actor, i) => {
          const id = `complete-${i}`, start = performance.now();
          const response = await jsonHttp(port, actor.agent, "PATCH", `/api/tickets/${actor.writeTicketId}/actions/${actor.actionId}/status`,
            { Cookie: actor.cookie, Origin: APPROVED_ORIGIN, "X-CSRF-Token": actor.csrf, "X-Diagnostic-Request": id },
            { targetStatus: "COMPLETED", confirm: true, result: "Authoritative independently completed diagnostic work.",
              expectedVersion: actor.actionVersion, expectedTicketUpdatedAt: actor.ticketToken, clientMutationId: randomUUID() });
          const value = object(response.body);
          report.responses.push({ id, operation: "complete", status: response.status,
            error: object(value.error).code ?? null, elapsedMs: performance.now() - start });
          const action = await db!.action.findUniqueOrThrow({ where: { id: actor.actionId! } });
          const parent = await db!.ticket.findUniqueOrThrow({ where: { id: actor.writeTicketId } });
          expect(action.version).toBe(actor.actionVersion + (response.status === 200 ? 1 : 0));
          expect(action.status).toBe(response.status === 200 ? "COMPLETED" : "IN_PROGRESS");
          expect(parent.updatedAt.toISOString()).toBe(response.status === 200 ? value.ticketUpdatedAt : actor.ticketToken);
          if (response.status === 200) {
            expect(parent.updatedAt.getTime()).toBeGreaterThan(Date.parse(actor.ticketToken));
            expect(action.performedById).toBe(actor.id);
          }
        });
        inFlight.push(...writes);
        const overlap = Array.from({ length: 20 }, (_, i) => read(i, false)); inFlight.push(...overlap);
        await Promise.all(inFlight); await observer.stop(); observer.enabled = false;
        report.after = await counts(native);
        const successful = report.responses.filter((r: any) => r.operation === "complete" && r.status === 200).length;
        expect(report.after.actions).toBe(report.before.actions);
        expect(report.after.actionHistory - report.before.actionHistory).toBe(successful);
        expect(report.after.receipts - report.before.receipts).toBe(successful);
        expect(report.after.ticketHistory).toBe(report.before.ticketHistory);
        report.successfulWrites = successful; report.phase = "verified";
      } finally {
        await Promise.allSettled(inFlight); await observer.stop(); observer.enabled = false;
        for (const actor of actors) actor.agent.destroy(); for (const agent of reads) agent.destroy();
        if (listener) await new Promise<void>((accept, reject) => listener!.close(error => error ? reject(error) : accept()));
        await db?.$disconnect(); report.cleanup.listenerClosed = !listener?.listening;
        report.cleanup.checkedOut = observer.pools.reduce((n, pool) => n + pool.totalCount - pool.idleCount, 0);
        expect(report.cleanup.checkedOut).toBe(0);
        expect(await observer.databaseWaiters(native, schema)).toEqual({ waiters: 0, owners: 0 });
      }
    });
    report.cleanup.ownedSchemaRemoved = true;
  } catch (error) {
    report.failure = safePhaseError(error); throw error;
  } finally {
    observer.restore(); vi.restoreAllMocks(); keys.forEach((key, i) => saved[i] === undefined ? delete process.env[key] : process.env[key] = saved[i]);
    report.finishedAt = new Date().toISOString(); report.events = observer.events; report.poolAndDatabaseSamples = observer.samples;
    const directory = resolve(serverDirectory, "../artifacts/lab-04/hardening"); mkdirSync(directory, { recursive: true });
    const name = `complete-phases-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}.json`;
    writeFileSync(resolve(directory, name), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    console.info(`COMPLETE phase artifact: ${name}`);
  }
}, 120_000);
