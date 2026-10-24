import {
  parseTicketListQuery,
  REQUESTED_PRIORITY_SEVERITY,
  type RequestedPriority,
  type TicketListQuery,
} from "../tickets/ticket-query.js";

export type RequesterDashboardQuery = Pick<TicketListQuery,
  "search" | "categoryId" | "relatedSystemId" | "requestedPriority" | "currentStatus"
> & { itPriority: RequestedPriority | null };

const baseFields = new Set([
  "search", "categoryId", "relatedSystemId", "requestedPriority", "currentStatus",
]);

export function parseRequesterDashboardQuery(query: Record<string, unknown>):
  | { success: true; data: RequesterDashboardQuery }
  | { success: false; fields: Record<string, string> } {
  const fields: Record<string, string> = Object.create(null);
  const inherited: Record<string, unknown> = Object.create(null);
  for (const [name, value] of Object.entries(query)) {
    if (!baseFields.has(name) && name !== "itPriority") {
      fields[name] = "This query parameter is not supported.";
    } else if (typeof value !== "string") {
      fields[name] = "This query parameter must be provided once.";
    } else if (baseFields.has(name)) {
      inherited[name] = value;
    }
  }

  // Retain the inherited Requester search, enum and optional-filter rules.
  const parsed = parseTicketListQuery(inherited);
  if (!parsed.success) Object.assign(fields, parsed.fields);

  const rawPriority = typeof query.itPriority === "string" ? query.itPriority : "";
  const itPriority = REQUESTED_PRIORITY_SEVERITY.find((value) => value === rawPriority) ?? null;
  if (rawPriority !== "" && itPriority === null) fields.itPriority = "IT Priority is invalid.";
  if (parsed.success) {
    for (const name of ["categoryId", "relatedSystemId"] as const) {
      const identifier = parsed.data[name];
      if (identifier !== null && identifier > 2_147_483_647) {
        fields[name] = "Identifier must be a positive 32-bit integer.";
      }
    }
  }

  if (!parsed.success || Object.keys(fields).length > 0) return { success: false, fields };
  const { search, categoryId, relatedSystemId, requestedPriority, currentStatus } = parsed.data;
  return { success: true, data: {
    search, categoryId, relatedSystemId, requestedPriority, itPriority, currentStatus,
  } };
}
