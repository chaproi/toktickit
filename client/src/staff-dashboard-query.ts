import type { StaffQueueQuery } from "./api.js";
import { canonicalUtc } from "./requester-query.js";
import { dashboardFilters, parseMyActionQuery, priorities, queryParameters } from "./components/my-action-query.js";

export { priorities };
export const staffFilterNames = dashboardFilters;
export const staffTicketStates = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED", "RESOLVED", "CLOSED", "CANCELLED"] as const;
export type StaffFilters = Record<(typeof staffFilterNames)[number], string>;
export type StaffDescriptor = { path: string; query: Record<string, string> };
export const staffListExtensions = ["statusGroup", "dashboardWidget", "widgetStatus", "widgetItPriority", "updatedFrom", "updatedBefore", "resolvedFrom", "resolvedBefore"] as const;
export function readStaffFilters(parameters: URLSearchParams): StaffFilters {
  return Object.fromEntries(staffFilterNames.map((name) => [name, parameters.get(name) ?? ""])) as StaffFilters;
}

// Inspect repeated keys before constructing an object. Keep ordinary Staff
// search/owner semantics; widget predicates are additional intersections.
export function parseStaffQuery(parameters: URLSearchParams, mode: "dashboard" | "tickets"):
  { success: true; data: Record<string, string> } | { success: false; fields: Record<string, string> } {
  const allowed = new Set<string>(staffFilterNames), fields: Record<string, string> = Object.create(null), data: Record<string, string> = {};
  if (mode === "tickets") for (const name of [...staffListExtensions, "sortBy", "sortOrder", "page", "pageSize"]) allowed.add(name);
  for (const [name, value] of parameters) {
    if (!allowed.has(name)) fields[name] = "This query parameter is not supported.";
    else if (parameters.getAll(name).length !== 1) fields[name] = "Provide this query parameter once.";
    else data[name] = name === "search" ? value.trim() : value;
  }
  for (const name of staffFilterNames) if (data[name] === "") delete data[name];
  const positive = (value: string, maximum = 2_147_483_647) => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= maximum;
  if ((data.search?.length ?? 0) > 100) fields.search = "Search must contain at most 100 characters.";
  for (const name of ["categoryId", "relatedSystemId"]) if (data[name] !== undefined && !positive(data[name])) fields[name] = "Provide a valid positive identifier.";
  if (data.owner !== undefined && !["me", "unassigned"].includes(data.owner) && !positive(data.owner)) fields.owner = "Select a valid owner.";
  const enumeration = (name: string, values: readonly string[]) => {
    if (data[name] !== undefined && !values.includes(data[name])) fields[name] = "This value is invalid.";
  };
  enumeration("requestedPriority", priorities); enumeration("itPriority", priorities); enumeration("currentStatus", staffTicketStates);
  if (mode === "tickets") {
    enumeration("statusGroup", ["active", "outstanding", "resolved"]);
    enumeration("dashboardWidget", ["unassigned", "mine", "status", "itPriority", "recentUpdated", "recentResolved"]);
    enumeration("sortBy", ["ticketNumber", "ticketDate", "updatedAt", "requestedPriority", "itPriority", "currentStatus", "resolvedAt"]);
    enumeration("sortOrder", ["asc", "desc"]); enumeration("pageSize", ["10", "25", "50"]);
    if (data.page !== undefined && !positive(data.page, Number.MAX_SAFE_INTEGER)) fields.page = "Provide a valid page.";
    if (data.dashboardWidget === "status") {
      if (!staffTicketStates.some((value) => value === data.widgetStatus)) fields.widgetStatus = "Select a Ticket status bucket.";
    } else if (data.widgetStatus !== undefined) fields.widgetStatus = "This bucket requires the status widget.";
    if (data.dashboardWidget === "itPriority") {
      if (!priorities.some((value) => value === data.widgetItPriority)) fields.widgetItPriority = "Select an IT priority bucket.";
    } else if (data.widgetItPriority !== undefined) fields.widgetItPriority = "This bucket requires the IT priority widget.";
    for (const prefix of ["updated", "resolved"]) {
      const from = `${prefix}From`, before = `${prefix}Before`;
      if (data[from] === undefined && data[before] === undefined) continue;
      if (!canonicalUtc(data[from])) fields[from] = "Supply both canonical UTC millisecond bounds.";
      if (!canonicalUtc(data[before])) fields[before] = "Supply both canonical UTC millisecond bounds.";
      if (!fields[from] && !fields[before] && data[from] >= data[before]) fields[before] = "The end must be later than the start.";
    }
    if (data.dashboardWidget === "recentUpdated" && (!data.updatedFrom || !data.updatedBefore)) fields.updatedFrom = "Updated date bounds are required.";
    if ((data.dashboardWidget === "recentResolved" || data.sortBy === "resolvedAt") && (!data.resolvedFrom || !data.resolvedBefore)) fields.resolvedFrom = "Resolution date bounds are required.";
  }
  return Object.keys(fields).length ? { success: false, fields } : { success: true, data };
}

export function staffTicketQuery(data: Record<string, string>): StaffQueueQuery {
  const result = { ...data, sortBy: data.sortBy ?? "updatedAt", sortOrder: data.sortOrder ?? "desc",
    page: Number(data.page ?? 1), pageSize: Number(data.pageSize ?? 10) } as unknown as StaffQueueQuery;
  for (const name of ["categoryId", "relatedSystemId"] as const) if (data[name] !== undefined) result[name] = Number(data[name]);
  if (data.owner !== undefined && data.owner !== "me" && data.owner !== "unassigned") result.owner = Number(data.owner);
  return result;
}

// Only known API resources map to known client paths. Never accept a URL,
// actor selector or return destination from a descriptor as a redirect.
export function staffDrillDown(descriptor: StaffDescriptor): string | null {
  if (descriptor.path === "/api/staff/tickets") {
    const parsed = parseStaffQuery(new URLSearchParams(descriptor.query), "tickets");
    return parsed.success ? `/staff/tickets?${new URLSearchParams({ ...parsed.data, page: "1", pageSize: "10" })}` : null;
  }
  if (descriptor.path === "/api/staff/actions") {
    if (descriptor.query.assignee !== "me") return null;
    const parsed = parseMyActionQuery(new URLSearchParams(descriptor.query));
    return parsed.success ? `/staff/actions?${queryParameters({ ...parsed.data, page: 1, pageSize: 10 })}` : null;
  }
  return null;
}
