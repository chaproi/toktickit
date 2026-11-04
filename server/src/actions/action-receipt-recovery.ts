import { Prisma } from "@prisma/client";
import { ConcurrentUpdateError } from "../auth/eligibility-transaction.js";
import { evaluateSessionLifetime } from "../auth/session.js";
import { getPrisma } from "../prisma.js";
import { eligibleActionUser, type ActionMutationAuthorization } from "./action-mutation-protocol.js";
import { storedActionResponse, type ActionPatchOperation } from "./action-receipt.js";

function confirmedReadSerializationFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: unknown; meta?: { code?: unknown } };
  return candidate.code === "40001" || candidate.meta?.code === "40001";
}

// Called only after a positively identified receipt-key failure has rejected
// the complete mutation transaction. No mutation attempt is started here.
export async function recoverActionReceipt(
  context: ActionMutationAuthorization,
  request: { operation: "CREATE_ACTION" | ActionPatchOperation; ticketId: number; actionId?: number;
    clientMutationId: string; fingerprint: string },
) {
  try {
    return await getPrisma().$transaction(async (transaction) => {
      // This exact static control statement precedes ALL business reads. Reads
      // deliberately use no mutation gates or FOR UPDATE/FOR SHARE locks.
      await transaction.$executeRaw`SET TRANSACTION READ ONLY`;
      const actor = await transaction.user.findUnique({ where: { id: context.actorId },
        select: { id: true, role: true, isActive: true, mustChangePassword: true } });
      const session = await transaction.authSession.findUnique({ where: { id: context.sessionId },
        select: { userId: true, tokenHash: true, csrfTokenHash: true, createdAt: true, lastSeenAt: true, expiresAt: true } });
      if (!actor?.isActive || !session || session.userId !== context.actorId ||
          session.tokenHash !== context.tokenHash || !evaluateSessionLifetime(session, new Date()).live) {
        return { kind: "authentication-required" as const };
      }
      if (actor.mustChangePassword) return { kind: "password-change-required" as const };
      if (!eligibleActionUser(actor)) return { kind: "role-forbidden" as const };
      if (session.csrfTokenHash !== context.csrfTokenHash) return { kind: "csrf-invalid" as const };
      // Current Staff/Admin authorization is independent of ownership/assignment.
      const parent = await transaction.ticket.findUnique({ where: { id: request.ticketId }, select: { id: true } });
      if (!parent) return { kind: "ticket-not-found" as const };
      if (request.actionId !== undefined) {
        const action = await transaction.action.findFirst({ where: { id: request.actionId, ticketId: request.ticketId }, select: { id: true } });
        if (!action) return { kind: "action-not-found" as const };
      }
      const receipt = await transaction.mutationReceipt.findUnique({ where: {
        actorId_clientMutationId: { actorId: context.actorId, clientMutationId: request.clientMutationId },
      } });
      if (!receipt) throw new ConcurrentUpdateError();
      if (receipt.operation !== request.operation || receipt.ticketId !== request.ticketId ||
          (request.actionId !== undefined && receipt.actionId !== request.actionId) ||
          receipt.inputFingerprint !== request.fingerprint) return { kind: "duplicate-conflict" as const };
      return { kind: "replayed" as const, response: storedActionResponse(receipt.safeResponse) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  } catch (error) {
    // Recovery is a single read, never the SERIALIZABLE mutation retry loop.
    if (confirmedReadSerializationFailure(error)) throw new ConcurrentUpdateError();
    throw error;
  }
}
