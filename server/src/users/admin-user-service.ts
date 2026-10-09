import { createHash } from "node:crypto";
import { Prisma, type UserRole } from "@prisma/client";
import { runSerializableMutation } from "../auth/eligibility-transaction.js";
import { hashPassword } from "../auth/password.js";
import { getPrisma } from "../prisma.js";
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
};

function emailGate(email: string): number {
  return createHash("sha256").update(email).digest().readInt32BE(0);
}

async function lockUsers(transaction: Prisma.TransactionClient, ids: readonly number[]) {
  const ordered = [...new Set(ids)].sort((left, right) => left - right);
  if (ordered.length === 0) return [];
  return transaction.$queryRaw<LockedUser[]>(Prisma.sql`
    SELECT "id", "name", "email", "role", "isActive", "updatedAt"
    FROM "User"
    WHERE "id" IN (${Prisma.join(ordered)})
    ORDER BY "id" ASC
    FOR UPDATE
  `);
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
    const users = await lockUsers(transaction, [actorId]);
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
    { scope: 3, id: emailGate(input.email) },
  ]);
}

async function preliminaryEditState(actorId: number, targetId: number) {
  const prisma = getPrisma();
  const [target, activeAdministrators, tickets] = await Promise.all([
    prisma.user.findUnique({ where: { id: targetId }, select: { id: true } }),
    prisma.user.findMany({
      where: { role: "ADMINISTRATOR", isActive: true },
      select: { id: true },
      orderBy: { id: "asc" },
    }),
    prisma.ticket.findMany({
      where: { ownerId: targetId, currentStatus: { notIn: ["CLOSED", "CANCELLED"] } },
      select: { id: true },
      orderBy: { id: "asc" },
    }),
  ]);
  return {
    userIds: [actorId, targetId, ...activeAdministrators.map(({ id }) => id)],
    ticketIds: tickets.map(({ id }) => id),
    targetExists: target !== null,
  };
}

export async function editAdminUser(actorId: number, targetId: number, input: EditAdminUserInput) {
  const preliminary = await preliminaryEditState(actorId, targetId);
  if (!preliminary.targetExists) return { kind: "not-found" as const };
  return runSerializableMutation(async (transaction) => {
    const users = await lockUsers(transaction, preliminary.userIds);
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

    const activeAdministratorCount = users.filter(isAdministrator).length;
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
    // Check inside each fresh SERIALIZABLE attempt, without adding child locks
    // or discovering/acquiring another User lock after the owned Ticket locks.
    if (!remainsOwnerEligible && await transaction.action.findFirst({
      where: { assigneeId: targetId, status: { in: ["PLANNED", "IN_PROGRESS"] } },
      select: { id: true },
    })) return { kind: "open-action-assignee" as const };

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
    ...preliminary.ticketIds.map((id) => ({ scope: 2 as const, id })),
    { scope: 3, id: emailGate(input.email) },
  ]);
}

export async function resetAdminInitialPassword(
  actorId: number,
  targetId: number,
  input: InitialPasswordInput,
) {
  if (actorId === targetId) return { kind: "self-reset" as const };
  const passwordHash = await hashPassword(input.initialPassword);
  return runSerializableMutation(async (transaction) => {
    const users = await lockUsers(transaction, [actorId, targetId]);
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
