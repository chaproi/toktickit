import { createHash, randomBytes } from "node:crypto";
import type { CookieOptions } from "express";

export const ABSOLUTE_SESSION_MILLISECONDS = 8 * 60 * 60 * 1_000;
export const IDLE_SESSION_MILLISECONDS = 30 * 60 * 1_000;
export const LAST_SEEN_REFRESH_MILLISECONDS = 5 * 60 * 1_000;

export function createOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function digestToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function evaluateSessionLifetime(
  session: {
    createdAt: Date;
    lastSeenAt: Date;
    expiresAt: Date;
  },
  now: Date,
): { live: boolean; refreshLastSeen: boolean } {
  const absoluteExpired = now.getTime() >= session.expiresAt.getTime();
  const idleExpired =
    now.getTime() - session.lastSeenAt.getTime() >=
    IDLE_SESSION_MILLISECONDS;
  if (absoluteExpired || idleExpired) {
    return { live: false, refreshLastSeen: false };
  }

  return {
    live: true,
    refreshLastSeen:
      now.getTime() - session.lastSeenAt.getTime() >=
      LAST_SEEN_REFRESH_MILLISECONDS,
  };
}

export function sessionCookieOptions(
  kind: "session" | "csrf",
  secure: boolean,
  maxAge = ABSOLUTE_SESSION_MILLISECONDS,
): CookieOptions {
  return {
    httpOnly: kind === "session",
    sameSite: "strict",
    path: "/",
    secure,
    maxAge,
  };
}

export function parseCookieHeader(value: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const segment of value?.split(";") ?? []) {
    const separator = segment.indexOf("=");
    if (separator <= 0) continue;
    const name = segment.slice(0, separator).trim();
    const rawValue = segment.slice(separator + 1).trim();
    try {
      cookies.set(name, decodeURIComponent(rawValue));
    } catch {
      cookies.set(name, rawValue);
    }
  }
  return cookies;
}
