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

// Match PostgreSQL char_length: count code points without rewriting text.
function codePointLength(value: string): number {
  return Array.from(value).length;
}

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
  if (codePointLength(description) < 5 || codePointLength(description) > 2000) {
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
    if (followUpNote === null || codePointLength(followUpNote) < 1 || codePointLength(followUpNote) > 2000) {
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
      if (codePointLength(result) < 1 || codePointLength(result) > 2000) {
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
      if (attachmentNotes !== null && codePointLength(attachmentNotes) > 2000) {
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

export type EditableActionValues = {
  description: string;
  result: string | null;
  assigneeId: number;
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
};

// Only supplied keys are present, and editable text remains untrimmed here.
export type ActionEditPatch = Partial<EditableActionValues>;
export type EditActionValidationData = {
  expectedVersion: number;
  expectedTicketUpdatedAt: string;
  clientMutationId: string;
  patch: ActionEditPatch;
};

type ActionValidationResult<T> =
  | { success: true; data: T }
  | { success: false; fields: Record<string, string> };
export type EditActionValidationResult = ActionValidationResult<EditActionValidationData>;
export type MergedActionEditValidationResult = ActionValidationResult<EditableActionValues>;

const EDITABLE_ACTION_FIELDS = [
  "description", "result", "assigneeId", "followUpRequired", "followUpNote", "attachmentNotes",
] as const;

function validNullableEditText(value: unknown, minimum: number): value is string | null {
  return value === null || (typeof value === "string" &&
    codePointLength(value.trim()) >= minimum && codePointLength(value.trim()) <= 2000);
}

// Validate supplied values without defaults, normalization or current-state rules.
function validateEditableActionPatch(
  body: Readonly<Record<string, unknown>>,
): ActionValidationResult<ActionEditPatch> {
  const patch: ActionEditPatch = {};
  const fields: Record<string, string> = {};

  if (Object.hasOwn(body, "description")) {
    const value = body.description;
    if (typeof value !== "string" || codePointLength(value.trim()) < 5 || codePointLength(value.trim()) > 2000) {
      fields.description = "Description must contain between 5 and 2000 characters.";
    } else {
      patch.description = value;
    }
  }
  if (Object.hasOwn(body, "result")) {
    const value = body.result;
    if (!validNullableEditText(value, 1)) {
      fields.result = "Result must be null or text containing between 1 and 2000 characters.";
    } else {
      patch.result = value;
    }
  }
  if (Object.hasOwn(body, "attachmentNotes")) {
    const value = body.attachmentNotes;
    if (!validNullableEditText(value, 0)) {
      fields.attachmentNotes = "Attachment Notes must be null or text of at most 2000 characters.";
    } else {
      patch.attachmentNotes = value;
    }
  }
  if (Object.hasOwn(body, "assigneeId")) {
    const value = body.assigneeId;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
      fields.assigneeId = "Assignee must be a positive safe integer.";
    } else {
      patch.assigneeId = value;
    }
  }
  if (Object.hasOwn(body, "followUpRequired")) {
    const value = body.followUpRequired;
    if (typeof value !== "boolean") {
      fields.followUpRequired = "Follow-up Required must be true or false.";
    } else {
      patch.followUpRequired = value;
    }
  }
  if (Object.hasOwn(body, "followUpNote")) {
    const value = body.followUpNote;
    // Empty/null may be valid when the final state is false. Preserve them so
    // the merge can distinguish explicit null from an empty replacement.
    if (!validNullableEditText(value, 0)) {
      fields.followUpNote = "Follow-up Note must be null or text of at most 2000 characters.";
    } else {
      patch.followUpNote = value;
    }
  }

  return Object.keys(fields).length > 0
    ? { success: false, fields }
    : { success: true, data: patch };
}

// Receipt handling must retain/fingerprint the original request, including
// field presence; neither these normalized tokens nor merged values replace it.
export function validateEditActionInput(input: unknown): EditActionValidationResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { success: false, fields: { body: "Request body must be an object." } };
  }
  const body = input as Record<string, unknown>;
  const parsedPatch = validateEditableActionPatch(body);
  const fields: Record<string, string> = parsedPatch.success ? {} : { ...parsedPatch.fields };
  const allowedFields: readonly string[] = [
    ...EDITABLE_ACTION_FIELDS, "expectedVersion", "expectedTicketUpdatedAt", "clientMutationId",
  ];
  if (Object.keys(body).some((key) => !allowedFields.includes(key))) {
    fields.body = "Unknown fields are not allowed.";
  }
  if (!EDITABLE_ACTION_FIELDS.some((key) => Object.hasOwn(body, key))) {
    fields.body = "At least one editable field is required.";
  }

  const expectedVersion = typeof body.expectedVersion === "number" ? body.expectedVersion : null;
  if (expectedVersion === null || !Number.isSafeInteger(expectedVersion) || expectedVersion <= 0) {
    fields.expectedVersion = "Expected version must be a positive safe integer.";
  }
  const expectedTicketUpdatedAt = typeof body.expectedTicketUpdatedAt === "string"
    ? body.expectedTicketUpdatedAt
    : null;
  if (expectedTicketUpdatedAt === null ||
      Number.isNaN(Date.parse(expectedTicketUpdatedAt)) ||
      new Date(expectedTicketUpdatedAt).toISOString() !== expectedTicketUpdatedAt) {
    fields.expectedTicketUpdatedAt = "Expected Ticket update time must be an ISO UTC timestamp.";
  }
  const clientMutationId = typeof body.clientMutationId === "string"
    ? body.clientMutationId.trim()
    : "";
  if (!UUID_PATTERN.test(clientMutationId)) {
    fields.clientMutationId = "Mutation identifier must be a valid UUID.";
  }

  if (Object.keys(fields).length > 0 || expectedVersion === null ||
      expectedTicketUpdatedAt === null || !parsedPatch.success) {
    return { success: false, fields };
  }
  return {
    success: true,
    data: { expectedVersion, expectedTicketUpdatedAt, clientMutationId, patch: parsedPatch.data },
  };
}

export function mergeAndValidateActionEdit(
  current: Readonly<EditableActionValues>,
  patch: Readonly<ActionEditPatch>,
): MergedActionEditValidationResult {
  const checkedPatch = validateEditableActionPatch(patch);
  if (!checkedPatch.success) return checkedPatch;

  // Explicit projection keeps identity/status/tokens out of the editable state.
  const final: EditableActionValues = {
    description: current.description,
    result: current.result,
    assigneeId: current.assigneeId,
    followUpRequired: current.followUpRequired,
    followUpNote: current.followUpNote,
    attachmentNotes: current.attachmentNotes,
  };
  const values = checkedPatch.data;
  if (values.followUpRequired !== undefined) final.followUpRequired = values.followUpRequired;

  // Check raw presence/null BEFORE empty text normalization can erase intent.
  if (current.followUpRequired && current.followUpNote !== null && !final.followUpRequired &&
      (!Object.hasOwn(values, "followUpNote") || values.followUpNote !== null)) {
    return {
      success: false,
      fields: { followUpNote: "Explicit null is required to clear the existing follow-up note." },
    };
  }

  if (values.description !== undefined) final.description = values.description.trim();
  if (values.result !== undefined) final.result = values.result === null ? null : values.result.trim();
  if (values.assigneeId !== undefined) final.assigneeId = values.assigneeId;
  if (values.attachmentNotes !== undefined) {
    final.attachmentNotes = values.attachmentNotes === null ? null : values.attachmentNotes.trim() || null;
  }
  if (values.followUpNote !== undefined) {
    final.followUpNote = values.followUpNote === null ? null : values.followUpNote.trim() || null;
  }

  const checkedFinal = validateEditableActionPatch(final);
  if (!checkedFinal.success) return checkedFinal;
  if (final.followUpRequired && (final.followUpNote === null || codePointLength(final.followUpNote.trim()) < 1)) {
    return {
      success: false,
      fields: { followUpNote: "Follow-up Note must contain between 1 and 2000 characters." },
    };
  }
  if (!final.followUpRequired && final.followUpNote !== null) {
    return {
      success: false,
      fields: { followUpNote: "Follow-up Note must be empty when follow-up is not required." },
    };
  }

  // Effective no-ops remain valid here; the service owns ACTION_UNCHANGED (409).
  return { success: true, data: final };
}

export type ActionStatusTokens = {
  expectedVersion: number;
  expectedTicketUpdatedAt: string;
  clientMutationId: string;
};
export type ActionStatusValidationData = ActionStatusTokens & (
  | { targetStatus: "PLANNED" | "IN_PROGRESS" }
  | { targetStatus: "COMPLETED"; confirm: true; result: string }
  | { targetStatus: "CANCELLED"; confirm: true; reason: string }
);
export type ActionStatusValidationResult = ActionValidationResult<ActionStatusValidationData>;

// Pure API-06 shape validation. Recognized targets include PLANNED; current
// state, forbidden/same-state edges, parent gates and eligibility are service
// obligations. Existing follow-up state does not belong to this request.
export function validateActionStatusInput(input: unknown): ActionStatusValidationResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { success: false, fields: { body: "Request body must be an object." } };
  }
  const body = input as Record<string, unknown>;
  const fields: Record<string, string> = {};
  const suppliedTarget = body.targetStatus;
  const targetStatus = suppliedTarget === "PLANNED" || suppliedTarget === "IN_PROGRESS" ||
    suppliedTarget === "COMPLETED" || suppliedTarget === "CANCELLED"
    ? suppliedTarget
    : null;
  if (targetStatus === null) {
    fields.targetStatus = "Target status must be a recognized Action status.";
  }

  const allowedFields = [
    "targetStatus", "expectedVersion", "expectedTicketUpdatedAt", "clientMutationId",
  ];
  if (targetStatus === "COMPLETED") allowedFields.push("confirm", "result");
  if (targetStatus === "CANCELLED") allowedFields.push("confirm", "reason");
  // Presence matters: irrelevant null/false fields are still supplied fields.
  if (Object.keys(body).some((field) => !allowedFields.includes(field))) {
    fields.body = "Unknown or irrelevant fields are not allowed.";
  }

  const expectedVersion = typeof body.expectedVersion === "number" ? body.expectedVersion : null;
  if (expectedVersion === null || !Number.isSafeInteger(expectedVersion) || expectedVersion <= 0) {
    fields.expectedVersion = "Expected version must be a positive safe integer.";
  }
  const expectedTicketUpdatedAt = typeof body.expectedTicketUpdatedAt === "string"
    ? body.expectedTicketUpdatedAt
    : null;
  if (expectedTicketUpdatedAt === null ||
      Number.isNaN(Date.parse(expectedTicketUpdatedAt)) ||
      new Date(expectedTicketUpdatedAt).toISOString() !== expectedTicketUpdatedAt) {
    fields.expectedTicketUpdatedAt = "Expected Ticket update time must be an ISO UTC timestamp.";
  }
  const clientMutationId = typeof body.clientMutationId === "string"
    ? body.clientMutationId.trim()
    : "";
  if (!UUID_PATTERN.test(clientMutationId)) {
    fields.clientMutationId = "Mutation identifier must be a valid UUID.";
  }

  let result = "";
  let reason = "";
  if (targetStatus === "COMPLETED" || targetStatus === "CANCELLED") {
    if (body.confirm !== true) fields.confirm = "Confirmation must be true.";
  }
  if (targetStatus === "COMPLETED") {
    result = typeof body.result === "string" ? body.result.trim() : "";
    if (codePointLength(result) < 1 || codePointLength(result) > 2000) {
      fields.result = "Result must contain between 1 and 2000 characters.";
    }
  }
  if (targetStatus === "CANCELLED") {
    reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (codePointLength(reason) < 5 || codePointLength(reason) > 500) {
      fields.reason = "Cancellation reason must contain between 5 and 500 characters.";
    }
  }

  if (Object.keys(fields).length > 0 || targetStatus === null ||
      expectedVersion === null || expectedTicketUpdatedAt === null) {
    return { success: false, fields };
  }
  const tokens: ActionStatusTokens = { expectedVersion, expectedTicketUpdatedAt, clientMutationId };
  if (targetStatus === "COMPLETED") {
    return { success: true, data: { ...tokens, targetStatus, confirm: true, result } };
  }
  if (targetStatus === "CANCELLED") {
    return { success: true, data: { ...tokens, targetStatus, confirm: true, reason } };
  }
  return { success: true, data: { ...tokens, targetStatus } };
}
