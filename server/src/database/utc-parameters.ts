import type { SqlDriverAdapterFactory, SqlQueryable, SqlQuery, Transaction } from "@prisma/driver-adapter-utils";

// Native Prisma Date bindings carry an explicit UTC instant. The pg adapter's
// datetime formatter omits the offset, which changes raw ::timestamptz casts
// under Asia/Bangkok (including throttle and drill-down predicates). Preserve
// typed datetime instants at the public SqlQuery boundary; never reinterpret
// arbitrary text/JSON, rewrite SQL, or change the database session timezone.
export function utcParameters(query: SqlQuery): SqlQuery {
  const argTypes = query.argTypes.map(type => type.scalarType === "datetime" &&
    !["DATE", "TIME", "TIMETZ"].includes(type.dbType ?? "") ? { ...type, scalarType: "string" as const } : type);
  if (argTypes.every((type, index) => type === query.argTypes[index])) return query;
  const instant = (value: unknown) => value === null ? null : new Date(value as string | number | Date).toISOString();
  return { ...query, argTypes, args: query.args.map((value, index) => argTypes[index] === query.argTypes[index] ? value :
    query.argTypes[index].arity === "list" && Array.isArray(value) ? value.map(instant) : instant(value)) };
}
export function withUtcParameters(factory: SqlDriverAdapterFactory): SqlDriverAdapterFactory {
  const wrap = (target: SqlQueryable): SqlQueryable => ({ provider: target.provider, adapterName: target.adapterName,
    queryRaw: query => target.queryRaw(utcParameters(query)), executeRaw: query => target.executeRaw(utcParameters(query)) });
  return { provider: factory.provider, adapterName: factory.adapterName, connect: async () => {
    const target = await factory.connect();
    return { ...wrap(target), executeScript: target.executeScript.bind(target), dispose: target.dispose.bind(target),
      ...(target.getConnectionInfo ? { getConnectionInfo: target.getConnectionInfo.bind(target) } : {}),
      startTransaction: async level => {
        const tx = await target.startTransaction(level);
        const transaction: Transaction = { ...wrap(tx), options: tx.options,
          commit: tx.commit.bind(tx), rollback: tx.rollback.bind(tx) };
        return transaction;
      } };
  } };
}
