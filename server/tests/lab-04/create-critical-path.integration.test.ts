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
import { actionSnapshot, assertSafeEqual } from "./action-read-test-fixtures.js";
import { CreatePhaseObserver, safeCreateError } from "./create-phase-observer.js";

// One bounded first-wave diagnostic, not T-47 or an all-success regression:
// 50 VUs x five sequential operations = 30 CREATEs +220 representative reads.
it("attributes resource coordination and actual query critical paths of independent CREATE with mixed reads", async () => {
  const keys = ["DATABASE_URL", "TEST_DATABASE_URL", "NODE_ENV"], saved = keys.map(k => process.env[k]);
  const target = verifiedTestTarget(), observer = new CreatePhaseObserver(), actors: Actor[] = [];
  const report: Record<string, any> = { startedAt: new Date().toISOString(),
    executionHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim(),
    mode: "bounded-first-wave-CREATE-diagnosis-not-T47", phase: "guard", responses: [], stateChecks: [], cleanup: {},
    plan: { users: 50, requesters: 20, staff: 20, administrators: 10, sequentialPerUser: 5,
      creates: 30, reads: 220, assignee: "current actor as in original benchmark", expectedCreateStatus: 201,
      readsMix: "Requester detail/Dashboard/list/comments/Actions; Staff detail/Dashboard/list/My Actions", budgets: "inherited unchanged" } };
  let db: ReturnType<typeof createPrismaClient> | undefined, listener: Server | undefined;
  const pending: Promise<unknown>[] = [], privateWrites = new Map<number, Record<string, any>>();
  observer.install();
  try {
    await withDisposableSchema("indexes", async (native, schema) => {
      try {
        report.phase = "migrations"; await applyLab3Baseline(native); await applyLaterMigrations(native);
        const url = new URL(target.databaseUrl); url.searchParams.set("schema", schema);
        process.env.DATABASE_URL = url.href; process.env.TEST_DATABASE_URL = url.href; process.env.NODE_ENV = "test";
        db = createPrismaClient(); vi.spyOn(prismaModule, "getPrisma").mockReturnValue(db);
        const [live] = await db.$queryRaw<Array<{ db: string; schema: string }>>`SELECT current_database() AS db,current_schema() AS schema`;
        expect(live.db === target.identity.databaseName && live.schema === schema, "Guarded exact owned target; connection values withheld").toBe(true);
        report.isolationVerified = true;
        listener = createServer((req, res) => {
          const id = String(req.headers["x-create-diagnostic"] ?? "unobserved");
          observer.context.run({ request: /^[a-z0-9-]{1,50}$/.test(id) ? id : "unobserved", attempt: 0 }, () => app(req, res));
        });
        await new Promise<void>((accept, reject) => { listener!.once("error", reject); listener!.listen(0, "127.0.0.1", accept); });
        const address = listener.address(); if (!address || typeof address === "string") throw new Error("Owned loopback listener unavailable.");
        report.phase = "identities-and-real-logins";
        for (let ordinal = 0; ordinal < 50; ordinal++) {
          report.preparationOrdinal = ordinal;
          const role = ordinal < 20 ? "REQUESTER" : ordinal < 40 ? "IT_STAFF" : "ADMINISTRATOR";
          const created = await createAuthUser({ role }), login = await loginRequest(created.user.email, created.password);
          expect(login.status).toBe(200);
          actors.push({ ordinal, id: created.user.id, role, cookie: cookieHeader(login.headers["set-cookie"]),
            csrf: cookieValue(login.headers["set-cookie"], "toktickit_csrf"),
            agent: new Agent({ keepAlive: true, maxSockets: 1, maxFreeSockets: 1 }),
            readTicketId: 0, writeTicketId: 0, ticketToken: "", actionId: null, actionVersion: 0, lastActionStatus: null });
        }
        const categories: number[] = [], systems: number[] = [];
        for (let i = 0; i < 4; i++) {
          categories.push((await db.category.create({ data: { name: `Create phase category ${i}` } })).id);
          systems.push((await db.relatedSystem.create({ data: { name: `Create phase system ${i}` } })).id);
        }
        report.phase = "indexed-business-fixture"; await seedBusinessRows(native, actors, categories, systems);
        const before = await db.ticket.findMany({ where: { id: { in: actors.slice(20).map(a => a.writeTicketId) } } });
        report.before = await counts(native);
        expect(report.before).toEqual({ tickets: 2050, actions: 8000, actionHistory: 24000, ticketHistory: 3800,
          receipts: 0, comments: 0, users: 50, sessions: 50 });
        observer.observeTransactions(db); observer.enabled = true; observer.sample(native, schema);
        report.phase = "first-wave";
        for (const actor of actors) {
          const work = (async () => {
            for (let step = 0; step < 5; step++) {
              const read = `/api/tickets/${actor.readTicketId}`, write = `/api/tickets/${actor.writeTicketId}`;
              const requester = actor.role === "REQUESTER";
              const paths = requester ? [read, "/api/dashboard/requester", "/api/tickets?page=1&pageSize=25&sortBy=updatedAt&sortOrder=desc",
                `${write}/comments?page=1&pageSize=20`, `${read}/actions?page=1&pageSize=20`]
                : [`/api/staff/tickets/${actor.writeTicketId}`, "/api/dashboard/staff", "/api/staff/tickets?page=1&pageSize=25&sortBy=updatedAt&sortOrder=desc",
                  "/api/staff/actions?assignee=me&actionStatusGroup=unfinished&page=1&pageSize=10", `${write}/actions`];
              const create = !requester && step === 4, request = `u${actor.ordinal}-s${step}`;
              const input = create ? { description: `Independent real diagnostic create; ${"literal diagnostic text ".repeat(12)}`,
                result: null, assigneeId: actor.id, followUpRequired: false, followUpNote: null,
                attachmentNotes: "Literal diagnostic notes; no binary upload.", expectedTicketUpdatedAt: actor.ticketToken, clientMutationId: randomUUID() } : undefined;
              const start = performance.now();
              const response = await jsonHttp(address.port, actor.agent, create ? "POST" : "GET", paths[step],
                { Cookie: actor.cookie, Origin: APPROVED_ORIGIN, "X-CSRF-Token": actor.csrf, "X-Create-Diagnostic": request }, input);
              const body = object(response.body);
              report.responses.push({ request, user: actor.ordinal, role: actor.role, step,
                operation: create ? "create" : `${requester ? "requester" : "staff"}-${["detail", "dashboard", "list", requester ? "comments" : "actions", "actions"][step]}`,
                startedMs: start - observer.epoch, elapsedMs: performance.now() - start, status: response.status,
                errorCode: object(body.error).code ?? null, transportError: response.transportError });
              expect(response.transportError).toBeNull();
              if (!create) {
                expect(response.status).toBe(200);
                if (!requester && step === 0) {
                  expect(body.id).toBe(actor.writeTicketId); expect(new Date(body.updatedAt).toISOString()).toBe(body.updatedAt);
                  actor.ticketToken = body.updatedAt;
                  expect(before.find(t => t.id === actor.writeTicketId)!.updatedAt.toISOString()).toBe(actor.ticketToken);
                }
              } else {
                privateWrites.set(actor.ordinal, { status: response.status, body, input });
                expect([201, 409, 500, 503]).toContain(response.status);
              }
            }
          })();
          void work.catch(() => undefined); pending.push(work);
        }
        await Promise.all(pending);
        report.phase = "authoritative-state-checks";
        const parents = await db.ticket.findMany({ where: { id: { in: before.map(t => t.id) } } });
        const actions = await db.action.findMany({ where: { ticketId: { in: before.map(t => t.id) } } });
        const history = await db.actionHistory.findMany({ where: { action: { ticketId: { in: before.map(t => t.id) } } } });
        const receipts = await db.mutationReceipt.findMany({ where: { ticketId: { in: before.map(t => t.id) } } });
        for (const actor of actors.slice(20)) {
          const earlier = before.find(t => t.id === actor.writeTicketId)!, parent = parents.find(t => t.id === actor.writeTicketId)!;
          const saved = privateWrites.get(actor.ordinal)!, children = actions.filter(a => a.ticketId === parent.id);
          const audit = history.filter(h => children.some(a => a.id === h.actionId)), records = receipts.filter(r => r.ticketId === parent.id);
          if (saved.status === 201) {
            expect(children).toHaveLength(1); expect(audit).toHaveLength(1); expect(records).toHaveLength(1);
            const action = children[0];
            expect(action).toMatchObject({ createdById: actor.id, assigneeId: actor.id, performedById: null, status: "PLANNED", version: 1 });
            expect(parent.updatedAt.getTime()).toBeGreaterThan(earlier.updatedAt.getTime());
            expect(parent.updatedAt.toISOString()).toBe(saved.body.ticketUpdatedAt);
            expect(action.updatedAt.toISOString()).toBe(saved.body.ticketUpdatedAt);
            expect(audit[0]).toMatchObject({ actorId: actor.id, actionVersion: 1, event: "ACTION_CREATED", before: null });
            assertSafeEqual(audit[0].after, actionSnapshot(action), "Exact CREATE snapshot; values withheld");
            expect(records[0]).toMatchObject({ actorId: actor.id, operation: "CREATE_ACTION", clientMutationId: saved.input.clientMutationId });
            assertSafeEqual(records[0].safeResponse, saved.body, "Exact authoritative receipt; payload withheld");
          } else {
            expect(children).toHaveLength(0); expect(records).toHaveLength(0);
            assertSafeEqual(parent, earlier, "Unsuccessful CREATE preserves exact parent; values withheld");
          }
          report.stateChecks.push({ user: actor.ordinal, status: saved.status, exactCommittedOrRejectedState: true });
        }
        report.after = await counts(native);
        const successful = [...privateWrites.values()].filter(w => w.status === 201).length;
        expect(report.after).toEqual({ ...report.before, actions: 8000 + successful, actionHistory: 24000 + successful, receipts: successful });
        expect(report.responses).toHaveLength(250);
        // Proposed D-12 explicitly removes the global writer FIFO. Observe
        // actual command selection and User/Ticket gate execution instead.
        expect(observer.events.filter(e => e.stage === "fifo-enqueue")).toHaveLength(0);
        expect(observer.events.filter(e => e.stage === "attempt-selected")).toHaveLength(30);
        for (const kind of ["resource-1", "resource-2"]) {
          expect(observer.events.filter(e => e.stage === "query-end" && e.kind === kind && !e.error).length).toBeGreaterThanOrEqual(30);
        }
        expect(successful).toBe(30);
        report.successfulCreates = successful; report.phase = "verified";
      } finally {
        await Promise.allSettled(pending); for (const actor of actors) actor.agent.destroy();
        if (listener) await new Promise<void>((accept, reject) => listener!.close(error => error ? reject(error) : accept()));
        await db?.$disconnect(); await observer.stop();
        report.cleanup = { listenerClosed: !listener?.listening, checkedOut: observer.pools.reduce((n, pool) => n + pool.totalCount - pool.idleCount, 0),
          admission: await observer.locks(native, schema) };
        expect(report.cleanup.checkedOut).toBe(0);
        expect(report.cleanup.admission).toEqual({ waiters: 0, owners: 0, databaseResourceWaiters: 0, databaseResourceOwners: 0 });
      }
    });
    report.cleanup.ownedSchemaRemoved = true;
  } catch (error) { report.failure = safeCreateError(error); throw error; }
  finally {
    observer.enabled = false; observer.restore(); vi.restoreAllMocks();
    keys.forEach((k, i) => saved[i] === undefined ? delete process.env[k] : process.env[k] = saved[i]);
    report.finishedAt = new Date().toISOString(); report.events = observer.events; report.poolAndFifoSamples = observer.samples;
    const directory = resolve(serverDirectory, "../artifacts/lab-04/hardening"); mkdirSync(directory, { recursive: true });
    const name = `create-critical-path-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}.json`;
    writeFileSync(resolve(directory, name), JSON.stringify(report, null, 2) + "\n", { flag: "wx" }); console.info(`CREATE critical-path artifact: ${name}`);
  }
}, 120_000);
