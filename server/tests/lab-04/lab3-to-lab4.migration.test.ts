import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import {
  actionTables, applyLab3Baseline, applyLaterMigrations, columns, identifier, oldTables,
  populateLab3, query, snapshot, ticketStates, withDisposableSchema,
} from "./migration-test-fixtures.js";

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
