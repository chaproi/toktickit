// D-12 candidate: observe selected READ COMMITTED commands; retain all business assertions.
import { currentCommandPlan } from "../../src/database/write-admission.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { Client } from "pg";
import { waitForObservedAdmission } from "./write-admission-test-helpers.js";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { getPrisma } from "../../src/prisma.js";
import { ActionCreateFixtures } from "./action-create-test-fixtures.js";
import { retryState } from "./action-retry-test-helpers.js";
import { actionSnapshot, assertSafeEqual, LITERAL } from "./action-read-test-fixtures.js";
import { rejectionEvidence } from "./create-contention-evidence.js";
import { serverDirectory, verifiedTestTarget } from "./migration-test-fixtures.js";
import request from "supertest";
import { app } from "../../src/app.js";
import { APPROVED_ORIGIN, cookieValue } from "../lab-03/auth-test-helpers.js";

const deferred = () => { let resolve!: () => void;
  const promise = new Promise<void>(accept => { resolve = accept; }); return { promise, resolve }; };
async function bounded<T>(work: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Independent CREATE setup/barrier did not complete.")), 2500);
  })]); } finally { if (timer) clearTimeout(timer); }
}

it.each(["create", "edit"] as const)("eight eligible independent concurrent %s commands all commit one exact operation within three attempts", async operation => {
  const target = verifiedTestTarget();
  const native = new Client({ connectionString: target.databaseUrl });
  const fixtures = new ActionCreateFixtures(), context = new AsyncLocalStorage<number>();
  const release = deferred(), ready = deferred(); let arrivals = 0;
  const pending: Promise<any>[] = [], evidence: Array<Record<string, any>> = [];
  let restore: (() => void) | undefined;
  try {
    await native.connect();
    await fixtures.initialize();
    const sources: Array<{ actor: Awaited<ReturnType<typeof fixtures.read.actor>>;
      parent: Awaited<ReturnType<typeof fixtures.parent>>; input: Record<string, unknown>; actionId?: number;
      before: Awaited<ReturnType<typeof retryState>> }> = [];
    for (let index = 0; index < 8; index++) {
      const actor = await fixtures.read.actor(`independent-create-${index}`, "IT_STAFF");
      const parent = await fixtures.parent();
      if (operation === "create") {
        sources.push({ actor, parent, input: fixtures.input(parent, actor.user.id), before: await retryState(fixtures.prisma, parent.id) });
      } else {
        const created = await fixtures.post(fixtures.path(parent.id), fixtures.input(parent, actor.user.id), actor);
        expect(created.status).toBe(201);
        sources.push({ actor, parent, actionId: created.body.action.id, input: {
          description: `Independent edited literal ${LITERAL}`, expectedVersion: created.body.action.version,
          expectedTicketUpdatedAt: created.body.ticketUpdatedAt, clientMutationId: randomUUID(),
        }, before: await retryState(fixtures.prisma, parent.id) });
      }
      evidence.push({ command: index, attempts: [], status: null });
    }
    expect(new Set(sources.map(source => source.actor.user.id)).size).toBe(8);
    expect(new Set(sources.map(source => source.parent.id)).size).toBe(8);
    expect(new Set(sources.map(source => source.input.clientMutationId)).size).toBe(8);
    const db = getPrisma(), original = db.$transaction.bind(db);
    const spy = vi.spyOn(db, "$transaction").mockImplementation((...args: unknown[]) => {
      const index = context.getStore();
      if (index === undefined || typeof args[0] !== "function" || ((args[1] as any)?.isolationLevel !== "ReadCommitted" || !currentCommandPlan())) return Reflect.apply(original, db, args);
      const callback = args[0] as (tx: Prisma.TransactionClient) => Promise<unknown>;
      const attempt: Record<string, any> = { number: evidence[index].attempts.length + 1, callbackReturned: false };
      evidence[index].attempts.push(attempt);
      return Reflect.apply(original, db, [async (tx: Prisma.TransactionClient) => {
        const observed = new Proxy(tx, { get(target, key) {
          const value = Reflect.get(target, key);
          if (key === "mutationReceipt") return new Proxy(value, { get(delegate, method) {
            const operation = Reflect.get(delegate, method);
            if (method !== "findUnique") return typeof operation === "function" ? operation.bind(delegate) : operation;
            return async (...input: unknown[]) => {
              const result = await Reflect.apply(operation, delegate, input);
              if (attempt.number === 1 && result === null) { if (++arrivals === 8) ready.resolve(); await bounded(release.promise); }
              return result;
            };
          } });
          return typeof value === "function" ? value.bind(target) : value;
        } });
        const result = await callback(observed); attempt.callbackReturned = true; return result;
      }, ...args.slice(1)]).catch(async (error: unknown) => {
        attempt.rejection = rejectionEvidence(error, false, attempt.callbackReturned);
        assertSafeEqual(await retryState(fixtures.prisma, sources[index].parent.id), sources[index].before, "Every failed attempt rolls back before retry");
        attempt.rollbackExact = true; throw error;
      });
    });
    restore = () => spy.mockRestore();
    for (const [index, source] of sources.entries()) {
      const work = context.run(index, async () => {
        const response = operation === "create" ? await fixtures.post(fixtures.path(source.parent.id), source.input, source.actor)
          : await request(app).patch(`${fixtures.path(source.parent.id)}/${source.actionId}`).set("Origin", APPROVED_ORIGIN)
            .set("Cookie", source.actor.cookie).set("X-CSRF-Token", cookieValue(source.actor.cookie.split("; "), "toktickit_csrf")).send(source.input);
        evidence[index].status = response.status; evidence[index].errorCode = response.body.error?.code ?? null;
        return response;
      });
      void work.catch(() => undefined); pending.push(work);
    }
    try {
      await bounded(ready.promise);
      expect(await waitForObservedAdmission(() => evidence.filter(row => row.attempts.length === 1).length, 8)).toBe(8);
      expect(arrivals, "Disjoint commands genuinely enter overlapping business callbacks under resource coordination").toBe(8);
    } finally { release.resolve(); }
    const responses = await Promise.all(pending);
    expect(evidence.map(row => row.status), "Every valid independent command must succeed; a diagnostic permitting409 is not GREEN")
      .toEqual(Array(8).fill(operation === "create" ? 201 : 200));
    for (const [index, source] of sources.entries()) {
      const after = await retryState(fixtures.prisma, source.parent.id);
      expect(after.actions).toHaveLength(1); expect(after.history).toHaveLength(source.before.history.length + 1); expect(after.receipts).toHaveLength(source.before.receipts.length + 1);
      const action = after.actions[0], event = after.history.at(-1)!, receipt = after.receipts.at(-1)!;
      if (operation === "create") {
        expect(action).toMatchObject({ ticketId: source.parent.id, createdById: source.actor.user.id,
          assigneeId: source.actor.user.id, performedById: null, status: "PLANNED", version: 1, description: LITERAL });
        expect(event).toMatchObject({ actionId: action.id, actorId: source.actor.user.id, event: "ACTION_CREATED", actionVersion: 1, before: null });
      } else {
        assertSafeEqual(action, { ...source.before.actions[0], description: source.input.description, version: 2, updatedAt: action.updatedAt }, "One intended edit preserves all other Action values");
        expect(event).toMatchObject({ actionId: action.id, actorId: source.actor.user.id, event: "ACTION_EDITED", actionVersion: 2 });
        assertSafeEqual(event.before, actionSnapshot(source.before.actions[0]), "Complete original edit snapshot");
        assertSafeEqual(after.history.slice(0, -1), source.before.history, "Earlier history preserved");
        assertSafeEqual(after.receipts.slice(0, -1), source.before.receipts, "Earlier receipts preserved");
      }
      assertSafeEqual(event.after, actionSnapshot(action), "Complete creation snapshot");
      expect(receipt).toMatchObject({ actorId: source.actor.user.id, actionId: action.id, ticketId: source.parent.id,
        clientMutationId: source.input.clientMutationId, operation: operation === "create" ? "CREATE_ACTION" : "EDIT_ACTION" });
      fixtures.read.assertDTO(responses[index].body.action, action);
      assertSafeEqual(receipt.safeResponse, responses[index].body, "One exact authoritative receipt");
      expect(after.ticket.updatedAt.getTime()).toBeGreaterThan(source.before.ticket.updatedAt.getTime());
      expect(after.ticket.updatedAt.toISOString()).toBe(action.updatedAt.toISOString());
      expect(responses[index].body.ticketUpdatedAt).toBe(action.updatedAt.toISOString());
      assertSafeEqual({ ...after.ticket, updatedAt: source.before.ticket.updatedAt }, source.before.ticket, "Only parent time advances");
      expect(evidence[index].attempts.length).toBeLessThanOrEqual(3);
    }
  } finally {
    release.resolve(); await Promise.allSettled(pending); restore?.();
    try { await fixtures.cleanup(); } finally { await getPrisma().$disconnect(); await native.end(); }
    const directory = resolve(serverDirectory, "../artifacts/lab-04/hardening"); mkdirSync(directory, { recursive: true });
    const filename = `independent-create-red-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}.json`;
    writeFileSync(resolve(directory, filename), JSON.stringify({ mode: "all-success-application-regression", operation, commands: evidence,
      cleanup: { operationsDrained: true, observerRestored: true, fixturesRemoved: true, clientDisconnected: true } }) + "\n", { flag: "wx" });
    console.info(`Independent CREATE regression evidence: ${filename}`);
  }
}, 120_000);
