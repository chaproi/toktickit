import { TicketStatus } from "@prisma/client";
import { parseStaffQueueQuery, REQUESTED_PRIORITY_SEVERITY, type RequestedPriority, type StaffQueueQuery } from "./ticket-query.js";

export type StaffStatusGroup = "active" | "outstanding" | "resolved";
export type StaffDashboardWidget = "unassigned" | "mine" | "status" | "itPriority" | "recentUpdated" | "recentResolved";
export type StaffDateWindow = { from: Date; before: Date };
export type StaffTicketDrilldownQuery = Omit<StaffQueueQuery, "sortBy"> & {
  sortBy: StaffQueueQuery["sortBy"] | "resolvedAt";
  statusGroup?: StaffStatusGroup;
  dashboardWidget?: StaffDashboardWidget;
  widgetStatus?: TicketStatus;
  widgetItPriority?: RequestedPriority;
  updatedWindow?: StaffDateWindow;
  resolvedWindow?: StaffDateWindow;
};

const extensionFields = new Set([
  "statusGroup", "dashboardWidget", "widgetStatus", "widgetItPriority",
  "updatedFrom", "updatedBefore", "resolvedFrom", "resolvedBefore",
]);

function canonicalTimestamp(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return null;
  const instant = new Date(value);
  return Number.isFinite(instant.getTime()) && instant.toISOString() === value ? instant : null;
}

export function parseStaffTicketQuery(query: Record<string, unknown>):
  | { success: false; fields: Record<string, string> }
  | { success: true; extended: false; data: StaffQueueQuery }
  | { success: true; extended: true; data: StaffTicketDrilldownQuery } {
  const fields: Record<string, string> = Object.create(null);
  const inherited: Record<string, unknown> = Object.create(null);
  let extended = query.sortBy === "resolvedAt";
  for (const [name, value] of Object.entries(query)) {
    if (extensionFields.has(name)) {
      extended = true;
      if (typeof value !== "string") fields[name] = "This query parameter must be provided once.";
    } else inherited[name] = value;
  }
  const resolvedSort = query.sortBy === "resolvedAt";
  if (resolvedSort) inherited.sortBy = "updatedAt";
  const parsed = parseStaffQueueQuery(inherited);
  if (!parsed.success) Object.assign(fields, parsed.fields);

  const statusGroup = (["active", "outstanding", "resolved"] as const).find((value) => value === query.statusGroup);
  if (query.statusGroup !== undefined && statusGroup === undefined) fields.statusGroup = "Status group is invalid.";
  const dashboardWidget = (["unassigned", "mine", "status", "itPriority", "recentUpdated", "recentResolved"] as const)
    .find((value) => value === query.dashboardWidget);
  if (query.dashboardWidget !== undefined && dashboardWidget === undefined) fields.dashboardWidget = "This Staff Dashboard widget is not supported.";
  const widgetStatus = Object.values(TicketStatus).find((value) => value === query.widgetStatus);
  const widgetItPriority = REQUESTED_PRIORITY_SEVERITY.find((value) => value === query.widgetItPriority);
  if (dashboardWidget === "status") {
    if (widgetStatus === undefined) fields.widgetStatus = "A recognized Ticket status is required for this widget.";
  } else if (query.widgetStatus !== undefined) fields.widgetStatus = "This bucket is only supported by the status widget.";
  if (dashboardWidget === "itPriority") {
    if (widgetItPriority === undefined) fields.widgetItPriority = "A recognized IT priority is required for this widget.";
  } else if (query.widgetItPriority !== undefined) fields.widgetItPriority = "This bucket is only supported by the IT-priority widget.";

  const window = (fromName: string, beforeName: string): StaffDateWindow | undefined => {
    if (query[fromName] === undefined && query[beforeName] === undefined) return undefined;
    const from = canonicalTimestamp(query[fromName]), before = canonicalTimestamp(query[beforeName]);
    if (from === null) fields[fromName] = "Both bounds must be canonical UTC timestamps with milliseconds.";
    if (before === null) fields[beforeName] = "Both bounds must be canonical UTC timestamps with milliseconds.";
    if (from === null || before === null) return undefined;
    if (from.getTime() >= before.getTime()) {
      fields[beforeName] = "The end of the window must be later than its start.";
      return undefined;
    }
    return { from, before };
  };
  const updatedWindow = window("updatedFrom", "updatedBefore"), resolvedWindow = window("resolvedFrom", "resolvedBefore");
  if (dashboardWidget === "recentUpdated" && updatedWindow === undefined) {
    fields.updatedFrom ??= "This widget requires a valid updated date pair.";
    fields.updatedBefore ??= "This widget requires a valid updated date pair.";
  }
  if ((dashboardWidget === "recentResolved" || resolvedSort) && resolvedWindow === undefined) {
    fields.resolvedFrom ??= "Resolution filtering and sorting require a valid resolved date pair.";
    fields.resolvedBefore ??= "Resolution filtering and sorting require a valid resolved date pair.";
  }
  if (!parsed.success || Object.keys(fields).length > 0) return { success: false, fields };
  if (!extended) return { success: true, extended: false, data: parsed.data };
  return { success: true, extended: true, data: {
    ...parsed.data, ...(resolvedSort ? { sortBy: "resolvedAt" as const } : {}),
    ...(statusGroup === undefined ? {} : { statusGroup }), ...(dashboardWidget === undefined ? {} : { dashboardWidget }),
    ...(widgetStatus === undefined ? {} : { widgetStatus }), ...(widgetItPriority === undefined ? {} : { widgetItPriority }),
    ...(updatedWindow === undefined ? {} : { updatedWindow }), ...(resolvedWindow === undefined ? {} : { resolvedWindow }),
  } };
}
