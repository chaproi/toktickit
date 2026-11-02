import { waitForWriteAdmission } from "./write-admission-test-helpers.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { execFileSync } from "node:child_process";
import { randomUUID, randomInt } from "node:crypto";
import { setTimeout as wait } from "node:timers/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Prisma } from "@prisma/client";
import { Client } from "pg";
import { expect, it, vi } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { ActionCreateFixtures, type CreateActor } from "./action-create-test-fixtures.js";
import { actionSnapshot, assertSafeEqual, assertSafeError, LITERAL } from "./action-read-test-fixtures.js";
import { retryState } from "./action-retry-test-helpers.js";
import { rejectionEvidence } from "./create-contention-evidence.js";
import { query, serverDirectory, verifiedTestTarget } from "./migration-test-fixtures.js";
import { observeCreateQueries, type PlannerMode } from "./create-query-observer.js";

const deferred = () => { let resolve!: () => void;
  const promise = new Promise<void>(accept => { resolve = accept; }); return { promise, resolve }; };
async function finite<T>(work: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("CREATE diagnostic coordination failed; not semantic RED.")), 2500);
  })]); } finally { if (timer) clearTimeout(timer); }
}

type Attempt = { number: number; backend?: number; xid?: string; isolation?: string;
  gates: boolean[]; gateRestartExecuted: boolean; callbackReturned: boolean;
  queries: Array<{ operation: string; elapsedMs: number; sqlState?: string }>;
  retryDelayMs?: number;
  missingReceipt?: boolean; rejection?: ReturnType<typeof rejectionEvidence>; rollbackExact?: boolean };
type Command = { label: string; phase: "concurrent" | "serial"; attempts: Attempt[];
  status?: number; errorCode?: string; exactPersistence?: boolean };
type Source = { actor: CreateActor; parent: Awaited<ReturnType<ActionCreateFixtures["parent"]>>;
  input: Record<string, unknown>; command: Command; before: Awaited<ReturnType<typeof retryState>> };

// Bounded correctness/causality diagnostic, NOT a performance workload.
// Eight distinct self-assigned authenticated actors and Ticket/key targets.
// A barrier after real missing-receipt reads coordinates only first attempts.
// No SQL fault, synthetic dependency, query-plan setting or HTTP retry.
it("attributes eight independent concurrent CREATE commands before choosing a T-47 correction", async () => {
  const fixtures = new ActionCreateFixtures(), context = new AsyncLocalStorage<Command>();
  const attemptContext = new AsyncLocalStorage<Attempt>();
  const mode = (process.env.TOKTICKIT_CREATE_PLANNER_DIAGNOSTIC ?? "default") as PlannerMode;
  expect(["default", "ticket-index", "receipt-index", "both-index", "retry-jitter"]).toContain(mode);
  const ready = deferred(), release = deferred(); let arrivals = 0;
  const pending: Promise<unknown>[] = [], commands: Command[] = [];
  const report: Record<string, unknown> = { mode: "bounded-create-diagnosis-not-T47", startedAt: new Date().toISOString(),
    executionHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim(),
    node: process.version, commands, cleanup: {}, businessRequestsPlanned: 16 };
  let native: Client | undefined, restore: (() => void) | undefined, connected = false, stage = "guard";
  let failure: unknown;
  let observation: ReturnType<typeof observeCreateQueries> | undefined;
  try {
    const target = verifiedTestTarget();
    native = new Client({ connectionString: target.databaseUrl });
    await native.connect(); connected = true;
    const live = (await query<{ database: string; version: string }>(native,
      "SELECT current_database() AS database,current_setting('server_version_num') AS version")).rows[0];
    expect(live.database === target.identity.databaseName, "Live dedicated target matches guard; identity redacted").toBe(true);
    report.postgresVersionNumber = live.version;
    observation = observeCreateQueries(native, mode, () => {
      const command = context.getStore(), attempt = attemptContext.getStore();
      return command && attempt ? { label: command.label, attempt: attempt.number, backend: attempt.backend, queries: attempt.queries } : undefined;
    }, report);
    stage = "fixtures"; await fixtures.initialize();
    const actors = [];
    for (let index = 0; index < 8; index++) actors.push(await fixtures.read.actor(`contention-${index}`, "IT_STAFF"));
    const sources: Source[] = [];
    for (const phase of ["concurrent", "serial"] as const) {
      for (const [index, actor] of actors.entries()) {
        const parent = await fixtures.parent();
        const input = fixtures.input(parent, actor.user.id);
        const command: Command = { label: `${phase}-${index + 1}`, phase, attempts: [] };
        commands.push(command);
        sources.push({ actor, parent, input, command, before: await retryState(fixtures.prisma, parent.id) });
      }
    }
    expect(new Set(actors.map(actor => actor.user.id)).size).toBe(8);
    expect(new Set(sources.map(source => source.parent.id)).size).toBe(16);
    expect(new Set(sources.map(source => source.input.clientMutationId)).size).toBe(16);
    report.fixtureScale = (await native.query(`SELECT
      (SELECT count(*)::int FROM "Ticket") AS tickets,(SELECT count(*)::int FROM "MutationReceipt") AS receipts,
      (SELECT count(*)::int FROM "User") AS users,(SELECT count(*)::int FROM "AuthSession") AS sessions`)).rows[0];
    report.independentActorAssigneeTicketKeysVerified = true;
    const db = getPrisma(), original = db.$transaction.bind(db);
    const spy = vi.spyOn(db, "$transaction").mockImplementation((...args: unknown[]) => {
      const command = context.getStore();
      if (!command || typeof args[0] !== "function" ||
          (args[1] as { isolationLevel?: string } | undefined)?.isolationLevel !== "Serializable") {
        return Reflect.apply(original, db, args);
      }
      const source = sources.find(value => value.command === command)!;
      const attempt: Attempt = { number: command.attempts.length + 1, gates: [], queries: [],
        gateRestartExecuted: false, callbackReturned: false };
      command.attempts.push(attempt);
      const callback = args[0] as (tx: Prisma.TransactionClient) => Promise<unknown>;
      const run = () => attemptContext.run(attempt, () => Reflect.apply(original, db, [async (tx: Prisma.TransactionClient) => {
        // Same public observation as the earlier diagnostic. This extra SELECT
        // precedes gates and may affect scheduling; this is not a timing run.
        const [identity] = await tx.$queryRaw<Array<{ backend: number; xid: string; isolation: string }>>`
          SELECT pg_backend_pid()::int AS backend,txid_current()::text AS xid,
            current_setting('transaction_isolation') AS isolation`;
        Object.assign(attempt, identity);
        const observed = new Proxy(tx, { get(target, property) {
          const value = Reflect.get(target, property);
          if (property === "$queryRaw" || property === "$executeRaw") return async (...raw: unknown[]) => {
            const fragments = Array.isArray(raw[0]) ? raw[0] :
              raw[0] !== null && typeof raw[0] === "object" && "strings" in raw[0] ? raw[0].strings : [];
            const text = Array.isArray(fragments) ? fragments.join("") : "";
            // Observe execution of the known gate statement, never infer it
            // from an error message or use it to change retry classification.
            if (property === "$executeRaw" && text.includes("Mutation gate wait requires a fresh serializable snapshot.")) {
              attempt.gateRestartExecuted = true;
            }
            const result = await Reflect.apply(value, target, raw);
            if (text.includes("pg_try_advisory_xact_lock") && Array.isArray(result)) {
              attempt.gates.push(result[0]?.acquired === true);
            }
            return result;
          };
          if (property === "mutationReceipt") return new Proxy(value, { get(delegate, method) {
            const call = Reflect.get(delegate, method);
            if (method !== "findUnique") return typeof call === "function" ? call.bind(delegate) : call;
            return async (...input: unknown[]) => {
              const result = await Reflect.apply(call, delegate, input);
              attempt.missingReceipt = result === null;
              if (command.phase === "concurrent" && attempt.number === 1 && result === null) {
                if (++arrivals === 1) { ready.resolve(); await finite(release.promise); }
              }
              return result;
            };
          } });
          return typeof value === "function" ? value.bind(target) : value;
        } });
        const result = await callback(observed); attempt.callbackReturned = true; return result;
      }, ...args.slice(1)]));
      const previousAttempt = command.attempts.at(-2);
      const work = mode === "retry-jitter" && attempt.number > 1 && previousAttempt?.rejection?.sqlStates.includes("40001")
        ? (async () => {
          // One finite test-only contrast, not a fourth attempt or an HTTP
          // retry. Delay is outside the completed/rolled-back transaction.
          attempt.retryDelayMs = randomInt(1, (attempt.number === 2 ? 64 : 128) + 1);
          await wait(attempt.retryDelayMs); return run();
        })() : run();
      return work.catch(async (error: unknown) => {
        attempt.rejection = rejectionEvidence(error, attempt.gateRestartExecuted, attempt.callbackReturned);
        // Real transaction completion/rejection precedes this independent read.
        // This command has a unique parent; no other command can alter it.
        const rollback = await retryState(fixtures.prisma, source.parent.id);
        assertSafeEqual(rollback, source.before, "Failed attempt rollback is exact before retry");
        attempt.rollbackExact = true; throw error;
      });
    });
    restore = () => spy.mockRestore();
    const send = (source: typeof sources[number]) => {
      const work = context.run(source.command, async () => {
        const response = await fixtures.post(fixtures.path(source.parent.id), source.input, source.actor);
        source.command.status = response.status;
        if (response.status !== 201) {
          assertSafeError(response, 409, "CONCURRENT_UPDATE"); source.command.errorCode = "CONCURRENT_UPDATE";
        }
        const after = await retryState(fixtures.prisma, source.parent.id);
        if (response.status === 201) {
          expect(after.actions).toHaveLength(1); expect(after.history).toHaveLength(1); expect(after.receipts).toHaveLength(1);
          const action = after.actions[0], history = after.history[0], receipt = after.receipts[0];
          fixtures.read.assertDTO(response.body.action, action);
          assertSafeEqual(action, { id: action.id, ticketId: source.parent.id,
            createdById: source.actor.user.id, assigneeId: source.actor.user.id, performedById: null,
            description: LITERAL, result: null, followUpRequired: false, followUpNote: null, attachmentNotes: null,
            status: "PLANNED", version: 1, actionAt: action.updatedAt, createdAt: action.updatedAt, updatedAt: action.updatedAt,
            completedAt: null, cancelledAt: null, cancellationReason: null }, "One exact intended creation");
          expect(history).toMatchObject({ actionId: action.id, actorId: source.actor.user.id, actionVersion: 1, event: "ACTION_CREATED", before: null });
          assertSafeEqual(history.after, actionSnapshot(action), "Exact committed creation snapshot");
          expect(receipt).toMatchObject({ actorId: source.actor.user.id, ticketId: source.parent.id,
            actionId: action.id, clientMutationId: source.input.clientMutationId, operation: "CREATE_ACTION" });
          assertSafeEqual(receipt.safeResponse, response.body, "One exact authoritative receipt");
          expect(after.ticket.updatedAt.getTime()).toBeGreaterThan(source.parent.updatedAt.getTime());
          expect(after.ticket.updatedAt.toISOString()).toBe(action.updatedAt.toISOString());
          expect(response.body.ticketUpdatedAt).toBe(action.updatedAt.toISOString());
          assertSafeEqual({ ...after.ticket, updatedAt: source.parent.updatedAt }, source.parent, "Only parent time advances");
        } else {
          assertSafeEqual(after, source.before, "Exhausted command leaves no domain writes");
          expect(source.command.attempts).toHaveLength(3);
        }
        expect(source.command.attempts.length).toBeLessThanOrEqual(3);
        for (const attempt of source.command.attempts) {
          expect(attempt.isolation).toBe("serializable");
          if (attempt.rejection) { expect(attempt.rejection.sqlStates).toContain("40001"); expect(attempt.rollbackExact).toBe(true); }
        }
        source.command.exactPersistence = true;
      });
      // Observe rejection immediately while the coordinator is still waiting.
      void work.catch(() => undefined); pending.push(work); return work;
    };
    stage = "concurrent-cohort";
    const cohort = sources.filter(source => source.command.phase === "concurrent").map(send);
    let coordinationFailure: unknown;
    try {
      await finite(ready.promise);
      const waiting = await waitForWriteAdmission(native, target.identity.schema, 7);
      report.observedAdmissionWaiters = waiting.length;
      const backends = [...commands.slice(0, 8).flatMap(command => command.attempts.map(attempt => attempt.backend).filter((pid): pid is number => pid !== undefined)), ...waiting];
      expect(new Set(backends).size).toBe(8);
      report.locksAtMissingReceiptBarrier = (await query(native, `SELECT l.pid AS backend,l.locktype,l.mode,l.granted,
        c.relname AS relation,l.page,l.tuple FROM pg_locks l LEFT JOIN pg_class c ON c.oid=l.relation
        LEFT JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE l.pid=ANY($1::int[]) AND (n.nspname=$2 OR l.relation IS NULL)
        ORDER BY l.pid,l.locktype,l.mode,c.relname,l.page,l.tuple`, [backends, target.identity.schema])).rows;
    } catch (error) { coordinationFailure = error; }
    finally { release.resolve(); }
    const outcomes = await Promise.allSettled(cohort);
    if (coordinationFailure) throw coordinationFailure;
    if (outcomes.some(outcome => outcome.status === "rejected")) {
      throw new Error("Concurrent CREATE diagnostic domain/transport check failed; consult safe artifact.");
    }
    stage = "serial-controls";
    for (const source of sources.filter(source => source.command.phase === "serial")) {
      await send(source); expect(source.command.status).toBe(201);
    }
    report.observationCompleted = true;
    report.concurrentExhaustions = commands.slice(0, 8).filter(command => command.status === 409).length;
    // Deliberately no T-47 pass or identified dependency claim here. A lock
    // snapshot is evidence of overlap, not proof of the dangerous structure.
  } catch (error) {
    failure = error; report.failure = { stage, kind: "diagnostic-infrastructure-or-domain-check", ...rejectionEvidence(error, false, false) };
  } finally {
    release.resolve(); await Promise.allSettled(pending); restore?.();
    await observation?.drain(); observation?.restore();
    const cleanup: Record<string, unknown> = { operationsDrained: true, transactionObserverRestored: true };
    try { await fixtures.cleanup(); cleanup.ownedFixturesRemoved = true; }
    catch (error) { failure ??= error; cleanup.ownedFixturesRemoved = false; }
    try {
      await getPrisma().$disconnect(); cleanup.applicationDisconnected = true;
      if (connected && native) {
        cleanup.idleTransactions = (await query<{ count: number }>(native,
          "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND state LIKE 'idle in transaction%' AND pid<>pg_backend_pid()"))
          .rows[0].count;
        expect(cleanup.idleTransactions).toBe(0);
      }
    } catch (error) { failure ??= error; cleanup.applicationDisconnected = false; }
    try { if (native) await native.end(); cleanup.observerDisconnected = true; }
    catch (error) { failure ??= error; cleanup.observerDisconnected = false; }
    report.cleanup = cleanup; report.finishedAt = new Date().toISOString();
    const directory = resolve(serverDirectory, "../artifacts/lab-04/hardening"); mkdirSync(directory, { recursive: true });
    const filename = `t47-create-contention-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}.json`;
    writeFileSync(resolve(directory, filename), `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    console.info(`CREATE diagnostic artifact: ${filename}; not a T-47 verdict.`);
  }
  if (failure) throw new Error("Bounded CREATE diagnosis failed; no application GREEN or causal finding is claimed.");
}, 120_000);
