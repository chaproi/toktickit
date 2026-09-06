import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareTestDatabase } from "../src/testing/prepare-test-database.js";

const serverDirectory = dirname(dirname(fileURLToPath(import.meta.url)));

function requiresDatabase(arguments_: string[]): boolean {
  const requestedTestFiles = arguments_.filter((argument) =>
    /\.test\.[cm]?[jt]sx?$/u.test(argument),
  );

  return (
    requestedTestFiles.length === 0 ||
    requestedTestFiles.some(
      (testFile) => !/\.unit\.test\.[cm]?[jt]sx?$/u.test(testFile),
    )
  );
}

export default async function globalSetup(): Promise<void> {
  if (!requiresDatabase(process.argv.slice(2))) {
    return;
  }

  await prepareTestDatabase(serverDirectory);
}
