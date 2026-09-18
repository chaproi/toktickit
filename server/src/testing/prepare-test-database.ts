import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { configureTestDatabaseEnvironment } from "./test-database.js";
import {
  inspectLegacySnapshot,
  migrateLab3Database,
} from "../migration/lab3-migration.js";

const require = createRequire(import.meta.url);

function runNodeModule(
  entryPoint: string,
  args: string[],
  serverDirectory: string,
  environment: NodeJS.ProcessEnv,
): void {
  const result = spawnSync(process.execPath, [entryPoint, ...args], {
    cwd: serverDirectory,
    env: environment,
    stdio: "inherit",
  });

  if (result.error) {
    throw new Error("Test database preparation command could not start.");
  }
  if (result.status !== 0) {
    throw new Error("Test database preparation failed.");
  }
}

export async function prepareTestDatabase(
  serverDirectory: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  configureTestDatabaseEnvironment({
    environment,
    environmentFilePath: join(serverDirectory, ".env"),
  });

  const databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("The isolated test database URL is unavailable.");
  }
  const snapshot = await inspectLegacySnapshot(databaseUrl);
  if (snapshot.schemaState === "lab2") {
    await migrateLab3Database({
      databaseUrl,
      rawCredentialMapping: environment.LAB3_MIGRATION_INITIAL_CREDENTIALS,
    });
  }

  runNodeModule(
    require.resolve("prisma/build/index.js"),
    ["migrate", "deploy"],
    serverDirectory,
    environment,
  );

  const [{ PrismaClient }, { seedDatabase }] = await Promise.all([
    import("@prisma/client"),
    import("../../prisma/seed.js"),
  ]);
  const prisma = new PrismaClient();
  try {
    await seedDatabase(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
