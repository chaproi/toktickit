import { describe, expect, it } from "vitest";
import {
  ABSOLUTE_SESSION_MILLISECONDS,
  IDLE_SESSION_MILLISECONDS,
  LAST_SEEN_REFRESH_MILLISECONDS,
  createOpaqueToken,
  digestToken,
  evaluateSessionLifetime,
  sessionCookieOptions,
} from "../../src/auth/session.js";
import {
  parseAllowedOrigins,
  validateOriginHeader,
} from "../../src/auth/origin.js";

describe("UNIT-02 session, cookie, CSRF, and Origin rules", () => {
  it("creates opaque 32-byte tokens and stores deterministic SHA-256 digests", () => {
    const first = createOpaqueToken();
    const second = createOpaqueToken();

    expect(Buffer.from(first, "base64url")).toHaveLength(32);
    expect(first).not.toBe(second);
    expect(digestToken(first)).toMatch(/^[a-f0-9]{64}$/u);
    expect(digestToken(first)).toBe(digestToken(first));
    expect(digestToken(first)).not.toBe(digestToken(second));
  });

  it("enforces eight-hour absolute, thirty-minute idle, and five-minute refresh bounds", () => {
    expect(ABSOLUTE_SESSION_MILLISECONDS).toBe(8 * 60 * 60 * 1_000);
    expect(IDLE_SESSION_MILLISECONDS).toBe(30 * 60 * 1_000);
    expect(LAST_SEEN_REFRESH_MILLISECONDS).toBe(5 * 60 * 1_000);

    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const lastSeenAt = new Date("2026-01-01T00:10:00.000Z");
    const expiresAt = new Date(
      createdAt.getTime() + ABSOLUTE_SESSION_MILLISECONDS,
    );

    expect(
      evaluateSessionLifetime(
        { createdAt, lastSeenAt, expiresAt },
        new Date("2026-01-01T00:14:59.999Z"),
      ),
    ).toEqual({ live: true, refreshLastSeen: false });
    expect(
      evaluateSessionLifetime(
        { createdAt, lastSeenAt, expiresAt },
        new Date("2026-01-01T00:15:00.000Z"),
      ),
    ).toEqual({ live: true, refreshLastSeen: true });
    expect(
      evaluateSessionLifetime(
        { createdAt, lastSeenAt, expiresAt },
        new Date("2026-01-01T00:40:00.000Z"),
      ).live,
    ).toBe(false);
    expect(
      evaluateSessionLifetime(
        { createdAt, lastSeenAt: expiresAt, expiresAt },
        expiresAt,
      ).live,
    ).toBe(false);
  });

  it("sets strict session and readable CSRF cookie attributes", () => {
    expect(sessionCookieOptions("session", false)).toMatchObject({
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      secure: false,
    });
    expect(sessionCookieOptions("csrf", true)).toMatchObject({
      httpOnly: false,
      sameSite: "strict",
      path: "/",
      secure: true,
    });
  });

  it("normalizes exact scheme, hostname, and effective-port tuples", () => {
    const allowed = parseAllowedOrigins(
      "https://Example.test,http://localhost:5173",
    );

    expect(validateOriginHeader(["https://example.test"], allowed)).toEqual({
      success: true,
    });
    expect(validateOriginHeader(["https://EXAMPLE.test:443"], allowed)).toEqual({
      success: true,
    });
    expect(validateOriginHeader(["http://localhost:5173"], allowed)).toEqual({
      success: true,
    });
  });

  it.each([
    [[], "ORIGIN_REQUIRED"],
    [["null"], "ORIGIN_FORBIDDEN"],
    [["not an origin"], "ORIGIN_FORBIDDEN"],
    [["https://example.test/path"], "ORIGIN_FORBIDDEN"],
    [["http://example.test"], "ORIGIN_FORBIDDEN"],
    [["https://other.test"], "ORIGIN_FORBIDDEN"],
    [["https://example.test:444"], "ORIGIN_FORBIDDEN"],
    [["https://example.test.attacker.invalid"], "ORIGIN_FORBIDDEN"],
    [["https://attacker-example.test"], "ORIGIN_FORBIDDEN"],
    [["https://example.test", "https://example.test"], "ORIGIN_FORBIDDEN"],
  ])("rejects unsafe Origin values %#", (headers, code) => {
    const allowed = parseAllowedOrigins("https://example.test");
    expect(validateOriginHeader(headers, allowed)).toEqual({
      success: false,
      code,
    });
  });
});
