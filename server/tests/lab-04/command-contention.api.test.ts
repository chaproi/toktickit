import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import request from "supertest";
import { expect, it } from "vitest";
import { app } from "../../src/app.js";
import { ActionCreateFixtures } from "./action-create-test-fixtures.js";
import { actionSnapshot, assertSafeEqual } from "./action-read-test-fixtures.js";
import { retryState } from "./action-retry-test-helpers.js";
import { CreatePhaseObserver, safeCreateError } from "./create-phase-observer.js";
import { serverDirectory, verifiedTestTarget } from "./migration-test-fixtures.js";

// Bounded contention evidence, not T-47 or a latency threshold. Eight distinct
// actors/Tickets deliberately share one eligible assignee. A real held User
// gate establishes the hot resource; reads must complete while it remains held.
it("observes hot-resource checkout occupation and real reads before eight independent commands drain", async () => {
  const f = new ActionCreateFixtures(), observer = new CreatePhaseObserver();
  const target = verifiedTestTarget(), native = new Client({ connectionString: target.databaseUrl });
  const pending: Promise<any>[] = [], responses: any[] = [];
  const report: any = { mode: "bounded-hot-resource-not-T47", startedAt: new Date().toISOString(),
    executionHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim(),
    writes: 8, reads: 4, results: [], cleanup: {} };
  let held = false, failure: unknown;
  observer.install();
  try {
    await native.connect();
    const live = (await native.query("SELECT current_database() AS db,current_schema() AS schema")).rows[0];
    expect(live.db === target.identity.databaseName && live.schema === target.identity.schema, "Guarded live dedicated identity; values withheld").toBe(true);
    await f.initialize();
    const worker = await f.read.actor("hot-resource-assignee", "IT_STAFF");
    const sources = [];
    for (let i = 0; i < 8; i++) {
      const actor = await f.read.actor(`hot-resource-actor-${i}`, "IT_STAFF"), parent = await f.parent();
      sources.push({ actor, parent, input: f.input(parent, worker.user.id), before: await retryState(f.prisma, parent.id) });
    }
    observer.observeTransactions(f.prisma); observer.enabled = true; observer.sample(native, target.identity.schema);
    await native.query("SELECT pg_advisory_lock(1,$1::integer)", [worker.user.id]); held = true;
    for (const [i, source] of sources.entries()) {
      const start = performance.now();
      const work = observer.context.run({ request: `hot-write-${i}`, attempt: 0 }, async () => {
        const response = await f.post(f.path(source.parent.id), source.input, source.actor);
        report.results.push({ request: `hot-write-${i}`, status: response.status, elapsedMs: performance.now() - start });
        return response;
      });
      void work.catch(() => {}); pending.push(work);
    }
    let waiters = 0; const start = performance.now();
    while (waiters < 8 && performance.now() - start < 1500) {
      waiters = (await native.query("SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory' AND classid=1::oid AND objid=$1::oid AND NOT granted", [worker.user.id])).rows[0].n;
      if (waiters < 8) await new Promise(resolve => setTimeout(resolve, 5));
    }
    report.hotWaiters = waiters; report.heldPool = observer.occupancy();
    expect(waiters, "All eight requests actually wait on the deliberately held cross-process authority").toBe(8);
    expect(observer.events.filter(event => event.stage === "callback-entry" && String(event.request).startsWith("hot-write"))).toHaveLength(0);
    expect(report.heldPool.total - report.heldPool.idle, "Resource waiters occupy checkouts; record rather than hide this tradeoff").toBeGreaterThanOrEqual(8);
    const paths = [`/api/staff/tickets/${sources[0].parent.id}`, "/api/dashboard/staff", "/api/staff/tickets?page=1&pageSize=10", "/api/staff/actions?assignee=me&page=1&pageSize=10"];
    await Promise.all(paths.map((path, i) => observer.context.run({ request: `hot-read-${i}`, attempt: 0 }, async () => {
      const begin = performance.now(), response = await request(app).get(path).set("Cookie", f.staff.cookie);
      report.results.push({ request: `hot-read-${i}`, status: response.status, elapsedMs: performance.now() - begin });
      expect(response.status).toBe(200);
    })));
    expect(held).toBe(true);
    await native.query("SELECT pg_advisory_unlock(1,$1::integer)", [worker.user.id]); held = false;
    responses.push(...await Promise.all(pending));
    expect(responses.map(response => response.status)).toEqual(Array(8).fill(201));
    for (const [i, source] of sources.entries()) {
      const saved = await retryState(f.prisma, source.parent.id);
      expect(saved.actions).toHaveLength(1); expect(saved.history).toHaveLength(1); expect(saved.receipts).toHaveLength(1);
      const action = saved.actions[0];
      expect(action).toMatchObject({ createdById: source.actor.user.id, assigneeId: worker.user.id, status: "PLANNED", version: 1 });
      assertSafeEqual(saved.history[0].after, actionSnapshot(action), "One complete authoritative snapshot");
      assertSafeEqual(saved.receipts[0].safeResponse, responses[i].body, "One original command receipt");
      expect(saved.ticket.updatedAt.getTime()).toBeGreaterThan(source.before.ticket.updatedAt.getTime());
      expect(saved.ticket.updatedAt.toISOString()).toBe(action.updatedAt.toISOString());
      assertSafeEqual({ ...saved.ticket, updatedAt: source.before.ticket.updatedAt }, source.before.ticket, "Only parent timestamp advances");
    }
    report.exactPersistence = true;
  } catch (error) { failure = error; report.failed = true; report.failure = safeCreateError(error); }
  finally {
    const cleanupFailure = (error: unknown) => { (report.cleanup.failures ??= []).push(safeCreateError(error)); failure ??= error; };
    if (held) try { await native.query("SELECT pg_advisory_unlock(1,$1::integer)", [f.read.actors.get("hot-resource-assignee")!.user.id]); }
      catch (error) { cleanupFailure(error); await native.end(); }
    await Promise.allSettled(pending);
    try { await observer.stop(); } catch (error) { cleanupFailure(error); }
    observer.restore();
    report.events = observer.events; report.samples = observer.samples;
    report.cleanup.requestsDrained = true; report.cleanup.observersRestored = true;
    try { await f.cleanup(); report.cleanup.fixturesRemoved = true; } catch (error) { cleanupFailure(error); }
    try { await native.end(); report.cleanup.nativeDisconnected = true; } catch (error) { cleanupFailure(error); }
    const directory = resolve(serverDirectory, "../artifacts/lab-04/hardening"); mkdirSync(directory, { recursive: true });
    const filename = `command-hot-resource-2026-11-03-${randomUUID().slice(0, 8)}.json`;
    writeFileSync(resolve(directory, filename), JSON.stringify(report) + "\n", { flag: "wx" });
    console.info(`Hot-resource candidate evidence: ${filename}`);
  }
  if (failure) throw failure;
}, 120_000);
