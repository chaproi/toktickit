import { Prisma, type PrismaClient } from "@prisma/client";
import { expect, vi } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { configureTestDatabaseEnvironment } from "../../src/testing/test-database.js";

export type LateFault = "40001" | "23505" | "40P01" | Error;
export type AttemptEvidence = {
  attempt: number; transactionId: string; isolation: string;
  stages: string[]; actorActive?: boolean; actorRole?: string; sessionFound?: boolean;
  assigneeActive?: boolean; assigneeRole?: string; parentUpdatedAt?: string; actionVersion?: number;
  staged?: Awaited<ReturnType<typeof retryState>>; rolledBack?: Awaited<ReturnType<typeof retryState>>;
  errorClass?: string; code?: string | null; sqlState?: string | null;
};
export async function retryState(client: Pick<Prisma.TransactionClient, "ticket" | "action" | "actionHistory" | "mutationReceipt">, ticketId: number) {
  const [ticket, actions, history, receipts] = await Promise.all([
    client.ticket.findUniqueOrThrow({ where: { id: ticketId } }),
    client.action.findMany({ where: { ticketId }, orderBy: { id: "asc" } }),
    client.actionHistory.findMany({ where: { action: { ticketId } }, orderBy: { id: "asc" } }),
    client.mutationReceipt.findMany({ where: { ticketId }, orderBy: { id: "asc" } }),
  ]);
  return { ticket, actions, history, receipts };
}

// Test-local boundary fault, not a naturally occurring PostgreSQL race. The
// supplied application callback, authorization, gates and ALL writes are real.
export async function withLateActionFaults(
  input: { fixture: PrismaClient; ticketId: number; actorId: number; assigneeId: number; faults: LateFault[];
    afterRollback?: (attempt: AttemptEvidence) => Promise<void> },
  work: (attempts: AttemptEvidence[]) => Promise<void>,
) {
  const identity = configureTestDatabaseEnvironment();
  const operational = process.env.TOKTICKIT_DEVELOPMENT_DATABASE_URL;
  if (!operational || decodeURIComponent(new URL(operational).pathname.slice(1)) === identity.databaseName) throw new Error("Dedicated retry test target required.");
  const [live] = await input.fixture.$queryRaw<Array<{ database: string; schema: string }>>`SELECT current_database() AS database,current_schema() AS schema`;
  expect(live.database === identity.databaseName && live.schema === identity.schema, "Retry fixture matches guarded live target; identifiers redacted").toBe(true);
  const prisma = getPrisma();
  type Operation = (tx: Prisma.TransactionClient) => Promise<unknown>;
  type Options = { isolationLevel?: Prisma.TransactionIsolationLevel };
  const original = prisma.$transaction.bind(prisma) as (operation: Operation, options?: Options) => Promise<unknown>;
  const attempts: AttemptEvidence[] = [];
  let external = false;
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const spy = vi.spyOn(prisma, "$transaction").mockImplementation((async (operation: unknown, options?: Options) => {
    if (external || options?.isolationLevel !== Prisma.TransactionIsolationLevel.Serializable) return original(operation as Operation, options);
    if (typeof operation !== "function") throw new Error("Focused retry observer requires an interactive application transaction.");
    const record: AttemptEvidence = { attempt: attempts.length + 1, transactionId: "", isolation: "", stages: [] };
    attempts.push(record);
    try {
      return await original(async (tx) => {
        const [transaction] = await tx.$queryRaw<Array<{ id: string; isolation: string }>>`SELECT txid_current()::text AS id,current_setting('transaction_isolation') AS isolation`;
        record.transactionId = transaction.id; record.isolation = transaction.isolation;
        const observed = new Proxy(tx, {
          get(target, property) {
            const value = Reflect.get(target, property);
            if (property !== "$queryRaw") return typeof value === "function" ? value.bind(target) : value;
            return async (...args: unknown[]) => {
              // Inspect template fragments in memory only; never log SQL,
              // interpolated parameters, session rows or arbitrary metadata.
              const fragments = Array.isArray(args[0]) ? args[0] :
                typeof args[0] === "object" && args[0] !== null && "strings" in args[0] ? args[0].strings : [];
              const text = Array.isArray(fragments) ? fragments.join("") : "";
              const stage = /FROM "User".*FOR UPDATE/su.test(text) ? "users" : /FROM "AuthSession"/u.test(text) ? "session" :
                /FROM "Ticket".*FOR UPDATE/su.test(text) ? "ticket" : /FROM "Action".*FOR UPDATE/su.test(text) ? "action" : null;
              const rows: unknown = await Reflect.apply(value, target, args);
              if (stage && Array.isArray(rows)) {
                record.stages.push(stage);
                const safeRows = rows as Array<Record<string, unknown>>;
                if (stage === "users") {
                  const actor = safeRows.find((row) => row.id === input.actorId), assignee = safeRows.find((row) => row.id === input.assigneeId);
                  record.actorActive = actor?.isActive === true;
                  record.actorRole = typeof actor?.role === "string" ? actor.role : undefined;
                  record.assigneeActive = assignee?.isActive === true;
                  record.assigneeRole = typeof assignee?.role === "string" ? assignee.role : undefined;
                } else if (stage === "session") record.sessionFound = rows.length === 1;
                else if (stage === "ticket" && safeRows[0]?.updatedAt instanceof Date) record.parentUpdatedAt = safeRows[0].updatedAt.toISOString();
                else if (stage === "action" && typeof safeRows[0]?.version === "number") record.actionVersion = safeRows[0].version;
              }
              return rows;
            };
          },
        });
        const result = await (operation as Operation)(observed);
        record.staged = await retryState(tx, input.ticketId);
        const fault = input.faults[record.attempt - 1];
        if (typeof fault === "string") {
          // Only the closed, explicit SQLSTATE allowlist can reach this SQL.
          if (!["40001", "23505", "40P01"].includes(fault)) throw new Error("Invalid test fault code.");
          await tx.$executeRawUnsafe(`DO $fault$ BEGIN RAISE EXCEPTION 'Controlled late Action test fault' USING ERRCODE='${fault}'; END $fault$`);
        } else if (fault) throw fault; // Honest synthetic Prisma/classification fault.
        return result;
      }, options);
    } catch (error) {
      record.errorClass = error instanceof Prisma.PrismaClientKnownRequestError ? "PrismaClientKnownRequestError" : "Error";
      const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : null;
      record.code = code && /^P\d{4}$/u.test(code) ? code : null;
      const sqlState = error instanceof Prisma.PrismaClientKnownRequestError && typeof error.meta?.code === "string" ? error.meta.code : null;
      record.sqlState = sqlState && /^[0-9A-Z]{5}$/u.test(sqlState) ? sqlState : null;
      // The REAL transaction promise has rejected and finished rollback before
      // these independent reads or any external change. Never use aborted tx.
      record.rolledBack = await retryState(input.fixture, input.ticketId);
      if (input.afterRollback) {
        external = true;
        try { await input.afterRollback(record); } finally { external = false; }
      }
      throw error;
    }
  }) as typeof prisma.$transaction);
  try { await work(attempts); }
  finally {
    spy.mockRestore(); log.mockRestore();
    console.info(JSON.stringify({ stage: "controlled-late-fault-evidence", attempts: attempts.length,
      distinctTransactions: new Set(attempts.map((attempt) => attempt.transactionId)).size,
      sqlStates: attempts.map((attempt) => attempt.sqlState ?? null),
      readStages: attempts.map((attempt) => attempt.stages) }));
  }
}
