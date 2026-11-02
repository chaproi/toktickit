import { createHash } from "node:crypto";
import { Client } from "pg";
import { vi } from "vitest";

export type CreateQueryScope = { label: string; attempt: number; backend?: number;
  queries: Array<{ operation: string; elapsedMs: number; sqlState?: string }> };
export type PlannerMode = "default" | "ticket-index" | "receipt-index" | "both-index" | "retry-jitter";

// Pass-through public pg query instrumentation. SQL/binds/errors are used only
// transiently for EXPLAIN; neither private contents nor SQL text is retained.
export function observeCreateQueries(native: Client, mode: PlannerMode,
  scope: () => CreateQueryScope | undefined, report: Record<string, any>) {
  const original = Client.prototype.query;
  const seen = new Set<string>(); let queue = Promise.resolve();
  const serial = <T>(work: () => Promise<T>) => {
    const pending = queue.then(work); queue = pending.then(() => undefined, () => undefined); return pending;
  };
  const plan = (node: any): unknown => ({ node: node["Node Type"], index: node["Index Name"] ?? null,
    rows: node["Plan Rows"], children: (node.Plans ?? []).map(plan) });
  report.queryPlans = []; report.operationLocks = []; report.plannerMode = mode;
  const spy = vi.spyOn(Client.prototype, "query").mockImplementation(function(this: Client, ...args: any[]) {
    const input = args[0], current = scope();
    if (!current || !input || typeof input !== "object" || input.rowMode !== "array" || typeof input.text !== "string") {
      return Reflect.apply(original, this, args);
    }
    const text: string = input.text;
    const relation = text.match(/\b(?:FROM|UPDATE|INTO)\s+(?:"[^"]+"\.)?"(Ticket|MutationReceipt|User|AuthSession|Action|ActionHistory)"/i)?.[1];
    if (!relation) return Reflect.apply(original, this, args);
    const verb = text.trim().split(/\s+/)[0].toUpperCase();
    const operation = `${relation}.${verb}${/FOR\s+UPDATE/i.test(text) ? ".lock" : ""}`;
    const favour = (relation === "Ticket" && ["ticket-index", "both-index"].includes(mode)) ||
      (relation === "MutationReceipt" && ["receipt-index", "both-index"].includes(mode));
    return (async () => {
      if (!seen.has(operation)) {
        seen.add(operation);
        await serial(async () => {
          await native.query("BEGIN READ ONLY");
          try {
            if (favour) await native.query("SET LOCAL enable_seqscan=off");
            const result = await native.query(`EXPLAIN (FORMAT JSON) ${text}`, input.values ?? []);
            report.queryPlans.push({ operation, plannerIntervention: favour, sqlShape: createHash("sha256").update(text).digest("hex"),
              plan: plan(result.rows[0]["QUERY PLAN"][0].Plan) });
          } finally { await native.query("ROLLBACK"); }
        });
      }
      const started = performance.now();
      try {
        if (favour) await Reflect.apply(original, this, ["SET LOCAL enable_seqscan=off"]);
        const result = await Reflect.apply(original, this, args);
        if (favour) await Reflect.apply(original, this, ["SET LOCAL enable_seqscan=on"]);
        current.queries.push({ operation, elapsedMs: performance.now() - started });
        if (current.attempt === 1 && current.backend && (operation === "Ticket.SELECT.lock" || operation === "MutationReceipt.SELECT")) {
          await serial(async () => {
            const locks = await native.query(`SELECT l.locktype,l.mode,c.relname AS relation,l.page,l.tuple
              FROM pg_locks l LEFT JOIN pg_class c ON c.oid=l.relation
              WHERE l.pid=$1 AND l.mode='SIReadLock' ORDER BY c.relname,l.page,l.tuple`, [current.backend]);
            report.operationLocks.push({ command: current.label, operation, locks: locks.rows });
          });
        }
        return result;
      } catch (error) {
        const code = error !== null && typeof error === "object" && "code" in error ? String(error.code) : "";
        current.queries.push({ operation, elapsedMs: performance.now() - started,
          ...(/^[0-9A-Z]{5}$/.test(code) ? { sqlState: code } : {}) });
        throw error;
      }
    })();
  } as Client["query"]);
  return { restore: () => spy.mockRestore(), drain: () => queue };
}
