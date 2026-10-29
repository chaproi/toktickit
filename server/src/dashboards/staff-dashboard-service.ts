import { Prisma, type ActionStatus, type RequestedPriority, type TicketStatus } from "@prisma/client";
import { actionSelect, toActionDTO } from "../actions/action-projection.js";
import { getPrisma } from "../prisma.js";
import { escapePostgresLikePattern } from "../tickets/ticket-query.js";
import type { StaffDashboardQuery } from "./staff-dashboard-query.js";

const activeStatuses: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED", "RESOLVED"];
const unfinishedStatuses: ActionStatus[] = ["PLANNED", "IN_PROGRESS"];
const rowSelect = {
  id: true, ticketNumber: true, summary: true, currentStatus: true,
  requestedPriority: true, itPriority: true, updatedAt: true,
  owner: { select: { id: true, name: true, role: true } },
} satisfies Prisma.TicketSelect;
const assignedSelect = {
  ...actionSelect, ticket: { select: { id: true, ticketNumber: true, summary: true, currentStatus: true } },
} satisfies Prisma.ActionSelect;

function toRow(ticket: Prisma.TicketGetPayload<{ select: typeof rowSelect }>) {
  return {
    id: ticket.id, ticketNumber: ticket.ticketNumber, summary: ticket.summary,
    currentStatus: ticket.currentStatus, requestedPriority: ticket.requestedPriority,
    itPriority: ticket.itPriority, updatedAt: ticket.updatedAt.toISOString(),
    owner: ticket.owner === null ? null : { id: ticket.owner.id, name: ticket.owner.name, role: ticket.owner.role },
  };
}

function recentWindow(asOf: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok", calendar: "gregory", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(asOf);
  const part = (name: "year" | "month" | "day") => Number(parts.find((value) => value.type === name)!.value);
  const midnight = Date.UTC(part("year"), part("month") - 1, part("day")) - 7 * 60 * 60 * 1000;
  return { from: new Date(midnight - 6 * 24 * 60 * 60 * 1000), before: new Date(midnight + 24 * 60 * 60 * 1000) };
}

function parentWhere(actorId: number, query: StaffDashboardQuery): Prisma.TicketWhereInput {
  const filters: Prisma.TicketWhereInput[] = [];
  if (query.categoryId !== null) filters.push({ categoryId: query.categoryId });
  if (query.relatedSystemId !== null) filters.push({ relatedSystemId: query.relatedSystemId });
  if (query.requestedPriority !== null) filters.push({ requestedPriority: query.requestedPriority });
  if (query.itPriority !== null) filters.push({ itPriority: query.itPriority });
  if (query.currentStatus !== null) filters.push({ currentStatus: query.currentStatus });
  if (query.owner === "unassigned") filters.push({ ownerId: null });
  else if (query.owner === "me") filters.push({ ownerId: actorId });
  else if (typeof query.owner === "number") filters.push({ ownerId: query.owner,
    owner: { is: { isActive: true, role: { in: ["IT_STAFF", "ADMINISTRATOR"] } } } });
  if (query.search !== "") {
    const search = { contains: escapePostgresLikePattern(query.search), mode: "insensitive" as const };
    filters.push({ OR: [{ ticketNumber: search }, { summary: search },
      { requester: { is: { name: search } } }, { requester: { is: { email: search } } }] });
  }
  return { AND: filters };
}

function drillDown(query: StaffDashboardQuery, window: { from: string; before: string }) {
  const base: Record<string, string> = {};
  for (const [name, value] of Object.entries(query)) {
    if (value !== null && value !== "") base[name] = String(value);
  }
  const ticket = (widget: string, predicates: Record<string, string> = {}) => ({
    path: "/api/staff/tickets", query: { ...base, dashboardWidget: widget, ...predicates },
  });
  const action = (predicates: Record<string, string>) => ({
    path: "/api/staff/actions", query: { ...base, assignee: "me", ...predicates },
  });
  // Dedicated widget/bucket predicates intersect base owner/status/priority;
  // none substitutes an actor ID or overwrites an explicit base filter.
  return {
    unassigned: ticket("unassigned", { statusGroup: "active" }),
    mine: ticket("mine", { statusGroup: "active" }),
    byStatus: {
      NEW: ticket("status", { widgetStatus: "NEW" }), OPEN: ticket("status", { widgetStatus: "OPEN" }),
      IN_PROGRESS: ticket("status", { widgetStatus: "IN_PROGRESS" }),
      WAITING_FOR_REQUESTER: ticket("status", { widgetStatus: "WAITING_FOR_REQUESTER" }),
      RESOLVED: ticket("status", { widgetStatus: "RESOLVED" }), REOPENED: ticket("status", { widgetStatus: "REOPENED" }),
      CLOSED: ticket("status", { widgetStatus: "CLOSED" }), CANCELLED: ticket("status", { widgetStatus: "CANCELLED" }),
    },
    byItPriority: {
      LOW: ticket("itPriority", { widgetItPriority: "LOW", statusGroup: "active" }),
      MEDIUM: ticket("itPriority", { widgetItPriority: "MEDIUM", statusGroup: "active" }),
      HIGH: ticket("itPriority", { widgetItPriority: "HIGH", statusGroup: "active" }),
      URGENT: ticket("itPriority", { widgetItPriority: "URGENT", statusGroup: "active" }),
    },
    recentUpdated: ticket("recentUpdated", { updatedFrom: window.from, updatedBefore: window.before, sortBy: "updatedAt", sortOrder: "desc" }),
    recentResolved: ticket("recentResolved", { statusGroup: "resolved", resolvedFrom: window.from,
      resolvedBefore: window.before, sortBy: "resolvedAt", sortOrder: "desc" }),
    myActionsByStatus: {
      PLANNED: action({ status: "PLANNED" }), IN_PROGRESS: action({ status: "IN_PROGRESS" }),
      COMPLETED: action({ status: "COMPLETED" }), CANCELLED: action({ status: "CANCELLED" }),
    },
    myUnfinishedActions: action({ actionStatusGroup: "unfinished" }),
  };
}

export async function getStaffDashboard(actorId: number, query: StaffDashboardQuery) {
  return getPrisma().$transaction(async (transaction) => {
    await transaction.$executeRaw`SET TRANSACTION READ ONLY`;
    const [clock] = await transaction.$queryRaw<Array<{ asOf: Date }>>`SELECT CURRENT_TIMESTAMP AS "asOf"`;
    const asOf = clock.asOf, window = recentWindow(asOf);
    const bounds = { gte: window.from, lt: window.before, lte: asOf };
    const parent = parentWhere(actorId, query);
    const active: Prisma.TicketWhereInput = { AND: [parent, { currentStatus: { in: activeStatuses } }] };
    const updated: Prisma.TicketWhereInput = { AND: [parent, { updatedAt: bounds }] };
    const resolved: Prisma.TicketWhereInput = { AND: [parent, {
      currentStatus: { in: ["RESOLVED", "CLOSED"] }, statusHistory: { some: { toStatus: "RESOLVED", createdAt: bounds } },
    }] };
    const assigned: Prisma.ActionWhereInput = { assigneeId: actorId, ticket: { is: parent } };

    const unassigned = await transaction.ticket.count({ where: { AND: [active, { ownerId: null }] } });
    const mine = await transaction.ticket.count({ where: { AND: [active, { ownerId: actorId }] } });
    const statuses = await transaction.ticket.groupBy({ by: ["currentStatus"], where: parent, _count: { _all: true } });
    const priorities = await transaction.ticket.groupBy({ by: ["itPriority"], where: active, _count: { _all: true } });
    const byStatus: Record<TicketStatus, number> = { NEW: 0, OPEN: 0, IN_PROGRESS: 0, WAITING_FOR_REQUESTER: 0,
      RESOLVED: 0, CLOSED: 0, REOPENED: 0, CANCELLED: 0 };
    const byItPriority: Record<RequestedPriority, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, URGENT: 0 };
    for (const group of statuses) byStatus[group.currentStatus] = group._count._all;
    for (const group of priorities) byItPriority[group.itPriority] = group._count._all;
    const recentUpdated = await transaction.ticket.count({ where: updated });
    // Count parents via EXISTS, never multiple history events as multiple Tickets.
    const recentResolved = await transaction.ticket.count({ where: resolved });
    const updatedTickets = await transaction.ticket.findMany({ where: updated, select: rowSelect,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 5 });
    const latestResolutions = await transaction.ticketStatusHistory.groupBy({ by: ["ticketId"],
      where: { toStatus: "RESOLVED", createdAt: bounds, ticket: { is: resolved } }, _max: { createdAt: true },
      orderBy: [{ _max: { createdAt: "desc" } }, { ticketId: "desc" }], take: 5 });
    const resolvedTickets = await transaction.ticket.findMany({
      where: { AND: [resolved, { id: { in: latestResolutions.map((event) => event.ticketId) } }] }, select: rowSelect, take: 5,
    });
    const byId = new Map(resolvedTickets.map((ticket) => [ticket.id, ticket]));
    const resolvedRows = latestResolutions.map((event) => {
      const ticket = byId.get(event.ticketId);
      if (!ticket || event._max.createdAt === null) throw new Error("Incomplete Dashboard snapshot projection.");
      return { ...toRow(ticket), resolvedAt: event._max.createdAt.toISOString() };
    });
    const actionStatuses = await transaction.action.groupBy({ by: ["status"], where: assigned, _count: { _all: true } });
    const myActionsByStatus: Record<ActionStatus, number> = { PLANNED: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELLED: 0 };
    for (const group of actionStatuses) myActionsByStatus[group.status] = group._count._all;
    const myUnfinishedActions = myActionsByStatus.PLANNED + myActionsByStatus.IN_PROGRESS;
    // Historical identities are projected safely regardless of current eligibility.
    const unfinished = await transaction.action.findMany({ where: { AND: [assigned, { status: { in: unfinishedStatuses } }] },
      select: assignedSelect, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 5 });
    const recentWindowDTO = { from: window.from.toISOString(), before: window.before.toISOString() };
    return {
      asOf: asOf.toISOString(), timezone: "Asia/Bangkok", recentWindow: recentWindowDTO, filters: query,
      metrics: { unassigned, mine, byStatus, byItPriority, recentUpdated, recentResolved, myActionsByStatus, myUnfinishedActions },
      lists: { recentUpdated: updatedTickets.map(toRow), recentResolved: resolvedRows,
        myUnfinishedActions: unfinished.map((action) => ({
          ticket: { id: action.ticket.id, ticketNumber: action.ticket.ticketNumber,
            summary: action.ticket.summary, currentStatus: action.ticket.currentStatus },
          action: toActionDTO(action),
        })) },
      drillDown: drillDown(query, recentWindowDTO),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
