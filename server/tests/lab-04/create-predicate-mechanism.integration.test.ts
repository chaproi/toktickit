import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { beforeAll, afterAll, expect, it } from "vitest";
import { ActionCreateFixtures } from "./action-create-test-fixtures.js";
import { serverDirectory, verifiedTestTarget } from "./migration-test-fixtures.js";

// Isolated PostgreSQL mechanism proof, NOT authorized endpoint/workflow GREEN.
// Five finite contrasts execute real statement subsets with real constraints.
const variants = ["ticket-default", "ticket-index", "receipt-default", "receipt-index", "receipt-no-negative-read"] as const;
const fixtures = new ActionCreateFixtures();
beforeAll(async () => { verifiedTestTarget(); await fixtures.initialize(); });
afterAll(async () => { await fixtures.cleanup(); });

it.each(variants)("isolates the actual %s read/write predicate mechanism", async variant => {
  const target = verifiedTestTarget();
  const clients = [new Client({ connectionString: target.databaseUrl }), new Client({ connectionString: target.databaseUrl })];
  const observer = new Client({ connectionString: target.databaseUrl });
  const ticketMode = variant.startsWith("ticket"), indexMode = variant.endsWith("index");
  const negativeRead = variant !== "receipt-no-negative-read";
  const report: Record<string, any> = { mode: "minimal-SQL-mechanism-not-application-GREEN", variant,
    startedAt: new Date().toISOString(), outcomes: [], predicateLocks: [], cleanup: {} };
  const parents = [await fixtures.parent(), await fixtures.parent()];
  const actions = [await fixtures.read.action(parents[0].id), await fixtures.read.action(parents[1].id)];
  const workers = [fixtures.staff.user.id, fixtures.administrator.user.id], keys = [randomUUID(), randomUUID()];
  const active = [false, false];
  try {
    await observer.connect();
    report.fixtureScale = (await observer.query(`SELECT (SELECT count(*)::int FROM "Ticket") AS tickets,
      (SELECT count(*)::int FROM "Action") AS actions,(SELECT count(*)::int FROM "MutationReceipt") AS receipts`)).rows[0];
    const backends: number[] = [];
    for (const [index, client] of clients.entries()) {
      await client.connect(); await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE"); active[index] = true;
      if (indexMode) await client.query("SET LOCAL enable_seqscan=off");
      backends.push((await client.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
      if (ticketMode) {
        const found = await client.query('SELECT id,"currentStatus","updatedAt" FROM "Ticket" WHERE id=$1 FOR UPDATE', [parents[index].id]);
        expect(found.rowCount).toBe(1);
      } else if (negativeRead) {
        const found = await client.query('SELECT id FROM "MutationReceipt" WHERE "actorId"=$1 AND "clientMutationId"=$2::uuid LIMIT 1', [workers[index], keys[index]]);
        expect(found.rowCount).toBe(0);
      }
    }
    report.predicateLocks = (await observer.query(`SELECT l.pid AS backend,l.locktype,c.relname AS relation,l.page,l.tuple
      FROM pg_locks l LEFT JOIN pg_class c ON c.oid=l.relation
      WHERE l.pid=ANY($1::int[]) AND l.mode='SIReadLock' ORDER BY l.pid,c.relname,l.page,l.tuple`, [backends])).rows;
    for (const [index, client] of clients.entries()) {
      let stage = "write";
      try {
        if (ticketMode) {
          await client.query(`UPDATE "Ticket" SET "updatedAt"=timezone('UTC',clock_timestamp()) WHERE id=$1`, [parents[index].id]);
        } else {
          await client.query(`INSERT INTO "MutationReceipt" ("actorId","clientMutationId",operation,"ticketId","actionId","inputFingerprint","safeResponse")
            VALUES ($1,$2::uuid,'CREATE_ACTION',$3,$4,$5,$6::jsonb)`, [workers[index], keys[index], parents[index].id, actions[index].id,
            "a".repeat(64), JSON.stringify({ action: fixtures.read.dto(actions[index]), ticketUpdatedAt: parents[index].updatedAt.toISOString() })]);
        }
        stage = "commit"; await client.query("COMMIT"); active[index] = false;
        report.outcomes.push({ command: index, committed: true });
      } catch (error) {
        const code = error !== null && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
        expect(code, "Only actual structured serialization rejection is a mechanism observation").toBe("40001");
        await client.query("ROLLBACK"); active[index] = false;
        report.outcomes.push({ command: index, committed: false, sqlState: code, stage });
      }
    }
    expect(report.outcomes[0].committed).toBe(true);
    if (variant === "ticket-default" || variant === "receipt-default" || variant === "receipt-index") {
      expect(report.outcomes.filter((outcome: any) => outcome.committed)).toHaveLength(1);
    }
    if (variant === "receipt-no-negative-read") expect(report.outcomes.every((outcome: any) => outcome.committed)).toBe(true);
    for (const outcome of report.outcomes) {
      if (ticketMode) {
        const parent = await fixtures.prisma.ticket.findUniqueOrThrow({ where: { id: parents[outcome.command].id } });
        expect(parent.updatedAt.getTime() > parents[outcome.command].updatedAt.getTime()).toBe(outcome.committed);
      } else {
        const count = await fixtures.prisma.mutationReceipt.count({ where: { actorId: workers[outcome.command], clientMutationId: keys[outcome.command] } });
        expect(count).toBe(outcome.committed ? 1 : 0);
      }
    }
    report.persistenceVerified = true;
  } finally {
    for (const [index, client] of clients.entries()) {
      try { if (active[index]) await client.query("ROLLBACK"); } finally { await client.end(); }
    }
    await observer.end(); report.cleanup.connectionsClosed = true; report.finishedAt = new Date().toISOString();
    const directory = resolve(serverDirectory, "../artifacts/lab-04/hardening"); mkdirSync(directory, { recursive: true });
    const filename = `create-predicate-${new Date().toISOString().slice(0, 10)}-${variant}-${randomUUID().slice(0, 8)}.json`;
    writeFileSync(resolve(directory, filename), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    console.info(`Predicate mechanism artifact: ${filename}`);
  }
}, 120_000);
