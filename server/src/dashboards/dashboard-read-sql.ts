import { Prisma, type ActionStatus, type RequestedPriority, type TicketStatus, type UserRole } from "@prisma/client";
import { escapePostgresLikePattern } from "../tickets/ticket-query.js";
import type { RequesterDashboardQuery } from "./requester-dashboard-query.js";
import type { StaffDashboardQuery } from "./staff-dashboard-query.js";

export type DashboardTicketRow = {
  id: number; ticketNumber: string; summary: string; currentStatus: TicketStatus;
  requestedPriority: RequestedPriority; itPriority: RequestedPriority; updatedAt: string;
  owner: { id: number; name: string; role: UserRole } | null;
};
type Summary = {
  outstanding: number; needsAttention: number; recentUpdated: number; recentResolved: number;
  unassigned: number; mine: number; byStatus: Partial<Record<TicketStatus, number>>;
  byItPriority: Partial<Record<RequestedPriority, number>>; actionCounts: Partial<Record<ActionStatus, number>>;
  updatedRows: DashboardTicketRow[]; resolvedRows: Array<DashboardTicketRow & { resolvedAt: string }>;
};

// Values are bound; this scope mirrors the existing endpoint-specific search
// and owner semantics, including current eligibility only for numeric owners.
export function dashboardTicketPredicate(actorId: number, query: RequesterDashboardQuery | StaffDashboardQuery, staff: boolean) {
  const filters: Prisma.Sql[] = [staff ? Prisma.sql`TRUE` : Prisma.sql`t."requesterId" = ${actorId}`];
  if (query.categoryId !== null) filters.push(Prisma.sql`t."categoryId" = ${query.categoryId}`);
  if (query.relatedSystemId !== null) filters.push(Prisma.sql`t."relatedSystemId" = ${query.relatedSystemId}`);
  if (query.requestedPriority !== null) filters.push(Prisma.sql`t."requestedPriority"::text = ${query.requestedPriority}`);
  if (query.itPriority != null) filters.push(Prisma.sql`t."itPriority"::text = ${query.itPriority}`);
  if (query.currentStatus !== null) filters.push(Prisma.sql`t."currentStatus"::text = ${query.currentStatus}`);
  if (staff) {
    const owner = (query as StaffDashboardQuery).owner;
    if (owner === "unassigned") filters.push(Prisma.sql`t."ownerId" IS NULL`);
    else if (owner === "me") filters.push(Prisma.sql`t."ownerId" = ${actorId}`);
    else if (typeof owner === "number") filters.push(Prisma.sql`t."ownerId" = ${owner} AND EXISTS (
      SELECT 1 FROM "User" worker WHERE worker.id = t."ownerId" AND worker."isActive"
      AND worker.role::text IN ('IT_STAFF','ADMINISTRATOR'))`);
  }
  if (query.search !== "") {
    // Requester retains inherited contains behavior; Staff retains literal
    // escaped search across Ticket number/summary and Requester name/email.
    const pattern = `%${staff ? escapePostgresLikePattern(query.search) : query.search}%`;
    filters.push(staff ? Prisma.sql`(t."ticketNumber" ILIKE ${pattern} OR t.summary ILIKE ${pattern}
      OR EXISTS (SELECT 1 FROM "User" requester WHERE requester.id = t."requesterId"
        AND (requester.name ILIKE ${pattern} OR requester.email ILIKE ${pattern})))`
      : Prisma.sql`(t."ticketNumber" ILIKE ${pattern} OR t.summary ILIKE ${pattern})`);
  }
  return Prisma.sql`(${Prisma.join(filters, ") AND (")})`;
}

const utc = (date: Date) => Prisma.sql`(${date}::timestamptz AT TIME ZONE 'UTC')`;
const safeRow = Prisma.sql`jsonb_build_object('id',s.id,'ticketNumber',s."ticketNumber",'summary',s.summary,
  'currentStatus',s."currentStatus",'requestedPriority',s."requestedPriority",'itPriority',s."itPriority",
  'updatedAt',to_char(s."updatedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'owner',CASE WHEN s."ownerId" IS NULL THEN NULL ELSE jsonb_build_object('id',s."ownerId",'name',s."ownerName",'role',s."ownerRole") END)`;

export async function readDashboardSummary(transaction: Prisma.TransactionClient, actorId: number,
  query: RequesterDashboardQuery | StaffDashboardQuery, staff: boolean, window: { from: Date; before: Date }, asOf: Date) {
  const updated = Prisma.sql`"updatedAt" >= ${utc(window.from)} AND "updatedAt" < ${utc(window.before)} AND "updatedAt" <= ${utc(asOf)}`;
  const active = Prisma.sql`"currentStatus" NOT IN ('CLOSED','CANCELLED')`;
  const count = (condition: Prisma.Sql) => Prisma.sql`COUNT(*) FILTER (WHERE ${condition})::int`;
  const bins = (field: "currentStatus" | "itPriority", values: readonly string[], onlyActive = false) => Prisma.sql`jsonb_build_object(${Prisma.join(values.flatMap(value => [
    Prisma.sql`${value}::text`, count(Prisma.sql`${Prisma.raw(`"${field}"`)}::text = ${value}${onlyActive ? Prisma.sql` AND ${active}` : Prisma.empty}`),
  ]))})`;
  const actionCounts = staff ? Prisma.sql`(SELECT COALESCE(jsonb_object_agg(status,n),'{}'::jsonb) FROM (
    SELECT a.status,COUNT(*)::int AS n FROM "Action" a JOIN scope t ON t.id=a."ticketId"
    WHERE a."assigneeId"=${actorId} GROUP BY a.status) bins)` : Prisma.sql`'{}'::jsonb`;
  // A single business statement replaces repeated parent counts, bins and
  // resolution grouping/hydration. Only bounded safe row JSON leaves PostgreSQL.
  const [summary] = await transaction.$queryRaw<Summary[]>(Prisma.sql`/* dashboard-summary */
    WITH scope AS MATERIALIZED (
      SELECT t.id,t."ticketNumber",t.summary,t."currentStatus",t."requestedPriority",t."itPriority",t."updatedAt",t."ownerId"
      FROM "Ticket" t WHERE ${dashboardTicketPredicate(actorId, query, staff)}
    ), resolutions AS MATERIALIZED (
      SELECT h."ticketId",MAX(h."createdAt") AS "resolvedAt" FROM "TicketStatusHistory" h JOIN scope t ON t.id=h."ticketId"
      WHERE t."currentStatus" IN ('RESOLVED','CLOSED') AND h."toStatus"='RESOLVED'
      AND h."createdAt">=${utc(window.from)} AND h."createdAt"<${utc(window.before)} AND h."createdAt"<=${utc(asOf)}
      GROUP BY h."ticketId"
    )
    SELECT ${count(Prisma.sql`"currentStatus" IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED')`)} AS outstanding,
      ${count(Prisma.sql`"currentStatus"='WAITING_FOR_REQUESTER'`)} AS "needsAttention",
      ${count(updated)} AS "recentUpdated",(SELECT COUNT(*)::int FROM resolutions) AS "recentResolved",
      ${count(Prisma.sql`${active} AND "ownerId" IS NULL`)} AS unassigned,
      ${count(Prisma.sql`${active} AND "ownerId"=${actorId}`)} AS mine,
      ${bins("currentStatus", ["NEW","OPEN","IN_PROGRESS","WAITING_FOR_REQUESTER","RESOLVED","CLOSED","REOPENED","CANCELLED"])} AS "byStatus",
      ${bins("itPriority", ["LOW","MEDIUM","HIGH","URGENT"], true)} AS "byItPriority",${actionCounts} AS "actionCounts",
      (SELECT COALESCE(jsonb_agg(${safeRow} ORDER BY s."updatedAt" DESC,s.id DESC),'[]'::jsonb) FROM (
        SELECT p.*,owner.name AS "ownerName",owner.role AS "ownerRole" FROM (
          SELECT * FROM scope WHERE ${updated} ORDER BY "updatedAt" DESC,id DESC LIMIT 5
        ) p LEFT JOIN "User" owner ON owner.id=p."ownerId"
      ) s) AS "updatedRows",
      (SELECT COALESCE(jsonb_agg(${safeRow} || jsonb_build_object('resolvedAt',to_char(s."resolvedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
        ORDER BY s."resolvedAt" DESC,s.id DESC),'[]'::jsonb) FROM (
        SELECT p.*,owner.name AS "ownerName",owner.role AS "ownerRole" FROM (
          SELECT t.*,r."resolvedAt" FROM resolutions r JOIN scope t ON t.id=r."ticketId"
          ORDER BY r."resolvedAt" DESC,t.id DESC LIMIT 5
        ) p LEFT JOIN "User" owner ON owner.id=p."ownerId"
      ) s) AS "resolvedRows"
    FROM scope`);
  return summary;
}
