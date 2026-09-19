import { Prisma, type UserRole } from "@prisma/client";
import { getPrisma } from "../prisma.js";

export type LockedActor = {
  id: number;
  role: UserRole;
  isActive: boolean;
};

function isSerializationFailure(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2034" ||
      (error.code === "P2010" && error.meta?.code === "40001");
  }
  return typeof error === "object" && error !== null &&
    "code" in error && (error as { code?: unknown }).code === "40001";
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
      if (!isSerializationFailure(error) || attempt === 2) throw error;
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
