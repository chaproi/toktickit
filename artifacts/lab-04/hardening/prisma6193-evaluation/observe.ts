import type { SqlDriverAdapterFactory, SqlQueryable, SqlQuery, SqlDriverAdapter, Transaction } from "@prisma/driver-adapter-utils";

export type Scope = { backend?: number; xid?: string; commitCalls: number; releaseCalls: number;
  nativeCodes: string[]; error?: unknown };
export function structured(error: unknown): { code: string | null; state: string | null; kind: string | null } {
  let code: string | null = null, state: string | null = null, kind: string | null = null;
  const seen = new Set<object>();
  function visit(value: unknown) {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    const row = value as { code?: unknown; originalCode?: unknown; kind?: unknown; cause?: unknown; meta?: unknown; driverAdapterError?: unknown };
    if (typeof row.code === "string" && /^P\d{4}$/.test(row.code)) code = row.code;
    for (const item of [row.code, row.originalCode]) if (typeof item === "string" && /^[0-9A-Z]{5}$/.test(item)) state = item;
    if (typeof row.kind === "string" && ["TransactionWriteConflict", "postgres", "UniqueConstraintViolation"].includes(row.kind)) kind = row.kind;
    visit(row.cause); visit(row.meta); visit(row.driverAdapterError);
  }
  visit(error); return { code, state, kind };
}
export function observe(factory: SqlDriverAdapterFactory, scopes: Scope[]): SqlDriverAdapterFactory {
  const queryable = (target: SqlQueryable, scope: Scope): SqlQueryable => {
    const run = async <T>(fn: (query: SqlQuery) => Promise<T>, query: SqlQuery): Promise<T> => {
      const commit = query.sql.trim().replace(/;$/, "").toUpperCase() === "COMMIT";
      if (commit) scope.commitCalls++;
      try {
        const result = await fn(query);
        const value: unknown = result;
        if (typeof value === "object" && value !== null && "columnNames" in value && "rows" in value &&
            Array.isArray(value.columnNames) && Array.isArray(value.rows) && Array.isArray(value.rows[0])) {
          if (value.columnNames.includes("proofBackend")) {
            scope.backend = Number(value.rows[0][value.columnNames.indexOf("proofBackend")]);
            scope.xid = String(value.rows[0][value.columnNames.indexOf("proofXid")]);
          }
        }
        return result;
      } catch (error) {
        if (commit) { const state = structured(error).state; if (state) scope.nativeCodes.push(state); scope.error = error; }
        throw error; // exact pass-through, no success/error fabrication or cleanup fix
      }
    };
    return { provider: target.provider, adapterName: target.adapterName,
      queryRaw: q => run(target.queryRaw.bind(target), q), executeRaw: q => run(target.executeRaw.bind(target), q) };
  };
  const tx = (target: Transaction, scope: Scope): Transaction => ({ ...queryable(target, scope), options: target.options,
    commit: async () => { await target.commit(); scope.releaseCalls++; },
    rollback: async () => { await target.rollback(); scope.releaseCalls++; } });
  return { provider: factory.provider, adapterName: factory.adapterName, connect: async () => {
    const target = await factory.connect();
    const adapter: SqlDriverAdapter = { provider: target.provider, adapterName: target.adapterName,
      queryRaw: target.queryRaw.bind(target), executeRaw: target.executeRaw.bind(target),
      executeScript: target.executeScript.bind(target), dispose: target.dispose.bind(target),
      ...(target.getConnectionInfo ? { getConnectionInfo: target.getConnectionInfo.bind(target) } : {}),
      startTransaction: async level => {
        const actual = await target.startTransaction(level);
        const scope: Scope = { commitCalls: 0, releaseCalls: 0, nativeCodes: [] }; scopes.push(scope);
        return tx(actual, scope);
      } };
    return adapter;
  } };
}
