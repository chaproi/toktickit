import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { Client } from "pg";
import { LAB3_SEEDED_USERS, seedDatabase, seedReferenceFixtureKey, seedUserFixtureKey } from "../../prisma/seed.js";
import {
  buildSafeLegacySnapshot,
  LAB3_MIGRATION_NAME,
  migrateLab3Database,
} from "../migration/lab3-migration.js";
import { configureTestDatabaseEnvironment } from "./test-database.js";

function syntheticCredential(label: string): string {
  return `Aa1!${label}${randomBytes(16).toString("base64url")}`;
}

export async function prepareIssue27TestDatabase(
  serverDirectory: string,
): Promise<() => Promise<void>> {
  configureTestDatabaseEnvironment({
    environmentFilePath: join(serverDirectory, ".env"),
  });
  const baseTestUrl = process.env.TEST_DATABASE_URL;
  if (!baseTestUrl) {
    throw new Error("TEST_DATABASE_URL is required for Issue 27 integration tests.");
  }

  const schema = `issue27_suite_${randomUUID().replaceAll("-", "")}`;
  const fixture = await buildSafeLegacySnapshot({
    databaseUrl: baseTestUrl,
    schema,
  });
  process.env.TOKTICKIT_ISSUE27_TEST_BASE_URL = baseTestUrl;
  process.env.TOKTICKIT_ISSUE27_TEST_SCHEMA = schema;
  const migrationCredentials = Object.fromEntries(
    fixture.requesterIds.map((id) => [String(id), syntheticCredential(String(id))]),
  );
  process.env.TOKTICKIT_E2E_MIGRATED_REQUESTER_CREDENTIALS = JSON.stringify(
    Object.fromEntries(
      fixture.requesterIds.map((id, index) => [
        LAB3_SEEDED_USERS[index]!.email,
        migrationCredentials[String(id)],
      ]),
    ),
  );

  try {
    await migrateLab3Database({
      databaseUrl: fixture.databaseUrl,
      rawCredentialMapping: JSON.stringify(migrationCredentials),
      markPrismaMigration: false,
    });

    // This deliberately constructed fixture has no Prisma deployment ledger.
    // Apply only committed increments AFTER the Lab 3 boundary, to its exact
    // owned schema, before invoking the current seed. Historical SQL is intact.
    const client = new Client({ connectionString: fixture.databaseUrl });
    try {
      await client.connect();
      await client.query(`SET search_path TO "${schema}"`);
      const migrations = join(serverDirectory, "prisma", "migrations");
      const later = readdirSync(migrations, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name > LAB3_MIGRATION_NAME)
        .map((entry) => entry.name).sort();
      for (const migration of later) {
        await client.query(readFileSync(join(migrations, migration, "migration.sql"), "utf8"));
      }
      // Explicit identity mappings from THIS known fixture constructor, not
      // generic production guesses using mutable names/emails. Existing IDs,
      // credential state, reference activation and all domain rows stay intact.
      for (const [index, id] of fixture.requesterIds.entries()) {
        await client.query('INSERT INTO "SeedFixture" ("fixtureKey","userId") VALUES ($1,$2)',
          [seedUserFixtureKey(LAB3_SEEDED_USERS[index]!.email), id]);
      }
      for (const [table, field] of [["Category", "categoryId"], ["RelatedSystem", "relatedSystemId"]] as const) {
        const references = await client.query<{ id: number; name: string }>(`SELECT id,name FROM "${table}" ORDER BY id`);
        for (const reference of references.rows) {
          await client.query(`INSERT INTO "SeedFixture" ("fixtureKey","${field}") VALUES ($1,$2)`,
            [seedReferenceFixtureKey(field, reference.name), reference.id]);
        }
      }
    } finally {
      await client.end();
    }

    process.env.TEST_DATABASE_URL = fixture.databaseUrl;
    process.env.DATABASE_URL = fixture.databaseUrl;
    process.env.AUTH_ALLOWED_ORIGINS =
      "http://localhost:5173,http://127.0.0.1:4173";
    process.env.LOGIN_THROTTLE_HMAC_SECRET =
      `issue27-${randomBytes(32).toString("base64url")}`;
    process.env.LAB3_SEED_INITIAL_CREDENTIALS = JSON.stringify(
      Object.fromEntries(
        LAB3_SEEDED_USERS.map((user) => [
          user.email,
          syntheticCredential(user.email),
        ]),
      ),
    );

    const prisma = new PrismaClient({
      datasources: { db: { url: fixture.databaseUrl } },
    });
    try {
      await seedDatabase(prisma);
    } finally {
      await prisma.$disconnect();
    }
  } catch (error) {
    await fixture.cleanup();
    delete process.env.TOKTICKIT_ISSUE27_TEST_BASE_URL;
    delete process.env.TOKTICKIT_ISSUE27_TEST_SCHEMA;
    delete process.env.TOKTICKIT_E2E_MIGRATED_REQUESTER_CREDENTIALS;
    throw error;
  }

  return async () => {
    await fixture.cleanup();
    delete process.env.TOKTICKIT_ISSUE27_TEST_BASE_URL;
    delete process.env.TOKTICKIT_ISSUE27_TEST_SCHEMA;
    delete process.env.TOKTICKIT_E2E_MIGRATED_REQUESTER_CREDENTIALS;
  };
}

export async function cleanupPreparedIssue27TestDatabase(): Promise<void> {
  const databaseUrl = process.env.TOKTICKIT_ISSUE27_TEST_BASE_URL;
  const schema = process.env.TOKTICKIT_ISSUE27_TEST_SCHEMA;
  if (!databaseUrl || !schema || !/^issue27_suite_[a-f0-9]{32}$/u.test(schema)) {
    throw new Error("Refusing Issue 27 cleanup without its exact temporary schema.");
  }
  const url = new URL(databaseUrl);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//u, ""));
  if (!databaseName.toLowerCase().includes("test")) {
    throw new Error('Issue 27 cleanup database name must contain "test".');
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
  } finally {
    await client.end();
    delete process.env.TOKTICKIT_ISSUE27_TEST_BASE_URL;
    delete process.env.TOKTICKIT_ISSUE27_TEST_SCHEMA;
    delete process.env.TOKTICKIT_E2E_MIGRATED_REQUESTER_CREDENTIALS;
  }
}
