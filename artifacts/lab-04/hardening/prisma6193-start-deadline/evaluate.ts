import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { setImmediate } from "node:timers/promises";
import pg from "pg";
import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { SqlDriverAdapterFactory } from "@prisma/driver-adapter-utils";
import { lockCurrentActor } from "./appsrc/auth/eligibility-transaction.js";
import { observe, structured, type Scope } from "./observe.js";
import { withReleaseRemedy } from "./remedy.js";
import { deadlineClient } from "./deadline.js";
import { deadlineChecks } from "./deadlines.js";
import { connectionConfiguration } from "./configuration.js";

// The barrier/release/await coordinator below is reused from the earlier proof;
// only public 6.19 adapter observation and failure evidence capture differ.
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Proof coordination deadline.")), 2000);
  })]); } finally { if (timer) clearTimeout(timer); }
}
const schema = process.env.EVAL_SCHEMA!;
assert.match(schema, /^issue49_start_[a-f0-9]{32}$/);
const report: Record<string, unknown> = { pairs: [] };
const scopes: Scope[] = [], acquired = new Set<pg.PoolClient>();
const independent = new pg.Client({ connectionString: process.env.EVAL_DATABASE_URL,
  options: `-c search_path=${schema}`, application_name: "issue49-start-observer" });
const config = { connectionString: process.env.EVAL_DATABASE_URL, options: `-c search_path=${schema}`,
  application_name: "issue49-start-adapter", max: 17, idleTimeoutMillis: 300000, connectionTimeoutMillis: 5000 };
// Matching current observed native max only; this is NOT a completed portable
// URL/acquisition/SSL mapping or authorization to change application settings.
let pool: pg.Pool | undefined, prisma: PrismaClient | undefined;
let phase = "connect", connected = false;
async function settings(client: PrismaClient) {
  return client.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const [row] = await tx.$queryRaw<Array<{ timezone: string; readOnly: string; schema: string; ssl: boolean }>>`
      SELECT current_schema()::text AS schema,current_setting('TimeZone') AS timezone,
        current_setting('transaction_read_only') AS "readOnly",
        COALESCE((SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),false) AS ssl`;
    assert.equal(row.schema, schema); return { timezone: row.timezone, readOnly: row.readOnly, ssl: row.ssl };
  });
}
async function pair(label: string, winner: 0 | 1) {
  phase = `${label}:setup`;
  const actors = await Promise.all([0, 1].map(index => prisma!.user.create({ data: {
    name: `Synthetic commit actor ${label} ${index}`, email: `${label}-${index}@commit-proof.invalid`,
    role: "IT_STAFF", passwordHash: "not-a-login-credential", mustChangePassword: true,
  } })));
  const categories = await Promise.all([0, 1].map(index => prisma!.category.create({ data: { name: `${label}-${index}` } })));
  const ready = [deferred(), deferred()], release = [deferred(), deferred()];
  const attempts: Array<{ backend: number; xid: string; callbackComplete: boolean }> = [];
  const beforeScopes = scopes.length;
  const pending = [0, 1].map(index => {
    const callback = async (tx: Prisma.TransactionClient) => {
      const [identity] = await tx.$queryRaw<Array<{ proofBackend: number; proofXid: string }>>`
        SELECT pg_backend_pid()::int AS "proofBackend", txid_current()::text AS "proofXid"`;
      assert.equal((await lockCurrentActor(tx, actors[index].id, "IT_STAFF"))?.id, actors[index].id);
      assert.equal((await tx.category.findMany({ where: { id: { in: categories.map(row => row.id) }, isActive: true } })).length, 2);
      await tx.category.update({ where: { id: categories[index].id }, data: { isActive: false } });
      await tx.relatedSystem.create({ data: { name: `staged-${label}-${index}` } });
      const [after] = await tx.$queryRaw<Array<{ backend: number; xid: string; isolation: string; staged: number }>>`
        SELECT pg_backend_pid()::int AS backend, txid_current()::text AS xid,
          current_setting('transaction_isolation') AS isolation,
          (SELECT count(*)::int FROM "RelatedSystem" WHERE name=${`staged-${label}-${index}`}) AS staged`;
      assert.equal(after.backend, identity.proofBackend); assert.equal(after.xid, identity.proofXid);
      assert.equal(after.isolation, "serializable"); assert.equal(after.staged, 1);
      attempts[index] = { backend: after.backend, xid: after.xid, callbackComplete: true };
      ready[index].resolve(); await bounded(release[index].promise); return index;
    };
    return prisma!.$transaction(callback, { isolationLevel: "Serializable" }).then(
      value => ({ ok: true as const, value }), error => ({ ok: false as const, error }));
  });
  try {
    await bounded(Promise.all(ready.map(item => item.promise)));
    assert.notEqual(attempts[0].backend, attempts[1].backend); assert.notEqual(attempts[0].xid, attempts[1].xid);
    phase = `${label}:winner-commit`;
    release[winner].resolve(); assert.equal((await bounded(pending[winner])).ok, true);
    phase = `${label}:loser-commit`;
    release[1 - winner].resolve(); const failed = await bounded(pending[1 - winner]); assert.equal(failed.ok, false);
    if (failed.ok) throw new Error("Unexpected successful loser.");
    const local = scopes.slice(beforeScopes);
    const loser = local.find(scope => scope.backend === attempts[1 - winner].backend)!;
    const win = local.find(scope => scope.backend === attempts[winner].backend)!;
    assert.ok(loser); assert.ok(win); assert.equal(local.length, 2);
    phase = `${label}:independent-state-and-release`;
    const persisted = await independent.query<{ id: number; isActive: boolean }>(
      'SELECT id,"isActive" FROM "Category" WHERE id=ANY($1::int[]) ORDER BY id', [categories.map(row => row.id)]);
    const staged = await independent.query<{ name: string }>('SELECT name FROM "RelatedSystem" WHERE name=ANY($1::text[])',
      [[`staged-${label}-0`, `staged-${label}-1`]]);
    const exactState = persisted.rows.find(row => row.id === categories[winner].id)?.isActive === false &&
      persisted.rows.find(row => row.id === categories[1 - winner].id)?.isActive === true &&
      staged.rows.length === 1 && staged.rows[0].name === `staged-${label}-${winner}`;
    const idle = await independent.query<{ n: number }>("SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid=ANY($1::int[]) AND state='idle in transaction'", [attempts.map(row => row.backend)]);
    const observation = { label, winner, callbacksCompleted: attempts.map(row => row.callbackComplete),
      distinctBackendsAndTransactions: true, sameConnectionOrmRawAndInheritedLock: true,
      nativeCommitState: loser.nativeCodes, applicationError: structured(failed.error),
      exactAdapterErrorObjectReachesAttempt: loser.error === failed.error,
      loserBackendAndXidAttributed: loser.xid === attempts[1 - winner].xid,
      winnerReleaseCalls: win.releaseCalls, loserReleaseCalls: loser.releaseCalls,
      checkedOutConnections: acquired.size, idleTransactions: idle.rows[0].n, independentExactState: exactState };
    (report.pairs as unknown[]).push(observation);
    assert.deepEqual(loser.nativeCodes, ["40001"]); assert.equal(loser.commitCalls, 1);
    assert.equal(structured(failed.error).state, "40001"); assert.equal(exactState, true);
    assert.equal(idle.rows[0].n, 0);
    // Essential lifecycle gate; if this fails, do NOT continue to other pairs,
    // patch release paths, retry or claim adoption. Owned leak is destroyed only
    // after pending promises drain, explicitly recorded in final cleanup.
    assert.equal(acquired.size, 0, "failed COMMIT must release its real pool connection");
    assert.equal(loser.releaseCalls, 1);
  } finally { release.forEach(item => item.resolve()); await Promise.all(pending); }
}
try {
  await independent.connect(); connected = true;
  phase = "used-configuration-and-raw-types";
  const candidateUrl = new URL(process.env.EVAL_DATABASE_URL!);
  candidateUrl.searchParams.set("schema", schema);
  candidateUrl.searchParams.set("application_name", "issue49-start-config");
  phase = "configuration-url-mapping";
  const mapped = connectionConfiguration(candidateUrl.href);
  assert.deepEqual(mapped.budgets, { max: 17, connectTimeoutMs: 5000, poolTimeoutMs: 10000, idleTimeoutMs: 300000, maxLifetimeSeconds: 0 });
  phase = "configuration-public-client-construction";
  const configured = deadlineClient({ adapter: withReleaseRemedy(new PrismaPg(mapped.pool, { schema: mapped.schema })) });
  const count = async () => (await independent.query<{ n: number }>("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name='issue49-start-config'")).rows[0].n;
  try {
    assert.equal(await count(), 0);
    phase = "configuration-first-read-only-settings";
    const first = await settings(configured.client);
    assert.equal(first.timezone, "Asia/Bangkok"); assert.equal(first.ssl, false); assert.equal(first.readOnly, "on");
    phase = "configuration-raw-scalars";
    const [scalars] = await configured.client.$queryRaw<Array<{ integer: number; big: bigint; decimal: Prisma.Decimal; timestamp: Date; json: unknown; status: string; bytes: Uint8Array }>>`
      SELECT 42::int AS integer,9007199254740993::bigint AS big,1.25::numeric AS decimal,
      '2026-11-01T12:34:56.789Z'::timestamptz AS timestamp,'{"safe":true}'::jsonb AS json,
      'PLANNED'::"ActionStatus" AS status,decode('00ff42','hex') AS bytes`;
    assert.equal(scalars.integer, 42); assert.equal(scalars.big, 9007199254740993n);
    assert.equal(scalars.decimal.toString(), "1.25"); assert.equal(scalars.timestamp.toISOString(), "2026-11-01T12:34:56.789Z");
    assert.deepEqual(scalars.json, { safe: true }); assert.equal(scalars.status, "PLANNED");
    assert.deepEqual([...scalars.bytes], [0,255,66]);
    phase = "configuration-public-instrumentation";
    const ordinary = configured.client.$transaction;
    let publicCalls = 0;
    Object.defineProperty(configured.client, "$transaction", { configurable: true, writable: true,
      value: (...args: unknown[]) => { publicCalls++; return Reflect.apply(ordinary, configured.client, args); } });
    await settings(configured.client); assert.equal(publicCalls, 1);
    phase = "configuration-disconnect";
    await configured.client.$disconnect(); assert.equal(await count(), 0);
    phase = "configuration-reconnect";
    assert.deepEqual(await settings(configured.client), first);
    await configured.client.$disconnect(); assert.equal(await count(), 0);
    report.configuration = { budgets: mapped.budgets, schema: "owned disposable schema", settings: first,
      actualLocalDefaultCoreCount: 8, explicitDecodedFields: true, lazy: true, disconnectReconnect: true,
      publicPassThroughInstrumentation: true, scalarChecks: ["int","bigint","numeric","timestamp","json","enum","bytes"],
      unsupportedOptionsRejected: ["unknown","repeated","remote implicit SSL","unmapped TLS","non-simple schema"] };
    for (const [key, value] of [["sslmode","require"],["unreviewed","1"]]) {
      const invalid = new URL(candidateUrl); invalid.searchParams.set(key,value);
      assert.throws(() => connectionConfiguration(invalid.href));
    }
  } finally { await configured.client.$disconnect(); }
  phase = "real-pool-startup-deadlines";
  report.deadlines = await deadlineChecks(process.env.EVAL_DATABASE_URL!, schema);
  phase = "real-commit-pairs";
  pool = new pg.Pool(config); pool.on("acquire", c => acquired.add(c)); pool.on("release", (_error, c) => acquired.delete(c));
  prisma = deadlineClient({ adapter: withReleaseRemedy(observe(new PrismaPg(pool, { schema }), scopes)), errorFormat: "minimal" }).client;
  await pair("remedy-first", 0);
  await pair("remedy-reversed", 1);


  phase = "real-callback-and-query-rollback";
  const controls = [];
  for (const kind of ["callback", "unique"]) {
    const existing = await prisma.category.create({ data: { name: `rollback-control-${kind}` } });
    const primary = new Error("Synthetic callback abort after real writes.");
    const beforeScope = scopes.length;
    let rejection: unknown;
    try {
      await prisma.$transaction(async tx => {
        await tx.relatedSystem.create({ data: { name: `rollback-staged-${kind}` } });
        if (kind === "callback") throw primary;
        await tx.category.create({ data: { name: existing.name } });
      });
    } catch (error) { rejection = error; }
    assert.ok(rejection);
    if (kind === "callback") assert.equal(rejection, primary);
    else assert.equal(structured(rejection).code, "P2002");
    assert.equal(await prisma.relatedSystem.count({ where: { name: `rollback-staged-${kind}` } }), 0);
    assert.equal(scopes.length - beforeScope, 1); assert.equal(scopes[beforeScope].releaseCalls, 1);
    assert.equal(acquired.size, 0);
    controls.push({ kind, error: structured(rejection), realStagedWritesRolledBack: true, releases: 1, checkedOutConnections: 0 });
  }
  report.rollbackControls = controls;
} catch (error) {
  report.failure = { phase, errorName: error instanceof Error ? error.name : "unknown", safeTypeError: error instanceof TypeError && /^[A-Za-z0-9 .$:_-]{1,180}$/.test(error.message) ? error.message : null, configurationFailure: error instanceof Error && ["Physical-core pool sizing could not be established.", "Candidate default pool sizing requires an explicit supported physical-core mapping."].includes(error.message) ? error.message : null, classification: structured(error), assertion: error instanceof assert.AssertionError ? error.message : null };
  process.exitCode = 1;
} finally {
  // Only after pair finally drained all promises; no production leak workaround.
  const leaked = acquired.size;
  for (const client of acquired) client.release(true);
  await prisma?.$disconnect(); if (pool) await pool.end();
  report.cleanup = { checkedOutBeforeForcedCleanup: leaked, destroyReleasedOnlyOwnedClients: leaked, poolEnded: Boolean(pool) };
  if (connected) await independent.end();
  await writeFile(process.env.EVAL_RESULT!, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
}
