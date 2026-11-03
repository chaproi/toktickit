import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as poll } from "node:timers/promises";
import { Client } from "pg";
import { Prisma } from "@prisma/client";
import { beforeAll, afterAll, expect, it } from "vitest";
import { verifiedTestTarget, serverDirectory } from "./migration-test-fixtures.js";
import { makeAdmissionProofClient } from "./write-admission-proof-client.js";
import { ADMISSION_NAMESPACE, withWriteAdmission } from "../../src/database/write-admission.js";

const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
async function until(check: () => Promise<boolean> | boolean, budget = 3000) {
  const start = performance.now();
  while (!(await check())) { if (performance.now() - start > budget) throw new Error("Observable front-queue condition not reached."); await poll(5); }
}
const schema = `issue49_front_${randomUUID().replaceAll("-", "")}`;
const owners: ReturnType<typeof makeAdmissionProofClient>[] = [], observations: unknown[] = [];
let native: Client, url: string, key: number;
const create = (options: Prisma.PrismaClientOptions = {}) => {
  const owner = makeAdmissionProofClient(url, options); owners.push(owner); return owner;
};
const write = <T>(owner: ReturnType<typeof create>, callback: (tx: Prisma.TransactionClient) => Promise<T>, options: { maxWait?: number; timeout?: number } = {}) =>
  withWriteAdmission(() => owner.client.$transaction(callback, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, ...options }));
const locks = async (granted: boolean) => (await native.query<{ n: number }>(
  "SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory' AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND classid=$1::oid AND objid=$2::oid AND granted=$3",
  [ADMISSION_NAMESPACE, key >>> 0, granted])).rows[0].n;

beforeAll(async () => {
  const target = verifiedTestTarget(); native = new Client({ connectionString: target.databaseUrl }); await native.connect();
  expect((await native.query("SELECT current_database() AS db")).rows[0].db === target.identity.databaseName, "Guarded dedicated target; values withheld").toBe(true);
  await native.query(`CREATE SCHEMA "${schema}"`);
  key = Number((await native.query("SELECT oid::text AS oid FROM pg_namespace WHERE nspname=$1", [schema])).rows[0].oid) | 0;
  const parsed = new URL(target.databaseUrl); parsed.searchParams.set("schema", schema);
  parsed.searchParams.set("connection_limit", "2"); // deliberate resource fixture, never a production setting
  url = parsed.href;
});
afterAll(async () => {
  await Promise.all(owners.map(owner => owner.client.$disconnect()));
  await until(async () => (await locks(false)) === 0);
  expect(await locks(true)).toBe(0);
  expect(owners.every(owner => owner.pools.every(pool => pool.totalCount === 0))).toBe(true);
  await native.query(`DROP SCHEMA "${schema}" CASCADE`);
  expect((await native.query("SELECT count(*)::int AS n FROM pg_namespace WHERE nspname=$1", [schema])).rows[0].n).toBe(0);
  await native.end();
  const path = resolve(serverDirectory, "../artifacts/lab-04/hardening"); mkdirSync(path, { recursive: true });
  const filename = `front-queue-resource-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}.json`;
  writeFileSync(resolve(path, filename), JSON.stringify({ executionHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim(),
    recordedAt: new Date().toISOString(), observations, cleanup: { poolsDisconnected: true, admissionLocks: 0, ownedSchemaRemoved: true } }, null, 2) + "\n", { flag: "wx" });
  console.info(`Front queue resource artifact: ${filename}`);
});

it("keeps queued selected writers out of the pool while real reads proceed", async () => {
  const owner = create(), settled: number[] = [], entered: number[] = [];
  await owner.client.$queryRaw`SELECT 1`;
  await native.query("SELECT pg_advisory_lock($1::integer,$2::integer)", [ADMISSION_NAMESPACE, key]);
  const pending: Promise<unknown>[] = [];
  try {
    pending.push(write(owner, async tx => { entered.push(0); await tx.$queryRaw`SELECT 1`; }).finally(() => { settled.push(0); }).catch(() => {}));
    await until(async () => (await locks(false)) === 1);
    for (const i of [1, 2]) pending.push(write(owner, async tx => { entered.push(i); await tx.$queryRaw`SELECT 1`; })
      .finally(() => { settled.push(i); }).catch(() => {}));
    const before = performance.now();
    const [read] = await owner.client.$queryRaw<Array<{ value: number }>>`SELECT 7::int AS value`;
    const observation = { check: "read-under-admission-pressure", read: read.value, readElapsedMs: performance.now() - before,
      settledBeforeExternalUnlock: [...settled], callbacksBeforeExternalUnlock: [...entered],
      checkedOut: owner.pools[0].totalCount - owner.pools[0].idleCount, actualAdmissionWaiters: await locks(false) };
    observations.push(observation);
    expect(read.value).toBe(7); expect(settled).toEqual([]); expect(entered).toEqual([]);
    expect(observation.checkedOut).toBe(1); expect(observation.actualAdmissionWaiters).toBe(1);
  } finally {
    await native.query("SELECT pg_advisory_unlock($1::integer,$2::integer)", [ADMISSION_NAMESPACE, key]);
    await Promise.all(pending); await owner.client.$disconnect();
  }
}, 10_000);

it("expires queued constructor/default and per-call deadlines without checkout or later callbacks", async () => {
  const owner = create({ transactionOptions: { maxWait: 120 } }), entered = deferred(), release = deferred();
  const callbacks: number[] = [];
  const head = write(owner, async tx => { await tx.$queryRaw`SELECT 1`; entered.resolve(); await release.promise; }, { maxWait: 1000 });
  await entered.promise; const acquired = owner.events.acquired;
  const configured = [undefined, 70, 190], elapsed: number[] = [];
  try {
    await Promise.all(configured.map(async (maxWait, i) => {
      const start = performance.now();
      await expect(write(owner, async () => { callbacks.push(i); }, maxWait === undefined ? {} : { maxWait }))
        .rejects.toMatchObject({ code: "P2028", meta: { phase: "transaction-start", maxWait: maxWait ?? 120 } });
      elapsed[i] = performance.now() - start;
      expect(elapsed[i]).toBeGreaterThanOrEqual((maxWait ?? 120) - 15); expect(elapsed[i]).toBeLessThan((maxWait ?? 120) + 600);
    }));
    observations.push({ check: "queued-deadlines", configuredMs: [120, 70, 190], elapsedMs: elapsed,
      extraPhysicalCheckouts: owner.events.acquired - acquired, callbacks: [...callbacks] });
    expect(owner.events.acquired).toBe(acquired); expect(callbacks).toEqual([]);
  } finally { release.resolve(); await head; await owner.drain(); await owner.client.$disconnect(); }
  expect(callbacks).toEqual([]);
}, 10_000);

it("preserves FIFO survivors and isolates a cancelled queued caller", async () => {
  const owner = create(), entered = deferred(), release = deferred(), order: number[] = [];
  const head = write(owner, async tx => { order.push(0); await tx.$queryRaw`SELECT 1`; entered.resolve(); await release.promise; });
  await entered.promise;
  const first = write(owner, async () => { order.push(1); });
  const cancelled = write(owner, async () => { order.push(99); }, { maxWait: 60 });
  const rejected = expect(cancelled).rejects.toMatchObject({ code: "P2028" });
  const last = write(owner, async () => { order.push(2); });
  try { await rejected; expect(order).toEqual([0]); }
  finally { release.resolve(); await Promise.all([head, first, last]); await owner.client.$disconnect(); }
  expect(order).toEqual([0, 1, 2]); observations.push({ check: "FIFO-with-cancelled-middle", order });
}, 10_000);

it("holds the permit until an execution-expired business callback drains", async () => {
  const owner = create(), entered = deferred(), release = deferred(); let backend = 0, callbacks = 0;
  const head = write(owner, async tx => {
    backend = (await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid()::int AS pid`)[0].pid;
    entered.resolve(); await release.promise;
  }, { timeout: 80 });
  const failed = expect(head).rejects.toMatchObject({ code: "P2028" });
  await entered.promise;
  try {
    await until(async () => (await native.query("SELECT xact_start IS NULL AS idle FROM pg_stat_activity WHERE pid=$1", [backend])).rows[0]?.idle === true);
    const acquired = owner.events.acquired;
    await expect(write(owner, async () => { callbacks++; }, { maxWait: 100 })).rejects.toMatchObject({ code: "P2028", meta: { phase: "transaction-start" } });
    observations.push({ check: "execution-expired-callback-undrained", extraCheckouts: owner.events.acquired - acquired,
      callbacks, admissionOwners: await locks(true) });
    expect(callbacks).toBe(0); expect(owner.events.acquired).toBe(acquired); expect(await locks(true)).toBe(1);
  } finally { release.resolve(); await failed; await owner.drain(); await owner.client.$disconnect(); }
}, 10_000);

it("drains shutdown, rejects new work and reconnects without reviving expired callers", async () => {
  const owner = create(), entered = deferred(), release = deferred(); let callbacks = 0, disconnected = false;
  const unhandled: unknown[] = [], onUnhandled = (error: unknown) => { unhandled.push(error); };
  process.on("unhandledRejection", onUnhandled);
  const head = write(owner, async tx => { await tx.$queryRaw`SELECT 1`; entered.resolve(); await release.promise; });
  await entered.promise; const acquired = owner.events.acquired;
  const queued = [60, 110].map(maxWait => expect(write(owner, async () => { callbacks++; }, { maxWait }))
    .rejects.toMatchObject({ code: "P2028", meta: { phase: "transaction-start", maxWait } }));
  const shutdown = owner.client.$disconnect().then(() => { disconnected = true; });
  try {
    await expect(write(owner, async () => { callbacks++; })).rejects.toThrow("draining");
    await Promise.all(queued); expect(disconnected).toBe(false); expect(callbacks).toBe(0);
    expect(owner.events.acquired).toBe(acquired);
  } finally {
    release.resolve(); await head; await shutdown;
    await owner.client.$queryRaw`SELECT 1`; await owner.client.$disconnect();
    process.off("unhandledRejection", onUnhandled);
  }
  expect(owner.pools).toHaveLength(2); expect(callbacks).toBe(0); expect(unhandled).toEqual([]);
  observations.push({ check: "shutdown-reconnect", pools: owner.pools.length, lateCallbacks: callbacks, unhandled: unhandled.length });
}, 10_000);
