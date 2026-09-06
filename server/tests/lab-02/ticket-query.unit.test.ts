import { describe, expect, it, vi } from "vitest";

type SortField =
  | "ticketNumber"
  | "ticketDate"
  | "updatedAt"
  | "summary"
  | "requestedPriority";

type SortOrder = "asc" | "desc";

type TicketListQuery = {
  search: string;
  categoryId: number | null;
  relatedSystemId: number | null;
  requestedPriority:
    | "LOW"
    | "MEDIUM"
    | "HIGH"
    | "URGENT"
    | null;
  currentStatus:
    | "NEW"
    | "ASSIGNED"
    | "IN_PROGRESS"
    | "PENDING_REQUESTER"
    | "RESOLVED"
    | "CLOSED"
    | "CANCELLED"
    | null;
  sortBy: SortField;
  sortOrder: SortOrder;
  page: number;
  pageSize: 10 | 25 | 50;
};

type TicketQueryResult =
  | {
      success: true;
      data: TicketListQuery;
    }
  | {
      success: false;
      fields: Record<string, string>;
    };

type TicketQueryModule = {
  parseTicketListQuery(
    query: Record<string, unknown>,
  ): TicketQueryResult;
  buildTicketListOrderBy(
    sortBy: SortField,
    sortOrder: SortOrder,
  ): Array<Record<string, SortOrder>>;
  REQUESTED_PRIORITY_SEVERITY: readonly string[];
};

async function loadTicketQueryModule(): Promise<TicketQueryModule> {
  return vi.importActual<TicketQueryModule>(
    "../../src/tickets/ticket-query.js",
  );
}

function expectSuccess(
  result: TicketQueryResult,
): asserts result is Extract<
  TicketQueryResult,
  { success: true }
> {
  expect(result.success).toBe(true);
}

function expectFailure(
  result: TicketQueryResult,
): asserts result is Extract<
  TicketQueryResult,
  { success: false }
> {
  expect(result.success).toBe(false);
}

describe("Ticket-list query parsing", () => {
  it("UNIT-04 applies the approved default query and ordering", async () => {
    const {
      parseTicketListQuery,
      buildTicketListOrderBy,
    } = await loadTicketQueryModule();

    const result = parseTicketListQuery({});

    expectSuccess(result);
    expect(result.data).toEqual({
      search: "",
      categoryId: null,
      relatedSystemId: null,
      requestedPriority: null,
      currentStatus: null,
      sortBy: "updatedAt",
      sortOrder: "desc",
      page: 1,
      pageSize: 10,
    });
    expect(
      buildTicketListOrderBy(
        result.data.sortBy,
        result.data.sortOrder,
      ),
    ).toEqual([{ updatedAt: "desc" }, { id: "desc" }]);
  });

  it("UNIT-04 trims search and enforces its 100-character maximum", async () => {
    const { parseTicketListQuery } =
      await loadTicketQueryModule();

    const accepted = parseTicketListQuery({
      search: `  ${"a".repeat(100)}  `,
    });

    expectSuccess(accepted);
    expect(accepted.data.search).toBe("a".repeat(100));

    const rejected = parseTicketListQuery({
      search: "a".repeat(101),
    });

    expectFailure(rejected);
    expect(rejected.fields).toHaveProperty("search");
  });

  it("UNIT-04 accepts every approved filter", async () => {
    const { parseTicketListQuery } =
      await loadTicketQueryModule();

    const result = parseTicketListQuery({
      categoryId: "17",
      relatedSystemId: "23",
      requestedPriority: "URGENT",
      currentStatus: "PENDING_REQUESTER",
    });

    expectSuccess(result);
    expect(result.data).toMatchObject({
      categoryId: 17,
      relatedSystemId: 23,
      requestedPriority: "URGENT",
      currentStatus: "PENDING_REQUESTER",
    });
  });

  it("UNIT-04 accepts every sort field and direction with same-direction id ordering", async () => {
    const {
      parseTicketListQuery,
      buildTicketListOrderBy,
    } = await loadTicketQueryModule();

    const sortFields: SortField[] = [
      "ticketNumber",
      "ticketDate",
      "updatedAt",
      "summary",
      "requestedPriority",
    ];
    const sortOrders: SortOrder[] = ["asc", "desc"];

    for (const sortBy of sortFields) {
      for (const sortOrder of sortOrders) {
        const result = parseTicketListQuery({
          sortBy,
          sortOrder,
        });

        expectSuccess(result);
        expect(result.data.sortBy).toBe(sortBy);
        expect(result.data.sortOrder).toBe(sortOrder);
        expect(
          buildTicketListOrderBy(sortBy, sortOrder),
        ).toEqual([
          { [sortBy]: sortOrder },
          { id: sortOrder },
        ]);
      }
    }
  });

  it("UNIT-04 accepts one-based pages and only page sizes 10, 25, and 50", async () => {
    const { parseTicketListQuery } =
      await loadTicketQueryModule();

    for (const [page, pageSize] of [
      [1, 10],
      [2, 25],
      [99, 50],
    ] as const) {
      const result = parseTicketListQuery({
        page: String(page),
        pageSize: String(pageSize),
      });

      expectSuccess(result);
      expect(result.data.page).toBe(page);
      expect(result.data.pageSize).toBe(pageSize);
    }
  });

  it("UNIT-04 rejects invalid enums, malformed integers, pages below 1, and unsupported page sizes", async () => {
    const { parseTicketListQuery } =
      await loadTicketQueryModule();

    const invalidQueries: Array<
      [Record<string, unknown>, string]
    > = [
      [{ categoryId: "abc" }, "categoryId"],
      [{ categoryId: "1.5" }, "categoryId"],
      [{ relatedSystemId: "-1" }, "relatedSystemId"],
      [{ requestedPriority: "CRITICAL" }, "requestedPriority"],
      [{ currentStatus: "UNKNOWN" }, "currentStatus"],
      [{ sortBy: "requester" }, "sortBy"],
      [{ sortOrder: "sideways" }, "sortOrder"],
      [{ page: "0" }, "page"],
      [{ page: "1.5" }, "page"],
      [{ pageSize: "20" }, "pageSize"],
    ];

    for (const [query, field] of invalidQueries) {
      const result = parseTicketListQuery(query);

      expectFailure(result);
      expect(result.fields).toHaveProperty(field);
    }
  });

  it("UNIT-04 rejects unknown and repeated query parameters", async () => {
    const { parseTicketListQuery } =
      await loadTicketQueryModule();

    const unknown = parseTicketListQuery({
      requesterId: "1",
    });

    expectFailure(unknown);
    expect(unknown.fields).toHaveProperty("requesterId");

    for (const [field, query] of [
      ["page", { page: ["1", "2"] }],
      ["search", { search: ["alpha", "beta"] }],
    ] as const) {
      const result = parseTicketListQuery(query);

      expectFailure(result);
      expect(result.fields).toHaveProperty(field);
    }
  });

  it("UNIT-04 defines the approved Requested Priority severity order", async () => {
    const {
      REQUESTED_PRIORITY_SEVERITY,
      buildTicketListOrderBy,
    } = await loadTicketQueryModule();

    expect(REQUESTED_PRIORITY_SEVERITY).toEqual([
      "LOW",
      "MEDIUM",
      "HIGH",
      "URGENT",
    ]);
    expect(
      buildTicketListOrderBy(
        "requestedPriority",
        "asc",
      ),
    ).toEqual([
      { requestedPriority: "asc" },
      { id: "asc" },
    ]);
    expect(
      buildTicketListOrderBy(
        "requestedPriority",
        "desc",
      ),
    ).toEqual([
      { requestedPriority: "desc" },
      { id: "desc" },
    ]);
  });
});
