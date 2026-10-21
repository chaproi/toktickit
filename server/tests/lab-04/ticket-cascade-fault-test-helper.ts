import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { expect } from "vitest";
import { configureTestDatabaseEnvironment } from "../../src/testing/test-database.js";

type Child = { id: number; version: number; updatedAt: Date };
type Observation = { entries: number; earlierWritesObserved: boolean };

// Test-only, rollback-surviving probes. No wrapper transaction surrounds HTTP.
// Fail on the second owned cascade history insertion, regardless of child order.
export async function withLateCascadeFailure(
  prisma: PrismaClient,
  ticketId: number,
  actorId: number,
  children: readonly Child[],
  work: (observe: () => Promise<Observation>) => Promise<void>,
) {
  const identity = configureTestDatabaseEnvironment();
  const [live] = await prisma.$queryRaw<Array<{ database: string; schema: string }>>`
    SELECT current_database() AS database, current_schema() AS schema`;
  expect(live.database === identity.databaseName && live.schema === identity.schema,
    "Cascade failpoint uses the live guarded dedicated target; values withheld").toBe(true);
  if (children.length < 2 || [ticketId, actorId, ...children.flatMap((child) => [child.id, child.version])]
    .some((value) => !Number.isSafeInteger(value) || value <= 0) ||
    children.some((child) => !Number.isFinite(child.updatedAt.getTime()))) {
    throw new Error("Invalid owned cascade failpoint scope.");
  }
  const suffix = randomUUID().replaceAll("-", "");
  const triggerName = `workflow46_cascade_trigger_${suffix}`;
  const functionName = `workflow46_cascade_fn_${suffix}`;
  const entryName = `workflow46_cascade_entry_${suffix}`;
  const proofName = `workflow46_cascade_proof_${suffix}`;
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const schema = quote(identity.schema);
  const entry = `${schema}.${quote(entryName)}`, proof = `${schema}.${quote(proofName)}`;
  const regclass = (value: string) => `'${value.replaceAll("'", "''")}'::regclass`;
  const original = children.map((child) =>
    `(${child.id},${child.version},'${child.updatedAt.toISOString()}'::timestamp)`).join(",");
  let entryOwned = false, proofOwned = false, functionOwned = false, triggerOwned = false;
  const observe = async (): Promise<Observation> => {
    const [entered] = await prisma.$queryRawUnsafe<Array<{ calls: number; called: boolean }>>(
      `SELECT last_value::int AS calls, is_called AS called FROM ${entry}`);
    const [observed] = await prisma.$queryRawUnsafe<Array<{ called: boolean }>>(
      `SELECT is_called AS called FROM ${proof}`);
    return { entries: entered.called ? entered.calls : 0, earlierWritesObserved: observed.called };
  };
  try {
    await prisma.$executeRawUnsafe(`CREATE SEQUENCE ${entry}`); entryOwned = true;
    await prisma.$executeRawUnsafe(`CREATE SEQUENCE ${proof}`); proofOwned = true;
    await prisma.$executeRawUnsafe(`CREATE FUNCTION ${schema}.${quote(functionName)}()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW."event"='ACTION_CANCELLED_BY_TICKET' AND NEW."actorId"=${actorId}
          AND NEW."actionId" IN (${children.map((child) => child.id).join(",")})
          AND EXISTS (SELECT 1 FROM ${schema}."Action" a
            WHERE a."id"=NEW."actionId" AND a."ticketId"=${ticketId}) THEN
          IF nextval(${regclass(entry)})=2 THEN
            IF EXISTS (
              SELECT 1 FROM ${schema}."ActionHistory" h
              JOIN ${schema}."Action" a ON a."id"=h."actionId"
              JOIN (VALUES ${original}) old("id","version","updatedAt") ON old."id"=a."id"
              JOIN ${schema}."TicketStatusHistory" t ON t."id"=h."sourceTicketStatusHistoryId"
              WHERE h."actionId"<>NEW."actionId" AND a."ticketId"=${ticketId}
                AND h."event"='ACTION_CANCELLED_BY_TICKET' AND h."actorId"=${actorId}
                AND h."sourceTicketStatusHistoryId"=NEW."sourceTicketStatusHistoryId"
                AND t."ticketId"=${ticketId} AND t."toStatus"='CANCELLED' AND t."actorId"=${actorId}
                AND a."status"='CANCELLED' AND a."version"=old."version"+1
                AND a."updatedAt">old."updatedAt" AND h."actionVersion"=a."version"
                AND h."before"->>'version'=old."version"::text
                AND h."after"->>'version'=a."version"::text
            ) THEN PERFORM nextval(${regclass(proof)}); END IF;
            RAISE EXCEPTION 'Owned later cascade write failure' USING ERRCODE='P0001';
          END IF;
        END IF;
        RETURN NEW;
      END; $$`); functionOwned = true;
    await prisma.$executeRawUnsafe(`CREATE TRIGGER ${quote(triggerName)} AFTER INSERT
      ON ${schema}."ActionHistory" FOR EACH ROW EXECUTE FUNCTION ${schema}.${quote(functionName)}()`);
    triggerOwned = true;
    await work(observe);
  } finally {
    // Attempt every owned cleanup even if an earlier cleanup step fails.
    const failures: unknown[] = [];
    if (entryOwned && proofOwned) {
      try {
        const observed = await observe();
        console.info(`Cascade failpoint: entries=${observed.entries}; earlier real Action/history/source writes observed=${observed.earlierWritesObserved}.`);
      } catch (error) { failures.push(error); }
    }
    for (const [owned, statement] of [
      [triggerOwned, `DROP TRIGGER ${quote(triggerName)} ON ${schema}."ActionHistory"`],
      [functionOwned, `DROP FUNCTION ${schema}.${quote(functionName)}()`],
      [entryOwned, `DROP SEQUENCE ${entry}`], [proofOwned, `DROP SEQUENCE ${proof}`],
    ] as const) {
      if (owned) try { await prisma.$executeRawUnsafe(statement); } catch (error) { failures.push(error); }
    }
    const [remaining] = await prisma.$queryRaw<Array<{ count: number }>>`SELECT
      ((SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname=${identity.schema} AND c.relname IN (${entryName},${proofName}))
      +(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname=${identity.schema} AND p.proname=${functionName})
      +(SELECT count(*) FROM pg_trigger WHERE tgname=${triggerName}))::int AS count`;
    expect(remaining.count, "All owned cascade triggers/functions/sequences removed").toBe(0);
    console.info("Cascade injection cleanup verified: owned resources remaining=0.");
    if (failures.length) throw new Error("Owned cascade probe/cleanup failed; diagnostic values withheld.");
  }
}
