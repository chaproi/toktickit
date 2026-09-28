import { afterEach, describe, expect, it } from "vitest";
import { verifyPassword } from "../../src/auth/password.js";
import { getPrisma } from "../../src/prisma.js";
import {
  adminGet,
  adminPatch,
  adminPost,
  cleanupIssue35Fixtures,
  editableUser,
  issue35Actors,
  uniqueAdminInput,
} from "./issue35-test-helpers.js";

afterEach(cleanupIssue35Fixtures);

describe("API-17 through API-20 Administrator User Management", () => {
  it("lists safe DTOs in normalized-name order with literal search, role filtering, and exact query rejection", async () => {
    const { administrator } = await issue35Actors();
    const prisma = getPrisma();
    await prisma.user.createMany({ data: [
      { name: "zeta User", email: `issue35-zeta-${Date.now()}@example.test`, role: "REQUESTER", passwordHash: "not-returned" },
      { name: "Alpha User", email: `issue35-alpha-${Date.now()}@example.test`, role: "IT_STAFF", passwordHash: "not-returned" },
    ] });
    const response = await adminGet("/api/admin/users?search=USER", administrator);
    expect(response.status).toBe(200);
    expect(response.body.items.map((item: { name: string }) => item.name)).toEqual(
      [...response.body.items.map((item: { name: string }) => item.name)].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    );
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|tokenHash|csrf|session/i);
    const filtered = await adminGet("/api/admin/users?role=IT_STAFF", administrator);
    expect(filtered.body.items.every((item: { role: string }) => item.role === "IT_STAFF")).toBe(true);
    expect((await adminGet("/api/admin/users?page=1", administrator)).body.error.code).toBe("INVALID_QUERY");
    expect((await adminGet("/api/admin/users?role=IT_STAFF&role=REQUESTER", administrator)).body.error.code).toBe("INVALID_QUERY");
  });

  it("denies non-Administrators before protected User lookup", async () => {
    const { staff, requester } = await issue35Actors();
    for (const actor of [staff, requester]) {
      expect((await adminGet("/api/admin/users", actor)).body).toEqual({
        error: { code: "ROLE_FORBIDDEN", message: "You do not have permission to perform this action." },
      });
      expect((await adminPatch("/api/admin/users/2147483647", actor, {})).body.error.code).toBe("ROLE_FORBIDDEN");
    }
  });

  it("creates exactly one-role Users with normalized email, Argon2id hash, forced change, and safe DTO", async () => {
    const { administrator } = await issue35Actors();
    const input = uniqueAdminInput("IT_STAFF");
    input.email = input.email.toUpperCase();
    const response = await adminPost("/api/admin/users", administrator, input);
    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({ email: input.email.toLowerCase(), role: "IT_STAFF", isActive: true, mustChangePassword: true });
    expect(JSON.stringify(response.body)).not.toContain(input.initialPassword);
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|session|cookie|token/i);
    const stored = await getPrisma().user.findUniqueOrThrow({ where: { id: response.body.user.id } });
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/u);
    expect(await verifyPassword(stored.passwordHash, input.initialPassword)).toBe(true);
  });

  it("rejects duplicate normalized email, invalid fields, mismatched confirmation, and unknown fields without partial creation", async () => {
    const { administrator } = await issue35Actors();
    const input = uniqueAdminInput();
    expect((await adminPost("/api/admin/users", administrator, input)).status).toBe(201);
    const duplicate = await adminPost("/api/admin/users", administrator, { ...uniqueAdminInput(), email: `  ${input.email.toUpperCase()}  ` });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("EMAIL_ALREADY_EXISTS");
    for (const bad of [
      { ...uniqueAdminInput(), role: "OWNER" },
      { ...uniqueAdminInput(), initialPassword: "short", confirmPassword: "short" },
      { ...uniqueAdminInput(), confirmPassword: "Different35!Aa" },
      { ...uniqueAdminInput(), requesterId: 42 },
    ]) {
      const result = await adminPost("/api/admin/users", administrator, bad);
      expect(result.status).toBe(400);
      expect(result.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("edits approved fields, rejects stale writes, revokes sessions on role change, and preserves ordinary self-profile edits", async () => {
    const { administrator, requester } = await issue35Actors();
    const prisma = getPrisma();
    const target = await prisma.user.findUniqueOrThrow({ where: { id: requester.user.id } });
    const changed = await adminPatch(`/api/admin/users/${target.id}`, administrator, editableUser(target, {
      name: "Promoted Requester",
      role: "IT_STAFF",
    }));
    expect(changed.status).toBe(200);
    expect(changed.body.user).toMatchObject({ name: "Promoted Requester", role: "IT_STAFF" });
    expect(await prisma.authSession.count({ where: { userId: target.id } })).toBe(0);
    const stale = await adminPatch(`/api/admin/users/${target.id}`, administrator, editableUser(target));
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("STALE_WRITE");

    const self = await prisma.user.findUniqueOrThrow({ where: { id: administrator.user.id } });
    const selfProfile = await adminPatch(`/api/admin/users/${self.id}`, administrator, editableUser(self, { name: "Administrator Profile" }));
    expect(selfProfile.status).toBe(200);
    expect(selfProfile.body.user.name).toBe("Administrator Profile");
  });

  it("resets another User's initial password, revokes sessions, forces change, and rejects self-reset", async () => {
    const { administrator, staff } = await issue35Actors();
    const password = uniqueAdminInput().initialPassword;
    const response = await adminPost(`/api/admin/users/${staff.user.id}/initial-password`, administrator, {
      initialPassword: password,
      confirmPassword: password,
    });
    expect(response.status).toBe(200);
    expect(response.body.user.mustChangePassword).toBe(true);
    const stored = await getPrisma().user.findUniqueOrThrow({ where: { id: staff.user.id } });
    expect(await verifyPassword(stored.passwordHash, password)).toBe(true);
    expect(await getPrisma().authSession.count({ where: { userId: staff.user.id } })).toBe(0);
    const self = await adminPost(`/api/admin/users/${administrator.user.id}/initial-password`, administrator, {
      initialPassword: password,
      confirmPassword: password,
    });
    expect(self.status).toBe(409);
    expect(self.body.error.code).toBe("SELF_INITIAL_PASSWORD_RESET_FORBIDDEN");
  });
});
