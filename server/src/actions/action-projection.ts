import { ActionStatus, Prisma } from "@prisma/client";

const identitySelect = { id: true, name: true } as const;

export const actionSelect = {
  id: true, ticketId: true, actionAt: true, description: true, result: true,
  createdBy: { select: identitySelect }, assignee: { select: identitySelect }, performedBy: { select: identitySelect },
  status: true, followUpRequired: true, followUpNote: true, attachmentNotes: true, cancellationReason: true,
  createdAt: true, updatedAt: true, completedAt: true, cancelledAt: true, version: true,
} satisfies Prisma.ActionSelect;

export const actionHistorySelect = {
  id: true, actionId: true, actor: { select: identitySelect }, event: true, createdAt: true,
  actionVersion: true, sourceTicketStatusHistoryId: true, before: true, after: true,
} satisfies Prisma.ActionHistorySelect;

type SelectedAction = Prisma.ActionGetPayload<{ select: typeof actionSelect }>;
type SelectedHistory = Prisma.ActionHistoryGetPayload<{ select: typeof actionHistorySelect }>;

function identity(user: { id: number; name: string }) {
  return { id: user.id, name: user.name };
}

export function toActionDTO(action: SelectedAction) {
  return {
    id: action.id, ticketId: action.ticketId, actionAt: action.actionAt.toISOString(),
    description: action.description, result: action.result, createdBy: identity(action.createdBy),
    assignee: identity(action.assignee), performedBy: action.performedBy === null ? null : identity(action.performedBy),
    status: action.status, followUpRequired: action.followUpRequired, followUpNote: action.followUpNote,
    attachmentNotes: action.attachmentNotes, cancellationReason: action.cancellationReason,
    createdAt: action.createdAt.toISOString(), updatedAt: action.updatedAt.toISOString(),
    completedAt: action.completedAt?.toISOString() ?? null, cancelledAt: action.cancelledAt?.toISOString() ?? null,
    version: action.version,
  };
}

export type ActionDTO = ReturnType<typeof toActionDTO>;

function invalidSnapshot(): never {
  // Do not attach stored JSON to errors or repair history during a read.
  throw new Error("Stored Action history snapshot is invalid.");
}

function scalarText(value: Prisma.JsonValue | undefined): string {
  return typeof value === "string" ? value : invalidSnapshot();
}

function nullableText(value: Prisma.JsonValue | undefined): string | null {
  return value === null ? null : scalarText(value);
}

function scalarId(value: Prisma.JsonValue | undefined): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : invalidSnapshot();
}

function nullableId(value: Prisma.JsonValue | undefined): number | null {
  return value === null ? null : scalarId(value);
}

function timestamp(value: Prisma.JsonValue | undefined): string {
  const text = scalarText(value);
  const parsed = new Date(text);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(text) &&
    Number.isFinite(parsed.getTime()) && parsed.toISOString() === text ? text : invalidSnapshot();
}

function nullableTimestamp(value: Prisma.JsonValue | undefined): string | null {
  return value === null ? null : timestamp(value);
}

export function projectActionHistorySnapshot(value: Prisma.JsonValue) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return invalidSnapshot();
  const status = Object.values(ActionStatus).find((candidate) => candidate === value.status);
  if (status === undefined || typeof value.followUpRequired !== "boolean") return invalidSnapshot();
  // Explicit scalar projection prevents extra/nested JSON fields leaking through history.
  // Nullable keys must actually be present as null or their approved scalar type.
  return {
    id: scalarId(value.id), ticketId: scalarId(value.ticketId), createdById: scalarId(value.createdById),
    assigneeId: scalarId(value.assigneeId), performedById: nullableId(value.performedById), status,
    description: scalarText(value.description), result: nullableText(value.result),
    followUpRequired: value.followUpRequired, followUpNote: nullableText(value.followUpNote),
    attachmentNotes: nullableText(value.attachmentNotes), actionAt: timestamp(value.actionAt),
    createdAt: timestamp(value.createdAt), updatedAt: timestamp(value.updatedAt),
    completedAt: nullableTimestamp(value.completedAt), cancelledAt: nullableTimestamp(value.cancelledAt),
    cancellationReason: nullableText(value.cancellationReason), version: scalarId(value.version),
  };
}

export function toActionHistoryDTO(history: SelectedHistory) {
  return {
    id: history.id, actionId: history.actionId, actor: identity(history.actor), event: history.event,
    createdAt: history.createdAt.toISOString(), actionVersion: history.actionVersion,
    sourceTicketStatusHistoryId: history.sourceTicketStatusHistoryId,
    before: history.before === null ? null : projectActionHistorySnapshot(history.before),
    after: projectActionHistorySnapshot(history.after),
  };
}
