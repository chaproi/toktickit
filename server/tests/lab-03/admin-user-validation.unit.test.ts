import { describe, expect, it } from "vitest";

describe("UNIT-07 Administrator User validation", () => {
  it("normalizes exact list queries and rejects unsupported, repeated, or invalid values", async () => {
    const { parseAdminUserQuery } = await import("../../src/users/admin-user-validation.js");
    expect(parseAdminUserQuery({ search: "  ALIce  ", role: "IT_STAFF" })).toEqual({
      success: true,
      data: { search: "ALIce", role: "IT_STAFF" },
    });
    for (const query of [
      { page: "1" },
      { role: "OWNER" },
      { role: ["IT_STAFF", "REQUESTER"] },
      { search: "x".repeat(101) },
    ]) expect(parseAdminUserQuery(query).success).toBe(false);
  });

  it("requires the exact create shape, one role, normalized email, and password confirmation", async () => {
    const { validateCreateAdminUser } = await import("../../src/users/admin-user-validation.js");
    const valid = validateCreateAdminUser({
      name: "  Avery Chen  ",
      email: " AVERY.CHEN@EXAMPLE.TEST ",
      role: "ADMINISTRATOR",
      isActive: false,
      initialPassword: "Valid Issue35! 7",
      confirmPassword: "Valid Issue35! 7",
    });
    expect(valid).toMatchObject({
      success: true,
      data: { name: "Avery Chen", email: "avery.chen@example.test", role: "ADMINISTRATOR", isActive: false },
    });
    for (const input of [
      { name: "A", email: "bad", role: "IT_STAFF", isActive: true, initialPassword: "short", confirmPassword: "different" },
      { name: "Valid User", email: "valid@example.test", role: ["IT_STAFF", "ADMINISTRATOR"], isActive: true, initialPassword: "Valid Issue35! 7", confirmPassword: "Valid Issue35! 7" },
      { name: "Valid User", email: "valid@example.test", role: "IT_STAFF", isActive: true, initialPassword: "Valid Issue35! 7", confirmPassword: "Valid Issue35! 7", unexpected: true },
    ]) expect(validateCreateAdminUser(input).success).toBe(false);
  });

  it("requires complete editable state and a valid optimistic timestamp", async () => {
    const {
      validateEditAdminUser,
      wouldRemoveLastActiveAdministrator,
    } = await import("../../src/users/admin-user-validation.js");
    expect(validateEditAdminUser({
      name: "Updated User",
      email: "updated@example.test",
      role: "REQUESTER",
      isActive: true,
      expectedUpdatedAt: "2026-09-28T08:00:00.000Z",
    }).success).toBe(true);
    expect(validateEditAdminUser({
      name: "Updated User",
      email: "updated@example.test",
      role: "REQUESTER",
      isActive: true,
      expectedUpdatedAt: "not-a-date",
    }).success).toBe(false);
    expect(wouldRemoveLastActiveAdministrator(1, true, "IT_STAFF", true)).toBe(true);
    expect(wouldRemoveLastActiveAdministrator(2, true, "IT_STAFF", true)).toBe(false);
    expect(wouldRemoveLastActiveAdministrator(1, true, "ADMINISTRATOR", true)).toBe(false);
  });
});
