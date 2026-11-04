import { parseStaffQueueQuery, type StaffQueueQuery } from "../tickets/ticket-query.js";

export type StaffDashboardQuery = Pick<StaffQueueQuery,
  "search" | "categoryId" | "relatedSystemId" | "requestedPriority" | "itPriority" | "currentStatus" | "owner"
>;

const baseFields = new Set([
  "search", "categoryId", "relatedSystemId", "requestedPriority", "itPriority", "currentStatus", "owner",
]);

export function parseStaffDashboardQuery(query: Record<string, unknown>):
  | { success: true; data: StaffDashboardQuery }
  | { success: false; fields: Record<string, string> } {
  const fields: Record<string, string> = Object.create(null);
  const inherited: Record<string, unknown> = Object.create(null);
  for (const [name, value] of Object.entries(query)) {
    if (!baseFields.has(name)) fields[name] = "This query parameter is not supported.";
    else if (typeof value !== "string") fields[name] = "This query parameter must be provided once.";
    else inherited[name] = value;
  }
  // Retain inherited Staff search bounds, enums, 32-bit IDs and owner selectors,
  // without accepting list pagination/sorting or client-supplied actor identity.
  const parsed = parseStaffQueueQuery(inherited);
  if (!parsed.success) Object.assign(fields, parsed.fields);
  if (!parsed.success || Object.keys(fields).length > 0) return { success: false, fields };
  const { search, categoryId, relatedSystemId, requestedPriority, itPriority, currentStatus, owner } = parsed.data;
  return { success: true, data: { search, categoryId, relatedSystemId, requestedPriority, itPriority, currentStatus, owner } };
}
