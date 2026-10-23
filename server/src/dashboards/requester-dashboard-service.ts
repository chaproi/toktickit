import { Prisma } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import type { RequesterDashboardQuery } from "./requester-dashboard-query.js";

const rowSelect = {
  id: true, ticketNumber: true, summary: true, currentStatus: true,
  requestedPriority: true, itPriority: true, updatedAt: true,
  owner: { select: { id: true, name: true, role: true } },
} satisfies Prisma.TicketSelect;

function toRow(ticket: Prisma.TicketGetPayload<{ select: typeof rowSelect }>) {
  return {
    id: ticket.id, ticketNumber: ticket.ticketNumber, summary: ticket.summary,
    currentStatus: ticket.currentStatus, requestedPriority: ticket.requestedPriority,
    itPriority: ticket.itPriority, updatedAt: ticket.updatedAt.toISOString(),
    owner: ticket.owner === null ? null : {
      id: ticket.owner.id, name: ticket.owner.name, role: ticket.owner.role,
    },
  };
}

function recentWindow(asOf: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok", calendar: "gregory",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(asOf);
  const part = (name: "year" | "month" | "day") =>
    Number(parts.find((value) => value.type === name)!.value);
  // Bangkok calendar midnights use UTC+07:00; Date.UTC handles calendar rollovers.
  const midnight = Date.UTC(part("year"), part("month") - 1, part("day")) - 7 * 60 * 60 * 1000;
  return {
    from: new Date(midnight - 6 * 24 * 60 * 60 * 1000),
    before: new Date(midnight + 24 * 60 * 60 * 1000),
  };
}

function ownedWhere(requesterId: number, query: RequesterDashboardQuery): Prisma.TicketWhereInput {
  const filters: Prisma.TicketWhereInput[] = [];
  if (query.categoryId !== null) filters.push({ categoryId: query.categoryId });
  if (query.relatedSystemId !== null) filters.push({ relatedSystemId: query.relatedSystemId });
  if (query.requestedPriority !== null) filters.push({ requestedPriority: query.requestedPriority });
  if (query.itPriority !== null) filters.push({ itPriority: query.itPriority });
  if (query.currentStatus !== null) filters.push({ currentStatus: query.currentStatus });
  if (query.search !== "") {
    const search = { contains: query.search, mode: "insensitive" as const };
    filters.push({ OR: [{ ticketNumber: search }, { summary: search }] });
  }
  return { requesterId, AND: filters };
}

function drillDown(query: RequesterDashboardQuery, window: { from: string; before: string }) {
  const base: Record<string, string> = {};
  for (const [name, value] of Object.entries(query)) {
    if (value !== null && value !== "") base[name] = String(value);
  }
  const descriptor = (widget: string, predicates: Record<string, string> = {}) => ({
    path: "/api/tickets", query: { ...base, dashboardWidget: widget, ...predicates },
  });
  // Widget predicates intersect base filters; attention must not overwrite an
  // explicit currentStatus. Target list execution uses a later, fresh snapshot.
  return {
    outstanding: descriptor("outstanding", { statusGroup: "outstanding" }),
    needsAttention: descriptor("attention"),
    recentUpdated: descriptor("recentUpdated", {
      updatedFrom: window.from, updatedBefore: window.before, sortBy: "updatedAt", sortOrder: "desc",
    }),
    recentResolved: descriptor("recentResolved", {
      statusGroup: "resolved", resolvedFrom: window.from, resolvedBefore: window.before,
      sortBy: "resolvedAt", sortOrder: "desc",
    }),
  };
}

export async function getRequesterDashboard(requesterId: number, query: RequesterDashboardQuery) {
  return getPrisma().$transaction(async (transaction) => {
    await transaction.$executeRaw`SET TRANSACTION READ ONLY`;
    const [clock] = await transaction.$queryRaw<Array<{ asOf: Date }>>`SELECT CURRENT_TIMESTAMP AS "asOf"`;
    const asOf = clock.asOf;
    const window = recentWindow(asOf);
    const bounds = { gte: window.from, lt: window.before, lte: asOf };
    const owned = ownedWhere(requesterId, query);
    const updated: Prisma.TicketWhereInput = { AND: [owned, { updatedAt: bounds }] };
    const resolved: Prisma.TicketWhereInput = { AND: [owned, {
      currentStatus: { in: ["RESOLVED", "CLOSED"] },
      statusHistory: { some: { toStatus: "RESOLVED", createdAt: bounds } },
    }] };

    const outstanding = await transaction.ticket.count({ where: { AND: [owned, {
      currentStatus: { in: ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"] },
    }] } });
    const needsAttention = await transaction.ticket.count({ where: {
      AND: [owned, { currentStatus: "WAITING_FOR_REQUESTER" }],
    } });
    const recentUpdated = await transaction.ticket.count({ where: updated });
    // Count parent Tickets, not their potentially multiple qualifying events.
    const recentResolved = await transaction.ticket.count({ where: resolved });
    const updatedTickets = await transaction.ticket.findMany({
      where: updated, select: rowSelect, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 5,
    });
    // Aggregate and bound in PostgreSQL before fetching at most five safe rows.
    const latestResolutions = await transaction.ticketStatusHistory.groupBy({
      by: ["ticketId"],
      where: { toStatus: "RESOLVED", createdAt: bounds, ticket: { is: resolved } },
      _max: { createdAt: true },
      orderBy: [{ _max: { createdAt: "desc" } }, { ticketId: "desc" }], take: 5,
    });
    const resolvedTickets = await transaction.ticket.findMany({
      where: { AND: [resolved, { id: { in: latestResolutions.map((event) => event.ticketId) } }] },
      select: rowSelect, take: 5,
    });
    const byId = new Map(resolvedTickets.map((ticket) => [ticket.id, ticket]));
    const resolvedRows = latestResolutions.map((event) => {
      const ticket = byId.get(event.ticketId);
      if (!ticket || event._max.createdAt === null) throw new Error("Incomplete Dashboard snapshot projection.");
      return { ...toRow(ticket), resolvedAt: event._max.createdAt.toISOString() };
    });
    const recentWindowDTO = { from: window.from.toISOString(), before: window.before.toISOString() };
    return {
      asOf: asOf.toISOString(), timezone: "Asia/Bangkok", recentWindow: recentWindowDTO,
      filters: query,
      metrics: { outstanding, needsAttention, recentUpdated, recentResolved },
      lists: { recentUpdated: updatedTickets.map(toRow), recentResolved: resolvedRows },
      drillDown: drillDown(query, recentWindowDTO),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
