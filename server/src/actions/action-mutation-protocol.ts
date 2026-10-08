import { Prisma, type AuthSession, type UserRole } from "@prisma/client";
import { evaluateSessionLifetime } from "../auth/session.js";

export type ActionMutationAuthorization = {
  actorId: number; sessionId: string; tokenHash: string; csrfTokenHash: string;
};
export type LockedActionUser = { id: number; role: UserRole; isActive: boolean; mustChangePassword: boolean };
type LockedSession = Pick<AuthSession, "userId" | "tokenHash" | "csrfTokenHash" | "createdAt" | "lastSeenAt" | "expiresAt">;
export const MAX_ACTION_DATABASE_ID = 2_147_483_647;

export function eligibleActionUser(user: { role: UserRole; isActive: boolean } | undefined | null): boolean {
  return Boolean(user?.isActive && (user.role === "IT_STAFF" || user.role === "ADMINISTRATOR"));
}

export async function currentActionAuthorization(
  transaction: Prisma.TransactionClient, context: ActionMutationAuthorization, users: LockedActionUser[],
) {
  const actor = users.find((user) => user.id === context.actorId);
  // User rows are locked first; SHARE prevents revocation until the transaction finishes.
  const [session] = await transaction.$queryRaw<LockedSession[]>`
    SELECT "userId", "tokenHash", "csrfTokenHash", "createdAt", "lastSeenAt", "expiresAt"
    FROM "AuthSession" WHERE "id"=${context.sessionId}::uuid FOR SHARE`;
  if (!actor?.isActive || !session || session.userId !== context.actorId ||
      session.tokenHash !== context.tokenHash || !evaluateSessionLifetime(session, new Date()).live) {
    return "authentication-required" as const;
  }
  if (actor.mustChangePassword) return "password-change-required" as const;
  if (!eligibleActionUser(actor)) return "role-forbidden" as const;
  if (session.csrfTokenHash !== context.csrfTokenHash) return "csrf-invalid" as const;
  return null;
}
