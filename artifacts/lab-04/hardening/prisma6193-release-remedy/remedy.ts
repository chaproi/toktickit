import type { SqlDriverAdapterFactory, SqlDriverAdapter, SqlQuery, Transaction } from "@prisma/driver-adapter-utils";

export type CleanupStage = "rollback-query" | "transaction-release";
export function releaseOnce(target: Transaction, secondary: (stage: CleanupStage) => void = () => {}): Transaction {
  let completion: Promise<void> | undefined;
  let abort: Promise<void> | undefined;
  const note = (stage: CleanupStage) => { try { secondary(stage); } catch { /* reporting cannot replace primary */ } };
  const finish = (kind: "commit" | "rollback") => completion ??= Promise.resolve().then(() => target[kind]());
  const cleanup = () => abort ??= (async () => {
    try { await target.executeRaw({ sql: "ROLLBACK", args: [], argTypes: [] }); }
    catch { note("rollback-query"); }
    try { await finish("rollback"); }
    catch { note("transaction-release"); }
  })();
  const execute = async (query: SqlQuery): Promise<number> => {
    if (completion || abort) throw new Error("Transaction resource already completed.");
    try { return await target.executeRaw(query); }
    catch (primary) {
      const command = query.sql.trim().replace(/;$/, "").toUpperCase();
      if (command === "COMMIT" || command === "ROLLBACK") await cleanup();
      throw primary; // exact structured object, never secondary cleanup metadata
    }
  };
  return { provider: target.provider, adapterName: target.adapterName, options: target.options,
    queryRaw: async query => {
      if (completion || abort) throw new Error("Transaction resource already completed.");
      return target.queryRaw(query);
    }, executeRaw: execute,
    commit: async () => { if (abort) await abort; await finish("commit"); },
    rollback: async () => { if (abort) await abort; await finish("rollback"); } };
}
export function withReleaseRemedy(factory: SqlDriverAdapterFactory, secondary?: (stage: CleanupStage) => void): SqlDriverAdapterFactory {
  return { provider: factory.provider, adapterName: factory.adapterName, connect: async () => {
    const target = await factory.connect();
    const adapter: SqlDriverAdapter = { provider: target.provider, adapterName: target.adapterName,
      queryRaw: target.queryRaw.bind(target), executeRaw: target.executeRaw.bind(target),
      executeScript: target.executeScript.bind(target), dispose: target.dispose.bind(target),
      ...(target.getConnectionInfo ? { getConnectionInfo: target.getConnectionInfo.bind(target) } : {}),
      startTransaction: async level => releaseOnce(await target.startTransaction(level), secondary) };
    return adapter;
  } };
}
