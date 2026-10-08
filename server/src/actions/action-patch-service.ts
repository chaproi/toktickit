import { Prisma, type Action, type ActionHistoryEvent, type TicketStatus } from "@prisma/client";
import { runSerializableMutation, type MutationGateKey } from "../auth/eligibility-transaction.js";
import { getPrisma } from "../prisma.js";
import {
  currentActionAuthorization, eligibleActionUser, MAX_ACTION_DATABASE_ID,
  type ActionMutationAuthorization, type LockedActionUser,
} from "./action-mutation-protocol.js";
import { actionSelect, toActionDTO, toActionSnapshot } from "./action-projection.js";
import { fingerprintActionPatch, storedActionResponse, type ActionPatchOperation } from "./action-receipt.js";
import {
  mergeAndValidateActionEdit, type ActionStatusValidationData, type EditActionValidationData,
} from "./action-validation.js";

export type ActionPatchCommand =
  | { kind: "edit"; input: EditActionValidationData }
  | { kind: "status"; input: ActionStatusValidationData };
type LockedTicket = { id: number; currentStatus: TicketStatus; updatedAt: Date };

function operationFor(command: ActionPatchCommand): ActionPatchOperation {
  if (command.kind === "edit") return "EDIT_ACTION";
  return command.input.targetStatus === "COMPLETED" ? "COMPLETE_ACTION" :
    command.input.targetStatus === "CANCELLED" ? "CANCEL_ACTION" : "START_ACTION";
}

export async function patchTicketAction(
  context: ActionMutationAuthorization, ticketId: number, actionId: number, command: ActionPatchCommand,
) {
  const input = command.input;
  const operation = operationFor(command);
  const originalInput = command.kind === "edit" ? {
    ...command.input.patch, expectedVersion: input.expectedVersion,
    expectedTicketUpdatedAt: input.expectedTicketUpdatedAt, clientMutationId: input.clientMutationId,
  } : command.input;
  const fingerprint = fingerprintActionPatch(operation, ticketId, actionId, originalInput);

  // Preliminary discovery determines the complete User lock set, not authority
  // or current state. Missing/scoped targets are decided after transactional auth.
  const discovered = await getPrisma().action.findFirst({
    where: { id: actionId, ticketId }, select: { assigneeId: true },
  });
  const requiresEligibility = command.kind === "edit" ? Object.hasOwn(command.input.patch, "assigneeId") :
    command.input.targetStatus === "IN_PROGRESS" || command.input.targetStatus === "COMPLETED";
  const candidateId = command.kind === "edit" ? command.input.patch.assigneeId : discovered?.assigneeId;
  const databaseCandidateId = candidateId !== undefined && candidateId <= MAX_ACTION_DATABASE_ID ? candidateId : null;
  const initiallyEligible = !requiresEligibility || (databaseCandidateId !== null && eligibleActionUser(
    await getPrisma().user.findUnique({ where: { id: databaseCandidateId }, select: { role: true, isActive: true } }),
  ));
  const userIds = [...new Set([context.actorId, ...(discovered ? [discovered.assigneeId] : []),
    ...(databaseCandidateId === null ? [] : [databaseCandidateId])])].sort((a, b) => a - b);
  const gates: MutationGateKey[] = [...userIds.map((id) => ({ scope: 1 as const, id })),
    { scope: 2, id: ticketId }, { scope: 3, id: actionId }];

  return runSerializableMutation(async (transaction) => {
    const users = await transaction.$queryRaw<LockedActionUser[]>(Prisma.sql`
      SELECT "id", "role", "isActive", "mustChangePassword" FROM "User"
      WHERE "id" IN (${Prisma.join(userIds)}) ORDER BY "id" ASC FOR UPDATE`);
    const authorization = await currentActionAuthorization(transaction, context, users);
    if (authorization !== null) return { kind: authorization };
    const [ticket] = await transaction.$queryRaw<LockedTicket[]>`
      SELECT "id", "currentStatus", "updatedAt" FROM "Ticket" WHERE "id"=${ticketId} FOR UPDATE`;
    if (!ticket) return { kind: "ticket-not-found" as const };
    const [before] = await transaction.$queryRaw<Action[]>`
      SELECT * FROM "Action" WHERE "id"=${actionId} AND "ticketId"=${ticketId} FOR UPDATE`;
    if (!before) return { kind: "action-not-found" as const };

    const receipt = await transaction.mutationReceipt.findUnique({ where: {
      actorId_clientMutationId: { actorId: context.actorId, clientMutationId: input.clientMutationId },
    } });
    if (receipt) {
      if (receipt.operation !== operation || receipt.ticketId !== ticketId || receipt.actionId !== actionId ||
          receipt.inputFingerprint !== fingerprint) return { kind: "duplicate-conflict" as const };
      return { kind: "replayed" as const, response: storedActionResponse(receipt.safeResponse) };
    }
    // An intervening assignment can invalidate preliminary discovery. Do not
    // acquire a new User lock after Ticket/Action, or turn it into a mutation retry.
    if (!discovered || discovered.assigneeId !== before.assigneeId) return { kind: "concurrent" as const };
    if (["RESOLVED", "CLOSED", "CANCELLED"].includes(ticket.currentStatus)) return { kind: "frozen" as const };
    if (before.version !== input.expectedVersion || ticket.updatedAt.toISOString() !== input.expectedTicketUpdatedAt) {
      return { kind: "stale" as const };
    }
    if (before.status === "COMPLETED" || before.status === "CANCELLED") return { kind: "terminal" as const };

    let changes: Prisma.ActionUncheckedUpdateInput;
    let event: ActionHistoryEvent;
    if (command.kind === "edit") {
      const merged = mergeAndValidateActionEdit(before, command.input.patch);
      if (!merged.success) return { kind: "validation-error" as const, fields: merged.fields };
      if (requiresEligibility) {
        if (!initiallyEligible) return { kind: "invalid-assignee" as const };
        if (!eligibleActionUser(users.find((user) => user.id === databaseCandidateId))) return { kind: "assignee-ineligible" as const };
      }
      const values = merged.data;
      if (Object.entries(values).every(([key, value]) => before[key as keyof Action] === value)) {
        return { kind: "unchanged" as const };
      }
      changes = values;
      event = values.assigneeId !== before.assigneeId ? "ACTION_REASSIGNED" : "ACTION_EDITED";
    } else {
      const target = command.input.targetStatus;
      if (before.status === target) return { kind: "status-unchanged" as const };
      const allowed = before.status === "PLANNED" && (target === "IN_PROGRESS" || target === "CANCELLED") ||
        before.status === "IN_PROGRESS" && (target === "COMPLETED" || target === "CANCELLED");
      if (!allowed) return { kind: "invalid-transition" as const };
      if (requiresEligibility) {
        if (!initiallyEligible) return { kind: "invalid-assignee" as const };
        if (!eligibleActionUser(users.find((user) => user.id === before.assigneeId))) return { kind: "assignee-ineligible" as const };
      }
      if (command.input.targetStatus === "COMPLETED") {
        changes = { status: "COMPLETED", result: command.input.result, performedById: context.actorId };
        event = "ACTION_COMPLETED";
      } else if (command.input.targetStatus === "CANCELLED") {
        changes = { status: "CANCELLED", cancellationReason: command.input.reason, performedById: null, completedAt: null };
        event = "ACTION_CANCELLED";
      } else {
        changes = { status: "IN_PROGRESS" };
        event = "ACTION_STARTED";
      }
    }
    const instant = new Date(Math.max(Date.now(), before.updatedAt.getTime() + 1, ticket.updatedAt.getTime() + 1));
    if (event === "ACTION_COMPLETED") changes.completedAt = instant;
    if (event === "ACTION_CANCELLED") changes.cancelledAt = instant;
    const after = await transaction.action.update({ where: { id: actionId }, data: {
      ...changes, version: { increment: 1 }, updatedAt: instant,
    } });
    await transaction.actionHistory.create({ data: {
      actionId, actorId: context.actorId, event, actionVersion: after.version, sourceTicketStatusHistoryId: null,
      before: toActionSnapshot(before), after: toActionSnapshot(after), createdAt: instant,
    } });
    await transaction.ticket.update({ where: { id: ticketId }, data: { updatedAt: instant } });
    const selected = await transaction.action.findUniqueOrThrow({ where: { id: actionId }, select: actionSelect });
    const response = { action: toActionDTO(selected), ticketUpdatedAt: instant.toISOString() };
    // Receipt is the final domain write. A failure rolls back every earlier write.
    await transaction.mutationReceipt.create({ data: {
      actorId: context.actorId, clientMutationId: input.clientMutationId, operation, ticketId, actionId,
      inputFingerprint: fingerprint, safeResponse: response, createdAt: instant,
    } });
    return { kind: "updated" as const, response };
  }, undefined, gates);
}
