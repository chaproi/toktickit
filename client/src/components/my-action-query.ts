import type { StaffActionQuery, TicketPageSize } from "../api.js";

export const actionStates = ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export const ticketStates = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"] as const;
export const priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export const dashboardFilters = ["search", "categoryId", "relatedSystemId", "requestedPriority", "itPriority", "currentStatus", "owner"] as const;
export const filterNames = [...dashboardFilters, "status", "actionStatusGroup", "statusGroup", "updatedFrom", "updatedBefore", "resolvedFrom", "resolvedBefore"] as const;
export type Filters = Record<(typeof filterNames)[number], string>;
export function readFilters(parameters: URLSearchParams): Filters {
  return Object.fromEntries(filterNames.map((name) => [name, parameters.get(name) ?? ""])) as Filters;
}

// Inspect occurrences before constructing any object: repeated URL keys are errors.
export function parseMyActionQuery(parameters: URLSearchParams):
  { success: true; data: StaffActionQuery } | { success: false; fields: Record<string, string> } {
  const fields: Record<string, string> = Object.create(null);
  const allowed = new Set<string>([...filterNames, "assignee", "page", "pageSize"]);
  const seen = new Set<string>();
  for (const [name] of parameters) {
    if (!allowed.has(name)) fields[name] = "This query parameter is not supported.";
    else if (seen.has(name)) fields[name] = "This query parameter must be provided once.";
    seen.add(name);
  }
  const get = (name: string) => parameters.get(name);
  const positive = (name: string, raw: string, max = Number.MAX_SAFE_INTEGER): number | undefined => {
    const value = Number(raw);
    if (/^[1-9]\d*$/.test(raw) && Number.isSafeInteger(value) && value <= max) return value;
    fields[name] = "Provide a valid positive integer.";
    return undefined;
  };
  const identifier = (name: string) => {
    const raw = get(name);
    return raw === null || raw === "" ? undefined : positive(name, raw, 2_147_483_647);
  };
  const enumeration = <T extends string>(name: string, values: readonly T[], emptyAllowed = true): T | undefined => {
    const raw = get(name);
    if (raw === null || emptyAllowed && raw === "") return undefined;
    const found = values.find((value) => value === raw);
    if (found === undefined) fields[name] = "This filter value is invalid.";
    return found;
  };
  if (get("assignee") !== null && get("assignee") !== "me") fields.assignee = "Assignee must be me.";
  const search = (get("search") ?? "").trim();
  // Match the inherited Staff search bound; literal % and _ remain literal text.
  if (search.length > 100) fields.search = "Search must contain at most 100 characters.";
  const ownerText = get("owner");
  const owner = ownerText === "me" || ownerText === "unassigned" ? ownerText : identifier("owner");
  const page = positive("page", get("page") ?? "1") ?? 1;
  const size = positive("pageSize", get("pageSize") ?? "10");
  if (![10, 25, 50].includes(size ?? 0)) fields.pageSize = "Page size must be 10, 25, or 50.";
  const data: StaffActionQuery = {
    assignee: "me", page, pageSize: (size ?? 10) as TicketPageSize,
    ...(search ? { search } : {}),
    categoryId: identifier("categoryId"), relatedSystemId: identifier("relatedSystemId"),
    requestedPriority: enumeration("requestedPriority", priorities), itPriority: enumeration("itPriority", priorities),
    currentStatus: enumeration("currentStatus", ticketStates), owner,
    status: enumeration("status", actionStates, false),
    actionStatusGroup: enumeration("actionStatusGroup", ["unfinished"] as const, false),
    statusGroup: enumeration("statusGroup", ["active", "outstanding", "resolved"] as const, false),
  };
  for (const [fromName, beforeName] of [["updatedFrom", "updatedBefore"], ["resolvedFrom", "resolvedBefore"]] as const) {
    if (!parameters.has(fromName) && !parameters.has(beforeName)) continue;
    const from = get(fromName), before = get(beforeName);
    const canonical = (value: string | null): value is string => {
      if (value === null || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
      const date = new Date(value);
      return Number.isFinite(date.getTime()) && date.toISOString() === value;
    };
    if (!canonical(from)) fields[fromName] = "Both bounds require canonical UTC timestamps with milliseconds.";
    if (!canonical(before)) fields[beforeName] = "Both bounds require canonical UTC timestamps with milliseconds.";
    if (canonical(from) && canonical(before)) {
      if (from >= before) fields[beforeName] = "The end must be later than the start.";
      data[fromName] = from; data[beforeName] = before;
    }
  }
  return Object.keys(fields).length ? { success: false, fields } : { success: true, data };
}

export function queryParameters(query: StaffActionQuery): URLSearchParams {
  return new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined).map(([name, value]) => [name, String(value)]));
}
