import assert from "node:assert/strict";
import pg from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient as NativePrismaClient } from "__NATIVE_CLIENT__";
import { withReleaseRemedy } from "./remedy.js";

const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
export async function acquisitionBudget(databaseUrl: string, schema: string) {
  const nativeUrl = new URL(databaseUrl);
  nativeUrl.searchParams.set("schema", schema); nativeUrl.searchParams.set("connection_limit", "1");
  nativeUrl.searchParams.set("connect_timeout", "5"); nativeUrl.searchParams.set("pool_timeout", "10");
  nativeUrl.searchParams.set("application_name", "issue49-release-native-budget");
  class ConnectBudgetClient extends pg.Client {
    constructor(config: pg.ClientConfig = {}) { super({ ...config, connectionTimeoutMillis: 5000 }); }
  }
  const pool = new pg.Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}`,
    application_name: "issue49-release-budget", max: 1, connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 300000, Client: ConnectBudgetClient });
  const native = new NativePrismaClient({ datasources: { db: { url: nativeUrl.href } } });
  const candidate = new PrismaClient({ adapter: withReleaseRemedy(new PrismaPg(pool, { schema })) });
  const observations: unknown[] = [];
  // Same coordination for both client APIs without casting transaction objects.
  async function scenario(label: string, hold: (entered: () => void, wait: Promise<void>) => Promise<unknown>,
    second: (called: () => void) => Promise<unknown>) {
    const entered = deferred(), release = deferred();
    const holding = hold(entered.resolve, release.promise);
    await entered.promise;
    let settled = false, callbackCalled = false;
    const begin = performance.now();
    const pending = second(() => { callbackCalled = true; }).then(
      () => { settled = true; return { ok: true, elapsedMs: performance.now() - begin, code: null }; },
      error => { settled = true; return { ok: false, elapsedMs: performance.now() - begin,
        code: typeof error?.code === "string" && /^P\d{4}$/.test(error.code) ? error.code : null }; });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let beforeRelease: boolean;
    try {
      // Time-budget observation, not sleep to make a business race pass.
      await new Promise<void>(resolve => { timer = setTimeout(resolve, 2500); });
      beforeRelease = settled;
    } finally { if (timer) clearTimeout(timer); release.resolve(); }
    const outcome = await pending; await holding;
    const observation = { label, defaultMaxWaitMs: 2000, defaultTimeoutMs: 5000,
      observationDeadlineMs: 2500, settledBeforeReleasingHeldConnection: beforeRelease!,
      callbackCalled, outcome };
    observations.push(observation);
    return beforeRelease!;
  }
  try {
    const control = await scenario("native5.22 control",
      (entered, wait) => native.$transaction(async tx => { await tx.$queryRaw`SELECT 1`; entered(); await wait; }),
      called => native.$transaction(async tx => { called(); await tx.$queryRaw`SELECT 1`; }));
    assert.equal(control, true, "native control must enforce current acquisition budget");
    const proposed = await scenario("candidate6.19.3 public release remedy",
      (entered, wait) => candidate.$transaction(async tx => { await tx.$queryRaw`SELECT 1`; entered(); await wait; }),
      called => candidate.$transaction(async tx => { called(); await tx.$queryRaw`SELECT 1`; }));
    return { observations, preservesDefaultAcquisitionDeadline: proposed,
      configuredConnectBudgetMs: 5000, configuredPoolWaitBudgetMs: 10000,
      noApplicationBudgetOverrides: true };
  } finally { await native.$disconnect(); await candidate.$disconnect(); await pool.end(); }
}
