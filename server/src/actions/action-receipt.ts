import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { CreateActionValidationData } from "./action-validation.js";
import { projectStoredActionDTO } from "./action-projection.js";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
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
