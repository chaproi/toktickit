import { createHmac } from "node:crypto";

export const LOGIN_WINDOW_MILLISECONDS = 15 * 60 * 1_000;
export const LOGIN_FAILURE_LIMIT = 5;

export type ThrottleState = {
  failureCount: number;
  windowStartedAt: Date;
  blockedUntil: Date | null;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function deriveThrottleKey(
  email: string,
  ipAddress: string,
  secret: string,
): string {
  return createHmac("sha256", secret)
    .update(`${normalizeEmail(email)}\u0000${ipAddress}`)
    .digest("hex");
}

export function calculateFailedLogin(
  current: ThrottleState | null,
  now: Date,
): { state: ThrottleState; blockCurrentAttempt: boolean } {
  if (current?.blockedUntil && current.blockedUntil.getTime() > now.getTime()) {
    return { state: current, blockCurrentAttempt: true };
  }

  const withinWindow =
    current !== null &&
    now.getTime() - current.windowStartedAt.getTime() <
      LOGIN_WINDOW_MILLISECONDS;
  const failureCount = withinWindow ? current.failureCount + 1 : 1;
  const windowStartedAt = withinWindow ? current.windowStartedAt : now;
  const blockedUntil =
    failureCount >= LOGIN_FAILURE_LIMIT
      ? new Date(now.getTime() + LOGIN_WINDOW_MILLISECONDS)
      : null;

  return {
    state: { failureCount, windowStartedAt, blockedUntil },
    blockCurrentAttempt: false,
  };
}
