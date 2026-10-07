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
