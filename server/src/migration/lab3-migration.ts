import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { Client } from "pg";
import { parseCredentialMapping } from "../auth/credential-map.js";
import { hashPassword } from "../auth/password.js";

const require = createRequire(import.meta.url);
const SERVER_DIRECTORY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export const LAB3_MIGRATION_NAME =
  "20260918060000_lab3_authentication_foundation";

export const LEGACY_STATUS_MAPPING = Object.freeze({
  NEW: "NEW",
  ASSIGNED: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  PENDING_REQUESTER: "WAITING_FOR_REQUESTER",
  RESOLVED: "RESOLVED",
  CLOSED: "CLOSED",
  CANCELLED: "CANCELLED",
} as const);

type LegacyStatus = keyof typeof LEGACY_STATUS_MAPPING;

export type SafeMigrationSnapshot = {
  schemaState: "lab2" | "lab3";
  counts: {
    users: number;
    tickets: number;
    attachments: number;
    categories: number;
    relatedSystems: number;
  };
  userRows: unknown[];
  ticketRows: unknown[];
  attachmentRows: unknown[];
  statusTotals: Record<string, number>;
  checksums: {
    users: string;
    ticketsWithoutStatus: string;
    attachments: string;
  };
};

type FixtureResult = {
  databaseUrl: string;
  requesterIds: number[];
  before: SafeMigrationSnapshot;
  cleanup: () => Promise<void>;
};

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(identifier)) {
    throw new Error("Unsafe test schema identifier.");
  }
  return `"${identifier}"`;
}

function urlWithSchema(databaseUrl: string, schema: string): string {
  const url = new URL(databaseUrl);
  url.searchParams.set("schema", schema);
  const existing = url.searchParams.get("options");
  const searchPathOption = `-c search_path=${schema}`;
  url.searchParams.set(
    "options",
    existing ? `${existing} ${searchPathOption}` : searchPathOption,
  );
  return url.toString();
}

function assertDedicatedTestTarget(databaseUrl: string): void {
  const url = new URL(databaseUrl);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//u, ""));
  if (!databaseName.toLowerCase().includes("test")) {
    throw new Error('Migration fixture database name must contain "test".');
  }
}

function canonicalRows(rows: Record<string, unknown>[]): unknown[] {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        value instanceof Date ? value.toISOString() : value,
      ]),
    ),
  );
}

function checksum(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

async function tableExists(client: Client, table: string): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    "SELECT to_regclass($1) IS NOT NULL AS exists",
    [`\"${table}\"`],
  );
  return result.rows[0]?.exists === true;
}

export async function inspectLegacySnapshot(
  databaseUrl: string,
): Promise<SafeMigrationSnapshot> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const lab2 = await tableExists(client, "DevelopmentRequester");
    const lab3 = await tableExists(client, "User");
    if (!lab2 && !lab3) {
      throw new Error("Database does not contain a supported Lab 2 or Lab 3 schema.");
    }
    const userTable = lab2 ? "DevelopmentRequester" : "User";
    const uploaderColumn = lab2 ? "uploadedByRequesterId" : "uploadedByUserId";
    const removerColumn = lab2 ? "removedByRequesterId" : "removedByUserId";
    const users = await client.query(
          `SELECT "id", "name", "email", "isActive", "createdAt", "updatedAt"
           FROM "${userTable}" ORDER BY "id"`,
        );
    const tickets = await client.query(
          `SELECT "id", "ticketNumber", "ticketDate", "clientSubmissionId",
                  "requesterId", "categoryId", "relatedSystemId", "summary",
                  "requestedPriority"::TEXT, "description", "currentStatus"::TEXT,
                  "createdAt", "updatedAt"
           FROM "Ticket" ORDER BY "id"`,
        );
    const attachments = await client.query(
          `SELECT "id", "ticketId", "originalFilename", "storageKey", "mimeType",
                  "sizeBytes", "${uploaderColumn}" AS "uploadedByUserId", "isRemoved",
                  "createdAt", "removedAt", "${removerColumn}" AS "removedByUserId",
                  "removalReason"
           FROM "Attachment" ORDER BY "id"`,
        );
    const categories = await client.query<{ count: string }>(
      `SELECT count(*)::TEXT AS count FROM "Category"`,
    );
    const relatedSystems = await client.query<{ count: string }>(
      `SELECT count(*)::TEXT AS count FROM "RelatedSystem"`,
    );

    const statusTotals = Object.fromEntries(
      Object.entries(
        tickets.rows.reduce<Record<string, number>>((totals, row) => {
          const status = String(row.currentStatus);
          totals[status] = (totals[status] ?? 0) + 1;
          return totals;
        }, {}),
      ).sort(([left], [right]) => left.localeCompare(right)),
    );

    const userRows = canonicalRows(users.rows);
    const ticketRows = canonicalRows(tickets.rows);
    const attachmentRows = canonicalRows(attachments.rows);
    const ticketsWithoutStatus = (
      ticketRows as Array<Record<string, unknown>>
    ).map(({ currentStatus: _status, ...ticket }) => ticket);

    return {
      schemaState: lab2 ? "lab2" : "lab3",
      counts: {
        users: users.rowCount ?? 0,
        tickets: tickets.rowCount ?? 0,
        attachments: attachments.rowCount ?? 0,
        categories: Number(categories.rows[0]?.count ?? 0),
        relatedSystems: Number(relatedSystems.rows[0]?.count ?? 0),
      },
      userRows,
      ticketRows,
      attachmentRows,
      statusTotals,
      checksums: {
        users: checksum(userRows),
        ticketsWithoutStatus: checksum(ticketsWithoutStatus),
        attachments: checksum(attachmentRows),
      },
    };
  } finally {
    await client.end();
  }
}

function migrationSql(): string {
  const path = resolve(
    SERVER_DIRECTORY,
    "prisma",
    "migrations",
    LAB3_MIGRATION_NAME,
    "migration.sql",
  );
  return readFileSync(path, "utf8");
}

async function legacyRequesterIds(client: Client): Promise<number[]> {
  const result = await client.query<{ id: number }>(
    `SELECT "id" FROM "DevelopmentRequester" ORDER BY "id"`,
  );
  return result.rows.map((row) => row.id);
}

function unsupportedStatuses(snapshot: SafeMigrationSnapshot): string[] {
  return Object.keys(snapshot.statusTotals).filter(
    (status) => !(status in LEGACY_STATUS_MAPPING),
  );
}

function resolveMigrationWithPrisma(databaseUrl: string): void {
  const result = spawnSync(
    process.execPath,
    [
      require.resolve("prisma/build/index.js"),
      "migrate",
      "resolve",
      "--applied",
      LAB3_MIGRATION_NAME,
    ],
    {
      cwd: SERVER_DIRECTORY,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "inherit",
    },
  );
  if (result.error || result.status !== 0) {
    throw new Error("Lab 3 migration succeeded but could not be recorded by Prisma.");
  }
}

export async function migrateLab3Database({
  databaseUrl,
  rawCredentialMapping,
  markPrismaMigration = true,
}: {
  databaseUrl: string;
  rawCredentialMapping: string | undefined;
  markPrismaMigration?: boolean;
}): Promise<{
  requesterIds: number[];
  before: SafeMigrationSnapshot;
  after: SafeMigrationSnapshot;
  alreadyApplied: boolean;
}> {
  const initial = await inspectLegacySnapshot(databaseUrl);
  if (initial.schemaState === "lab3") {
    return {
      requesterIds: (initial.userRows as Array<{ id: number }>).map((row) => row.id),
      before: initial,
      after: initial,
      alreadyApplied: true,
    };
  }

  const unsupported = unsupportedStatuses(initial);
  if (unsupported.length > 0) {
    throw new Error(
      `Unsupported legacy Ticket status ids: ${unsupported.join(", ")}`,
    );
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  let requesterIds: number[];
  try {
    requesterIds = await legacyRequesterIds(client);
  } finally {
    await client.end();
  }

  const credentials = parseCredentialMapping(
    rawCredentialMapping,
    requesterIds.map(String),
    "LAB3_MIGRATION_INITIAL_CREDENTIALS",
  );
  const hashes: Record<string, string> = {};
  for (const id of requesterIds) {
    hashes[String(id)] = await hashPassword(credentials.get(String(id))!);
  }

  const migrationClient = new Client({ connectionString: databaseUrl });
  await migrationClient.connect();
  try {
    await migrationClient.query(
      "SELECT set_config('toktickit.lab3_credential_hashes', $1, false)",
      [JSON.stringify(hashes)],
    );
    await migrationClient.query(migrationSql());
  } finally {
    await migrationClient.end();
  }

  const after = await inspectLegacySnapshot(databaseUrl);
  const verification = await verifyLab3Migration(databaseUrl, initial);
  if (
    !verification.preserved ||
    !verification.itPrioritiesMatch ||
    verification.ownerIds.some((ownerId) => ownerId !== null) ||
    verification.statusHistoryCount !== 0 ||
    verification.passwordHashes.length !== requesterIds.length ||
    !verification.passwordHashes.every((hash) => hash.startsWith("$argon2id$")) ||
    !verification.mustChangePassword.every(Boolean)
  ) {
    throw new Error("Lab 3 migration postflight preservation verification failed.");
  }
  if (markPrismaMigration) {
    resolveMigrationWithPrisma(databaseUrl);
  }
  return { requesterIds, before: initial, after, alreadyApplied: false };
}

export async function verifyLab3Migration(
  databaseUrl: string,
  before: SafeMigrationSnapshot,
): Promise<{
  preserved: boolean;
  ownerIds: Array<number | null>;
  statuses: string[];
  itPrioritiesMatch: boolean;
  statusHistoryCount: number;
  passwordHashes: string[];
  mustChangePassword: boolean[];
}> {
  const after = await inspectLegacySnapshot(databaseUrl);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const tickets = await client.query<{
        ownerId: number | null;
        currentStatus: string;
        itPriority: string;
        requestedPriority: string;
      }>(
        `SELECT "ownerId", "currentStatus"::TEXT AS "currentStatus",
                "itPriority"::TEXT AS "itPriority",
                "requestedPriority"::TEXT AS "requestedPriority"
         FROM "Ticket" ORDER BY "id"`,
      );
    const users = await client.query<{
      passwordHash: string;
      mustChangePassword: boolean;
    }>(
        `SELECT "passwordHash", "mustChangePassword" FROM "User" ORDER BY "id"`,
      );
    const history = await client.query<{ count: string }>(
        `SELECT count(*)::TEXT AS count FROM "TicketStatusHistory"`,
      );

    const expectedStatuses = (before.ticketRows as Array<{ currentStatus: LegacyStatus }>).map(
      (ticket) => LEGACY_STATUS_MAPPING[ticket.currentStatus],
    );
    const preservedTickets = (before.ticketRows as Array<Record<string, unknown>>).map(
      ({ currentStatus: _status, ...ticket }) => ticket,
    );
    const afterTickets = (after.ticketRows as Array<Record<string, unknown>>).map(
      ({ currentStatus: _status, ...ticket }) => ticket,
    );

    return {
      preserved:
        JSON.stringify(before.counts) === JSON.stringify(after.counts) &&
        JSON.stringify(before.checksums) === JSON.stringify(after.checksums) &&
        JSON.stringify(before.userRows) === JSON.stringify(after.userRows) &&
        JSON.stringify(preservedTickets) === JSON.stringify(afterTickets) &&
        JSON.stringify(before.attachmentRows) === JSON.stringify(after.attachmentRows) &&
        JSON.stringify(expectedStatuses) ===
          JSON.stringify(tickets.rows.map((ticket) => ticket.currentStatus)),
      ownerIds: tickets.rows.map((ticket) => ticket.ownerId),
      statuses: tickets.rows.map((ticket) => ticket.currentStatus),
      itPrioritiesMatch: tickets.rows.every(
        (ticket) => ticket.itPriority === ticket.requestedPriority,
      ),
      statusHistoryCount: Number(history.rows[0]?.count ?? 0),
      passwordHashes: users.rows.map((user) => user.passwordHash),
      mustChangePassword: users.rows.map((user) => user.mustChangePassword),
    };
  } finally {
    await client.end();
  }
}

export async function buildSafeLegacySnapshot({
  databaseUrl,
  schema,
  includeUnknownStatus = false,
}: {
  databaseUrl: string;
  schema: string;
  includeUnknownStatus?: boolean;
}): Promise<FixtureResult> {
  assertDedicatedTestTarget(databaseUrl);
  if (!schema.startsWith("issue27_")) {
    throw new Error("Migration fixture schema must use the issue27_ prefix.");
  }
  const quotedSchema = quoteIdentifier(schema);
  const admin = new Client({ connectionString: databaseUrl });
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${quotedSchema}`);
  await admin.end();

  const fixtureUrl = urlWithSchema(databaseUrl, schema);
  const client = new Client({ connectionString: fixtureUrl });
  await client.connect();
  try {
    for (const migration of [
      "20260815165739_init",
      "20260904095150_add_requester_reference_data",
      "20260904151259_add_ticket_creation",
    ]) {
      const sql = readFileSync(
        resolve(SERVER_DIRECTORY, "prisma", "migrations", migration, "migration.sql"),
        "utf8",
      );
      await client.query(sql);
    }

    await client.query(
      `INSERT INTO "Category" ("name") VALUES
       ('Account and Access'), ('Hardware'), ('Software'), ('Network')`,
    );
    await client.query(
      `INSERT INTO "RelatedSystem" ("name") VALUES
       ('Email'), ('Campus Wi-Fi'), ('VPN'), ('LEB2 App'),
       ('Grade Submission App'), ('Printer'), ('Corporate Laptop')`,
    );
    const requesters = [
      ["Jennifer Anderson", "jennifer.anderson@example.com", true],
      ["Alex Morgan", "alex.morgan@example.com", true],
      ["Priya Shah", "priya.shah@example.com", true],
      ["Daniel Kim", "daniel.kim@example.com", true],
      ["Emily Carter", "emily.carter@example.com", false],
    ] as const;
    for (const [index, requester] of requesters.entries()) {
      const id = index + 1;
      await client.query(
        `INSERT INTO "DevelopmentRequester"
          ("id", "name", "email", "isActive", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $5)`,
        [
          id,
          requester[0],
          requester[1],
          requester[2],
          new Date(`2026-01-0${id}T00:00:00.000Z`),
        ],
      );
    }
    await client.query(
      `SELECT setval(pg_get_serial_sequence('"DevelopmentRequester"', 'id'), 5, true)`,
    );

    if (includeUnknownStatus) {
      await client.query(`ALTER TYPE "TicketStatus" ADD VALUE 'UNKNOWN'`);
    }
    const statuses = includeUnknownStatus
      ? ["UNKNOWN"]
      : Object.keys(LEGACY_STATUS_MAPPING);
    for (const [index, status] of statuses.entries()) {
      const id = index + 1;
      await client.query(
        `INSERT INTO "Ticket"
          ("id", "ticketNumber", "ticketDate", "clientSubmissionId", "requesterId",
           "categoryId", "relatedSystemId", "summary", "requestedPriority",
           "description", "currentStatus", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4::UUID, $5, 1, 1, $6, $7::"RequestedPriority",
                 $8, $9::"TicketStatus", $3, $3)`,
        [
          id,
          `TKT-2026-${String(id).padStart(5, "0")}`,
          new Date(`2026-02-${String(id).padStart(2, "0")}T00:00:00.000Z`),
          `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
          (index % 5) + 1,
          `Fixture Ticket ${status}`,
          ["LOW", "MEDIUM", "HIGH", "URGENT"][index % 4],
          `Synthetic migration fixture for ${status}.`,
          status,
        ],
      );
    }
    await client.query(
      `SELECT setval(pg_get_serial_sequence('"Ticket"', 'id'), $1, true)`,
      [statuses.length],
    );
    await client.query(
      `INSERT INTO "Attachment"
        ("ticketId", "originalFilename", "storageKey", "mimeType", "sizeBytes",
         "uploadedByRequesterId", "isRemoved", "createdAt", "removedAt",
         "removedByRequesterId", "removalReason")
       VALUES
        (1, 'fixture.pdf', 'issue27-fixture-active', 'application/pdf', 100, 1,
         false, '2026-03-01T00:00:00.000Z', NULL, NULL, NULL),
        (1, 'removed.png', 'issue27-fixture-removed', 'image/png', 200, 1,
         true, '2026-03-02T00:00:00.000Z', '2026-03-03T00:00:00.000Z', 1,
         'Synthetic removal fixture')`,
    );
    await client.query(
      `SELECT setval(pg_get_serial_sequence('"Attachment"', 'id'), 2, true)`,
    );
  } finally {
    await client.end();
  }

  const before = await inspectLegacySnapshot(fixtureUrl);
  return {
    databaseUrl: fixtureUrl,
    requesterIds: (before.userRows as Array<{ id: number }>).map((row) => row.id),
    before,
    cleanup: async () => {
      const cleanupClient = new Client({ connectionString: databaseUrl });
      await cleanupClient.connect();
      try {
        await cleanupClient.query(`DROP SCHEMA ${quotedSchema} CASCADE`);
      } finally {
        await cleanupClient.end();
      }
    },
  };
}
