import { randomBytes } from "node:crypto";
import { Client } from "pg";
import type { CreatePhaseObserver } from "./create-phase-observer.js";
import { safeCreateError } from "./create-phase-observer.js";

// Temporary test-only correlation. SQL comments add no application round trip,
// parameter change or business result. Only public pg APIs/catalogs are used.
export class PatchBlockingObserver {
  readonly nonce = randomBytes(4).toString("hex");
  readonly queries: Array<Record<string, any>> = [];
  readonly samples: Array<Record<string, any>> = [];
  readonly samplingErrors: Array<Record<string, unknown>> = [];
  private clientNames = new WeakMap<Client, number>();
  private clients = 0;
  private sequence = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private pending: Promise<void> = Promise.resolve();
  private stopped = true;
  private restoreQuery?: () => void;
  truncatedQueries = false;
  truncatedSamples = false;
  constructor(private readonly observer: CreatePhaseObserver) {}
  private now() { return performance.now() - this.observer.epoch; }
  install() {
    const original = Client.prototype.query, owner = this;
    const wrapped = function(this: Client, ...inputArgs: any[]) {
      const frame = owner.observer.context.getStore();
      if (!owner.observer.enabled || !frame || !/^[a-z0-9-]{1,50}$/.test(frame.request)) return Reflect.apply(original, this, inputArgs);
      const args = [...inputArgs], input = args[0], sql = typeof input === "string" ? input : input?.text;
      if (typeof sql !== "string") return Reflect.apply(original, this, args);
      let client = owner.clientNames.get(this);
      if (!client) { client = ++owner.clients; owner.clientNames.set(this, client); }
      const sequence = ++owner.sequence, values = typeof input === "string" ? args[1] : input.values;
      const resource = /^SELECT pg_advisory_(?:lock|unlock)(?:_shared)?\(/.test(sql) && Array.isArray(values)
        && Number.isInteger(values[0]) && Number.isInteger(values[1])
        ? { scope: values[0], key: values[1], shared: sql.includes("_shared(") } : undefined;
      const kind = resource ? `coordination-${resource.scope}` : ["AuthSession", "MutationReceipt", "ActionHistory", "Ticket", "Action", "User"]
        .find(name => sql.includes(`"${name}"`)) ?? "metadata";
      const operation = sql.trim().match(/^(SELECT|INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK|SET|SHOW|WITH)\b/i)?.[1].toUpperCase() ?? "other";
      const named = typeof input === "object" && Boolean(input.name);
      const tag = ` /*tk50:${owner.nonce}:${frame.request}:${frame.attempt}:${sequence}*/`;
      if (!named) args[0] = typeof input === "string" ? sql + tag : { ...input, text: sql + tag };
      const record = (stage: string, extra: Record<string, unknown> = {}) => {
        if (owner.queries.length >= 30_000) { owner.truncatedQueries = true; return; }
        owner.queries.push({ atMs: owner.now(), stage, request: frame.request, attempt: frame.attempt, sequence, client,
          kind, operation, ...(resource ? { resource } : {}), tagApplied: !named, ...extra });
      };
      record("query-start");
      const done = (error?: unknown) => record("query-end", { error: error ? safeCreateError(error) : null });
      const callback = args.at(-1);
      if (typeof callback === "function") args[args.length - 1] = (...result: unknown[]) => { done(result[0]); return callback(...result); };
      try {
        const result = Reflect.apply(original, this, args);
        return typeof callback === "function" ? result : result?.then
          ? result.then((value: unknown) => { done(); return value; }, (error: unknown) => { done(error); throw error; }) : result;
      } catch (error) { done(error); throw error; }
    } as Client["query"];
    Client.prototype.query = wrapped;
    this.restoreQuery = () => { if (Client.prototype.query === wrapped) Client.prototype.query = original; };
  }
  start(native: Client) {
    this.stopped = false;
    const pattern = `/\\*tk50:${this.nonce}:([a-z0-9-]{1,50}):([0-9]+):([0-9]+)\\*/`;
    const tick = () => {
      if (this.stopped) return;
      if (this.samples.length >= 4096) { this.truncatedSamples = true; return; }
      const start = this.now();
      this.pending = (async () => {
        try {
          const result = await native.query(`WITH a AS (
            SELECT pid,state,wait_event_type AS "waitType",wait_event AS "waitEvent",
              pg_blocking_pids(pid) AS blockers,regexp_match(query,$1) AS tag
            FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()
          ), l AS (
            SELECT pid,classid::bigint::text AS scope,objid::bigint::text AS key,objsubid,mode,granted
            FROM pg_locks WHERE locktype='advisory'
              AND database=(SELECT oid FROM pg_database WHERE datname=current_database())
              AND pid IN (SELECT pid FROM a)
          ) SELECT COALESCE((SELECT json_agg(a) FROM a),'[]'::json) AS activity,
            COALESCE((SELECT json_agg(l) FROM l),'[]'::json) AS locks`, [pattern]);
          this.samples.push({ atMs: start, completedAtMs: this.now(), ...this.observer.occupancy(), ...result.rows[0] });
        } catch (error) { this.samplingErrors.push({ atMs: this.now(), error: safeCreateError(error) }); }
      })().finally(() => { if (!this.stopped) this.timer = setTimeout(tick, 25); });
    };
    this.timer = setTimeout(tick, 25);
  }
  async stop() { this.stopped = true; if (this.timer) clearTimeout(this.timer); await this.pending; }
  restore() { this.restoreQuery?.(); }
  report() { return { nonce: this.nonce, method: "test-only request/attempt/query SQL comments; public pg_stat_activity/pg_locks/pg_blocking_pids; no query text returned",
    samplePolicy: "one serialized catalog query then25ms wait; maximum4096samples; existing aggregate sampler unchanged",
    qualifications: ["Tag is current/last statement, not automatically a current owner identity when backend is idle.", "A sampler can miss short waits; no retrospective holder inference from cleanup.", "Added comments and separate catalog observation overhead are diagnostic limitations; no benchmark inference."],
    queries: this.queries, samples: this.samples, samplingErrors: this.samplingErrors, truncatedQueries: this.truncatedQueries, truncatedSamples: this.truncatedSamples }; }
}
