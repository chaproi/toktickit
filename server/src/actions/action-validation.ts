export type CreateActionValidationData = {
  description: string;
  followUpRequired: boolean;
  followUpNote: string | null;
  assigneeId: unknown;
  expectedTicketUpdatedAt: unknown;
  clientMutationId: unknown;
  result: unknown;
  attachmentNotes: unknown;
};

export type CreateActionValidationResult =
  | { success: true; data: CreateActionValidationData }
  | { success: false; fields: Record<string, string> };

// T-05 / AC-05 and T-49 / AC-41 create-validation foundation only.
// Before API use, later tests-first batches must validate result and
// attachmentNotes types/bounds, assigneeId, strict UTC tokens and UUID keys.
// Those fields remain unknown here; success is not complete API-04 validation.
export function validateCreateActionInput(
  input: unknown,
): CreateActionValidationResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { success: false, fields: { body: "Request body must be an object." } };
  }

  const body = input as Record<string, unknown>;
  const fields: Record<string, string> = {};
  const allowedFields = [
    "description",
    "assigneeId",
    "followUpRequired",
    "expectedTicketUpdatedAt",
    "clientMutationId",
    "result",
    "followUpNote",
    "attachmentNotes",
  ];
  if (Object.keys(body).some((field) => !allowedFields.includes(field))) {
    fields.body = "Unknown fields are not allowed.";
  }

  const description = typeof body.description === "string"
    ? body.description.trim()
    : "";
  if (description.length < 5 || description.length > 2000) {
    fields.description = "Description must contain between 5 and 2000 characters.";
  }

  if (typeof body.followUpRequired !== "boolean") {
    fields.followUpRequired = "Follow-up Required must be true or false.";
  }

  let followUpNote: string | null = null;
  if (body.followUpRequired === true) {
    followUpNote = typeof body.followUpNote === "string"
      ? body.followUpNote.trim()
      : null;
    if (followUpNote === null || followUpNote.length < 1 || followUpNote.length > 2000) {
      fields.followUpNote = "Follow-up Note must contain between 1 and 2000 characters.";
    }
  } else if (body.followUpRequired === false && body.followUpNote != null) {
    if (typeof body.followUpNote !== "string" || body.followUpNote.trim() !== "") {
      fields.followUpNote = "Follow-up Note must be empty when follow-up is not required.";
    }
  }

  if (Object.keys(fields).length > 0) {
    return { success: false, fields };
  }

  // Normalize supplied strings without interpreting HTML or coercing types.
  // Non-string values in these not-yet-validated fields are retained as unknown.
  const result = typeof body.result === "string" ? body.result.trim() : body.result ?? null;
  const attachmentNotes = typeof body.attachmentNotes === "string"
    ? body.attachmentNotes.trim() || null
    : body.attachmentNotes ?? null;

  return {
    success: true,
    data: {
      description,
      followUpRequired: body.followUpRequired === true,
      followUpNote,
      assigneeId: body.assigneeId,
      expectedTicketUpdatedAt: body.expectedTicketUpdatedAt,
      clientMutationId: body.clientMutationId,
      result,
      attachmentNotes,
    },
  };
}
