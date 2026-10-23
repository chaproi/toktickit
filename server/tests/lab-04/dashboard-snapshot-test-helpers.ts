import { Prisma } from "@prisma/client";
import { vi } from "vitest";
import { getPrisma } from "../../src/prisma.js";

export type DashboardReadObservation = {
  pid: number; isolation: string; readOnly: string; model: string; method: string;
};
export type DashboardReadProbe = {
  evidence: { transactions: number; clockReads: number; clockOverrides: number;
    reads: DashboardReadObservation[]; countCompleted: boolean; released: boolean };
  waitForCount(): Promise<DashboardReadObservation>;
  release(): void;
  track<T>(request: Promise<T>): Promise<T>;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Dashboard read barrier was not reached/released within its finite coordination budget.")), 2_500);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

// Transparent transaction-boundary observer. All transaction execution,
// controls, counts, row/history queries and HTTP responses remain real. Only
// the exact service clock SELECT result may be replaced for labelled SQL tests.
// No isolation/timeout options are changed and no artificial writes are added.
export async function withDashboardReadProbe<T>(
  input: { clock?: Date; pauseAfterFirstCount?: boolean },
  work: (probe: DashboardReadProbe) => Promise<T>,
): Promise<T> {
  const application = getPrisma();
  type Operation = (tx: Prisma.TransactionClient) => Promise<unknown>;
  type Options = { isolationLevel?: Prisma.TransactionIsolationLevel };
  const original = application.$transaction.bind(application) as (operation: Operation, options?: Options) => Promise<unknown>;
  const ready = deferred<DashboardReadObservation>();
  const resume = deferred<void>();
  const pending: Promise<unknown>[] = [];
  const evidence: DashboardReadProbe["evidence"] = {
    transactions: 0, clockReads: 0, clockOverrides: 0, reads: [], countCompleted: false, released: false,
  };
  const release = () => { evidence.released = true; resume.resolve(); };
  const probe: DashboardReadProbe = {
    evidence, waitForCount: () => bounded(ready.promise), release,
    track(request) {
      // Immediately attach both handlers, then drain before restoring the spy.
      pending.push(request.then(() => undefined, () => undefined));
      return request;
    },
  };
  const spy = vi.spyOn(application, "$transaction").mockImplementation((async (operation: unknown, options?: Options) => {
    if (typeof operation !== "function") return original(operation as Operation, options);
    evidence.transactions += 1;
    return original(async (tx) => {
      const observed = new Proxy(tx, { get(target, property) {
        const value = Reflect.get(target, property);
        if (property === "$queryRaw") return async (...args: unknown[]) => {
          const result: unknown = await Reflect.apply(value, target, args);
          const fragments = Array.isArray(args[0]) ? args[0] : [];
          const isClock = args.length === 1 && fragments.length === 1 &&
            String(fragments[0]).trim().replace(/\s+/gu, " ") === 'SELECT CURRENT_TIMESTAMP AS "asOf"';
          if (!isClock) return result;
          evidence.clockReads += 1;
          if (input.clock === undefined) return result;
          if (!Array.isArray(result) || result.length !== 1 || !(result[0].asOf instanceof Date)) {
            throw new Error("Real Dashboard clock result was not observed.");
          }
          evidence.clockOverrides += 1;
          return [{ ...result[0], asOf: new Date(input.clock.getTime()) }];
        };
        if (property === "ticket" || property === "ticketStatusHistory") {
          return new Proxy(value, { get(delegate, method) {
            const call = Reflect.get(delegate, method);
            if (typeof call !== "function") return call;
            return async (...args: unknown[]) => {
              const [actual] = await tx.$queryRaw<Array<{ pid: number; isolation: string; readOnly: string }>>`
                SELECT pg_backend_pid() AS pid,current_setting('transaction_isolation') AS isolation,
                  current_setting('transaction_read_only') AS "readOnly"`;
              const record = { ...actual, model: String(property), method: String(method) };
              evidence.reads.push(record);
              const result: unknown = await Reflect.apply(call, delegate, args);
              if (property === "ticket" && method === "count" && !evidence.countCompleted) {
                evidence.countCompleted = true; // Actual SQL count finished before the barrier.
                ready.resolve(record);
                if (input.pauseAfterFirstCount) await bounded(resume.promise);
              }
              return result;
            };
          } });
        }
        return typeof value === "function" ? value.bind(target) : value;
      } });
      return (operation as Operation)(observed);
    }, options);
  }) as typeof application.$transaction);
  try { return await work(probe); }
  finally {
    release();
    await Promise.all(pending);
    spy.mockRestore();
  }
}
