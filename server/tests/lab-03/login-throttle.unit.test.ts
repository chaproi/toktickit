import { describe, expect, it } from "vitest";
import {
  calculateFailedLogin,
  deriveThrottleKey,
  normalizeEmail,
} from "../../src/auth/throttle.js";

describe("UNIT-03 email and persistent throttle calculations", () => {
  it("normalizes equivalent email input", () => {
    expect(normalizeEmail("  Person@Example.COM ")).toBe(
      "person@example.com",
    );
  });

  it("derives a non-reversible stable key from normalized email and IP", () => {
    const first = deriveThrottleKey(
      " Person@Example.COM ",
      "127.0.0.1",
      "synthetic-test-hmac-key",
    );
    const second = deriveThrottleKey(
      "person@example.com",
      "127.0.0.1",
      "synthetic-test-hmac-key",
    );

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/u);
    expect(first).not.toContain("person@example.com");
    expect(first).not.toContain("127.0.0.1");
  });

  it("blocks only after five failures in the fifteen-minute window", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    let state = null;

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const result = calculateFailedLogin(state, now);
      state = result.state;
      expect(result.state.failureCount).toBe(attempt);
      expect(result.blockCurrentAttempt).toBe(false);
    }

    expect(state?.blockedUntil).toEqual(
      new Date("2026-01-01T00:15:00.000Z"),
    );
    const blocked = calculateFailedLogin(
      state,
      new Date("2026-01-01T00:00:01.000Z"),
    );
    expect(blocked.blockCurrentAttempt).toBe(true);
  });

  it("starts a fresh window after expiration", () => {
    const result = calculateFailedLogin(
      {
        failureCount: 5,
        windowStartedAt: new Date("2026-01-01T00:00:00.000Z"),
        blockedUntil: new Date("2026-01-01T00:15:00.000Z"),
      },
      new Date("2026-01-01T00:15:00.001Z"),
    );

    expect(result.blockCurrentAttempt).toBe(false);
    expect(result.state.failureCount).toBe(1);
    expect(result.state.blockedUntil).toBeNull();
  });
});
