import { prepareIssue27TestDatabase } from "../../src/testing/prepare-issue27-test-database.js";

let cleanup: (() => Promise<void>) | null = null;

export async function setup(): Promise<void> {
  cleanup = await prepareIssue27TestDatabase(process.cwd());
}

export async function teardown(): Promise<void> {
  if (!cleanup) {
    throw new Error("Issue 27 test cleanup was not initialized.");
  }
  await cleanup();
  cleanup = null;
}
