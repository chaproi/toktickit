import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ActionCreateFixtures } from "./action-create-test-fixtures.js";
import { assertSafeEqual, assertSafeError } from "./action-read-test-fixtures.js";

const creates = new ActionCreateFixtures();
beforeAll(() => creates.initialize());
afterAll(() => creates.cleanup());

describe("API-04 sequential receipts (partial AC-14; T-14/41)", () => {
  it("replays the original response at 200 before checking the now-stale parent token", async () => {
    const parent = await creates.parent();
    const input = creates.input(parent);
    const first = await creates.create(parent, input, creates.staff);
    expect(first.parent.updatedAt.toISOString() === String(input.expectedTicketUpdatedAt)).toBe(false);
    const before = await creates.read.domainDigest();
    const replay = await creates.post(creates.path(parent.id), input);
    expect(await creates.read.domainDigest() === before, "Replay performs no domain write; values redacted").toBe(true);
    expect(replay.status).toBe(200);
    assertSafeEqual(replay.body, { ...first.response.body, replayed: true }, "Stored operation-time response replay");
    const receipt = await creates.prisma.mutationReceipt.findUniqueOrThrow({ where: { id: first.receipt.id } });
    assertSafeEqual(receipt, first.receipt, "Receipt and fingerprint remain unchanged");
  });

  it.each(["description", "parent-token", "another-ticket"])("same actor/key with changed %s is a safe conflict without partial writes", async (change) => {
    const parent = await creates.parent();
    const input = creates.input(parent);
    const first = await creates.create(parent, input, creates.staff);
    const other = change === "another-ticket" ? await creates.parent() : parent;
    const changed = { ...input,
      ...(change === "description" ? { description: "Different original request text" } : {}),
      ...(change === "parent-token" ? { expectedTicketUpdatedAt: first.parent.updatedAt.toISOString() } : {}),
    };
    const response = await creates.rejected(creates.path(other.id), changed);
    assertSafeError(response, 409, "DUPLICATE_REQUEST_CONFLICT");
    assertSafeEqual(await creates.prisma.mutationReceipt.findUniqueOrThrow({ where: { id: first.receipt.id } }), first.receipt, "Conflict retains original receipt");
  });

  it("authorized replay after constructed Action advancement and frozen parent returns the original PLANNED snapshot", async () => {
    const parent = await creates.parent();
    const input = creates.input(parent);
    const first = await creates.create(parent, input, creates.staff);
    await creates.constructLaterFrozenState(first);
    const before = await creates.read.domainDigest();
    const response = await creates.post(creates.path(parent.id), input);
    expect(await creates.read.domainDigest() === before, "Frozen replay does not repair or mutate domain data").toBe(true);
    expect(response.status).toBe(200);
    assertSafeEqual(response.body, { ...first.response.body, replayed: true }, "Original response survives later fixture state");
    expect(response.body.action.status).toBe("PLANNED");
    expect(response.body.action.version).toBe(1);
    expect((await creates.prisma.action.findUniqueOrThrow({ where: { id: first.action.id } })).status).toBe("CANCELLED");
    expect((await creates.prisma.ticket.findUniqueOrThrow({ where: { id: parent.id } })).currentStatus).toBe("CLOSED");
    assertSafeEqual(await creates.prisma.mutationReceipt.findUniqueOrThrow({ where: { id: first.receipt.id } }), first.receipt, "Frozen replay leaves stored receipt untouched");
    // Constructed later database state is not workflow/cascade implementation evidence.
  });

  it.each(["revoked", "inactive", "forced-change", "requester-role"])("replay still requires current authorization after %s", async (state) => {
    const actor = await creates.read.actor(`replay-${state}`, "IT_STAFF");
    const parent = await creates.parent();
    const input = creates.input(parent);
    const first = await creates.create(parent, input, actor);
    if (state === "revoked") await creates.prisma.authSession.deleteMany({ where: { userId: actor.user.id } });
    if (state === "inactive") await creates.prisma.user.update({ where: { id: actor.user.id }, data: { isActive: false } });
    if (state === "forced-change") await creates.prisma.user.update({ where: { id: actor.user.id }, data: { mustChangePassword: true } });
    if (state === "requester-role") await creates.prisma.user.update({ where: { id: actor.user.id }, data: { role: "REQUESTER" } });
    const response = await creates.rejected(creates.path(parent.id), input, actor);
    assertSafeError(response, state === "revoked" || state === "inactive" ? 401 : 403,
      state === "forced-change" ? "PASSWORD_CHANGE_REQUIRED" : state === "requester-role" ? "ROLE_FORBIDDEN" : "AUTHENTICATION_REQUIRED");
    assertSafeEqual(await creates.prisma.mutationReceipt.findUniqueOrThrow({ where: { id: first.receipt.id } }), first.receipt, "Unauthorized replay exposes no stored response or writes");
  });
  // No concurrent request, alternate-operation write API, uniqueness recovery or 40001 retry is exercised here.
});

import { ActionPatchFixtures, PATCH_OPERATIONS } from "./action-patch-test-fixtures.js";

describe("API-05/06 sequential receipts (partial AC-14; T-14/41)", () => {
  const patches = new ActionPatchFixtures();
  beforeAll(() => patches.initialize());
  afterAll(() => patches.cleanup());

  it.each(PATCH_OPERATIONS)("%s replays original tokens/response after they become stale, without writes", async (operation) => {
    const source = await patches.setup(operation === "complete" ? "IN_PROGRESS" : "PLANNED");
    const input = patches.input(source, operation);
    const first = await patches.successful(source, operation, input);
    const before = await patches.read.domainDigest();
    const response = await patches.patch(patches.path(source, operation), input);
    expect(await patches.read.domainDigest() === before, "Replay changes no domain rows; values redacted").toBe(true);
    expect(response.status).toBe(200);
    assertSafeEqual(response.body, { ...first.response.body, replayed: true }, "Exact original operation-time response");
    assertSafeEqual(await patches.prisma.mutationReceipt.findUniqueOrThrow({ where: { id: first.receipt.id } }), first.receipt, "Original receipt unchanged");
  });

  it.each(PATCH_OPERATIONS)("%s replay survives constructed terminal Action/frozen parent with original response", async (operation) => {
    const source = await patches.setup(operation === "complete" ? "IN_PROGRESS" : "PLANNED");
    const input = patches.input(source, operation);
    const first = await patches.successful(source, operation, input);
    await patches.freezeLater(first); // Direct later setup, not workflow/cascade evidence.
    const before = await patches.read.domainDigest();
    const response = await patches.patch(patches.path(source, operation), input);
    expect(await patches.read.domainDigest() === before, "Terminal/frozen replay performs no repair or mutation").toBe(true);
    expect(response.status).toBe(200);
    assertSafeEqual(response.body, { ...first.response.body, replayed: true }, "Saved response survives later state/version/timestamp changes");
    assertSafeEqual(await patches.prisma.mutationReceipt.findUniqueOrThrow({ where: { id: first.receipt.id } }), first.receipt, "Saved receipt retained");
  });

  it.each(PATCH_OPERATIONS.flatMap((operation) => ["action-version", "parent-token", "input", "operation", "parent", "action"].map((change) => ({ operation, change }))))(
    "$operation original key rejects changed $change before stale/terminal/no-op guards", async ({ operation, change }) => {
      const source = await patches.setup(operation === "complete" ? "IN_PROGRESS" : "PLANNED");
      const input = patches.input(source, operation);
      const first = await patches.successful(source, operation, input);
      const target = change === "parent" ? await patches.setup() : change === "action" ? await patches.sibling(first) : source;
      const nextOperation = change === "operation" ? operation === "edit" ? "start" : "edit" : operation;
      const changed: Record<string, unknown> = change === "operation" ? { ...patches.input(source, nextOperation),
        expectedVersion: input.expectedVersion, expectedTicketUpdatedAt: input.expectedTicketUpdatedAt, clientMutationId: input.clientMutationId } : { ...input };
      if (change === "action-version") changed.expectedVersion = first.action.version;
      if (change === "parent-token") changed.expectedTicketUpdatedAt = first.parent.updatedAt.toISOString();
      if (change === "input") {
        if (operation === "edit") changed.description = "Different original edit text";
        else if (operation === "start") changed.targetStatus = "PLANNED"; // Recognized enum, otherwise forbidden edge; receipt conflict wins.
        else if (operation === "complete") changed.result = "Different original completion text";
        else changed.reason = "Different original cancellation reason";
      }
      const response = await patches.rejected(patches.path(target, nextOperation), changed);
      assertSafeError(response, 409, "DUPLICATE_REQUEST_CONFLICT");
      assertSafeEqual(await patches.prisma.mutationReceipt.findUniqueOrThrow({ where: { id: first.receipt.id } }), first.receipt, "Changed request never overwrites original receipt");
    },
  );

  it.each(["omitted-first", "null-first"])("edit retains %s versus explicit-null request identity despite identical merged values", async (direction) => {
    const source = await patches.setup("PLANNED", { attachmentNotes: null });
    const firstInput = patches.editInput(source, { description: "Material edit for presence identity", ...(direction === "null-first" ? { attachmentNotes: null } : {}) });
    const first = await patches.successful(source, "edit", firstInput, patches.administrator, { description: "Material edit for presence identity" });
    const changed = { ...firstInput };
    if (direction === "null-first") delete changed.attachmentNotes; else changed.attachmentNotes = null;
    const response = await patches.rejected(patches.path(source, "edit"), changed);
    assertSafeError(response, 409, "DUPLICATE_REQUEST_CONFLICT");
    assertSafeEqual(await patches.prisma.mutationReceipt.findUniqueOrThrow({ where: { id: first.receipt.id } }), first.receipt, "Presence-aware receipt stays unchanged");
  });

  it.each([
    { operation: "edit", state: "revoked" }, { operation: "start", state: "inactive" },
    { operation: "complete", state: "forced-change" }, { operation: "cancel", state: "requester-role" },
  ] as const)("$operation replay still requires current $state authorization", async ({ operation, state }) => {
    const actor = await patches.read.actor(`replay-${operation}-${state}`, "IT_STAFF");
    const source = await patches.setup(operation === "complete" ? "IN_PROGRESS" : "PLANNED");
    const input = patches.input(source, operation);
    const first = await patches.successful(source, operation, input, actor);
    if (state === "revoked") await patches.prisma.authSession.deleteMany({ where: { userId: actor.user.id } });
    if (state === "inactive") await patches.prisma.user.update({ where: { id: actor.user.id }, data: { isActive: false } });
    if (state === "forced-change") await patches.prisma.user.update({ where: { id: actor.user.id }, data: { mustChangePassword: true } });
    if (state === "requester-role") await patches.prisma.user.update({ where: { id: actor.user.id }, data: { role: "REQUESTER" } });
    const response = await patches.rejected(patches.path(source, operation), input, actor);
    assertSafeError(response, state === "revoked" || state === "inactive" ? 401 : 403,
      state === "forced-change" ? "PASSWORD_CHANGE_REQUIRED" : state === "requester-role" ? "ROLE_FORBIDDEN" : "AUTHENTICATION_REQUIRED");
    assertSafeEqual(await patches.prisma.mutationReceipt.findUniqueOrThrow({ where: { id: first.receipt.id } }), first.receipt, "Unauthorized replay never changes/exposes original receipt");
  });
  // Sequential coverage only. Races, 40001 exhaustion and defensive unique-key recovery remain Planned.
});
