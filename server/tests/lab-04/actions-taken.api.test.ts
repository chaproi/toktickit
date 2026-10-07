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

import { ActionCreateFixtures, FULL_CONTENT, MINIMUM_CONTENT } from "./action-create-test-fixtures.js";

describe("API-04 creation (partial AC-04/05/06/12/13/15/34/41/45; T-04/05/06/12/13/15/34/49/55)", () => {
  const creates = new ActionCreateFixtures();
  beforeAll(() => creates.initialize());
  afterAll(() => creates.cleanup());

  it.each([
    { role: "staff", full: false, self: false, unassigned: false },
    { role: "administrator", full: true, self: false, unassigned: true },
    { role: "staff", full: true, self: true, unassigned: true },
    { role: "administrator", full: false, self: true, unassigned: false },
  ] as const)("$role creates full=$full self=$self unassigned=$unassigned with atomic attribution/history/receipt", async ({ role, full, self, unassigned }) => {
    const actor = creates[role];
    const parent = await creates.parent("OPEN", unassigned);
    expect(parent.ownerId === actor.user.id).toBe(false);
    const assigneeId = self ? actor.user.id : creates.read.who("assignee").user.id;
    const input = full ? creates.fullInput(parent, assigneeId) : creates.input(parent, assigneeId);
    await creates.create(parent, input, actor, full ? FULL_CONTENT : MINIMUM_CONTENT);
  });

  it.each(["NEW", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"] as const)("allows an eligible create on editable %s without changing Ticket ownership", async (status) => {
    const parent = await creates.parent(status);
    await creates.create(parent, creates.input(parent), creates.staff);
  });

  it.each([
    { label: "omitted", supplied: false, note: undefined },
    { label: "null", supplied: true, note: null },
    { label: "empty", supplied: true, note: "" },
    { label: "whitespace", supplied: true, note: " \t\n " },
  ])("normalizes false follow-up with $label note to persisted/DTO/history null", async ({ supplied, note }) => {
    const parent = await creates.parent();
    const input = creates.input(parent);
    if (supplied) input.followUpNote = note;
    await creates.create(parent, input, creates.staff, MINIMUM_CONTENT);
  });

  it.each([
    { label: "short description", patch: { description: "four" }, field: "description" },
    { label: "missing description", patch: { description: undefined }, field: "description" },
    { label: "nonboolean follow-up", patch: { followUpRequired: "false" }, field: "followUpRequired" },
    { label: "fractional assignee", patch: { assigneeId: 1.5 }, field: "assigneeId" },
    { label: "invalid UUID", patch: { clientMutationId: "not-a-uuid" }, field: "clientMutationId" },
    { label: "missing parent token", patch: { expectedTicketUpdatedAt: undefined }, field: "expectedTicketUpdatedAt" },
    { label: "non-UTC token", patch: { expectedTicketUpdatedAt: "2026-10-04T03:00:00.000+00:00" }, field: "expectedTicketUpdatedAt" },
    { label: "impossible date token", patch: { expectedTicketUpdatedAt: "2026-02-30T03:00:00.000Z" }, field: "expectedTicketUpdatedAt" },
    { label: "blank supplied result", patch: { result: " " }, field: "result" },
    { label: "wrong attachment text type", patch: { attachmentNotes: [] }, field: "attachmentNotes" },
    { label: "false nonempty note", patch: { followUpNote: "Retain this rather than silently discard" }, field: "followUpNote" },
    { label: "false wrong-type note", patch: { followUpNote: 17 }, field: "followUpNote" },
    { label: "true missing note", patch: { followUpRequired: true }, field: "followUpNote" },
    { label: "true null note", patch: { followUpRequired: true, followUpNote: null }, field: "followUpNote" },
    { label: "true blank note", patch: { followUpRequired: true, followUpNote: " \t " }, field: "followUpNote" },
  ])("rejects $label with field errors and no partial domain writes", async ({ patch, field }) => {
    const parent = await creates.parent();
    const response = await creates.rejected(creates.path(parent.id), { ...creates.input(parent), ...patch });
    assertSafeError(response, 400, "VALIDATION_ERROR");
    expect(typeof response.body.error.fields[field]).toBe("string");
  });

  it.each([
    ["status", "COMPLETED"], ["createdById", 1], ["performedById", 1], ["ticketId", 1],
    ["actionAt", "2000-01-01T00:00:00.000Z"], ["createdAt", "2000-01-01T00:00:00.000Z"],
    ["version", 99], ["history", []], ["attachmentIds", [1]], ["unexpected", true],
  ])("rejects server-owned/unknown %s without accepting spoofed attribution or relationships", async (field, value) => {
    const parent = await creates.parent();
    const response = await creates.rejected(creates.path(parent.id), { ...creates.input(parent), [String(field)]: value });
    assertSafeError(response, 400, "VALIDATION_ERROR");
    expect(typeof response.body.error.fields.body).toBe("string");
  });

  it("rejects a non-object JSON array without writes", async () => {
    const parent = await creates.parent();
    const response = await creates.rejected(creates.path(parent.id), []);
    assertSafeError(response, 400, "VALIDATION_ERROR");
    expect(typeof response.body.error.fields.body).toBe("string");
  });

  it("preserves inherited malformed-JSON handling before route processing", async () => {
    const parent = await creates.parent();
    const response = await creates.rejected(creates.path(parent.id), "{");
    assertSafeError(response, 400, "VALIDATION_ERROR");
    // This can already pass with no Action POST route; it is not creation-validation completion.
  });

  it.each(["0", "-1", "1.5", "not-a-number", "2147483648"])("rejects malformed/overflowing parent path %s without writes", async (id) => {
    const parent = await creates.parent();
    const response = await creates.rejected(creates.path(id), creates.input(parent));
    assertSafeError(response, 400, "INVALID_TICKET_ID");
  });

  it.each(["RESOLVED", "CLOSED", "CANCELLED"] as const)("rejects new creation on frozen %s", async (status) => {
    const parent = await creates.parent(status);
    const response = await creates.rejected(creates.path(parent.id), creates.input(parent));
    assertSafeError(response, 409, "TICKET_ACTIONS_LOCKED");
  });

  it("rejects a stale but valid parent token without Action/history/receipt writes", async () => {
    const parent = await creates.parent();
    const response = await creates.rejected(creates.path(parent.id), {
      ...creates.input(parent), expectedTicketUpdatedAt: "2000-01-01T00:00:00.000Z",
    });
    assertSafeError(response, 409, "STALE_WRITE");
  });

  it("rolls back Action/history/parent writes when the owned late receipt insertion fails", async () => {
    const parent = await creates.parent();
    const input = creates.input(parent);
    await creates.withReceiptFailure(creates.staff, input, parent, async (reached) => {
      const response = await creates.rejected(creates.path(parent.id), input);
      assertSafeError(response, 500, "INTERNAL_ERROR");
      expect(await reached(), "Failpoint observed Action, creation history and advanced parent inside the failed transaction").toBe(true);
      expect(await creates.prisma.action.count({ where: { ticketId: parent.id } })).toBe(0);
      expect(await creates.prisma.actionHistory.count({ where: { action: { ticketId: parent.id } } })).toBe(0);
      expect(await creates.prisma.mutationReceipt.count({ where: { actorId: creates.staff.user.id, clientMutationId: String(input.clientMutationId) } })).toBe(0);
      expect((await creates.prisma.ticket.findUniqueOrThrow({ where: { id: parent.id } })).updatedAt.toISOString()).toBe(parent.updatedAt.toISOString());
    });
  });
});
