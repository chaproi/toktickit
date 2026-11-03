import { Client } from "pg";
import { beforeAll, afterAll, expect, it } from "vitest";
import { ActionPatchFixtures } from "./action-patch-test-fixtures.js";
import { verifiedTestTarget } from "./migration-test-fixtures.js";
import { editableUser } from "../lab-03/issue35-test-helpers.js";
import { assertSafeError, assertSafeEqual } from "./action-read-test-fixtures.js";
import { retryState } from "./action-retry-test-helpers.js";
const f = new ActionPatchFixtures();
beforeAll(() => f.initialize());
afterAll(() => f.cleanup());

it.each(["comment", "priority", "user-edit"] as const)("real logout before %s User lock denies an already admitted command without writes", async operation => {
  const role = operation === "comment" ? "REQUESTER" : operation === "priority" ? "IT_STAFF" : "ADMINISTRATOR";
  const actor = await f.read.actor(`session-${operation}`, role);
  const parent = await f.read.ticket(operation === "comment" ? actor.user.id : f.read.who("requester").user.id);
  const target = await f.read.actor(`session-target-${operation}`, "IT_STAFF");
  const before = { ticket: await retryState(f.prisma, parent.id), user: await f.prisma.user.findUniqueOrThrow({ where: { id: target.user.id } }),
    comments: await f.prisma.publicComment.findMany({ where: { ticketId: parent.id } }) };
  const endpoint = operation === "comment" ? `/api/tickets/${parent.id}/comments` : operation === "priority" ? `/api/staff/tickets/${parent.id}/priority` : `/api/admin/users/${target.user.id}`;
  const body = operation === "comment" ? { content: "A revoked session must not append this text" } : operation === "priority" ?
    { itPriority: "CRITICAL", expectedUpdatedAt: parent.updatedAt.toISOString() } : editableUser(before.user, { name: "Revoked command must not rename" });
  const native = new Client({ connectionString: verifiedTestTarget().databaseUrl });
  let pending: Promise<any> | undefined, open = false;
  try {
    await native.connect(); await native.query("BEGIN"); open = true;
    await native.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE', [actor.user.id]);
    const pid = (await native.query("SELECT pg_backend_pid()::int AS id")).rows[0].id;
    pending = Promise.resolve(operation === "comment" ? f.creates.post(endpoint, body, actor) : f.patch(endpoint, body, actor));
    let blocked = false; const start = performance.now();
    while (!blocked && performance.now() - start < 1500) {
      blocked = (await native.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))", [pid])).rows[0].n > 0;
      if (!blocked) await new Promise(resolve => setTimeout(resolve, 5));
    }
    expect(blocked, "Actual HTTP transaction waits on the owned User row after middleware authentication").toBe(true);
    const logout = await f.creates.post("/api/auth/logout", {}, actor); expect(logout.status).toBe(204);
    await native.query("COMMIT"); open = false;
    const response = await pending; assertSafeError(response, 401, "AUTHENTICATION_REQUIRED");
    assertSafeEqual({ ticket: await retryState(f.prisma, parent.id), user: await f.prisma.user.findUniqueOrThrow({ where: { id: target.user.id } }),
      comments: await f.prisma.publicComment.findMany({ where: { ticketId: parent.id } }) }, before, "Revocation denial preserves exact domain state");
  } finally { if (open) await native.query("ROLLBACK"); await pending?.catch(() => {}); await native.end(); }
});
