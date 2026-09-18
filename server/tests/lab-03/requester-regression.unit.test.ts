import { describe, expect, it } from "vitest";
import { parseTicketListQuery } from "../../src/tickets/ticket-query.js";
import { validateCreateTicketInput } from "../../src/tickets/ticket-validation.js";

describe("Issue 29 Requester regression adapters", () => {
  it("retains all eight Lab 3 statuses in the Requester filter", () => {
    for (const currentStatus of [
      "NEW",
      "OPEN",
      "IN_PROGRESS",
      "WAITING_FOR_REQUESTER",
      "REOPENED",
      "RESOLVED",
      "CLOSED",
      "CANCELLED",
    ]) {
      expect(parseTicketListQuery({ currentStatus }).success).toBe(true);
    }
  });

  it("rejects client-supplied ownership while retaining Lab 2 limits", () => {
    const result = validateCreateTicketInput({
      clientSubmissionId: "df2bea34-ddb5-4aa6-b2c8-286ed38d6085",
      categoryId: 1,
      relatedSystemId: 1,
      requestedPriority: "HIGH",
      summary: "Valid summary",
      description: "A valid Ticket description.",
      requesterId: 999,
    });
    expect(result).toEqual({
      success: false,
      fields: { body: "Unknown fields are not allowed: requesterId." },
    });
  });
});
