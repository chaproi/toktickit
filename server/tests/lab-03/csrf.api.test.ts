import request from "supertest";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
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

describe("API-05 and SEC-06 authenticated Origin and CSRF", () => {
  beforeAll(() => {
    process.env.AUTH_ALLOWED_ORIGINS = APPROVED_ORIGIN;
    process.env.LOGIN_THROTTLE_HMAC_SECRET =
      "issue27-synthetic-hmac-secret-for-tests";
  });

  afterEach(async () => {
    await cleanupAuthFixtures();
  });

  it.each([
    { origin: undefined, csrf: "valid", code: "ORIGIN_REQUIRED" },
    { origin: "https://attacker.invalid", csrf: "valid", code: "ORIGIN_FORBIDDEN" },
    { origin: APPROVED_ORIGIN, csrf: undefined, code: "CSRF_INVALID" },
    { origin: APPROVED_ORIGIN, csrf: "wrong", code: "CSRF_INVALID" },
  ])("rejects unsafe password mutation: $code", async ({ origin, csrf, code }) => {
    const { user, password } = await createAuthUser();
    const login = await loginRequest(user.email, password);
    const cookies = cookieHeader(login.headers["set-cookie"]);
    const validCsrf = cookieValue(login.headers["set-cookie"], "toktickit_csrf");
    const next = syntheticPassword();
    const staleLastSeenAt = new Date(Date.now() - 6 * 60 * 1_000);
    const session = await getPrisma().authSession.findFirstOrThrow({
      where: { userId: user.id },
    });
    await getPrisma().authSession.update({
      where: { id: session.id },
      data: { lastSeenAt: staleLastSeenAt },
    });

    let call = request(app)
      .post("/api/auth/change-password")
      .set("Cookie", cookies)
      .send({ currentPassword: password, newPassword: next, confirmPassword: next });
    if (origin !== undefined) call = call.set("Origin", origin);
    if (csrf !== undefined) {
      call = call.set("X-CSRF-Token", csrf === "valid" ? validCsrf : csrf);
    }

    const response = await call;
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe(code);
    const unchanged = await getPrisma().user.findUniqueOrThrow({ where: { id: user.id } });
    expect(unchanged.passwordHash).toBe(user.passwordHash);
    const unchangedSession = await getPrisma().authSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(unchangedSession.lastSeenAt.getTime()).toBe(staleLastSeenAt.getTime());
  });

  it("requires the CSRF cookie, header, and stored digest to agree", async () => {
    const { user, password } = await createAuthUser();
    const login = await loginRequest(user.email, password);
    const cookies = cookieHeader(login.headers["set-cookie"]);
    const csrf = cookieValue(login.headers["set-cookie"], "toktickit_csrf");
    const session = await getPrisma().authSession.findFirstOrThrow({ where: { userId: user.id } });
    await getPrisma().authSession.update({
      where: { id: session.id },
      data: { csrfTokenHash: "0".repeat(64) },
    });

    const response = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", cookies)
      .set("Origin", APPROVED_ORIGIN)
      .set("X-CSRF-Token", csrf);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("CSRF_INVALID");
    expect(await getPrisma().authSession.count({ where: { userId: user.id } })).toBe(1);
  });
});
