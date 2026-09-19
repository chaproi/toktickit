import { Prisma, type UserRole } from "@prisma/client";
import { getPrisma } from "../prisma.js";

export type LockedActor = {
  id: number;
  role: UserRole;
  isActive: boolean;
};

export class ConcurrentUpdateError extends Error {
  constructor() {
    super("A confirmed serialization failure exhausted its retry limit.");
    this.name = "ConcurrentUpdateError";
  }
}

export type MutationGateKey = {
  scope: 1 | 2 | 3;
  id: number;
};

async function acquireMutationGates(
  transaction: Prisma.TransactionClient,
  keys: readonly MutationGateKey[],
): Promise<void> {
  const ordered = [...keys].sort((left, right) =>
    left.scope - right.scope || left.id - right.id);
  for (const key of ordered) {
    const [gate] = await transaction.$queryRaw<Array<{ acquired: boolean }>>`
      SELECT pg_try_advisory_xact_lock(
        ${key.scope}::integer,
        ${key.id}::integer
      ) AS "acquired"
    `;
    if (gate?.acquired) continue;

    await transaction.$queryRaw<Array<{ lockAcquired: string }>>`
      SELECT pg_advisory_xact_lock(
        ${key.scope}::integer,
        ${key.id}::integer
      )::text AS "lockAcquired"
    `;
    await transaction.$executeRaw`
      DO $toktickit$
      BEGIN
        RAISE EXCEPTION 'Mutation gate wait requires a fresh serializable snapshot.'
          USING ERRCODE = '40001';
      END
      $toktickit$
    `;
  }
}

function hasConfirmedPostgresSqlState(
  error: unknown,
  expected: string,
  visited = new Set<object>(),
): boolean {
  if (typeof error !== "object" || error === null || visited.has(error)) {
    return false;
  }
  visited.add(error);
  const candidate = error as {
    code?: unknown;
    meta?: unknown;
    cause?: unknown;
  };
  if (candidate.code === expected) return true;
  return hasConfirmedPostgresSqlState(candidate.meta, expected, visited) ||
    hasConfirmedPostgresSqlState(candidate.cause, expected, visited);
}

export async function runSerializableMutation<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  onAttemptFailure?: (error: unknown) => Promise<void>,
  gateKeys: readonly MutationGateKey[] = [],
): Promise<T> {
  const prisma = getPrisma();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (transaction) => {
        await acquireMutationGates(transaction, gateKeys);
        return operation(transaction);
      }, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      await onAttemptFailure?.(error);
      if (!hasConfirmedPostgresSqlState(error, "40001")) throw error;
      if (attempt === 2) throw new ConcurrentUpdateError();
    }
  }
  throw new Error("Serializable mutation retry loop exhausted unexpectedly.");
}

export async function lockCurrentActor(
  transaction: Prisma.TransactionClient,
  userId: number,
  expectedRole: UserRole,
): Promise<LockedActor | null> {
  const [actor] = await transaction.$queryRaw<LockedActor[]>`
    SELECT "id", "role", "isActive"
    FROM "User"
    WHERE "id" = ${userId}
    FOR UPDATE
  `;
  if (!actor || !actor.isActive || actor.role !== expectedRole) return null;
  return actor;
}
