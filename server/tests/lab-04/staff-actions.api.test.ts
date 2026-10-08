import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TicketStatus } from "@prisma/client";
import { LITERAL, MISSING_ID, assertSafeEqual, assertSafeError } from "./action-read-test-fixtures.js";
import { BEFORE, FROM, StaffActionFixtures } from "./staff-action-test-fixtures.js";

// API-07 / BR-46 / partial AC-44,T-54. Related partial AC-01/03/24/27/34,
// T-01/03/24/27/34. UI navigation, Dashboard equivalence and E2E remain Planned.
const fixtures = new StaffActionFixtures();
beforeAll(() => fixtures.initialize());
afterAll(() => fixtures.cleanup());
const encode = (values: Record<string, string | number>) => new URLSearchParams(
  Object.entries(values).map(([name, value]) => [name, String(value)]),
).toString();
const byParentStates = (states: readonly TicketStatus[]) => fixtures.assigned().filter((action) =>
  states.includes([...fixtures.parents.values()].find((parent) => parent.id === action.ticketId)!.currentStatus));

describe("API-07 current-user assignment, projection and pagination", () => {
  it.each(["staff", "admin"] as const)("active %s gets only its assignments with default page 1/10", async (role) => {
    const actor = fixtures[role];
    await fixtures.success("", fixtures.assigned(actor), actor, 1, 10);
  });
  it.each(["staff", "admin"] as const)("%s explicit assignee=me is equivalent to omission", async (role) => {
    const actor = fixtures[role];
    const implicit = await fixtures.success("", fixtures.assigned(actor), actor, 1, 10);
    const explicit = await fixtures.success("assignee=me", fixtures.assigned(actor), actor, 1, 10);
    assertSafeEqual(explicit.body, implicit.body, "Default and explicit actor-derived assignment are equivalent");
  });
  it("assignment differs from creator, performer and Ticket owner; none grants extra rows", async () => {
    const excluded = fixtures.rows(["other-assignee-only"], fixtures.read.who("creator"))[0];
    expect(excluded.createdById).toBe(fixtures.staff.user.id);
    expect(excluded.performedById).toBe(fixtures.staff.user.id);
    expect(fixtures.parents.get("other-assignee-only")!.ownerId).toBe(fixtures.staff.user.id);
    expect(excluded.assigneeId === fixtures.staff.user.id).toBe(false);
    const response = await fixtures.success("owner=me&pageSize=50", fixtures.rows(["mine"]));
    expect(response.body.items.some((row: { action: { id: number } }) => row.action.id === excluded.id)).toBe(false);
  });
  it("returns exact safe literal parent/Action DTOs, including retained inactive performer identity", async () => {
    const parent = fixtures.parents.get("projection")!;
    const completed = fixtures.rows(["projection"]).find((action) => action.status === "COMPLETED")!;
    expect(new Set([parent.ownerId, completed.createdById, completed.assigneeId, completed.performedById]).size).toBe(4);
    const response = await fixtures.success(encode({ search: parent.ticketNumber, pageSize: 50 }), fixtures.rows(["projection"]));
    expect(response.body.items).toHaveLength(4);
    for (const row of response.body.items) {
      expect(row.ticket.summary).toBe(LITERAL);
      expect(row.action.description).toBe(LITERAL);
      expect(row.action.followUpNote).toBe(`${LITERAL} follow-up`);
      expect(row.action.attachmentNotes).toBe(`${LITERAL} file is text only`);
      expect(row.action.performedBy).toEqual(row.action.status === "COMPLETED" ? fixtures.read.who("historical").user : null);
    }
  });
  it.each([10, 25, 50])("pageSize %i obeys createdAt ASC,id ASC ties with exact totals and no page duplicates", async (pageSize) => {
    const all = fixtures.assigned(), sorted = fixtures.sorted(all);
    expect(all.length).toBeGreaterThan(50);
    expect(sorted.some((row, index) => index > 0 && row.createdAt.getTime() === sorted[index - 1].createdAt.getTime())).toBe(true);
    const ids: number[] = [];
    for (let page = 1; page <= Math.ceil(all.length / pageSize); page++) {
      const response = await fixtures.success(encode({ page, pageSize }), all, fixtures.staff, page, pageSize);
      ids.push(...response.body.items.map((row: { action: { id: number } }) => row.action.id));
    }
    expect(ids).toEqual(sorted.map((action) => action.id));
    expect(new Set(ids).size).toBe(all.length);
  });
  it("actor with zero assigned Actions has exact zero pagination", async () => {
    await fixtures.success("", [], fixtures.read.who("empty"), 1, 10);
  });
  it("beyond-final page stays requested and empty; API does not perform UI correction", async () => {
    await fixtures.success("page=999&pageSize=25", fixtures.assigned(), fixtures.staff, 999, 25);
  });
  it("valid unmatched reference yields empty results rather than a failure", async () => {
    await fixtures.success(encode({ categoryId: MISSING_ID, pageSize: 50 }), []);
  });
});

describe("API-07 Action predicates AND Staff parent filters", () => {
  it.each(["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const)("filters exactly Action status %s", async (status) => {
    await fixtures.success(encode({ status, pageSize: 50 }), fixtures.assigned().filter((action) => action.status === status));
  });
  it("unfinished means only PLANNED/IN_PROGRESS", async () => {
    await fixtures.success("actionStatusGroup=unfinished&pageSize=50", fixtures.assigned().filter((action) =>
      action.status === "PLANNED" || action.status === "IN_PROGRESS"));
  });
  it.each(["IN_PROGRESS", "COMPLETED"] as const)("status %s intersects unfinished, including contradictory zero", async (status) => {
    await fixtures.success(encode({ status, actionStatusGroup: "unfinished", pageSize: 50 }),
      status === "COMPLETED" ? [] : fixtures.assigned().filter((action) => action.status === "IN_PROGRESS"));
  });
  it.each(["categoryId", "relatedSystemId", "requestedPriority", "itPriority"] as const)("parent %s intersects assignment", async (field) => {
    const value = field === "categoryId" ? fixtures.categories[1] : field === "relatedSystemId" ? fixtures.systems[1] : field === "requestedPriority" ? "URGENT" : "HIGH";
    const keys = field === "categoryId" ? ["category-other", "resolved-repeated"] : field === "relatedSystemId" ? ["system-other", "resolved-repeated"] : ["resolved-repeated"];
    await fixtures.success(encode({ [field]: value, pageSize: 50 }), fixtures.rows(keys));
  });
  it.each(["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED", "RESOLVED", "CLOSED", "CANCELLED"] as const)(
    "parent currentStatus %s uses the Ticket enum", async (currentStatus) => {
      await fixtures.success(encode({ currentStatus, pageSize: 50 }), byParentStates([currentStatus]));
    },
  );
  it("currentStatus=OPEN and status=COMPLETED refer to separate records", async () => {
    await fixtures.success("currentStatus=OPEN&status=COMPLETED&pageSize=50", byParentStates(["OPEN"]).filter((action) => action.status === "COMPLETED"));
  });
  it.each([
    { group: "active", states: ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED", "RESOLVED"] },
    { group: "outstanding", states: ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"] },
    { group: "resolved", states: ["RESOLVED", "CLOSED"] },
  ] as Array<{ group: string; states: TicketStatus[] }>)("parent statusGroup=$group uses its complete approved set", async ({ group, states }) => {
    await fixtures.success(encode({ statusGroup: group, pageSize: 50 }), byParentStates(states));
  });
  it("Ticket currentStatus/statusGroup contradiction returns zero", async () => {
    await fixtures.success("currentStatus=OPEN&statusGroup=resolved&pageSize=50", []);
  });
  it.each(["me", "unassigned", "numeric-owner"])("owner %s intersects assignment rather than replacing it", async (owner) => {
    const expected = owner === "me" ? fixtures.rows(["mine"]) : owner === "unassigned" ? fixtures.rows(["unassigned"]) :
      fixtures.assigned().filter((action) => [...fixtures.parents.values()].find((parent) => parent.id === action.ticketId)!.ownerId === fixtures.owner.user.id);
    await fixtures.success(encode({ owner: owner === "numeric-owner" ? fixtures.owner.user.id : owner, pageSize: 50 }), expected);
  });
  it("Administrator owner=me uses Ticket ownership rather than its other assignments", async () => {
    await fixtures.success("owner=me&pageSize=50", fixtures.rows(["admin-owned"], fixtures.admin), fixtures.admin);
  });
  it("all parent predicates, date pairs and Action status intersect without another-assignee leak", async () => {
    const filters = { assignee: "me", status: "COMPLETED", search: "ResolvedIntersectionNeedle", categoryId: fixtures.categories[1],
      relatedSystemId: fixtures.systems[1], requestedPriority: "URGENT", itPriority: "HIGH", currentStatus: "RESOLVED",
      owner: fixtures.owner.user.id, statusGroup: "resolved", updatedFrom: BEFORE, updatedBefore: "2026-10-08T00:00:00.000Z",
      resolvedFrom: FROM, resolvedBefore: BEFORE, pageSize: 50 };
    await fixtures.success(encode(filters), fixtures.rows(["resolved-repeated"]));
    await fixtures.success(encode({ ...filters, owner: "me" }), []);
  });
});

describe("API-07 inherited search and half-open date filters", () => {
  it.each(["number", "summary", "requester-name", "requester-email"])("Staff search includes %s, trims and ignores case", async (field) => {
    const search = field === "number" ? fixtures.parents.get("search-summary")!.ticketNumber : field === "summary" ? "uniqueneedlesummary" :
      field === "requester-name" ? fixtures.searchName : fixtures.searchEmail;
    await fixtures.success(encode({ search: `  ${search.toUpperCase()}  `, pageSize: 50 }), fixtures.rows([field.startsWith("requester") ? "search-requester" : "search-summary"]));
  });
  it.each([["%", "literal-percent"], ["_", "literal-underscore"], ["\\", "literal-backslash"]])("search %s is literal, never a wildcard", async (search, key) => {
    await fixtures.success(encode({ search, pageSize: 50 }), fixtures.rows([key]));
  });
  it("accepts the trimmed 100-character search boundary", async () => {
    await fixtures.success(encode({ search: `  ${"S".repeat(100)}  `, pageSize: 50 }), fixtures.rows(["search-boundary"]));
  });
  it("blank search retains every actor assignment", async () => {
    await fixtures.success(encode({ search: " \t ", pageSize: 50 }), fixtures.assigned());
  });
  it("updated pair includes from and inside, excludes earlier and exact before", async () => {
    await fixtures.success(encode({ updatedFrom: FROM, updatedBefore: BEFORE, pageSize: 50 }), fixtures.rows(["updated-from", "updated-inside"]));
  });
  it("resolved pair uses current RESOLVED/CLOSED with qualifying history, never legacy fallback or duplicate Action rows", async () => {
    const expected = fixtures.rows(["resolved-repeated", "resolved-from"]);
    expect(expected).toHaveLength(3); // Two Actions on one repeated-resolution Ticket, one on the Closed Ticket.
    const response = await fixtures.success(encode({ resolvedFrom: FROM, resolvedBefore: BEFORE, pageSize: 50 }), expected);
    expect(new Set(response.body.items.map((row: { action: { id: number } }) => row.action.id)).size).toBe(3);
  });
  it("narrowed resolved bounds retain the latest qualifying event and current-state guard", async () => {
    await fixtures.success(encode({ resolvedFrom: "2026-10-06T13:00:00.000Z", resolvedBefore: "2026-10-06T15:00:00.000Z", pageSize: 50 }), fixtures.rows(["resolved-repeated"]));
  });
  it("updated and resolved windows cap future observations at the server snapshot", async () => {
    const updated = fixtures.rows(["updated-from", "updated-inside", "updated-before", "resolved-repeated", "resolved-from",
      "resolved-earlier", "resolved-before", "resolved-missing", "resolved-reopened"]);
    await fixtures.success(encode({ updatedFrom: FROM, updatedBefore: "2099-01-02T00:00:00.000Z", pageSize: 50 }), updated);
    await fixtures.success(encode({ resolvedFrom: FROM, resolvedBefore: "2099-01-02T00:00:00.000Z", pageSize: 50 }),
      fixtures.rows(["resolved-repeated", "resolved-from", "resolved-before"]));
  });
});

describe("API-07 inherited authorization before protected access", () => {
  it.each(["valid", "invalid-query"])("Requester is ROLE_FORBIDDEN with %s parameters", async (kind) => {
    const response = await fixtures.get(kind === "valid" ? "" : "assignee=someone-else&categoryId=bad", fixtures.read.who("requester"));
    assertSafeError(response, 403, "ROLE_FORBIDDEN");
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body).not.toHaveProperty("items");
  });
  it.each(["missing", "absolute-expired", "idle-expired", "revoked", "inactive", "forced-change"])("preserves %s session denial", async (state) => {
    const actor = state === "missing" ? null : await fixtures.read.actor(`staff-actions-${state}`, "IT_STAFF");
    if (actor) {
      if (state === "absolute-expired") await fixtures.prisma.authSession.updateMany({ where: { userId: actor.user.id }, data: { expiresAt: new Date("2000-01-01T00:00:00.000Z") } });
      if (state === "idle-expired") await fixtures.prisma.authSession.updateMany({ where: { userId: actor.user.id }, data: { lastSeenAt: new Date("2000-01-01T00:00:00.000Z") } });
      if (state === "revoked") await fixtures.prisma.authSession.deleteMany({ where: { userId: actor.user.id } });
      if (state === "inactive") await fixtures.prisma.user.update({ where: { id: actor.user.id }, data: { isActive: false } });
      if (state === "forced-change") await fixtures.prisma.user.update({ where: { id: actor.user.id }, data: { mustChangePassword: true } });
    }
    const response = await fixtures.get("", actor);
    assertSafeError(response, state === "forced-change" ? 403 : 401, state === "forced-change" ? "PASSWORD_CHANGE_REQUIRED" : "AUTHENTICATION_REQUIRED");
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });
});

describe("API-07 safe query failures (partial AC-34/T-34)", () => {
  it.each([
    ["assignee=all", "assignee"], ["assignee=1", "assignee"], ["assignee=", "assignee"], ["assigneeId=1", "assigneeId"],
    ["actionStatusGroup=active", "actionStatusGroup"], ["status=OPEN", "status"], ["currentStatus=PLANNED", "currentStatus"],
    ["requestedPriority=CRITICAL", "requestedPriority"], ["itPriority=critical", "itPriority"], ["statusGroup=terminal", "statusGroup"],
    ["categoryId=0", "categoryId"], ["categoryId=2147483648", "categoryId"], ["relatedSystemId=1.5", "relatedSystemId"], ["owner=-1", "owner"],
    ["owner=2147483648", "owner"], ["page=0", "page"], ["page=1.5", "page"], ["page=9007199254740992", "page"], ["pageSize=20", "pageSize"],
    ["sortBy=createdAt", "sortBy"], ["sortOrder=asc", "sortOrder"], ["dashboardWidget=mine", "dashboardWidget"], ["widgetStatus=OPEN", "widgetStatus"],
    ["actorId=1", "actorId"], ["unexpected=true", "unexpected"], ["asOf=2026-10-06T00:00:00.000Z", "asOf"],
    ["assignee=me&assignee=me", "assignee"], ["status=PLANNED&status=IN_PROGRESS", "status"], ["search=a&search=b", "search"],
    ["pageSize=10&pageSize=25", "pageSize"], ["owner[selector]=me", "owner"],
    ["updatedFrom=2026-10-06T00:00:00.000Z", "updatedFrom|updatedBefore"], ["updatedBefore=2026-10-07T00:00:00.000Z", "updatedFrom|updatedBefore"],
    ["resolvedFrom=2026-10-06T00:00:00.000Z", "resolvedFrom|resolvedBefore"], ["resolvedBefore=2026-10-07T00:00:00.000Z", "resolvedFrom|resolvedBefore"],
    ["updatedFrom=2026-10-06T00:00:00.000Z&updatedBefore=2026-10-06T00:00:00.000Z", "updatedFrom|updatedBefore"],
    ["resolvedFrom=2026-10-07T00:00:00.000Z&resolvedBefore=2026-10-06T00:00:00.000Z", "resolvedFrom|resolvedBefore"],
    ["updatedFrom=2026-10-06T00:00:00Z&updatedBefore=2026-10-07T00:00:00.000Z", "updatedFrom"],
    ["resolvedFrom=2026-10-06T00:00:00.000%2B00:00&resolvedBefore=2026-10-07T00:00:00.000Z", "resolvedFrom"],
    ["updatedFrom=2026-02-30T00:00:00.000Z&updatedBefore=2026-03-02T00:00:00.000Z", "updatedFrom"],
    ["resolvedFrom=2026-10-06&resolvedBefore=2026-10-07T00:00:00.000Z", "resolvedFrom"],
    ["updatedFrom=2026-10-06T00:00:00.000Z&updatedFrom=2026-10-06T01:00:00.000Z&updatedBefore=2026-10-07T00:00:00.000Z", "updatedFrom"],
  ])("rejects %s with safe INVALID_QUERY and field error", async (query, field) => {
    const response = await fixtures.get(query);
    assertSafeError(response, 400, "INVALID_QUERY");
    // The contract does not choose one field for a cross-field date-pair error.
    expect(field.split("|").some((name) => typeof response.body.error.fields[name] === "string")).toBe(true);
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });
  it.each(["other-actor", "overlong-search"])("rejects %s independently with a safe field error", async (kind) => {
    const field = kind === "other-actor" ? "assignee" : "search";
    const query = kind === "other-actor" ? encode({ assignee: fixtures.admin.user.id }) : encode({ search: "S".repeat(101) });
    const response = await fixtures.get(query);
    assertSafeError(response, 400, "INVALID_QUERY");
    expect(typeof response.body.error.fields[field]).toBe("string");
  });
});
