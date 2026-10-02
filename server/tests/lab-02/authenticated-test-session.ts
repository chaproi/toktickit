import { randomUUID } from "node:crypto";
import type request from "supertest";
import { getPrisma } from "../../src/prisma.js";
import {
  ABSOLUTE_SESSION_MILLISECONDS,
  createOpaqueToken,
  digestToken,
} from "../../src/auth/session.js";
import { APPROVED_ORIGIN } from "../lab-03/auth-test-helpers.js";

export type TestSession = {
  id: string;
  userId: number;
  originalMustChangePassword: boolean;
  cookie: string;
  csrf: string;
};

export async function createTestSession(userId: number): Promise<TestSession> {
  const id = randomUUID();
  const sessionToken = createOpaqueToken();
  const csrf = createOpaqueToken();
  const now = new Date();
  const prisma = getPrisma();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { mustChangePassword: true },
  });
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { mustChangePassword: false },
    }),
    prisma.authSession.create({
      data: {
        id,
        userId,
        tokenHash: digestToken(sessionToken),
        csrfTokenHash: digestToken(csrf),
        createdAt: now,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + ABSOLUTE_SESSION_MILLISECONDS),
      },
    }),
  ]);
  return {
    id,
    userId,
    originalMustChangePassword: user.mustChangePassword,
    cookie: `toktickit_session=${encodeURIComponent(sessionToken)}; toktickit_csrf=${encodeURIComponent(csrf)}`,
    csrf,
  };
}

export function authenticated(call: request.Test, session: TestSession): request.Test {
  return call.set("Cookie", session.cookie);
}

export function authenticatedUnsafe(call: request.Test, session: TestSession): request.Test {
  return authenticated(call, session)
    .set("Origin", APPROVED_ORIGIN)
    .set("X-CSRF-Token", session.csrf);
}

export async function removeTestSessions(sessions: Iterable<TestSession>): Promise<void> {
  const allSessions = [...sessions];
  const ids = allSessions.map(({ id }) => id);
  if (ids.length > 0) {
    const prisma = getPrisma();
    await prisma.$transaction([
      prisma.authSession.deleteMany({ where: { id: { in: ids } } }),
      ...allSessions.map((session) => prisma.user.update({
        where: { id: session.userId },
        data: { mustChangePassword: session.originalMustChangePassword },
      })),
    ]);
  }
}
