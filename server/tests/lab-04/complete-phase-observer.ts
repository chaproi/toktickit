import { AsyncLocalStorage } from "node:async_hooks";
import { Client, type Pool, type PoolClient } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { vi } from "vitest";
import { ADMISSION_NAMESPACE } from "../../src/database/write-admission.js";

type Frame = { request: string; attempt: number };
const names = new Set(["Error", "DatabaseError", "PrismaClientKnownRequestError", "PrismaClientUnknownRequestError",
  "TransactionStartDeadlineError", "AdmissionDeadlineError", "AdmissionOwnershipError"]);
export function safePhaseError(value: unknown) {
  const e = value as { name?: unknown; code?: unknown; meta?: { phase?: unknown } } | null;
  return { name: typeof e?.name === "string" && names.has(e.name) ? e.name : "other",
    code: typeof e?.code === "string" && /^(P\d{4}|[A-Z0-9]{5})$/.test(e.code) ? e.code : null,
    phase: e?.meta?.phase === "transaction-start" ? "transaction-start" : null };
}

// Transparent public pg/adapter/client observation only. SQL is inspected in
// memory for phase labels, never retained; no result/error is manufactured.
export class CompletePhaseObserver {
  readonly context = new AsyncLocalStorage<Frame>();
  readonly events: Array<Record<string, unknown>> = [];
  readonly samples: Array<Record<string, unknown>> = [];
  readonly pools: Pool[] = [];
  readonly epoch = performance.now();
  enabled = false;
  private clients = new WeakMap<Client, Frame>();
  private restores: Array<() => void> = [];
  private timer?: ReturnType<typeof setInterval>;
  private polling: Promise<void> = Promise.resolve();
  occupancy(pool = this.pools.at(-1)) {
    return { total: pool?.totalCount ?? 0, idle: pool?.idleCount ?? 0, waiting: pool?.waitingCount ?? 0 };
  }
  record(stage: string, extra: Record<string, unknown> = {}, frame = this.context.getStore()) {
    if (this.enabled && frame) this.events.push({ atMs: performance.now() - this.epoch, ...frame, stage, ...extra });
  }
  install() {
    const owner = this, originalConnect = PrismaPg.prototype.connect;
    const factory = vi.spyOn(PrismaPg.prototype, "connect").mockImplementation(async function(this: PrismaPg) {
      const actual = await originalConnect.call(this), pool = actual.underlyingDriver();
      owner.pools.push(pool);
      const connect = pool.connect.bind(pool);
      pool.connect = ((...args: any[]) => {
        const frame = owner.context.getStore();
        owner.record("checkout-start", owner.occupancy(pool), frame);
        const acquired = (client: PoolClient) => {
          if (frame) owner.clients.set(client, frame);
          owner.record("checkout-result", owner.occupancy(pool), frame); return client;
        };
        if (typeof args[0] === "function") {
          const callback = args[0];
          return connect((error, client, release) => {
            if (client) acquired(client); else owner.record("checkout-error", safePhaseError(error), frame);
            callback(error, client, release);
          });
        }
        return connect().then(acquired, error => { owner.record("checkout-error", safePhaseError(error), frame); throw error; });
      }) as Pool["connect"];
      pool.on("release", (_error, client) => owner.record("physical-release", owner.occupancy(pool), owner.clients.get(client)));
      pool.on("remove", client => owner.record("connection-removed", owner.occupancy(pool), owner.clients.get(client)));
      const start = actual.startTransaction.bind(actual);
      actual.startTransaction = async level => {
        owner.record("begin-start");
        try { const tx = await start(level); owner.record("begin-result"); return tx; }
        catch (error) { owner.record("begin-error", safePhaseError(error)); throw error; }
      };
      return actual;
    });
    this.restores.push(() => factory.mockRestore());
    const query = Client.prototype.query;
    const queries = vi.spyOn(Client.prototype, "query").mockImplementation(function(this: Client, ...args: any[]) {
      const frame = owner.context.getStore() ?? owner.clients.get(this);
      const input = args[0], sql = typeof input === "string" ? input : input?.text;
      let kind = "other";
      if (typeof sql === "string") {
        if (sql.startsWith("SELECT pg_advisory_lock(")) kind = "admission";
        else if (sql.startsWith("SELECT pg_advisory_unlock(")) kind = "unlock";
        else if (/^COMMIT\b/i.test(sql.trim())) kind = "commit";
        else if (/^ROLLBACK\b/i.test(sql.trim())) kind = "rollback";
        else kind = ["AuthSession", "User", "Ticket", "Action", "MutationReceipt", "ActionHistory"]
          .find(model => sql.includes(`"${model}"`)) ?? "metadata";
      }
      owner.record(kind === "admission" ? "admission-wait-start" : `${kind}-query-start`, {}, frame);
      const done = (error?: unknown) => owner.record(kind === "admission" && !error ? "admission-acquired"
        : `${kind}-query-${error ? "error" : "end"}`, error ? safePhaseError(error) : {}, frame);
      const callback = args.at(-1);
      if (typeof callback === "function") {
        args[args.length - 1] = (...values: unknown[]) => { done(values[0]); callback(...values); };
        return Reflect.apply(query, this, args);
      }
      try {
        const result = Reflect.apply(query, this, args);
        if (result && typeof result.then === "function") return result.then((value: unknown) => { done(); return value; },
          (error: unknown) => { done(error); throw error; });
        return result;
      } catch (error) { done(error); throw error; }
    } as Client["query"]);
    this.restores.push(() => queries.mockRestore());
  }
  observeTransactions(db: any) {
    const owner = this, original = db.$transaction.bind(db), attempts = new Map<string, number>();
    const spy = vi.spyOn(db, "$transaction").mockImplementation((...args: unknown[]) => {
      const frame = owner.context.getStore();
      if (!frame || typeof args[0] !== "function") return Reflect.apply(original, db, args);
      const attempt = (attempts.get(frame.request) ?? 0) + 1; attempts.set(frame.request, attempt);
      const current = { request: frame.request, attempt }, callback = args[0] as (tx: unknown) => unknown;
      return owner.context.run(current, async () => {
        owner.record("transaction-start");
        try {
          const result = await Reflect.apply(original, db, [async (tx: unknown) => owner.context.run(current, async () => {
            owner.record("callback-entry");
            try { return await callback(tx); }
            finally { owner.record("callback-exit"); owner.record("callback-drained"); }
          }), ...args.slice(1)]);
          owner.record("transaction-result"); return result;
        } catch (error) { owner.record("transaction-error", safePhaseError(error)); throw error; }
      });
    });
    this.restores.push(() => spy.mockRestore());
  }
  async databaseWaiters(native: Client, schema: string) {
    return (await native.query<{ waiters: number; owners: number }>(`SELECT
      count(*) FILTER(WHERE NOT l.granted)::int AS waiters,
      count(*) FILTER(WHERE l.granted)::int AS owners FROM pg_locks l JOIN pg_namespace n ON n.oid=l.objid
      WHERE l.locktype='advisory' AND l.database=(SELECT oid FROM pg_database WHERE datname=current_database())
        AND l.classid=$1::oid AND n.nspname=$2`, [ADMISSION_NAMESPACE, schema])).rows[0];
  }
  sample(native: Client, schema: string) {
    this.timer = setInterval(() => { this.polling = this.polling.then(async () => {
      this.samples.push({ atMs: performance.now() - this.epoch, ...this.occupancy(), ...await this.databaseWaiters(native, schema) });
    }); }, 10);
  }
  async stop() { if (this.timer) clearInterval(this.timer); await this.polling; }
  restore() { for (const restore of this.restores.reverse()) restore(); }
}
