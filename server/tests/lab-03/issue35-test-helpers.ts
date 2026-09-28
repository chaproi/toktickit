import { randomUUID } from "node:crypto";
import type { TicketStatus, UserRole } from "@prisma/client";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import {
  authenticatedFixture,
  authenticatedUnsafe,
  cleanupIssue29Fixtures,
  createTicketFixture,
  type AuthenticatedFixture,
} from "./issue29-test-helpers.js";

export type { AuthenticatedFixture };
export const ISSUE35_PREFIX = "issue35-";

export async function issue35Actors() {
  const administrator = await authenticatedFixture({ role: "ADMINISTRATOR", label: "issue35-admin" });
  const otherAdministrator = await authenticatedFixture({ role: "ADMINISTRATOR", label: "issue35-other-admin" });
  const staff = await authenticatedFixture({ role: "IT_STAFF", label: "issue35-staff" });
  const requester = await authenticatedFixture({ role: "REQUESTER", label: "issue35-requester" });
  return { administrator, otherAdministrator, staff, requester };
}

export function adminGet(path: string, actor: AuthenticatedFixture) {
  return request(app).get(path).set("Cookie", actor.cookie);
}

export function adminPost(path: string, actor: AuthenticatedFixture, body: unknown) {
  return authenticatedUnsafe(request(app).post(path), actor).send(body as object);
}

export function adminPatch(path: string, actor: AuthenticatedFixture, body: unknown) {
  return authenticatedUnsafe(request(app).patch(path), actor).send(body as object);
}

export function editableUser(user: {
  name: string;
  email: string;
  role: UserRole;
  isActive?: boolean;
  updatedAt: Date;
}, overrides: Record<string, unknown> = {}) {
  return {
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive ?? true,
    expectedUpdatedAt: user.updatedAt.toISOString(),
    ...overrides,
  };
}

export async function ownedTicket(
  requesterId: number,
  ownerId: number,
  status: TicketStatus = "OPEN",
) {
  const ticket = await createTicketFixture(requesterId, status);
  return getPrisma().ticket.update({ where: { id: ticket.id }, data: { ownerId } });
}

export async function cleanupIssue35Fixtures(): Promise<void> {
  await cleanupIssue29Fixtures();
  const prisma = getPrisma();
  const users = await prisma.user.findMany({
    where: { email: { startsWith: ISSUE35_PREFIX } },
    select: { id: true },
  });
  const userIds = users.map(({ id }) => id);
  if (userIds.length === 0) return;
  await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

export function uniqueAdminInput(role: UserRole = "IT_STAFF") {
  const suffix = randomUUID();
  return {
    name: `Issue 35 User ${suffix.slice(0, 8)}`,
    email: `${ISSUE35_PREFIX}${suffix}@example.test`,
    role,
    isActive: true,
    initialPassword: `Issue35!Aa1${suffix}`,
    confirmPassword: `Issue35!Aa1${suffix}`,
  };
}
