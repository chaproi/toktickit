import request from "supertest";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { verifyPassword } from "../../src/auth/password.js";
import { isAllowedDuringMandatoryPasswordChange } from "../../src/auth/auth-router.js";
import { getPrisma } from "../../src/prisma.js";
import {
  APPROVED_ORIGIN,
  cleanupAuthFixtures,
  cookieHeader,
  cookieValue,
  createAuthUser,
  loginRequest,
  syntheticPassword,
} from "./auth-test-helpers.js";

describe("API-04 mandatory password change", () => {
  beforeAll(() => {
    process.env.AUTH_ALLOWED_ORIGINS = APPROVED_ORIGIN;
    process.env.LOGIN_THROTTLE_HMAC_SECRET =
      "issue27-synthetic-hmac-secret-for-tests";
  });

  afterEach(async () => {
    await cleanupAuthFixtures();
  });

  it("allows only current-user, logout, and password change through the forced-change gate", () => {
    expect(isAllowedDuringMandatoryPasswordChange("GET", "/api/auth/me")).toBe(true);
    expect(isAllowedDuringMandatoryPasswordChange("POST", "/api/auth/logout")).toBe(true);
    expect(
      isAllowedDuringMandatoryPasswordChange("POST", "/api/auth/change-password"),
    ).toBe(true);
    expect(isAllowedDuringMandatoryPasswordChange("GET", "/api/tickets")).toBe(false);
  });

  it("rejects wrong current, mismatch, weak, and reused passwords without mutation", async () => {
    const { user, password } = await createAuthUser({ mustChangePassword: true });
    const login = await loginRequest(user.email, password);
    const cookies = cookieHeader(login.headers["set-cookie"]);
    const csrf = cookieValue(login.headers["set-cookie"], "toktickit_csrf");
    const originalHash = user.passwordHash;

    const bodies = [
      {
        currentPassword: syntheticPassword(),
        newPassword: syntheticPassword(),
        confirmPassword: syntheticPassword(),
      },
      {
        currentPassword: password,
        newPassword: syntheticPassword(),
        confirmPassword: syntheticPassword(),
      },
      { currentPassword: password, newPassword: "weak", confirmPassword: "weak" },
      { currentPassword: password, newPassword: password, confirmPassword: password },
    ];

    for (const body of bodies) {
      const response = await request(app)
        .post("/api/auth/change-password")
        .set("Cookie", cookies)
        .set("Origin", APPROVED_ORIGIN)
        .set("X-CSRF-Token", csrf)
        .send(body);
      expect(response.status).toBe(400);
    }

    const unchanged = await getPrisma().user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(unchanged.passwordHash).toBe(originalHash);
    expect(unchanged.mustChangePassword).toBe(true);
  });

  it("rotates all sessions and clears the mandatory flag atomically", async () => {
    const { user, password } = await createAuthUser({ mustChangePassword: true });
    const first = await loginRequest(user.email, password);
    const second = await loginRequest(user.email, password);
    const oldCookies = cookieHeader(first.headers["set-cookie"]);
    const csrf = cookieValue(first.headers["set-cookie"], "toktickit_csrf");
    const newPassword = syntheticPassword();

    const response = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", oldCookies)
      .set("Origin", APPROVED_ORIGIN)
      .set("X-CSRF-Token", csrf)
      .send({
        currentPassword: password,
        newPassword,
        confirmPassword: newPassword,
      });

    expect(response.status).toBe(200);
    expect(response.body.user.mustChangePassword).toBe(false);
    expect(response.headers["set-cookie"]).toHaveLength(2);
    expect(await getPrisma().authSession.count({ where: { userId: user.id } })).toBe(1);

    const changed = await getPrisma().user.findUniqueOrThrow({ where: { id: user.id } });
    expect(changed.mustChangePassword).toBe(false);
    expect(changed.passwordChangedAt).toBeInstanceOf(Date);
    await expect(verifyPassword(changed.passwordHash, newPassword)).resolves.toBe(true);

    for (const old of [first, second]) {
      const rejected = await request(app)
        .get("/api/auth/me")
        .set("Cookie", cookieHeader(old.headers["set-cookie"]));
      expect(rejected.status).toBe(401);
    }
  });
});
