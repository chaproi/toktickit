import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { ActionPatchFixtures } from "./action-patch-test-fixtures.js";
import { retryState } from "./action-retry-test-helpers.js";
import { assertSafeEqual, assertSafeError } from "./action-read-test-fixtures.js";
import { editableUser } from "../lab-03/issue35-test-helpers.js";
import * as prismaModule from "../../src/prisma.js";
import { observePrisma } from "./prisma-observation-test-helper.js";

const f = new ActionPatchFixtures();
beforeAll(() => f.initialize());
afterAll(async () => { vi.restoreAllMocks(); await f.cleanup(); });

it.each([false, true])("receipt survives mutable discovery drift; revoked=%s still denies replay", async revoked => {
  const actor = await f.read.actor(`replay-drift-${revoked}`, "IT_STAFF");
  const worker = await f.read.actor(`replay-worker-${revoked}`, "IT_STAFF");
  const source = await f.setup();
  const input = f.editInput(source, { description: "Original deliberately retained replay text" });
  const original = await f.patch(f.path(source, "edit"), input, actor);
  expect(original.status).toBe(200);
  let injected = false, expected: Awaited<ReturnType<typeof retryState>> | undefined;
  const observed = observePrisma(f.prisma, async (parameters, next) => {
    const found = await next(parameters);
    if (!injected && parameters.model === "Action" && parameters.action === "findFirst" && !parameters.runInTransaction) {
      injected = true;
      // Real independent commands after original discovery, before User gates.
      const current = { action: await f.prisma.action.findUniqueOrThrow({ where: { id: source.action.id } }),
        parent: await f.prisma.ticket.findUniqueOrThrow({ where: { id: source.parent.id } }) };
      const reassigned = await f.patch(f.path(current, "edit"), f.editInput(current, { assigneeId: worker.user.id }), f.administrator);
      expect(reassigned.status).toBe(200);
      if (revoked) {
        const user = await f.prisma.user.findUniqueOrThrow({ where: { id: actor.user.id } });
        const response = await f.patch(`/api/admin/users/${user.id}`, editableUser(user, { isActive: false }), f.administrator);
        expect(response.status).toBe(200);
      }
      expected = await retryState(f.prisma, source.parent.id);
    }
    return found;
  });
  const spy = vi.spyOn(prismaModule, "getPrisma").mockReturnValue(observed);
  try {
    const replay = await f.patch(f.path(source, "edit"), input, actor);
    expect(injected).toBe(true);
    if (revoked) assertSafeError(replay, 401, "AUTHENTICATION_REQUIRED");
    else { expect(replay.status).toBe(200); assertSafeEqual(replay.body, { ...original.body, replayed: true }, "Original authorized receipt precedes mutable footprint drift"); }
    assertSafeEqual(await retryState(f.prisma, source.parent.id), expected, "Replay/denial makes no extra domain write after independent changes");
  } finally { spy.mockRestore(); }
});
