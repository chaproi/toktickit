import request from "supertest";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import {
  APPROVED_ORIGIN,
  cleanupAuthFixtures,
  createAuthUser,
  syntheticPassword,
} from "./auth-test-helpers.js";

describe("API-24 exact Login Origin contract", () => {
  beforeAll(() => {
    process.env.AUTH_ALLOWED_ORIGINS =
      `${APPROVED_ORIGIN},https://example.test`;
    process.env.LOGIN_THROTTLE_HMAC_SECRET =
      "issue27-synthetic-hmac-secret-for-tests";
  });

  afterEach(async () => {
    await cleanupAuthFixtures();
  });

  async function submit(origin?: string | string[]) {
    let call = request(app)
      .post("/api/auth/login")
      .set("Referer", `${APPROVED_ORIGIN}/login`)
      .send({ email: "unknown@example.test", password: syntheticPassword() });
    if (origin !== undefined) {
      call = call.set("Origin", origin);
    }
    return call;
  }

  it("returns ORIGIN_REQUIRED and never falls back to Referer", async () => {
    const response = await submit();
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ORIGIN_REQUIRED");
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(await getPrisma().authSession.count()).toBe(0);
  });

  it.each([
    "null",
    "not-an-origin",
    "https://example.test/path",
    "http://example.test",
    "https://other.test",
    "https://example.test:444",
    "https://example.test.attacker.invalid",
    "https://attacker-example.test",
  ])("returns ORIGIN_FORBIDDEN for %s", async (origin) => {
    const response = await submit(origin);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ORIGIN_FORBIDDEN");
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(await getPrisma().authSession.count()).toBe(0);
  });

  it("rejects repeated Origin headers", async () => {
    const response = await submit([APPROVED_ORIGIN, APPROVED_ORIGIN]);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ORIGIN_FORBIDDEN");
  });

  it("accepts normalized default/explicit ports and does not require Login CSRF", async () => {
    const { user, password } = await createAuthUser();
    const response = await request(app)
      .post("/api/auth/login")
      .set("Origin", "https://EXAMPLE.test:443")
      .send({ email: user.email, password });

    expect(response.status).toBe(200);
    expect(response.body.user.id).toBe(user.id);
  });
});
