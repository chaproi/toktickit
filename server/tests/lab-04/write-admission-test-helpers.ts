import type { Client } from "pg";
import { ADMISSION_NAMESPACE, currentCommandPlan } from "../../src/database/write-admission.js";
import { vi } from "vitest";

export async function waitForObservedAdmission(check: () => number, count = 1) {
  const deadline = performance.now() + 1500;
  while (performance.now() < deadline) {
    const observed = check(); if (observed >= count) return observed;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error("Overlapping HTTP commands did not reach their public pre-callback admission boundary.");
}

// Observe the existing public method, never fabricate a backend for a caller
// which intentionally has not checked out a connection. Preserve the original
// composed method/receiver, result, error and all business callback semantics.
export function observePendingAdmission(db: any) {
  const calls: Array<{ entered: boolean; settled: boolean }> = [];
  const original = db.$transaction.bind(db);
  const spy = vi.spyOn(db, "$transaction").mockImplementation((...args: unknown[]) => {
    if (typeof args[0] !== "function" || ((args[1] as { isolationLevel?: string } | undefined)?.isolationLevel !== "Serializable" && !currentCommandPlan())) return Reflect.apply(original, db, args);
    const call = { entered: false, settled: false }; calls.push(call);
    const callback = args[0] as (...args: unknown[]) => unknown;
    const work = Reflect.apply(original, db, [(...input: unknown[]) => { call.entered = true; return callback(...input); }, ...args.slice(1)]) as Promise<unknown>;
    void work.then(() => { call.settled = true; }, () => { call.settled = true; });
    return work;
  });
  const pending = () => calls.filter(call => !call.entered && !call.settled).length;
  return { calls, pending, wait: (count = 1) => waitForObservedAdmission(pending, count), restore: () => spy.mockRestore() };
}

// Observe actual cross-connection waiting, not a callback barrier that would
// require cooperating writers to establish concurrent business snapshots.
export async function waitForWriteAdmission(client: Client, schema: string, count = 1) {
  const deadline = performance.now() + 1500;
  while (performance.now() < deadline) {
    const result = await client.query<{ pid: number }>(`SELECT DISTINCT l.pid FROM pg_locks l
      JOIN pg_namespace n ON l.objid=n.oid
      WHERE l.locktype='advisory' AND l.database=(SELECT oid FROM pg_database WHERE datname=current_database())
        AND l.classid=$1::oid AND n.nspname=$2 AND NOT l.granted`, [ADMISSION_NAMESPACE, schema]);
    if (result.rows.length >= count) return result.rows.map(row => row.pid);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("Owned HTTP commands did not reach pre-snapshot admission waiting.");
}
