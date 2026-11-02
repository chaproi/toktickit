import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import pg from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { deadlineClient } from "./deadline.js";
import { connectionConfiguration } from "./configuration.js";
import { withReleaseRemedy } from "./remedy.js";
import { structured } from "./observe.js";

// One bounded configuration differential, not another deadline-suite attempt.
// No raw errors, SQL, connection fields or private paths are serialized.
const rows: unknown[] = [];
const url = new URL(process.env.EVAL_DATABASE_URL!);
url.searchParams.set("schema", process.env.EVAL_SCHEMA!);
url.searchParams.set("application_name", "issue49-start-differential");
const mapped = connectionConfiguration(url.href);
const safe = (error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  const row = error !== null && typeof error === "object" ? error : {};
  const cause = "cause" in row && row.cause !== null && typeof row.cause === "object" ? row.cause : {};
  return { classification: structured(error), name: error instanceof Error ? error.name : "unknown",
    ownKeys: Object.keys(row).filter(k => /^[a-zA-Z_]{1,40}$/.test(k)),
    causeKeys: Object.keys(cause).filter(k => /^[a-zA-Z_]{1,40}$/.test(k)),
    messageHash: createHash("sha256").update(message).digest("hex"),
    messageMarkers: ["draining", "completed", "connect", "timeout", "authentication", "password", "property", "transaction", "closed", "recursive", "stack", "ssl", "certificate", "schema", "client"]
      .filter(word => message.toLowerCase().includes(word)),
    knownMessage: ["SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string", "Database client is draining.", "Transaction resource already completed.",
      "Called end on pool more than once", "Cannot use a pool after calling end on the pool", "timeout exceeded when trying to connect",
      "Connection terminated unexpectedly", "Client was closed and is not queryable", "Transaction startup deadline exceeded."].find(text => text === message) ?? null };
};
for (const kind of ["direct-pg", "unwrapped-prisma", "public-deadline-client"] as const) {
  const pool = new pg.Pool(mapped.pool);
  const start = performance.now();
  let entered = false;
  let cleanup: () => Promise<void> = async () => {};
  try {
    if (kind === "direct-pg") {
      const result = await pool.query("SELECT 1::int AS n");
      rows.push({ kind, ok: result.rows[0].n === 1, elapsedMs: performance.now() - start });
    } else {
      const adapter = withReleaseRemedy(new PrismaPg(pool, { schema: mapped.schema }));
      const wrapper = kind === "public-deadline-client" ? deadlineClient({ adapter }) : undefined;
      const client = wrapper?.client ?? new PrismaClient({ adapter });
      cleanup = () => client.$disconnect();
      try {
        const result = await client.$transaction(async tx => { entered = true;
          await tx.$executeRaw`SET TRANSACTION READ ONLY`;
          return tx.$queryRaw<Array<{ n: number }>>`SELECT 1::int AS n`;
        });
        rows.push({ kind, ok: result[0].n === 1, elapsedMs: performance.now() - start, entered,
          statistics: wrapper?.statistics, pending: wrapper?.pendingCount() });
      } catch (error) {
        rows.push({ kind, ok: false, elapsedMs: performance.now() - start, entered,
          error: safe(error), statistics: wrapper?.statistics, pending: wrapper?.pendingCount() });
      }
    }
  } catch (error) { rows.push({ kind, ok: false, elapsedMs: performance.now() - start, error: safe(error) }); }
  finally { await cleanup(); await pool.end(); }
}
await writeFile(process.env.EVAL_RESULT!, JSON.stringify({ diagnosticOnly: true, rows }, null, 2) + "\n");
console.log(JSON.stringify({ diagnosticOnly: true, rows }));
