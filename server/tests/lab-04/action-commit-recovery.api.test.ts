import { waitForWriteAdmission } from "./write-admission-test-helpers.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { Prisma, type Action, type Ticket } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { ActionPatchFixtures } from "./action-patch-test-fixtures.js";
import { actionSnapshot, assertSafeEqual, assertSafeError, LITERAL } from "./action-read-test-fixtures.js";
import { retryState } from "./action-retry-test-helpers.js";
import { verifiedTestTarget } from "./migration-test-fixtures.js";

// T-42/T-47 correction regression: real HTTP/auth/business callbacks and real
// PostgreSQL SSI. Extra owned dependency rows coordinate COMMIT write skew;
// no business result, SQLSTATE or successful response is fabricated. This is
// not the original fifty-user workload or an uncontrolled production race.
const deferred = () => { let resolve!: () => void;
  const promise = new Promise<void>(accept => { resolve = accept; }); return { promise, resolve }; };
async function finite<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Owned COMMIT coordination deadline.")), 2500);
  })]); } finally { if (timer) clearTimeout(timer); }
}
function classification(error: unknown) {
  const visited = new Set<object>(); let code: string | null = null, state: string | null = null;
  const visit = (value: unknown) => {
    if (value === null || typeof value !== "object" || visited.has(value)) return;
    visited.add(value); const row = value as { code?: unknown; cause?: unknown; meta?: unknown };
    if (typeof row.code === "string" && /^P\d{4}$/.test(row.code)) code = row.code;
    if (typeof row.code === "string" && /^[0-9A-Z]{5}$/.test(row.code) && !/^P\d{4}$/.test(row.code)) state = row.code;
    visit(row.cause); visit(row.meta);
  }; visit(error); return { code, state };
}

describe("real authorized Action recovery after coordinated COMMIT serialization", () => {
  const fixtures = new ActionPatchFixtures();
  const extraCategories: number[] = [];
  beforeAll(async () => {
    const target = verifiedTestTarget(); const probe = new Client({ connectionString: target.databaseUrl });
    try {
      await probe.connect();
      const live = (await probe.query("SELECT current_database() AS db,current_schema() AS schema")).rows[0];
      expect(live.db === target.identity.databaseName && live.schema === target.identity.schema,
        "Guarded live dedicated target matches; values redacted").toBe(true);
    } finally { await probe.end(); }
    await fixtures.initialize();
  });
  afterAll(async () => {
    try {
      await fixtures.prisma.category.deleteMany({ where: { id: { in: extraCategories } } });
      expect(await fixtures.prisma.category.count({ where: { id: { in: extraCategories } } })).toBe(0);
    } finally { await fixtures.cleanup(); }
  });

  it.each(["create", "edit"] as const)("%s retries its own failed COMMIT once with exact domain recovery", async operation => {
    const db = getPrisma();
    const actors = await Promise.all([0, 1].map(i => fixtures.read.actor(`commit-${operation}-${i}`, "IT_STAFF")));
    const assignees = await Promise.all([0, 1].map(i => fixtures.read.actor(`commit-assignee-${operation}-${i}`, "IT_STAFF")));
    const sources: Array<{ parent: Ticket; action: Action | null }> = [];
    // Existing helpers assert global owned row deltas during source creation;
    // prepare those sources sequentially before coordinating the actual race.
    for (const assignee of assignees) sources.push(operation === "create"
      ? { parent: await fixtures.creates.parent(), action: null }
      : await fixtures.setup("PLANNED", { assigneeId: assignee.user.id }));
    expect(new Set([...actors, ...assignees].map(value => value.user.id)).size).toBe(4);
    const before = await Promise.all(sources.map(source => retryState(db, source.parent.id)));
    const categories: number[] = [];
    for (const index of [0, 1]) {
      const row = await db.category.create({ data: { name: `commit-dependency-${randomUUID()}-${index}` } });
      extraCategories.push(row.id); categories.push(row.id);
    }
    const inputs = sources.map((source, index) => operation === "create"
      ? fixtures.creates.input(source.parent, assignees[index].user.id)
      : fixtures.editInput({ parent: source.parent, action: source.action! }, { description: "Committed independent recovery edit" }));
    const winner = operation === "create" ? 0 : 1, loser = 1 - winner;
    const target = verifiedTestTarget();
    const native = new Client({ connectionString: target.databaseUrl });
    await native.connect();
    await native.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    await native.query('SELECT "id","isActive" FROM "Category" WHERE "id"=ANY($1::int[])', [categories]);
    const context = new AsyncLocalStorage<number>();
    const ready = [deferred(), deferred()], release = [deferred(), deferred()];
    type State = Awaited<ReturnType<typeof retryState>>;
    type Attempt = { backend: number; xid: string; complete: boolean; staged?: State; rollback?: State;
      error?: ReturnType<typeof classification> };
    const attempts: Attempt[][] = [[], []];
    const original = db.$transaction.bind(db);
    const log = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      const rendered = args.map(value => typeof value === "string" ? value : JSON.stringify(value)).join(" ");
      expect(/passwordHash|tokenHash|csrfTokenHash|inputFingerprint|SELECT\s+|INSERT\s+|postgres(?:ql)?:\/\/|stack/iu.test(rendered),
        "HTTP logging retains only safe diagnostics").toBe(false);
    });
    const spy = vi.spyOn(db, "$transaction").mockImplementation((...args: unknown[]) => {
      const index = context.getStore();
      if (index === undefined || typeof args[0] !== "function" ||
          (args[1] as { isolationLevel?: string } | undefined)?.isolationLevel !== "Serializable") {
        return Reflect.apply(original, db, args);
      }
      const callback = args[0] as (tx: Prisma.TransactionClient) => Promise<unknown>;
      const attempt: Attempt = { backend: 0, xid: "", complete: false };
      attempts[index].push(attempt); const first = attempts[index].length === 1;
      return Reflect.apply(original, db, [async (tx: Prisma.TransactionClient) => {
        const [identity] = await tx.$queryRaw<Array<{ backend: number; xid: string }>>`
          SELECT pg_backend_pid()::int AS backend,txid_current()::text AS xid`;
        attempt.backend = identity.backend; attempt.xid = identity.xid;
        if (first) expect(await tx.category.findMany({ where: { id: { in: categories } } })).toHaveLength(2);
        const result = await callback(tx);
        attempt.staged = await retryState(tx, sources[index].parent.id);
        if (first) {
          await tx.category.update({ where: { id: categories[index] }, data: { isActive: false } });
          attempt.complete = true; ready[index].resolve();
          if (index === loser) await finite(release[index].promise);
        }
        return result;
      }, ...args.slice(1)]).catch(async (error: unknown) => {
        attempt.error = classification(error);
        // Independent reads only after the actual transaction promise rejected.
        attempt.rollback = await retryState(fixtures.prisma, sources[index].parent.id);
        throw error;
      });
    });
    const pending: Promise<any>[] = [];
    const send = (index: number) => context.run(index, async () => operation === "create"
      ? await fixtures.creates.post(fixtures.creates.path(sources[index].parent.id), inputs[index], actors[index])
      : await fixtures.patch(fixtures.path({ parent: sources[index].parent, action: sources[index].action! }, "edit"), inputs[index], actors[index]));
    try {
      pending[loser] = send(loser); void pending[loser].catch(() => undefined);
      await finite(ready[loser].promise);
      // Native participant deliberately does not cooperate with admission.
      // Its genuine SSI dependency commits before the held application attempt.
      await native.query('UPDATE "Category" SET "isActive"=false WHERE "id"=$1', [categories[winner]]);
      pending[winner] = send(winner); void pending[winner].catch(() => undefined);
      expect(await waitForWriteAdmission(native, target.identity.schema)).toHaveLength(1);
      await native.query("COMMIT");
      release[loser].resolve();
      const [winning, losing] = await finite(Promise.all([pending[winner], pending[loser]]));
      expect(attempts.map(values => values[0].complete)).toEqual([true, true]);
      expect(attempts[0][0].backend).not.toBe(attempts[1][0].backend);
      expect(attempts[0][0].xid).not.toBe(attempts[1][0].xid);
      expect(winning.status).toBe(operation === "create" ? 201 : 200);
      expect(attempts[loser][0].rollback).toBeDefined();
      assertSafeEqual(attempts[loser][0].rollback, before[loser], "Failed COMMIT rolls back Action/history/receipt and parent exactly");
      const dependencies = await db.category.findMany({ where: { id: { in: categories } }, orderBy: { id: "asc" } });
      expect(dependencies.find(value => value.id === categories[winner])?.isActive).toBe(false);
      expect(dependencies.find(value => value.id === categories[loser])?.isActive).toBe(true);
      console.info(JSON.stringify({ stage: "real-application-commit-evidence", operation,
        winner, firstBodiesComplete: true, loserFailure: attempts[loser][0].error,
        failedAttemptRollbackExact: true, attempts: attempts.map(value => value.length) }));
      if (losing.status === 500) assertSafeError(losing, 500, "INTERNAL_ERROR");
      // Native5.22 reaches this semantic RED after independent rollback proof;
      // opaque P2034 is deliberately NOT accepted as a confirmed40001 retry.
      expect(losing.status, "Authorized independent command recovers after its confirmed COMMIT serialization abort").toBe(operation === "create" ? 201 : 200);
      expect(attempts.map(value => value.length)).toEqual(winner === 0 ? [1, 2] : [2, 1]);
      expect(attempts[loser][0].error?.state).toBe("40001");
      expect(new Set(attempts[loser].map(value => value.xid)).size).toBe(2);
      const after = await Promise.all(sources.map(source => retryState(db, source.parent.id)));
      for (const index of [0, 1]) {
        const saved = after[index], earlier = before[index], response = index === winner ? winning : losing;
        expect(saved.actions).toHaveLength(earlier.actions.length + (operation === "create" ? 1 : 0));
        expect(saved.history).toHaveLength(earlier.history.length + 1);
        expect(saved.receipts).toHaveLength(earlier.receipts.length + 1);
        assertSafeEqual(saved.history.slice(0, earlier.history.length), earlier.history, "Earlier history preserved");
        assertSafeEqual(saved.receipts.slice(0, earlier.receipts.length), earlier.receipts, "Earlier receipts preserved");
        const action = saved.actions[0];
        if (operation === "edit") assertSafeEqual(action, { ...earlier.actions[0],
          description: "Committed independent recovery edit", version: earlier.actions[0].version + 1, updatedAt: action.updatedAt }, "Only one intended edit");
        else assertSafeEqual(action, { id: action.id, ticketId: earlier.ticket.id, createdById: actors[index].user.id,
          assigneeId: assignees[index].user.id, performedById: null, description: LITERAL, result: null,
          followUpRequired: false, followUpNote: null, attachmentNotes: null, status: "PLANNED", version: 1,
          actionAt: action.updatedAt, createdAt: action.updatedAt, updatedAt: action.updatedAt,
          completedAt: null, cancelledAt: null, cancellationReason: null }, "One exact created Action");
        expect(saved.ticket.updatedAt.getTime()).toBeGreaterThan(earlier.ticket.updatedAt.getTime());
        expect(saved.ticket.updatedAt.toISOString()).toBe(action.updatedAt.toISOString());
        assertSafeEqual({ ...saved.ticket, updatedAt: earlier.ticket.updatedAt }, earlier.ticket, "Only parent timestamp advances");
        fixtures.read.assertDTO(response.body.action, action);
        expect(response.body.ticketUpdatedAt).toBe(saved.ticket.updatedAt.toISOString());
        const history = saved.history.at(-1)!;
        expect(history).toMatchObject({ actionId: action.id, actorId: actors[index].user.id,
          actionVersion: action.version, event: operation === "create" ? "ACTION_CREATED" : "ACTION_EDITED",
          sourceTicketStatusHistoryId: null, createdAt: action.updatedAt });
        assertSafeEqual(history.before, operation === "create" ? null : actionSnapshot(earlier.actions[0]), "Complete before snapshot");
        assertSafeEqual(history.after, actionSnapshot(action), "Complete after snapshot");
        const receipt = saved.receipts.at(-1)!;
        expect(receipt).toMatchObject({ actorId: actors[index].user.id, ticketId: action.ticketId,
          actionId: action.id, clientMutationId: inputs[index].clientMutationId,
          operation: operation === "create" ? "CREATE_ACTION" : "EDIT_ACTION", createdAt: action.updatedAt });
        assertSafeEqual(receipt.safeResponse, response.body, "One exact authoritative receipt");
      }
    } finally {
      release.forEach(value => value.resolve()); await Promise.allSettled(pending);
      spy.mockRestore(); log.mockRestore();
      try { await native.query("ROLLBACK"); } finally { await native.end(); }
    }
  });
});
