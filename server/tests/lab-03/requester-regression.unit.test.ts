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

  it("accepts exact Lab 2 boundaries and rejects values immediately outside them", () => {
    const valid = {
      clientSubmissionId: "df2bea34-ddb5-4aa6-b2c8-286ed38d6085",
      categoryId: 1,
      relatedSystemId: 1,
      requestedPriority: "URGENT",
      summary: "s".repeat(5),
      description: "d".repeat(10),
    };

    expect(validateCreateTicketInput(valid)).toMatchObject({ success: true });
    expect(validateCreateTicketInput({
      ...valid,
      summary: "s".repeat(150),
      description: "d".repeat(5_000),
    })).toMatchObject({ success: true });

    for (const [field, value] of [
      ["summary", "s".repeat(4)],
      ["summary", "s".repeat(151)],
      ["description", "d".repeat(9)],
      ["description", "d".repeat(5_001)],
    ] as const) {
      const result = validateCreateTicketInput({ ...valid, [field]: value });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.fields[field]).toEqual(expect.any(String));
    }
  });
});
