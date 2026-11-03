import { Client } from "pg";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createAuthUser, loginRequest, syntheticPassword } from "../lab-03/auth-test-helpers.js";
import * as passwords from "../../src/auth/password.js";
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
  const endpoint = operation === "comment" ? `/api/tickets/${parent.id}/comments` : operation === "priority" ? `/api/staff/tickets/${parent.id}/it-priority` : `/api/admin/users/${target.user.id}`;
  const body = operation === "comment" ? { content: "A revoked session must not append this text" } : operation === "priority" ?
    { itPriority: "URGENT", expectedUpdatedAt: parent.updatedAt.toISOString() } : editableUser(before.user, { name: "Revoked command must not rename" });
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

// Verification additions for proposed D-12's new login/session participation.
// The public password observer returns the real verification result unchanged;
// its barrier only orders a real Administrator operation before session INSERT.
it.each(["email", "password", "inactive"] as const)("verified credentials cannot create a session after an intervening %s change", async change => {
  const { user, password } = await createAuthUser({ role: "IT_STAFF" });
  f.read.userIds.push(user.id);
  const verify = passwords.verifyPassword;
  let ready!: () => void, release!: () => void;
  const verified = new Promise<void>(resolve => { ready = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  let observed = false, pending: Promise<any> | undefined;
  const spy = vi.spyOn(passwords, "verifyPassword").mockImplementation(async (hash, candidate) => {
    const result = await verify(hash, candidate);
    if (!observed && hash === user.passwordHash && result) { observed = true; ready(); await held; }
    return result;
  });
  try {
    pending = Promise.resolve(loginRequest(user.email, password));
    await verified;
    const nextPassword = syntheticPassword();
    const changed = change === "password"
      ? await f.creates.post(`/api/admin/users/${user.id}/initial-password`, { initialPassword: nextPassword, confirmPassword: nextPassword }, f.administrator)
      : await f.patch(`/api/admin/users/${user.id}`, editableUser(user, change === "email"
        ? { email: `changed-${randomUUID()}@example.test` } : { isActive: false }), f.administrator);
    expect(changed.status).toBe(200);
    const afterChange = await f.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await f.prisma.authSession.count({ where: { userId: user.id } })).toBe(0);
    release();
    const response = await pending;
    assertSafeError(response, change === "inactive" ? 403 : 401, change === "inactive" ? "ACCOUNT_INACTIVE" : "INVALID_CREDENTIALS");
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(await f.prisma.authSession.count({ where: { userId: user.id } })).toBe(0);
    assertSafeEqual(await f.prisma.user.findUniqueOrThrow({ where: { id: user.id } }), afterChange, "Rejected stale credentials cannot rewrite current account state");
  } finally { release(); await pending?.catch(() => {}); spy.mockRestore(); }
});

it("a login committed before a real password reset is included in session revocation", async () => {
  const { user, password } = await createAuthUser({ role: "IT_STAFF" }); f.read.userIds.push(user.id);
  const loggedIn = await loginRequest(user.email, password); expect(loggedIn.status).toBe(200);
  expect(await f.prisma.authSession.count({ where: { userId: user.id } })).toBe(1);
  const nextPassword = syntheticPassword();
  const changed = await f.creates.post(`/api/admin/users/${user.id}/initial-password`, { initialPassword: nextPassword, confirmPassword: nextPassword }, f.administrator);
  expect(changed.status).toBe(200);
  expect(await f.prisma.authSession.count({ where: { userId: user.id } })).toBe(0);
  expect((await f.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).mustChangePassword).toBe(true);
});
