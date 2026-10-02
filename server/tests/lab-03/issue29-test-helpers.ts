import { randomBytes, randomUUID } from "node:crypto";
import type { TicketStatus, UserRole } from "@prisma/client";
import request from "supertest";
import { app } from "../../src/app.js";
import { hashPassword } from "../../src/auth/password.js";
import { getPrisma } from "../../src/prisma.js";
import {
  APPROVED_ORIGIN,
  cookieHeader,
  cookieValue,
} from "./auth-test-helpers.js";

const FIXTURE_PREFIX = "issue29-";

export type AuthenticatedFixture = {
  user: {
    id: number;
    name: string;
    email: string;
    role: UserRole;
  };
  cookie: string;
  csrf: string;
};

export async function authenticatedFixture({
  role = "REQUESTER",
  mustChangePassword = false,
  label = "user",
}: {
  role?: UserRole;
  mustChangePassword?: boolean;
  label?: string;
} = {}): Promise<AuthenticatedFixture> {
  const password = `Aa1!${randomBytes(18).toString("base64url")}`;
  const email = `${FIXTURE_PREFIX}${label}-${randomUUID()}@example.test`;
  const user = await getPrisma().user.create({
    data: {
      name: `Issue 29 ${label}`,
      email,
      role,
      passwordHash: await hashPassword(password),
      mustChangePassword,
    },
    select: { id: true, name: true, email: true, role: true },
  });
  const login = await request(app)
    .post("/api/auth/login")
    .set("Origin", APPROVED_ORIGIN)
    .send({ email, password })
    .expect(200);

  return {
    user,
    cookie: cookieHeader(login.headers["set-cookie"]),
    csrf: cookieValue(login.headers["set-cookie"], "toktickit_csrf"),
  };
}
export function authenticatedUnsafe(
  call: request.Test,
  fixture: AuthenticatedFixture,
): request.Test {
  return call
    .set("Cookie", fixture.cookie)
    .set("Origin", APPROVED_ORIGIN)
    .set("X-CSRF-Token", fixture.csrf);
}

export async function referenceIds(): Promise<{
  categoryId: number;
  relatedSystemId: number;
}> {
  const prisma = getPrisma();
  const [category, relatedSystem] = await Promise.all([
    prisma.category.findFirstOrThrow({ where: { isActive: true } }),
    prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } }),
  ]);
  return { categoryId: category.id, relatedSystemId: relatedSystem.id };
}

export async function createTicketFixture(
  requesterId: number,
  currentStatus: TicketStatus = "NEW",
) {
  const prisma = getPrisma();
  const references = await referenceIds();
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  return prisma.ticket.create({
    data: {
      ticketNumber: `I29-${suffix}`,
      clientSubmissionId: randomUUID(),
      requesterId,
      ...references,
      requestedPriority: "HIGH",
      itPriority: "MEDIUM",
      currentStatus,
      summary: `Issue 29 fixture ${suffix}`,
      description: "Synthetic Issue 29 authenticated requester fixture.",
    },
  });
}

export async function cleanupIssue29Fixtures(): Promise<void> {
  const prisma = getPrisma();
  const users = await prisma.user.findMany({
    where: { email: { startsWith: FIXTURE_PREFIX } },
    select: { id: true },
  });
  const userIds = users.map(({ id }) => id);
  if (userIds.length === 0) return;
  const tickets = await prisma.ticket.findMany({
    where: { requesterId: { in: userIds } },
    select: { id: true },
  });
  const ticketIds = tickets.map(({ id }) => id);
  await prisma.$transaction([
    prisma.ticketStatusHistory.deleteMany({ where: { ticketId: { in: ticketIds } } }),
    prisma.internalNote.deleteMany({ where: { ticketId: { in: ticketIds } } }),
    prisma.publicComment.deleteMany({ where: { ticketId: { in: ticketIds } } }),
    prisma.attachment.deleteMany({ where: { ticketId: { in: ticketIds } } }),
    prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } }),
    prisma.authSession.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.user.deleteMany({ where: { id: { in: userIds } } }),
  ]);
}
