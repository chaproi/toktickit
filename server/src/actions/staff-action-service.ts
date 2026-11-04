import { Prisma, type TicketStatus } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { escapePostgresLikePattern } from "../tickets/ticket-query.js";
import { actionSelect, toActionDTO } from "./action-projection.js";
import type { StaffActionQuery, ParentStatusGroup, ActionDateWindow } from "./staff-action-query.js";

const statusGroups: Record<ParentStatusGroup, TicketStatus[]> = {
  active: ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED", "RESOLVED"],
  outstanding: ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"],
  resolved: ["RESOLVED", "CLOSED"],
};
const staffActionSelect = {
  ...actionSelect, ticket: { select: { id: true, ticketNumber: true, summary: true, currentStatus: true } },
} satisfies Prisma.ActionSelect;

function bounds(window: ActionDateWindow, asOf: Date) {
  return { gte: window.from, lt: window.before, lte: asOf };
}

function actionWhere(actorId: number, query: StaffActionQuery, asOf: Date): Prisma.ActionWhereInput {
  const parent: Prisma.TicketWhereInput[] = [];
  if (query.categoryId !== null) parent.push({ categoryId: query.categoryId });
  if (query.relatedSystemId !== null) parent.push({ relatedSystemId: query.relatedSystemId });
  if (query.requestedPriority !== null) parent.push({ requestedPriority: query.requestedPriority });
  if (query.itPriority !== null) parent.push({ itPriority: query.itPriority });
  if (query.currentStatus !== null) parent.push({ currentStatus: query.currentStatus });
  if (query.statusGroup !== undefined) parent.push({ currentStatus: { in: statusGroups[query.statusGroup] } });
  if (query.owner === "unassigned") parent.push({ ownerId: null });
  else if (query.owner === "me") parent.push({ ownerId: actorId });
  else if (typeof query.owner === "number") parent.push({ ownerId: query.owner,
    owner: { is: { isActive: true, role: { in: ["IT_STAFF", "ADMINISTRATOR"] } } } });
  if (query.search !== "") {
    const search = { contains: escapePostgresLikePattern(query.search), mode: "insensitive" as const };
    parent.push({ OR: [{ ticketNumber: search }, { summary: search },
      { requester: { is: { name: search } } }, { requester: { is: { email: search } } }] });
  }
  if (query.updatedWindow !== undefined) parent.push({ updatedAt: bounds(query.updatedWindow, asOf) });
  if (query.resolvedWindow !== undefined) {
    parent.push({ currentStatus: { in: ["RESOLVED", "CLOSED"] },
      statusHistory: { some: { toStatus: "RESOLVED", createdAt: bounds(query.resolvedWindow, asOf) } } });
    // There is a latest qualifying event iff one qualifying event exists.
    // API-07 orders by Action creation and returns no resolvedAt, so EXISTS
    // gives that membership without joining/duplicating Actions or inventing a fallback.
  }
  return { assigneeId: actorId, ticket: { is: { AND: parent } },
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.unfinished ? { AND: [{ status: { in: ["PLANNED", "IN_PROGRESS"] } }] } : {}),
  };
}

export async function listStaffActions(actorId: number, query: StaffActionQuery) {
  return getPrisma().$transaction(async (transaction) => {
    await transaction.$executeRaw`SET TRANSACTION READ ONLY`;
    // First snapshot read captures one database transaction instant. Keep it
    // internal; count and bounded rows use identical predicates in this snapshot.
    const [clock] = await transaction.$queryRaw<Array<{ asOf: Date }>>`SELECT CURRENT_TIMESTAMP AS "asOf"`;
    const where = actionWhere(actorId, query, clock.asOf);
    const totalItems = await transaction.action.count({ where });
    const totalPages = Math.ceil(totalItems / query.pageSize);
    const pagination = { page: query.page, pageSize: query.pageSize, totalItems, totalPages,
      hasPreviousPage: totalItems > 0 && query.page > 1, hasNextPage: totalItems > 0 && query.page < totalPages };
    // Check the counted page range before multiplying a possibly very large
    // valid page. Beyond-final pages remain empty with the requested page intact.
    if (query.page > totalPages) return { kind: "success" as const, items: [], pagination };
    const skip = (query.page - 1) * query.pageSize;
    if (!Number.isSafeInteger(skip) || skip > 2_147_483_647) {
      return { kind: "invalid-query" as const, fields: { page: "The requested page cannot be represented safely." } };
    }
    const actions = await transaction.action.findMany({ where, select: staffActionSelect,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip, take: query.pageSize });
    return { kind: "success" as const, items: actions.map((action) => ({
      ticket: { id: action.ticket.id, ticketNumber: action.ticket.ticketNumber, summary: action.ticket.summary, currentStatus: action.ticket.currentStatus },
      action: toActionDTO(action),
    })), pagination };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
