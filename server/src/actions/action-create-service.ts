import { Prisma, type AuthSession, type TicketStatus, type UserRole } from "@prisma/client";
import { runSerializableMutation, type MutationGateKey } from "../auth/eligibility-transaction.js";
import { evaluateSessionLifetime } from "../auth/session.js";
import { getPrisma } from "../prisma.js";
import { actionSelect, toActionDTO, toActionSnapshot } from "./action-projection.js";
import { fingerprintCreateAction, storedActionResponse } from "./action-receipt.js";
import type { CreateActionValidationData } from "./action-validation.js";

export type ActionMutationAuthorization = {
  actorId: number; sessionId: string; tokenHash: string; csrfTokenHash: string;
};
type LockedUser = { id: number; role: UserRole; isActive: boolean; mustChangePassword: boolean };
type LockedTicket = { id: number; currentStatus: TicketStatus; updatedAt: Date };
type LockedSession = Pick<AuthSession, "userId" | "tokenHash" | "csrfTokenHash" | "createdAt" | "lastSeenAt" | "expiresAt">;
const MAX_DATABASE_ID = 2_147_483_647;

function eligible(user: { role: UserRole; isActive: boolean } | undefined | null): boolean {
  return Boolean(user?.isActive && (user.role === "IT_STAFF" || user.role === "ADMINISTRATOR"));
}

async function currentAuthorization(transaction: Prisma.TransactionClient, context: ActionMutationAuthorization, users: LockedUser[]) {
  const actor = users.find((user) => user.id === context.actorId);
  // User rows are locked first; SHARE prevents revocation of this session until the transaction finishes.
  const [session] = await transaction.$queryRaw<LockedSession[]>`
    SELECT "userId", "tokenHash", "csrfTokenHash", "createdAt", "lastSeenAt", "expiresAt"
    FROM "AuthSession" WHERE "id"=${context.sessionId}::uuid FOR SHARE`;
  if (!actor?.isActive || !session || session.userId !== context.actorId ||
      session.tokenHash !== context.tokenHash || !evaluateSessionLifetime(session, new Date()).live) {
    return "authentication-required" as const;
  }
  if (actor.mustChangePassword) return "password-change-required" as const;
  if (!eligible(actor)) return "role-forbidden" as const;
  if (session.csrfTokenHash !== context.csrfTokenHash) return "csrf-invalid" as const;
  return null;
}

export async function createTicketAction(context: ActionMutationAuthorization, ticketId: number, input: CreateActionValidationData) {
  // Preserve positive-safe-integer body validation. IDs unrepresentable in this database
  // cannot identify an eligible User and must not reach Prisma/advisory integer casts.
  const databaseAssigneeId = input.assigneeId <= MAX_DATABASE_ID ? input.assigneeId : null;
  const initiallyEligible = databaseAssigneeId !== null && eligible(await getPrisma().user.findUnique({
    where: { id: databaseAssigneeId }, select: { role: true, isActive: true },
  }));
  const userIds = [...new Set([context.actorId, ...(databaseAssigneeId === null ? [] : [databaseAssigneeId])])]
    .sort((a, b) => a - b);
  const gates: MutationGateKey[] = [...userIds.map((id) => ({ scope: 1 as const, id })), { scope: 2, id: ticketId }];
  const fingerprint = fingerprintCreateAction(ticketId, input);

  // Existing helper retries only positively confirmed 40001, maximum three fresh SERIALIZABLE attempts.
  // No P2002/23505/deadlock recovery or mutation retry is introduced here.
  return runSerializableMutation(async (transaction) => {
    const users = await transaction.$queryRaw<LockedUser[]>(Prisma.sql`
      SELECT "id", "role", "isActive", "mustChangePassword" FROM "User"
      WHERE "id" IN (${Prisma.join(userIds)}) ORDER BY "id" ASC FOR UPDATE`);
    const authorization = await currentAuthorization(transaction, context, users);
    if (authorization !== null) return { kind: authorization };
    const [ticket] = await transaction.$queryRaw<LockedTicket[]>`
      SELECT "id", "currentStatus", "updatedAt" FROM "Ticket" WHERE "id"=${ticketId} FOR UPDATE`;
    if (!ticket) return { kind: "ticket-not-found" as const };

    const receipt = await transaction.mutationReceipt.findUnique({ where: {
      actorId_clientMutationId: { actorId: context.actorId, clientMutationId: input.clientMutationId },
    } });
    if (receipt) {
      if (receipt.operation !== "CREATE_ACTION" || receipt.ticketId !== ticketId || receipt.inputFingerprint !== fingerprint) {
        return { kind: "duplicate-conflict" as const };
      }
      return { kind: "replayed" as const, response: storedActionResponse(receipt.safeResponse) };
    }
    if (!initiallyEligible) return { kind: "invalid-assignee" as const };
    if (!eligible(users.find((user) => user.id === databaseAssigneeId))) return { kind: "assignee-ineligible" as const };
    if (["RESOLVED", "CLOSED", "CANCELLED"].includes(ticket.currentStatus)) return { kind: "frozen" as const };
    if (ticket.updatedAt.toISOString() !== input.expectedTicketUpdatedAt) return { kind: "stale" as const };

    const instant = new Date(Math.max(Date.now(), ticket.updatedAt.getTime() + 1));
    const action = await transaction.action.create({ data: {
      ticketId, createdById: context.actorId, assigneeId: input.assigneeId, performedById: null,
      description: input.description, result: input.result, followUpRequired: input.followUpRequired,
      followUpNote: input.followUpNote, attachmentNotes: input.attachmentNotes,
      status: "PLANNED", version: 1, actionAt: instant, createdAt: instant, updatedAt: instant,
      completedAt: null, cancelledAt: null, cancellationReason: null,
    } });
    await transaction.actionHistory.create({ data: {
      actionId: action.id, actorId: context.actorId, event: "ACTION_CREATED", actionVersion: 1,
      before: Prisma.DbNull, after: toActionSnapshot(action), sourceTicketStatusHistoryId: null, createdAt: instant,
    } });
    await transaction.ticket.update({ where: { id: ticketId }, data: { updatedAt: instant } });
    const selected = await transaction.action.findUniqueOrThrow({ where: { id: action.id }, select: actionSelect });
    const response = { action: toActionDTO(selected), ticketUpdatedAt: instant.toISOString() };
    // Last domain write: failure here rolls back Action, history and parent together.
    await transaction.mutationReceipt.create({ data: {
      actorId: context.actorId, clientMutationId: input.clientMutationId, operation: "CREATE_ACTION",
      ticketId, actionId: action.id, inputFingerprint: fingerprint, safeResponse: response, createdAt: instant,
    } });
    return { kind: "created" as const, response };
  }, undefined, gates);
}
