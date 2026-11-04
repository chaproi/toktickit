import { Prisma, type UserRole } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import type { CommentPageQuery } from "../comments/comment-query.js";
import type { ActionListQuery } from "./action-query.js";
import { actionSelect, actionHistorySelect, toActionDTO, toActionHistoryDTO } from "./action-projection.js";

function accessibleParent(transaction: Prisma.TransactionClient, userId: number, role: UserRole, ticketId: number) {
  return transaction.ticket.findFirst({
    where: { id: ticketId, ...(role === "REQUESTER" ? { requesterId: userId } : {}) },
    select: { id: true, updatedAt: true },
  });
}

function pagination(query: CommentPageQuery, totalItems: number) {
  const totalPages = Math.ceil(totalItems / query.pageSize);
  return {
    page: query.page, pageSize: query.pageSize, totalItems, totalPages,
    hasPreviousPage: totalItems > 0 && query.page > 1,
    hasNextPage: totalItems > 0 && query.page < totalPages,
  };
}

export async function listTicketActions(userId: number, role: UserRole, ticketId: number, query: ActionListQuery) {
  return getPrisma().$transaction(async (transaction) => {
    if (!(await accessibleParent(transaction, userId, role, ticketId))) return { kind: "ticket-not-found" as const };
    const where = { ticketId, ...(query.status === undefined ? {} : { status: query.status }) };
    const totalItems = await transaction.action.count({ where });
    const page = pagination(query, totalItems);
    // A safe but very large page is empty. Do not send an overflowing skip to Prisma.
    const items = query.page > page.totalPages ? [] : await transaction.action.findMany({
      where, select: actionSelect, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize, take: query.pageSize,
    });
    return { kind: "success" as const, items: items.map(toActionDTO), pagination: page };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function getTicketAction(userId: number, role: UserRole, ticketId: number, actionId: number) {
  return getPrisma().$transaction(async (transaction) => {
    const ticket = await accessibleParent(transaction, userId, role, ticketId);
    if (!ticket) return { kind: "ticket-not-found" as const };
    const action = await transaction.action.findFirst({ where: { id: actionId, ticketId }, select: actionSelect });
    if (!action) return { kind: "action-not-found" as const };
    return { kind: "success" as const, action: toActionDTO(action), ticketUpdatedAt: ticket.updatedAt.toISOString() };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function listTicketActionHistory(
  userId: number, role: UserRole, ticketId: number, actionId: number, query: CommentPageQuery,
) {
  return getPrisma().$transaction(async (transaction) => {
    if (!(await accessibleParent(transaction, userId, role, ticketId))) return { kind: "ticket-not-found" as const };
    if (!(await transaction.action.findFirst({ where: { id: actionId, ticketId }, select: { id: true } }))) {
      return { kind: "action-not-found" as const };
    }
    const totalItems = await transaction.actionHistory.count({ where: { actionId } });
    const page = pagination(query, totalItems);
    const items = query.page > page.totalPages ? [] : await transaction.actionHistory.findMany({
      where: { actionId }, select: actionHistorySelect, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize, take: query.pageSize,
    });
    return { kind: "success" as const, items: items.map(toActionHistoryDTO), pagination: page };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
