import type { Prisma, PrismaClient } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import type { StaffQueueQuery } from "./ticket-query.js";

export const queueTicketSelect = {
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

export function publicItem(item: StaffQueueItem) {
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
  // The shared SQL reader applies no Dashboard predicates unless extensions
  // are present. Defer loading because it also consumes this module's safe
  // projection; both ordinary and extended reads retain one pagination engine.
  const { listStaffTicketDrilldown } = await import("./staff-ticket-drilldown-service.js");
  return listStaffTicketDrilldown(actorId, query);
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
