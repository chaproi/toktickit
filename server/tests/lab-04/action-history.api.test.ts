import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ActionReadFixtures, HISTORY_KEYS, PRIVATE_NOTE, SNAPSHOT_KEYS, assertSafeEqual, assertSafeError, pagination,
} from "./action-read-test-fixtures.js";

const fixtures = new ActionReadFixtures();
beforeAll(() => fixtures.initialize());
afterAll(() => fixtures.cleanup());

describe("API-03 history projection (partial AC-02/12/13/45; T-02/12/13/55)", () => {
  it.each(["requester", "coordinator", "completer"])("%s receives exact safe actors, events and full nullable snapshots", async (role) => {
    const response = await fixtures.get(`${fixtures.path("history")}?pageSize=100`, fixtures.who(role));
    expect(response.status).toBe(200);
    const expected = fixtures.sortedHistory(fixtures.completed.id);
    expect(Object.keys(response.body).sort()).toEqual(["items", "pagination"]);
    expect(response.body.pagination).toEqual(pagination(1, 100, expected.length));
    expect(response.body.items).toHaveLength(expected.length);
    for (const [index, item] of response.body.items.entries()) {
      expect(Object.keys(item).sort()).toEqual([...HISTORY_KEYS].sort());
      expect(Object.keys(item.actor).sort()).toEqual(["id", "name"]);
      expect(Object.keys(item.after).sort()).toEqual([...SNAPSHOT_KEYS].sort());
      if (item.before !== null) expect(Object.keys(item.before).sort()).toEqual([...SNAPSHOT_KEYS].sort());
      assertSafeEqual(item, expected[index], "History event matches independently observed full before/after state");
      expect(item.actionVersion).toBe(item.after.version);
      expect(item.sourceTicketStatusHistoryId).toBeNull();
      if (item.event === "ACTION_CREATED") { expect(item.before).toBeNull(); expect(item.after.version).toBe(1); }
      else expect(item.after.version).toBe(item.before.version + 1);
    }
    const edit = response.body.items.find((item: { event: string; actionVersion: number }) => item.event === "ACTION_EDITED" && item.actionVersion === 2);
    expect(edit.before.followUpNote).toBe("Retain this old note in history");
    expect(edit.after.followUpNote).toBeNull();
    const reassignments = response.body.items.filter((item: { event: string }) => item.event === "ACTION_REASSIGNED");
    expect(reassignments).toHaveLength(1);
    expect(reassignments[0].before.assigneeId).toBe(fixtures.who("creator").user.id);
    expect(reassignments[0].after.assigneeId).toBe(fixtures.who("assignee").user.id);
    expect(reassignments[0].after.description === reassignments[0].before.description).toBe(false);
    const start = response.body.items.find((item: { event: string }) => item.event === "ACTION_STARTED");
    expect(start.after.status).toBe("IN_PROGRESS");
    expect(start.after.performedById).toBeNull();
    const completion = response.body.items.find((item: { event: string }) => item.event === "ACTION_COMPLETED");
    expect(completion.after.performedById).toBe(fixtures.who("completer").user.id);
    expect(completion.actor).toEqual(fixtures.who("completer").user);
    expect(completion.after.completedAt).toBe(completion.createdAt);
    expect(JSON.stringify(response.body).includes(PRIVATE_NOTE)).toBe(false);
    expect(/password|email|token|session|receipt|fingerprint|storageKey|internalNotes/iu.test(JSON.stringify(response.body))).toBe(false);
  });

  it.each([20, 50, 100])("history pageSize %i has chronological createdAt ASC,id ASC ordering", async (pageSize) => {
    const expected = fixtures.sortedHistory(fixtures.completed.id);
    expect(expected.length).toBeGreaterThan(20);
    expect(expected.some((item, index) => index > 0 && item.createdAt === expected[index - 1].createdAt)).toBe(true);
    const ids: number[] = [];
    for (let page = 1; page <= Math.ceil(expected.length / pageSize); page += 1) {
      const response = await fixtures.get(`${fixtures.path("history")}?page=${page}&pageSize=${pageSize}`, fixtures.who("requester"));
      expect(response.status).toBe(200);
      expect(response.body.pagination).toEqual(pagination(page, pageSize, expected.length));
      assertSafeEqual(response.body.items, expected.slice((page - 1) * pageSize, page * pageSize), "History page content and tie order");
      ids.push(...response.body.items.map((item: { id: number }) => item.id));
    }
    expect(ids).toEqual(expected.map((item) => item.id));
  });

  it("history defaults to page 1/20 and beyond-final remains empty", async () => {
    const expected = fixtures.sortedHistory(fixtures.completed.id);
    const first = await fixtures.get(fixtures.path("history"), fixtures.who("requester"));
    expect(first.status).toBe(200);
    expect(first.body.pagination).toEqual(pagination(1, 20, expected.length));
    assertSafeEqual(first.body.items, expected.slice(0, 20), "Default history page");
    const beyond = await fixtures.get(`${fixtures.path("history")}?page=9`, fixtures.who("requester"));
    expect(beyond.status).toBe(200);
    expect(beyond.body).toEqual({ items: [], pagination: pagination(9, 20, expected.length) });
  });

  it("returns empty history for an accessible Action with no historical rows", async () => {
    const action = fixtures.sortedActions(fixtures.mainTicket.id, "PLANNED")[0];
    const response = await fixtures.get(fixtures.path("history", action.ticketId, action.id), fixtures.who("requester"));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [], pagination: pagination(1, 20, 0) });
  });

  it.each(["cancelled", "cascade"] as const)("exposes %s event with retained draft/follow-up and correct source nullability", async (label) => {
    const action = fixtures[label];
    const response = await fixtures.get(fixtures.path("history", action.ticketId, action.id), fixtures.who("requester"));
    expect(response.status).toBe(200);
    const expected = fixtures.sortedHistory(action.id);
    assertSafeEqual(response.body.items, expected, "Full cancellation read projection");
    const event = response.body.items.find((item: { event: string }) => item.event !== "ACTION_CREATED");
    expect(event.event).toBe(label === "cascade" ? "ACTION_CANCELLED_BY_TICKET" : "ACTION_CANCELLED");
    expect(event.after.result).toBe("Retained draft result");
    expect(event.after.followUpNote).toBe("Retain this old note in history");
    expect(event.after.performedById).toBeNull();
    expect(event.after.completedAt).toBeNull();
    expect(event.after.cancelledAt).toBe(event.createdAt);
    expect(event.actor).toEqual(fixtures.who("coordinator").user);
    if (label === "cascade") {
      const source = await fixtures.prisma.ticketStatusHistory.findUniqueOrThrow({ where: { id: event.sourceTicketStatusHistoryId } });
      expect(source.ticketId).toBe(action.ticketId);
      expect(source.actorId).toBe(event.actor.id);
      expect(source.reason).toBe(event.after.cancellationReason);
    } else expect(event.sourceTicketStatusHistoryId).toBeNull();
    // Directly constructed source-linked read data does NOT establish cascade implementation/atomicity.
  });

  it.each([
    ["page=0", "page"], ["pageSize=10", "pageSize"], ["unexpected=true", "unexpected"],
    ["status=PLANNED", "status"], ["page=1&page=2", "page"], ["pageSize=20&pageSize=50", "pageSize"],
  ])("rejects history query %s without changing any domain record", async (query, field) => {
    const response = await fixtures.get(`${fixtures.path("history")}?${query}`, fixtures.who("requester"));
    assertSafeError(response, 400, "INVALID_QUERY");
    expect(typeof response.body.error.fields[field]).toBe("string");
  });

  it.each(["0", "-1", "1.5", "not-a-number"])("rejects malformed history Action path ID %s with a safe 400", async (id) => {
    const response = await fixtures.get(`/api/tickets/${fixtures.mainTicket.id}/actions/${id}/history`, fixtures.who("coordinator"));
    assertSafeError(response, 400);
  });
});
