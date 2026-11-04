import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { deadlineClient } from "./deadline.js";
import { withReleaseRemedy } from "./remedy.js";
import { observe, structured, type Scope } from "./observe.js";

const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
// Coordination tolerance only. Does not alter client, pool or transaction budgets.
async function finite<T>(work: Promise<T>, ms = 15000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Diagnostic coordination did not complete.")), ms);
  })]); } finally { if (timer) clearTimeout(timer); }
}
export async function deadlineChecks(databaseUrl: string, schema: string) {
  class ConnectBudgetClient extends pg.Client {
    constructor(config: pg.ClientConfig = {}) { super({ ...config, password: config.password, connectionTimeoutMillis: 5000 }); }
  }
  const pool = new pg.Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}`,
    application_name: "issue49-start-deadline", max: 1, connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 300000, Client: ConnectBudgetClient });
  const acquired = new Set<pg.PoolClient>(), scopes: Scope[] = [];
  pool.on("acquire", client => acquired.add(client));
  pool.on("release", (_error, client) => acquired.delete(client));
  const unexpected: unknown[] = [];
  const onUnhandled = (error: unknown) => { unexpected.push(structured(error)); };
  process.on("unhandledRejection", onUnhandled);
  const wrapper = deadlineClient({ adapter: withReleaseRemedy(observe(new PrismaPg(pool, { schema }), scopes)) });
  const prisma = wrapper.client;
  const observations: unknown[] = [];
  let holder: pg.PoolClient | undefined;
  let phase = "default";
  try {
    // Connect the public adapter first, then hold its actual sole connection.
    await prisma.$connect();
    async function blocked(label: string, options?: { maxWait: number }, waitForPoolFailure = false) {
      phase = label; holder = await pool.connect();
      const beforeScopes = scopes.length;
      let called = false;
      const start = performance.now();
      const result = await finite(prisma.$transaction(async tx => {
        called = true; await tx.$queryRaw`SELECT 1`; return 1;
      }, options).then(() => ({ ok: true, error: undefined as unknown }), error => ({ ok: false, error })),
      (options?.maxWait ?? 2000) + 1500);
      const elapsedMs = performance.now() - start;
      const effective = options?.maxWait ?? 2000;
      assert.equal(result.ok, false); assert.equal(called, false);
      assert.equal((result.error as { code?: unknown }).code, "P2028");
      assert.deepEqual((result.error as { meta?: unknown }).meta, { phase: "transaction-start", maxWait: effective });
      assert.ok(elapsedMs >= effective - 10 && elapsedMs < effective + 1000);
      assert.equal(acquired.size, 1, "caller must reject while holder remains acquired");
      assert.equal(wrapper.pendingCount(), 1);
      if (waitForPoolFailure) {
        // The original pool checkout limit, not another request or a pool close,
        // eventually rejects the still-observed adapter start.
        await finite(wrapper.drain());
        assert.equal(acquired.size, 1); assert.equal(scopes.length, beforeScopes);
      }
      holder.release(); holder = undefined;
      await finite(wrapper.drain());
      assert.equal(called, false); assert.equal(acquired.size, 0);
      assert.equal(wrapper.pendingCount(), 0);
      if (!waitForPoolFailure) {
        assert.equal(scopes.length, beforeScopes + 1);
        assert.equal(scopes[beforeScopes].releaseCalls, 1);
      }
      observations.push({ label, maxWaitMs: effective, elapsedMs, code: "P2028",
        rejectedWhileHolderAcquired: true, callbackCalls: 0, lateResultDrained: true,
        latePoolRejection: waitForPoolFailure, releases: waitForPoolFailure ? 0 : 1 });
    }
    await blocked("inherited-default");
    await blocked("explicit-override", { maxWait: 70 });
    await blocked("late-pool-rejection", { maxWait: 80 }, true);

    phase = "successful-start-long-callback";
    const begin = performance.now();
    const result = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_sleep(0.18)`; return "completed";
    }, { maxWait: 60 });
    const elapsedMs = performance.now() - begin;
    assert.equal(result, "completed"); assert.ok(elapsedMs >= 180);
    assert.equal(acquired.size, 0);
    observations.push({ label: phase, maxWaitMs: 60, elapsedMs, succeeded: true, callbackTimeoutMs: 5000 });

    phase = "concurrent-deadlines";
    holder = await pool.connect();
    const concurrent = [60, 120, 180].map(maxWait => {
      let called = false; const start = performance.now();
      return prisma.$transaction(async () => { called = true; }, { maxWait }).then(
        () => { throw new Error("Blocked caller succeeded."); }, error => {
          assert.equal(called, false);
          assert.deepEqual(error.meta, { phase: "transaction-start", maxWait });
          return { maxWaitMs: maxWait, elapsedMs: performance.now() - start, callbackCalls: 0 };
        });
    });
    const deadlines = await finite(Promise.all(concurrent), 2000);
    assert.equal(wrapper.pendingCount(), 3); assert.equal(acquired.size, 1);
    holder.release(); holder = undefined; await finite(wrapper.drain());
    assert.equal(acquired.size, 0); assert.equal(wrapper.pendingCount(), 0);
    assert.ok(scopes.every(scope => scope.releaseCalls === 1));
    observations.push({ label: phase, deadlines, lateResultsDrained: 3 });

    phase = "shutdown-drain";
    holder = await pool.connect(); let called = false;
    await assert.rejects(prisma.$transaction(async () => { called = true; }, { maxWait: 60 }),
      error => (error as { code?: unknown }).code === "P2028");
    let disconnected = false;
    const shuttingDown = prisma.$disconnect().then(() => { disconnected = true; });
    await setImmediate(); assert.equal(disconnected, false);
    await assert.rejects(prisma.$transaction(async () => {}), /draining/);
    holder.release(); holder = undefined; await finite(shuttingDown);
    assert.equal(called, false); assert.equal(wrapper.pendingCount(), 0); assert.equal(acquired.size, 0);
    // External pool remains owned by this proof and usable. Factory-owned
    // reconnect already has source/proof evidence; exercise wrapper separately.
    await prisma.$queryRaw`SELECT 1`; await prisma.$disconnect();
    observations.push({ label: phase, waitedForLateResult: true, callbackCalls: 0, reconnect: true });

    phase = "constructor-default-and-call-precedence";
    const configured = deadlineClient({ adapter: withReleaseRemedy(new PrismaPg(pool, { schema })),
      transactionOptions: { maxWait: 180, timeout: 5000, isolationLevel: "Serializable" } });
    try {
      await configured.client.$connect(); holder = await pool.connect();
      for (const override of [undefined, { maxWait: 50 }]) {
        const start = performance.now(); let calls = 0;
        await assert.rejects(configured.client.$transaction(async () => { calls++; }, override), error => {
          assert.deepEqual((error as { meta: unknown }).meta,
            { phase: "transaction-start", maxWait: override?.maxWait ?? 180 }); return true;
        });
        assert.equal(calls, 0); assert.equal(acquired.size, 1);
        observations.push({ label: phase, maxWaitMs: override?.maxWait ?? 180, elapsedMs: performance.now() - start });
      }
      holder.release(); holder = undefined; await finite(configured.drain());
      const isolation = await configured.client.$transaction(async tx => {
        const rows = await tx.$queryRaw<Array<{ isolation: string }>>`SELECT current_setting('transaction_isolation') AS isolation`;
        return rows[0].isolation;
      });
      assert.equal(isolation, "serializable"); assert.equal(configured.pendingCount(), 0);
    } finally { holder?.release(); holder = undefined; await configured.client.$disconnect(); }
    await setImmediate(); assert.deepEqual(unexpected, []);
    assert.equal(acquired.size, 0);
    return { observations, statistics: wrapper.statistics, unhandledRejections: unexpected.length,
      pending: wrapper.pendingCount(), checkedOutConnections: acquired.size, allObservedReleasesExactlyOnce: scopes.every(s => s.releaseCalls === 1) };
  } catch (error) {
    // No raw database errors, credentials or query payloads in retained output.
    console.log(JSON.stringify({ failedDeadlinePhase: phase, classification: structured(error),
      assertion: error instanceof assert.AssertionError ? error.message : null, observations }));
    throw error;
  } finally {
    holder?.release(); holder = undefined;
    await finite(wrapper.drain()); await prisma.$disconnect();
    assert.equal(acquired.size, 0);
    await pool.end(); process.off("unhandledRejection", onUnhandled);
  }
}
