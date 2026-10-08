import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Response } from "supertest";
import { ActionPatchFixtures, COMPLETION_TEXT, CANCELLATION_TEXT } from "./action-patch-test-fixtures.js";
import { actionSnapshot, assertSafeEqual, assertSafeError, LITERAL } from "./action-read-test-fixtures.js";
import { orderedUserRace, ticketState } from "./actions-concurrency-test-helpers.js";

// Partial AC-42/T-52, D-12/D-13: cooperating actor gates, not defensive T-51
// uniqueness recovery, induced serialization exhaustion/T-42 or workflow races.
describe("T-52 cooperating Action receipt races", () => {
  const fixtures = new ActionPatchFixtures();
  let receiptAssigneeId: number;
  beforeAll(async () => {
    await fixtures.initialize();
    // User gates sort by ID. A later assignee ensures same-actor requests wait
    // on the ACTOR gate first, rather than an older shared assignee gate.
    receiptAssigneeId = (await fixtures.read.actor("receipt-race-assignee", "IT_STAFF")).user.id;
    expect(receiptAssigneeId).toBeGreaterThan(fixtures.staff.user.id);
  });
  afterAll(() => fixtures.cleanup());
  const actor = () => fixtures.staff;
  type State = Awaited<ReturnType<typeof ticketState>>;
  async function committed(before: State, response: Response, operation: "create" | "edit" | "start" | "complete" | "cancel", key: string, actorId = actor().user.id) {
    expect(response.status).toBe(operation === "create" ? 201 : 200);
    const after = await ticketState(fixtures.prisma, before.ticket.id);
    expect(after.actions).toHaveLength(before.actions.length + (operation === "create" ? 1 : 0));
    expect(after.history).toHaveLength(before.history.length + 1);
    expect(after.receipts.length).toBe(before.receipts.length + 1);
    assertSafeEqual(after.history.slice(0, before.history.length), before.history, "Existing history retained");
    assertSafeEqual(after.receipts.slice(0, before.receipts.length), before.receipts, "Existing receipts never overwritten");
    const action = after.actions[0];
    expect(action.version).toBe(operation === "create" ? 1 : before.actions[0].version + 1);
    const status = operation === "complete" ? "COMPLETED" : operation === "cancel" ? "CANCELLED" : operation === "start" ? "IN_PROGRESS" : "PLANNED";
    expect(action.status).toBe(status);
    expect(action.performedById).toBe(operation === "complete" ? actorId : null);
    const expected = operation === "create" ? {
      ticketId: before.ticket.id, createdById: actorId, assigneeId: receiptAssigneeId,
      performedById: null, description: LITERAL, result: null, followUpRequired: false, followUpNote: null,
      attachmentNotes: null, status: "PLANNED", version: 1, completedAt: null, cancelledAt: null, cancellationReason: null,
      id: action.id, createdAt: action.updatedAt, actionAt: action.updatedAt, updatedAt: action.updatedAt,
    } : { ...before.actions[0], version: before.actions[0].version + 1, updatedAt: action.updatedAt,
      ...(operation === "edit" ? { description: "Concurrent edited description" } : {}),
      ...(operation === "start" ? { status: "IN_PROGRESS" } : {}),
      ...(operation === "complete" ? { status: "COMPLETED", result: COMPLETION_TEXT, performedById: actorId, completedAt: action.updatedAt } : {}),
      ...(operation === "cancel" ? { status: "CANCELLED", cancellationReason: CANCELLATION_TEXT, cancelledAt: action.updatedAt, performedById: null, completedAt: null } : {}),
    };
    assertSafeEqual(action, expected, "Exact one winning Action mutation, attribution and immutable fields");
    fixtures.read.assertDTO(response.body.action, action);
    expect(after.ticket.updatedAt.getTime()).toBeGreaterThan(before.ticket.updatedAt.getTime());
    expect(response.body.ticketUpdatedAt).toBe(after.ticket.updatedAt.toISOString());
    expect(action.updatedAt.toISOString()).toBe(after.ticket.updatedAt.toISOString());
    assertSafeEqual({ ...after.ticket, updatedAt: before.ticket.updatedAt }, before.ticket, "Only winning parent time advances");
    const history = after.history.at(-1)!;
    expect(history.actionId).toBe(action.id);
    expect(history.actorId).toBe(actorId); expect(history.actionVersion).toBe(action.version);
    expect(history.event).toBe(operation === "create" ? "ACTION_CREATED" : operation === "edit" ? "ACTION_EDITED" : operation === "start" ? "ACTION_STARTED" : operation === "complete" ? "ACTION_COMPLETED" : "ACTION_CANCELLED");
    expect(history.sourceTicketStatusHistoryId).toBeNull();
    expect(history.createdAt.toISOString()).toBe(action.updatedAt.toISOString());
    assertSafeEqual(history.before, operation === "create" ? null : actionSnapshot(before.actions[0]), "Complete previous history values");
    assertSafeEqual(history.after, actionSnapshot(action), "Complete committed history values");
    const receipt = after.receipts.at(-1)!;
    expect({ actorId: receipt.actorId, clientMutationId: receipt.clientMutationId, ticketId: receipt.ticketId, actionId: receipt.actionId, operation: receipt.operation }).toEqual({
      actorId, clientMutationId: key, ticketId: before.ticket.id, actionId: action.id,
      operation: operation === "create" ? "CREATE_ACTION" : operation === "edit" ? "EDIT_ACTION" : operation === "start" ? "START_ACTION" : operation === "complete" ? "COMPLETE_ACTION" : "CANCEL_ACTION",
    });
    expect(/^[a-f0-9]{64}$/u.test(receipt.inputFingerprint), "Valid fingerprint representation; content redacted").toBe(true);
    expect(receipt.createdAt.toISOString()).toBe(action.updatedAt.toISOString());
    assertSafeEqual(receipt.safeResponse, response.body, "Exact winning operation-time response stored once");
    expect(await fixtures.prisma.mutationReceipt.count({ where: { actorId, clientMutationId: key } })).toBe(1);
    return after;
  }

  it.each([0, 1])("same actor/key across Tickets: target %i wins without mutating the other target", async (winner) => {
    const parents = [await fixtures.creates.parent(), await fixtures.creates.parent()];
    const before = await Promise.all(parents.map((parent) => ticketState(fixtures.prisma, parent.id)));
    const key = randomUUID();
    const inputs = parents.map((parent) => ({ ...fixtures.creates.input(parent, receiptAssigneeId), clientMutationId: key }));
    const calls = parents.map((parent, index) => () => fixtures.creates.post(fixtures.creates.path(parent.id), inputs[index], actor()));
    const result = await orderedUserRace(actor().user.id, calls[winner], calls[1 - winner]);
    assertSafeError(result.second, 409, "DUPLICATE_REQUEST_CONFLICT");
    const winning = await committed(before[winner], result.first, "create", key);
    assertSafeEqual(await ticketState(fixtures.prisma, parents[1 - winner].id), before[1 - winner], "Cross-Ticket loser has no Action/history/receipt or parent-time change");
    assertSafeEqual(winning.receipts.at(-1)!.safeResponse, result.first.body, "Original receipt never replaced by losing target");
  }, 15_000);

  it.each(["create", "complete", "cancel"] as const)("identical concurrent %s replays the exact original response once", async (operation) => {
    const source = operation === "create" ? null : await fixtures.setup(operation === "complete" ? "IN_PROGRESS" : "PLANNED", { assigneeId: receiptAssigneeId });
    const parent = source?.parent ?? await fixtures.creates.parent();
    const input = operation === "create" ? fixtures.creates.input(parent, receiptAssigneeId) : fixtures.input(source!, operation);
    const before = await ticketState(fixtures.prisma, parent.id);
    const call = () => operation === "create" ? fixtures.creates.post(fixtures.creates.path(parent.id), input, actor()) : fixtures.patch(fixtures.path(source!, operation), input, actor());
    const result = await orderedUserRace(actor().user.id, call, call);
    expect(result.second.status).toBe(200);
    assertSafeEqual(result.second.body, { ...result.first.body, replayed: true }, "Exact original snapshot/timestamps replay, even after completion/cancellation");
    await committed(before, result.first, operation, String(input.clientMutationId));
  }, 15_000);

  it("changed original input sharing actor/key conflicts without extra writes", async () => {
    const parent = await fixtures.creates.parent(); const key = randomUUID();
    const original = { ...fixtures.creates.input(parent, receiptAssigneeId), clientMutationId: key };
    const changed = { ...original, description: "Different concurrent original input" };
    const before = await ticketState(fixtures.prisma, parent.id);
    const result = await orderedUserRace(actor().user.id,
      () => fixtures.creates.post(fixtures.creates.path(parent.id), original, actor()),
      () => fixtures.creates.post(fixtures.creates.path(parent.id), changed, actor()));
    assertSafeError(result.second, 409, "DUPLICATE_REQUEST_CONFLICT");
    await committed(before, result.first, "create", key);
  }, 15_000);

  it.each(["edit", "start"] as const)("different operations sharing actor/key: %s wins and original receipt is retained", async (winner) => {
    const source = await fixtures.setup("PLANNED", { assigneeId: receiptAssigneeId }); const before = await ticketState(fixtures.prisma, source.parent.id); const key = randomUUID();
    const loser = winner === "edit" ? "start" : "edit";
    const inputs = {
      edit: { ...fixtures.editInput(source, { description: "Concurrent edited description" }), clientMutationId: key },
      start: { ...fixtures.input(source, "start"), clientMutationId: key },
    };
    const result = await orderedUserRace(actor().user.id,
      () => fixtures.patch(fixtures.path(source, winner), inputs[winner], actor()),
      () => fixtures.patch(fixtures.path(source, loser), inputs[loser], actor()));
    assertSafeError(result.second, 409, "DUPLICATE_REQUEST_CONFLICT");
    await committed(before, result.first, winner, key);
  }, 15_000);

  it.each([0, 1])("different actors sharing UUID: actor %i first, independent target mutations and receipts", async (winner) => {
    const other = await fixtures.read.actor("independent-receipt-actor", "IT_STAFF");
    const actors = [actor(), other]; const parents = [await fixtures.creates.parent(), await fixtures.creates.parent()];
    const before = await Promise.all(parents.map((parent) => ticketState(fixtures.prisma, parent.id))); const key = randomUUID();
    const inputs = parents.map((parent) => ({ ...fixtures.creates.input(parent, receiptAssigneeId), clientMutationId: key }));
    const calls = parents.map((parent, index) => () => fixtures.creates.post(fixtures.creates.path(parent.id), inputs[index], actors[index]));
    // These distinct actor gates share only the assignee User gate; both target
    // requests overlap there, but UUID uniqueness is scoped independently.
    const result = await orderedUserRace(receiptAssigneeId, calls[winner], calls[1 - winner]);
    await committed(before[winner], result.first, "create", key, actors[winner].user.id);
    await committed(before[1 - winner], result.second, "create", key, actors[1 - winner].user.id);
    expect(await fixtures.prisma.mutationReceipt.count({ where: { actorId: { in: actors.map((value) => value.user.id) }, clientMutationId: key } })).toBe(2);
  }, 15_000);
  // Same-actor gates precede receipt lookup/insertion across every Ticket.
  // A waiter takes a confirmed-40001 fresh attempt and observes the committed
  // receipt; a normal cooperating insertion collision is therefore prevented.
});
