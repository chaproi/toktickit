import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import {
  applyLab3Baseline, applyLaterMigrations, migrationDirectory, oldTables,
  populateLab3, query, snapshot, withDisposableSchema,
} from "./migration-test-fixtures.js";

// D-20 / AC-43 / T-53 contribution. Pin the actual pre-exception baseline,
// discover subsequent committed SQL without naming a proposed migration.
const foundationBoundary = "20261006000000_lab4_action_foundation";
const reasonConstraint = "TicketStatusHistory_reason_length_check";
const allTables = { ...oldTables, Action: "id", ActionHistory: "id", MutationReceipt: "id", SeedFixture: "id" };

async function currentPopulatedPath(client: Client) {
  await applyLab3Baseline(client);
  await applyLaterMigrations(client);
  await populateLab3(client);
}

async function insertReason(client: Client, toStatus: "RESOLVED" | "CANCELLED", reason: string | null) {
  try {
    const result = await client.query<{ id: number; reason: string | null }>(
      `INSERT INTO "TicketStatusHistory" ("ticketId","actorId","fromStatus","toStatus",reason)
       VALUES (15,3,'IN_PROGRESS',$1::"TicketStatus",$2) RETURNING id,reason`, [toStatus, reason]);
    return { row: result.rows[0], failure: undefined };
  } catch (error) {
    // Autocommit statement failure: no aborted transaction is reused. Never
    // return raw message/detail/query/parameters or arbitrary driver metadata.
    const value = typeof error === "object" && error !== null ? error as Record<string, unknown> : {};
    return { row: undefined, failure: {
      code: typeof value.code === "string" && /^[0-9A-Z]{5}$/u.test(value.code) ? value.code : "unclassified",
      constraint: value.constraint === reasonConstraint ? reasonConstraint : undefined,
    } };
  }
}

async function catalog(client: Client, schema: string) {
  const columns = (await query(client,
    `SELECT table_name,column_name,data_type,udt_name,is_nullable,character_maximum_length,
            datetime_precision,column_default
     FROM information_schema.columns WHERE table_schema=$1 ORDER BY table_name,ordinal_position`, [schema])).rows;
  const constraints = (await query(client,
    `SELECT t.relname AS table_name,c.conname,c.contype::text AS type,c.convalidated,
            pg_get_constraintdef(c.oid) AS definition
     FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
     JOIN pg_namespace n ON n.oid=t.relnamespace
     WHERE n.nspname=$1 AND c.conname<>$2 ORDER BY t.relname,c.conname`, [schema, reasonConstraint])).rows;
  const indexes = (await query(client,
    `SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname=$1 ORDER BY tablename,indexname`, [schema])).rows;
  return { columns, constraints, indexes };
}

describe("D-20 AC-43/T-53: compatible reason storage through real committed SQL", () => {
  it.each([
    { label: "empty", value: "" }, { label: "one character", value: "A" },
    { label: "four characters", value: "four" }, { label: "500 ASCII characters", value: "R".repeat(500) },
  ])("stores non-cancellation $label reason", async ({ value }) => {
    await withDisposableSchema("constraints", async (client) => {
      await currentPopulatedPath(client);
      const result = await insertReason(client, "RESOLVED", value);
      expect(result.failure, "Accepted D-20 non-cancellation value must reach real storage; safe SQLSTATE identity only").toBeUndefined();
      const persisted = await query<{ reason: string | null }>(client,
        `SELECT reason FROM "TicketStatusHistory" WHERE id=$1`, [result.row!.id]);
      expect(persisted.rows[0].reason).toBe(value);
    });
  });

  it.each(["", "A", "four"])("retains cancellation CHECK rejection for short reason %j", async (reason) => {
    await withDisposableSchema("constraints", async (client, schema) => {
      await currentPopulatedPath(client);
      const before = await snapshot(client, schema, undefined, allTables);
      const result = await insertReason(client, "CANCELLED", reason);
      expect(result.failure).toEqual({ code: "23514", constraint: reasonConstraint });
      const after = await snapshot(client, schema, before, allTables);
      expect(isDeepStrictEqual(after, before), "Rejected CHECK leaves all domain rows unchanged; checksums withheld").toBe(true);
    });
  });

  it.each([{ label: "five", reason: "valid" }, { label: "500", reason: "R".repeat(500) }])(
    "accepts the existing $label-character cancellation boundary", async ({ reason }) => {
      await withDisposableSchema("constraints", async (client) => {
        await currentPopulatedPath(client);
        const result = await insertReason(client, "CANCELLED", reason);
        expect(result.failure).toBeUndefined();
        expect((await query<{ reason: string }>(client,
          `SELECT reason FROM "TicketStatusHistory" WHERE id=$1`, [result.row!.id])).rows[0].reason).toBe(reason);
      });
    },
  );

  it.each(["RESOLVED", "CANCELLED"] as const)("retains nullable historical %s reasons", async (status) => {
    await withDisposableSchema("constraints", async (client) => {
      await currentPopulatedPath(client);
      const result = await insertReason(client, status, null);
      expect(result.failure).toBeUndefined();
      expect((await query<{ reason: null }>(client,
        `SELECT reason FROM "TicketStatusHistory" WHERE id=$1`, [result.row!.id])).rows[0].reason).toBeNull();
    });
  });

  it.each(["RESOLVED", "CANCELLED"] as const)("rejects overlong %s at unchanged VARCHAR(500), not the CHECK", async (status) => {
    await withDisposableSchema("constraints", async (client, schema) => {
      await currentPopulatedPath(client);
      const before = await snapshot(client, schema, undefined, allTables);
      const result = await insertReason(client, status, "R".repeat(501));
      expect(result.failure).toEqual({ code: "22001", constraint: undefined });
      const after = await snapshot(client, schema, before, allTables);
      expect(isDeepStrictEqual(after, before), "VARCHAR rejection preserves all rows; checksums withheld").toBe(true);
    });
  });

  it("preserves populated history/nulls/cancellations, identities, references, columns and indexes across the increment", async () => {
    await withDisposableSchema("populated", async (client, schema) => {
      await applyLab3Baseline(client);
      const later = readdirSync(migrationDirectory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name > "20260918060000_lab3_authentication_foundation")
        .map((entry) => entry.name).sort();
      for (const name of later.filter((name) => name <= foundationBoundary)) {
        await query(client, readFileSync(resolve(migrationDirectory, name, "migration.sql"), "utf8"));
      }
      await populateLab3(client);
      // Retain both ordinary cancellation history and a legitimate legacy null
      // cancellation. This is fixture preparation, never migration backfill.
      await query(client, `INSERT INTO "Ticket" (id,"ticketNumber","clientSubmissionId","requesterId",
        "categoryId","relatedSystemId",summary,"requestedPriority","itPriority",description,"currentStatus")
        VALUES (19,'TKT-2026-00019',$1::uuid,1,1,1,'Legacy nullable cancellation','LOW','MEDIUM',
          'Synthetic pre-increment historical Ticket','CANCELLED')`, [randomUUID()]);
      await query(client, `INSERT INTO "TicketStatusHistory" ("ticketId","actorId","fromStatus","toStatus",reason,"createdAt")
        VALUES (19,3,'OPEN','CANCELLED',null,'2026-09-25T12:00:00.000Z')`);
      await query(client, `UPDATE "TicketNumberSequence" SET "lastValue"=19 WHERE year=2026`);
      const historical = (await query<{ nulls: number; cancellations: number; nullable_cancellations: number }>(client,
        `SELECT count(*) FILTER (WHERE reason IS NULL)::int AS nulls,
          count(*) FILTER (WHERE "toStatus"='CANCELLED' AND reason IS NOT NULL)::int AS cancellations,
          count(*) FILTER (WHERE "toStatus"='CANCELLED' AND reason IS NULL)::int AS nullable_cancellations
         FROM "TicketStatusHistory"`)).rows[0];
      expect(historical.nulls).toBeGreaterThan(0);
      expect(historical.cancellations).toBeGreaterThan(0);
      expect(historical.nullable_cancellations).toBe(1);
      const before = await snapshot(client, schema, undefined, allTables);
      const structure = await catalog(client, schema);
      const increments = later.filter((name) => name > foundationBoundary);
      for (const name of increments) {
        await query(client, readFileSync(resolve(migrationDirectory, name, "migration.sql"), "utf8"));
      }
      const after = await snapshot(client, schema, before, allTables);
      for (const table of Object.keys(allTables)) {
        expect(after[table].count, `${table} exact count retained`).toBe(before[table].count);
        expect(after[table].checksum === before[table].checksum,
          `${table} identities/values/credentials/references/timestamps unchanged; checksum withheld`).toBe(true);
      }
      expect(isDeepStrictEqual(await catalog(client, schema), structure),
        "Only the intended reason CHECK may differ; all columns, other constraints/FKs and indexes preserved").toBe(true);
      const checks = (await query<{ convalidated: boolean }>(client,
        `SELECT c.convalidated FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
         JOIN pg_namespace n ON n.oid=t.relnamespace
         WHERE n.nspname=$1 AND t.relname='TicketStatusHistory' AND c.conname=$2`, [schema, reasonConstraint])).rows;
      expect(checks).toEqual([{ convalidated: true }]);
      console.info(`D20 compatibility preservation: ${increments.length} real forward increments; 15 table counts/checksums and catalog relationships/indexes preserved; sensitive values withheld.`);
    });
  });
});
