import request from "supertest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const verificationFailure = vi.hoisted(() => ({ nextVerifyFails: false }));

vi.mock("argon2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("argon2")>();
  return {
    ...actual,
    async verify(...arguments_: Parameters<typeof actual.verify>) {
      if (verificationFailure.nextVerifyFails) {
        verificationFailure.nextVerifyFails = false;
        throw new Error("private Argon2 verification dependency detail");
      }
      return actual.verify(...arguments_);
    },
  };
});

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

const SAFE_UNAVAILABLE = {
  error: {
    code: "SERVICE_UNAVAILABLE",
    message: "Service is temporarily unavailable. Please try again.",
  },
};
const PROTECTED_DETAILS =
  /password|hash|argon|dependency|token|cookie|csrf|database|postgres|sql|stack|private/iu;

beforeAll(() => {
  process.env.AUTH_ALLOWED_ORIGINS = APPROVED_ORIGIN;
  process.env.LOGIN_THROTTLE_HMAC_SECRET = "issue38-verify-outage-hmac-secret-for-tests";
});

afterEach(async () => {
  verificationFailure.nextVerifyFails = false;
  await cleanupAuthFixtures();
});

describe("authentication password-verification dependency failures", () => {
  it("retains the exact ordinary wrong-password Login failure without a session", async () => {
    const { user } = await createAuthUser();
    const response = await loginRequest(user.email, syntheticPassword());

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." },
    });
    expect(await getPrisma().authSession.count({ where: { userId: user.id } })).toBe(0);
    expect(await getPrisma().loginThrottle.count()).toBe(1);
  });

  it("returns an exact redacted 503 for a Login verify exception without throttle or session mutation", async () => {
    const { user, password } = await createAuthUser();
    const before = await getPrisma().user.findUniqueOrThrow({ where: { id: user.id } });
    verificationFailure.nextVerifyFails = true;

    const response = await loginRequest(user.email, password);

    expect(response.status).toBe(503);
    expect(response.body).toEqual(SAFE_UNAVAILABLE);
    expect(JSON.stringify(response.body)).not.toMatch(PROTECTED_DETAILS);
    expect(await getPrisma().authSession.count({ where: { userId: user.id } })).toBe(0);
    expect(await getPrisma().loginThrottle.count()).toBe(0);
    expect(await getPrisma().user.findUniqueOrThrow({ where: { id: user.id } })).toEqual(before);
  });

  it("retains the exact ordinary wrong-current-password failure without account or session mutation", async () => {
    const { user, password } = await createAuthUser({ mustChangePassword: true });
    const login = await loginRequest(user.email, password);
    const cookies = cookieHeader(login.headers["set-cookie"]);
    const csrf = cookieValue(login.headers["set-cookie"], "toktickit_csrf");
    const beforeUser = await getPrisma().user.findUniqueOrThrow({ where: { id: user.id } });
    const beforeSessions = await getPrisma().authSession.findMany({ where: { userId: user.id } });

    const response = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", cookies)
      .set("Origin", APPROVED_ORIGIN)
      .set("X-CSRF-Token", csrf)
      .send({
        currentPassword: syntheticPassword(),
        newPassword: syntheticPassword(),
        confirmPassword: syntheticPassword(),
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: "INVALID_CURRENT_PASSWORD", message: "Current password is incorrect." },
    });
    expect(await getPrisma().user.findUniqueOrThrow({ where: { id: user.id } })).toEqual(beforeUser);
    expect(await getPrisma().authSession.findMany({ where: { userId: user.id } })).toEqual(beforeSessions);
  });

  it("returns an exact redacted 503 for a Change Password verify exception without partial mutation", async () => {
    const { user, password } = await createAuthUser({ mustChangePassword: true });
    const login = await loginRequest(user.email, password);
    const cookies = cookieHeader(login.headers["set-cookie"]);
    const csrf = cookieValue(login.headers["set-cookie"], "toktickit_csrf");
    const beforeUser = await getPrisma().user.findUniqueOrThrow({ where: { id: user.id } });
    const beforeSessions = await getPrisma().authSession.findMany({ where: { userId: user.id } });
    verificationFailure.nextVerifyFails = true;
    const newPassword = syntheticPassword();

    const response = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", cookies)
      .set("Origin", APPROVED_ORIGIN)
      .set("X-CSRF-Token", csrf)
      .send({ currentPassword: password, newPassword, confirmPassword: newPassword });

    expect(response.status).toBe(503);
    expect(response.body).toEqual(SAFE_UNAVAILABLE);
    expect(JSON.stringify(response.body)).not.toMatch(PROTECTED_DETAILS);
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(await getPrisma().user.findUniqueOrThrow({ where: { id: user.id } })).toEqual(beforeUser);
    expect(await getPrisma().authSession.findMany({ where: { userId: user.id } })).toEqual(beforeSessions);
  });
});
