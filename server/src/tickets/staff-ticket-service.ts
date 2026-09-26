import { Prisma, type RequestedPriority, type TicketStatus, type UserRole } from "@prisma/client";
import { runSerializableMutation } from "../auth/eligibility-transaction.js";
import { getPrisma } from "../prisma.js";
import {
  allowedStatusTransitions,
  canUnassignTicket,
  statusRequiresOwner,
} from "./ticket-validation.js";

const detailSelect = {
  id: true,
  ticketNumber: true,
  ticketDate: true,
  requester: { select: { id: true, name: true, email: true } },
  category: { select: { id: true, name: true } },
  relatedSystem: { select: { id: true, name: true } },
  requestedPriority: true,
  itPriority: true,
  currentStatus: true,
  owner: { select: { id: true, name: true, role: true } },
  summary: true,
  description: true,
  requesterResolutionIndicatedAt: true,
  createdAt: true,
  updatedAt: true,
  statusHistory: {
    select: {
      id: true,
      fromStatus: true,
      toStatus: true,
      reason: true,
      actor: { select: { id: true, name: true, role: true } },
      createdAt: true,
    },
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
  },
} satisfies Prisma.TicketSelect;

const summarySelect = {
  id: true,
  owner: { select: { id: true, name: true, role: true } },
  requestedPriority: true,
  itPriority: true,
  currentStatus: true,
  requesterResolutionIndicatedAt: true,
  updatedAt: true,
} satisfies Prisma.TicketSelect;

export async function getStaffTicketDetail(ticketId: number) {
  const ticket = await getPrisma().ticket.findUnique({ where: { id: ticketId }, select: detailSelect });
  if (!ticket) return null;
  return {
    ...ticket,
    allowedStatusTransitions: allowedStatusTransitions(ticket.currentStatus),
  };
}

type LockedUser = { id: number; role: UserRole; isActive: boolean };
type LockedTicket = {
  id: number;
  ownerId: number | null;
  requestedPriority: RequestedPriority;
  itPriority: RequestedPriority;
  currentStatus: TicketStatus;
  requesterResolutionIndicatedAt: Date | null;
  updatedAt: Date;
};

function operational(user: LockedUser | null | undefined): boolean {
  return Boolean(user?.isActive && (user.role === "IT_STAFF" || user.role === "ADMINISTRATOR"));
}

async function lockUsers(transaction: Prisma.TransactionClient, ids: readonly number[]) {
  const unique = [...new Set(ids)].sort((left, right) => left - right);
  if (unique.length === 0) return [];
  return transaction.$queryRaw<LockedUser[]>(Prisma.sql`
    SELECT "id", "role", "isActive"
    FROM "User"
    WHERE "id" IN (${Prisma.join(unique)})
    ORDER BY "id" ASC
    FOR UPDATE
  `);
}

async function lockTicket(transaction: Prisma.TransactionClient, ticketId: number) {
  const [ticket] = await transaction.$queryRaw<LockedTicket[]>`
    SELECT "id", "ownerId", "requestedPriority", "itPriority", "currentStatus",
           "requesterResolutionIndicatedAt", "updatedAt"
    FROM "Ticket"
    WHERE "id" = ${ticketId}
    FOR UPDATE
  `;
  return ticket;
}

function sameVersion(actual: Date, expected: string): boolean {
  return actual.getTime() === new Date(expected).getTime();
}

async function mutationSummary(transaction: Prisma.TransactionClient, ticketId: number) {
  return transaction.ticket.findUniqueOrThrow({ where: { id: ticketId }, select: summarySelect });
}

async function initialOwnerId(ticketId: number): Promise<number | null> {
  return (await getPrisma().ticket.findUnique({ where: { id: ticketId }, select: { ownerId: true } }))
    ?.ownerId ?? null;
}

export async function claimStaffTicket(actorId: number, ticketId: number, expectedUpdatedAt: string) {
  const initialOwner = await initialOwnerId(ticketId);
  const userIds = [actorId, ...(initialOwner === null ? [] : [initialOwner])];
  return runSerializableMutation(async (transaction) => {
    const users = await lockUsers(transaction, userIds);
    const actor = users.find(({ id }) => id === actorId);
    if (!operational(actor)) return { kind: "actor-conflict" as const };
    const ticket = await lockTicket(transaction, ticketId);
    if (!ticket) return { kind: "not-found" as const };
    if (ticket.currentStatus === "CLOSED" || ticket.currentStatus === "CANCELLED") {
      return { kind: "terminal" as const };
    }
    if (ticket.ownerId !== null && ticket.ownerId !== actorId) return { kind: "owner-conflict" as const };
    if (!sameVersion(ticket.updatedAt, expectedUpdatedAt)) return { kind: "stale" as const };
    if (ticket.ownerId === null) {
      await transaction.ticket.update({ where: { id: ticketId }, data: { ownerId: actorId } });
    }
    return { kind: "success" as const, ticket: await mutationSummary(transaction, ticketId) };
  }, undefined, [
    ...userIds.map((id) => ({ scope: 1 as const, id })),
    { scope: 2, id: ticketId },
  ]);
}

export async function changeStaffTicketOwner(
  actorId: number,
  ticketId: number,
  ownerId: number | null,
  expectedUpdatedAt: string,
) {
  const initialOwner = await initialOwnerId(ticketId);
  const userIds = [actorId, ...(initialOwner === null ? [] : [initialOwner]), ...(ownerId === null ? [] : [ownerId])];
  return runSerializableMutation(async (transaction) => {
    const users = await lockUsers(transaction, userIds);
    if (!operational(users.find(({ id }) => id === actorId))) return { kind: "actor-conflict" as const };
    const target = ownerId === null ? null : users.find(({ id }) => id === ownerId);
    if (ownerId !== null && !operational(target)) return { kind: "owner-not-found" as const };
    const ticket = await lockTicket(transaction, ticketId);
    if (!ticket) return { kind: "not-found" as const };
    if (ticket.currentStatus === "CLOSED" || ticket.currentStatus === "CANCELLED") return { kind: "terminal" as const };
    if (!sameVersion(ticket.updatedAt, expectedUpdatedAt)) return { kind: "stale" as const };
    if (ticket.ownerId !== initialOwner) return { kind: "owner-eligibility" as const };
    if (ownerId === null && !canUnassignTicket(ticket.currentStatus)) return { kind: "owner-not-allowed" as const };
    if (ticket.ownerId !== ownerId) {
      await transaction.ticket.update({ where: { id: ticketId }, data: { ownerId } });
    }
    return { kind: "success" as const, ticket: await mutationSummary(transaction, ticketId) };
  }, undefined, [
    ...userIds.map((id) => ({ scope: 1 as const, id })),
    { scope: 2, id: ticketId },
  ]);
}

export async function changeStaffTicketPriority(
  actorId: number,
  ticketId: number,
  itPriority: RequestedPriority,
  expectedUpdatedAt: string,
) {
  return runSerializableMutation(async (transaction) => {
    const users = await lockUsers(transaction, [actorId]);
    if (!operational(users[0])) return { kind: "actor-conflict" as const };
    const ticket = await lockTicket(transaction, ticketId);
    if (!ticket) return { kind: "not-found" as const };
    if (ticket.currentStatus === "CLOSED" || ticket.currentStatus === "CANCELLED") return { kind: "terminal" as const };
    if (!sameVersion(ticket.updatedAt, expectedUpdatedAt)) return { kind: "stale" as const };
    if (ticket.itPriority !== itPriority) {
      await transaction.ticket.update({ where: { id: ticketId }, data: { itPriority } });
    }
    return { kind: "success" as const, ticket: await mutationSummary(transaction, ticketId) };
  }, undefined, [{ scope: 1, id: actorId }, { scope: 2, id: ticketId }]);
}

export async function changeStaffTicketStatus(
  actorId: number,
  ticketId: number,
  targetStatus: TicketStatus,
  confirm: boolean,
  reason: string | null,
  expectedUpdatedAt: string,
) {
  const initialOwner = await initialOwnerId(ticketId);
  const userIds = [actorId, ...(initialOwner === null ? [] : [initialOwner])];
  return runSerializableMutation(async (transaction) => {
    const users = await lockUsers(transaction, userIds);
    if (!operational(users.find(({ id }) => id === actorId))) return { kind: "actor-conflict" as const };
    const ticket = await lockTicket(transaction, ticketId);
    if (!ticket) return { kind: "not-found" as const };
    if (ticket.currentStatus === "CLOSED" || ticket.currentStatus === "CANCELLED") return { kind: "terminal" as const };
    if (!sameVersion(ticket.updatedAt, expectedUpdatedAt)) return { kind: "stale" as const };
    if (ticket.currentStatus === targetStatus) return { kind: "unchanged" as const };
    if (!allowedStatusTransitions(ticket.currentStatus).includes(targetStatus)) return { kind: "status-not-allowed" as const };
    if (["RESOLVED", "CLOSED", "CANCELLED"].includes(targetStatus) && !confirm) {
      return { kind: "confirmation" as const };
    }
    if (statusRequiresOwner(targetStatus)) {
      if (ticket.ownerId === null) return { kind: "owner-required" as const };
      if (ticket.ownerId !== initialOwner || !operational(users.find(({ id }) => id === ticket.ownerId))) {
        return { kind: "owner-eligibility" as const };
      }
    }
    await transaction.ticket.update({
      where: { id: ticketId },
      data: {
        currentStatus: targetStatus,
        ...(targetStatus === "REOPENED" ? {
          requesterResolutionIndicatedAt: null,
          requesterResolutionIndicatedById: null,
        } : {}),
      },
    });
    await transaction.ticketStatusHistory.create({
      data: {
        ticketId,
        actorId,
        fromStatus: ticket.currentStatus,
        toStatus: targetStatus,
        reason: targetStatus === "CANCELLED" ? reason : null,
      },
    });
    return { kind: "success" as const, ticket: await mutationSummary(transaction, ticketId) };
  }, undefined, [
    ...userIds.map((id) => ({ scope: 1 as const, id })),
    { scope: 2, id: ticketId },
  ]);
}
