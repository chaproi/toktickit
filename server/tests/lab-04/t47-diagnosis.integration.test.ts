import { randomUUID } from "node:crypto";
import { createServer, Agent, type Server } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { expect, it, vi } from "vitest";
import { app } from "../../src/app.js";
import * as prismaModule from "../../src/prisma.js";
import { createAuthUser, loginRequest, cookieHeader, cookieValue, APPROVED_ORIGIN } from "../lab-03/auth-test-helpers.js";
import { applyLab3Baseline, applyLaterMigrations, query, serverDirectory, verifiedTestTarget, withDisposableSchema } from "./migration-test-fixtures.js";
import { jsonHttp, object, host, type Actor } from "./performance-test-helpers.js";
import { seedBusinessRows, counts } from "./t47-diagnostic-fixtures.js";
import { DiagnosticObserver, bounded, logBoundary, readOwnedErrors } from "./t47-diagnostic-observer.js";

// Diagnosis, not the T-47 workload or a passing performance assertion.
it("diagnoses two-worker receipt conflicts and profiles four real routes with 35 bounded diagnostic requests", async () => {
  const begun = performance.now(), token = randomUUID().replaceAll("-", "");
  const previous = Object.fromEntries(["DATABASE_URL", "TEST_DATABASE_URL", "NODE_ENV"].map(key => [key, process.env[key]]));
  const report: any = { mode: "bounded-diagnosis-not-benchmark", startedAt: new Date().toISOString(), host: host(),
    executionHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim(),
    requests: [], rounds: [], serverErrors: [], cleanup: {}, failures: [] };
  const actors: Actor[] = []; let db: PrismaClient<any, "query"> | undefined;
  let getter: ReturnType<typeof vi.spyOn> | undefined;
  let observer: DiagnosticObserver | undefined, listener: Server | undefined;
  let stage = "isolation";
  const classify = (error: unknown) => ({ stage, name: error instanceof Error ? error.name : "unknown",
    code: typeof object(error).code === "string" && /^(P\d{4}|[A-Z0-9]{5})$/.test(object(error).code) ? object(error).code : null });
  try {
    const target = verifiedTestTarget();
    await withDisposableSchema("indexes", async (client, schema) => {
      try {
        stage = "migrations"; await applyLab3Baseline(client); await applyLaterMigrations(client);
        const url = new URL(target.databaseUrl), tag = `t47-diagnostic-${token}`;
        url.searchParams.set("schema", schema); url.searchParams.set("application_name", tag);
        process.env.DATABASE_URL = url.toString(); process.env.TEST_DATABASE_URL = url.toString(); process.env.NODE_ENV = "test";
        // Same real client/driver/default pool; query events only. No delegate/results mock.
        db = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
        getter = vi.spyOn(prismaModule, "getPrisma").mockReturnValue(db as ReturnType<typeof prismaModule.getPrisma>);
        const [live] = await db.$queryRaw<Array<{ db: string; schema: string; tag: string }>>`
          SELECT current_database() AS db,current_schema() AS schema,current_setting('application_name') AS tag`;
        expect(live.db === target.identity.databaseName && live.schema === schema && live.tag === tag,
          "Real diagnostic app uses exact guarded owned target/tag; identities withheld").toBe(true);
        report.isolationVerified = true;
        observer = new DiagnosticObserver(db, client, tag, schema);
        listener = createServer((req, res) => {
          const id = String(req.headers["x-t47-diagnostic"] ?? "provisioning");
          const trace = observer!.traces.get(id);
          if (!trace) { app(req, res); return; }
          observer!.context.run(trace, () => {
            trace.serverStart = performance.now();
            res.once("finish", () => { trace.finishMs = performance.now() - trace.serverStart!; });
            app(req, res);
          });
        });
        await new Promise<void>((resolve, reject) => { listener!.once("error", reject); listener!.listen(0, "127.0.0.1", resolve); });
        const address = listener.address(); if (!address || typeof address === "string") throw new Error("Owned listener unavailable.");
        const selected = new Set([0, 1, 2, 3, 4, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 40]);
        stage = "identities-and-sessions";
        for (let ordinal = 0; ordinal < 50; ordinal++) {
          const role = ordinal < 20 ? "REQUESTER" : ordinal < 40 ? "IT_STAFF" : "ADMINISTRATOR";
          const created = await createAuthUser({ email: `issue49-diag-${token}-${ordinal}@example.test`, role });
          const actor: Actor = { ordinal, id: created.user.id, role, cookie: "", csrf: "",
            agent: new Agent({ keepAlive: true, maxSockets: 1, maxFreeSockets: 1 }),
            readTicketId: 0, writeTicketId: 0, ticketToken: "", actionId: null, actionVersion: 0, lastActionStatus: null };
          actors.push(actor);
          if (selected.has(ordinal)) {
            const login = await loginRequest(created.user.email, created.password);
            expect(login.status, "Actual provisioning login; private body withheld").toBe(200);
            actor.cookie = cookieHeader(login.headers["set-cookie"]); actor.csrf = cookieValue(login.headers["set-cookie"], "toktickit_csrf");
          }
        }
        report.provisioningLogins = selected.size;
        const categories: number[] = [], systems: number[] = [];
        for (let n = 0; n < 4; n++) {
          categories.push((await db.category.create({ data: { name: `Diagnostic ${token} category ${n}` } })).id);
          systems.push((await db.relatedSystem.create({ data: { name: `Diagnostic ${token} system ${n}` } })).id);
        }
        stage = "business-fixtures"; await seedBusinessRows(client, actors, categories, systems);
        report.fixtureBefore = await counts(client);
        expect(report.fixtureBefore).toMatchObject({ tickets: 2050, actions: 8000, actionHistory: 24000, ticketHistory: 3800, sessions: 20 });
        const send = async (id: string, phase: string, route: string, actor: Actor, method: string, path: string, body?: unknown) => {
          const trace = observer!.beginRequest(id, phase, route), start = performance.now();
          const response = await jsonHttp(address.port, actor.agent, method, path,
            { Cookie: actor.cookie, Origin: APPROVED_ORIGIN, "X-CSRF-Token": actor.csrf, "X-T47-Diagnostic": id }, body);
          report.requests.push({ id, phase, route, status: response.status, startOffsetMs: start - begun, durationMs: performance.now() - start,
            errorCode: typeof object(object(response.body).error).code === "string" ? object(object(response.body).error).code : null,
            bytes: response.bytes, transport: response.transportError });
          if (response.transportError) throw new Error("Diagnostic transport failed; not an application classification.");
          // Current raw response is used by the actual next command, never exported.
          return { body: object(response.body), status: response.status, trace };
        };
        const workers = [actors[20]!, actors[40]!];
        const keys = new Set<string>();
        const input = (actor: Actor, ticketToken: string) => {
          const uuid = randomUUID(); expect(keys.has(uuid)).toBe(false); keys.add(uuid);
          return { description: "Real bounded diagnostic Action creation.", result: null, assigneeId: actor.id,
            followUpRequired: false, followUpNote: null, attachmentNotes: null,
            expectedTicketUpdatedAt: ticketToken, clientMutationId: uuid };
        };
        observer.phase = "write"; observer.startSampling(); stage = "controlled-creates";
        const tokens: string[] = [];
        for (const [i, actor] of workers.entries()) {
          const result = await send(`D-C${i + 1}`, "write", "staff-detail-token", actor, "GET", `/api/staff/tickets/${actor.writeTicketId}`);
          expect(result.status).toBe(200); tokens.push(result.body.updatedAt);
        }
        const runPair = async (label: string, ids: string[], calls: Array<() => ReturnType<typeof send>>) => {
          const boundary = await logBoundary(client);
          const barrier = observer!.coordinate(ids);
          const tasks = calls.map(call => call());
          try { await bounded(barrier.ready); await observer!.inspectLocks(label); }
          finally { barrier.release(); }
          const settled = await Promise.allSettled(tasks);
          if (settled.some(value => value.status === "rejected")) throw new Error("Diagnostic request rejected; work drained.");
          const errors = await readOwnedErrors(client, boundary, observer!.backendIds);
          report.serverErrors.push({ round: label, errors });
          report.rounds.push({ label, requests: ids, backends: observer!.transactions.filter(value => ids.includes(value.request)).map(value => value.backend) });
          return settled.map(value => (value as PromiseFulfilledResult<Awaited<ReturnType<typeof send>>>).value);
        };
        await runPair("create", ["C-1", "C-2"], workers.map((actor, i) => () => send(`C-${i + 1}`, "write", "create", actor, "POST",
          `/api/tickets/${actor.writeTicketId}/actions`, input(actor, tokens[i]!))));
        // Declared serial controls use two distinct new Tickets/keys, not retries.
        stage = "serial-create-controls";
        const controls: Array<{ ticketId: number; response: any }> = [];
        for (const [i, actor] of workers.entries()) {
          const ticket = await db.ticket.create({ data: { ticketNumber: `DG-${token.slice(0, 8)}-${i}`, clientSubmissionId: randomUUID(),
            requesterId: actors[0]!.id, ownerId: actor.id, categoryId: categories[0]!, relatedSystemId: systems[0]!,
            summary: "Independent diagnostic control", description: "Owned synthetic control context", requestedPriority: "LOW", itPriority: "LOW", currentStatus: "OPEN" } });
          const detail = await send(`D-S${i + 1}`, "write", "staff-detail-token", actor, "GET", `/api/staff/tickets/${ticket.id}`);
          expect(detail.status).toBe(200);
          const saved = await send(`S-${i + 1}`, "write", "serial-create-control", actor, "POST", `/api/tickets/${ticket.id}/actions`, input(actor, detail.body.updatedAt));
          expect(saved.status, "Sequential control create must be valid; no fabricated success").toBe(201);
          controls.push({ ticketId: ticket.id, response: saved.body });
        }
        stage = "controlled-edits";
        await runPair("edit", ["E-1", "E-2"], workers.map((actor, i) => () => {
          const original = controls[i]!.response, uuid = randomUUID(); expect(keys.has(uuid)).toBe(false); keys.add(uuid);
          return send(`E-${i + 1}`, "write", "edit", actor, "PATCH", `/api/tickets/${controls[i]!.ticketId}/actions/${original.action.id}`,
            { description: "Real bounded diagnostic edit with current tokens.", expectedVersion: original.action.version,
              expectedTicketUpdatedAt: original.ticketUpdatedAt, clientMutationId: uuid });
        }));
        report.uniqueMutationKeys = keys.size;
        report.independence = { workers: new Set(workers.map(actor => actor.id)).size,
          primaryTickets: new Set(workers.map(actor => actor.writeTicketId)).size,
          controlTickets: new Set(controls.map(value => value.ticketId)).size,
          selfAssigned: true, tokensFromAuthoritativeDetailOrMutation: true };
        report.afterWrites = await counts(client);
        const domain = await db.$queryRaw<any[]>`SELECT (SELECT count(*)::int FROM "Action") AS actions,
          (SELECT count(*)::int FROM "ActionHistory") AS histories,(SELECT count(*)::int FROM "MutationReceipt") AS receipts,
          (SELECT count(*)::int FROM "TicketStatusHistory") AS "ticketHistory"`;
        const paths = [
          "/api/tickets?page=1&pageSize=25&sortBy=updatedAt&sortOrder=desc",
          "/api/staff/tickets?page=1&pageSize=25&sortBy=updatedAt&sortOrder=desc",
          "/api/dashboard/staff", "/api/staff/actions?assignee=me&actionStatusGroup=unfinished&page=1&pageSize=10",
        ];
        const labels = ["owned-list", "staff-queue", "staff-dashboard", "my-actions"];
        const baselineActors = [actors[0]!, actors[20]!, actors[25]!, actors[40]!];
        stage = "read-baselines"; observer.phase = "baseline";
        for (let n = 0; n < 4; n++) {
          const id = `B-${n + 1}`; observer.setBaseline(id);
          const result = await send(id, "baseline", labels[n]!, baselineActors[n]!, "GET", paths[n]!);
          expect(result.status).toBe(200); observer.setBaseline(null);
        }
        stage = "due-session-control";
        await db.authSession.updateMany({ where: { userId: actors[0]!.id }, data: { lastSeenAt: new Date(Date.now() - 6 * 60_000) } });
        observer.setBaseline("S-REFRESH");
        const refreshed = await send("S-REFRESH", "baseline", "owned-list-due-session", actors[0]!, "GET", paths[0]!);
        expect(refreshed.status).toBe(200); observer.setBaseline(null);
        stage = "single-read-load-wave"; observer.phase = "load";
        const groups = [actors.slice(0, 5), actors.slice(20, 25), actors.slice(25, 30), [actors[30]!, actors[31]!, actors[32]!, actors[33]!, actors[40]!]];
        const tasks = groups.flatMap((group, route) => group.map((actor, n) => send(`L-${route + 1}-${n + 1}`, "load", labels[route]!, actor, "GET", paths[route]!)));
        const settled = await Promise.allSettled(tasks);
        expect(settled.every(value => value.status === "fulfilled" && value.value.status === 200), "All declared read diagnostics complete successfully").toBe(true);
        await observer.stop();
        stage = "actual-route-plans"; report.actualPlans = await observer.actualPlans();
        const after = await db.$queryRaw<any[]>`SELECT (SELECT count(*)::int FROM "Action") AS actions,
          (SELECT count(*)::int FROM "ActionHistory") AS histories,(SELECT count(*)::int FROM "MutationReceipt") AS receipts,
          (SELECT count(*)::int FROM "TicketStatusHistory") AS "ticketHistory"`;
        expect(JSON.stringify(after) === JSON.stringify(domain), "Read diagnostics preserve domain counts; explicit session bookkeeping separate").toBe(true);
        report.readDomainCountsPreserved = true;
        report.traces = observer.publicTraces(); report.transactions = observer.transactions;
        report.engineQueries = observer.engineQueries; report.waitSamples = observer.waitSamples; report.barrierLocks = observer.barrierLocks;
        expect(report.requests).toHaveLength(35);
      } catch (error) { report.failures.push(classify(error)); throw error; }
      finally {
        await observer?.stop(); for (const actor of actors) actor.agent.destroy();
        if (listener) await new Promise<void>((resolve, reject) => listener!.close(error => error ? reject(error) : resolve()));
        await db?.$disconnect(); getter?.mockRestore();
        report.cleanup = { drained: true, listenerClosed: !listener?.listening, clientDisconnected: true, observersRestored: true };
      }
    });
    report.cleanup.schemaRemoved = true;
  } catch (error) { if (!report.failures.length) report.failures.push(classify(error)); }
  finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    report.cleanup.environmentRestored = Object.entries(previous).every(([key, value]) => process.env[key] === value);
    report.elapsedMs = performance.now() - begun;
    const path = resolve(serverDirectory, `../artifacts/lab-04/hardening/t47-diagnostic-observations-2026-11-01-${token.slice(0, 8)}.json`);
    mkdirSync(resolve(path, ".."), { recursive: true }); writeFileSync(path, JSON.stringify(report) + "\n", { flag: "wx" });
    console.info("T47 bounded diagnostic completed", { requests: report.requests.length, failures: report.failures,
      cleanup: report.cleanup, artifact: path.split(/[\\/]/).at(-1) });
  }
  expect(report.failures, "Safe diagnostic failure classification; original benchmark remains unchanged").toEqual([]);
  expect(Object.values(report.cleanup).every(Boolean)).toBe(true);
}, 120_000);
