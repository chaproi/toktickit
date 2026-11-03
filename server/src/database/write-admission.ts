import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";
import type { PrismaPg } from "@prisma/adapter-pg";
import type { SqlDriverAdapterFactory } from "@prisma/driver-adapter-utils";
import type { PoolClient } from "pg";

const selected = new AsyncLocalStorage<boolean>();
const attempts = new AsyncLocalStorage<AdmissionAttempt | undefined>();
const handoff = new AsyncLocalStorage<{ client: PoolClient; used: boolean }>();
export const ADMISSION_NAMESPACE = 0x544b3441;
export function withWriteAdmission<T>(work: () => T): T { return selected.run(true, work); }
export function newAdmissionAttempt(maxWait: number) { return selected.getStore() ? new AdmissionAttempt(maxWait) : undefined; }
export function admissionContext<T>(attempt: AdmissionAttempt | undefined, work: () => T): T {
  // Selection belongs to this one public transaction call, never to unrelated
  // nested reads. Clear both contexts even when the new call is not selected.
  return selected.run(false, () => attempts.run(attempt, work));
}
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
export class AdmissionDeadlineError extends Error {
  readonly code = "P2028";
  readonly meta: { phase: string; maxWait: number };
  constructor(maxWait: number) { super("Transaction startup deadline exceeded."); this.meta = { phase: "transaction-start", maxWait }; }
}
export class AdmissionOwnershipError extends Error { constructor() { super("Database write admission ownership was lost."); } }

// One competitor per actual pool, before checkout. The database advisory lock
// remains the authority across pools/processes. Entries have no new allowance:
// the existing public startup timer aborts them, and promotion checks the same
// monotonic deadline before granting a permit.
class AdmissionFrontQueue {
  private busy = false;
  private waiting: Array<{ signal: AbortSignal; deadline: number; fail: () => Error;
    grant: (release: () => void) => void; reject: (error: Error) => void; cancel: () => void }> = [];
  take(signal: AbortSignal, deadline: number, fail: () => Error): Promise<() => void> {
    if (signal.aborted || performance.now() >= deadline) return Promise.reject(fail());
    return new Promise((grant, reject) => {
      const entry = { signal, deadline, fail, grant, reject, cancel: () => {
        const position = this.waiting.indexOf(entry);
        if (position < 0) return;
        this.waiting.splice(position, 1); signal.removeEventListener("abort", entry.cancel);
        reject(fail()); this.promote();
      } };
      signal.addEventListener("abort", entry.cancel, { once: true });
      this.waiting.push(entry); this.promote();
    });
  }
  private promote() {
    if (this.busy) return;
    while (this.waiting.length) {
      const entry = this.waiting.shift()!;
      entry.signal.removeEventListener("abort", entry.cancel);
      if (entry.signal.aborted || performance.now() >= entry.deadline) { entry.reject(entry.fail()); continue; }
      this.busy = true; let released = false;
      entry.grant(() => { if (released) return; released = true; this.busy = false; this.promote(); });
      return;
    }
  }
}

class AdmissionAttempt {
  deadline = Infinity; expired = false; entered = false; lost = false;
  readonly callbackDone = deferred();
  client?: PoolClient; private physicalRelease?: PoolClient["release"];
  private ended = deferred(); private endedAlready = false; private physicallyReleased = false;
  private acquired = false; private key = 0; private releaseError: Error | boolean | undefined;
  private priorTimeout?: string;
  private waitingAbort = new AbortController(); private frontPermit?: () => void;
  releaseRequests = 0; physicalReleases = 0;
  constructor(readonly maxWait: number) {}
  start() {
    if (this.deadline !== Infinity) throw new Error("Admission attempt startup was already assigned.");
    this.deadline = performance.now() + this.maxWait;
  }
  expire() {
    this.expired = true;
    this.waitingAbort.abort();
    // No business callback has entered. Destroy only this owned checkout;
    // a late lock/BEGIN result cannot remain usable or run a callback later.
    if (!this.entered && this.client) this.releasePhysical(true);
  }
  enter() { if (this.expired) throw new AdmissionDeadlineError(this.maxWait); this.entered = true; }
  drained() { this.callbackDone.resolve(); }
  async join(front: AdmissionFrontQueue) {
    this.frontPermit = await front.take(this.waitingAbort.signal, this.deadline, () => new AdmissionDeadlineError(this.maxWait));
  }
  private releasePhysical(error?: Error | boolean) {
    if (this.physicallyReleased || !this.physicalRelease) return;
    this.physicallyReleased = true; this.physicalReleases++;
    this.physicalRelease(error);
  }
  private onError = () => { if (!this.expired) this.lost = true; };
  private onEnd = () => { this.endedAlready = true; this.ended.resolve(); if (!this.expired && !this.physicallyReleased) this.lost = true; };
  async acquire(client: PoolClient, schema: string) {
    if (this.client) throw new Error("Admission checkout was already assigned.");
    this.client = client; this.physicalRelease = client.release.bind(client);
    client.on("error", this.onError); client.on("end", this.onEnd);
    // Public release is a request. The outer public transaction promise and
    // callback must drain before the physical checkout/admission is returned.
    client.release = error => { this.releaseRequests++; this.releaseError ??= error; };
    if (this.expired || performance.now() >= this.deadline) { this.expire(); throw new AdmissionDeadlineError(this.maxWait); }
    const prior = (await client.query("SHOW statement_timeout")).rows[0].statement_timeout;
    this.priorTimeout = prior;
    const namespace = (await client.query("SELECT oid::text AS oid FROM pg_namespace WHERE nspname=$1", [schema])).rows[0];
    if (!namespace || !/^\d+$/.test(namespace.oid)) throw new Error("Admission schema could not be established.");
    this.key = Number(namespace.oid) | 0;
    const remaining = Math.floor(this.deadline - performance.now());
    if (this.expired || remaining < 1) { this.expire(); throw new AdmissionDeadlineError(this.maxWait); }
    await client.query("SELECT set_config('statement_timeout',$1,false)", [String(remaining)]);
    try {
      await client.query("SELECT pg_advisory_lock($1::integer,$2::integer)", [ADMISSION_NAMESPACE, this.key]);
      this.acquired = true;
    } catch (error) {
      if (this.expired || (error && typeof error === "object" && "code" in error && error.code === "57014")) {
        this.expire(); throw new AdmissionDeadlineError(this.maxWait);
      }
      throw error;
    }
    if (this.expired || performance.now() >= this.deadline) { this.expire(); throw new AdmissionDeadlineError(this.maxWait); }
    await client.query("SELECT set_config('statement_timeout',$1,false)", [prior]);
  }
  async finish(primary?: unknown, hasPrimary = false) {
    try { await this.finishCheckout(primary, hasPrimary); }
    finally { this.frontPermit?.(); this.frontPermit = undefined; }
  }
  private async finishCheckout(primary?: unknown, hasPrimary = false) {
    if (this.entered) await this.callbackDone.promise;
    const client = this.client;
    if (!client) return;
    let secondary = false;
    try {
      if (!this.physicallyReleased && !this.endedAlready) {
        await client.query("ROLLBACK");
        if (this.priorTimeout !== undefined) await client.query("SELECT set_config('statement_timeout',$1,false)", [this.priorTimeout]);
        if (this.acquired) {
          const result = await client.query("SELECT pg_advisory_unlock($1::integer,$2::integer) AS unlocked", [ADMISSION_NAMESPACE, this.key]);
          if (result.rows[0].unlocked !== true) { this.lost = true; throw new AdmissionOwnershipError(); }
        }
      }
    } catch { secondary = true; this.lost = true; }
    finally {
      this.releasePhysical(secondary || this.lost || this.expired ? true : this.releaseError);
      if (secondary || this.lost || this.expired || this.releaseError) await this.ended.promise;
      client.removeListener("error", this.onError); client.removeListener("end", this.onEnd);
    }
    if (secondary && hasPrimary) console.error("Write admission cleanup encountered a secondary failure.", { stage: "owned-checkout" });
    if (!hasPrimary && this.lost) throw new AdmissionOwnershipError();
  }
}

export function admissionFactory(factory: PrismaPg, schema: string): SqlDriverAdapterFactory {
  return { provider: factory.provider, adapterName: factory.adapterName, connect: async () => {
    const actual = await factory.connect();
    // Declared public API of the pinned official adapter, not an engine field.
    const pool = actual.underlyingDriver(), connect = pool.connect.bind(pool), front = new AdmissionFrontQueue();
    pool.connect = ((...args: any[]) => {
      const transfer = handoff.getStore();
      if (!transfer) return Reflect.apply(connect, pool, args);
      if (transfer.used) return Promise.reject(new Error("Admission connection handoff was already consumed."));
      transfer.used = true;
      if (typeof args[0] === "function") { args[0](undefined, transfer.client, transfer.client.release); return; }
      return Promise.resolve(transfer.client);
    }) as typeof pool.connect;
    return { provider: actual.provider, adapterName: actual.adapterName,
      queryRaw: actual.queryRaw.bind(actual), executeRaw: actual.executeRaw.bind(actual),
      executeScript: actual.executeScript.bind(actual), getConnectionInfo: actual.getConnectionInfo.bind(actual), dispose: actual.dispose.bind(actual),
      startTransaction: async level => {
        const state = attempts.getStore();
        if (!state) return actual.startTransaction(level);
        state.start();
        await state.join(front);
        if (state.expired || performance.now() >= state.deadline) throw new AdmissionDeadlineError(state.maxWait);
        const client = await connect();
        await state.acquire(client, schema);
        return handoff.run({ client, used: false }, () => actual.startTransaction(level));
      } };
  } };
}
