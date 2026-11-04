export const requesterFilterNames = [
  "search", "categoryId", "relatedSystemId", "requestedPriority", "itPriority", "currentStatus",
] as const;
export const requesterPriorities = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export const requesterStatuses = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"] as const;
export type RequesterFilters = Record<(typeof requesterFilterNames)[number], string>;
export function readRequesterFilters(parameters: URLSearchParams): RequesterFilters {
  return Object.fromEntries(requesterFilterNames.map((name) => [name, parameters.get(name) ?? ""])) as RequesterFilters;
}
export function canonicalUtc(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const instant = new Date(value);
  return Number.isFinite(instant.getTime()) && instant.toISOString() === value;
}

// Inspect repeated values before constructing an object. Dashboard and owned
// list URLs deliberately have different whitelists; identity is never a filter.
export function parseRequesterQuery(parameters: URLSearchParams, mode: "dashboard" | "tickets"):
  | { success: true; data: Record<string, string> }
  | { success: false; fields: Record<string, string> } {
  const allowed = new Set<string>(requesterFilterNames);
  if (mode === "tickets") for (const name of ["statusGroup", "dashboardWidget", "updatedFrom", "updatedBefore", "resolvedFrom", "resolvedBefore", "sortBy", "sortOrder", "page", "pageSize"]) allowed.add(name);
  const fields: Record<string, string> = Object.create(null);
  const data: Record<string, string> = {};
  for (const [name, value] of parameters) {
    if (!allowed.has(name)) fields[name] = "This query parameter is not supported.";
    else if (parameters.getAll(name).length !== 1) fields[name] = "Provide this query parameter once.";
    else data[name] = name === "search" ? value.trim() : value;
  }
  for (const name of requesterFilterNames) if (data[name] === "") delete data[name];
  if ((data.search?.length ?? 0) > 100) fields.search = "Search must contain at most 100 characters.";
  for (const name of ["categoryId", "relatedSystemId", "page"]) {
    if (data[name] !== undefined && (!/^[1-9]\d*$/.test(data[name]) || !Number.isSafeInteger(Number(data[name])) || (name !== "page" && Number(data[name]) > 2_147_483_647))) {
      fields[name] = "A valid positive integer is required.";
    }
  }
  const enumeration = (name: string, values: readonly string[]) => {
    if (data[name] !== undefined && !values.includes(data[name])) fields[name] = "This value is invalid.";
  };
  enumeration("requestedPriority", requesterPriorities);
  enumeration("itPriority", requesterPriorities);
  enumeration("currentStatus", requesterStatuses);
  if (mode === "tickets") {
    enumeration("statusGroup", ["active", "outstanding", "resolved"]);
    enumeration("dashboardWidget", ["outstanding", "attention", "recentUpdated", "recentResolved"]);
    enumeration("sortBy", ["ticketNumber", "ticketDate", "updatedAt", "summary", "requestedPriority", "resolvedAt"]);
    enumeration("sortOrder", ["asc", "desc"]);
    enumeration("pageSize", ["10", "25", "50"]);
    for (const prefix of ["updated", "resolved"]) {
      const start = `${prefix}From`, end = `${prefix}Before`;
      if (data[start] !== undefined || data[end] !== undefined) {
        if (!canonicalUtc(data[start])) fields[start] = "Supply both UTC millisecond bounds.";
        if (!canonicalUtc(data[end])) fields[end] = "Supply both UTC millisecond bounds.";
        if (!fields[start] && !fields[end] && data[start] >= data[end]) fields[end] = "The end must be later than the start.";
      }
    }
    if (data.dashboardWidget === "recentUpdated" && (!data.updatedFrom || !data.updatedBefore)) fields.updatedFrom = "This widget requires updated date bounds.";
    if ((data.dashboardWidget === "recentResolved" || data.sortBy === "resolvedAt") && (!data.resolvedFrom || !data.resolvedBefore)) fields.resolvedFrom = "Resolution filtering and sorting require resolved date bounds.";
  }
  return Object.keys(fields).length ? { success: false, fields } : { success: true, data };
}

export function requesterDrillDown(descriptor: { path: string; query: Record<string, string> }): string | null {
  if (descriptor.path !== "/api/tickets") return null;
  const parsed = parseRequesterQuery(new URLSearchParams(descriptor.query), "tickets");
  if (!parsed.success) return null;
  return `/tickets?${new URLSearchParams({ ...parsed.data, page: "1", pageSize: "10" })}`;
}
