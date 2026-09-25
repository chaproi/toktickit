import { describe, expect, it } from "vitest";
import * as ticketQuery from "../../src/tickets/ticket-query.js";

type StaffQueueQuery = {
  search: string;
  categoryId: number | null;
  relatedSystemId: number | null;
  requestedPriority: string | null;
  itPriority: string | null;
  currentStatus: string | null;
  owner: null | "unassigned" | "me" | number;
  sortBy: string;
  sortOrder: "asc" | "desc";
  page: number;
  pageSize: 10 | 25 | 50;
};

type QueueComparable = {
  id: number;
  ticketNumber: string;
  ticketDate: Date;
  updatedAt: Date;
  requestedPriority: string;
  itPriority: string;
  currentStatus: string;
};

function parse(query: Record<string, unknown>) {
  const implementation = (ticketQuery as unknown as {
    parseStaffQueueQuery?: (input: Record<string, unknown>) =>
      | { success: true; data: StaffQueueQuery }
      | { success: false; fields: Record<string, string> };
  }).parseStaffQueueQuery;
  if (!implementation) {
    throw new Error("Issue #31 staff queue query parsing is not implemented.");
  }
  return implementation(query);
}

function compare(
  left: QueueComparable,
  right: QueueComparable,
  sortBy: StaffQueueQuery["sortBy"],
  sortOrder: StaffQueueQuery["sortOrder"],
) {
  const implementation = (ticketQuery as unknown as {
    compareStaffQueueTickets?: (
      first: QueueComparable,
      second: QueueComparable,
      field: StaffQueueQuery["sortBy"],
      order: StaffQueueQuery["sortOrder"],
    ) => number;
  }).compareStaffQueueTickets;
  if (!implementation) {
    throw new Error("Issue #31 staff queue business ordering is not implemented.");
  }
  return implementation(left, right, sortBy, sortOrder);
}

function escapeLikePattern(value: string): string {
  const implementation = (ticketQuery as unknown as {
    escapePostgresLikePattern?: (input: string) => string;
  }).escapePostgresLikePattern;
  if (!implementation) {
    throw new Error("Issue #31 literal Queue search escaping is not implemented.");
  }
  return implementation(value);
}

const baseTicket = {
  id: 1,
  ticketNumber: "TKT-2026-00001",
  ticketDate: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  requestedPriority: "LOW",
  itPriority: "LOW",
  currentStatus: "NEW",
};

describe("UNIT-04 Staff Queue query contract", () => {
  it.each([
    ["literal percent", "100% complete", "100\\% complete"],
    ["literal underscore", "queue_item", "queue\\_item"],
    ["literal backslash", "queue\\path", "queue\\\\path"],
    ["combined special characters", "50%_C:\\temp", "50\\%\\_C:\\\\temp"],
    ["ordinary Unicode search text", "Café request ทดสอบ", "Café request ทดสอบ"],
  ])("escapes PostgreSQL LIKE pattern characters for %s", (_case, input, expected) => {
    expect(escapeLikePattern(input)).toBe(expected);
  });

  it("applies the exact defaults", () => {
    expect(parse({})).toEqual({
      success: true,
      data: {
        search: "",
        categoryId: null,
        relatedSystemId: null,
        requestedPriority: null,
        itPriority: null,
        currentStatus: null,
        owner: null,
        sortBy: "updatedAt",
        sortOrder: "desc",
        page: 1,
        pageSize: 10,
      },
    });
  });

  it("accepts every filter, owner form, sort field, direction, and page size", () => {
    const full = parse({
      search: "  requester@example.test  ",
      categoryId: "12",
      relatedSystemId: "34",
      requestedPriority: "URGENT",
      itPriority: "HIGH",
      currentStatus: "WAITING_FOR_REQUESTER",
      owner: "56",
      sortBy: "currentStatus",
      sortOrder: "asc",
      page: "7",
      pageSize: "50",
    });
    expect(full).toEqual({
      success: true,
      data: {
        search: "requester@example.test",
        categoryId: 12,
        relatedSystemId: 34,
        requestedPriority: "URGENT",
        itPriority: "HIGH",
        currentStatus: "WAITING_FOR_REQUESTER",
        owner: 56,
        sortBy: "currentStatus",
        sortOrder: "asc",
        page: 7,
        pageSize: 50,
      },
    });

    for (const owner of ["unassigned", "me"]) {
      expect(parse({ owner })).toMatchObject({ success: true, data: { owner } });
    }
    for (const sortBy of [
      "ticketNumber",
      "ticketDate",
      "updatedAt",
      "requestedPriority",
      "itPriority",
      "currentStatus",
    ]) {
      expect(parse({ sortBy })).toMatchObject({ success: true, data: { sortBy } });
    }
    for (const pageSize of ["10", "25", "50"]) {
      expect(parse({ pageSize })).toMatchObject({
        success: true,
        data: { pageSize: Number(pageSize) },
      });
    }
  });

  it.each([
    ["unknown parameter", { unexpected: "value" }],
    ["repeated parameter", { page: ["1", "2"] }],
    ["oversized search", { search: "x".repeat(101) }],
    ["zero identifier", { categoryId: "0" }],
    ["oversized identifier", { relatedSystemId: "2147483648" }],
    ["invalid requested priority", { requestedPriority: "CRITICAL" }],
    ["invalid IT priority", { itPriority: "CRITICAL" }],
    ["invalid status", { currentStatus: "ASSIGNED" }],
    ["unsupported owner", { owner: "requester" }],
    ["zero owner", { owner: "0" }],
    ["unsupported sort", { sortBy: "summary" }],
    ["invalid direction", { sortOrder: "sideways" }],
    ["invalid page", { page: "1.5" }],
    ["unsupported page size", { pageSize: "20" }],
  ])("rejects %s", (_label, query) => {
    const result = parse(query);
    expect(result.success).toBe(false);
    if (!result.success) expect(Object.keys(result.fields).length).toBeGreaterThan(0);
  });

  it("uses LOW-to-URGENT priority order and the approved eight-status order", () => {
    const priorities = ["URGENT", "MEDIUM", "LOW", "HIGH"].map((priority, index) => ({
      ...baseTicket,
      id: index + 1,
      requestedPriority: priority,
      itPriority: priority,
    }));
    expect([...priorities].sort((a, b) => compare(a, b, "requestedPriority", "asc"))
      .map(({ requestedPriority }) => requestedPriority))
      .toEqual(["LOW", "MEDIUM", "HIGH", "URGENT"]);
    expect([...priorities].sort((a, b) => compare(a, b, "itPriority", "desc"))
      .map(({ itPriority }) => itPriority))
      .toEqual(["URGENT", "HIGH", "MEDIUM", "LOW"]);

    const approved = [
      "NEW",
      "OPEN",
      "IN_PROGRESS",
      "WAITING_FOR_REQUESTER",
      "REOPENED",
      "RESOLVED",
      "CLOSED",
      "CANCELLED",
    ];
    const statuses = [...approved].reverse().map((currentStatus, index) => ({
      ...baseTicket,
      id: index + 1,
      currentStatus,
    }));
    expect([...statuses].sort((a, b) => compare(a, b, "currentStatus", "asc"))
      .map(({ currentStatus }) => currentStatus))
      .toEqual(approved);
  });

  it("uses the Ticket id as the same-direction stable tie-breaker for every sort", () => {
    for (const sortBy of [
      "ticketNumber",
      "ticketDate",
      "updatedAt",
      "requestedPriority",
      "itPriority",
      "currentStatus",
    ]) {
      const lower = { ...baseTicket, id: 10 };
      const higher = { ...baseTicket, id: 20 };
      expect(compare(lower, higher, sortBy, "asc")).toBeLessThan(0);
      expect(compare(lower, higher, sortBy, "desc")).toBeGreaterThan(0);
    }
  });
});
