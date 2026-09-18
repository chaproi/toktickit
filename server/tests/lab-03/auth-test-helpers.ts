import { randomBytes, randomUUID } from "node:crypto";
import type { UserRole } from "@prisma/client";
import request from "supertest";
import { app } from "../../src/app.js";
import { hashPassword } from "../../src/auth/password.js";
import { getPrisma } from "../../src/prisma.js";

export const APPROVED_ORIGIN = "http://localhost:5173";
export const AUTH_TEST_EMAIL_PREFIX = "issue27-auth-";

export function syntheticPassword(): string {
  return `Aa1!${randomBytes(16).toString("base64url")}`;
}

export function syntheticEmail(label: string): string {
  return `${AUTH_TEST_EMAIL_PREFIX}${label}-${randomUUID()}@example.test`;
}

export async function createAuthUser({
  email = syntheticEmail("user"),
  password = syntheticPassword(),
  role = "REQUESTER",
  isActive = true,
  mustChangePassword = false,
}: {
  email?: string;
  password?: string;
  role?: UserRole;
  isActive?: boolean;
  mustChangePassword?: boolean;
} = {}) {
  const user = await getPrisma().user.create({
    data: {
      name: "Issue 27 Synthetic User",
      email: email.trim().toLowerCase(),
      role,
      passwordHash: await hashPassword(password),
      isActive,
      mustChangePassword,
    },
  });

  return { user, password };
}

export async function cleanupAuthFixtures(): Promise<void> {
  const prisma = getPrisma();
  const users = await prisma.user.findMany({
    where: { email: { startsWith: AUTH_TEST_EMAIL_PREFIX } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);

  if (userIds.length > 0) {
    await prisma.authSession.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: userIds } },
    });
  }
  await prisma.loginThrottle.deleteMany({});
}

export function loginRequest(
  email: string,
  password: string,
  origin = APPROVED_ORIGIN,
) {
  return request(app)
    .post("/api/auth/login")
    .set("Origin", origin)
    .send({ email, password });
}

export function cookieValue(
  setCookie: string | string[] | undefined,
  name: string,
): string {
  const values = typeof setCookie === "string" ? [setCookie] : setCookie;
  const cookie = values?.find((value) => value.startsWith(`${name}=`));
  if (!cookie) {
    throw new Error(`Expected ${name} cookie.`);
  }
  return cookie.slice(name.length + 1).split(";", 1)[0] ?? "";
}

export function cookieHeader(setCookie: string | string[] | undefined): string {
  const values = typeof setCookie === "string" ? [setCookie] : (setCookie ?? []);
  return values
    .map((value) => value.split(";", 1)[0])
    .join("; ");
}
