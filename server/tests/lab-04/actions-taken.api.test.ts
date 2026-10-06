import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ActionReadFixtures, LITERAL, PRIVATE_NOTE, assertSafeEqual, assertSafeError, pagination,
} from "./action-read-test-fixtures.js";

const fixtures = new ActionReadFixtures();
beforeAll(() => fixtures.initialize());
afterAll(() => fixtures.cleanup());

describe("API-01/02 read contract (partial AC-02/03/06/12/34; T-02/03/06/12/34)", () => {
  it("defaults to page 1/20 with exact safe ActionDTOs and createdAt ASC,id ASC", async () => {
    const response = await fixtures.get(fixtures.path("list"), fixtures.who("requester"));
    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual(["items", "pagination"]);
    const expected = fixtures.sortedActions();
    expect(expected.length).toBeGreaterThan(50);
    expect(expected.some((action, index) => index > 0 && action.createdAt.getTime() === expected[index - 1].createdAt.getTime())).toBe(true);
    expect(response.body.pagination).toEqual(pagination(1, 20, expected.length));
    expect(response.body.items).toHaveLength(20);
    response.body.items.forEach((item: Record<string, unknown>, index: number) => fixtures.assertDTO(item, expected[index]));
  });

  it.each([20, 50, 100])("supports pageSize %i and stable page boundaries without duplicate/missing rows", async (pageSize) => {
    const expected = fixtures.sortedActions();
    const observed: number[] = [];
    for (let page = 1; page <= Math.ceil(expected.length / pageSize); page += 1) {
      const response = await fixtures.get(`${fixtures.path("list")}?page=${page}&pageSize=${pageSize}`, fixtures.who("coordinator"));
      expect(response.status).toBe(200);
      expect(response.body.pagination).toEqual(pagination(page, pageSize, expected.length));
      const slice = expected.slice((page - 1) * pageSize, page * pageSize);
      expect(response.body.items.map((item: { id: number }) => item.id)).toEqual(slice.map((action) => action.id));
      response.body.items.forEach((item: Record<string, unknown>, index: number) => fixtures.assertDTO(item, slice[index]));
      observed.push(...response.body.items.map((item: { id: number }) => item.id));
    }
    expect(observed).toEqual(expected.map((action) => action.id));
    expect(new Set(observed).size).toBe(expected.length);
  });

  it.each(["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const)("filters exactly %s", async (status) => {
    const response = await fixtures.get(`${fixtures.path("list")}?status=${status}&pageSize=100`, fixtures.who("requester"));
    expect(response.status).toBe(200);
    const expected = fixtures.sortedActions(fixtures.mainTicket.id, status);
    expect(response.body.pagination).toEqual(pagination(1, 100, expected.length));
    expect(response.body.items.map((item: { id: number }) => item.id)).toEqual(expected.map((action) => action.id));
    response.body.items.forEach((item: Record<string, unknown>, index: number) => fixtures.assertDTO(item, expected[index]));
  });

  it("returns numeric-zero empty pagination for a legacy/empty Ticket", async () => {
    const response = await fixtures.get(fixtures.path("list", fixtures.emptyTicket.id), fixtures.who("requester"));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [], pagination: pagination(1, 20, 0) });
  });

  it("returns an empty beyond-final page while preserving the requested page and total", async () => {
    const response = await fixtures.get(`${fixtures.path("list")}?page=9`, fixtures.who("requester"));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [], pagination: pagination(9, 20, fixtures.sortedActions().length) });
  });

  it.each(["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const)("detail exposes exact %s attribution, nullable fields and parent token", async (status) => {
    const action = status === "COMPLETED" ? fixtures.completed : status === "CANCELLED" ? fixtures.cancelled : fixtures.sortedActions(fixtures.mainTicket.id, status)[0];
    const response = await fixtures.get(fixtures.path("detail", action.ticketId, action.id), fixtures.who("requester"));
    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual(["action", "ticketUpdatedAt"]);
    expect(response.body.ticketUpdatedAt).toBe("2026-10-04T03:00:00.000Z");
    fixtures.assertDTO(response.body.action, action);
    if (status === "COMPLETED") {
      expect(new Set([fixtures.mainTicket.ownerId, action.createdById, action.assigneeId, action.performedById]).size).toBe(4);
      expect(response.body.action.performedBy).toEqual(fixtures.who("completer").user);
    } else expect(response.body.action.performedBy).toBeNull();
    expect(response.body.action.description.includes(LITERAL)).toBe(true);
    expect(response.body.action.attachmentNotes).toBe(`${LITERAL} file is text only`);
    expect(JSON.stringify(response.body).includes(PRIVATE_NOTE)).toBe(false);
    expect(/passwordHash|tokenHash|csrf|email|isActive|mustChangePassword|internalNotes|safeResponse|inputFingerprint|clientMutationId|storageKey/u.test(JSON.stringify(response.body))).toBe(false);
  });

  it("retains inactive historical assignee/performer identities and changed creator roles", async () => {
    const response = await fixtures.get(fixtures.path("detail", fixtures.historical.ticketId, fixtures.historical.id), fixtures.who("requester"));
    expect(response.status).toBe(200);
    fixtures.assertDTO(response.body.action, fixtures.historical);
    expect(response.body.action.assignee).toEqual(fixtures.who("historical").user);
    expect(response.body.action.performedBy).toEqual(fixtures.who("historical").user);
    expect(response.body.action.createdBy).toEqual(fixtures.who("creator").user);
  });

  it.each([
    ["page=0", "page"], ["page=1.5", "page"], ["pageSize=10", "pageSize"], ["pageSize=101", "pageSize"],
    ["status=UNKNOWN", "status"], ["unexpected=true", "unexpected"], ["page=1&page=2", "page"],
    ["pageSize=20&pageSize=50", "pageSize"], ["status=PLANNED&status=COMPLETED", "status"],
    ["assigneeId=1", "assigneeId"], ["sortBy=updatedAt", "sortBy"],
  ])("rejects invalid/unknown/repeated list query %s", async (query, field) => {
    const response = await fixtures.get(`${fixtures.path("list")}?${query}`, fixtures.who("requester"));
    assertSafeError(response, 400, "INVALID_QUERY");
    expect(typeof response.body.error.fields[field]).toBe("string");
  });

  it.each(["status=PLANNED", "unexpected=true", "page=1&page=2"])("detail rejects unsupported query %s", async (query) => {
    const response = await fixtures.get(`${fixtures.path("detail")}?${query}`, fixtures.who("coordinator"));
    assertSafeError(response, 400, "INVALID_QUERY");
  });

  it.each(["0", "-1", "1.5", "not-a-number", "9007199254740992"])("rejects malformed Ticket path ID %s", async (id) => {
    const response = await fixtures.get(`/api/tickets/${id}/actions`, fixtures.who("requester"));
    assertSafeError(response, 400, "INVALID_TICKET_ID");
  });

  it.each(["0", "-1", "1.5", "not-a-number", "9007199254740992"])("rejects malformed Action path ID %s with a safe 400", async (id) => {
    const response = await fixtures.get(`/api/tickets/${fixtures.mainTicket.id}/actions/${id}`, fixtures.who("coordinator"));
    // Lab 4 specifies a safe invalid-path-ID 400, without naming an exact Action-ID code.
    assertSafeError(response, 400);
  });

  it("reads do not mutate domain rows, versions, Ticket time, history or receipts", async () => {
    const before = await fixtures.domainDigest();
    const responses = [];
    for (const operation of ["list", "detail", "history"] as const) responses.push(await fixtures.get(fixtures.path(operation), fixtures.who("requester")));
    expect(await fixtures.domainDigest() === before, "Canonical domain comparison redacted; AuthSession bookkeeping excluded").toBe(true);
    assertSafeEqual(responses.map((response) => response.status), [200, 200, 200], "All read operations succeed without domain writes");
  });
});
