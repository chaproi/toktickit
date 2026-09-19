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
): Promise<T> {
  const prisma = getPrisma();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
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
