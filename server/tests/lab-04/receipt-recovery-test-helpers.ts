import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient, type MutationReceipt } from "@prisma/client";
import { expect, vi } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { configureTestDatabaseEnvironment } from "../../src/testing/test-database.js";
import { actionSnapshot, assertSafeEqual } from "./action-read-test-fixtures.js";

export type RecoveryFault = "missing" | "unavailable" | "unexpected" | "40001";
export type RecoveryEvidence = {
  mutationTransactions: number; recoveryTransactions: number; recoveryReceiptReads: number;
  recoveryWrites: number; recoveryIsolation: string[]; transactionIds: string[];
  independentObserver: boolean; rolledBack: boolean; staged: boolean;
  collision?: { code: string; modelName: string; target: string[]; constraint: string };
};

export async function ownedReceiptState(client: Prisma.TransactionClient | PrismaClient, ticketIds: number[]) {
  const scope = { ticketId: { in: ticketIds } };
  const [tickets, actions, history, receipts] = await Promise.all([
    client.ticket.findMany({ where: { id: { in: ticketIds } }, orderBy: { id: "asc" } }),
    client.action.findMany({ where: scope, orderBy: { id: "asc" } }),
    client.actionHistory.findMany({ where: { action: scope }, orderBy: { id: "asc" } }),
    client.mutationReceipt.findMany({ where: scope, orderBy: { id: "asc" } }),
  ]);
  return { tickets, actions, history, receipts };
}

// AC-42/T-51: a defensive-entry harness, NOT a cooperating-writer race.
// It never suppresses the application's receipt lookup or fabricates a response.
export async function withReceiptCollision(
  input: { receipt: MutationReceipt; ticketIds: number[]; witnessActionId: number;
    recoveryFault?: RecoveryFault; afterRollback?: (observer: PrismaClient) => Promise<void> },
  work: (evidence: RecoveryEvidence) => Promise<void>,
) {
  const identity = configureTestDatabaseEnvironment();
  const operational = process.env.TOKTICKIT_DEVELOPMENT_DATABASE_URL;
  if (!operational || decodeURIComponent(new URL(operational).pathname.slice(1)) === identity.databaseName) {
    throw new Error("A distinct dedicated test database is required.");
  }
  const observer = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const evidence: RecoveryEvidence = { mutationTransactions: 0, recoveryTransactions: 0, recoveryReceiptReads: 0,
    recoveryWrites: 0, recoveryIsolation: [], transactionIds: [], independentObserver: false, rolledBack: false, staged: false };
  type Operation = (tx: Prisma.TransactionClient) => Promise<unknown>;
  type Options = { isolationLevel?: Prisma.TransactionIsolationLevel; maxWait?: number; timeout?: number };
  const application = getPrisma();
  const original = application.$transaction.bind(application) as (operation: Operation, options?: Options) => Promise<unknown>;
  let rollbackCompleted = false;
  let spy: { mockRestore(): void } | undefined;
  try {
    const [live] = await observer.$queryRaw<Array<{ database: string; schema: string; pid: number }>>`
      SELECT current_database() AS database,current_schema() AS schema,pg_backend_pid() AS pid`;
    expect(live.database === identity.databaseName && live.schema === identity.schema, "Independent observer matches live isolation guard; identifiers redacted").toBe(true);
    const [index] = await observer.$queryRaw<Array<{ present: boolean }>>`SELECT EXISTS (
      SELECT 1 FROM pg_indexes WHERE schemaname=current_schema() AND tablename='MutationReceipt'
        AND indexname='MutationReceipt_actorId_clientMutationId_key'
        AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%("actorId", "clientMutationId")%') AS present`;
    expect(index.present).toBe(true);
    const before = await ownedReceiptState(observer, input.ticketIds);
    spy = vi.spyOn(application, "$transaction").mockImplementation((async (operation: unknown, options?: Options) => {
      if (typeof operation !== "function") throw new Error("Receipt harness requires real interactive transactions.");
      if (options?.isolationLevel === Prisma.TransactionIsolationLevel.Serializable) {
        evidence.mutationTransactions += 1;
        // Only the first transaction receives the controlled fault. A forbidden
        // mutation re-execution remains observable instead of being hidden.
        const inject = evidence.mutationTransactions === 1;
        try {
          return await original(async (tx) => {
            const [actual] = await tx.$queryRaw<Array<{ id: string; pid: number }>>`SELECT txid_current()::text AS id,pg_backend_pid() AS pid`;
            evidence.transactionIds.push(actual.id);
            evidence.independentObserver = actual.pid !== live.pid;
            const result = await (operation as Operation)(tx); // Real auth, locks and original receipt lookup.
            if (!inject) return result;
            const witness = await tx.action.findUniqueOrThrow({ where: { id: input.witnessActionId } });
            const parent = await tx.ticket.findUniqueOrThrow({ where: { id: witness.ticketId } });
            const at = new Date(Math.max(Date.now(), witness.updatedAt.getTime() + 1, parent.updatedAt.getTime() + 1));
            const after = await tx.action.update({ where: { id: witness.id }, data: {
              description: "Harness-only bounded staged edit", version: { increment: 1 }, updatedAt: at,
            } });
            await tx.actionHistory.create({ data: { actionId: after.id, actorId: input.receipt.actorId,
              event: "ACTION_EDITED", actionVersion: after.version, before: actionSnapshot(witness), after: actionSnapshot(after), createdAt: at } });
            await tx.ticket.update({ where: { id: parent.id }, data: { updatedAt: at } });
            await tx.mutationReceipt.create({ data: { actorId: input.receipt.actorId, clientMutationId: randomUUID(),
              operation: "EDIT_ACTION", ticketId: parent.id, actionId: after.id,
              inputFingerprint: "a".repeat(64), safeResponse: { harness: true }, createdAt: at } });
            // The marker receipt is deliberately test-only and never committed.
            const staged = await ownedReceiptState(tx, input.ticketIds);
            expect(staged.history.length).toBe(before.history.length + 1);
            expect(staged.receipts.length).toBe(before.receipts.length + 1);
            const observed = staged.actions.find((row) => row.id === witness.id)!;
            assertSafeEqual(observed, { ...witness, description: "Harness-only bounded staged edit", version: witness.version + 1, updatedAt: at }, "Harness staged exact Action values");
            expect(staged.tickets.find((row) => row.id === parent.id)!.updatedAt.toISOString()).toBe(at.toISOString());
            evidence.staged = true;
            const { id: _id, ...data } = input.receipt;
            // Actual Prisma insert, actual PostgreSQL uniqueness violation; no invented error object.
            await tx.mutationReceipt.create({ data: { ...data, safeResponse: data.safeResponse as Prisma.InputJsonValue } });
            throw new Error("Real receipt duplicate insert unexpectedly succeeded.");
          }, options);
        } catch (error) {
          if (!inject) throw error;
          if (!(error instanceof Prisma.PrismaClientKnownRequestError)) throw error;
          // Retain only proven safe metadata, never raw messages/queries/values.
          const target = error.meta?.target;
          expect(error.code).toBe("P2002"); expect(error.meta?.modelName).toBe("MutationReceipt");
          expect(target).toEqual(["actorId", "clientMutationId"]);
          evidence.collision = { code: error.code, modelName: "MutationReceipt", target: ["actorId", "clientMutationId"], constraint: "MutationReceipt_actorId_clientMutationId_key" };
          // Rejection of the REAL transaction promise precedes independent reads.
          assertSafeEqual(await ownedReceiptState(observer, input.ticketIds), before, "Every staged domain write rolls back before recovery is permitted");
          evidence.rolledBack = true;
          await input.afterRollback?.(observer);
          rollbackCompleted = true;
          throw error; // Production service must classify this real failure.
        }
      }
      expect(rollbackCompleted, "No recovery transaction before real rollback and independent preservation check").toBe(true);
      evidence.recoveryTransactions += 1;
      expect(evidence.recoveryTransactions, "One bounded recovery read; no polling or additional attempts").toBeLessThanOrEqual(1);
      return original(async (tx) => {
        const [actual] = await tx.$queryRaw<Array<{ id: string; isolation: string }>>`SELECT txid_current()::text AS id,current_setting('transaction_isolation') AS isolation`;
        evidence.transactionIds.push(actual.id); evidence.recoveryIsolation.push(actual.isolation);
        const writes = new Set(["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"]);
        const observed = new Proxy(tx, { get(target, property) {
          const value = Reflect.get(target, property);
          if (typeof value === "object" && value !== null) return new Proxy(value, { get(delegate, method) {
            const call = Reflect.get(delegate, method);
            if (typeof call !== "function") return call;
            return async (...args: unknown[]) => {
              if (writes.has(String(method))) evidence.recoveryWrites += 1;
              const result: unknown = await Reflect.apply(call, delegate, args);
              if (property === "mutationReceipt" && ["findUnique", "findFirst", "findUniqueOrThrow"].includes(String(method))) {
                evidence.recoveryReceiptReads += 1;
                // Only the fresh recovery read is faulted AFTER its real lookup.
                // Missing/dependency outcomes are honestly simulated, not DB races.
                if (input.recoveryFault === "missing") return null;
                if (input.recoveryFault === "unavailable") throw new Prisma.PrismaClientKnownRequestError("Controlled read dependency failure", { code: "P1001", clientVersion: Prisma.prismaVersion.client });
                if (input.recoveryFault === "unexpected") throw new Error("Controlled unexpected recovery read failure");
                if (input.recoveryFault === "40001") await tx.$executeRaw`DO $fault$ BEGIN RAISE EXCEPTION 'Controlled recovery read failure' USING ERRCODE='40001'; END $fault$`;
              }
              return result;
            };
          } });
          if (property === "$executeRaw" || property === "$executeRawUnsafe") evidence.recoveryWrites += 1;
          return typeof value === "function" ? value.bind(target) : value;
        } });
        return (operation as Operation)(observed);
      }, options);
    }) as typeof application.$transaction);
    await work(evidence);
  } finally {
    spy?.mockRestore();
    await observer.$disconnect();
    console.info(JSON.stringify({ stage: "receipt-recovery-boundary", ...evidence, transactionIds: undefined,
      freshTransactions: new Set(evidence.transactionIds).size }));
  }
}

export function assertSingleRecovery(evidence: RecoveryEvidence, receiptRead = true) {
  expect(evidence.staged).toBe(true); expect(evidence.rolledBack).toBe(true); expect(evidence.independentObserver).toBe(true);
  expect(evidence.collision).toEqual({ code: "P2002", modelName: "MutationReceipt", target: ["actorId", "clientMutationId"], constraint: "MutationReceipt_actorId_clientMutationId_key" });
  expect(evidence.mutationTransactions).toBe(1);
  expect(evidence.recoveryTransactions).toBe(1);
  expect(evidence.recoveryIsolation).toEqual(["read committed"]);
  expect(new Set(evidence.transactionIds).size).toBe(2);
  expect(evidence.recoveryWrites).toBe(0);
  expect(evidence.recoveryReceiptReads).toBe(receiptRead ? 1 : 0);
}
