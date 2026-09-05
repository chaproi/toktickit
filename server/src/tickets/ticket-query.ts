export const REQUESTED_PRIORITY_SEVERITY = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT",
] as const;

const TICKET_STATUSES = [
  "NEW",
  "ASSIGNED",
  "IN_PROGRESS",
  "PENDING_REQUESTER",
  "RESOLVED",
  "CLOSED",
  "CANCELLED",
] as const;

const SORT_FIELDS = [
  "ticketNumber",
  "ticketDate",
  "updatedAt",
  "summary",
  "requestedPriority",
] as const;

const SORT_ORDERS = ["asc", "desc"] as const;
const PAGE_SIZES = [10, 25, 50] as const;

const QUERY_PARAMETERS = new Set([
  "search",
  "categoryId",
  "relatedSystemId",
  "requestedPriority",
  "currentStatus",
  "sortBy",
  "sortOrder",
  "page",
  "pageSize",
]);

export type RequestedPriority =
  (typeof REQUESTED_PRIORITY_SEVERITY)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type TicketSortField = (typeof SORT_FIELDS)[number];
export type TicketSortOrder = (typeof SORT_ORDERS)[number];
export type TicketPageSize = (typeof PAGE_SIZES)[number];

export type TicketListQuery = {
  search: string;
  categoryId: number | null;
  relatedSystemId: number | null;
  requestedPriority: RequestedPriority | null;
  currentStatus: TicketStatus | null;
  sortBy: TicketSortField;
  sortOrder: TicketSortOrder;
  page: number;
  pageSize: TicketPageSize;
};

export type TicketQueryResult =
  | {
      success: true;
      data: TicketListQuery;
    }
  | {
      success: false;
      fields: Record<string, string>;
    };

function isSingleString(value: unknown): value is string {
  return typeof value === "string";
}

function parsePositiveInteger(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function includesValue<T extends string>(
  values: readonly T[],
  value: string,
): value is T {
  return values.includes(value as T);
}

export function parseTicketListQuery(
  query: Record<string, unknown>,
): TicketQueryResult {
  const fields: Record<string, string> = {};

  for (const [name, value] of Object.entries(query)) {
    if (!QUERY_PARAMETERS.has(name)) {
      fields[name] = "This query parameter is not supported.";
      continue;
    }

    if (!isSingleString(value)) {
      fields[name] = "This query parameter must be provided once.";
    }
  }

  const getValue = (name: string): string | undefined => {
    const value = query[name];
    return isSingleString(value) ? value : undefined;
  };

  const search = (getValue("search") ?? "").trim();
  if (search.length > 100) {
    fields.search = "Search must contain at most 100 characters.";
  }

  const parseOptionalIdentifier = (
    name: "categoryId" | "relatedSystemId",
  ): number | null => {
    const raw = getValue(name);
    if (raw === undefined || raw === "") {
      return null;
    }

    const parsed = parsePositiveInteger(raw);
    if (parsed === null) {
      fields[name] = "Identifier must be a positive integer.";
      return null;
    }

    return parsed;
  };

  const categoryId = parseOptionalIdentifier("categoryId");
  const relatedSystemId = parseOptionalIdentifier(
    "relatedSystemId",
  );

  const rawPriority = getValue("requestedPriority") ?? "";
  let requestedPriority: RequestedPriority | null = null;
  if (rawPriority !== "") {
    if (
      includesValue(
        REQUESTED_PRIORITY_SEVERITY,
        rawPriority,
      )
    ) {
      requestedPriority = rawPriority;
    } else {
      fields.requestedPriority =
        "Requested Priority is invalid.";
    }
  }

  const rawStatus = getValue("currentStatus") ?? "";
  let currentStatus: TicketStatus | null = null;
  if (rawStatus !== "") {
    if (includesValue(TICKET_STATUSES, rawStatus)) {
      currentStatus = rawStatus;
    } else {
      fields.currentStatus = "Current Status is invalid.";
    }
  }

  const rawSortBy = getValue("sortBy") ?? "updatedAt";
  let sortBy: TicketSortField = "updatedAt";
  if (includesValue(SORT_FIELDS, rawSortBy)) {
    sortBy = rawSortBy;
  } else {
    fields.sortBy = "Sort field is invalid.";
  }

  const rawSortOrder = getValue("sortOrder") ?? "desc";
  let sortOrder: TicketSortOrder = "desc";
  if (includesValue(SORT_ORDERS, rawSortOrder)) {
    sortOrder = rawSortOrder;
  } else {
    fields.sortOrder = "Sort direction is invalid.";
  }

  const rawPage = getValue("page") ?? "1";
  const parsedPage = parsePositiveInteger(rawPage);
  const page = parsedPage ?? 1;
  if (parsedPage === null) {
    fields.page = "Page must be a positive integer.";
  }

  const rawPageSize = getValue("pageSize") ?? "10";
  const parsedPageSize = parsePositiveInteger(rawPageSize);
  let pageSize: TicketPageSize = 10;
  if (
    parsedPageSize !== null &&
    PAGE_SIZES.includes(parsedPageSize as TicketPageSize)
  ) {
    pageSize = parsedPageSize as TicketPageSize;
  } else {
    fields.pageSize = "Page size must be 10, 25, or 50.";
  }

  if (Object.keys(fields).length > 0) {
    return {
      success: false,
      fields,
    };
  }

  return {
    success: true,
    data: {
      search,
      categoryId,
      relatedSystemId,
      requestedPriority,
      currentStatus,
      sortBy,
      sortOrder,
      page,
      pageSize,
    },
  };
}

export function buildTicketListOrderBy(
  sortBy: TicketSortField,
  sortOrder: TicketSortOrder,
): Array<Record<string, TicketSortOrder>> {
  return [
    { [sortBy]: sortOrder },
    { id: sortOrder },
  ];
}
