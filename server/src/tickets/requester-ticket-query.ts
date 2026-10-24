import {
  parseTicketListQuery,
  REQUESTED_PRIORITY_SEVERITY,
  type RequestedPriority,
  type TicketListQuery,
  type TicketSortField,
} from "./ticket-query.js";

export type RequesterStatusGroup = "active" | "outstanding" | "resolved";
export type RequesterDashboardWidget = "outstanding" | "attention" | "recentUpdated" | "recentResolved";
export type TicketDateWindow = { from: Date; before: Date };
export type RequesterTicketListQuery = Omit<TicketListQuery, "sortBy"> & {
  sortBy: TicketSortField | "resolvedAt";
  itPriority?: RequestedPriority | null;
  statusGroup?: RequesterStatusGroup;
  dashboardWidget?: RequesterDashboardWidget;
  updatedWindow?: TicketDateWindow;
  resolvedWindow?: TicketDateWindow;
};

const extensionFields = new Set([
  "itPriority", "statusGroup", "dashboardWidget",
  "updatedFrom", "updatedBefore", "resolvedFrom", "resolvedBefore",
]);

function canonicalTimestamp(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return null;
  const instant = new Date(value);
  return Number.isFinite(instant.getTime()) && instant.toISOString() === value ? instant : null;
}

export function parseRequesterTicketListQuery(query: Record<string, unknown>):
  | { success: true; data: RequesterTicketListQuery }
  | { success: false; fields: Record<string, string> } {
  const fields: Record<string, string> = Object.create(null);
  const inherited: Record<string, unknown> = Object.create(null);
  for (const [name, value] of Object.entries(query)) {
    if (extensionFields.has(name)) {
      if (typeof value !== "string") fields[name] = "This query parameter must be provided once.";
    } else inherited[name] = value;
  }
  // Keep the shared parser and its ordinary return shape unchanged. Only the
  // Requester route gains these extensions; Dashboard/Staff whitelists stay separate.
  const resolvedSort = query.sortBy === "resolvedAt";
  if (resolvedSort) inherited.sortBy = "updatedAt";
  const parsed = parseTicketListQuery(inherited);
  if (!parsed.success) Object.assign(fields, parsed.fields);

  let itPriority: RequestedPriority | null = null;
  if (query.itPriority !== undefined && query.itPriority !== "") {
    itPriority = REQUESTED_PRIORITY_SEVERITY.find((value) => value === query.itPriority) ?? null;
    if (itPriority === null) fields.itPriority = "IT Priority is invalid.";
  }
  const statusGroup = (["active", "outstanding", "resolved"] as const).find((value) => value === query.statusGroup);
  if (query.statusGroup !== undefined && statusGroup === undefined) {
    fields.statusGroup = "Status group must be active, outstanding, or resolved.";
  }
  const dashboardWidget = (["outstanding", "attention", "recentUpdated", "recentResolved"] as const)
    .find((value) => value === query.dashboardWidget);
  if (query.dashboardWidget !== undefined && dashboardWidget === undefined) {
    fields.dashboardWidget = "This Requester Dashboard widget is not supported.";
  }
  const window = (fromName: string, beforeName: string): TicketDateWindow | undefined => {
    if (query[fromName] === undefined && query[beforeName] === undefined) return undefined;
    const from = canonicalTimestamp(query[fromName]);
    const before = canonicalTimestamp(query[beforeName]);
    if (from === null) fields[fromName] = "Both bounds must be canonical UTC timestamps with milliseconds.";
    if (before === null) fields[beforeName] = "Both bounds must be canonical UTC timestamps with milliseconds.";
    if (from === null || before === null) return undefined;
    if (from.getTime() >= before.getTime()) {
      fields[beforeName] = "The end of the window must be later than its start.";
      return undefined;
    }
    return { from, before };
  };
  const updatedWindow = window("updatedFrom", "updatedBefore");
  const resolvedWindow = window("resolvedFrom", "resolvedBefore");
  if (dashboardWidget === "recentUpdated" && updatedWindow === undefined) {
    fields.updatedFrom ??= "This widget requires a valid updated date pair.";
    fields.updatedBefore ??= "This widget requires a valid updated date pair.";
  }
  if ((dashboardWidget === "recentResolved" || resolvedSort) && resolvedWindow === undefined) {
    fields.resolvedFrom ??= "Resolution filtering and sorting require a valid resolved date pair.";
    fields.resolvedBefore ??= "Resolution filtering and sorting require a valid resolved date pair.";
  }
  if (parsed.success) {
    for (const name of ["categoryId", "relatedSystemId"] as const) {
      if (parsed.data[name] !== null && parsed.data[name] > 2_147_483_647) {
        fields[name] = "Identifier must be a positive 32-bit integer.";
      }
    }
  }
  if (!parsed.success || Object.keys(fields).length > 0) return { success: false, fields };
  return { success: true, data: {
    ...parsed.data,
    ...(resolvedSort ? { sortBy: "resolvedAt" as const } : {}),
    ...(query.itPriority === undefined ? {} : { itPriority }),
    ...(statusGroup === undefined ? {} : { statusGroup }),
    ...(dashboardWidget === undefined ? {} : { dashboardWidget }),
    ...(updatedWindow === undefined ? {} : { updatedWindow }),
    ...(resolvedWindow === undefined ? {} : { resolvedWindow }),
  } };
}
