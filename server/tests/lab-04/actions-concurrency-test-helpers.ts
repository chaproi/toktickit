import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { configureTestDatabaseEnvironment } from "../../src/testing/test-database.js";

// Same row-blocker/observed-gate strategy as issue33-test-helpers, with exact
// backend chains and finally-drained requests before fixture deletion.
export async function orderedUserRace<T>(userId: number, first: () => PromiseLike<T>, second: () => PromiseLike<T>) {
  const identity = configureTestDatabaseEnvironment();
  const operational = process.env.TOKTICKIT_DEVELOPMENT_DATABASE_URL;
  if (!operational || decodeURIComponent(new URL(operational).pathname.slice(1)) === identity.databaseName) {
    throw new Error("Race coordination requires a distinct guarded test database.");
  }
  const blocker = new Client({ connectionString: process.env.DATABASE_URL, application_name: `issue44-race-blocker-${randomUUID()}` });
  const observer = new Client({ connectionString: process.env.DATABASE_URL, application_name: `issue44-race-observer-${randomUUID()}` });
  const pending: Array<Promise<{ value: T } | { failed: true }>> = [];
  let open = false;
  const start = (operation: () => PromiseLike<T>) => {
    const promise = Promise.resolve().then(operation).then((value) => ({ value }), () => ({ failed: true as const }));
    pending.push(promise);
    return promise;
  };
  const observe = async (sql: string, parameters: number[]) => {
    const deadline = performance.now() + 2_500;
    while (performance.now() < deadline) {
      const result = await observer.query<{ pid: number }>(sql, parameters);
      if (result.rows.length === 1) return result.rows[0].pid;
      await new Promise((resolve) => setTimeout(resolve, 10)); // Bounded observation polling, not ordering by sleep.
    }
    throw new Error("Required PostgreSQL race lock chain was not observed within its finite budget.");
  };
  try {
    await blocker.connect(); await observer.connect();
    const live = await blocker.query<{ database: string; schema: string }>('SELECT current_database() AS database,current_schema() AS schema');
    expect(live.rows[0].database === identity.databaseName && live.rows[0].schema === identity.schema,
      "Live race target matches the dedicated isolation guard; identifiers redacted").toBe(true);
    await blocker.query("BEGIN"); open = true;
    const pid = (await blocker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    await blocker.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE', [userId]);
    const firstPending = start(first);
    const firstPid = await observe(`
      SELECT activity.pid FROM pg_stat_activity activity
      WHERE $1::integer = ANY(pg_blocking_pids(activity.pid))
      AND EXISTS (SELECT 1 FROM pg_locks gate WHERE gate.pid=activity.pid
        AND gate.locktype='advisory' AND gate.classid=1::oid AND gate.objid=$2::oid
        AND gate.objsubid=2 AND gate.granted)
    `, [pid, userId]);
    const secondPending = start(second);
    const secondPid = await observe(`
      SELECT waiting.pid FROM pg_locks waiting
      WHERE waiting.locktype='advisory' AND waiting.classid=1::oid
        AND waiting.objid=$1::oid AND waiting.objsubid=2 AND NOT waiting.granted
        AND $2::integer = ANY(pg_blocking_pids(waiting.pid))
    `, [userId, firstPid]);
    expect(secondPid === firstPid, "Two distinct live request backends overlap").toBe(false);
    await blocker.query("COMMIT"); open = false;
    const [a, b] = await Promise.all([firstPending, secondPending]);
    if (!("value" in a) || !("value" in b)) throw new Error("Race HTTP transport failed; details redacted.");
    console.info("Race evidence: first holds target User gate and waits on owned row blocker; second waits on first's gate; distinct backends overlap; blocker released.");
    return { first: a.value, second: b.value };
  } finally {
    if (open) await blocker.query("ROLLBACK").catch(() => undefined);
    await Promise.all(pending); // Even failed coordination drains requests before cleanup.
    const closed = await Promise.allSettled([observer.end(), blocker.end()]);
    expect(closed.every((result) => result.status === "fulfilled"), "Both owned race clients disconnect").toBe(true);
    console.info("Race cleanup: blocker released; requests drained before fixture cleanup; both owned clients disconnected; no injection resources.");
  }
}

export async function ticketState(prisma: PrismaClient, ticketId: number) {
  const [ticket, actions, history, receipts] = await Promise.all([
    prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } }),
    prisma.action.findMany({ where: { ticketId }, orderBy: { id: "asc" } }),
    prisma.actionHistory.findMany({ where: { action: { ticketId } }, orderBy: { id: "asc" } }),
    prisma.mutationReceipt.findMany({ where: { ticketId }, orderBy: { id: "asc" } }),
  ]);
  return { ticket, actions, history, receipts };
}
