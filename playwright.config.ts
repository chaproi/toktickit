import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const repositoryRoot = dirname(fileURLToPath(import.meta.url));
const serverDirectory = join(repositoryRoot, "server");
const clientUrl = "http://127.0.0.1:4173";

function loadLocalDatabaseUrl(): void {
  if (process.env.DATABASE_URL) {
    return;
  }

  const serverEnvironment = readFileSync(
    join(serverDirectory, ".env"),
    "utf8",
  );
  const databaseUrlLine = serverEnvironment
    .split(/\r?\n/u)
    .find((line) => line.trimStart().startsWith("DATABASE_URL="));

  if (!databaseUrlLine) {
    throw new Error(
      "DATABASE_URL must be set or present in server/.env before E2E tests run.",
    );
  }

  const configuredValue = databaseUrlLine
    .slice(databaseUrlLine.indexOf("=") + 1)
    .trim()
    .replace(/^(["'])(.*)\1$/u, "$2");

  if (!configuredValue) {
    throw new Error("DATABASE_URL must not be empty.");
  }

  process.env.DATABASE_URL = configuredValue;
}

loadLocalDatabaseUrl();

process.env.TOKTICKIT_E2E_RUN_MARKER ??= `Issue21-${randomUUID()}`;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: clientUrl,
    viewport: { width: 1440, height: 900 },
    screenshot: "off",
    trace: "off",
    video: "off",
  },
});
