import { ActionStatus } from "@prisma/client";
import { parseStaffQueueQuery, type StaffQueueQuery } from "../tickets/ticket-query.js";

export type ActionDateWindow = { from: Date; before: Date };
export type ParentStatusGroup = "active" | "outstanding" | "resolved";
export type StaffActionQuery = Omit<StaffQueueQuery, "sortBy" | "sortOrder"> & {
  status?: ActionStatus;
  unfinished: boolean;
  statusGroup?: ParentStatusGroup;
  updatedWindow?: ActionDateWindow;
  resolvedWindow?: ActionDateWindow;
};
type QueryResult = { success: true; data: StaffActionQuery } | { success: false; fields: Record<string, string> };

const parentParameters = ["search", "categoryId", "relatedSystemId", "requestedPriority", "itPriority", "currentStatus", "owner", "page", "pageSize"];
const allowedParameters = new Set([...parentParameters, "assignee", "status", "actionStatusGroup", "statusGroup",
  "updatedFrom", "updatedBefore", "resolvedFrom", "resolvedBefore"]);

function canonicalTimestamp(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return null;
  const instant = new Date(value);
  return Number.isFinite(instant.getTime()) && instant.toISOString() === value ? instant : null;
}

export function parseStaffActionQuery(query: Record<string, unknown>): QueryResult {
  const fields: Record<string, string> = Object.create(null);
  for (const [name, value] of Object.entries(query)) {
    if (!allowedParameters.has(name)) fields[name] = "This query parameter is not supported.";
    else if (typeof value !== "string") fields[name] = "This query parameter must be provided once.";
  }
  // Reuse inherited Staff search/bounds/IDs/enums/owner/pagination without
  // extending or changing the established Ticket endpoint's query whitelist.
  const parent = parseStaffQueueQuery(Object.fromEntries(Object.entries(query).filter(([name]) => parentParameters.includes(name))));
  if (!parent.success) Object.assign(fields, parent.fields);
  if (query.assignee !== undefined && query.assignee !== "me") fields.assignee = "Assignee must be me, provided once.";

  let status: ActionStatus | undefined;
  if (query.status !== undefined) {
    status = Object.values(ActionStatus).find((candidate) => candidate === query.status);
    if (status === undefined) fields.status = "Status must be a recognized Action state, provided once.";
  }
  if (query.actionStatusGroup !== undefined && query.actionStatusGroup !== "unfinished") {
    fields.actionStatusGroup = "Action status group must be unfinished, provided once.";
  }
  let statusGroup: ParentStatusGroup | undefined;
  if (query.statusGroup !== undefined) {
    statusGroup = (["active", "outstanding", "resolved"] as const).find((candidate) => candidate === query.statusGroup);
    if (statusGroup === undefined) fields.statusGroup = "Ticket status group must be active, outstanding, or resolved.";
  }
  const window = (fromName: string, beforeName: string): ActionDateWindow | undefined => {
    if (query[fromName] === undefined && query[beforeName] === undefined) return undefined;
    const from = typeof query[fromName] === "string" ? canonicalTimestamp(query[fromName]) : null;
    const before = typeof query[beforeName] === "string" ? canonicalTimestamp(query[beforeName]) : null;
    if (from === null) fields[fromName] = "Both date bounds are required as canonical UTC timestamps with milliseconds.";
    if (before === null) fields[beforeName] = "Both date bounds are required as canonical UTC timestamps with milliseconds.";
    if (from === null || before === null) return undefined;
    if (from.getTime() >= before.getTime()) {
      fields[beforeName] = "The end of the window must be later than its start.";
      return undefined;
    }
    return { from, before };
  };
  const updatedWindow = window("updatedFrom", "updatedBefore");
  const resolvedWindow = window("resolvedFrom", "resolvedBefore");
  if (!parent.success || Object.keys(fields).length > 0) return { success: false, fields };
  const { sortBy: _sortBy, sortOrder: _sortOrder, ...parentFilters } = parent.data;
  return { success: true, data: {
    ...parentFilters, unfinished: query.actionStatusGroup === "unfinished",
    ...(status === undefined ? {} : { status }), ...(statusGroup === undefined ? {} : { statusGroup }),
    ...(updatedWindow === undefined ? {} : { updatedWindow }), ...(resolvedWindow === undefined ? {} : { resolvedWindow }),
  } };
}
