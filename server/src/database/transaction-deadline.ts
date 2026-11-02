import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaClient, Prisma } from "@prisma/client";
import type { SqlDriverAdapterFactory } from "@prisma/driver-adapter-utils";

type Options = { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel };
type Attempt = { options: Required<Pick<Options, "maxWait" | "timeout">> & Options;
  phase: "waiting" | "entered" | "expired" | "finished"; timer?: ReturnType<typeof setTimeout>;
  reject: (error: unknown) => void };
export class TransactionStartDeadlineError extends Error {
  readonly code = "P2028";
  readonly meta: { phase: string; maxWait: number };
  constructor(maxWait: number) {
    super("Transaction startup deadline exceeded."); this.name = "TransactionStartDeadlineError";
    this.meta = { phase: "transaction-start", maxWait };
  }
}
export function deadlineClient(options: Prisma.PrismaClientOptions & { adapter: SqlDriverAdapterFactory }, mapError: (error: unknown) => unknown = error => error) {
  const context = new AsyncLocalStorage<Attempt>();
  const pending = new Set<Promise<unknown>>();
  const statistics = { started: 0, expired: 0, callbackEntered: 0, lateResolved: 0, lateRejected: 0 };
  let closing = false;
  const stopTimer = (attempt: Attempt) => { if (attempt.timer) clearTimeout(attempt.timer); attempt.timer = undefined; };
  const adapter: SqlDriverAdapterFactory = { adapterName: options.adapter.adapterName, provider: options.adapter.provider,
    connect: async () => {
      const actual = await options.adapter.connect();
      return { provider: actual.provider, adapterName: actual.adapterName,
        queryRaw: actual.queryRaw.bind(actual), executeRaw: actual.executeRaw.bind(actual),
        executeScript: actual.executeScript.bind(actual), dispose: actual.dispose.bind(actual),
        ...(actual.getConnectionInfo ? { getConnectionInfo: actual.getConnectionInfo.bind(actual) } : {}),
        startTransaction: level => {
          const attempt = context.getStore();
          if (attempt?.phase === "waiting" && !attempt.timer) {
            statistics.started++;
            attempt.timer = setTimeout(() => {
              if (attempt.phase !== "waiting") return;
              attempt.phase = "expired"; statistics.expired++; attempt.timer = undefined;
              attempt.reject(new TransactionStartDeadlineError(attempt.options.maxWait));
            }, attempt.options.maxWait);
          }
          // Do not abandon the start result or throw merely because its caller
          // expired. Prisma must receive it so normal rollback/release can drain
          // it; the guarded public callback below can never run business code.
          return actual.startTransaction(level);
        } };
    } };
  const actual = new PrismaClient({ ...options, adapter });
  const baseTransaction = actual.$transaction;
  const baseDisconnect = actual.$disconnect.bind(actual);
  const baseConnect = actual.$connect.bind(actual);
  const defaults = { maxWait: options.transactionOptions?.maxWait ?? 2000,
    timeout: options.transactionOptions?.timeout ?? 5000,
    isolationLevel: options.transactionOptions?.isolationLevel };
  const track = <T>(work: Promise<T>): Promise<T> => {
    pending.add(work); void work.then(() => pending.delete(work), () => pending.delete(work)); return work;
  };
  const drain = async () => { while (pending.size) await Promise.allSettled([...pending]); };
  function transact(this: PrismaClient, input: unknown, supplied?: Options) {
    // Preserve a public $extends receiver; binding every call to the original
    // client would silently drop its query extensions inside transactions.
    const receiver = this ?? actual;
    if (closing) return Promise.reject(new Error("Database client is draining."));
    if (typeof input !== "function") return track(Reflect.apply(baseTransaction, receiver, [input, supplied]));
    const effective = { maxWait: supplied?.maxWait ?? defaults.maxWait,
      timeout: supplied?.timeout ?? defaults.timeout, isolationLevel: supplied?.isolationLevel ?? defaults.isolationLevel };
    return new Promise((resolve, reject) => {
      const attempt: Attempt = { options: effective, phase: "waiting", reject };
      let work: Promise<unknown>;
      try {
        work = context.run(attempt, () => Reflect.apply(baseTransaction, receiver, [
          async (transaction: Prisma.TransactionClient) => {
            if (attempt.phase === "expired") throw new TransactionStartDeadlineError(effective.maxWait);
            stopTimer(attempt); attempt.phase = "entered"; statistics.callbackEntered++;
            return input(transaction);
          }, effective,
        ]));
      } catch (error) { stopTimer(attempt); attempt.phase = "finished"; reject(error); return; }
      track(work);
      void work.then(value => {
        stopTimer(attempt);
        if (attempt.phase === "expired") statistics.lateResolved++;
        else resolve(value);
        attempt.phase = "finished";
      }, error => {
        stopTimer(attempt);
        if (attempt.phase === "expired") statistics.lateRejected++;
        else reject(mapError(error));
        attempt.phase = "finished";
      });
    });
  };
  // Prisma's composite proxy does not expose added property descriptors like
  // an ordinary object. Keep only the three public overrides on an ordinary
  // descriptor target so public spying/restoration cannot erase the method.
  const methods: Record<PropertyKey, unknown> = {
    $transaction: transact,
    $disconnect: async () => {
      closing = true;
      try { await drain(); await baseDisconnect(); } finally { closing = false; }
    },
    $connect: async () => {
      if (closing) throw new Error("Database client is draining."); await baseConnect();
    },
  };
  const owns = (property: PropertyKey) => Object.prototype.hasOwnProperty.call(methods, property);
  const publicKeys = new Set<PropertyKey>(Reflect.ownKeys(methods));
  const client = new Proxy(actual, {
    get(target, property, receiver) {
      return owns(property) ? Reflect.get(methods, property, receiver) : Reflect.get(target, property, receiver);
    },
    set(target, property, value, receiver) {
      return publicKeys.has(property) ? Reflect.set(methods, property, value) : Reflect.set(target, property, value, receiver);
    },
    defineProperty(target, property, descriptor) {
      return publicKeys.has(property) ? Reflect.defineProperty(methods, property, descriptor) : Reflect.defineProperty(target, property, descriptor);
    },
    getOwnPropertyDescriptor(target, property) {
      return publicKeys.has(property) ? Reflect.getOwnPropertyDescriptor(methods, property) : Reflect.getOwnPropertyDescriptor(target, property);
    },
    deleteProperty(target, property) {
      return publicKeys.has(property) ? Reflect.deleteProperty(methods, property) : Reflect.deleteProperty(target, property);
    },
    ownKeys(target) { return [...new Set([...Reflect.ownKeys(target), ...Reflect.ownKeys(methods)])]; },
    has(target, property) { return owns(property) || Reflect.has(target, property); },
  });
  return { client, drain, pendingCount: () => pending.size, statistics };
}
