import { Prisma } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { queueTicketSelect, publicItem } from "./staff-queue-service.js";
import { escapePostgresLikePattern, type StaffQueueOwner } from "./ticket-query.js";
import type { StaffStatusGroup, StaffTicketDrilldownQuery } from "./staff-ticket-query.js";

const statusGroups: Record<StaffStatusGroup, string[]> = {
  active: ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED", "RESOLVED"],
  outstanding: ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"],
  resolved: ["RESOLVED", "CLOSED"],
};

function ownerPredicate(owner: StaffQueueOwner, actorId: number): Prisma.Sql {
  if (owner === null) return Prisma.sql`TRUE`;
  if (owner === "unassigned") return Prisma.sql`t."ownerId" IS NULL`;
  if (owner === "me") return Prisma.sql`t."ownerId" = ${actorId}`;
  return Prisma.sql`t."ownerId" = ${owner} AND EXISTS (
    SELECT 1 FROM "User" worker WHERE worker."id" = t."ownerId" AND worker."isActive" = TRUE
    AND worker."role"::text IN ('IT_STAFF', 'ADMINISTRATOR'))`;
}

function utcTimestamp(instant: Date): Prisma.Sql {
  // Prisma binds a raw Date as timestamptz; stored TIMESTAMP(3) values encode
  // UTC without a zone. Convert the parameter once to that same representation,
  // avoiding implicit conversion of the column through the session timezone.
  return Prisma.sql`(${instant}::timestamptz AT TIME ZONE 'UTC')`;
}

function predicates(actorId: number, query: StaffTicketDrilldownQuery, asOf: Date) {
  const filters: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (query.categoryId !== null) filters.push(Prisma.sql`t."categoryId" = ${query.categoryId}`);
  if (query.relatedSystemId !== null) filters.push(Prisma.sql`t."relatedSystemId" = ${query.relatedSystemId}`);
  if (query.requestedPriority !== null) filters.push(Prisma.sql`t."requestedPriority"::text = ${query.requestedPriority}`);
  if (query.itPriority !== null) filters.push(Prisma.sql`t."itPriority"::text = ${query.itPriority}`);
  if (query.currentStatus !== null) filters.push(Prisma.sql`t."currentStatus"::text = ${query.currentStatus}`);
  if (query.search !== "") {
    const search = `%${escapePostgresLikePattern(query.search)}%`;
    filters.push(Prisma.sql`(t."ticketNumber" ILIKE ${search} OR t."summary" ILIKE ${search}
      OR requester."name" ILIKE ${search} OR requester."email" ILIKE ${search})`);
  }
  const group = (value: StaffStatusGroup) => Prisma.sql`t."currentStatus"::text IN (${Prisma.join(statusGroups[value])})`;
  if (query.statusGroup !== undefined) filters.push(group(query.statusGroup));
  if (query.dashboardWidget === "unassigned" || query.dashboardWidget === "mine") {
    filters.push(group("active"), query.dashboardWidget === "mine" ? Prisma.sql`t."ownerId" = ${actorId}` : Prisma.sql`t."ownerId" IS NULL`);
  }
  if (query.dashboardWidget === "status") filters.push(Prisma.sql`t."currentStatus"::text = ${query.widgetStatus}`);
  if (query.dashboardWidget === "itPriority") filters.push(group("active"), Prisma.sql`t."itPriority"::text = ${query.widgetItPriority}`);
  if (query.updatedWindow !== undefined) filters.push(Prisma.sql`t."updatedAt" >= ${utcTimestamp(query.updatedWindow.from)}
    AND t."updatedAt" < ${utcTimestamp(query.updatedWindow.before)} AND t."updatedAt" <= ${utcTimestamp(asOf)}`);

  let resolution = Prisma.empty;
  if (query.resolvedWindow !== undefined) {
    // One aggregate row per parent, even with several qualifying history events.
    // Legacy parents without history never receive a fabricated resolution time.
    resolution = Prisma.sql`CROSS JOIN LATERAL (
      SELECT MAX(history."createdAt") AS "resolvedAt" FROM "TicketStatusHistory" history
      WHERE history."ticketId" = t."id" AND history."toStatus" = 'RESOLVED'
      AND history."createdAt" >= ${utcTimestamp(query.resolvedWindow.from)}
      AND history."createdAt" < ${utcTimestamp(query.resolvedWindow.before)} AND history."createdAt" <= ${utcTimestamp(asOf)}
    ) resolution`;
    filters.push(group("resolved"), Prisma.sql`resolution."resolvedAt" IS NOT NULL`);
  }
  return {
    from: Prisma.sql`FROM "Ticket" t JOIN "User" requester ON requester."id" = t."requesterId" ${resolution}`,
    where: Prisma.sql`(${Prisma.join(filters, ") AND (")})`,
  };
}

function orderExpression(sortBy: StaffTicketDrilldownQuery["sortBy"]): Prisma.Sql {
  // Static SQL expressions only. Preserve the inherited business rank rather
  // than relying on PostgreSQL enum declaration order (notably REOPENED).
  switch (sortBy) {
    case "ticketNumber": return Prisma.sql`t."ticketNumber"`;
    case "ticketDate": return Prisma.sql`t."ticketDate"`;
    case "updatedAt": return Prisma.sql`t."updatedAt"`;
    case "resolvedAt": return Prisma.sql`resolution."resolvedAt"`;
    case "currentStatus": return Prisma.sql`CASE t."currentStatus"::text
      WHEN 'NEW' THEN 0 WHEN 'OPEN' THEN 1 WHEN 'IN_PROGRESS' THEN 2 WHEN 'WAITING_FOR_REQUESTER' THEN 3
      WHEN 'REOPENED' THEN 4 WHEN 'RESOLVED' THEN 5 WHEN 'CLOSED' THEN 6 WHEN 'CANCELLED' THEN 7 END`;
    case "requestedPriority": return Prisma.sql`CASE t."requestedPriority"::text
      WHEN 'LOW' THEN 0 WHEN 'MEDIUM' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'URGENT' THEN 3 END`;
    case "itPriority": return Prisma.sql`CASE t."itPriority"::text
      WHEN 'LOW' THEN 0 WHEN 'MEDIUM' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'URGENT' THEN 3 END`;
  }
}

export async function listStaffTicketDrilldown(actorId: number, query: StaffTicketDrilldownQuery) {
  return getPrisma().$transaction(async (transaction) => {
    await transaction.$executeRaw`SET TRANSACTION READ ONLY`;
    const [clock] = await transaction.$queryRaw<Array<{ asOf: Date }>>`SELECT CURRENT_TIMESTAMP AS "asOf"`;
    const { from, where } = predicates(actorId, query, clock.asOf);
    const owner = ownerPredicate(query.owner, actorId);
    // Replace ONLY the explicit owner selector for the inherited counters.
    // Every other base/extension/widget predicate continues to intersect.
    const [counts] = await transaction.$queryRaw<Array<{ matching: number; mine: number; unassigned: number }>>(Prisma.sql`
      SELECT COUNT(*) FILTER (WHERE (${owner}))::int AS matching,
        COUNT(*) FILTER (WHERE t."ownerId" = ${actorId})::int AS mine,
        COUNT(*) FILTER (WHERE t."ownerId" IS NULL)::int AS unassigned
      ${from} WHERE ${where}`);
    const totalItems = counts.matching, totalPages = Math.ceil(totalItems / query.pageSize);
    const pagination = { page: query.page, pageSize: query.pageSize, totalItems, totalPages,
      hasPreviousPage: totalItems > 0 && query.page > 1, hasNextPage: totalItems > 0 && query.page < totalPages };
    if (query.page > totalPages) return { items: [], counts, pagination };
    // Since a nonempty requested page is within the counted int32-sized parent
    // set, its offset is bounded by totalItems; no unsafe large-page product.
    const skip = (query.page - 1) * query.pageSize;
    const direction = query.sortOrder === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const resolutionSelect = query.resolvedWindow === undefined ? Prisma.empty : Prisma.sql`, resolution."resolvedAt"`;
    const page = await transaction.$queryRaw<Array<{ id: number; resolvedAt?: Date }>>(Prisma.sql`
      SELECT t."id" ${resolutionSelect} ${from} WHERE ${where} AND (${owner})
      ORDER BY ${orderExpression(query.sortBy)} ${direction}, t."id" ${direction}
      LIMIT ${query.pageSize} OFFSET ${skip}`);
    const tickets = await transaction.ticket.findMany({ where: { id: { in: page.map((row) => row.id) } },
      select: queueTicketSelect, take: query.pageSize });
    const byId = new Map(tickets.map((ticket) => [ticket.id, ticket]));
    const items = page.map((row) => {
      const ticket = byId.get(row.id);
      if (!ticket) throw new Error("Incomplete Staff Ticket page projection.");
      return { ...publicItem(ticket), ...(row.resolvedAt === undefined ? {} : { resolvedAt: row.resolvedAt }) };
    });
    return { items, counts, pagination };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
