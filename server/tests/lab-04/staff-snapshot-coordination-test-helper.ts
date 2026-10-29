import { Prisma } from "@prisma/client";
import { expect, vi } from "vitest";
import { getPrisma } from "../../src/prisma.js";

type Observation = { pid: number; isolation: string; readOnly: string; operation: string; transaction: number };
type Seam = "ticket-count" | "action-bins" | "list-count";

export function assertStaffSnapshotEvidence(reads: Observation[], commits: Observation[], point: Observation) {
  expect(commits).toHaveLength(1);
  expect(commits[0]!.pid).not.toBe(point.pid);
  expect(commits[0]!.isolation).toBe("serializable"); expect(commits[0]!.readOnly).toBe("off");
  const original = reads.filter(({ transaction }) => transaction === point.transaction);
  expect(original.length).toBeGreaterThan(1);
  expect(original.at(-1)).not.toBe(point);
  for (const read of reads) {
    expect(read.isolation).toBe("repeatable read"); expect(read.readOnly).toBe("on");
    if (read.transaction === point.transaction) expect(read.pid).toBe(point.pid);
  }
  expect(new Set(reads.map(({ transaction }) => transaction)).size).toBe(2);
  console.info(`Staff snapshot ${point.operation}: real completed read on backend ${point.pid}; independent writer backend ${commits[0]!.pid} committed before release; original/fresh read-only repeatable-read transactions verified.`);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
async function bounded<T>(promise: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Staff snapshot coordination barrier was not reached/released.")), 2_500);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

// Transparent extension of the existing Dashboard read probe: additionally
// observes Action bins and the extended list's actual raw COUNT. No clocks,
// SQL, arguments, results, errors or transaction options are substituted.
// Writer callbacks remain real SERIALIZABLE application mutations. Their
// original transaction promise must resolve (COMMIT) before release is allowed.
export async function withStaffSnapshot<T>(seam: Seam, work: (probe: {
  reads: Observation[]; commits: Observation[]; waitForRead(): Promise<Observation>;
  release(): void; track<R>(request: PromiseLike<R>): Promise<R>;
}) => Promise<T>): Promise<T> {
  const application = getPrisma();
  type Operation = (tx: Prisma.TransactionClient) => Promise<unknown>;
  type Options = { isolationLevel?: Prisma.TransactionIsolationLevel };
  const original = application.$transaction.bind(application) as (operation: Operation, options?: Options) => Promise<unknown>;
  const ready = deferred<Observation>(), resume = deferred<void>();
  const reads: Observation[] = [], commits: Observation[] = [], pending: Promise<unknown>[] = [];
  let paused = false, transaction = 0;
  const release = () => resume.resolve();
  const spy = vi.spyOn(application, "$transaction").mockImplementation((async (operation: unknown, options?: Options) => {
    if (typeof operation !== "function") return original(operation as Operation, options);
    const id = ++transaction;
    let writer: Observation | undefined;
    const result = await original(async (tx) => {
      async function observe(operationName: string): Promise<Observation> {
        const [actual] = await tx.$queryRaw<Array<{ pid: number; isolation: string; readOnly: string }>>`
          SELECT pg_backend_pid() AS pid,current_setting('transaction_isolation') AS isolation,
            current_setting('transaction_read_only') AS "readOnly"`;
        return { ...actual, operation: operationName, transaction: id };
      }
      if (options?.isolationLevel === Prisma.TransactionIsolationLevel.Serializable) {
        writer = await observe("application writer");
        return (operation as Operation)(tx);
      }
      if (options?.isolationLevel !== Prisma.TransactionIsolationLevel.RepeatableRead) return (operation as Operation)(tx);
      async function completed(operationName: string, matches: boolean) {
        const observation = await observe(operationName);
        reads.push(observation);
        if (matches && !paused) {
          paused = true; // Relevant business SQL has ALREADY completed.
          ready.resolve(observation);
          await bounded(resume.promise);
        }
      }
      const wrapped = new Proxy(tx, { get(target, property) {
        const value = Reflect.get(target, property);
        if (property === "$queryRaw") return async (...args: unknown[]) => {
          const result: unknown = await Reflect.apply(value, target, args);
          const sql = args[0] as { strings?: string[] } | undefined;
          if (sql?.strings !== undefined) {
            const count = sql.strings.join(" ").includes("SELECT COUNT(*) FILTER");
            await completed(count ? "raw list count" : "raw list rows", seam === "list-count" && count);
          }
          return result;
        };
        if (property === "ticket" || property === "ticketStatusHistory" || property === "action") return new Proxy(value, { get(delegate, method) {
          const call = Reflect.get(delegate, method);
          if (typeof call !== "function") return call;
          return async (...args: unknown[]) => {
            const result: unknown = await Reflect.apply(call, delegate, args);
            await completed(`${String(property)}.${String(method)}`,
              (seam === "ticket-count" && property === "ticket" && method === "count") ||
              (seam === "action-bins" && property === "action" && method === "groupBy"));
            return result;
          };
        } });
        return typeof value === "function" ? value.bind(target) : value;
      } });
      return (operation as Operation)(wrapped);
    }, options);
    if (writer !== undefined) commits.push(writer); // Only after real COMMIT acknowledgement.
    return result;
  }) as typeof application.$transaction);
  try {
    return await work({ reads, commits, waitForRead: () => bounded(ready.promise), release,
      track<R>(request: PromiseLike<R>) {
        const promise = Promise.resolve(request);
        pending.push(promise.then(() => undefined, () => undefined)); return promise;
      } });
  } finally { release(); await Promise.all(pending); spy.mockRestore(); }
}
