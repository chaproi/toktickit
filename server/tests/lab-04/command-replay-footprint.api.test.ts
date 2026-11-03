import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { ActionPatchFixtures } from "./action-patch-test-fixtures.js";
import { retryState } from "./action-retry-test-helpers.js";
import { assertSafeEqual, assertSafeError } from "./action-read-test-fixtures.js";
import { editableUser } from "../lab-03/issue35-test-helpers.js";
import { safeCreateError } from "./create-phase-observer.js";

const f = new ActionPatchFixtures();
beforeAll(() => f.initialize());
// Preserve actual transaction classification if preparation fails; do not
// substitute a successful response or retain SQL/credentials/raw errors.
const originalTransaction = f.prisma.$transaction.bind(f.prisma);
beforeAll(() => { vi.spyOn(f.prisma, "$transaction").mockImplementation(((...args: unknown[]) =>
  Reflect.apply(originalTransaction, f.prisma, args).catch((error: unknown) => {
    console.info("Replay transaction failure classification", safeCreateError(error)); throw error;
  })) as any); });
afterAll(async () => { vi.restoreAllMocks(); await f.cleanup(); });

it.each([false, true])("receipt survives mutable discovery drift; revoked=%s still denies replay", async revoked => {
  const actor = await f.read.actor(`replay-drift-${revoked}`, "IT_STAFF");
  const worker = await f.read.actor(`replay-worker-${revoked}`, "IT_STAFF");
  const source = await f.setup();
  const input = f.editInput(source, { description: "Original deliberately retained replay text" });
  const original = await f.patch(f.path(source, "edit"), input, actor);
  expect(original.status).toBe(200);
  let injected = false, expected: Awaited<ReturnType<typeof retryState>> | undefined;
  const find = f.prisma.action.findFirst.bind(f.prisma.action);
  const spy = vi.spyOn(f.prisma.action, "findFirst").mockImplementation((async (args: any) => {
    const found = await find(args);
    if (!injected && args?.where?.id === source.action.id && args?.select?.assigneeId) {
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
  }) as any);
  try {
    const replay = await f.patch(f.path(source, "edit"), input, actor);
    expect(injected).toBe(true);
    if (revoked) assertSafeError(replay, 401, "AUTHENTICATION_REQUIRED");
    else { expect(replay.status).toBe(200); assertSafeEqual(replay.body, { ...original.body, replayed: true }, "Original authorized receipt precedes mutable footprint drift"); }
    assertSafeEqual(await retryState(f.prisma, source.parent.id), expected, "Replay/denial makes no extra domain write after independent changes");
  } finally { spy.mockRestore(); }
});
