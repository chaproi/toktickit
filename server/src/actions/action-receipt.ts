import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { CreateActionValidationData } from "./action-validation.js";
import { projectStoredActionDTO } from "./action-projection.js";

const RECEIPT_KEY_CONSTRAINT = "MutationReceipt_actorId_clientMutationId_key";

export function isReceiptKeyConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: unknown; meta?: unknown; constraint?: unknown; table?: unknown };
  if (candidate.code === "23505") {
    return candidate.constraint === RECEIPT_KEY_CONSTRAINT &&
      (candidate.table === undefined || candidate.table === "MutationReceipt");
  }
  if (candidate.code !== "P2002" || typeof candidate.meta !== "object" || candidate.meta === null) return false;
  const meta = candidate.meta as { modelName?: unknown; target?: unknown; constraint?: unknown; table?: unknown };
  if (meta.modelName !== "MutationReceipt" ||
      (meta.constraint !== undefined && meta.constraint !== RECEIPT_KEY_CONSTRAINT) ||
      (meta.table !== undefined && meta.table !== "MutationReceipt")) return false;
  return meta.target === RECEIPT_KEY_CONSTRAINT ||
    (Array.isArray(meta.target) && meta.target.length === 2 &&
      meta.target.includes("actorId") && meta.target.includes("clientMutationId"));
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

export type ActionPatchOperation = "EDIT_ACTION" | "START_ACTION" | "COMPLETE_ACTION" | "CANCEL_ACTION";

export function fingerprintActionPatch(
  operation: ActionPatchOperation, ticketId: number, actionId: number, input: object,
): string {
  // Caller supplies validated original tokens/fields, never merged current state.
  // Recursive ordering retains omitted keys versus supplied null/empty text.
  return createHash("sha256").update(JSON.stringify(canonical({ operation, ticketId, actionId, input }))).digest("hex");
}

export function fingerprintCreateAction(ticketId: number, input: CreateActionValidationData): string {
  // Same recursive key ordering/envelope as seeded CREATE_ACTION receipts.
  // Only validated original input enters identity; no live/session/current-row data.
  return createHash("sha256").update(JSON.stringify(canonical({
    operation: "CREATE_ACTION", ticketId, actionId: null,
    input: {
      description: input.description, assigneeId: input.assigneeId, result: input.result,
      followUpRequired: input.followUpRequired, followUpNote: input.followUpNote,
      attachmentNotes: input.attachmentNotes, expectedTicketUpdatedAt: input.expectedTicketUpdatedAt,
      clientMutationId: input.clientMutationId,
    },
  }))).digest("hex");
}

export function storedActionResponse(value: Prisma.JsonValue) {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      value.action === undefined || typeof value.ticketUpdatedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value.ticketUpdatedAt) ||
      !Number.isFinite(Date.parse(value.ticketUpdatedAt)) ||
      new Date(value.ticketUpdatedAt).toISOString() !== value.ticketUpdatedAt) {
    throw new Error("Stored Action receipt response is invalid.");
  }
  return { action: projectStoredActionDTO(value.action), ticketUpdatedAt: value.ticketUpdatedAt };
}
