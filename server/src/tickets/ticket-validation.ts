export const REQUESTED_PRIORITIES = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT",
] as const;

export type RequestedPriority =
  (typeof REQUESTED_PRIORITIES)[number];

export type CreateTicketInput = {
  clientSubmissionId: string;
  categoryId: number;
  relatedSystemId: number;
  requestedPriority: RequestedPriority;
  summary: string;
  description: string;
};

export type CreateTicketValidationResult =
  | {
      success: true;
      data: CreateTicketInput;
    }
  | {
      success: false;
      fields: Record<string, string>;
    };

export const TICKET_STATUSES = [
  "NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER",
  "RESOLVED", "CLOSED", "REOPENED", "CANCELLED",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

const STATUS_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  NEW: ["OPEN", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  REOPENED: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  CLOSED: [],
  CANCELLED: [],
};

export function allowedStatusTransitions(status: TicketStatus): TicketStatus[] {
  return [...STATUS_TRANSITIONS[status]];
}

export function statusRequiresOwner(status: TicketStatus): boolean {
  return ["OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED"]
    .includes(status);
}

export function canUnassignTicket(status: TicketStatus): boolean {
  return ["NEW", "OPEN", "REOPENED"].includes(status);
}

type ValidationFailure = { success: false; fields: Record<string, string> };
type OwnerMutation = { ownerId: number | null; expectedUpdatedAt: string };
type PriorityMutation = { itPriority: RequestedPriority; expectedUpdatedAt: string };
type StatusMutation = {
  targetStatus: TicketStatus;
  confirm: boolean;
  reason: string | null;
  expectedUpdatedAt: string;
};

function objectBody(input: unknown, allowed: readonly string[]):
  | { body: Record<string, unknown>; fields: Record<string, string> }
  | ValidationFailure {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { success: false, fields: { body: "Request body must be an object." } };
  }
  const body = input as Record<string, unknown>;
  const fields: Record<string, string> = {};
  if (Object.keys(body).some((key) => !allowed.includes(key))) {
    fields.body = "Unknown fields are not allowed.";
  }
  return { body, fields };
}

function validVersion(value: unknown): value is string {
  return typeof value === "string" && value.trim() === value &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

export function validateStaffClaimMutation(input: unknown):
  | { success: true; data: { expectedUpdatedAt: string } }
  | ValidationFailure {
  const parsed = objectBody(input, ["expectedUpdatedAt"]);
  if ("success" in parsed) return parsed;
  const { body, fields } = parsed;
  if (!validVersion(body.expectedUpdatedAt)) {
    fields.expectedUpdatedAt = "Expected update time must be an ISO 8601 UTC timestamp.";
  }
  return Object.keys(fields).length > 0
    ? { success: false, fields }
    : { success: true, data: { expectedUpdatedAt: body.expectedUpdatedAt as string } };
}

export function validateStaffOwnerMutation(input: unknown):
  | { success: true; data: OwnerMutation }
  | ValidationFailure {
  const parsed = objectBody(input, ["ownerId", "expectedUpdatedAt"]);
  if ("success" in parsed) return parsed;
  const { body, fields } = parsed;
  if (body.ownerId !== null && !isPositiveInteger(body.ownerId)) {
    fields.ownerId = "Owner must be null or a positive integer.";
  }
  if (!validVersion(body.expectedUpdatedAt)) {
    fields.expectedUpdatedAt = "Expected update time must be an ISO 8601 UTC timestamp.";
  }
  return Object.keys(fields).length > 0
    ? { success: false, fields }
    : { success: true, data: { ownerId: body.ownerId as number | null, expectedUpdatedAt: body.expectedUpdatedAt as string } };
}

export function validateStaffPriorityMutation(input: unknown):
  | { success: true; data: PriorityMutation }
  | ValidationFailure {
  const parsed = objectBody(input, ["itPriority", "expectedUpdatedAt"]);
  if ("success" in parsed) return parsed;
  const { body, fields } = parsed;
  if (typeof body.itPriority !== "string" ||
      !REQUESTED_PRIORITIES.includes(body.itPriority as RequestedPriority)) {
    fields.itPriority = "IT Priority must be LOW, MEDIUM, HIGH, or URGENT.";
  }
  if (!validVersion(body.expectedUpdatedAt)) {
    fields.expectedUpdatedAt = "Expected update time must be an ISO 8601 UTC timestamp.";
  }
  return Object.keys(fields).length > 0
    ? { success: false, fields }
    : { success: true, data: { itPriority: body.itPriority as RequestedPriority, expectedUpdatedAt: body.expectedUpdatedAt as string } };
}

export function validateStaffStatusMutation(input: unknown):
  | { success: true; data: StatusMutation }
  | ValidationFailure {
  const parsed = objectBody(input, ["targetStatus", "confirm", "reason", "expectedUpdatedAt"]);
  if ("success" in parsed) return parsed;
  const { body, fields } = parsed;
  if (typeof body.targetStatus !== "string" ||
      !TICKET_STATUSES.includes(body.targetStatus as TicketStatus)) {
    fields.targetStatus = "Target status is invalid.";
  }
  if (body.confirm !== undefined && typeof body.confirm !== "boolean") {
    fields.confirm = "Confirm must be true or false.";
  }
  if (body.reason !== undefined && body.reason !== null && typeof body.reason !== "string") {
    fields.reason = "Reason must be text or null.";
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : null;
  if (body.targetStatus === "CANCELLED" && (!reason || reason.length < 5 || reason.length > 500)) {
    fields.reason = "Cancellation reason must contain between 5 and 500 characters.";
  } else if (reason && reason.length > 500) {
    fields.reason = "Reason must contain at most 500 characters.";
  }
  if (!validVersion(body.expectedUpdatedAt)) {
    fields.expectedUpdatedAt = "Expected update time must be an ISO 8601 UTC timestamp.";
  }
  return Object.keys(fields).length > 0
    ? { success: false, fields }
    : {
        success: true,
        data: {
          targetStatus: body.targetStatus as TicketStatus,
          confirm: body.confirm === true,
          reason,
          expectedUpdatedAt: body.expectedUpdatedAt as string,
        },
      };
}

const ALLOWED_FIELDS = new Set([
  "clientSubmissionId",
  "categoryId",
  "relatedSystemId",
  "requestedPriority",
  "summary",
  "description",
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isPositiveInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0
  );
}

export function validateCreateTicketInput(
  input: unknown,
): CreateTicketValidationResult {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input)
  ) {
    return {
      success: false,
      fields: {
        body: "Request body must be an object.",
      },
    };
  }

  const body = input as Record<string, unknown>;
  const fields: Record<string, string> = {};

  const unknownFields = Object.keys(body).filter(
    (field) => !ALLOWED_FIELDS.has(field),
  );

  if (unknownFields.length > 0) {
    fields.body =
      `Unknown fields are not allowed: ${unknownFields.join(", ")}.`;
  }

  const clientSubmissionId =
    typeof body.clientSubmissionId === "string"
      ? body.clientSubmissionId.trim()
      : "";

  if (!UUID_PATTERN.test(clientSubmissionId)) {
    fields.clientSubmissionId =
      "Submission identifier must be a valid UUID.";
  }

  if (!isPositiveInteger(body.categoryId)) {
    fields.categoryId =
      "Category must be a positive integer.";
  }

  if (!isPositiveInteger(body.relatedSystemId)) {
    fields.relatedSystemId =
      "Related System must be a positive integer.";
  }

  const requestedPriority = body.requestedPriority;

  if (
    typeof requestedPriority !== "string" ||
    !REQUESTED_PRIORITIES.includes(
      requestedPriority as RequestedPriority,
    )
  ) {
    fields.requestedPriority =
      "Priority must be LOW, MEDIUM, HIGH, or URGENT.";
  }

  const summary =
    typeof body.summary === "string"
      ? body.summary.trim()
      : "";

  if (summary.length < 5 || summary.length > 150) {
    fields.summary =
      "Summary must contain 5 to 150 characters.";
  }

  const description =
    typeof body.description === "string"
      ? body.description.trim()
      : "";

  if (
    description.length < 10 ||
    description.length > 5000
  ) {
    fields.description =
      "Description must contain 10 to 5000 characters.";
  }

  if (Object.keys(fields).length > 0) {
    return {
      success: false,
      fields,
    };
  }

  return {
    success: true,
    data: {
      clientSubmissionId,
      categoryId: body.categoryId as number,
      relatedSystemId: body.relatedSystemId as number,
      requestedPriority:
        requestedPriority as RequestedPriority,
      summary,
      description,
    },
  };
}
