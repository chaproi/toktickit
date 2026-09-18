import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CredentialMappingError,
  parseCredentialMapping,
} from "../../src/auth/credential-map.js";
import {
  buildSafeLegacySnapshot,
  inspectLegacySnapshot,
  migrateLab3Database,
} from "../../src/migration/lab3-migration.js";

function value(label: string): string {
  return `Aa1!${label}${randomBytes(12).toString("base64url")}`;
}

describe("MIG-05 migration credential preflight", () => {
  const expectedIds = [1, 2, 3];

  it("accepts exact unique strong numeric-ID coverage", () => {
    const parsed = parseCredentialMapping(
      JSON.stringify({ 1: value("one"), 2: value("two"), 3: value("three") }),
      expectedIds.map(String),
      "LAB3_MIGRATION_INITIAL_CREDENTIALS",
    );
    expect([...parsed.keys()]).toEqual(["1", "2", "3"]);
  });

  it.each([
    [
      "missing",
      (ids: number[]) =>
        Object.fromEntries(ids.slice(0, -1).map((id) => [String(id), value(String(id))])),
      (ids: number[]) => [String(ids.at(-1))],
    ],
    [
      "unexpected",
      (ids: number[]) => ({
        ...Object.fromEntries(ids.map((id) => [String(id), value(String(id))])),
        999: value("unexpected"),
      }),
      () => ["999"],
    ],
    [
      "duplicate",
      (ids: number[]) => {
        const duplicate = value("duplicate");
        return Object.fromEntries(
          ids.map((id, index) => [
            String(id),
            index < 2 ? duplicate : value(String(id)),
          ]),
        );
      },
      (ids: number[]) => ids.slice(0, 2).map(String),
    ],
    [
      "weak",
      (ids: number[]) =>
        Object.fromEntries(
          ids.map((id, index) => [String(id), index === 1 ? "weak" : value(String(id))]),
        ),
      (ids: number[]) => [String(ids[1])],
    ],
  ])(
    "rejects %s mappings using safe keys before migration mutation",
    async (_case, mapping, expectedSafeKeys) => {
      const databaseUrl = process.env.TEST_DATABASE_URL;
      expect(databaseUrl).toBeTruthy();
      const fixture = await buildSafeLegacySnapshot({
        databaseUrl: databaseUrl!,
        schema: `issue27_credentials_${randomUUID().replaceAll("-", "")}`,
      });

      try {
        let caught: unknown;
        try {
          await migrateLab3Database({
            databaseUrl: fixture.databaseUrl,
            rawCredentialMapping: JSON.stringify(mapping(fixture.requesterIds)),
            markPrismaMigration: false,
          });
        } catch (error) {
          caught = error;
        }

        expect(caught).toBeInstanceOf(CredentialMappingError);
        expect((caught as CredentialMappingError).safeKeys).toEqual(
          expectedSafeKeys(fixture.requesterIds),
        );
        expect((caught as Error).message).not.toMatch(/Aa1!/u);
        await expect(inspectLegacySnapshot(fixture.databaseUrl)).resolves.toEqual(
          fixture.before,
        );
      } finally {
        await fixture.cleanup();
      }
    },
  );

  it("rejects missing, malformed, array, and non-string JSON without echoing input", () => {
    for (const raw of [undefined, "{", "[]", JSON.stringify({ 1: 123 })]) {
      expect(() =>
        parseCredentialMapping(
          raw,
          expectedIds.map(String),
          "LAB3_MIGRATION_INITIAL_CREDENTIALS",
        ),
      ).toThrow(CredentialMappingError);
    }
  });
});
