import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import {
  APPROVED_ORIGIN,
  cleanupAuthFixtures,
  createAuthUser,
  loginRequest,
  syntheticEmail,
  syntheticPassword,
} from "./auth-test-helpers.js";

describe("SEC-03 authentication enumeration and redaction", () => {
  beforeAll(() => {
    process.env.AUTH_ALLOWED_ORIGINS = APPROVED_ORIGIN;
    process.env.LOGIN_THROTTLE_HMAC_SECRET =
      "issue27-synthetic-hmac-secret-for-tests";
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupAuthFixtures();
  });

  it("uses indistinguishable unknown, malformed, and wrong-password failures", async () => {
    const { user } = await createAuthUser();
    const responses = await Promise.all([
      loginRequest(syntheticEmail("unknown"), syntheticPassword()),
      loginRequest("malformed-email", syntheticPassword()),
      loginRequest(user.email, syntheticPassword()),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 401, 401]);
    expect(responses[0]?.body).toEqual(responses[1]?.body);
    expect(responses[1]?.body).toEqual(responses[2]?.body);
  });

  it("never returns or logs credentials, hashes, cookies, or tokens", async () => {
    const password = syntheticPassword();
    const { user } = await createAuthUser({ password });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await loginRequest(user.email, password);

    const serializedBody = JSON.stringify(response.body);
    expect(serializedBody).not.toContain(password);
    expect(serializedBody).not.toContain(user.passwordHash);
    expect(serializedBody).not.toMatch(/tokenHash|csrfTokenHash|passwordHash/iu);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    expect(await getPrisma().authSession.count({ where: { userId: user.id } })).toBe(1);
  });
});
