import { timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response } from "express";
import type { AuthSession, User } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import {
  getDummyPasswordHash,
  hashPassword,
  validateNewPassword,
  verifyPassword,
} from "./password.js";
import {
  parseAllowedOrigins,
  rawOriginHeaders,
  validateOriginHeader,
} from "./origin.js";
import {
  ABSOLUTE_SESSION_MILLISECONDS,
  createOpaqueToken,
  digestToken,
  evaluateSessionLifetime,
  parseCookieHeader,
  sessionCookieOptions,
} from "./session.js";
import {
  calculateFailedLogin,
  deriveThrottleKey,
  normalizeEmail,
} from "./throttle.js";

const SESSION_COOKIE = "toktickit_session";
const CSRF_COOKIE = "toktickit_csrf";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

type SafeUser = Pick<
  User,
  "id" | "name" | "email" | "role" | "mustChangePassword"
>;

type LiveSession = {
  session: AuthSession;
  user: User;
  csrfCookie: string | undefined;
};

class ConcurrentPasswordChangeError extends Error {}

export function isAllowedDuringMandatoryPasswordChange(
  method: string,
  path: string,
): boolean {
  return new Set([
    "GET /api/auth/me",
    "POST /api/auth/logout",
    "POST /api/auth/change-password",
  ]).has(`${method.toUpperCase()} ${path}`);
}

function errorBody(code: string, message: string, fields?: Record<string, string>) {
  return {
    error: {
      code,
      message,
      ...(fields ? { fields } : {}),
    },
  };
}

function safeUser(user: User): SafeUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
}

function authenticationResponse(user: User, expiresAt: Date) {
  return {
    user: safeUser(user),
    session: { expiresAt: expiresAt.toISOString() },
  };
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function isLocalDevelopmentOrigin(req: Request): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const rawOrigin = rawOriginHeaders(req.rawHeaders);
  if (rawOrigin.length !== 1) return false;
  try {
    const hostname = new URL(rawOrigin[0]!).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

function setAuthenticationCookies(
  req: Request,
  res: Response,
  sessionToken: string,
  csrfToken: string,
  expiresAt: Date,
): void {
  const maxAge = Math.max(0, expiresAt.getTime() - Date.now());
  const secure = !isLocalDevelopmentOrigin(req);
  res.cookie(
    SESSION_COOKIE,
    sessionToken,
    sessionCookieOptions("session", secure, maxAge),
  );
  res.cookie(
    CSRF_COOKIE,
    csrfToken,
    sessionCookieOptions("csrf", secure, maxAge),
  );
}

function clearAuthenticationCookies(req: Request, res: Response): void {
  const secure = !isLocalDevelopmentOrigin(req);
  const common = { path: "/", sameSite: "strict" as const, secure };
  res.clearCookie(SESSION_COOKIE, { ...common, httpOnly: true });
  res.clearCookie(CSRF_COOKIE, { ...common, httpOnly: false });
}

function validateConfiguredOrigin(req: Request):
  | { success: true }
  | { success: false; code: "ORIGIN_REQUIRED" | "ORIGIN_FORBIDDEN" | "SERVICE_UNAVAILABLE" } {
  try {
    const allowed = parseAllowedOrigins(process.env.AUTH_ALLOWED_ORIGINS);
    if (allowed.length === 0) {
      throw new Error("No authentication origins are configured.");
    }
    return validateOriginHeader(
      rawOriginHeaders(req.rawHeaders),
      allowed,
    );
  } catch {
    return { success: false, code: "SERVICE_UNAVAILABLE" };
  }
}

function requireOrigin(req: Request, res: Response): boolean {
  const result = validateConfiguredOrigin(req);
  if (result.success) return true;
  if (result.code === "SERVICE_UNAVAILABLE") {
    res.status(503).json(
      errorBody(
        "SERVICE_UNAVAILABLE",
        "Service is temporarily unavailable. Please try again.",
      ),
    );
    return false;
  }
  res.status(403).json(
    errorBody(
      result.code,
      result.code === "ORIGIN_REQUIRED"
        ? "Origin header is required."
        : "Origin is not permitted.",
    ),
  );
  return false;
}

async function createSession(userId: number, successfulThrottleKey: string) {
  const prisma = getPrisma();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ABSOLUTE_SESSION_MILLISECONDS);
  const sessionToken = createOpaqueToken();
  const csrfToken = createOpaqueToken();
  const session = await prisma.$transaction(async (transaction) => {
    const created = await transaction.authSession.create({
      data: {
        userId,
        tokenHash: digestToken(sessionToken),
        csrfTokenHash: digestToken(csrfToken),
        createdAt: now,
        lastSeenAt: now,
        expiresAt,
      },
    });
    await transaction.loginThrottle.deleteMany({
      where: { keyHash: successfulThrottleKey },
    });
    return created;
  });
  return { session, sessionToken, csrfToken };
}

async function resolveLiveSession(
  req: Request,
  refreshLastSeen = true,
): Promise<LiveSession | null> {
  const cookies = parseCookieHeader(req.header("Cookie"));
  const rawToken = cookies.get(SESSION_COOKIE);
  if (!rawToken || Buffer.byteLength(rawToken, "utf8") > 256) return null;

  const prisma = getPrisma();
  const record = await prisma.authSession.findUnique({
    where: { tokenHash: digestToken(rawToken) },
    include: { user: true },
  });
  if (!record) return null;

  const now = new Date();
  const lifetime = evaluateSessionLifetime(record, now);
  if (!lifetime.live || !record.user.isActive) {
    await prisma.authSession.deleteMany({ where: { id: record.id } });
    return null;
  }
  const session = lifetime.refreshLastSeen && refreshLastSeen
    ? await prisma.authSession.update({
        where: { id: record.id },
        data: { lastSeenAt: now },
      })
    : record;

  return {
    session,
    user: record.user,
    csrfCookie: cookies.get(CSRF_COOKIE),
  };
}

function requireCsrf(req: Request, res: Response, live: LiveSession): boolean {
  const csrfHeader = req.header("X-CSRF-Token");
  if (
    !csrfHeader ||
    !live.csrfCookie ||
    csrfHeader.includes(",") ||
    !safeEqual(csrfHeader, live.csrfCookie) ||
    !safeEqual(digestToken(csrfHeader), live.session.csrfTokenHash)
  ) {
    res.status(403).json(errorBody("CSRF_INVALID", "CSRF validation failed."));
    return false;
  }
  return true;
}

function loginBody(body: unknown):
  | { success: true; email: string; password: string; emailSyntacticallyValid: boolean }
  | { success: false; fields: Record<string, string> } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { success: false, fields: { body: "A JSON object is required." } };
  }
  const input = body as Record<string, unknown>;
  const fields: Record<string, string> = {};
  const unknown = Object.keys(input).filter((key) => key !== "email" && key !== "password");
  if (unknown.length > 0) fields.body = "Unknown fields are not permitted.";
  if (typeof input.email !== "string" || input.email.trim().length === 0) {
    fields.email = "Email is required.";
  } else if (Array.from(input.email.trim()).length > 254) {
    fields.email = "Email must contain at most 254 characters.";
  }
  if (typeof input.password !== "string" || input.password.length === 0) {
    fields.password = "Password is required.";
  } else if (Array.from(input.password).length > 128) {
    fields.password = "Password must contain at most 128 characters.";
  }
  if (Object.keys(fields).length > 0) return { success: false, fields };

  const email = normalizeEmail(input.email as string);
  return {
    success: true,
    email,
    password: input.password as string,
    emailSyntacticallyValid: EMAIL_PATTERN.test(email),
  };
}

function passwordBody(body: unknown):
  | { success: true; currentPassword: string; newPassword: string; confirmPassword: string }
  | { success: false; fields: Record<string, string> } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { success: false, fields: { body: "A JSON object is required." } };
  }
  const input = body as Record<string, unknown>;
  const fields: Record<string, string> = {};
  const allowed = new Set(["currentPassword", "newPassword", "confirmPassword"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    fields.body = "Unknown fields are not permitted.";
  }
  for (const key of allowed) {
    const value = input[key];
    if (typeof value !== "string" || value.length === 0 || Array.from(value).length > 128) {
      fields[key] = `${key} must be a non-empty string of at most 128 characters.`;
    }
  }
  if (Object.keys(fields).length > 0) return { success: false, fields };
  return {
    success: true,
    currentPassword: input.currentPassword as string,
    newPassword: input.newPassword as string,
    confirmPassword: input.confirmPassword as string,
  };
}

async function throttleKey(email: string, req: Request): Promise<string | null> {
  const secret = process.env.LOGIN_THROTTLE_HMAC_SECRET;
  if (!secret || secret.length < 16) return null;
  return deriveThrottleKey(email, req.ip || req.socket.remoteAddress || "unknown", secret);
}

async function activeThrottle(keyHash: string, now: Date) {
  const state = await getPrisma().loginThrottle.findUnique({ where: { keyHash } });
  return state?.blockedUntil && state.blockedUntil.getTime() > now.getTime()
    ? state
    : null;
}

async function recordFailedLogin(keyHash: string, now: Date): Promise<void> {
  const prisma = getPrisma();
  const current = await prisma.loginThrottle.findUnique({ where: { keyHash } });
  const { state } = calculateFailedLogin(current, now);
  await prisma.loginThrottle.upsert({
    where: { keyHash },
    create: { keyHash, ...state },
    update: state,
  });
}

export const authRouter = Router();

authRouter.post("/api/auth/login", async (req, res) => {
  if (!requireOrigin(req, res)) return;

  const body = loginBody(req.body);
  if (!body.success) {
    res.status(400).json(
      errorBody("VALIDATION_ERROR", "Please correct the highlighted fields.", body.fields),
    );
    return;
  }

  const keyHash = await throttleKey(body.email, req);
  if (!keyHash) {
    res.status(503).json(
      errorBody("SERVICE_UNAVAILABLE", "Service is temporarily unavailable. Please try again."),
    );
    return;
  }

  try {
    const now = new Date();
    const blocked = await activeThrottle(keyHash, now);
    if (blocked?.blockedUntil) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((blocked.blockedUntil.getTime() - now.getTime()) / 1_000),
      );
      res.set("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        error: {
          code: "LOGIN_THROTTLED",
          message: "Too many login attempts. Please try again later.",
          retryAfterSeconds,
        },
      });
      return;
    }

    const user = body.emailSyntacticallyValid
      ? await getPrisma().user.findUnique({ where: { email: body.email } })
      : null;
    const verified = await verifyPassword(
      user?.passwordHash ?? (await getDummyPasswordHash()),
      body.password,
    );
    if (!user || !verified) {
      await recordFailedLogin(keyHash, now);
      res.status(401).json(
        errorBody("INVALID_CREDENTIALS", "Email or password is incorrect."),
      );
      return;
    }
    if (!user.isActive) {
      await recordFailedLogin(keyHash, now);
      res.status(403).json(errorBody("ACCOUNT_INACTIVE", "This account is inactive."));
      return;
    }

    const created = await createSession(user.id, keyHash);
    setAuthenticationCookies(
      req,
      res,
      created.sessionToken,
      created.csrfToken,
      created.session.expiresAt,
    );
    res.status(200).json(authenticationResponse(user, created.session.expiresAt));
  } catch {
    res.status(503).json(
      errorBody("SERVICE_UNAVAILABLE", "Service is temporarily unavailable. Please try again."),
    );
  }
});

authRouter.get("/api/auth/me", async (req, res) => {
  try {
    const live = await resolveLiveSession(req);
    if (!live) {
      clearAuthenticationCookies(req, res);
      res.status(401).json(
        errorBody("AUTHENTICATION_REQUIRED", "Authentication is required."),
      );
      return;
    }
    res.status(200).json(authenticationResponse(live.user, live.session.expiresAt));
  } catch {
    res.status(503).json(
      errorBody("SERVICE_UNAVAILABLE", "Service is temporarily unavailable. Please try again."),
    );
  }
});

authRouter.post("/api/auth/logout", async (req, res) => {
  try {
    const live = await resolveLiveSession(req, false);
    if (!live) {
      clearAuthenticationCookies(req, res);
      res.status(204).send();
      return;
    }
    if (!requireOrigin(req, res) || !requireCsrf(req, res, live)) return;
    await getPrisma().authSession.deleteMany({ where: { id: live.session.id } });
    clearAuthenticationCookies(req, res);
    res.status(204).send();
  } catch {
    res.status(503).json(
      errorBody("SERVICE_UNAVAILABLE", "Service is temporarily unavailable. Please try again."),
    );
  }
});

authRouter.post("/api/auth/change-password", async (req, res) => {
  try {
    const live = await resolveLiveSession(req, false);
    if (!live) {
      clearAuthenticationCookies(req, res);
      res.status(401).json(
        errorBody("AUTHENTICATION_REQUIRED", "Authentication is required."),
      );
      return;
    }
    if (!requireOrigin(req, res) || !requireCsrf(req, res, live)) return;

    const body = passwordBody(req.body);
    if (!body.success) {
      res.status(400).json(
        errorBody("VALIDATION_ERROR", "Please correct the highlighted fields.", body.fields),
      );
      return;
    }
    if (!(await verifyPassword(live.user.passwordHash, body.currentPassword))) {
      res.status(400).json(
        errorBody("INVALID_CURRENT_PASSWORD", "Current password is incorrect."),
      );
      return;
    }
    const validation = validateNewPassword(
      body.newPassword,
      body.currentPassword,
      body.confirmPassword,
    );
    if (!validation.success) {
      res.status(400).json(
        errorBody("VALIDATION_ERROR", "Please correct the highlighted fields.", {
          newPassword: validation.message,
        }),
      );
      return;
    }

    const passwordHash = await hashPassword(body.newPassword);
    const sessionToken = createOpaqueToken();
    const csrfToken = createOpaqueToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ABSOLUTE_SESSION_MILLISECONDS);
    const changed = await getPrisma().$transaction(async (transaction) => {
      const update = await transaction.user.updateMany({
        where: {
          id: live.user.id,
          isActive: true,
          passwordHash: live.user.passwordHash,
        },
        data: {
          passwordHash,
          mustChangePassword: false,
          passwordChangedAt: now,
        },
      });
      if (update.count !== 1) {
        throw new ConcurrentPasswordChangeError();
      }
      const user = await transaction.user.findUniqueOrThrow({
        where: { id: live.user.id },
      });
      await transaction.authSession.deleteMany({ where: { userId: live.user.id } });
      await transaction.authSession.create({
        data: {
          userId: live.user.id,
          tokenHash: digestToken(sessionToken),
          csrfTokenHash: digestToken(csrfToken),
          createdAt: now,
          lastSeenAt: now,
          expiresAt,
        },
      });
      return user;
    });

    setAuthenticationCookies(req, res, sessionToken, csrfToken, expiresAt);
    res.status(200).json(authenticationResponse(changed, expiresAt));
  } catch (error) {
    if (error instanceof ConcurrentPasswordChangeError) {
      res.status(409).json(
        errorBody("CONCURRENT_UPDATE", "The account changed. Please try again."),
      );
      return;
    }
    res.status(503).json(
      errorBody("SERVICE_UNAVAILABLE", "Service is temporarily unavailable. Please try again."),
    );
  }
});
