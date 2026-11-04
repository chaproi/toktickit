import { AsyncLocalStorage } from "node:async_hooks";
import { Client, type Pool, type PoolClient } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { vi } from "vitest";
import * as admission from "../../src/database/write-admission.js";

type Frame = { request: string; attempt: number };
type State = { stage: string; activeQuery: string | null; deadlineStage?: string; deadlineQuery?: string | null };
type Front = { waiting: Set<string>; active: string | null };
const key = (frame: Frame) => `${frame.request}:${frame.attempt}`;
export function safeCreateError(value: unknown) {
  const e = value as any;
  const identifier = (v: unknown) => typeof v === "string" && /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(v) ? v : null;
  const phase = typeof e?.meta?.phase === "string" && ["transaction-start", "commit", "callback", "query", "rollback"].includes(e.meta.phase) ? e.meta.phase : null;
  return { name: identifier(e?.name), constructorName: identifier(e?.constructor?.name),
    code: typeof e?.code === "string" && /^(P\d{4}|[A-Z0-9]{5})$/.test(e.code) ? e.code : null,
    reportedMetaPhase: phase, reportedMaxWait: Number.isFinite(e?.meta?.maxWait) ? e.meta.maxWait : null,
    reportedTimeout: Number.isFinite(e?.meta?.timeout) ? e.meta.timeout : null,
    reportedMetaCode: typeof e?.meta?.code === "string" && /^[A-Z0-9]{5}$/.test(e.meta.code) ? e.meta.code : null,
    reportedCauseCode: typeof e?.cause?.code === "string" && /^[A-Z0-9]{5}$/.test(e.cause.code) ? e.cause.code : null,
    ownedStartupComposition: ["TransactionStartDeadlineError", "AdmissionDeadlineError"].includes(e?.constructor?.name),
    // Do not copy meta.error/messages: these can contain SQL or arbitrary data.
    engineProvidedSubtype: identifier(e?.meta?.kind ?? e?.meta?.subtype) };
}

// Test-only transparent observation of our exported attempt/public composition
// methods and public pg APIs. No engine internals, business mocks or results.
export class CreatePhaseObserver {
  readonly context = new AsyncLocalStorage<Frame>();
  readonly events: Array<Record<string, any>> = [];
  readonly samples: Array<Record<string, any>> = [];
  readonly pools: Pool[] = [];
  readonly epoch = performance.now();
  enabled = false;
  private states = new Map<string, State>();
  private selectedFrames = new Set<string>();
  private clients = new WeakMap<Client, Frame>();
  private fronts = new WeakMap<object, Front>();
  private knownFronts: Front[] = [];
  private restores: Array<() => void> = [];
  private queryNumber = 0;
  private timer?: ReturnType<typeof setInterval>;
  private polling: Promise<void> = Promise.resolve();
  private state(frame: Frame): State {
    const id = key(frame); if (!this.states.has(id)) this.states.set(id, { stage: "pre-transaction", activeQuery: null });
    return this.states.get(id)!;
  }
  snapshot(frame: Frame) { return { ...this.state(frame) }; }
  record(stage: string, extra: Record<string, any> = {}, frame?: Frame) {
    // Explicit undefined from an unscoped checkout must not pick up the ALS
    // context of a different client's release callback later.
    const selected = arguments.length < 3 ? this.context.getStore() : frame;
    if (this.enabled && selected) this.events.push({ atMs: performance.now() - this.epoch, ...selected, stage, ...extra });
  }
  occupancy(pool = this.pools.at(-1)) { return { total: pool?.totalCount ?? 0, idle: pool?.idleCount ?? 0, waiting: pool?.waitingCount ?? 0 }; }
  private wrapFront(front: any) {
    if (this.fronts.has(front)) return;
    const state: Front = { waiting: new Set(), active: null }; this.fronts.set(front, state); this.knownFronts.push(state);
    const take = front.take.bind(front), owner = this;
    const spy = vi.spyOn(front, "take").mockImplementation((...args: unknown[]) => {
      const frame = owner.context.getStore(); if (!frame) return Reflect.apply(take, front, args);
      const id = key(frame), signal = args[0] as AbortSignal;
      state.waiting.add(id);
      owner.record("fifo-enqueue", { queueLength: state.waiting.size, activeHolder: state.active, effectiveDeadlineMs: Number(args[1]) - owner.epoch }, frame);
      const aborted = () => owner.record("fifo-expiry", { queueLength: state.waiting.size, activeHolder: state.active, observed: owner.snapshot(frame) }, frame);
      signal.addEventListener("abort", aborted, { once: true });
      const promise = Reflect.apply(take, front, args) as Promise<() => void>;
      return promise.then(release => {
        signal.removeEventListener("abort", aborted); state.waiting.delete(id); state.active = id;
        owner.state(frame).stage = "checkout";
        owner.record("fifo-grant", { queueLength: state.waiting.size, activeHolder: id }, frame);
        return () => {
          owner.record("fifo-release-start", { queueLength: state.waiting.size, activeHolder: state.active }, frame);
          if (state.active === id) state.active = null;
          release(); owner.record("fifo-release-end", { queueLength: state.waiting.size, activeHolder: state.active }, frame);
        };
      }, error => {
        signal.removeEventListener("abort", aborted); state.waiting.delete(id);
        owner.record("fifo-rejection", { queueLength: state.waiting.size, activeHolder: state.active,
          observed: owner.snapshot(frame), error: safeCreateError(error) }, frame); throw error;
      });
    });
    this.restores.push(() => spy.mockRestore());
  }
  install() {
    const owner = this, makeAttempt = admission.newAdmissionAttempt;
    const attempts = vi.spyOn(admission, "newAdmissionAttempt").mockImplementation(maxWait => {
      const state = makeAttempt(maxWait), frame = owner.context.getStore(); if (!state || !frame) return state;
      owner.selectedFrames.add(key(frame));
      owner.record("attempt-selected", { maxWait }, frame);
      const join = state.join.bind(state), expire = state.expire.bind(state), finish = state.finish.bind(state);
      state.join = async front => {
        owner.wrapFront(front); owner.state(frame).stage = "fifo"; return join(front);
      };
      state.expire = () => {
        const current = owner.state(frame); current.deadlineStage ??= current.stage; current.deadlineQuery ??= current.activeQuery;
        owner.record("deadline-before-cleanup", { observed: owner.snapshot(frame),
          queue: owner.knownFronts.map(f => ({ queueLength: f.waiting.size, activeHolder: f.active })) }, frame);
        expire();
      };
      state.finish = async (primary?: unknown, hasPrimary = false) => {
        owner.record("finish-before-cleanup", { observed: owner.snapshot(frame), hasPrimary,
          error: hasPrimary ? safeCreateError(primary) : null }, frame);
        owner.state(frame).stage = "cleanup";
        try { return await finish(primary, hasPrimary); }
        finally { owner.record("finish-drained", {}, frame); owner.state(frame).stage = "finished"; }
      };
      return state;
    });
    this.restores.push(() => attempts.mockRestore());
    const factoryConnect = PrismaPg.prototype.connect;
    const factories = vi.spyOn(PrismaPg.prototype, "connect").mockImplementation(async function(this: PrismaPg) {
      const adapter = await factoryConnect.call(this), pool = adapter.underlyingDriver(), connect = pool.connect.bind(pool);
      owner.pools.push(pool);
      pool.connect = ((...args: any[]) => {
        const frame = owner.context.getStore(); owner.record("checkout-start", owner.occupancy(pool), frame);
        const acquired = (client: PoolClient) => {
          // Clear old ownership even for unscoped post-response verification.
          owner.clients.delete(client); if (frame) owner.clients.set(client, frame);
          if (frame && owner.selectedFrames.has(key(frame))) owner.state(frame).stage = "admission-setup";
          owner.record("checkout-result", owner.occupancy(pool), frame); return client;
        };
        if (typeof args[0] === "function") return connect((error, client, release) => {
          if (client) acquired(client); else owner.record("checkout-error", { error: safeCreateError(error) }, frame);
          args[0](error, client, release);
        });
        return connect().then(acquired, error => { owner.record("checkout-error", { error: safeCreateError(error) }, frame); throw error; });
      }) as Pool["connect"];
      pool.on("release", (_error, client) => {
        const frame = owner.clients.get(client); if (frame) owner.record("physical-release", owner.occupancy(pool), frame);
        owner.clients.delete(client);
      });
      const start = adapter.startTransaction.bind(adapter);
      adapter.startTransaction = async level => {
        const frame = owner.context.getStore(); if (frame) owner.state(frame).stage = "begin";
        owner.record("begin-start", {}, frame);
        try { const tx = await start(level); owner.record("begin-result", {}, frame); return tx; }
        catch (error) { owner.record("begin-error", { observed: frame ? owner.snapshot(frame) : null, error: safeCreateError(error) }, frame); throw error; }
      };
      return adapter;
    });
    this.restores.push(() => factories.mockRestore());
    const query = Client.prototype.query;
    const queries = vi.spyOn(Client.prototype, "query").mockImplementation(function(this: Client, ...args: any[]) {
      const frame = owner.clients.get(this) ?? owner.context.getStore();
      const input = args[0], sql: string | undefined = typeof input === "string" ? input : input?.text;
      const values = typeof input === "object" ? input?.values : args[1];
      let kind = "metadata", operation = "other";
      if (typeof sql === "string") {
        operation = sql.trim().match(/^(SELECT|INSERT|UPDATE|DELETE|COMMIT|ROLLBACK|BEGIN|SET|SHOW|WITH)\b/i)?.[1].toUpperCase() ?? "other";
        if (sql.startsWith("SELECT pg_advisory_lock_shared(")) kind = "maintenance-shared";
        else if (sql.startsWith("SELECT pg_advisory_lock(")) kind = [1,2,3,1002,1003,1004].includes(values?.[0]) ? `resource-${values[0]}` : "admission";
        else if (sql.startsWith("SELECT pg_advisory_unlock(")) kind = "unlock";
        else if (sql.includes("pg_try_advisory_xact_lock") || sql.includes("pg_advisory_xact_lock")) {
          kind = [1, 2, 3].includes(values?.[0]) ? `guard-gate-${values[0]}` : "guard-gate";
        } else kind = ["AuthSession", "MutationReceipt", "ActionHistory", "Ticket", "Action", "User", "Category", "RelatedSystem"]
          .find(model => sql.includes(`"${model}"`)) ?? (operation === "COMMIT" ? "commit" : operation === "ROLLBACK" ? "rollback" : "metadata");
      }
      const queryId = `q${++owner.queryNumber}`;
      if (frame) {
        if (kind === "admission" || kind.startsWith("resource-")) owner.state(frame).stage = kind === "admission" ? "database-admission" : "database-resource";
        if (kind === "commit") owner.state(frame).stage = "commit";
        owner.state(frame).activeQuery = queryId;
      }
      owner.record("query-start", { queryId, kind, operation, inStage: frame ? owner.state(frame).stage : null }, frame);
      const done = (error?: unknown) => {
        owner.record("query-end", { queryId, kind, operation, error: error ? safeCreateError(error) : null }, frame);
        if (frame && owner.state(frame).activeQuery === queryId) owner.state(frame).activeQuery = null;
        if ((kind === "admission" || kind.startsWith("resource-") || kind === "maintenance-shared") && !error) {
          owner.record("admission-acquired", { kind }, frame);
          if (frame) owner.state(frame).stage = "post-admission";
        }
      };
      const callback = args.at(-1);
      if (typeof callback === "function") {
        args[args.length - 1] = (...result: unknown[]) => { done(result[0]); callback(...result); };
        return Reflect.apply(query, this, args);
      }
      try {
        const result = Reflect.apply(query, this, args);
        return result?.then ? result.then((value: unknown) => { done(); return value; }, (error: unknown) => { done(error); throw error; }) : result;
      } catch (error) { done(error); throw error; }
    } as Client["query"]);
    this.restores.push(() => queries.mockRestore());
  }
  observeTransactions(db: any) {
    const owner = this, original = db.$transaction.bind(db), counts = new Map<string, number>();
    const spy = vi.spyOn(db, "$transaction").mockImplementation((...args: unknown[]) => {
      const frame = owner.context.getStore(); if (!frame || typeof args[0] !== "function") return Reflect.apply(original, db, args);
      const attempt = (counts.get(frame.request) ?? 0) + 1; counts.set(frame.request, attempt);
      const current = { ...frame, attempt }, callback = args[0] as (tx: unknown) => unknown;
      return owner.context.run(current, async () => {
        owner.state(current).stage = "transaction-call"; owner.record("transaction-start");
        try {
          const result = await Reflect.apply(original, db, [async (tx: unknown) => owner.context.run(current, async () => {
            owner.state(current).stage = "callback"; owner.record("callback-entry");
            try { return await callback(tx); }
            finally { owner.record("callback-exit"); owner.record("callback-drained"); }
          }), ...args.slice(1)]);
          owner.record("transaction-result"); return result;
        } catch (error) {
          owner.record("transaction-error-before-test-cleanup", { observed: owner.snapshot(current), error: safeCreateError(error) }); throw error;
        }
      });
    });
    this.restores.push(() => spy.mockRestore());
  }
  async locks(native: Client, schema: string) {
    const global = (await native.query<{ waiters: number; owners: number }>(`SELECT count(*) FILTER(WHERE NOT l.granted)::int AS waiters,
      count(*) FILTER(WHERE l.granted)::int AS owners FROM pg_locks l JOIN pg_namespace n ON n.oid=l.objid
      WHERE l.locktype='advisory' AND l.database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND l.classid=$1::oid AND n.nspname=$2`,
      [admission.ADMISSION_NAMESPACE, schema])).rows[0];
    // Resource keys are intentionally database-scoped. Report that exact scope,
    // separately from old schema-global admission; never label zero old waiters
    // as zero new resource contention. These bounded runs execute alone.
    const resources = (await native.query(`SELECT count(*) FILTER(WHERE NOT granted)::int AS "databaseResourceWaiters",
      count(*) FILTER(WHERE granted)::int AS "databaseResourceOwners" FROM pg_locks
      WHERE locktype='advisory' AND database=(SELECT oid FROM pg_database WHERE datname=current_database())
      AND classid=ANY($1::oid[])`, [[1,2,3,1002,1003,1004]])).rows[0];
    return { ...global, ...resources };
  }
  sample(native: Client, schema: string) {
    this.timer = setInterval(() => { this.polling = this.polling.then(async () => {
      this.samples.push({ atMs: performance.now() - this.epoch, ...this.occupancy(), ...await this.locks(native, schema),
        fronts: this.knownFronts.map(front => ({ queueLength: front.waiting.size, activeHolder: front.active })) });
    }); }, 10);
  }
  async stop() { if (this.timer) clearInterval(this.timer); await this.polling; }
  restore() { for (const restore of this.restores.reverse()) restore(); }
}
