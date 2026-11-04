import { ActionStatus } from "@prisma/client";
import { parseCommentPageQuery, type CommentPageQuery } from "../comments/comment-query.js";

export type ActionListQuery = CommentPageQuery & { status?: ActionStatus };
type QueryResult<T> = { success: true; data: T } | { success: false; fields: Record<string, string> };

function unsupportedFields(query: Record<string, unknown>, allowed: readonly string[]) {
  const fields: Record<string, string> = Object.create(null);
  for (const [key, value] of Object.entries(query)) {
    if (!allowed.includes(key)) fields[key] = "This query parameter is not supported.";
    else if (typeof value !== "string") fields[key] = "This query parameter must be provided once.";
  }
  return fields;
}

function parseActionPageQuery(
  query: Record<string, unknown>,
  allowStatus: boolean,
): QueryResult<ActionListQuery> {
  const fields = unsupportedFields(query, allowStatus ? ["page", "pageSize", "status"] : ["page", "pageSize"]);
  const pageFields = Object.fromEntries(Object.entries(query).filter(([key]) => key === "page" || key === "pageSize"));
  const page = parseCommentPageQuery(pageFields);
  if (!page.success) Object.assign(fields, page.fields);
  let status: ActionStatus | undefined;
  if (allowStatus && query.status !== undefined) {
    status = Object.values(ActionStatus).find((value) => value === query.status);
    if (status === undefined) fields.status = "Status must be one recognized Action state, provided once.";
  }
  if (!page.success || Object.keys(fields).length > 0) return { success: false, fields };
  return { success: true, data: { ...page.data, ...(status === undefined ? {} : { status }) } };
}

export function parseActionListQuery(query: Record<string, unknown>) {
  return parseActionPageQuery(query, true);
}

export function parseActionHistoryQuery(query: Record<string, unknown>): QueryResult<CommentPageQuery> {
  return parseActionPageQuery(query, false);
}

export function validateActionDetailQuery(query: Record<string, unknown>): QueryResult<Record<string, never>> {
  const fields = unsupportedFields(query, []);
  return Object.keys(fields).length > 0 ? { success: false, fields } : { success: true, data: {} };
}
