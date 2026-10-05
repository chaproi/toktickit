export type CreateActionValidationData = {
  description: string;
  followUpRequired: boolean;
  followUpNote: string | null;
  assigneeId: number;
  expectedTicketUpdatedAt: string;
  clientMutationId: string;
  result: string | null;
  attachmentNotes: string | null;
};

export type CreateActionValidationResult =
  | { success: true; data: CreateActionValidationData }
  | { success: false; fields: Record<string, string> };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Pure API-04 create-payload validation only (T-05 / AC-05, T-49 / AC-41).
// Authorization, eligibility, stale tokens and persistence require API coverage.
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

  let result: string | null = null;
  if (body.result != null) {
    if (typeof body.result !== "string") {
      fields.result = "Result must be text or null.";
    } else {
      result = body.result.trim();
      if (result.length < 1 || result.length > 2000) {
        fields.result = "Result must contain between 1 and 2000 characters.";
      }
    }
  }

  let attachmentNotes: string | null = null;
  if (body.attachmentNotes != null) {
    if (typeof body.attachmentNotes !== "string") {
      fields.attachmentNotes = "Attachment Notes must be text or null.";
    } else {
      attachmentNotes = body.attachmentNotes.trim() || null;
      if (attachmentNotes !== null && attachmentNotes.length > 2000) {
        fields.attachmentNotes = "Attachment Notes must contain at most 2000 characters.";
      }
    }
  }

  const assigneeId = typeof body.assigneeId === "number" ? body.assigneeId : null;
  if (assigneeId === null || !Number.isSafeInteger(assigneeId) || assigneeId <= 0) {
    fields.assigneeId = "Assignee must be a positive safe integer.";
  }

  const expectedTicketUpdatedAt = typeof body.expectedTicketUpdatedAt === "string"
    ? body.expectedTicketUpdatedAt
    : null;
  // Match the inherited timestamp convention: canonical ISO UTC, including
  // exactly three millisecond digits, and no calendar rollover or padding.
  if (expectedTicketUpdatedAt === null ||
      Number.isNaN(Date.parse(expectedTicketUpdatedAt)) ||
      new Date(expectedTicketUpdatedAt).toISOString() !== expectedTicketUpdatedAt) {
    fields.expectedTicketUpdatedAt = "Expected Ticket update time must be an ISO UTC timestamp.";
  }

  // Inherited UUID validation trims whitespace but preserves hexadecimal case.
  const clientMutationId = typeof body.clientMutationId === "string"
    ? body.clientMutationId.trim()
    : "";
  if (!UUID_PATTERN.test(clientMutationId)) {
    fields.clientMutationId = "Mutation identifier must be a valid UUID.";
  }

  if (Object.keys(fields).length > 0 || assigneeId === null || expectedTicketUpdatedAt === null) {
    return { success: false, fields };
  }

  return {
    success: true,
    data: {
      description,
      followUpRequired: body.followUpRequired === true,
      followUpNote,
      assigneeId,
      expectedTicketUpdatedAt,
      clientMutationId,
      result,
      attachmentNotes,
    },
  };
}
