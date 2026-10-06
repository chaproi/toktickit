import { createHash } from "node:crypto";
import { Prisma, type Action, type ActionHistoryEvent, type ActionStatus } from "@prisma/client";

export type SeedActionFixture = {
  ordinal: number;
  ticketIndex: number;
  creator: string;
  assignee: string;
  status: ActionStatus;
};

// Ordinals are permanent fixture identities, not positions in a query result.
export const ACTION_FIXTURES: readonly SeedActionFixture[] = [
  { ordinal: 201, ticketIndex: 1, creator: "mina.patel@example.com", assignee: "mina.patel@example.com", status: "PLANNED" },
  { ordinal: 202, ticketIndex: 2, creator: "mina.patel@example.com", assignee: "noah.williams@example.com", status: "IN_PROGRESS" },
  { ordinal: 203, ticketIndex: 2, creator: "noah.williams@example.com", assignee: "mina.patel@example.com", status: "COMPLETED" },
  { ordinal: 204, ticketIndex: 4, creator: "mina.patel@example.com", assignee: "noah.williams@example.com", status: "COMPLETED" },
  { ordinal: 205, ticketIndex: 5, creator: "noah.williams@example.com", assignee: "mina.patel@example.com", status: "COMPLETED" },
  { ordinal: 206, ticketIndex: 6, creator: "mina.patel@example.com", assignee: "noah.williams@example.com", status: "PLANNED" },
  { ordinal: 207, ticketIndex: 7, creator: "mina.patel@example.com", assignee: "mina.patel@example.com", status: "CANCELLED" },
];

export const actionKey = (fixture: SeedActionFixture) => `lab4:action:${fixture.ordinal}`;
export function mutationKey(fixture: SeedActionFixture, operation: 1 | 2 | 3 | 4): string {
  return `00000000-0000-4000-8000-${String(operation * 1000 + fixture.ordinal).padStart(12, "0")}`;
}

export async function nextSeedInstant(transaction: Prisma.TransactionClient, previous?: Date): Promise<Date> {
  const [clock] = await transaction.$queryRaw<Array<{ instant: Date }>>`
    SELECT timezone('UTC',clock_timestamp())::timestamp(3) AS instant
  `;
  if (!clock) throw new Error("Seed database clock unavailable.");
  return new Date(Math.max(clock.instant.getTime(), previous ? previous.getTime() + 1 : 0));
}

// Exact section 9 allowlist. Do not serialize Prisma User/session/private
// relations, or rely on future Action model fields implicitly staying safe.
export function seedActionSnapshot(action: Action): Prisma.InputJsonObject {
  return {
    id: action.id, ticketId: action.ticketId, createdById: action.createdById,
    assigneeId: action.assigneeId, performedById: action.performedById,
    status: action.status, description: action.description, result: action.result,
    followUpRequired: action.followUpRequired, followUpNote: action.followUpNote,
    attachmentNotes: action.attachmentNotes, actionAt: action.actionAt.toISOString(),
    createdAt: action.createdAt.toISOString(), updatedAt: action.updatedAt.toISOString(),
    completedAt: action.completedAt?.toISOString() ?? null,
    cancelledAt: action.cancelledAt?.toISOString() ?? null,
    cancellationReason: action.cancellationReason, version: action.version,
  };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

async function record(
  transaction: Prisma.TransactionClient, fixture: SeedActionFixture, actorId: number,
  operation: "CREATE_ACTION" | "START_ACTION" | "COMPLETE_ACTION" | "CANCEL_ACTION",
  ordinal: 1 | 2 | 3 | 4, event: ActionHistoryEvent,
  before: Action | null, after: Action, originalInput: Prisma.InputJsonObject,
) {
  const snapshot = seedActionSnapshot(after);
  await transaction.actionHistory.create({ data: {
    actionId: after.id, actorId, event, actionVersion: after.version,
    before: before === null ? Prisma.DbNull : seedActionSnapshot(before),
    after: snapshot, sourceTicketStatusHistoryId: null, createdAt: after.updatedAt,
  } });
  await transaction.mutationReceipt.create({ data: {
    actorId, clientMutationId: mutationKey(fixture, ordinal), operation,
    ticketId: after.ticketId, actionId: after.id,
    inputFingerprint: createHash("sha256").update(JSON.stringify(canonical({
      operation, ticketId: after.ticketId, actionId: operation === "CREATE_ACTION" ? null : after.id,
      input: { ...originalInput, clientMutationId: mutationKey(fixture, ordinal) },
    }))).digest("hex"),
    safeResponse: { action: snapshot, ticketUpdatedAt: after.updatedAt.toISOString() },
    createdAt: after.updatedAt,
  } });
  await transaction.ticket.update({ where: { id: after.ticketId }, data: { updatedAt: after.updatedAt } });
}

// Called only for a missing fixture on a locked, editable parent with locked
// eligible actors. Never transitions/backdates an existing operational Action.
export async function createSeedAction(
  transaction: Prisma.TransactionClient, fixture: SeedActionFixture,
  ticketId: number, creatorId: number, assigneeId: number, ticketUpdatedAt: Date,
) {
  const instant = await nextSeedInstant(transaction, ticketUpdatedAt);
  let action = await transaction.action.create({ data: {
    ticketId, createdById: creatorId, assigneeId,
    description: `Fictional diagnostic action ${fixture.ordinal}`,
    result: fixture.status === "CANCELLED" ? "Retained fictional draft result" : null,
    followUpRequired: fixture.status === "COMPLETED" || fixture.status === "CANCELLED",
    followUpNote: fixture.status === "COMPLETED" || fixture.status === "CANCELLED" ? "Fictional follow-up for the next check" : null,
    attachmentNotes: "Fictional attachment description; no Attachment relationship",
    actionAt: instant, createdAt: instant, updatedAt: instant,
  } });
  await record(transaction, fixture, creatorId, "CREATE_ACTION", 1, "ACTION_CREATED", null, action, {
    description: action.description, assigneeId, result: action.result,
    followUpRequired: action.followUpRequired, followUpNote: action.followUpNote,
    attachmentNotes: action.attachmentNotes, expectedTicketUpdatedAt: ticketUpdatedAt.toISOString(),
  });
  if (fixture.status === "IN_PROGRESS" || fixture.status === "COMPLETED") {
    const before = action;
    action = await transaction.action.update({ where: { id: action.id }, data: {
      status: "IN_PROGRESS", version: before.version + 1,
      updatedAt: await nextSeedInstant(transaction, before.updatedAt),
    } });
    await record(transaction, fixture, assigneeId, "START_ACTION", 2, "ACTION_STARTED", before, action, {
      targetStatus: "IN_PROGRESS", expectedVersion: before.version, expectedTicketUpdatedAt: before.updatedAt.toISOString(),
    });
  }
  if (fixture.status === "COMPLETED" || fixture.status === "CANCELLED") {
    const before = action;
    const updatedAt = await nextSeedInstant(transaction, before.updatedAt);
    const completing = fixture.status === "COMPLETED";
    const reason = "Fictional action no longer needed";
    const result = "Fictional diagnostics completed";
    action = await transaction.action.update({ where: { id: action.id }, data: {
      status: fixture.status, version: before.version + 1, updatedAt,
      ...(completing ? { performedById: assigneeId, completedAt: updatedAt, result }
        : { cancelledAt: updatedAt, cancellationReason: reason }),
    } });
    await record(transaction, fixture, assigneeId, completing ? "COMPLETE_ACTION" : "CANCEL_ACTION",
      completing ? 3 : 4, completing ? "ACTION_COMPLETED" : "ACTION_CANCELLED", before, action, {
        targetStatus: fixture.status, confirm: true,
        ...(completing ? { result } : { reason }),
        expectedVersion: before.version, expectedTicketUpdatedAt: before.updatedAt.toISOString(),
      });
  }
  return action;
}
