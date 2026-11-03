import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { setTimeout as poll } from "node:timers/promises";
import { beforeAll, afterAll, expect, it } from "vitest";
import { Client } from "pg";
import { verifiedTestTarget, applyLab3Baseline, applyLaterMigrations, serverDirectory } from "./migration-test-fixtures.js";
import { ADMISSION_NAMESPACE } from "../../src/database/write-admission.js";
import { withCommandCoordination } from "../../src/database/write-admission.js";
import { makeAdmissionProofClient } from "./write-admission-proof-client.js";

const schema = `issue49_commands_${randomUUID().replaceAll("-", "")}`;
let native: Client, url: string;
const children: ChildProcess[] = [];
async function until(check: () => boolean | Promise<boolean>, budget = 3000) {
  const start = performance.now(); while (!await check()) { if (performance.now() - start > budget) throw new Error("Owned command observation did not arrive"); await poll(5); }
}
beforeAll(async () => {
  const target = verifiedTestTarget(); native = new Client({ connectionString: target.databaseUrl }); await native.connect();
  expect((await native.query("SELECT current_database() AS db")).rows[0].db === target.identity.databaseName, "Guarded dedicated live identity; values withheld").toBe(true);
  await native.query(`CREATE SCHEMA "${schema}"`); await native.query(`SET search_path TO "${schema}"`);
  await applyLab3Baseline(native); await applyLaterMigrations(native);
  await native.query('CREATE TABLE "CommandProbe" (id int PRIMARY KEY,value int NOT NULL)');
  await native.query('INSERT INTO "CommandProbe" VALUES (1,0),(2,0)');
  const scoped = new URL(target.databaseUrl); scoped.searchParams.set("schema", schema); url = scoped.href;
}, 30_000);
afterAll(async () => {
  for (const child of children) if (child.connected) child.send({ kind: "stop" });
  await until(() => children.every(child => child.exitCode !== null), 5000);
  expect((await native.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name LIKE $1", [`commands-${schema}%`])).rows[0].n).toBe(0);
  await native.query(`DROP SCHEMA "${schema}" CASCADE`); await native.end();
});
function child() {
  const messages: any[] = [], target = new URL(url); target.searchParams.set("application_name", `commands-${schema}-${children.length}`);
  const process = spawn(globalThis.process.execPath, ["--import", "tsx", resolve(serverDirectory, "tests/lab-04/command-coordination-child.ts")], {
    windowsHide: true, cwd: serverDirectory, stdio: ["ignore", "pipe", "pipe", "ipc"], env: { ...globalThis.process.env, NODE_ENV: "test", DATABASE_URL: target.href, TEST_DATABASE_URL: target.href },
  }); process.on("message", message => messages.push(message)); children.push(process); return { process, messages };
}
it.each([false, true])("actual cross-process command overlap and exclusion; shared=%s", async shared => {
  const before = (await native.query('SELECT * FROM "CommandProbe" ORDER BY id')).rows;
  const a = child(), b = child();
  try {
    await until(() => a.messages.some(m => m.kind === "ready") && b.messages.some(m => m.kind === "ready"));
    a.process.send({ kind: "start", resource: 1 }); await until(() => a.messages.some(m => m.kind === "entered"));
    b.process.send({ kind: "start", resource: shared ? 1 : 2 });
    // A stable observed waiter is the old protocol's semantic RED, not a
    // barrier timeout. A disjoint new command must enter while A is held.
    await until(async () => b.messages.some(m => m.kind === "entered") || (await native.query(`SELECT count(*)::int AS n FROM pg_locks
      WHERE locktype='advisory' AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())
      AND classid=ANY($1::oid[])`, [[ADMISSION_NAMESPACE, 1, 2]])).rows[0].n > 0);
    expect(b.messages.some(m => m.kind === "entered")).toBe(!shared);
    a.process.send({ kind: "release" }); await until(() => a.messages.some(m => m.kind === "complete"));
    await until(() => b.messages.some(m => m.kind === "entered"));
    expect(b.messages.find(m => m.kind === "entered").isolation).toBe("read committed");
    expect(a.messages.find(m => m.kind === "entered").backend).not.toBe(b.messages.find(m => m.kind === "entered").backend);
    b.process.send({ kind: "release" }); await until(() => b.messages.some(m => m.kind === "complete"));
    expect([...a.messages, ...b.messages].some(m => m.kind === "failed")).toBe(false);
    expect((await native.query('SELECT * FROM "CommandProbe" ORDER BY id')).rows).toEqual(before.map(row =>
      ({ ...row, value: row.value + (shared ? row.id === 1 ? 2 : 0 : 1) })));
  } finally {
    for (const c of [a, b]) if (c.process.connected) c.process.send({ kind: "stop" });
    await until(() => [a, b].every(c => c.process.exitCode !== null), 5000);
  }
}, 15_000);

it("partial resource acquisition expires once, releases its earlier keys and never enters business", async () => {
  const owner = makeAdmissionProofClient(url); let callbacks = 0;
  await native.query("SELECT pg_advisory_lock(1,99)");
  try {
    await expect(withCommandCoordination({ keys: [{ scope: 1, id: 98 }, { scope: 1, id: 99 }] }, () =>
      owner.client.$transaction(async () => { callbacks++; }, { isolationLevel: "ReadCommitted", maxWait: 150 }))).rejects.toMatchObject({ code: "P2028" });
    await owner.drain(); expect(callbacks).toBe(0);
    expect((await native.query("SELECT pg_try_advisory_lock(1,98) AS acquired")).rows[0].acquired).toBe(true);
    await native.query("SELECT pg_advisory_unlock(1,98)");
    expect(owner.events.acquired).toBe(owner.events.released);
    expect(owner.pools.every(p => p.totalCount === p.idleCount)).toBe(true);
  } finally { await native.query("SELECT pg_advisory_unlock(1,99)"); await owner.client.$disconnect(); }
});

it("maintenance shared peers overlap but exclusive maintenance waits under its original deadline", async () => {
  const a = makeAdmissionProofClient(url), b = makeAdmissionProofClient(url);
  let release!: () => void, ready!: () => void, exclusiveCallbacks = 0;
  const held = new Promise<void>(r => { release = r; }), entered = new Promise<void>(r => { ready = r; });
  const first = withCommandCoordination({ keys: [] }, () => a.client.$transaction(async () => { ready(); await held; }, { isolationLevel: "ReadCommitted" }));
  try {
    await entered;
    expect(await withCommandCoordination({ keys: [] }, () => b.client.$transaction(async tx => {
      const [row] = await tx.$queryRaw<Array<{ value: number }>>`SELECT 17::int AS value`; return row.value;
    }, { isolationLevel: "ReadCommitted", maxWait: 150 }))).toBe(17);
    await expect(withCommandCoordination({ keys: [], maintenance: "exclusive" }, () => b.client.$transaction(async () => { exclusiveCallbacks++; },
      { isolationLevel: "ReadCommitted", maxWait: 150 }))).rejects.toMatchObject({ code: "P2028" });
    await b.drain(); expect(exclusiveCallbacks).toBe(0);
    release(); await first;
    expect(await withCommandCoordination({ keys: [], maintenance: "exclusive" }, () => b.client.$transaction(async () => "exclusive-after-shared", { isolationLevel: "ReadCommitted" }))).toBe("exclusive-after-shared");
  } finally { release(); await first.catch(() => {}); await a.client.$disconnect(); await b.client.$disconnect(); }
});

it("late checkout drains without callback and a reconnect does not revive the expired footprint", async () => {
  const scoped = new URL(url); scoped.searchParams.set("connection_limit", "1"); const owner = makeAdmissionProofClient(scoped.href);
  let ready!: () => void, release!: () => void, callbacks = 0;
  const entered = new Promise<void>(r => { ready = r; }), held = new Promise<void>(r => { release = r; });
  const first = owner.client.$transaction(async () => { ready(); await held; });
  try {
    await entered;
    await expect(withCommandCoordination({ keys: [{ scope: 1, id: 97 }] }, () => owner.client.$transaction(async () => { callbacks++; },
      { isolationLevel: "ReadCommitted", maxWait: 80 }))).rejects.toMatchObject({ code: "P2028" });
    expect(callbacks).toBe(0); release(); await first; await owner.drain();
    expect(callbacks).toBe(0); expect(owner.events.acquired).toBe(owner.events.released);
    await owner.client.$disconnect(); await owner.client.$connect();
    expect(await withCommandCoordination({ keys: [{ scope: 1, id: 97 }] }, () => owner.client.$transaction(async () => "fresh", { isolationLevel: "ReadCommitted" }))).toBe("fresh");
    expect(callbacks).toBe(0);
  } finally { release(); await first.catch(() => {}); await owner.client.$disconnect(); }
});

it("execution expiry retains all resource ownership until the entered callback drains", async () => {
  const owner = makeAdmissionProofClient(url); let release!: () => void, ready!: () => void;
  let backend = 0, settled = false;
  const held = new Promise<void>(r => { release = r; }), entered = new Promise<void>(r => { ready = r; });
  const work = withCommandCoordination({ keys: [{ scope: 1, id: 96 }] }, () => owner.client.$transaction(async tx => {
    backend = (await tx.$queryRaw<Array<{ id: number }>>`SELECT pg_backend_pid()::int AS id`)[0].id; ready(); await held;
  },
    { isolationLevel: "ReadCommitted", timeout: 80 }));
  const outcome = work.then(() => { settled = true; return undefined; }, error => { settled = true; return error; });
  try {
    await entered;
    await until(async () => (await native.query("SELECT xact_start IS NULL AS rolled_back FROM pg_stat_activity WHERE pid=$1", [backend])).rows[0]?.rolled_back);
    expect(settled).toBe(false);
    expect((await native.query("SELECT pg_try_advisory_lock(1,96) AS acquired")).rows[0].acquired).toBe(false);
    release(); expect(await outcome).toMatchObject({ code: "P2028" }); await owner.drain();
    expect((await native.query("SELECT pg_try_advisory_lock(1,96) AS acquired")).rows[0].acquired).toBe(true);
    await native.query("SELECT pg_advisory_unlock(1,96)");
    expect(owner.events.acquired).toBe(owner.events.released);
  } finally { release(); await owner.drain(); await owner.client.$disconnect(); }
});
