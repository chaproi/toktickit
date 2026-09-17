import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CredentialMappingError,
  parseCredentialMapping,
} from "../../src/auth/credential-map.js";

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
    ["missing", () => ({ 1: value("one"), 2: value("two") }), ["3"]],
    ["unexpected", () => ({ 1: value("one"), 2: value("two"), 3: value("three"), 4: value("four") }), ["4"]],
    ["duplicate", () => { const duplicate = value("duplicate"); return { 1: duplicate, 2: duplicate, 3: value("three") }; }, ["1", "2"]],
    ["weak", () => ({ 1: value("one"), 2: "weak", 3: value("three") }), ["2"]],
  ])("rejects %s mappings using safe keys only", (_case, mapping, safeKeys) => {
    let caught: unknown;
    try {
      parseCredentialMapping(
        JSON.stringify(mapping()),
        expectedIds.map(String),
        "LAB3_MIGRATION_INITIAL_CREDENTIALS",
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(CredentialMappingError);
    expect((caught as CredentialMappingError).safeKeys).toEqual(safeKeys);
    expect((caught as Error).message).not.toMatch(/Aa1!/u);
  });

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
