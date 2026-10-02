import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ARGON2ID_OPTIONS,
  getDummyPasswordHash,
  hashPassword,
  validateNewPassword,
  verifyPassword,
} from "../../src/auth/password.js";

function strongPassword(): string {
  return `Aa1!${randomBytes(12).toString("hex")}`;
}

describe("UNIT-01 password validation and hashing", () => {
  it("uses the approved Argon2id parameters", () => {
    expect(ARGON2ID_OPTIONS).toEqual({
      type: "argon2id",
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 1,
      hashLength: 32,
      saltLength: 16,
    });
  });

  it("accepts 12–128 Unicode characters with at least three categories", () => {
    expect(validateNewPassword(`Aa1!${"x".repeat(8)}`)).toEqual({
      success: true,
    });
    expect(validateNewPassword(`กAa1!${"x".repeat(123)}`)).toEqual({
      success: true,
    });
  });

  it("rejects length, whitespace, category, confirmation, and reuse failures", () => {
    const current = strongPassword();
    const cases = [
      validateNewPassword("a".repeat(11)),
      validateNewPassword("A".repeat(129)),
      validateNewPassword(" ".repeat(12)),
      validateNewPassword("lowercaseonly"),
      validateNewPassword(current, current, `${current}x`),
      validateNewPassword(current, current, current),
    ];

    for (const result of cases) {
      expect(result.success).toBe(false);
    }
  });

  it("creates independent encoded hashes and verifies without exposing plaintext", async () => {
    const password = strongPassword();
    const first = await hashPassword(password);
    const second = await hashPassword(password);

    expect(first).toMatch(/^\$argon2id\$/u);
    expect(second).toMatch(/^\$argon2id\$/u);
    expect(first).not.toBe(second);
    expect(first).not.toContain(password);
    await expect(verifyPassword(first, password)).resolves.toBe(true);
    await expect(verifyPassword(first, `${password}x`)).resolves.toBe(false);
  });

  it("reuses one process-local encoded dummy hash for unknown-email verification", async () => {
    const first = await getDummyPasswordHash();
    const second = await getDummyPasswordHash();
    expect(first).toBe(second);
    expect(first).toMatch(/^\$argon2id\$/u);
  });
});
