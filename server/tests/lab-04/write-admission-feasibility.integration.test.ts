import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { Client } from "pg";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { applyLab3Baseline, applyLaterMigrations, query, serverDirectory, verifiedTestTarget } from "./migration-test-fixtures.js";
import { makeAdmissionProofClient } from "./write-admission-proof-client.js";
import { ADMISSION_NAMESPACE, withWriteAdmission } from "./write-admission-proof-support.js";

const signal = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
async function until(check: () => Promise<boolean> | boolean, budget = 1500) {
  const start = performance.now();
  while (!(await check())) { if (performance.now() - start > budget) throw new Error("Observable admission condition was not reached."); await wait(10); }
}
const marker = `admission49-${randomUUID().slice(0, 8)}`;
const schema = `issue49_admission_${randomUUID().replaceAll("-", "")}`;
let native: Client, url: string, schemaKey: number;
const ownedChildren: ChildProcess[] = [], ownedClients: ReturnType<typeof makeAdmissionProofClient>[] = [];
const observations: Record<string, any>[] = [], extraSchemas: string[] = [];
const create = (name: string, one = false) => {
  const target = new URL(url); target.searchParams.set("application_name", `${marker}-${name}`);
  if (one) target.searchParams.set("connection_limit", "1"); // explicit held-pool proof only; production defaults unchanged
  const value = makeAdmissionProofClient(target.href); ownedClients.push(value); return value;
};
const lockCount = async (granted: boolean) => (await native.query<{ n: number }>(
  "SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory' AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND classid=$1::oid AND objid=$2::oid AND granted=$3", [ADMISSION_NAMESPACE, schemaKey >>> 0, granted])).rows[0].n;
beforeAll(async () => {
  const target = verifiedTestTarget(); native = new Client({ connectionString: target.databaseUrl }); await native.connect();
  expect((await native.query("SELECT current_database() AS db")).rows[0].db === target.identity.databaseName, "Guarded live identity matches; values withheld").toBe(true);
  await query(native, `CREATE SCHEMA "${schema}"`); await query(native, `SET search_path TO "${schema}"`);
  await applyLab3Baseline(native); await applyLaterMigrations(native);
  await query(native, 'CREATE TABLE "AdmissionProbe" (id integer PRIMARY KEY,value integer NOT NULL)');
  await query(native, 'INSERT INTO "AdmissionProbe" VALUES (1,0)');
  schemaKey = Number((await native.query("SELECT oid::text AS oid FROM pg_namespace WHERE nspname=$1", [schema])).rows[0].oid) | 0;
  const parsed = new URL(target.databaseUrl); parsed.searchParams.set("schema", schema); url = parsed.href;
}, 30_000);
afterAll(async () => {
  for (const child of ownedChildren) if (child.connected) child.send({ kind: "release" });
  for (const child of ownedChildren) if (child.connected) child.send({ kind: "stop" });
  await Promise.all(ownedClients.map(owner => owner.client.$disconnect()));
  await until(() => ownedChildren.every(child => child.exitCode !== null), 5000);
  expect(await lockCount(true)).toBe(0); expect(await lockCount(false)).toBe(0);
  expect((await native.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name LIKE $1", [`${marker}%`])).rows[0].n).toBe(0);
  for (const extra of extraSchemas) await query(native, `DROP SCHEMA "${extra}" CASCADE`);
  await query(native, `DROP SCHEMA "${schema}" CASCADE`); await native.end();
  const directory = resolve(serverDirectory, "../artifacts/lab-04/hardening"); mkdirSync(directory, { recursive: true });
  const filename = `write-admission-feasibility-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}.json`;
  writeFileSync(resolve(directory, filename), JSON.stringify({ mode: "public-interface-proof-not-application-GREEN", recordedAt: new Date().toISOString(),
    executionHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim(), observations,
    cleanup: { childrenExited: true, poolsDisconnected: true, grantedOrWaitingAdmissionLocks: 0, taggedConnections: 0, ownedSchemasRemoved: true } }, null, 2) + "\n", { flag: "wx" });
  console.info(`Admission feasibility artifact: ${filename}`);
}, 15_000);

function child() {
  const messages: any[] = [];
  const childUrl = new URL(url); childUrl.searchParams.set("application_name", `${marker}-child-${ownedChildren.length}`);
  const process = spawn(globalThis.process.execPath, ["--import", "tsx", resolve(serverDirectory, "tests/lab-04/write-admission-proof-child.ts")], {
    cwd: serverDirectory, windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: { ...globalThis.process.env, TEST_DATABASE_URL: childUrl.href, DATABASE_URL: childUrl.href, NODE_ENV: "test" },
  });
  process.on("message", value => { messages.push(value); }); ownedChildren.push(process);
  return { process, messages };
}

it("coordinates independent processes before snapshots and drains both checkouts", async () => {
  const first = child(), second = child();
  try {
    await until(() => first.messages.some(v => v.kind === "ready") && second.messages.some(v => v.kind === "ready"), 5000);
    first.process.send({ kind: "start" }); await until(() => first.messages.some(v => v.kind === "entered"), 4000);
    const old = first.messages.find(v => v.kind === "entered"); expect(old.isolation).toBe("serializable");
    second.process.send({ kind: "start" }); await until(async () => (await lockCount(false)) === 1);
    expect(second.messages.some(v => v.kind === "entered")).toBe(false);
    first.process.send({ kind: "release" }); await until(() => first.messages.some(v => v.kind === "complete"));
    await until(() => second.messages.some(v => v.kind === "entered"));
    expect(second.messages.find(v => v.kind === "entered").value).toBe(old.value + 1);
    second.process.send({ kind: "release" }); await until(() => second.messages.some(v => v.kind === "complete"));
    expect([...first.messages, ...second.messages].some(v => v.kind === "failed")).toBe(false);
    observations.push({ check: "cross-process", observedWaitingBeforeSecondCallback: true, secondSnapshotSawFirstCommit: true });
  } finally { if (first.process.connected) first.process.send({ kind: "stop" }); if (second.process.connected) second.process.send({ kind: "stop" }); }
}, 20_000);

it("bounds default and concurrent explicit admission waits while the external holder remains", async () => {
  const owner = create("deadlines"); let callbacks = 0;
  await native.query("SELECT pg_advisory_lock($1::integer,$2::integer)", [ADMISSION_NAMESPACE, schemaKey]);
  try {
    const start = performance.now();
    await expect(withWriteAdmission(() => owner.client.$transaction(async () => { callbacks++; }))).rejects.toMatchObject({ code: "P2028" });
    const elapsed = performance.now() - start; expect(elapsed).toBeGreaterThanOrEqual(1900); expect(elapsed).toBeLessThan(3000);
    await Promise.all([80, 130, 200].map(maxWait => withWriteAdmission(() => owner.client.$transaction(async () => { callbacks++; }, { maxWait }))
      .then(() => { throw new Error("Timed-out admission entered callback."); }, error => { expect(error).toMatchObject({ code: "P2028" }); })));
    await owner.drain(); expect(callbacks).toBe(0); expect(await lockCount(true)).toBe(1); expect(await lockCount(false)).toBe(0);
    await owner.client.$disconnect(); expect(owner.pools.at(-1)?.totalCount).toBe(0);
    observations.push({ check: "default-and-per-call-deadlines", defaultElapsedMs: elapsed, concurrentExplicitMs: [80,130,200], lateCallbacks: callbacks, checkedOut: 0 });
  } finally { await native.query("SELECT pg_advisory_unlock($1::integer,$2::integer)", [ADMISSION_NAMESPACE, schemaKey]); }
}, 15_000);

it("shares pool/admission startup budget and drains late checkout without a late callback", async () => {
  const owner = create("pool", true), entered = signal(), release = signal(); let callbacks = 0;
  const holder = owner.client.$transaction(async tx => { await tx.$queryRaw`SELECT 1`; entered.resolve(); await release.promise; });
  await entered.promise;
  try {
    const call = withWriteAdmission(() => owner.client.$transaction(async () => { callbacks++; }, { maxWait: 100 }));
    const rejection = expect(call).rejects.toMatchObject({ code: "P2028" });
    await until(() => owner.pools[0].waitingCount === 1); await rejection;
    expect(callbacks).toBe(0);
    const shutdown = owner.client.$disconnect(); release.resolve(); await holder; await shutdown;
    expect(callbacks).toBe(0); expect(owner.pools[0].totalCount).toBe(0);
    await owner.client.$queryRaw`SELECT 1`; await owner.client.$disconnect(); expect(owner.pools).toHaveLength(2);
    observations.push({ check: "late-checkout-and-reconnect", lateCallbacks: callbacks, checkedOut: 0, freshPools: owner.pools.length });
  } finally { release.resolve(); await holder; }
}, 10_000);

it("keeps execution timeout separate and holds admission until an expired callback drains", async () => {
  const owner = create("execution"), entered = signal(), release = signal(); let backend = 0;
  const work = withWriteAdmission(() => owner.client.$transaction(async tx => {
    backend = (await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid()::int AS pid`)[0].pid;
    entered.resolve(); await release.promise;
  }, { maxWait: 1000, timeout: 100 }));
  const rejected = expect(work).rejects.toMatchObject({ code: "P2028" });
  try {
    await entered.promise;
    await until(async () => (await native.query("SELECT xact_start IS NULL AS idle FROM pg_stat_activity WHERE pid=$1", [backend])).rows[0]?.idle === true);
    expect(await lockCount(true)).toBe(1);
    release.resolve(); await rejected; await owner.drain(); expect(await lockCount(true)).toBe(0);
    observations.push({ check: "execution-timeout", admissionHeldWhileExpiredCallbackUndrained: true, releasedAfterDrain: true });
  } finally { release.resolve(); await work.catch(() => {}); }
}, 10_000);

it("does not add a fresh admission allowance after pool waiting", async () => {
  const owner = create("cumulative", true), entered = signal(), release = signal(), doWork = signal();
  const holder = owner.client.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1`; entered.resolve(); await doWork.promise;
    // Deliberate phase-time experiment, not readiness by sleep: real200ms DB
    // work consumes part of the same400ms startup allowance while pool-held.
    await tx.$executeRaw`SELECT pg_sleep(0.2)`; await release.promise;
  });
  await entered.promise; await native.query("SELECT pg_advisory_lock($1::integer,$2::integer)", [ADMISSION_NAMESPACE,schemaKey]);
  try {
    let callbacks = 0; const start = performance.now();
    const call = withWriteAdmission(() => owner.client.$transaction(async () => { callbacks++; }, { maxWait: 400 }));
    const rejection = expect(call).rejects.toMatchObject({ code: "P2028" });
    await until(() => owner.pools[0].waitingCount === 1); doWork.resolve(); release.resolve(); await holder;
    await until(async () => (await lockCount(false)) === 1); await rejection;
    const elapsed = performance.now() - start; expect(elapsed).toBeGreaterThanOrEqual(380); expect(elapsed).toBeLessThan(550);
    await owner.drain(); expect(callbacks).toBe(0);
    observations.push({ check: "cumulative-startup", configuredMs: 400, observedMs: elapsed, extraAllowanceGranted: false });
  } finally { doWork.resolve(); release.resolve(); await holder; await native.query("SELECT pg_advisory_unlock($1::integer,$2::integer)",[ADMISSION_NAMESPACE,schemaKey]); }
}, 10_000);

it("keeps reads and another schema independent; execution may exceed maxWait after startup", async () => {
  const owner = create("independence"), entered = signal(), release = signal();
  const holder = withWriteAdmission(() => owner.client.$transaction(async tx => { await tx.$queryRaw`SELECT 1`; entered.resolve(); await release.promise; }));
  await entered.promise;
  try {
    expect((await owner.client.$queryRaw<Array<{ value: number }>>`SELECT value FROM "AdmissionProbe" WHERE id=1`)).toHaveLength(1);
    const extra = `issue49_admission_${randomUUID().replaceAll("-", "")}`;
    await query(native, `CREATE SCHEMA "${extra}"`); extraSchemas.push(extra);
    const otherUrl = new URL(url); otherUrl.searchParams.set("schema", extra); otherUrl.searchParams.set("application_name",`${marker}-other-schema`);
    const other = makeAdmissionProofClient(otherUrl.href); ownedClients.push(other);
    await withWriteAdmission(() => other.client.$transaction(async tx => { await tx.$queryRaw`SELECT 1`; }, { maxWait: 200, isolationLevel: "Serializable" }));
  } finally { release.resolve(); await holder; }
  const before = { ...owner.events };
  await withWriteAdmission(() => owner.client.$transaction(async tx => { await tx.$executeRaw`SELECT pg_sleep(0.15)`; }, { maxWait: 80, timeout: 5000 }));
  expect(owner.events.acquired - before.acquired).toBe(1); expect(owner.events.released - before.released).toBe(1);
  observations.push({ check: "scope-and-budget-separation", readsAdmitted: false, anotherSchemaProceeds: true, executionMs: 150, maxWaitMs: 80, onePhysicalRelease: true });
}, 10_000);

it("releases once on callback/query failure and preserves a primary error if unlock cleanup fails", async () => {
  const owner = create("failures"), sentinel = new Error("Synthetic primary callback failure");
  await owner.client.$queryRaw`SELECT 1`; const before = { ...owner.events };
  await expect(withWriteAdmission(() => owner.client.$transaction(async () => { throw sentinel; }))).rejects.toBe(sentinel);
  await expect(withWriteAdmission(() => owner.client.$transaction(async tx => { await tx.$executeRaw`INSERT INTO "AdmissionProbe" VALUES(1,9)`; })))
    .rejects.toMatchObject({ code: "P2010", meta: { code: "23505" } });
  expect(owner.events.acquired - before.acquired).toBe(2); expect(owner.events.released - before.released).toBe(2);
  let injected = false;
  const original = Client.prototype.query;
  const spy = vi.spyOn(Client.prototype, "query").mockImplementation(function(this: Client, ...args: any[]) {
    if (!injected && typeof args[0] === "string" && args[0].startsWith("SELECT pg_advisory_unlock")) {
      injected = true; throw new Error("Synthetic secondary cleanup failure");
    }
    return Reflect.apply(original,this,args);
  } as Client["query"]);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const fault = create("cleanup-fault");
  try {
    await expect(withWriteAdmission(() => fault.client.$transaction(async () => { throw sentinel; }))).rejects.toBe(sentinel);
    expect(injected).toBe(true); expect(log).toHaveBeenCalledWith("Write admission cleanup encountered a secondary failure.", { stage: "owned-checkout" });
    expect(fault.events.acquired).toBe(1); expect(fault.events.released).toBe(1); expect(await lockCount(true)).toBe(0);
  } finally { spy.mockRestore(); log.mockRestore(); }
  observations.push({ check: "failure-cleanup", callbackPrimaryPreserved: true, uniquenessNot40001: true, syntheticCleanupFault: true, physicalReleasePerCheckout: 1 });
}, 10_000);

it("fails safely on real ownership-connection loss and cannot write after backend abort", async () => {
  const owner = create("lost"), entered = signal(), release = signal(); let backend = 0;
  const name = `aborted-${randomUUID()}`;
  const work = withWriteAdmission(() => owner.client.$transaction(async tx => {
    await tx.category.create({ data: { name } });
    backend = (await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid()::int AS pid`)[0].pid;
    entered.resolve(); await release.promise;
    await tx.category.create({ data: { name: `${name}-late` } });
  }));
  let rejected = false; const observed = work.catch(error => { rejected = true; expect(error?.code).not.toBe("40001"); });
  try {
    await entered.promise;
    expect((await native.query("SELECT pg_terminate_backend($1) AS stopped",[backend])).rows[0].stopped).toBe(true);
    await until(async () => (await native.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid=$1",[backend])).rows[0].n === 0);
    release.resolve(); await observed; expect(rejected).toBe(true);
    expect((await native.query('SELECT count(*)::int AS n FROM "Category" WHERE name=ANY($1::text[])',[[name,`${name}-late`]])).rows[0].n).toBe(0);
    expect(await lockCount(true)).toBe(0);
    observations.push({ check: "ownership-loss", actualBackendTerminated: true, originalTransactionAborted: true, lateWritePersisted: false, successReturned: false });
  } finally { release.resolve(); await work.catch(() => {}); }
}, 10_000);

it("preserves constructor/override budgets and restored session settings with ORM/raw on one connection", async () => {
  const parsed = new URL(url); parsed.searchParams.set("connection_limit", "1"); parsed.searchParams.set("application_name",`${marker}-options`);
  const owner = makeAdmissionProofClient(parsed.href, { transactionOptions: { maxWait: 100, timeout: 5000 } }); ownedClients.push(owner);
  await native.query("SELECT pg_advisory_lock($1::integer,$2::integer)",[ADMISSION_NAMESPACE,schemaKey]);
  try {
    await expect(withWriteAdmission(() => owner.client.$transaction(async () => { throw new Error("Expired constructor callback ran."); })))
      .rejects.toMatchObject({ code: "P2028", meta: { maxWait: 100 } });
    await expect(withWriteAdmission(() => owner.client.$transaction(async () => { throw new Error("Expired override callback ran."); }, { maxWait: 200 })))
      .rejects.toMatchObject({ code: "P2028", meta: { maxWait: 200 } });
    await owner.drain();
  } finally { await native.query("SELECT pg_advisory_unlock($1::integer,$2::integer)",[ADMISSION_NAMESPACE,schemaKey]); }
  await owner.client.$executeRaw`SELECT set_config('statement_timeout','3200',false)`;
  const prior = (await owner.client.$queryRaw<Array<{ statement_timeout: string }>>`SHOW statement_timeout`)[0].statement_timeout;
  const name = `same-transaction-${randomUUID()}`;
  const row = await withWriteAdmission(() => owner.client.$transaction(async tx => {
    const category = await tx.category.create({ data: { name } });
    const [read] = await tx.$queryRaw<Array<{ backend: number; name: string }>>`
      SELECT pg_backend_pid()::int AS backend,name FROM "Category" WHERE id=${category.id}`;
    expect(read.name).toBe(name);
    expect((await native.query('SELECT count(*)::int AS n FROM "Category" WHERE id=$1',[category.id])).rows[0].n).toBe(0);
    expect((await native.query("SELECT count(*)::int AS n FROM pg_locks WHERE pid=$1 AND locktype='advisory' AND classid=$2::oid AND granted",[read.backend,ADMISSION_NAMESPACE])).rows[0].n).toBe(1);
    expect((await tx.$queryRaw<Array<{ statement_timeout: string }>>`SHOW statement_timeout`)[0].statement_timeout).toBe(prior);
    return category;
  }));
  expect((await native.query('SELECT count(*)::int AS n FROM "Category" WHERE id=$1',[row.id])).rows[0].n).toBe(1);
  observations.push({ check: "constructor-and-ORM-raw", constructorMaxWaitMs: 100, overrideMs: 200, settingsRestoredBeforeBegin: true, sameTransactionAndBackend: true });
}, 10_000);

it("transports genuine COMMIT40001 against an independent native participant and releases admission", async () => {
  const owner = create("commit"), read = signal(), write = signal(), body = signal(), finish = signal();
  const names = [0,1].map(n => `native-participant-${randomUUID()}-${n}`);
  const rows: Array<{ id: number }> = [];
  for (const name of names) rows.push(await owner.client.category.create({ data: { name } }));
  await native.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  await native.query('SELECT id FROM "Category" WHERE id=ANY($1::integer[])',[rows.map(row => row.id)]);
  let active = true;
  const work = withWriteAdmission(() => owner.client.$transaction(async tx => {
    expect(await tx.category.findMany({ where: { id: { in: rows.map(row => row.id) } } })).toHaveLength(2);
    read.resolve(); await write.promise;
    await tx.category.update({ where: { id: rows[0].id }, data: { isActive: false } }); body.resolve(); await finish.promise;
  }, { isolationLevel: "Serializable" }));
  const rejected = expect(work).rejects.toMatchObject({ code: "40001" });
  void rejected.catch(() => {});
  const premature = work.then(() => { throw new Error("Proof operation completed before its designated COMMIT boundary."); },
    () => { throw new Error("Proof operation rejected before its designated COMMIT boundary."); });
  try {
    await Promise.race([read.promise, premature]);
    await native.query('UPDATE "Category" SET "isActive"=false WHERE id=$1',[rows[1].id]); write.resolve();
    await Promise.race([body.promise, premature]); await native.query("COMMIT"); active = false; finish.resolve(); await rejected;
    expect(await owner.client.category.findUniqueOrThrow({ where: { id: rows[0].id } })).toMatchObject({ isActive: true });
    expect(await owner.client.category.findUniqueOrThrow({ where: { id: rows[1].id } })).toMatchObject({ isActive: false });
    expect(await lockCount(true)).toBe(0); expect(owner.pendingCount()).toBe(0);
    observations.push({ check: "genuine-COMMIT40001", nativeParticipantNotAdmitted: true, bothBodiesCompleted: true, loserRollbackExact: true, lockReleased: true });
  } finally { write.resolve(); finish.resolve(); if (active) await native.query("ROLLBACK"); await work.catch(() => {}); }
}, 15_000);

it("does not inherit writer admission into an unrelated read transaction inside a callback", async () => {
  const owner = create("nested-read");
  await withWriteAdmission(() => owner.client.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1`;
    const result = await owner.client.$transaction(async read => {
      await read.$executeRaw`SET TRANSACTION READ ONLY`;
      return read.$queryRaw<Array<{ value: number }>>`SELECT value FROM "AdmissionProbe" WHERE id=1`;
    }, { isolationLevel: "RepeatableRead", maxWait: 150 });
    expect(result).toHaveLength(1);
  }, { isolationLevel: "Serializable" }));
  expect(await lockCount(true)).toBe(0);
  observations.push({ check: "nested-unrelated-read", inheritedAdmission: false, readSucceededWhileWriterHeld: true });
}, 10_000);
