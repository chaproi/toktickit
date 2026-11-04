import { Prisma } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { readDashboardSummary } from "./dashboard-read-sql.js";
import type { RequesterDashboardQuery } from "./requester-dashboard-query.js";

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
    const { outstanding, needsAttention, recentUpdated, recentResolved, updatedRows, resolvedRows } =
      await readDashboardSummary(transaction, requesterId, query, false, window, asOf);
    const recentWindowDTO = { from: window.from.toISOString(), before: window.before.toISOString() };
    return {
      asOf: asOf.toISOString(), timezone: "Asia/Bangkok", recentWindow: recentWindowDTO,
      filters: query,
      metrics: { outstanding, needsAttention, recentUpdated, recentResolved },
      lists: { recentUpdated: updatedRows, recentResolved: resolvedRows },
      drillDown: drillDown(query, recentWindowDTO),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
