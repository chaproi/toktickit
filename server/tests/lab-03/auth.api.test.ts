import { createHash } from "node:crypto";
import { Client } from "pg";
import request from "supertest";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { LOGIN_WINDOW_MILLISECONDS } from "../../src/auth/throttle.js";
import {
  APPROVED_ORIGIN,
  cleanupAuthFixtures,
  cookieHeader,
  cookieValue,
  createAuthUser,
  loginRequest,
  syntheticEmail,
  syntheticPassword,
} from "./auth-test-helpers.js";

async function waitForBlockedThrottleWriters(
  client: Client,
  expectedWriters: number,
): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await client.query<{ count: string }>(
      `SELECT count(*)::TEXT AS count
         FROM pg_locks
        WHERE database = (SELECT oid FROM pg_database WHERE datname = current_database())
          AND relation = to_regclass('"LoginThrottle"')
          AND mode = 'RowExclusiveLock'
          AND granted = false`,
    );
    if (Number(result.rows[0]?.count ?? 0) >= expectedWriters) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for concurrent throttle writers.");
}

describe("API-01 through API-03 authentication lifecycle", () => {
  beforeAll(() => {
    process.env.AUTH_ALLOWED_ORIGINS = APPROVED_ORIGIN;
    process.env.LOGIN_THROTTLE_HMAC_SECRET =
      "issue27-synthetic-hmac-secret-for-tests";
  });

  afterEach(async () => {
    await cleanupAuthFixtures();
  });

  it("creates digest-only cookies and a safe DTO for valid credentials", async () => {
    const { user, password } = await createAuthUser();
    const response = await loginRequest(user.email.toUpperCase(), password);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        mustChangePassword: false,
      },
      session: { expiresAt: expect.any(String) },
    });
    expect(response.headers["set-cookie"]).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^toktickit_session=.*HttpOnly.*SameSite=Strict/iu),
        expect.stringMatching(/^toktickit_csrf=.*SameSite=Strict/iu),
      ]),
    );

    const rawSession = cookieValue(
      response.headers["set-cookie"],
      "toktickit_session",
    );
    const stored = await getPrisma().authSession.findFirstOrThrow({
      where: { userId: user.id },
    });
    expect(stored.tokenHash).toBe(
      createHash("sha256").update(rawSession).digest("hex"),
    );
    expect(stored.tokenHash).not.toBe(rawSession);
    expect(JSON.stringify(response.body)).not.toMatch(
      /passwordHash|tokenHash|csrfToken|sessionToken/iu,
    );
  });

  it("returns the identical safe response for unknown email and wrong password", async () => {
    const { user } = await createAuthUser();
    const unknown = await loginRequest(syntheticEmail("unknown"), syntheticPassword());
    const wrong = await loginRequest(user.email, syntheticPassword());

    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
    expect(unknown.body).toEqual({
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Email or password is incorrect.",
      },
    });
    expect(await getPrisma().authSession.count()).toBe(0);
  });

  it.each([
    {},
    { email: 123, password: syntheticPassword() },
    { email: syntheticEmail("extra"), password: syntheticPassword(), role: "REQUESTER" },
    { email: `${"a".repeat(250)}@example.test`, password: syntheticPassword() },
    { email: syntheticEmail("long-password"), password: "x".repeat(129) },
  ])("rejects missing, non-string, unknown, or oversized Login fields", async (body) => {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Origin", APPROVED_ORIGIN)
      .send(body);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(await getPrisma().authSession.count()).toBe(0);
  });

  it("reveals inactivity only after a correct password", async () => {
    const { user, password } = await createAuthUser({ isActive: false });
    const wrong = await loginRequest(user.email, syntheticPassword());
    const valid = await loginRequest(user.email, password);

    expect(wrong.status).toBe(401);
    expect(valid.status).toBe(403);
    expect(valid.body.error.code).toBe("ACCOUNT_INACTIVE");
    expect(await getPrisma().authSession.count()).toBe(0);
  });

  it("persists five failures and throttles the sixth request", async () => {
    const email = syntheticEmail("throttle");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await loginRequest(email, syntheticPassword());
      expect(response.status).toBe(401);
    }

    const blocked = await loginRequest(email, syntheticPassword());
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("LOGIN_THROTTLED");
    expect(blocked.body.error.retryAfterSeconds).toBeGreaterThan(0);
    expect(await getPrisma().loginThrottle.count()).toBe(1);
  });

  it("counts overlapping failures atomically at the throttle threshold", async () => {
    const prisma = getPrisma();
    const email = syntheticEmail("concurrent-throttle");
    const otherEmail = syntheticEmail("independent-throttle");

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await loginRequest(email, syntheticPassword())).status).toBe(401);
    }
    const targetBefore = await prisma.loginThrottle.findFirstOrThrow();
    expect(targetBefore.failureCount).toBe(3);

    expect((await loginRequest(otherEmail, syntheticPassword())).status).toBe(401);
    const independentBefore = await prisma.loginThrottle.findFirstOrThrow({
      where: { keyHash: { not: targetBefore.keyHash } },
    });
    expect(independentBefore.failureCount).toBe(1);

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("Isolated test database is unavailable.");
    const lockClient = new Client({ connectionString: databaseUrl });
    await lockClient.connect();
    let lockHeld = false;
    let concurrentRequests: Array<Promise<Awaited<ReturnType<typeof loginRequest>>>> = [];

    try {
      await lockClient.query("BEGIN");
      lockHeld = true;
      await lockClient.query('LOCK TABLE "LoginThrottle" IN SHARE MODE');

      concurrentRequests = [
        Promise.resolve(loginRequest(email.toUpperCase(), syntheticPassword())),
        Promise.resolve(loginRequest(` ${email} `, syntheticPassword())),
      ];
      await waitForBlockedThrottleWriters(lockClient, 2);
      await lockClient.query("COMMIT");
      lockHeld = false;

      const responses = await Promise.all(concurrentRequests);
      for (const response of responses) {
        expect(response.status).toBe(401);
        expect(response.body).toEqual({
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Email or password is incorrect.",
          },
        });
      }

      const afterConcurrent = await prisma.loginThrottle.findUniqueOrThrow({
        where: { keyHash: targetBefore.keyHash },
      });
      expect(afterConcurrent.failureCount).toBe(5);
      expect(afterConcurrent.blockedUntil).not.toBeNull();
      if (afterConcurrent.blockedUntil) {
        const remainingBlock = afterConcurrent.blockedUntil.getTime() - Date.now();
        expect(remainingBlock).toBeGreaterThan(LOGIN_WINDOW_MILLISECONDS - 10_000);
        expect(remainingBlock).toBeLessThanOrEqual(LOGIN_WINDOW_MILLISECONDS);
      }
      expect(
        await prisma.loginThrottle.count({
          where: { keyHash: targetBefore.keyHash },
        }),
      ).toBe(1);

      const independentAfter = await prisma.loginThrottle.findUniqueOrThrow({
        where: { keyHash: independentBefore.keyHash },
      });
      expect(independentAfter).toEqual(independentBefore);

      const blocked = await loginRequest(email, syntheticPassword());
      expect(blocked.status).toBe(429);
      expect(blocked.body).toEqual({
        error: {
          code: "LOGIN_THROTTLED",
          message: "Too many login attempts. Please try again later.",
          retryAfterSeconds: expect.any(Number),
        },
      });
      expect(blocked.body.error.retryAfterSeconds).toBeGreaterThan(0);

      const afterBlockedRequest = await prisma.loginThrottle.findUniqueOrThrow({
        where: { keyHash: targetBefore.keyHash },
      });
      expect(afterBlockedRequest.failureCount).toBe(5);
      expect(afterBlockedRequest.blockedUntil).toEqual(afterConcurrent.blockedUntil);
      expect(await prisma.loginThrottle.count()).toBe(2);

      const serializedResponses = JSON.stringify([...responses, blocked]);
      expect(serializedResponses).not.toContain(email);
      expect(serializedResponses).not.toContain(otherEmail);
      expect(serializedResponses).not.toContain(targetBefore.keyHash);
      expect(serializedResponses).not.toMatch(
        /passwordHash|cookie|token|hmac|database/iu,
      );
    } finally {
      if (lockHeld) await lockClient.query("ROLLBACK");
      await Promise.allSettled(concurrentRequests);
      await lockClient.end();
    }
  }, 15_000);

  it("clears the persistent throttle key after a successful login", async () => {
    const { user, password } = await createAuthUser();
    expect((await loginRequest(user.email, syntheticPassword())).status).toBe(401);
    expect(await getPrisma().loginThrottle.count()).toBe(1);

    expect((await loginRequest(user.email, password)).status).toBe(200);
    expect(await getPrisma().loginThrottle.count()).toBe(0);
  });

  it("returns current User, expires inactive sessions, logs out, and rejects reuse", async () => {
    const { user, password } = await createAuthUser();
    const login = await loginRequest(user.email, password);
    const cookies = cookieHeader(login.headers["set-cookie"]);
    const csrf = cookieValue(login.headers["set-cookie"], "toktickit_csrf");

    const me = await request(app).get("/api/auth/me").set("Cookie", cookies);
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(user.id);

    const logout = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", cookies)
      .set("Origin", APPROVED_ORIGIN)
      .set("X-CSRF-Token", csrf);
    expect(logout.status).toBe(204);
    expect(await getPrisma().authSession.count({ where: { userId: user.id } })).toBe(0);

    const reused = await request(app).get("/api/auth/me").set("Cookie", cookies);
    expect(reused.status).toBe(401);
    expect(reused.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("keeps Logout idempotent without a live session and clears both cookies", async () => {
    const response = await request(app).post("/api/auth/logout");
    expect(response.status).toBe(204);
    expect(response.headers["set-cookie"]).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^toktickit_session=;/u),
        expect.stringMatching(/^toktickit_csrf=;/u),
      ]),
    );
  });

  it.each(["idle", "absolute", "inactive"] as const)(
    "rejects and removes an %s session without returning protected data",
    async (condition) => {
      const { user, password } = await createAuthUser();
      const login = await loginRequest(user.email, password);
      const cookies = cookieHeader(login.headers["set-cookie"]);
      const session = await getPrisma().authSession.findFirstOrThrow({
        where: { userId: user.id },
      });

      if (condition === "idle") {
        await getPrisma().authSession.update({
          where: { id: session.id },
          data: { lastSeenAt: new Date(Date.now() - 31 * 60 * 1_000) },
        });
      } else if (condition === "absolute") {
        await getPrisma().authSession.update({
          where: { id: session.id },
          data: { expiresAt: new Date(Date.now() - 1_000) },
        });
      } else {
        await getPrisma().user.update({
          where: { id: user.id },
          data: { isActive: false },
        });
      }

      const response = await request(app).get("/api/auth/me").set("Cookie", cookies);
      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: {
          code: "AUTHENTICATION_REQUIRED",
          message: "Authentication is required.",
        },
      });
      expect(
        await getPrisma().authSession.count({ where: { userId: user.id } }),
      ).toBe(0);
    },
  );
});
