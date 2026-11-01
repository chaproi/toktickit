// Experimental PUBLIC adapter composition; never imported by the application.
import type { DriverAdapter, Error as AdapterError, Query, Queryable, Result,
  Transaction, TransactionContext } from "@prisma/driver-adapter-utils";

export type Scope = { ordinal: number; backend?: number; xid?: string;
  commitCalls: number; releases: number; nativeCodes: string[]; thrown?: Error };

export function observedAdapter(base: DriverAdapter, preserveCommitError: boolean, scopes: Scope[]): DriverAdapter {
  function calls(subject: Queryable, scope: Scope): Queryable {
    const invoke = async <T>(method: (query: Query) => Promise<Result<T>>, query: Query): Promise<Result<T>> => {
      // Inspect the known transaction COMMAND, never an error message.
      const commit = query.sql.trim().replace(/;$/, "").toUpperCase() === "COMMIT";
      if (commit) scope.commitCalls++;
      const result = await method(query);
      const value: unknown = result.ok ? result.value : null;
      if (typeof value === "object" && value !== null && "columnNames" in value && "rows" in value &&
          Array.isArray(value.columnNames) && Array.isArray(value.rows) && Array.isArray(value.rows[0])) {
        if (value.columnNames.includes("proofBackend") && value.columnNames.includes("proofXid")) {
          scope.backend = Number(value.rows[0][value.columnNames.indexOf("proofBackend")]);
          scope.xid = String(value.rows[0][value.columnNames.indexOf("proofXid")]);
        }
      }
      if (!result.ok && result.error.kind === "Postgres" && commit) {
        scope.nativeCodes.push(result.error.code);
        if (preserveCommitError) {
          // The cause IS the real adapter Result error, not a fabricated fault.
          // Prisma's public adapter bridge attributes thrown JS errors by ID.
          const cause: Extract<AdapterError, { kind: "Postgres" }> = result.error;
          const error = new Error("PostgreSQL rejected transaction completion.", { cause });
          scope.thrown = error;
          throw error;
        }
      }
      return result;
    };
    return { provider: subject.provider, adapterName: subject.adapterName,
      queryRaw: query => invoke(subject.queryRaw.bind(subject), query),
      executeRaw: query => invoke(subject.executeRaw.bind(subject), query) };
  }
  function transaction(subject: Transaction, scope: Scope): Transaction {
    return { ...calls(subject, scope), options: subject.options,
      commit: async () => { const result = await subject.commit(); scope.releases++; return result; },
      rollback: async () => { const result = await subject.rollback(); scope.releases++; return result; } };
  }
  function context(subject: TransactionContext, scope: Scope): TransactionContext {
    return { ...calls(subject, scope),
      startTransaction: async () => (await subject.startTransaction()).map(tx => transaction(tx, scope)) };
  }
  return { provider: base.provider, adapterName: base.adapterName,
    queryRaw: base.queryRaw.bind(base), executeRaw: base.executeRaw.bind(base),
    ...(base.getConnectionInfo ? { getConnectionInfo: base.getConnectionInfo.bind(base) } : {}),
    transactionContext: async () => (await base.transactionContext()).map(ctx => {
      const scope: Scope = { ordinal: scopes.length + 1, commitCalls: 0, releases: 0, nativeCodes: [] };
      scopes.push(scope);
      return context(ctx, scope);
    }) };
}
