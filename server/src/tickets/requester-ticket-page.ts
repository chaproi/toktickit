import { Prisma } from "@prisma/client";
import { dashboardTicketPredicate } from "../dashboards/dashboard-read-sql.js";
import type { RequesterTicketListQuery } from "./requester-ticket-query.js";
import type { TicketListItem, ListTicketsResult } from "./ticket-service.js";

// Ordinary Requester lists only. Date/widget/resolution extensions retain their
// established path. Rank/order expressions are static, never user-supplied SQL.
export async function readRequesterTicketPage(transaction: Prisma.TransactionClient, requesterId: number,
  query: RequesterTicketListQuery): Promise<ListTicketsResult> {
  const expressions = {
    ticketNumber: Prisma.sql`t."ticketNumber"`, ticketDate: Prisma.sql`t."ticketDate"`,
    updatedAt: Prisma.sql`t."updatedAt"`, summary: Prisma.sql`t.summary`,
    requestedPriority: Prisma.sql`t."requestedPriority"`, // inherited PostgreSQL enum ordering
  };
  if (query.sortBy === "resolvedAt") throw new Error("Resolution ordering uses its dedicated read path.");
  const direction = query.sortOrder === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const skip = (query.page - 1) * query.pageSize, safeOffset = Number.isSafeInteger(skip) && skip <= 2_147_483_647;
  type Row = { totalItems: number; id: number | null; ticketNumber: string; ticketDate: Date; summary: string;
    requestedPriority: TicketListItem["requestedPriority"]; itPriority: TicketListItem["itPriority"]; currentStatus: TicketListItem["currentStatus"];
    createdAt: Date; updatedAt: Date; requesterId: number; requesterName: string;
    categoryId: number; categoryName: string; relatedSystemId: number; relatedSystemName: string;
    ownerId: number | null; ownerName: string; ownerRole: NonNullable<TicketListItem["owner"]>["role"] };
  const rows = await transaction.$queryRaw<Row[]>(Prisma.sql`/* requester-page */
    WITH matching AS MATERIALIZED (SELECT t.id,t."ticketNumber",t."ticketDate",t.summary,t."requestedPriority",t."itPriority",
      t."currentStatus",t."createdAt",t."updatedAt",t."requesterId",t."categoryId",t."relatedSystemId",t."ownerId"
      FROM "Ticket" t WHERE ${dashboardTicketPredicate(requesterId, { ...query, itPriority: query.itPriority ?? null }, false)}),
    totals AS (SELECT COUNT(*)::int AS "totalItems" FROM matching),
    page AS (SELECT t.*,ROW_NUMBER() OVER (ORDER BY ${expressions[query.sortBy]} ${direction},t.id ${direction}) AS ordinal
      FROM matching t WHERE ${safeOffset} ORDER BY ${expressions[query.sortBy]} ${direction},t.id ${direction}
      LIMIT ${query.pageSize} OFFSET ${safeOffset ? skip : 0})
    SELECT totals."totalItems",p.id,p."ticketNumber",p."ticketDate",p.summary,p."requestedPriority",p."itPriority",p."currentStatus",
      p."createdAt",p."updatedAt",p."requesterId",requester.name AS "requesterName",
      p."categoryId",category.name AS "categoryName",p."relatedSystemId",system.name AS "relatedSystemName",
      p."ownerId",owner.name AS "ownerName",owner.role AS "ownerRole"
    FROM totals LEFT JOIN page p ON TRUE
    LEFT JOIN "User" requester ON requester.id=p."requesterId" LEFT JOIN "Category" category ON category.id=p."categoryId"
    LEFT JOIN "RelatedSystem" system ON system.id=p."relatedSystemId" LEFT JOIN "User" owner ON owner.id=p."ownerId"
    ORDER BY p.ordinal`);
  const totalItems = rows[0].totalItems, totalPages = Math.ceil(totalItems / query.pageSize);
  const pagination = { page: query.page, pageSize: query.pageSize, totalItems, totalPages,
    hasPreviousPage: totalItems > 0 && query.page > 1, hasNextPage: totalItems > 0 && query.page < totalPages };
  if (query.page > totalPages) return { kind: "success", items: [], pagination };
  if (!safeOffset) return { kind: "invalid-query", fields: { page: "The requested page cannot be represented safely." } };
  const items: TicketListItem[] = rows.filter((row): row is Row & { id: number } => row.id !== null).map(row => ({
    id: row.id, ticketNumber: row.ticketNumber, ticketDate: row.ticketDate, summary: row.summary,
    requestedPriority: row.requestedPriority, itPriority: row.itPriority, currentStatus: row.currentStatus,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
    requester: { id: row.requesterId, name: row.requesterName },
    category: { id: row.categoryId, name: row.categoryName }, relatedSystem: { id: row.relatedSystemId, name: row.relatedSystemName },
    owner: row.ownerId === null ? null : { id: row.ownerId, name: row.ownerName, role: row.ownerRole },
  }));
  return { kind: "success", items, pagination };
}
