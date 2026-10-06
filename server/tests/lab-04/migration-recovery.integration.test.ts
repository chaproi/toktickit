import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmdirSync, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { hashPassword } from "../../src/auth/password.js";
import {
  applyLab3Baseline, applyLaterMigrations, identifier, lab3Boundary, migrationDirectory,
  oldTables, populateLab3, query, snapshot, verifiedTestTarget, withDisposableSchema,
} from "./migration-test-fixtures.js";

// AC-31 / T-31 verification, not a manufactured RED phase. Native-tool absence
// is an explicit blocked failure, never a skipped/passing backup claim.
const allTables = { ...oldTables, Action: "id", ActionHistory: "id", MutationReceipt: "id", SeedFixture: "id" };
const runFile = promisify(execFile);
type Statement = { sql: string; values: unknown[] };

function insert(table: string, fields: Record<string, unknown>): Statement {
  const entries = Object.entries(fields);
  return {
    sql: `INSERT INTO ${identifier(table)} (${entries.map(([key]) => identifier(key)).join(",")})
          VALUES (${entries.map((_, index) => `$${index + 1}`).join(",")}) RETURNING id`,
    values: entries.map(([, value]) => value),
  };
}
async function execute(client: Client, statement: Statement): Promise<number> {
  const result = await query<{ id: number }>(client, statement.sql, statement.values);
  return result.rows[0]!.id;
}
function action(overrides: Record<string, unknown> = {}): Statement {
  return insert("Action", {
    ticketId: 1, createdById: 2, assigneeId: 2, description: "Synthetic diagnostic action", ...overrides,
  });
}
function errorIdentity(error: unknown) {
  if (typeof error !== "object" || error === null) return {};
  const value = error as Record<string, unknown>;
  // Only trusted driver identifiers are returned, never message/detail/query.
  return { code: value.code, constraint: value.constraint, column: value.column };
}
async function compareData(client: Client, schema: string, before: Awaited<ReturnType<typeof snapshot>>) {
  const after = await snapshot(client, schema, before, allTables);
  for (const table of Object.keys(allTables)) {
    expect(after[table]?.count, `${table} count unchanged`).toBe(before[table]!.count);
    expect(after[table]?.checksum === before[table]!.checksum,
      `${table} canonical rows unchanged; sensitive values redacted`).toBe(true);
  }
}
async function rejectsUnchanged(
  client: Client, schema: string, statement: Statement,
  expected: { code: string; constraint?: string; column?: string }, setup: string[] = [],
) {
  const before = await snapshot(client, schema, undefined, allTables);
  await query(client, "BEGIN");
  try {
    for (const sql of setup) await query(client, sql);
    let rejected: unknown;
    try { await client.query(statement.sql, statement.values); } catch (error) { rejected = error; }
    expect(errorIdentity(rejected)).toMatchObject(expected);
    let aborted: unknown;
    try { await client.query("SELECT 1"); } catch (error) { aborted = error; }
    expect(errorIdentity(aborted)).toMatchObject({ code: "25P02" });
  } finally { await query(client, "ROLLBACK"); }
  // PostgreSQL serial sequence gaps are not transactional; this comparison
  // proves domain rows (including the Ticket numbering table), not gaplessness.
  await compareData(client, schema, before);
}
async function basicParents(client: Client) {
  await applyLab3Baseline(client);
  await applyLaterMigrations(client);
  const encoded = await hashPassword(`Aa1!${randomBytes(24).toString("base64url")}`);
  for (const id of [1, 2, 3]) {
    await query(client,
      `INSERT INTO "User" (id,name,email,role,"passwordHash","mustChangePassword")
       VALUES ($1,$2,$3,$4::"UserRole",$5,false)`,
      [id, `Verification user ${id}`, `verification-${id}@example.test`, id === 1 ? "REQUESTER" : "IT_STAFF", encoded]);
  }
  await query(client, `INSERT INTO "Category" (id,name) VALUES
    (1,'Verification category'),(2,'Independent registry category')`);
  await query(client, `INSERT INTO "RelatedSystem" (id,name) VALUES
    (1,'Verification system'),(2,'Independent registry system')`);
  for (const id of [1, 2]) {
    await query(client,
      `INSERT INTO "Ticket" (id,"ticketNumber","clientSubmissionId","requesterId","categoryId",
       "relatedSystemId",summary,"requestedPriority",description,"itPriority")
       VALUES ($1,$2,$3::uuid,1,1,1,'Verification Ticket','LOW','Synthetic verification Ticket','MEDIUM')`,
      [id, `TKT-2026-${String(id).padStart(5, "0")}`, randomUUID()]);
  }
}
async function actionSnapshot(client: Client, id: number) {
  const result = await query<{ value: Record<string, unknown> }>(client,
    `SELECT to_jsonb(a) AS value FROM "Action" a WHERE id=$1`, [id]);
  const value = result.rows[0]!.value;
  for (const key of ["actionAt", "createdAt", "updatedAt", "completedAt", "cancelledAt"]) {
    if (typeof value[key] === "string") value[key] = new Date(`${value[key]}Z`).toISOString();
  }
  return value;
}
function history(actionId: number, after: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return insert("ActionHistory", {
    actionId, actorId: 2, event: "ACTION_CREATED", actionVersion: 1,
    before: null, after, sourceTicketStatusHistoryId: null, ...overrides,
  });
}
function receipt(actionId: number, ticketId: number, key = randomUUID(), actorId = 2) {
  return insert("MutationReceipt", {
    actorId, clientMutationId: key, operation: "CREATE_ACTION", ticketId, actionId,
    inputFingerprint: createHash("sha256").update(JSON.stringify({ actionId, ticketId, key })).digest("hex"),
    safeResponse: { action: { id: actionId }, ticketUpdatedAt: "2026-10-06T00:00:00.000Z" },
  });
}
async function cancellationSource(client: Client) {
  return execute(client, insert("TicketStatusHistory", {
    ticketId: 1, actorId: 2, fromStatus: "NEW", toStatus: "CANCELLED", reason: "Synthetic cancellation reason",
  }));
}

describe("AC-31 / T-31 database constraints and historical references", () => {
  it("accepts coherent lifecycle/follow-up rows and rejects invalid combinations without row changes", async () => {
    await withDisposableSchema("constraints", async (client, schema) => {
      await basicParents(client);
      const completed = new Date();
      for (const fields of [
        {}, { status: "IN_PROGRESS" },
        { followUpRequired: true, followUpNote: "Another diagnostic session" },
        { status: "COMPLETED", performedById: 3, completedAt: completed, result: "Checks completed" },
        { status: "COMPLETED", performedById: 3, completedAt: completed, result: "Checks completed",
          followUpRequired: true, followUpNote: "Further work is descriptive" },
        { status: "CANCELLED", cancelledAt: completed, cancellationReason: "No longer needed" },
        { status: "CANCELLED", cancelledAt: completed, cancellationReason: "No longer needed",
          result: "Retained draft result", followUpRequired: true, followUpNote: "Retained follow-up" },
      ]) await execute(client, action(fields));
      const cases = [
        { fields: { version: 0 }, constraint: "Action_version_positive_check" },
        { fields: { version: -1 }, constraint: "Action_version_positive_check" },
        { fields: { description: "abcd" }, constraint: "Action_description_check" },
        { fields: { result: "" }, constraint: "Action_result_check" },
        { fields: { attachmentNotes: "" }, constraint: "Action_attachmentNotes_check" },
        { fields: { followUpRequired: true }, constraint: "Action_follow_up_check" },
        { fields: { followUpRequired: true, followUpNote: "" }, constraint: "Action_follow_up_check" },
        { fields: { followUpNote: "Nonempty with false flag" }, constraint: "Action_follow_up_check" },
        { fields: { performedById: 3 }, constraint: "Action_lifecycle_check" },
        { fields: { status: "COMPLETED", result: "Completed" }, constraint: "Action_lifecycle_check" },
        { fields: { status: "COMPLETED", performedById: 3, completedAt: completed }, constraint: "Action_lifecycle_check" },
        { fields: { status: "CANCELLED", cancelledAt: completed }, constraint: "Action_lifecycle_check" },
        { fields: { status: "CANCELLED", cancelledAt: completed, cancellationReason: "Valid reason", performedById: 3 }, constraint: "Action_lifecycle_check" },
      ];
      for (const testCase of cases) await rejectsUnchanged(client, schema, action(testCase.fields),
        { code: "23514", constraint: testCase.constraint });
      console.info("Constraint evidence: 7 coherent lifecycle rows accepted; 13 invalid rows rejected with named CHECKs and unchanged data.");
    });
  }, 30_000);

  it("enforces history uniqueness and creation/non-creation/snapshot/source rules", async () => {
    await withDisposableSchema("constraints", async (client, schema) => {
      await basicParents(client);
      const id = await execute(client, action());
      const initial = await actionSnapshot(client, id);
      await execute(client, history(id, initial));
      await rejectsUnchanged(client, schema, history(id, initial),
        { code: "23505", constraint: "ActionHistory_actionId_actionVersion_key" });
      const source = await cancellationSource(client);
      const later = { ...initial, version: 2 };
      for (const [overrides, expected] of [
        [{ before: initial }, { code: "23514", constraint: "ActionHistory_before_event_check" }],
        [{ before: "null" }, { code: "23514", constraint: "ActionHistory_before_event_check" }],
        [{ event: "ACTION_EDITED", actionVersion: 2 }, { code: "23514", constraint: "ActionHistory_before_event_check" }],
        [{ after: null }, { code: "23502", column: "after" }],
        [{ after: "null" }, { code: "23514", constraint: "ActionHistory_after_object_check" }],
        [{ event: "ACTION_EDITED", actionVersion: 2, before: initial, sourceTicketStatusHistoryId: source },
          { code: "23514", constraint: "ActionHistory_cascade_source_check" }],
        [{ event: "ACTION_CANCELLED_BY_TICKET", actionVersion: 2, before: initial },
          { code: "23514", constraint: "ActionHistory_cascade_source_check" }],
      ] as const) await rejectsUnchanged(client, schema, history(id, later, overrides), expected);
      await query(client, `UPDATE "Action" SET version=2,description='Changed diagnostic action' WHERE id=$1`, [id]);
      await execute(client, history(id, await actionSnapshot(client, id),
        { event: "ACTION_EDITED", actionVersion: 2, before: initial }));
      const cascadeAction = await execute(client, action());
      const cascadeBefore = await actionSnapshot(client, cascadeAction);
      await query(client, `UPDATE "Action" SET status='CANCELLED',"cancelledAt"=timezone('UTC',CURRENT_TIMESTAMP),
        "cancellationReason"='Synthetic cancellation reason',version=2 WHERE id=$1`, [cascadeAction]);
      await execute(client, history(cascadeAction, await actionSnapshot(client, cascadeAction), {
        event: "ACTION_CANCELLED_BY_TICKET", actionVersion: 2, before: cascadeBefore, sourceTicketStatusHistoryId: source,
      }));
      console.info("History evidence: creation/edit/cascade accepted; duplicate version and 7 invalid null/source combinations rejected.");
    });
  }, 30_000);

  it("scopes receipt uniqueness to actor/key across Tickets and requires exactly one registry target", async () => {
    await withDisposableSchema("constraints", async (client, schema) => {
      await basicParents(client);
      const first = await execute(client, action());
      const second = await execute(client, action({ ticketId: 2 }));
      const key = randomUUID();
      await execute(client, receipt(first, 1, key));
      await rejectsUnchanged(client, schema, receipt(second, 2, key),
        { code: "23505", constraint: "MutationReceipt_actorId_clientMutationId_key" });
      await execute(client, receipt(second, 2, key, 3));
      for (const fields of [{}, { userId: 3, actionId: first }]) {
        await rejectsUnchanged(client, schema, insert("SeedFixture", { fixtureKey: randomUUID(), ...fields }),
          { code: "23514", constraint: "SeedFixture_exactly_one_target_check" });
      }
      for (const [field, target] of [["userId", 3], ["categoryId", 1], ["relatedSystemId", 1], ["ticketId", 2], ["actionId", first]] as const) {
        await execute(client, insert("SeedFixture", { fixtureKey: field, [field]: target }));
      }
      await rejectsUnchanged(client, schema, insert("SeedFixture", { fixtureKey: "userId", ticketId: 2 }),
        { code: "23505", constraint: "SeedFixture_fixtureKey_key" });
      console.info("Receipt/registry evidence: same actor/key cross-Ticket rejected; different actor accepted; zero/two targets rejected; all five single targets accepted.");
    });
  }, 30_000);

  it.each([
    ["Action", "ticketId", "Ticket", 1], ["Action", "createdById", "User", 3],
    ["Action", "assigneeId", "User", 3], ["Action", "performedById", "User", 3],
    ["ActionHistory", "actionId", "Action", 1], ["ActionHistory", "actorId", "User", 3],
    ["ActionHistory", "sourceTicketStatusHistoryId", "TicketStatusHistory", 1],
    ["MutationReceipt", "actorId", "User", 3], ["MutationReceipt", "ticketId", "Ticket", 1],
    ["MutationReceipt", "actionId", "Action", 1],
    ["SeedFixture", "userId", "User", 3], ["SeedFixture", "categoryId", "Category", 2],
    ["SeedFixture", "relatedSystemId", "RelatedSystem", 2], ["SeedFixture", "ticketId", "Ticket", 2],
    ["SeedFixture", "actionId", "Action", 1],
  ] as const)("RESTRICT %s.%s independently protects %s", async (table, column, target, targetId) => {
    await withDisposableSchema("constraints", async (client, schema) => {
      await basicParents(client);
      let id = 1;
      if (table === "Action") {
        id = await execute(client, action(column === "performedById"
          ? { status: "COMPLETED", performedById: 3, completedAt: new Date(), result: "Completed diagnostic" }
          : { [column]: targetId }));
      } else if (table === "ActionHistory" || table === "MutationReceipt" || column === "actionId") {
        id = await execute(client, action());
      }
      if (table === "ActionHistory") {
        const value = await actionSnapshot(client, id);
        if (column === "sourceTicketStatusHistoryId") {
          const source = await cancellationSource(client);
          await execute(client, history(id, { ...value, version: 2 }, {
            event: "ACTION_CANCELLED_BY_TICKET", actionVersion: 2, before: value, sourceTicketStatusHistoryId: source,
          }));
        } else await execute(client, history(id, value, column === "actorId" ? { actorId: 3 } : {}));
      }
      if (table === "MutationReceipt") await execute(client, receipt(id, 1, randomUUID(), column === "actorId" ? 3 : 2));
      if (table === "SeedFixture") await execute(client, insert("SeedFixture", {
        fixtureKey: "restrict-test", [column]: targetId,
      }));
      // The receipt's parent Ticket also has an Action FK. Isolate this ONE
      // competing new FK transactionally on the disposable copy so it cannot
      // mask the original receipt FK. ROLLBACK restores it; no production SQL
      // or tested constraint is altered. Other cases need no FK isolation.
      const setup = table === "MutationReceipt" && column === "ticketId"
        ? ['ALTER TABLE "Action" DROP CONSTRAINT "Action_ticketId_fkey"'] : [];
      await rejectsUnchanged(client, schema,
        { sql: `DELETE FROM ${identifier(target)} WHERE id=$1`, values: [targetId] },
        { code: "23001", constraint: `${table}_${column}_fkey` }, setup);
      if (setup.length) {
        const restored = await query<{ count: number }>(client,
          `SELECT count(*)::int AS count FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
           JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=$1 AND c.conname='Action_ticketId_fkey'`, [schema]);
        expect(restored.rows[0]?.count).toBe(1);
      }
    });
  }, 30_000);
});

function foundationSql(): string {
  const migrations = readdirSync(migrationDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name > lab3Boundary).map((entry) => entry.name).sort();
  const sources = migrations.map((name) => readFileSync(resolve(migrationDirectory, name, "migration.sql"), "utf8"));
  const source = sources.find((sql) => sql.includes('CREATE TABLE "Action"'));
  if (!source) throw new Error("Committed Action foundation SQL is unavailable.");
  return source;
}

describe("AC-31 / T-31 failure recovery and native backup", () => {
  it("rolls back failed early DDL using the migration's own BEGIN and safely retries the unchanged SQL", async () => {
    await withDisposableSchema("recovery", async (client, schema) => {
      await applyLab3Baseline(client);
      await populateLab3(client);
      const before = await snapshot(client, schema);
      const sql = foundationSql();
      const early = sql.match(/CREATE TYPE "ActionStatus" AS ENUM[^;]+;/u);
      expect(early).not.toBeNull();
      const boundary = sql.indexOf(early![0]) + early![0].length;
      const prefix = sql.slice(0, boundary);
      expect(prefix).toMatch(/^BEGIN;$/mu);
      expect(sql.trim()).toMatch(/COMMIT;$/u);
      // Separate protocol sends avoid proving atomicity merely because pg
      // receives one multi-statement batch. BEGIN is from PRODUCTION SQL;
      // the only injected statement is the deterministic division-by-zero.
      await query(client, prefix);
      const earlyType = await query<{ count: number }>(client,
        `SELECT count(*)::int AS count FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
         WHERE n.nspname=$1 AND t.typname='ActionStatus'`, [schema]);
      expect(earlyType.rows[0]?.count).toBe(1);
      let failed: unknown;
      try { await client.query(`SELECT 1 / 0;\n${sql.slice(boundary)}`); } catch (error) { failed = error; }
      expect(errorIdentity(failed)).toMatchObject({ code: "22012" });
      let aborted: unknown;
      try { await client.query("SELECT 1"); } catch (error) { aborted = error; }
      expect(errorIdentity(aborted)).toMatchObject({ code: "25P02" });
      await query(client, "ROLLBACK");
      const afterType = await query<{ count: number }>(client,
        `SELECT count(*)::int AS count FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
         WHERE n.nspname=$1 AND t.typname='ActionStatus'`, [schema]);
      expect(afterType.rows[0]?.count).toBe(0);
      const tables = await query<{ count: number }>(client,
        `SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema=$1
         AND table_name=ANY($2::text[])`, [schema, ["Action", "ActionHistory", "MutationReceipt", "SeedFixture"]]);
      expect(tables.rows[0]?.count).toBe(0);
      const rolledBack = await snapshot(client, schema, before);
      for (const table of Object.keys(oldTables)) {
        expect(rolledBack[table]?.count).toBe(before[table]!.count);
        expect(rolledBack[table]?.checksum === before[table]!.checksum, `${table} unchanged; values redacted`).toBe(true);
      }
      await query(client, sql);
      const retried = await snapshot(client, schema, before);
      for (const table of Object.keys(oldTables)) {
        expect(retried[table]?.checksum === before[table]!.checksum, `${table} preserved after retry`).toBe(true);
      }
      const newTables = await query<{ count: number }>(client,
        `SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema=$1
         AND table_name=ANY($2::text[])`, [schema, ["Action", "ActionHistory", "MutationReceipt", "SeedFixture"]]);
      expect(newTables.rows[0]?.count).toBe(4);
      console.info("Recovery evidence: early enum existed; 22012/25P02; production transaction rollback removed DDL; unchanged SQL retry succeeded with preserved data.");
      console.info("Not covered: abrupt-process interruption or Prisma failed-deployment ledger recovery. This is a statement-failure/SQL-retry rehearsal.");
    });
  }, 30_000);

  it("backs up and restores all historical/new rows and relationships using native PostgreSQL tools", async () => {
    const tools = nativeTools();
    const target = verifiedTestTarget();
    const url = new URL(target.databaseUrl);
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      PGHOST: url.hostname, PGPORT: url.port || "5432", PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
      PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
      PGSSLMODE: url.searchParams.get("sslmode") || "prefer", PGOPTIONS: "-c timezone=UTC",
    };
    const temporary = mkdtempSync(join(tmpdir(), "toktickit-lab4-backup-"));
    const archive = join(temporary, "fixture.backup");
    try {
      await withDisposableSchema("backup", async (client, sourceSchema) => {
        await applyLab3Baseline(client);
        await populateLab3(client);
        await applyLaterMigrations(client);
        // Use all earlier-lab fixtures, including real synthetic credential and
        // session records, and materialize the four new tables with valid rows.
        const first = await execute(client, action({ ticketId: 12, createdById: 3, assigneeId: 3 }));
        const initial = await actionSnapshot(client, first);
        await execute(client, history(first, initial, { actorId: 3 }));
        await query(client, `UPDATE "Action" SET description='Updated backup diagnostic',version=2,
          "updatedAt"="createdAt"+interval '1 second' WHERE id=$1`, [first]);
        await execute(client, history(first, await actionSnapshot(client, first),
          { actorId: 3, event: "ACTION_EDITED", actionVersion: 2, before: initial }));
        await execute(client, receipt(first, 12, randomUUID(), 3));
        for (const [field, id] of [["userId", 3], ["categoryId", 1], ["relatedSystemId", 1], ["ticketId", 12], ["actionId", first]] as const) {
          await execute(client, insert("SeedFixture", { fixtureKey: `backup-${field}`, [field]: id }));
        }
        const before = await snapshot(client, sourceSchema, undefined, allTables);
        const beforeRelations = await relationships(client, sourceSchema);
        await native(tools.dump, ["--format=custom", `--schema=${sourceSchema}`, `--file=${archive}`, "--no-owner", "--no-privileges"], environment);
        expect(statSync(archive).size).toBeGreaterThan(0);
        await withDisposableSchema("restore", async (restoreClient, retainedSchema) => {
          // pg_restore has no schema-renaming switch. Reserve a second owned
          // name, move the live source there, and restore the archive to its
          // original now-vacant owned name with standard native options.
          await query(restoreClient, `DROP SCHEMA ${identifier(retainedSchema)} CASCADE`);
          await query(client, `ALTER SCHEMA ${identifier(sourceSchema)} RENAME TO ${identifier(retainedSchema)}`);
          await native(tools.restore,
            ["--dbname", environment.PGDATABASE!, "--single-transaction", "--exit-on-error", "--no-owner", "--no-privileges", archive], environment);
          await compareData(restoreClient, sourceSchema, before);
          expect(await relationships(restoreClient, sourceSchema)).toEqual(beforeRelations);
          await compareData(restoreClient, retainedSchema, before);
          console.info("Native backup/restore evidence: custom archive restored with pg_restore; all 15 table counts/checksums and FK relationships matched; sensitive values redacted.");
        });
      });
    } finally {
      // Only artifacts in the mkdtemp directory owned by this test are removed.
      if (existsSync(archive)) unlinkSync(archive);
      rmdirSync(temporary);
      expect(existsSync(temporary)).toBe(false);
      console.info("Backup artifact cleanup: temporary archive and owned directory removed.");
    }
  }, 30_000);
});

function nativeTools() {
  const candidates = ["", ...(() => {
    const root = join(process.env.ProgramFiles || "C:/Program Files", "PostgreSQL");
    if (!existsSync(root)) return [];
    return readdirSync(root).filter((name) => /^\d+$/u.test(name)).sort((a, b) => Number(b) - Number(a))
      .map((name) => join(root, name, "bin"));
  })()];
  for (const directory of candidates) {
    const extension = process.platform === "win32" ? ".exe" : "";
    const dump = directory ? join(directory, `pg_dump${extension}`) : "pg_dump";
    const restore = directory ? join(directory, `pg_restore${extension}`) : "pg_restore";
    try {
      const dumpVersion = execFileSync(dump, ["--version"], { encoding: "utf8", windowsHide: true });
      const restoreVersion = execFileSync(restore, ["--version"], { encoding: "utf8", windowsHide: true });
      console.info(`Native tools available: pg_dump ${dumpVersion.match(/\d+(?:\.\d+)*/u)?.[0]}; pg_restore ${restoreVersion.match(/\d+(?:\.\d+)*/u)?.[0]}.`);
      return { dump, restore };
    } catch { /* Try installed locations without logging arguments or stderr. */ }
  }
  throw new Error("BLOCKED: native pg_dump/pg_restore unavailable; backup evidence remains incomplete.");
}
async function native(program: string, args: string[], environment: NodeJS.ProcessEnv) {
  try { await runFile(program, args, { env: environment, windowsHide: true }); }
  catch { throw new Error("Native PostgreSQL backup/restore failed; connection arguments and stderr redacted."); }
}
async function relationships(client: Client, schema: string) {
  return (await query(client,
    `SELECT s.relname AS source_table,a.attname AS source_column,t.relname AS target_table,
            b.attname AS target_column,c.confdeltype::text AS delete_rule,c.confupdtype::text AS update_rule
     FROM pg_constraint c JOIN pg_class s ON s.oid=c.conrelid JOIN pg_namespace n ON n.oid=s.relnamespace
     JOIN pg_class t ON t.oid=c.confrelid JOIN pg_namespace target ON target.oid=t.relnamespace
     JOIN pg_attribute a ON a.attrelid=s.oid AND a.attnum=c.conkey[1]
     JOIN pg_attribute b ON b.attrelid=t.oid AND b.attnum=c.confkey[1]
     WHERE c.contype='f' AND n.nspname=$1 AND target.nspname=$1 ORDER BY source_table,source_column`, [schema])).rows;
}

describe("AC-31 / T-31 index definitions and observed access paths", () => {
  it("verifies catalogs and collects unforced EXPLAIN ANALYZE on representative Action/history data", async () => {
    await withDisposableSchema("indexes", async (client, schema) => {
      await basicParents(client);
      const indexes = (await query<{ table_name: string; index_name: string; columns: string[]; unique: boolean }>(client,
        `SELECT t.relname AS table_name,x.relname AS index_name,i.indisunique AS "unique",
                array_agg(a.attname::text ORDER BY k.ordinality) AS columns
         FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
         JOIN pg_class x ON x.oid=i.indexrelid CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,ordinality)
         JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.attnum
         WHERE n.nspname=$1 GROUP BY t.relname,x.relname,i.indisunique ORDER BY t.relname,x.relname`, [schema])).rows;
      for (const [table, columns, unique] of [
        ["Action", ["ticketId", "createdAt", "id"], false], ["Action", ["ticketId", "status"], false],
        ["Action", ["assigneeId", "status", "createdAt", "id"], false],
        ["ActionHistory", ["actionId", "createdAt", "id"], false], ["ActionHistory", ["actionId", "actionVersion"], true],
        ["MutationReceipt", ["actorId", "clientMutationId"], true], ["SeedFixture", ["fixtureKey"], true],
      ] as const) {
        expect(indexes.some((index) => index.table_name === table && index.unique === unique &&
          JSON.stringify(index.columns) === JSON.stringify(columns)), `${table} approved index definition`).toBe(true);
      }
      console.info(`Existing-index inventory: Ticket=${indexes.filter((index) => index.table_name === "Ticket").length}; TicketStatusHistory=${indexes.filter((index) => index.table_name === "TicketStatusHistory").length}; approved new indexes/uniqueness verified.`);
      const encoded = await hashPassword(`Aa1!${randomBytes(24).toString("base64url")}`);
      await query(client, `INSERT INTO "User" (id,name,email,role,"passwordHash","mustChangePassword")
        SELECT g,'Query staff '||g,'query-staff-'||g||'@example.test','IT_STAFF',$1,false FROM generate_series(100,199) g`, [encoded]);
      await query(client, `INSERT INTO "Ticket" (id,"ticketNumber","clientSubmissionId","requesterId","categoryId",
        "relatedSystemId",summary,"requestedPriority",description,"itPriority")
        SELECT g,'TKT-2026-'||lpad(g::text,5,'0'),('00000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,
          1,1,1,'Query Ticket '||g,'LOW','Representative query Ticket','MEDIUM' FROM generate_series(1001,1200) g`);
      await query(client, `INSERT INTO "Action" ("ticketId","createdById","assigneeId",description,status,result,
        "performedById","completedAt","cancelledAt","cancellationReason","actionAt","createdAt","updatedAt",version)
        SELECT 1001+(g-1)/40,2,100+((g-1)/4)%100,'Representative action '||g,
          (ARRAY['PLANNED','IN_PROGRESS','COMPLETED','CANCELLED'])[(g-1)%4+1]::"ActionStatus",
          CASE WHEN (g-1)%4=2 THEN 'Completed diagnostic' WHEN (g-1)%8=3 THEN 'Retained draft' ELSE null END,
          CASE WHEN (g-1)%4=2 THEN 2 ELSE null END,
          CASE WHEN (g-1)%4=2 THEN timestamp '2026-09-25 12:00:00.123'+g*interval '1 millisecond' ELSE null END,
          CASE WHEN (g-1)%4=3 THEN timestamp '2026-09-25 12:00:00.123'+g*interval '1 millisecond' ELSE null END,
          CASE WHEN (g-1)%4=3 THEN 'Synthetic query cancellation' ELSE null END,
          timestamp '2026-09-25 11:00:00.123'+g*interval '1 millisecond',
          timestamp '2026-09-25 11:00:00.123'+g*interval '1 millisecond',
          timestamp '2026-09-25 12:00:00.123'+g*interval '1 millisecond',3 FROM generate_series(1,8000) g`);
      await query(client, `INSERT INTO "ActionHistory" ("actionId","actorId",event,"actionVersion","before","after","createdAt")
        SELECT a.id,2,
          CASE WHEN v=1 THEN 'ACTION_CREATED' WHEN v=2 AND a.status<>'PLANNED' THEN 'ACTION_STARTED'
               WHEN v=3 AND a.status='COMPLETED' THEN 'ACTION_COMPLETED'
               WHEN v=3 AND a.status='CANCELLED' THEN 'ACTION_CANCELLED' ELSE 'ACTION_EDITED' END::"ActionHistoryEvent",v,
          CASE WHEN v=1 THEN null ELSE to_jsonb(a)||jsonb_build_object('version',v-1,
            'status',CASE WHEN v=2 OR a.status='PLANNED' THEN 'PLANNED' ELSE 'IN_PROGRESS' END,
            'description',CASE WHEN v=2 THEN 'Initial action description' ELSE 'Intermediate action description' END,
            'performedById',null,'completedAt',null,'cancelledAt',null,'cancellationReason',null) END,
          to_jsonb(a)||jsonb_build_object('version',v,
            'status',CASE WHEN v=1 OR a.status='PLANNED' THEN 'PLANNED' WHEN v=2 THEN 'IN_PROGRESS' ELSE a.status::text END,
            'description',CASE WHEN v=1 THEN 'Initial action description' WHEN v=2 THEN 'Intermediate action description' ELSE a.description END,
            'performedById',CASE WHEN v=3 THEN a."performedById" ELSE null END,
            'completedAt',CASE WHEN v=3 THEN a."completedAt" ELSE null END,
            'cancelledAt',CASE WHEN v=3 THEN a."cancelledAt" ELSE null END,
            'cancellationReason',CASE WHEN v=3 THEN a."cancellationReason" ELSE null END),
          a."createdAt"+v*interval '1 millisecond' FROM "Action" a CROSS JOIN generate_series(1,3) v`);
      await query(client, 'ANALYZE "Action"');
      await query(client, 'ANALYZE "ActionHistory"');
      const scale = await query<{ actions: number; history: number }>(client,
        `SELECT (SELECT count(*)::int FROM "Action") AS actions,(SELECT count(*)::int FROM "ActionHistory") AS history`);
      expect(scale.rows[0]).toEqual({ actions: 8000, history: 24000 });
      console.info("Query fixture scale: 200 representative Tickets, 100 Staff, 8000 Actions, 24000 history rows; ANALYZE completed; planner settings unchanged.");
      for (const [label, sql, values] of [
        ["ticket-action-list", 'SELECT id FROM "Action" WHERE "ticketId"=$1 ORDER BY "createdAt",id LIMIT 20', [1007]],
        ["unfinished-gate", 'SELECT count(*) FROM "Action" WHERE "ticketId"=$1 AND status IN (\'PLANNED\',\'IN_PROGRESS\')', [1007]],
        ["current-assignee-list", 'SELECT id FROM "Action" WHERE "assigneeId"=$1 AND status IN (\'PLANNED\',\'IN_PROGRESS\') ORDER BY "createdAt",id LIMIT 20', [107]],
        ["history-ordering", 'SELECT id FROM "ActionHistory" WHERE "actionId"=$1 ORDER BY "createdAt",id LIMIT 20', [257]],
      ] as const) {
        const result = await query<{ "QUERY PLAN": Array<{ Plan: PlanNode }> }>(client,
          `EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${sql}`, [...values]);
        const root = result.rows[0]!["QUERY PLAN"][0]!.Plan;
        expect(root["Actual Rows"]).toBeGreaterThan(0);
        const paths = planNodes(root);
        for (const path of paths.filter((node) => node["Index Name"])) {
          expect(indexes.some((index) => index.index_name === path["Index Name"])).toBe(true);
        }
        console.info(`Observed EXPLAIN ${label}: ${paths.map((node) => node["Node Type"]+(node["Index Name"] ? `(${node["Index Name"]})` : "")).join(" -> ")}; root actual rows=${root["Actual Rows"]}.`);
      }
    });
  }, 30_000);
});
type PlanNode = { "Node Type": string; "Index Name"?: string; "Actual Rows": number; Plans?: PlanNode[] };
function planNodes(root: PlanNode): PlanNode[] {
  return [root, ...(root.Plans ?? []).flatMap(planNodes)];
}
