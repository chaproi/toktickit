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