import { randomInt } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  runSerializableMutation,
  type MutationGateKey,
} from "../../src/auth/eligibility-transaction.js";
import { getPrisma } from "../../src/prisma.js";

type BackendIdentity = {
  pid: number;
  transactionId: string;
};

type AdvisoryLock = {
  pid: number;
  granted: boolean;
};

function uniqueGateKey(): MutationGateKey {
  return {
    scope: 1,
    id: randomInt(1_000_000_000, 2_000_000_000),
  };
}

async function advisoryLocks(
  key: MutationGateKey,
): Promise<AdvisoryLock[]> {
  return getPrisma().$queryRaw<AdvisoryLock[]>`
    SELECT "pid", "granted"
    FROM "pg_locks"
    WHERE "locktype" = 'advisory'
      AND "classid" = ${key.scope}::oid
      AND "objid" = ${key.id}::oid
    ORDER BY "pid" ASC
  `;
}

async function waitForAdvisoryWaiter(
  key: MutationGateKey,
): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const locks = await advisoryLocks(key);
    if (locks.some((lock) => !lock.granted)) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for a database-observed advisory-lock waiter.");
}

describe("Issue 29 transaction-scoped mutation gate", () => {
  it("holds the gate on the same backend and transaction as the mutation", async () => {
    const key = uniqueGateKey();

    await runSerializableMutation(async (transaction) => {
      const [identity] = await transaction.$queryRaw<BackendIdentity[]>`
        SELECT
          pg_backend_pid() AS "pid",
          txid_current()::text AS "transactionId"
      `;
      const locks = await transaction.$queryRaw<AdvisoryLock[]>`
        SELECT "pid", "granted"
        FROM "pg_locks"
        WHERE "locktype" = 'advisory'
          AND "classid" = ${key.scope}::oid
          AND "objid" = ${key.id}::oid
          AND "granted" = true
      `;

      expect(identity?.transactionId).toMatch(/^\d+$/u);
      expect(locks).toEqual([{ pid: identity?.pid, granted: true }]);
    }, undefined, [key]);
  });

  it("releases the gate automatically when the transaction rolls back", async () => {
    const key = uniqueGateKey();
    const rollback = new Error("Synthetic rollback after gate acquisition.");

    await expect(runSerializableMutation(async () => {
      throw rollback;
    }, undefined, [key])).rejects.toBe(rollback);

    expect(await advisoryLocks(key)).toEqual([]);
  });

  it("prevents a second callback from entering before the first transaction completes", async () => {
    const key = uniqueGateKey();
    let releaseFirst!: () => void;
    let markFirstEntered!: () => void;
    const firstMayFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstEntered = new Promise<void>((resolve) => {
      markFirstEntered = resolve;
    });
    let firstCalls = 0;
    let secondCalls = 0;

    const first = runSerializableMutation(async () => {
      firstCalls += 1;
      markFirstEntered();
      await firstMayFinish;
    }, undefined, [key]);
    await firstEntered;

    const second = runSerializableMutation(async () => {
      secondCalls += 1;
    }, undefined, [key]);
    await waitForAdvisoryWaiter(key);

    expect(firstCalls).toBe(1);
    expect(secondCalls).toBe(0);
    releaseFirst();
    await Promise.all([first, second]);
    expect(firstCalls).toBe(1);
    expect(secondCalls).toBe(1);
    expect(await advisoryLocks(key)).toEqual([]);
  });
});
