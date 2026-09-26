import { Prisma, type PrismaClient } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import {
  compareStaffQueueTickets,
  escapePostgresLikePattern,
  type StaffQueueQuery,
} from "./ticket-query.js";

const queueTicketSelect = {
  id: true,
  ticketNumber: true,
  ticketDate: true,
  summary: true,
  requester: { select: { id: true, name: true, email: true } },
  category: { select: { id: true, name: true } },
  relatedSystem: { select: { id: true, name: true } },
  requestedPriority: true,
  itPriority: true,
  currentStatus: true,
  owner: { select: { id: true, name: true, role: true, isActive: true } },
  requesterResolutionIndicatedAt: true,
  updatedAt: true,
} satisfies Prisma.TicketSelect;

export type StaffQueueItem = Prisma.TicketGetPayload<{
  select: typeof queueTicketSelect;
}>;

function baseWhere(query: StaffQueueQuery): Prisma.TicketWhereInput {
  const literalSearch = escapePostgresLikePattern(query.search);
  return {
    ...(query.categoryId === null ? {} : { categoryId: query.categoryId }),
    ...(query.relatedSystemId === null ? {} : { relatedSystemId: query.relatedSystemId }),
    ...(query.requestedPriority === null ? {} : { requestedPriority: query.requestedPriority }),
    ...(query.itPriority === null ? {} : { itPriority: query.itPriority }),
    ...(query.currentStatus === null ? {} : { currentStatus: query.currentStatus }),
    ...(query.search === "" ? {} : {
      OR: [
        { ticketNumber: { contains: literalSearch, mode: "insensitive" as const } },
        { summary: { contains: literalSearch, mode: "insensitive" as const } },
        { requester: { name: { contains: literalSearch, mode: "insensitive" as const } } },
        { requester: { email: { contains: literalSearch, mode: "insensitive" as const } } },
      ],
    }),
  };
}

function matchesOwner(item: StaffQueueItem, owner: StaffQueueQuery["owner"], actorId: number): boolean {
  if (owner === null) return true;
  if (owner === "unassigned") return item.owner === null;
  if (owner === "me") return item.owner?.id === actorId;
  return item.owner?.id === owner &&
    item.owner.isActive &&
    (item.owner.role === "IT_STAFF" || item.owner.role === "ADMINISTRATOR");
}

function publicItem(item: StaffQueueItem) {
  return {
    ...item,
    owner: item.owner === null ? null : {
      id: item.owner.id,
      name: item.owner.name,
      role: item.owner.role,
    },
  };
}

export async function listStaffQueue(actorId: number, query: StaffQueueQuery) {
  const allBaseItems = await getPrisma().ticket.findMany({
    where: baseWhere(query),
    select: queueTicketSelect,
  });
  const matchingItems = allBaseItems
    .filter((item) => matchesOwner(item, query.owner, actorId))
    .sort((left, right) => compareStaffQueueTickets(left, right, query.sortBy, query.sortOrder));
  const totalItems = matchingItems.length;
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize);
  const start = (query.page - 1) * query.pageSize;

  return {
    items: matchingItems.slice(start, start + query.pageSize).map(publicItem),
    counts: {
      matching: totalItems,
      unassigned: allBaseItems.filter((item) => item.owner === null).length,
      mine: allBaseItems.filter((item) => item.owner?.id === actorId).length,
    },
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
      hasPreviousPage: totalItems > 0 && query.page > 1,
      hasNextPage: totalItems > 0 && query.page < totalPages,
    },
  };
}

export async function listEligibleAssignees(
  database: Pick<PrismaClient, "user"> = getPrisma(),
) {
  return database.user.findMany({
    where: {
      isActive: true,
      role: { in: ["IT_STAFF", "ADMINISTRATOR"] },
    },
    select: { id: true, name: true, role: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
}
