// Standalone compatibility assessment, never imported by application/tests.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import pg from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { bindAdapter, type DriverAdapter } from "@prisma/driver-adapter-utils";
import { getPrisma } from "./appsrc/prisma.js";
import { configureTestDatabaseEnvironment } from "./appsrc/testing/test-database.js";

const result: Record<string, unknown> = {};
const native = getPrisma();
const live = new pg.Client({ connectionString: process.env.ASSESS_DATABASE_URL,
  application_name: "issue49-adoption-observer" });
const url = new URL(process.env.ASSESS_DATABASE_URL!);
const schema = url.searchParams.get("schema") ?? "public";
let pool: pg.Pool | undefined, adapterClient: PrismaClient | undefined, poolProbe: PrismaClient | undefined;
let phase = "connect", connected = false;
async function taggedConnections() {
  return (await live.query<{ n: number }>("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name LIKE 'issue49-adoption-%' AND pid<>pg_backend_pid()" )).rows[0].n;
}
async function configuration(client: PrismaClient) {
  return client.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const [state] = await tx.$queryRaw<Array<{ database: string; schema: string; timezone: string; ssl: boolean; readOnly: string }>>`
      SELECT current_database()::text AS database, current_schema()::text AS schema,
        current_setting('TimeZone') AS timezone,
        COALESCE((SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),false) AS ssl,
        current_setting('transaction_read_only') AS "readOnly"`;
    return state;
  });
}
try {
  await live.connect(); connected = true;
  phase = "native-lazy-guard-reconnect";
  assert.equal(await taggedConnections(), 0, "import/getter construction must not connect");
  assert.equal(native, getPrisma(), "existing singleton remains lazy and stable");
  const invalid = { ...process.env, TEST_DATABASE_URL: undefined };
  assert.throws(() => configureTestDatabaseEnvironment({ environment: invalid }));
  const before = await configuration(native);
  await native.$disconnect(); assert.equal(await taggedConnections(), 0);
  const after = await configuration(native);
  assert.deepEqual(after, before, "native singleton reconnect retains settings");
  await native.$disconnect(); assert.equal(await taggedConnections(), 0);
  result.nativeLifecycle = { noConnectionAtImportOrConstruction: true, sameGetterInstance: true,
    missingTestTargetRejected: true, disconnectReleasedConnections: true, reconnectSameSettings: true };

  phase = "native-pool-default-observation";
  let nativePoolMax: number | null = null;
  const probe = new PrismaClient({ log: [{ level: "info", emit: "event" }] });
  poolProbe = probe;
  probe.$on("info", event => {
    // Diagnostic pool capacity observation, never an error/retry classifier.
    const match = /^Starting a postgresql pool with (\d+) connections\.$/.exec(event.message);
    if (match) nativePoolMax = Number(match[1]);
  });
  await configuration(probe); await probe.$disconnect(); poolProbe = undefined;
  assert.ok(nativePoolMax !== null && nativePoolMax > 0, "actual native startup pool bound required");
  result.nativeObservedPoolMax = nativePoolMax;

  phase = "public-adapter-lifecycle-and-settings";
  // Only local, non-TLS feasibility is observed here. Fail closed for an
  // unreviewed connection variant rather than silently changing SSL/options.
  const keys = [...url.searchParams.keys()];
  assert.ok(keys.every(key => ["schema", "application_name"].includes(key)), "unreviewed local URL option");
  url.search = "";
  pool = new pg.Pool({ connectionString: url.href, application_name: "issue49-adoption-adapter",
    options: `-c search_path=${schema}`, max: nativePoolMax,
    idleTimeoutMillis: 300000, connectionTimeoutMillis: 5000 });
  // This pool is assessment-owned; its five-second combined pg limit is NOT
  // asserted equivalent to the native distinct connect and pool-wait budgets.
  assert.equal(pool.totalCount, 0);
  const official = new PrismaPg(pool, { schema });
  adapterClient = new PrismaClient({ adapter: official });
  assert.equal(pool.totalCount, 0, "adapter construction is also lazy");
  phase = "adapter-native-name-type-capability";
  const nameType = await official.queryRaw({ sql: "SELECT current_database()", args: [], argTypes: [] });
  result.nativeNameResultType = nameType.ok ? { accepted: true } : {
    accepted: false, kind: nameType.error.kind,
    type: nameType.error.kind === "UnsupportedNativeDataType" ? nameType.error.type : null };
  phase = "adapter-initial-configuration";
  const settings = await configuration(adapterClient);
  assert.equal(settings.database, before.database); assert.equal(settings.schema, before.schema);
  assert.equal(settings.timezone, before.timezone); assert.equal(settings.ssl, before.ssl);
  assert.equal(settings.readOnly, "on");
  const open = pool.totalCount; assert.ok(open > 0);
  phase = "adapter-first-disconnect";
  await adapterClient.$disconnect();
  const openAfterDisconnect = pool.totalCount;
  assert.equal(pool.ended, false, "official 5.22 adapter does not own external pool shutdown");
  assert.equal(openAfterDisconnect, open);
  phase = "adapter-reconnect-before-pool-end";
  assert.deepEqual(await configuration(adapterClient), settings);
  await adapterClient.$disconnect();
  phase = "adapter-reconnect-after-explicit-pool-end";
  await pool.end();
  let reconnectAfterEndRejected = false;
  try { await configuration(adapterClient); } catch { reconnectAfterEndRejected = true; }
  assert.equal(reconnectAfterEndRejected, true);
  await adapterClient.$disconnect(); adapterClient = undefined;
  result.adapterLifecycle = { lazy: true, effectiveMaxMatchesObservedNative: true,
    observedMax: nativePoolMax, poolOpenAfterPrismaDisconnect: openAfterDisconnect,
    poolEndedByPrismaDisconnect: false, reconnectBeforePoolEndWorks: true,
    callerOwnedPoolEndRequired: true, reconnectAfterPoolEndRejected: true };
  result.localSettings = { sameDatabaseAndSchema: true, timezone: settings.timezone,
    sslUsed: settings.ssl, readOnly: settings.readOnly, deploymentTlsVariantsTested: false };

  phase = "bounded-upstream-registry-retention";
  // NO PostgreSQL fault is synthesized here. This component probe measures the
  // public upstream JS-exception registry, without our feasibility Scope arrays.
  let serial = 0;
  const upstream = bindAdapter({ provider: "postgres", adapterName: "issue49-component-retention",
    queryRaw: async () => { throw new Error("Synthetic component probe only.", { cause: { code: "SYNTHETIC_COMPONENT", serial: serial++ } }); },
    executeRaw: async () => { throw new Error("Unused diagnostic path."); },
    transactionContext: async () => { throw new Error("Unused diagnostic path."); },
  } satisfies DriverAdapter);
  const batches: Array<{ generated: number; retainedAfterConsumption: number; retainedAfterRepeatedConsumption: number }> = [];
  for (let batch = 0; batch < 2; batch++) {
    for (let step = 0; step < 1000; step++) {
      const answer = await upstream.queryRaw({ sql: "COMPONENT_PROBE_NOT_SENT_TO_DATABASE", args: [], argTypes: [] });
      assert.equal(answer.ok, false);
      if (answer.ok || answer.error.kind !== "GenericJs") throw new Error("Expected public exception bridge.");
      assert.equal(answer.error.id, batch * 1000 + step);
      assert.ok(upstream.errorRegistry.consumeError(answer.error.id)?.error instanceof Error);
      // No strong Error, Result, Scope or callback array survives this iteration.
    }
    let retained = 0, retainedAgain = 0;
    for (let id = 0; id < serial; id++) {
      const record = upstream.errorRegistry.consumeError(id);
      if (record?.error instanceof Error) {
        assert.equal((record.error.cause as { serial: number }).serial, id); retained++;
      }
      if (upstream.errorRegistry.consumeError(id)?.error instanceof Error) retainedAgain++;
    }
    batches.push({ generated: serial, retainedAfterConsumption: retained, retainedAfterRepeatedConsumption: retainedAgain });
  }
  assert.equal(batches[0].retainedAfterConsumption, 1000);
  assert.equal(batches[1].retainedAfterConsumption, 2000);
  result.registry = { syntheticComponentOnly: true, diagnosticStrongErrorOrScopeArrays: 0,
    batches, publicClearOrDisposeMethodInRegistryInterface: false,
    heapBytesMeasured: false, productionLeakRateMeasured: false };
} catch (error) {
  const value = error as { code?: string; cause?: { code?: string; kind?: string }; meta?: { code?: string } };
  result.failure = { phase, assertion: error instanceof assert.AssertionError ? error.message : null,
    code: /^P\d{4}$/.test(value?.code ?? "") ? value.code : null,
    sqlState: /^[0-9A-Z]{5}$/.test(value?.cause?.code ?? value?.meta?.code ?? "") ? value.cause?.code ?? value.meta?.code : null };
  process.exitCode = 1;
} finally {
  await native.$disconnect(); await poolProbe?.$disconnect(); await adapterClient?.$disconnect();
  if (pool && !pool.ended) await pool.end();
  if (connected) {
    const remaining = await taggedConnections(); result.taggedConnectionsRemaining = remaining;
    if (remaining !== 0) process.exitCode = 1;
  }
  await live.end();
  await writeFile(process.env.ASSESS_RESULT!, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ assessmentPassed: !result.failure, registry: result.registry,
    nativeLifecycle: result.nativeLifecycle, adapterLifecycle: result.adapterLifecycle,
    localSettings: result.localSettings, failure: result.failure ?? null, taggedConnectionsRemaining: result.taggedConnectionsRemaining }));
}
