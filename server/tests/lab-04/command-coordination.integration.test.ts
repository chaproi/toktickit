import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { setTimeout as poll } from "node:timers/promises";
import { beforeAll, afterAll, expect, it } from "vitest";
import { Client } from "pg";
import { verifiedTestTarget, applyLab3Baseline, applyLaterMigrations, serverDirectory } from "./migration-test-fixtures.js";
import { ADMISSION_NAMESPACE } from "../../src/database/write-admission.js";

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
  } finally {
    for (const c of [a, b]) if (c.process.connected) c.process.send({ kind: "stop" });
    await until(() => [a, b].every(c => c.process.exitCode !== null), 5000);
  }
}, 15_000);
