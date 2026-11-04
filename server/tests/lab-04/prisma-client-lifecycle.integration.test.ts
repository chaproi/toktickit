import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it, vi } from "vitest";
import { createPrismaClient } from "../../src/prisma-client.js";
import { verifiedTestTarget } from "./migration-test-fixtures.js";

const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
describe("adopted public client startup/resource lifecycle", () => {
  it("rejects default and per-call startup deadlines while held, drains late starts and reconnects", async () => {
    const target = verifiedTestTarget(), url = new URL(target.databaseUrl);
    const tag = `adoption49-${randomUUID()}`;
    url.searchParams.set("connection_limit", "1"); url.searchParams.set("application_name", tag);
    const client = createPrismaClient({ datasources: { db: { url: url.href } } });
    const observer = new Client({ connectionString: target.databaseUrl });
    const ready = deferred(), release = deferred(); let callbacks = 0;
    const errors: unknown[] = []; const unhandled = (error: unknown) => { errors.push(error); };
    process.on("unhandledRejection", unhandled);
    let holding: Promise<unknown> | undefined;
    try {
      await observer.connect();
      expect((await observer.query("SELECT current_database() AS db,current_schema() AS schema")).rows[0])
        .toEqual({ db: target.identity.databaseName, schema: target.identity.schema });
      const count = async () => (await observer.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name=$1", [tag])).rows[0].n;
      expect(await count()).toBe(0); // configuration-owned pool is lazy
      holding = client.$transaction(async tx => { await tx.$queryRaw`SELECT 1`; ready.resolve(); await release.promise; });
      await ready.promise;
      const begin = performance.now();
      await expect(client.$transaction(async () => { callbacks++; })).rejects.toMatchObject({ code: "P2028",
        meta: { phase: "transaction-start", maxWait: 2000 } });
      const elapsed = performance.now() - begin;
      expect(elapsed).toBeGreaterThanOrEqual(1990); expect(elapsed).toBeLessThan(3000);
      const concurrent = [60, 100, 140].map(maxWait => client.$transaction(async () => { callbacks++; }, { maxWait })
        .then(() => { throw new Error("Timed-out business callback unexpectedly ran."); }, error => {
          expect(error).toMatchObject({ code: "P2028", meta: { phase: "transaction-start", maxWait } });
        }));
      await Promise.all(concurrent); expect(callbacks).toBe(0);
      expect(await count()).toBe(1); // still held, no per-request pool shutdown
      let disconnected = false;
      const shutdown = client.$disconnect().then(() => { disconnected = true; });
      await new Promise<void>(accept => setImmediate(accept)); expect(disconnected).toBe(false);
      await expect(client.$transaction(async () => {})).rejects.toThrow("draining");
      release.resolve(); await holding; await shutdown;
      expect(callbacks).toBe(0); expect(await count()).toBe(0);
      const [identity] = await client.$queryRaw<Array<{ schema: string; instant: Date }>>`
        SELECT current_schema() AS schema,'2026-11-01T12:34:56.789Z'::timestamptz AS instant`;
      expect(identity.schema).toBe(target.identity.schema);
      expect(identity.instant.toISOString()).toBe("2026-11-01T12:34:56.789Z");
      await client.$disconnect(); expect(await count()).toBe(0); expect(errors).toHaveLength(0);
      console.info(JSON.stringify({ stage: "adopted-client-resource-evidence", defaultMaxWaitElapsedMs: elapsed,
        concurrentDeadlines: 3, callbackAfterTimeout: 0, remainingConnections: 0, unhandledRejections: 0, reconnect: true }));
    } finally {
      release.resolve(); await holding?.catch(() => {}); await client.$disconnect();
      await observer.end(); process.off("unhandledRejection", unhandled);
    }
  });

  it("preserves query extensions and public method restoration, with execution longer than maxWait", async () => {
    const target = verifiedTestTarget();
    const client = createPrismaClient({ datasourceUrl: target.databaseUrl,
      transactionOptions: { maxWait: 100, timeout: 5000 } });
    try {
      const original = client.$transaction; const spy = vi.spyOn(client, "$transaction"); spy.mockRestore();
      expect(client.$transaction).toBe(original);
      // This checks execution after successful startup, not a claim that a
      // fresh authenticated connection must complete within60ms.
      await client.$queryRaw`SELECT 1`;
      let reads = 0;
      const extended = client.$extends({ query: { $allOperations({ args, query }) { reads++; return query(args); } } });
      const result = await extended.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_sleep(0.15)`; return "completed";
      }, { maxWait: 60 });
      expect(result).toBe("completed"); expect(reads).toBe(1);
      await client.$disconnect();
    } finally { await client.$disconnect(); }
  });
  it.each(["UTC", "Asia/Bangkok"])("preserves bound datetime instants under the actual %s session", async timezone => {
    const target = verifiedTestTarget();
    const client = createPrismaClient({ datasourceUrl: target.databaseUrl });
    const instant = new Date("2026-11-01T12:34:56.789Z");
    try {
      const row = await client.$transaction(async tx => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await tx.$queryRaw`SELECT set_config('TimeZone',${timezone},true)`;
        const [result] = await tx.$queryRaw<Array<{ zoned: Date; wall: Date; timezone: string }>>`
          SELECT ${instant}::timestamptz AS zoned,(${instant}::timestamptz AT TIME ZONE 'UTC') AS wall,
            current_setting('TimeZone') AS timezone`;
        return result;
      });
      expect(row.timezone).toBe(timezone);
      expect(row.zoned.toISOString()).toBe("2026-11-01T12:34:56.789Z");
      expect(row.wall.toISOString()).toBe("2026-11-01T12:34:56.789Z");
      expect(instant.toISOString()).toBe("2026-11-01T12:34:56.789Z");
    } finally { await client.$disconnect(); }
  });
});
