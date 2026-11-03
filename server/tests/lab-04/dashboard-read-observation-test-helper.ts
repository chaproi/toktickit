import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";
import { Client, type PoolClient } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { createPrismaClient } from "../../src/prisma-client.js";
import * as clients from "../../src/prisma.js";
import { safePlan } from "./performance-test-helpers.js";

type Frame = { label: string; started: number; business: boolean; callbackAt?: number;
  callbackEnd?: number; transactionAt?: number; transactionEnd?: number;
  checkouts: Array<{ start: number; elapsed: number; business: boolean }>;
  queries: Array<{ business: boolean; elapsed: number; category: string; aggregate: boolean }> };

// Public pass-through pg/client seams only. SQL/parameters stay private and are
// used solely for actual EXPLAIN after traffic. No results/tokens are replaced.
export function observeDashboardReads() {
  const context = new AsyncLocalStorage<Frame>();
  const frames: Frame[] = [], captures: Array<{ sql: string; values: unknown[] }> = [];
  const assigned = new WeakMap<Client, Frame>();
  const restores: Array<() => void> = [];
  const connect = PrismaPg.prototype.connect;
  const adapter = vi.spyOn(PrismaPg.prototype, "connect").mockImplementation(async function(this: PrismaPg) {
    const result = await connect.call(this), pool = result.underlyingDriver(), checkout = pool.connect.bind(pool);
    pool.connect = ((...args: any[]) => {
      const frame = context.getStore(), began = performance.now(), business = frame?.business ?? false;
      const acquired = (client: PoolClient) => {
        assigned.delete(client); if (frame) {
          assigned.set(client, frame); frame.checkouts.push({ start: began - frame.started, elapsed: performance.now() - began, business });
        }
        return client;
      };
      if (typeof args[0] === "function") return checkout((error, client, release) => {
        if (client) acquired(client); args[0](error, client, release);
      });
      return checkout().then(acquired);
    }) as typeof pool.connect;
    pool.on("release", (_error, client) => assigned.delete(client));
    return result;
  });
  restores.push(() => adapter.mockRestore());
  const query = Client.prototype.query;
  const queries = vi.spyOn(Client.prototype, "query").mockImplementation(function(this: Client, ...args: any[]) {
    const frame = context.getStore() ?? assigned.get(this);
    const input = args[0], sql = typeof input === "string" ? input : input?.text;
    const values = (typeof input === "object" ? input.values : args[1]) ?? [];
    const business = frame?.business ?? false, began = performance.now();
    const category = typeof sql !== "string" ? "unknown" : /^\s*(BEGIN|COMMIT|ROLLBACK|SET|SHOW)/i.test(sql) ? "control"
      : sql.includes('CURRENT_TIMESTAMP AS "asOf"') ? "clock"
      : sql.includes('"AuthSession"') ? "session" : sql.includes('"Ticket"') || sql.includes('"Action"') ? "domain" : "identity";
    const aggregate = typeof sql === "string" && /\b(COUNT|GROUP BY)\b/i.test(sql);
    const finished = () => { if (frame) frame.queries.push({ business, elapsed: performance.now() - began, category, aggregate }); };
    if (frame && business && category === "domain" && typeof sql === "string" && /^\s*(SELECT|WITH)/i.test(sql)) captures.push({ sql, values });
    const callback = args.findIndex(value => typeof value === "function");
    if (callback >= 0) { const original = args[callback]; args[callback] = (...result: any[]) => { finished(); return original(...result); }; return Reflect.apply(query, this, args); }
    return Reflect.apply(query, this, args).then((value: unknown) => { finished(); return value; }, (error: unknown) => { finished(); throw error; });
  });
  restores.push(() => queries.mockRestore());
  const db = createPrismaClient();
  const transaction = db.$transaction.bind(db);
  const tx = vi.spyOn(db, "$transaction").mockImplementation((...args: any[]) => {
    const frame = context.getStore();
    if (!frame || typeof args[0] !== "function") return Reflect.apply(transaction, db, args);
    frame.transactionAt = performance.now() - frame.started;
    const input = args[0];
    return context.run({ ...frame, business: true }, () => Reflect.apply(transaction, db, [async (actual: Prisma.TransactionClient) => {
      frame.callbackAt = performance.now() - frame.started;
      try { return await input(actual); } finally { frame.callbackEnd = performance.now() - frame.started; }
    }, ...args.slice(1)])).finally(() => { frame.transactionEnd = performance.now() - frame.started; });
  });
  // Shared arrays retain business observations while scalar timing stays on the
  // request frame. This distinguishes scopes without summing overlapping time.
  restores.push(() => tx.mockRestore());
  const getter = vi.spyOn(clients, "getPrisma").mockReturnValue(db);
  restores.push(() => getter.mockRestore());
  return {
    db,
    async request<T>(label: string, work: () => PromiseLike<T>) {
      const frame: Frame = { label, started: performance.now(), business: false, checkouts: [], queries: [] };
      frames.push(frame);
      const result = await context.run(frame, async () => work());
      return { result, elapsedMs: performance.now() - frame.started, frame };
    },
    frames,
    scope<T>(label: string, work: () => T) {
      const frame = frames.find(value => value.label === label);
      if (!frame) throw new Error("Owned read observation request not registered.");
      return context.run(frame, work);
    },
    async plans() {
      const seen = new Set<string>(), plans: unknown[] = [];
      for (const capture of captures) {
        // Bound plan collection to each distinct actual SQL shape (no timing traffic).
        if (seen.has(capture.sql)) continue; seen.add(capture.sql);
        const rows = await db.$queryRawUnsafe<any[]>(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${capture.sql}`, ...capture.values);
        const plan = rows[0]["QUERY PLAN"][0];
        plans.push({ number: plans.length + 1, planningMs: plan["Planning Time"], executionMs: plan["Execution Time"], tree: safePlan(plan.Plan) });
      }
      return plans;
    },
    async close() { try { await db.$disconnect(); } finally { for (const restore of restores.reverse()) restore(); } },
  };
}
