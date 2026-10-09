import { Prisma, type TicketStatus } from "@prisma/client";
import { runSerializableMutation, type MutationGateKey } from "../auth/eligibility-transaction.js";
import { getPrisma } from "../prisma.js";
import { actionSelect, toActionDTO, toActionSnapshot } from "./action-projection.js";
import { fingerprintCreateAction, isReceiptKeyConflict, storedActionResponse } from "./action-receipt.js";
import { recoverActionReceipt } from "./action-receipt-recovery.js";
import type { CreateActionValidationData } from "./action-validation.js";
import {
  currentActionAuthorization as currentAuthorization, eligibleActionUser as eligible,
  MAX_ACTION_DATABASE_ID as MAX_DATABASE_ID, type ActionMutationAuthorization, type LockedActionUser as LockedUser,
} from "./action-mutation-protocol.js";

export type { ActionMutationAuthorization } from "./action-mutation-protocol.js";
type LockedTicket = { id: number; currentStatus: TicketStatus; updatedAt: Date };

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
  // Receipt-specific recovery follows complete rollback, outside this retry loop.
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
  }, undefined, gates).catch((error: unknown) => {
    if (!isReceiptKeyConflict(error)) throw error;
    return recoverActionReceipt(context, { operation: "CREATE_ACTION", ticketId,
      clientMutationId: input.clientMutationId, fingerprint });
  });
}
