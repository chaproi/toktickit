import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client, type QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";
import { hashPassword } from "../../src/auth/password.js";
import { configureTestDatabaseEnvironment } from "../../src/testing/test-database.js";

// AC-30 / T-30, D-16 and specification section 9. Only production migration
// SQL defines tables/enums here. These tests never synthesize Lab 4 DDL.
const serverDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const migrationDirectory = resolve(serverDirectory, "prisma/migrations");
const historicalMigrations = [
  "20260815165739_init",
  "20260904095150_add_requester_reference_data",
  "20260904151259_add_ticket_creation",
  "20260918060000_lab3_authentication_foundation",
] as const;
const lab3Boundary = historicalMigrations[3];
const actionTables = ["Action", "ActionHistory", "MutationReceipt", "SeedFixture"];
const ticketStates = [
  "NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED",
];
const oldTables = {
  Category: "id", RelatedSystem: "id", User: "id", AuthSession: "id", LoginThrottle: "keyHash",
  TicketNumberSequence: "year", Ticket: "id", Attachment: "id", PublicComment: "id",
  InternalNote: "id", TicketStatusHistory: "id",
};

function identifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function query<Row extends QueryResultRow = QueryResultRow>(
  client: Client,
  sql: string,
  parameters: unknown[] = [],
) {
  try {
    return await client.query<Row>(sql, parameters);
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error &&
      /^[0-9A-Z]{5}$/u.test(String(error.code)) ? String(error.code) : "unavailable";
    // Never attach the original error: pg detail may include credential rows.
    throw new Error(`Disposable migration operation failed; SQLSTATE ${code}; details redacted.`);
  }
}

function verifiedTestTarget() {
  // Reuse the existing guard on a copy, without editing process configuration.
  const environment = { ...process.env };
  const identity = configureTestDatabaseEnvironment({
    environment, environmentFilePath: resolve(serverDirectory, ".env"),
  });
  const operational = environment.TOKTICKIT_DEVELOPMENT_DATABASE_URL;
  if (!operational || !environment.TEST_DATABASE_URL) {
    throw new Error("Both database identities are required for migration isolation.");
  }
  if (decodeURIComponent(new URL(operational).pathname.slice(1)) === identity.databaseName) {
    throw new Error("Disposable migration schemas require a distinct dedicated test database.");
  }
  return { databaseUrl: environment.TEST_DATABASE_URL, identity };
}

async function withDisposableSchema(
  label: "clean" | "populated",
  work: (client: Client, schema: string) => Promise<void>,
) {
  const target = verifiedTestTarget();
  const schema = `issue44_lab4_${label}_${randomUUID().replaceAll("-", "")}`;
  if (!/^issue44_lab4_(clean|populated)_[a-f0-9]{32}$/u.test(schema)) {
    throw new Error("Invalid owned migration schema name.");
  }
  const client = new Client({ connectionString: target.databaseUrl });
  let createdByThisTest = false;
  try {
    try { await client.connect(); } catch {
      throw new Error("Dedicated test connection failed; connection details redacted.");
    }
    const connected = await query<{ database: string }>(client, "SELECT current_database() AS database");
    expect(connected.rows[0]?.database === target.identity.databaseName,
      "Live test identity matches isolation guard; names redacted").toBe(true);
    // No IF NOT EXISTS: a collision cannot grant ownership of someone else's schema.
    await query(client, `CREATE SCHEMA ${identifier(schema)}`);
    createdByThisTest = true;
    await query(client, `SET search_path TO ${identifier(schema)}`);
    await query(client, "SET TIME ZONE 'UTC'");
    const selected = await query<{ schema: string }>(client, "SELECT current_schema() AS schema");
    expect(selected.rows[0]?.schema).toBe(schema);
    await work(client, schema);
  } finally {
    try {
      if (createdByThisTest) {
        // A failed production SQL transaction may need rollback before cleanup.
        await query(client, "ROLLBACK");
        await query(client, `DROP SCHEMA ${identifier(schema)} CASCADE`);
        const remaining = await query<{ count: number }>(client,
          "SELECT count(*)::int AS count FROM pg_namespace WHERE nspname=$1", [schema]);
        expect(remaining.rows[0]?.count, "Only this test's owned schema is removed").toBe(0);
        console.info(`Lab 4 ${label} fixture: owned schema created and removed; remaining=0.`);
      }
    } finally { await client.end(); }
  }
}

async function applyLab3Baseline(client: Client) {
  // The actual Lab 3 SQL requires a connection-local hash map. There are no
  // legacy users on this clean committed path, so the exact mapping is empty.
  await query(client, "SELECT set_config('toktickit.lab3_credential_hashes', '{}', false)");
  for (const name of historicalMigrations) {
    await query(client, readFileSync(resolve(migrationDirectory, name, "migration.sql"), "utf8"));
  }
}

async function applyLaterMigrations(client: Client) {
  const names = readdirSync(migrationDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name > lab3Boundary)
    .map((entry) => entry.name).sort();
  // An absent increment is allowed to reach structural assertions, not a fake
  // SQL/module failure. New production migrations are discovered without a
  // proposed Lab 4 timestamp/directory name embedded in the test.
  for (const name of names) {
    await query(client, readFileSync(resolve(migrationDirectory, name, "migration.sql"), "utf8"));
  }
  console.info(`Production migration path: ${historicalMigrations.length} historical; ${names.length} later.`);
}

type Column = {
  column_name: string; data_type: string; is_nullable: string;
  column_default: string | null; datetime_precision: number | null; udt_name: string;
};
async function columns(client: Client, schema: string, table: string) {
  return (await query<Column>(client,
    `SELECT column_name, data_type, is_nullable, column_default, datetime_precision, udt_name
     FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position`,
    [schema, table])).rows;
}

async function assertNewTablesExist(client: Client, schema: string) {
  const present = await query<{ table_name: string }>(client,
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema=$1 AND table_name=ANY($2::text[]) ORDER BY table_name`, [schema, actionTables]);
  // This assertion must precede every query against a new table.
  expect(present.rows.map((row) => row.table_name), "D-16 requires all four additive Lab 4 tables")
    .toEqual([...actionTables].sort());
}

async function assertLab4Structure(client: Client, schema: string) {
  await assertNewTablesExist(client, schema);
  const action = await columns(client, schema, "Action");
  const actionByName = Object.fromEntries(action.map((column) => [column.column_name, column]));
  expect(Object.keys(actionByName)).toEqual(expect.arrayContaining([
    "id", "ticketId", "createdById", "assigneeId", "performedById", "description", "result", "status",
    "followUpRequired", "followUpNote", "attachmentNotes", "actionAt", "createdAt", "updatedAt",
    "completedAt", "cancelledAt", "cancellationReason", "version",
  ]));
  for (const name of ["id", "ticketId", "createdById", "assigneeId", "performedById", "version"]) {
    expect(actionByName[name]?.data_type, name).toBe("integer");
  }
  expect(actionByName.performedById?.is_nullable).toBe("YES");
  expect(actionByName.version?.is_nullable).toBe("NO");
  expect(actionByName.version?.column_default).toMatch(/^\(?1\)?(?:::integer)?$/u);
  const states = await query<{ enumlabel: string }>(client,
    `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
     JOIN pg_namespace n ON n.oid=t.typnamespace
     WHERE n.nspname=$1 AND t.typname=$2 ORDER BY e.enumsortorder`,
    [schema, actionByName.status?.udt_name]);
  expect(states.rows.map((row) => row.enumlabel)).toEqual(["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);

  const requiredFields: Record<string, string[]> = {
    ActionHistory: ["id", "actionId", "actorId", "event", "createdAt", "before", "after", "actionVersion", "sourceTicketStatusHistoryId"],
    MutationReceipt: ["id", "actorId", "clientMutationId", "operation", "createdAt"],
    SeedFixture: ["fixtureKey"],
  };
  for (const [table, required] of Object.entries(requiredFields)) {
    const fields = await columns(client, schema, table);
    expect(fields.map((field) => field.column_name), table).toEqual(expect.arrayContaining(required));
    if (table !== "SeedFixture") expect(fields.find((field) => field.column_name === "id")?.data_type).toBe("integer");
    if (table === "ActionHistory") {
      expect(fields.find((field) => field.column_name === "before")?.is_nullable).toBe("YES");
      expect(fields.find((field) => field.column_name === "after")?.is_nullable).toBe("NO");
      expect(fields.find((field) => field.column_name === "sourceTicketStatusHistoryId")?.is_nullable).toBe("YES");
      for (const name of ["before", "after"]) {
        expect(["json", "jsonb"]).toContain(fields.find((field) => field.column_name === name)?.data_type);
      }
    }
    if (table === "MutationReceipt") {
      // The approved contract leaves physical fingerprint/response names open.
      expect(fields.some((field) => /fingerprint|inputHash/iu.test(field.column_name) &&
        ["text", "character varying", "character"].includes(field.data_type) && field.is_nullable === "NO"),
      "Required input fingerprint storage").toBe(true);
      expect(fields.some((field) => /response/iu.test(field.column_name) &&
        ["json", "jsonb"].includes(field.data_type) && field.is_nullable === "NO"),
      "Required safe response storage").toBe(true);
    }
  }

  for (const [table, names] of Object.entries({
    Action: ["actionAt", "createdAt", "updatedAt", "completedAt", "cancelledAt"],
    ActionHistory: ["createdAt"], MutationReceipt: ["createdAt"],
  })) {
    const fields = await columns(client, schema, table);
    for (const name of names) {
      expect(fields.find((field) => field.column_name === name), `${table}.${name}`)
        .toMatchObject({ data_type: "timestamp without time zone", datetime_precision: 3 });
    }
  }

  const foreignKeys = (await query<{
    source_table: string; source_column: string; target_table: string;
    target_column: string; delete_rule: string;
  }>(client,
    `SELECT s.relname AS source_table, a.attname AS source_column,
            t.relname AS target_table, b.attname AS target_column, c.confdeltype::text AS delete_rule
     FROM pg_constraint c JOIN pg_class s ON s.oid=c.conrelid
     JOIN pg_namespace ns ON ns.oid=s.relnamespace JOIN pg_class t ON t.oid=c.confrelid
     JOIN pg_namespace nt ON nt.oid=t.relnamespace
     JOIN pg_attribute a ON a.attrelid=s.oid AND a.attnum=c.conkey[1]
     JOIN pg_attribute b ON b.attrelid=t.oid AND b.attnum=c.confkey[1]
     WHERE c.contype='f' AND ns.nspname=$1 AND nt.nspname=$1`, [schema])).rows;
  for (const [table, column, target] of [
    ["Action", "ticketId", "Ticket"], ["Action", "createdById", "User"],
    ["Action", "assigneeId", "User"], ["Action", "performedById", "User"],
    ["ActionHistory", "actionId", "Action"], ["ActionHistory", "actorId", "User"],
    ["ActionHistory", "sourceTicketStatusHistoryId", "TicketStatusHistory"],
    ["MutationReceipt", "actorId", "User"],
  ]) {
    expect(foreignKeys).toEqual(expect.arrayContaining([{
      source_table: table, source_column: column, target_table: target, target_column: "id", delete_rule: "r",
    }]));
  }
  for (const target of ["Ticket", "Action"]) {
    expect(foreignKeys.some((key) => key.source_table === "MutationReceipt" &&
      key.target_table === target && key.target_column === "id" && key.delete_rule === "r"),
    `Receipt ${target} target relationship`).toBe(true);
  }
  const registryFields = await columns(client, schema, "SeedFixture");
  for (const target of ["User", "Category", "RelatedSystem", "Ticket", "Action"]) {
    const key = foreignKeys.find((item) => item.source_table === "SeedFixture" && item.target_table === target);
    expect(key, `Typed registry reference to ${target}`).toMatchObject({ target_column: "id", delete_rule: "r" });
    expect(registryFields.find((column) => column.column_name === key?.source_column)?.is_nullable).toBe("YES");
  }
  const registryChecks = await query<{ definition: string }>(client,
    `SELECT pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c
     JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
     WHERE c.contype='c' AND n.nspname=$1 AND t.relname='SeedFixture'`, [schema]);
  expect(registryChecks.rows.some((row) => foreignKeys.filter((key) => key.source_table === "SeedFixture")
    .every((key) => row.definition.includes(key.source_column))), "Registry one-target CHECK references all typed FKs").toBe(true);
}

type Snapshot = Record<string, { count: number; checksum: string; columns: string[] }>;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}
async function snapshot(client: Client, schema: string, original?: Snapshot): Promise<Snapshot> {
  const result: Snapshot = {};
  for (const [table, primary] of Object.entries(oldTables)) {
    const names = original?.[table]?.columns ?? (await columns(client, schema, table)).map((column) => column.column_name);
    const rows = await query<{ row: unknown }>(client,
      `SELECT to_jsonb(existing) AS row FROM
       (SELECT ${names.map(identifier).join(",")} FROM ${identifier(schema)}.${identifier(table)}
        ORDER BY ${identifier(primary)}) existing`);
    result[table] = {
      count: rows.rows.length,
      checksum: createHash("sha256").update(JSON.stringify(canonical(rows.rows.map((row) => row.row)))).digest("hex"),
      columns: names,
    };
  }
  return result;
}

async function populateLab3(client: Client) {
  const instant = "2026-09-25T10:11:12.123Z";
  for (const [id, role, active] of [
    [1, "REQUESTER", true], [2, "REQUESTER", false], [3, "IT_STAFF", true],
    [4, "IT_STAFF", true], [5, "ADMINISTRATOR", true], [6, "IT_STAFF", true],
  ] as const) {
    const encoded = await hashPassword(`Aa1!${randomBytes(24).toString("base64url")}`);
    await query(client,
      `INSERT INTO "User" (id,name,email,role,"passwordHash","mustChangePassword","isActive",
        "passwordChangedAt","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4::"UserRole",$5,$6,$7,$8,$9,$9)`,
      [id, `Migration User ${id}`, `migration-${id}@example.test`, role, encoded, id === 2, active,
        id === 2 ? null : instant, instant]);
  }
  await query(client,
    `INSERT INTO "Category" (id,name,"isActive","createdAt","updatedAt") VALUES
     (1,'Synthetic active category',true,$1,$1),(2,'Synthetic historical category',false,$1,$1)`, [instant]);
  await query(client,
    `INSERT INTO "RelatedSystem" (id,name,"isActive","createdAt","updatedAt") VALUES
     (1,'Synthetic active system',true,$1,$1),(2,'Synthetic historical system',false,$1,$1)`, [instant]);
  const paths = [
    ["NEW"], ["NEW", "OPEN"], ["NEW", "OPEN", "IN_PROGRESS"],
    ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER"],
    ["NEW", "OPEN", "IN_PROGRESS", "RESOLVED"],
    ["NEW", "OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
    ["NEW", "OPEN", "IN_PROGRESS", "RESOLVED", "REOPENED"], ["NEW", "OPEN", "CANCELLED"],
  ];
  for (const [index, status] of ticketStates.entries()) {
    const id = index + 11;
    const historical = status === "CLOSED" || status === "CANCELLED";
    await query(client,
      `INSERT INTO "Ticket" (id,"ticketNumber","ticketDate","clientSubmissionId","requesterId",
       "categoryId","relatedSystemId",summary,"requestedPriority",description,"currentStatus",
       "createdAt","updatedAt","ownerId","itPriority","requesterResolutionIndicatedAt","requesterResolutionIndicatedById")
       VALUES ($1,$2,$3,$4::uuid,$5,$6,$6,$7,$8::"RequestedPriority",$9,$10::"TicketStatus",$3,$11,$12,
         $13::"RequestedPriority",$14,$15)`,
      [id, `TKT-2026-${String(id).padStart(5, "0")}`, instant, randomUUID(), historical ? 2 : 1,
        historical ? 2 : 1, `Synthetic ${status} Ticket`, ["LOW", "MEDIUM", "HIGH", "URGENT"][index % 4],
        `Preserve literal ${status} content <script>plain text</script>.`, status, "2026-09-26T10:11:12.456Z",
        status === "NEW" ? null : status === "CLOSED" ? 6 : status === "CANCELLED" ? 4 : 3,
        ["URGENT", "HIGH", "MEDIUM", "LOW"][index % 4],
        status === "IN_PROGRESS" ? instant : null, status === "IN_PROGRESS" ? 1 : null]);
    for (let edge = 1; edge < paths[index]!.length; edge++) {
      await query(client,
        `INSERT INTO "TicketStatusHistory" ("ticketId","actorId","fromStatus","toStatus",reason,"createdAt")
         VALUES ($1,$2,$3::"TicketStatus",$4::"TicketStatus",$5,$6)`,
        [id, historical ? 6 : 3, paths[index]![edge - 1], paths[index]![edge],
          paths[index]![edge] === "CANCELLED" ? "Synthetic cancellation reason" : edge % 2 ? null : "Synthetic transition reason",
          `2026-09-25T11:00:0${edge}.789Z`]);
    }
  }
  await query(client,
    `INSERT INTO "TicketNumberSequence" (year,"lastValue","updatedAt") VALUES (2025,7,$1),(2026,18,$1)`, [instant]);
  await query(client,
    `INSERT INTO "Attachment" ("ticketId","originalFilename","storageKey","mimeType","sizeBytes",
     "uploadedByUserId","isRemoved","createdAt","removedAt","removedByUserId","removalReason") VALUES
     (11,'synthetic.pdf','issue44-active','application/pdf',100,1,false,$1,null,null,null),
     (16,'removed.png','issue44-removed','image/png',200,2,true,$1,$2,6,'Synthetic removal reason')`,
    [instant, "2026-09-26T10:11:12.456Z"]);
  await query(client,
    `INSERT INTO "PublicComment" ("ticketId","authorId",content,"createdAt") VALUES
     (11,1,'Synthetic public comment',$1),(16,6,'Historical author public comment',$1)`, [instant]);
  await query(client,
    `INSERT INTO "InternalNote" ("ticketId","authorId",content,"createdAt") VALUES
     (12,3,'Synthetic private note',$1),(16,6,'Historical staff note retained after role change',$1)`, [instant]);
  for (const [index, user] of [1, 3].entries()) {
    await query(client,
      `INSERT INTO "AuthSession" (id,"tokenHash","csrfTokenHash","userId","createdAt","lastSeenAt","expiresAt")
       VALUES ($1::uuid,$2,$3,$4,$5,$5,$6)`,
      [randomUUID(), randomBytes(32).toString("hex"), randomBytes(32).toString("hex"), user,
        instant, "2026-09-27T10:11:12.123Z"]);
  }
  await query(client,
    `INSERT INTO "LoginThrottle" ("keyHash","failureCount","windowStartedAt","blockedUntil","updatedAt")
     VALUES ($1,2,$2,$3,$2)`, [randomBytes(32).toString("hex"), instant, "2026-09-25T11:11:12.123Z"]);
  // Simulate operational changes after historical references were established.
  await query(client, `UPDATE "User" SET "isActive"=false WHERE id=4`);
  await query(client, `UPDATE "User" SET role='REQUESTER' WHERE id=6`);
  for (const table of ["User", "Category", "RelatedSystem", "Ticket", "Attachment"]) {
    await query(client,
      `SELECT setval(pg_get_serial_sequence($1,'id'), (SELECT max(id) FROM ${identifier(table)}), true)`,
      [identifier(table)]);
  }
}

describe("AC-30 / T-30: additive Lab 3 to Lab 4 production migration", () => {
  it("applies the committed clean path and exposes the required Lab 4 structures", async () => {
    await withDisposableSchema("clean", async (client, schema) => {
      await applyLab3Baseline(client);
      await applyLaterMigrations(client);
      await assertLab4Structure(client, schema);
    });
  }, 30_000);

  it("preserves populated Lab 3 rows exactly and never fabricates legacy Actions/history/receipts", async () => {
    await withDisposableSchema("populated", async (client, schema) => {
      await applyLab3Baseline(client);
      await populateLab3(client);
      const before = await snapshot(client, schema);
      expect(Object.fromEntries(Object.entries(before).map(([table, value]) => [table, value.count])))
        .toEqual({ Category: 2, RelatedSystem: 2, User: 6, AuthSession: 2, LoginThrottle: 1,
          TicketNumberSequence: 2, Ticket: 8, Attachment: 2, PublicComment: 2, InternalNote: 2, TicketStatusHistory: 19 });
      const statuses = await query<{ status: string }>(client,
        `SELECT "currentStatus"::text AS status FROM "Ticket" ORDER BY id`);
      expect(statuses.rows.map((row) => row.status)).toEqual(ticketStates);
      const owners = await query<{ count: number }>(client, `SELECT count(*)::int AS count FROM "Ticket" WHERE "ownerId" IS NULL`);
      expect(owners.rows[0]?.count).toBe(1);
      await applyLaterMigrations(client);
      const after = await snapshot(client, schema, before);
      for (const table of Object.keys(oldTables)) {
        expect(after[table]?.count, `${table} row count preserved`).toBe(before[table]!.count);
        // Boolean comparison prevents Vitest from rendering credentials, session
        // hashes, private content or raw rows when preservation fails.
        expect(after[table]?.checksum === before[table]!.checksum,
          `${table}: IDs/references/content/credentials/timestamps preserved; values redacted`).toBe(true);
      }
      console.info("Populated preservation: all 11 historical table counts and canonical checksums match; values redacted.");
      await assertNewTablesExist(client, schema);
      const legacy = await query<{ id: number; actions: number }>(client,
        `SELECT t.id,count(a.id)::int AS actions FROM "Ticket" t
         LEFT JOIN "Action" a ON a."ticketId"=t.id GROUP BY t.id ORDER BY t.id`);
      expect(legacy.rows).toEqual(Array.from({ length: 8 }, (_, index) => ({ id: index + 11, actions: 0 })));
      for (const table of ["ActionHistory", "MutationReceipt"]) {
        const count = await query<{ count: number }>(client, `SELECT count(*)::int AS count FROM ${identifier(table)}`);
        expect(count.rows[0]?.count, `No fabricated ${table}`).toBe(0);
      }
    });
  }, 30_000);
});
