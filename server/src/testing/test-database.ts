import { readFileSync } from "node:fs";

const DEVELOPMENT_DATABASE_URL_KEY =
  "TOKTICKIT_DEVELOPMENT_DATABASE_URL";

export type DatabaseIdentity = {
  hostname: string;
  port: number;
  databaseName: string;
  schema: string;
};

type ResolveTestDatabaseInput = {
  testDatabaseUrl?: string;
  developmentDatabaseUrl?: string;
};

type ConfigureTestDatabaseInput = {
  environment?: NodeJS.ProcessEnv;
  environmentFilePath?: string;
};

function parseDatabaseUrl(
  value: string | undefined,
  variableName: "DATABASE_URL" | "TEST_DATABASE_URL",
): { url: string; identity: DatabaseIdentity } {
  if (!value?.trim()) {
    if (variableName === "TEST_DATABASE_URL") {
      throw new Error(
        "TEST_DATABASE_URL is required for database integration and E2E tests.",
      );
    }

    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }

  try {
    const parsed = new URL(value);
    if (
      !["postgres:", "postgresql:"].includes(parsed.protocol) ||
      !parsed.hostname
    ) {
      throw new Error("invalid PostgreSQL target");
    }

    const databaseName = decodeURIComponent(
      parsed.pathname.replace(/^\//u, ""),
    );
    if (!databaseName || databaseName.includes("/")) {
      throw new Error("invalid PostgreSQL database name");
    }

    const configuredSchema = parsed.searchParams.get("schema")?.trim();
    const schema = configuredSchema || "public";

    return {
      url: value,
      identity: {
        hostname: parsed.hostname.toLowerCase(),
        port: parsed.port ? Number(parsed.port) : 5432,
        databaseName,
        schema,
      },
    };
  } catch {
    throw new Error(
      `${variableName} must be a valid PostgreSQL connection URL.`,
    );
  }
}

function targetsMatch(
  left: DatabaseIdentity,
  right: DatabaseIdentity,
): boolean {
  return (
    left.hostname === right.hostname &&
    left.port === right.port &&
    left.databaseName === right.databaseName &&
    left.schema === right.schema
  );
}

export function resolveTestDatabaseUrl({
  testDatabaseUrl,
  developmentDatabaseUrl,
}: ResolveTestDatabaseInput): string {
  const testTarget = parseDatabaseUrl(
    testDatabaseUrl,
    "TEST_DATABASE_URL",
  );
  const developmentTarget = developmentDatabaseUrl?.trim()
    ? parseDatabaseUrl(developmentDatabaseUrl, "DATABASE_URL")
    : null;

  if (
    developmentTarget &&
    targetsMatch(testTarget.identity, developmentTarget.identity)
  ) {
    throw new Error(
      "TEST_DATABASE_URL must target a database or schema distinct from DATABASE_URL.",
    );
  }

  if (!testTarget.identity.databaseName.toLowerCase().includes("test")) {
    throw new Error(
      'TEST_DATABASE_URL database name must contain "test".',
    );
  }

  return testTarget.url;
}

function unquoteEnvironmentValue(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function loadDatabaseEnvironmentFile(
  environment: NodeJS.ProcessEnv,
  environmentFilePath: string,
): void {
  let contents: string;
  try {
    contents = readFileSync(environmentFilePath, "utf8");
  } catch {
    return;
  }

  for (const line of contents.split(/\r?\n/u)) {
    const match = line.match(
      /^\s*(DATABASE_URL|TEST_DATABASE_URL)\s*=\s*(.*?)\s*$/u,
    );
    if (!match) {
      continue;
    }

    const [, name, rawValue] = match;
    if (!environment[name]) {
      environment[name] = unquoteEnvironmentValue(rawValue);
    }
  }
}

export function configureTestDatabaseEnvironment({
  environment = process.env,
  environmentFilePath,
}: ConfigureTestDatabaseInput = {}): DatabaseIdentity {
  if (environmentFilePath) {
    loadDatabaseEnvironmentFile(environment, environmentFilePath);
  }

  const developmentDatabaseUrl =
    environment[DEVELOPMENT_DATABASE_URL_KEY] ??
    environment.DATABASE_URL;
  const testDatabaseUrl = resolveTestDatabaseUrl({
    testDatabaseUrl: environment.TEST_DATABASE_URL,
    developmentDatabaseUrl,
  });

  if (developmentDatabaseUrl) {
    environment[DEVELOPMENT_DATABASE_URL_KEY] = developmentDatabaseUrl;
  }
  environment.DATABASE_URL = testDatabaseUrl;

  return parseDatabaseUrl(testDatabaseUrl, "TEST_DATABASE_URL")
    .identity;
}
