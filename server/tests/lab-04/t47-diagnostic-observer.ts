import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import type { Client } from "pg";
import { vi } from "vitest";
import { query } from "./migration-test-fixtures.js";
import { safePlan } from "./performance-test-helpers.js";
import { classifyDiagnosticLog } from "./t47-log-classification.js";

type Trace = { id: string; phase: string; route: string; start: number; serverStart?: number; finishMs?: number;
  operations: Array<{ model: string; action: string; startMs: number; elapsedMs: number; rows: number | null; transaction: boolean }> };
type Captured = { request: string; sql: string; params: unknown[]; durationMs: number; shape: string };
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
const object = (value: unknown): Record<string, any> => value !== null && typeof value === "object" ? value as Record<string, any> : {};
export async function bounded<T>(promise: Promise<T>, ms = 5000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Diagnostic coordination deadline; not a database classification.")), ms);
  })]); } finally { clearTimeout(timer!); }
}

export class DiagnosticObserver {
  readonly context = new AsyncLocalStorage<Trace>();
  readonly traces = new Map<string, Trace>();
  readonly transactions: any[] = [];
  readonly engineQueries: any[] = [];
  readonly captured: Captured[] = []; // Private transient SQL/binds; never serialized.
  readonly pending = new Set<Promise<unknown>>();
  readonly backendIds = new Map<number, string>();
  readonly waitSamples: any[] = [];
  readonly barrierLocks: any[] = [];
  phase = "setup";
  private baselineRequest: string | null = null;
  private barrier: { ids: Set<string>; seen: Set<string>; ready: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> } | null = null;
  private restoreTransaction?: () => void;
  private sampler: ReturnType<typeof setInterval> | undefined;
  private samplePending: Promise<unknown> = Promise.resolve();
  constructor(readonly db: PrismaClient<any, "query">, readonly native: Client, readonly tag: string, readonly schema: string) {
    db.$use(async (params, next) => {
      const trace = this.context.getStore(), begin = performance.now();
      try {
        const result = await next(params);
        if (trace) trace.operations.push({ model: params.model ?? "raw", action: params.action,
          startMs: begin - trace.start, elapsedMs: performance.now() - begin,
          rows: Array.isArray(result) ? result.length : typeof result === "number" ? result : null,
          transaction: params.runInTransaction });
        return result;
      } catch (error) {
        if (trace) trace.operations.push({ model: params.model ?? "raw", action: params.action,
          startMs: begin - trace.start, elapsedMs: performance.now() - begin, rows: null, transaction: params.runInTransaction });
        throw error;
      }
    });
    db.$on("query", event => {
      if (this.phase === "setup") return;
      const request = this.baselineRequest; // Only single-request baselines are unambiguously assigned.
      const shape = createHash("sha256").update(event.query.replaceAll(this.schema, "<owned>")).digest("hex").slice(0, 16);
      this.engineQueries.push({ phase: this.phase, request, shape, durationMs: event.duration });
      if (request && /^SELECT\b/i.test(event.query.trim())) {
        this.captured.push({ request, sql: event.query, params: JSON.parse(event.params), durationMs: event.duration, shape });
      }
    });
    const original = db.$transaction.bind(db);
    const spy = vi.spyOn(db, "$transaction").mockImplementation((...args: unknown[]) => {
      const trace = this.context.getStore();
      if (!trace || typeof args[0] !== "function") return Reflect.apply(original, db, args);
      const callback = args[0] as (tx: Prisma.TransactionClient) => Promise<unknown>;
      const started = performance.now();
      const entry: any = { request: trace.id, attempt: this.transactions.filter(x => x.request === trace.id).length + 1,
        isolationOption: object(args[1]).isolationLevel ?? "default", elapsedMs: 0, rejection: null };
      this.transactions.push(entry);
      const work = Reflect.apply(original, db, [async (tx: Prisma.TransactionClient) => {
        entry.callbackStartMs = performance.now() - started;
        const [backend] = await tx.$queryRaw<Array<{ pid: number; isolation: string; readOnly: string }>>`
          SELECT pg_backend_pid() AS pid,current_setting('transaction_isolation') AS isolation,
            current_setting('transaction_read_only') AS "readOnly"`;
        if (!this.backendIds.has(backend.pid)) this.backendIds.set(backend.pid, `B${this.backendIds.size + 1}`);
        entry.backend = this.backendIds.get(backend.pid); entry.isolation = backend.isolation;
        if (trace.phase === "write") await tx.$executeRaw`SET LOCAL log_error_verbosity = 'verbose'`;
        const observed = new Proxy(tx, { get: (target, property) => {
          const value = Reflect.get(target, property);
          if (property === "$queryRaw") return async (...raw: unknown[]) => {
            const result = await Reflect.apply(value, target, raw);
            const fragments = Array.isArray(raw[0]) ? raw[0] : Array.isArray(object(raw[0]).strings) ? object(raw[0]).strings : [];
            const text = fragments.map(String).join("?");
            if (text.includes("pg_try_advisory_xact_lock")) {
              (entry.gates ??= []).push({ scope: typeof raw[1] === "number" ? raw[1] : null,
                acquired: Array.isArray(result) && result[0]?.acquired === true });
            }
            if (/FROM "(User|AuthSession|Ticket|Action)"/.test(text)) {
              (entry.lockedReads ??= []).push({ model: text.match(/FROM "(User|AuthSession|Ticket|Action)"/)![1],
                rowCount: Array.isArray(result) ? result.length : null, lock: /FOR SHARE/.test(text) ? "SHARE" : /FOR UPDATE/.test(text) ? "UPDATE" : "none" });
            }
            return result;
          };
          if (property === "mutationReceipt") return new Proxy(value, { get: (delegate, method) => {
            const call = Reflect.get(delegate, method);
            if (method !== "findUnique") return typeof call === "function" ? call.bind(delegate) : call;
            return async (...input: unknown[]) => {
              const result = await Reflect.apply(call, delegate, input);
              entry.receiptMissing = result === null;
              const barrier = this.barrier;
              if (barrier?.ids.has(trace.id) && !barrier.seen.has(trace.id)) {
                barrier.seen.add(trace.id);
                if (barrier.seen.size === barrier.ids.size) barrier.ready.resolve();
                await bounded(barrier.release.promise);
              }
              return result;
            };
          } });
          return typeof value === "function" ? value.bind(target) : value;
        } });
        return callback(observed);
      }, ...args.slice(1)]).catch((error: unknown) => {
        const row = object(error), meta = object(row.meta);
        entry.rejection = { code: typeof row.code === "string" && /^P\d{4}$/.test(row.code) ? row.code : "unclassified",
          model: ["Action", "ActionHistory", "MutationReceipt", "Ticket"].includes(meta.modelName) ? meta.modelName : null,
          sqlState: typeof meta.code === "string" && /^[A-Z0-9]{5}$/.test(meta.code) ? meta.code : null };
        throw error;
      }).finally(() => { entry.elapsedMs = performance.now() - started; });
      this.pending.add(work); work.then(() => this.pending.delete(work), () => this.pending.delete(work));
      return work;
    });
    this.restoreTransaction = () => spy.mockRestore();
  }
  beginRequest(id: string, phase: string, route: string) {
    const trace: Trace = { id, phase, route, start: performance.now(), operations: [] };
    this.traces.set(id, trace); return trace;
  }
  setBaseline(id: string | null) { this.baselineRequest = id; }
  coordinate(ids: string[]) {
    this.barrier = { ids: new Set(ids), seen: new Set(), ready: deferred(), release: deferred() };
    return { ready: this.barrier.ready.promise, release: () => this.barrier?.release.resolve() };
  }
  release() { this.barrier?.release.resolve(); }
  async inspectLocks(label: string) {
    const rows = await query<any>(this.native, `SELECT a.pid,a.state,a.wait_event_type AS wait_type,a.wait_event AS wait,
      l.locktype,l.mode,l.granted,c.relname FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid
      LEFT JOIN pg_class c ON c.oid=l.relation LEFT JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE a.datname=current_database() AND a.application_name=$1 AND (n.nspname=$2 OR l.relation IS NULL)`, [this.tag, this.schema]);
    this.barrierLocks.push({ label, locks: rows.rows.map(row => ({ backend: this.backendIds.get(row.pid) ?? "unassigned",
      state: row.state, waitType: row.wait_type, wait: row.wait, kind: row.locktype, mode: row.mode, granted: row.granted,
      relation: row.relname ?? null })) });
  }
  startSampling() {
    this.sampler = setInterval(() => {
      this.samplePending = this.samplePending.then(async () => {
        const result = await query<any>(this.native, `SELECT state,wait_event_type AS wait_type,wait_event AS wait,count(*)::int AS count
          FROM pg_stat_activity WHERE datname=current_database() AND application_name=$1 GROUP BY state,wait_event_type,wait_event`, [this.tag]);
        this.waitSamples.push({ phase: this.phase, states: result.rows });
      });
    }, 20);
  }
  async stop() {
    this.release(); if (this.sampler) clearInterval(this.sampler);
    await this.samplePending; await Promise.allSettled([...this.pending]); this.restoreTransaction?.();
  }
  async actualPlans() {
    const result: any[] = [];
    for (const request of [...new Set(this.captured.map(row => row.request))].filter(id => id.startsWith("B-"))) {
      const captured = this.captured.filter(row => row.request === request && !row.sql.includes("pg_backend_pid"));
      // Exact route-generated SELECTs, deduplicated by shape; at most 24 plans overall.
      const unique = [...new Map(captured.map(row => [row.shape, row])).values()]
        .filter(row => !/SELECT CURRENT_TIMESTAMP/.test(row.sql))
        .sort((a, b) => b.durationMs - a.durationMs).slice(0, 6);
      for (const row of unique) {
        if (result.length === 24) break;
        try {
          await query(this.native, "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
          const response = await query<any>(this.native, `EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${row.sql}`, row.params);
          const plan = response.rows[0]["QUERY PLAN"][0];
          result.push({ request, shape: row.shape, capturedEngineMs: row.durationMs, planningMs: plan["Planning Time"], executionMs: plan["Execution Time"], tree: safePlan(plan.Plan) });
        } catch { result.push({ request, shape: row.shape, unavailable: true }); }
        finally { await query(this.native, "ROLLBACK"); }
      }
    }
    return result;
  }
  publicTraces() {
    return [...this.traces.values()].map(trace => ({ id: trace.id, phase: trace.phase, route: trace.route,
      serverElapsedMs: trace.finishMs, arrivalDelayMs: trace.serverStart === undefined ? null : trace.serverStart - trace.start,
      operations: trace.operations }));
  }
}

export async function logBoundary(client: Client) {
  const row = (await query<any>(client, "SELECT pg_current_logfile() AS file,(pg_stat_file(pg_current_logfile())).size::bigint AS size")).rows[0];
  return { file: String(row.file), offset: Number(row.size) }; // Private path, never publish.
}
export async function readOwnedErrors(client: Client, boundary: Awaited<ReturnType<typeof logBoundary>>, backends: Map<number, string>) {
  // The parser explicitly distinguishes exact PID ownership from a bounded
  // log window when the installed prefix omits PIDs. Neither is a retry hook.
  const row = (await query<any>(client, "SELECT (pg_stat_file($1)).size::bigint AS size", [boundary.file])).rows[0];
  const bytes = Math.max(0, Math.min(Number(row.size) - boundary.offset, 262144));
  if (!bytes) return [];
  const data = (await query<any>(client, "SELECT pg_read_binary_file($1,$2::bigint,$3::bigint) AS bytes", [boundary.file, boundary.offset, bytes])).rows[0].bytes as Buffer;
  return classifyDiagnosticLog(data.toString("utf8"), backends);
}
