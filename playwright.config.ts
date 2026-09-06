import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import { configureTestDatabaseEnvironment } from "./server/src/testing/test-database.js";

const repositoryRoot = dirname(fileURLToPath(import.meta.url));
const serverDirectory = join(repositoryRoot, "server");
const clientUrl = "http://127.0.0.1:4173";

configureTestDatabaseEnvironment({
  environmentFilePath: join(serverDirectory, ".env"),
});

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
