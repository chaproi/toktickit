const PAGE_SIZES = [20, 50, 100] as const;
const PARAMETERS = new Set(["page", "pageSize"]);

export type CommentPageQuery = {
  page: number;
  pageSize: (typeof PAGE_SIZES)[number];
};

export function parseCommentPageQuery(
  query: Record<string, unknown>,
): { success: true; data: CommentPageQuery } | {
  success: false;
  fields: Record<string, string>;
} {
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (!PARAMETERS.has(key)) {
      fields[key] = "This query parameter is not supported.";
    } else if (typeof value !== "string") {
      fields[key] = "This query parameter must be provided once.";
    }
  }
  const parsePositive = (name: string, fallback: number): number => {
    const value = query[name];
    if (value === undefined) return fallback;
    if (typeof value !== "string" || !/^[1-9]\d*$/u.test(value)) {
      fields[name] = "Value must be a positive integer.";
      return fallback;
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
      fields[name] = "Value must be a positive integer.";
      return fallback;
    }
    return parsed;
  };
  const page = parsePositive("page", 1);
  const parsedPageSize = parsePositive("pageSize", 20);
  const pageSize = PAGE_SIZES.includes(parsedPageSize as CommentPageQuery["pageSize"])
    ? parsedPageSize as CommentPageQuery["pageSize"]
    : 20;
  if (!PAGE_SIZES.includes(parsedPageSize as CommentPageQuery["pageSize"])) {
    fields.pageSize = "Page size must be 20, 50, or 100.";
  }
  return Object.keys(fields).length > 0
    ? { success: false, fields }
    : { success: true, data: { page, pageSize } };
}
