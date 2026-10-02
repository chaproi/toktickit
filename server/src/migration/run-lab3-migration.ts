import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrateLab3Database } from "./lab3-migration.js";

function loadEnvironmentFile(path: string): void {
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of contents.split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/u);
    if (!match || process.env[match[1]!]) continue;
    const raw = match[2]!.trim();
    process.env[match[1]!] =
      raw.length >= 2 &&
      ((raw.startsWith('"') && raw.endsWith('"')) ||
        (raw.startsWith("'") && raw.endsWith("'")))
        ? raw.slice(1, -1)
        : raw;
  }
}

async function main(): Promise<void> {
  const serverDirectory = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
  loadEnvironmentFile(join(serverDirectory, ".env"));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }
  const result = await migrateLab3Database({
    databaseUrl,
    rawCredentialMapping: process.env.LAB3_MIGRATION_INITIAL_CREDENTIALS,
  });
  console.log(
    result.alreadyApplied
      ? "Lab 3 authentication migration is already applied."
      : `Lab 3 authentication migration completed for ${result.requesterIds.length} Users.`,
  );
}

void main().catch((error: unknown) => {
  const safeKeys =
    error && typeof error === "object" && "safeKeys" in error
      ? (error as { safeKeys?: string[] }).safeKeys
      : undefined;
  console.error(
    safeKeys && safeKeys.length > 0
      ? `${(error as Error).message} User IDs: ${safeKeys.join(", ")}`
      : error instanceof Error
        ? error.message
        : "Lab 3 migration failed safely.",
  );
  process.exitCode = 1;
});
