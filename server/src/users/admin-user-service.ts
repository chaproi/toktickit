import { createHash } from "node:crypto";
import { Prisma, type UserRole } from "@prisma/client";
import { runAdmittedSerializableMutation as runSerializableMutation } from "../auth/eligibility-transaction.js";
import { hashPassword } from "../auth/password.js";
import { getPrisma } from "../prisma.js";
import { validateCommandSession } from "../auth/command-session.js";
import { commandOwns } from "../database/write-admission.js";
import { escapePostgresLikePattern } from "../tickets/ticket-query.js";
import type {
  AdminUserQuery,
  CreateAdminUserInput,
  EditAdminUserInput,
  InitialPasswordInput,
} from "./admin-user-validation.js";
import { wouldRemoveLastActiveAdministrator } from "./admin-user-validation.js";

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

type LockedUser = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  updatedAt: Date;
  mustChangePassword: boolean;
};

function emailGate(email: string): number {
  return createHash("sha256").update(email).digest().readInt32BE(0);
}

async function lockUsers(transaction: Prisma.TransactionClient, ids: readonly number[], actorId: number, revokeUsers: number[] = []) {
  const ordered = [...new Set(ids)].sort((left, right) => left - right);
  if (ordered.length === 0) return [];
  const users = await transaction.$queryRaw<LockedUser[]>(Prisma.sql`
    SELECT "id", "name", "email", "role", "isActive", "updatedAt", "mustChangePassword"
    FROM "User"
    WHERE "id" IN (${Prisma.join(ordered)})
    ORDER BY "id" ASC
    FOR UPDATE
  `);
  const actor = users.find(u => u.id === actorId);
  await validateCommandSession(transaction, actorId, isAdministrator(actor), actor?.mustChangePassword ?? false, revokeUsers);
  return users;
}

function isAdministrator(user: LockedUser | null | undefined): boolean {
  return Boolean(user?.isActive && user.role === "ADMINISTRATOR");
}

export async function listAdminUsers(query: AdminUserQuery) {
  const literalSearch = query.search
    ? escapePostgresLikePattern(query.search)
    : undefined;
  const users = await getPrisma().user.findMany({
    where: {
      ...(query.role ? { role: query.role } : {}),
      ...(literalSearch ? {
        OR: [
          { name: { contains: literalSearch, mode: "insensitive" as const } },
          { email: { contains: literalSearch, mode: "insensitive" as const } },
        ],
      } : {}),
    },
    select: userSelect,
  });
  return users.sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) || left.id - right.id);
}

export async function createAdminUser(actorId: number, input: CreateAdminUserInput) {
  const passwordHash = await hashPassword(input.initialPassword);
  return runSerializableMutation(async (transaction) => {
    const users = await lockUsers(transaction, [actorId], actorId);
    if (!isAdministrator(users[0])) return { kind: "actor-conflict" as const };
    const duplicate = await transaction.user.findFirst({
      where: { email: { equals: input.email, mode: "insensitive" } },
      select: { id: true },
    });
    if (duplicate) return { kind: "duplicate-email" as const };
    const user = await transaction.user.create({
      data: {
        name: input.name,
        email: input.email,
        role: input.role,
        isActive: input.isActive,
        passwordHash,
        mustChangePassword: true,
      },
      select: userSelect,
    });
    return { kind: "success" as const, user };
  }, undefined, [
    { scope: 1, id: actorId },
    { scope: 1002, id: 0 }, { scope: 1003, id: emailGate(input.email) },
  ]);
}

async function preliminaryEditState(actorId: number, targetId: number) {
  const prisma = getPrisma();
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true, email: true } });
  return {
    userIds: [actorId, targetId], oldEmail: target?.email,
    targetExists: target !== null,
  };
}

export async function editAdminUser(actorId: number, targetId: number, input: EditAdminUserInput) {
  const preliminary = await preliminaryEditState(actorId, targetId);
  if (!preliminary.targetExists) return { kind: "not-found" as const };
  return runSerializableMutation(async (transaction) => {
    const users = await lockUsers(transaction, preliminary.userIds, actorId, [targetId]);
    const actor = users.find(({ id }) => id === actorId);
    const target = users.find(({ id }) => id === targetId);
    if (!isAdministrator(actor)) return { kind: "actor-conflict" as const };
    if (!target) return { kind: "not-found" as const };

    const ownedTickets = await transaction.$queryRaw<Array<{ id: number }>>`
      SELECT "id"
      FROM "Ticket"
      WHERE "ownerId" = ${targetId}
        AND "currentStatus" NOT IN ('CLOSED'::"TicketStatus", 'CANCELLED'::"TicketStatus")
      ORDER BY "id" ASC
      FOR UPDATE
    `;
    if (target.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) return { kind: "stale" as const };
    if (actorId === targetId && (target.role !== input.role || target.isActive !== input.isActive)) {
      return { kind: "self-change" as const };
    }

    const activeAdministratorCount = await transaction.user.count({ where: { role: "ADMINISTRATOR", isActive: true } });
    if (target.role === "ADMINISTRATOR" && wouldRemoveLastActiveAdministrator(
      activeAdministratorCount,
      target.isActive,
      input.role,
      input.isActive,
    )) return { kind: "last-administrator" as const };

    const remainsOwnerEligible = input.isActive &&
      (input.role === "IT_STAFF" || input.role === "ADMINISTRATOR");
    if (!remainsOwnerEligible && ownedTickets.length > 0) return { kind: "non-terminal-owner" as const };

    // Assignment/status writes hold this target's shared User gate and row lock.
    // Check inside each fresh coordinated attempt, without adding child locks
    // or discovering/acquiring another User lock after the owned Ticket locks.
    if (!remainsOwnerEligible && await transaction.action.findFirst({
      where: { assigneeId: targetId, status: { in: ["PLANNED", "IN_PROGRESS"] } },
      select: { id: true },
    })) return { kind: "open-action-assignee" as const };

    if (target.email !== preliminary.oldEmail || ownedTickets.some(ticket => !commandOwns(2, ticket.id))) {
      return { kind: "actor-conflict" as const };
    }

    const duplicate = await transaction.user.findFirst({
      where: { email: { equals: input.email, mode: "insensitive" }, id: { not: targetId } },
      select: { id: true },
    });
    if (duplicate) return { kind: "duplicate-email" as const };

    const authorizationChanged = target.role !== input.role || target.isActive !== input.isActive;
    const user = await transaction.user.update({
      where: { id: targetId },
      data: {
        name: input.name,
        email: input.email,
        role: input.role,
        isActive: input.isActive,
      },
      select: userSelect,
    });
    if (authorizationChanged) await transaction.authSession.deleteMany({ where: { userId: targetId } });
    return { kind: "success" as const, user };
  }, undefined, [
    ...preliminary.userIds.map((id) => ({ scope: 1 as const, id })),
    { scope: 1002, id: 0 }, { scope: 1003, id: emailGate(input.email) },
    ...(preliminary.oldEmail ? [{ scope: 1003 as const, id: emailGate(preliminary.oldEmail.toLowerCase()) }] : []),
  ], { ownedTicketsOf: targetId });
}

export async function resetAdminInitialPassword(
  actorId: number,
  targetId: number,
  input: InitialPasswordInput,
) {
  if (actorId === targetId) return { kind: "self-reset" as const };
  const passwordHash = await hashPassword(input.initialPassword);
  return runSerializableMutation(async (transaction) => {
    const users = await lockUsers(transaction, [actorId, targetId], actorId, [targetId]);
    if (!isAdministrator(users.find(({ id }) => id === actorId))) return { kind: "actor-conflict" as const };
    if (!users.some(({ id }) => id === targetId)) return { kind: "not-found" as const };
    const user = await transaction.user.update({
      where: { id: targetId },
      data: { passwordHash, mustChangePassword: true, passwordChangedAt: new Date() },
      select: userSelect,
    });
    await transaction.authSession.deleteMany({ where: { userId: targetId } });
    return { kind: "success" as const, user };
  }, undefined, [
    { scope: 1, id: actorId },
    { scope: 1, id: targetId },
  ]);
}
