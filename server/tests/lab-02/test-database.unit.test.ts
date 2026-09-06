import { describe, expect, it } from "vitest";

type ResolveTestDatabaseUrl = (input: {
  testDatabaseUrl?: string;
  developmentDatabaseUrl?: string;
}) => string;

async function getResolver(): Promise<ResolveTestDatabaseUrl> {
  const module = await import(
    "../../src/testing/test-database.js"
  );
  return module.resolveTestDatabaseUrl;
}

function captureError(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  throw new Error("Expected the database guard to reject the target.");
}

describe("isolated PostgreSQL test database guard", () => {
  it("rejects a missing TEST_DATABASE_URL with a safe actionable error", async () => {
    const resolveTestDatabaseUrl = await getResolver();

    expect(() =>
      resolveTestDatabaseUrl({
        developmentDatabaseUrl:
          "postgresql://dev_user:dev_password@localhost:5432/toktickit?schema=public",
      }),
    ).toThrow(
      "TEST_DATABASE_URL is required for database integration and E2E tests.",
    );
  });

  it("rejects an invalid or malformed TEST_DATABASE_URL", async () => {
    const resolveTestDatabaseUrl = await getResolver();

    expect(() =>
      resolveTestDatabaseUrl({
        testDatabaseUrl: "not-a-postgresql-url",
      }),
    ).toThrow("TEST_DATABASE_URL must be a valid PostgreSQL connection URL.");
  });

  it("rejects the same database and schema despite credentials and unrelated option order", async () => {
    const resolveTestDatabaseUrl = await getResolver();

    expect(() =>
      resolveTestDatabaseUrl({
        developmentDatabaseUrl:
          "postgresql://dev_user:dev_password@DB.EXAMPLE:5432/toktickit_test?connection_limit=5&schema=public",
        testDatabaseUrl:
          "postgresql://test_user:test_password@db.example/toktickit_test?schema=public&connect_timeout=10",
      }),
    ).toThrow(
      "TEST_DATABASE_URL must target a database or schema distinct from DATABASE_URL.",
    );
  });

  it("rejects a database name without a test marker", async () => {
    const resolveTestDatabaseUrl = await getResolver();

    expect(() =>
      resolveTestDatabaseUrl({
        developmentDatabaseUrl:
          "postgresql://dev_user:dev_password@localhost:5432/toktickit?schema=public",
        testDatabaseUrl:
          "postgresql://test_user:test_password@localhost:5432/toktickit_isolated?schema=public",
      }),
    ).toThrow('TEST_DATABASE_URL database name must contain "test".');
  });

  it("accepts a distinct dedicated database containing a test marker", async () => {
    const resolveTestDatabaseUrl = await getResolver();
    const testDatabaseUrl =
      "postgresql://test_user:test_password@localhost:5432/toktickit_test?schema=isolated";

    expect(
      resolveTestDatabaseUrl({
        developmentDatabaseUrl:
          "postgresql://dev_user:dev_password@localhost:5432/toktickit?schema=public",
        testDatabaseUrl,
      }),
    ).toBe(testDatabaseUrl);
  });

  it("never includes usernames, passwords, or complete URLs in guard errors", async () => {
    const resolveTestDatabaseUrl = await getResolver();
    const sensitiveUsername = "sensitive_user";
    const sensitivePassword = "sensitive_password";
    const developmentDatabaseUrl = `postgresql://${sensitiveUsername}:${sensitivePassword}@db.example:5432/toktickit_test?schema=public&application_name=development`;
    const testDatabaseUrl = `postgresql://other_user:other_password@db.example:5432/toktickit_test?application_name=tests&schema=public`;

    const messages = [
      captureError(() =>
        resolveTestDatabaseUrl({
          testDatabaseUrl: `${sensitiveUsername}:${sensitivePassword}`,
        }),
      ),
      captureError(() =>
        resolveTestDatabaseUrl({
          developmentDatabaseUrl,
          testDatabaseUrl,
        }),
      ),
    ].join(" ");

    expect(messages).not.toContain(sensitiveUsername);
    expect(messages).not.toContain(sensitivePassword);
    expect(messages).not.toContain("other_user");
    expect(messages).not.toContain("other_password");
    expect(messages).not.toContain(developmentDatabaseUrl);
    expect(messages).not.toContain(testDatabaseUrl);
  });
});
