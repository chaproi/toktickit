import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { deadlineClient } from "./deadline.js";
import { withReleaseRemedy } from "./remedy.js";

// One real pool-wait failure. Public DEBUG output is counted by the parent;
// it is diagnostic evidence only, never error attribution or a retry mechanism.
class ConnectBudgetClient extends pg.Client {
  constructor(config: pg.ClientConfig = {}) {
    super({ ...config, password: config.password, connectionTimeoutMillis: 5000 });
  }
}
const pool = new pg.Pool({ connectionString: process.env.EVAL_DATABASE_URL,
  options: `-c search_path=${process.env.EVAL_SCHEMA!}`, application_name: "issue49-start-retention",
  max: 1, connectionTimeoutMillis: 10000, idleTimeoutMillis: 300000, Client: ConnectBudgetClient });
const wrapper = deadlineClient({ adapter: withReleaseRemedy(new PrismaPg(pool, { schema: process.env.EVAL_SCHEMA! })) });
let held: pg.PoolClient | undefined;
let callbacks = 0;
const report: Record<string, unknown> = { mode: "one-real-late-pool-rejection-retention-diagnostic", failures: 1 };
try {
  await wrapper.client.$connect(); held = await pool.connect();
  const start = performance.now();
  await assert.rejects(wrapper.client.$transaction(async () => { callbacks++; }, { maxWait: 60 }),
    error => (error as { code?: unknown }).code === "P2028");
  report.callerElapsedMs = performance.now() - start;
  await wrapper.drain(); report.drainElapsedMs = performance.now() - start;
  assert.equal(callbacks, 0); assert.equal(wrapper.pendingCount(), 0);
  assert.equal(pool.totalCount - pool.idleCount, 1); // only the owned holder
  held.release(); held = undefined;
  console.log("retention-marker:drained-before-disconnect");
  const [row] = await wrapper.client.$queryRaw<Array<{ n: number }>>`SELECT 1::int AS n`;
  assert.equal(row.n, 1);
  console.log("retention-marker:public-disconnect");
  await wrapper.client.$disconnect();
  console.log("retention-marker:public-disconnect-complete");
  assert.equal(pool.totalCount - pool.idleCount, 0);
  report.callbacks = callbacks; report.pending = wrapper.pendingCount();
  report.checkedOutAfterHolderRelease = 0;
} finally {
  held?.release(); await wrapper.drain(); await wrapper.client.$disconnect(); await pool.end();
  await writeFile(process.env.EVAL_RESULT!, JSON.stringify(report, null, 2) + "\n");
}
