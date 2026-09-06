import { describe, expect, it } from "vitest";
import { validateCreateTicketInput } from "../../src/tickets/ticket-validation.js";

const validInput = {
  clientSubmissionId:
    "5b7f6b32-e929-4ac8-9c95-079956888f2f",
  categoryId: 1,
  relatedSystemId: 2,
  requestedPriority: "MEDIUM",
  summary: "Laptop battery drains quickly",
  description:
    "The battery decreases from full to empty in approximately one hour.",
};

describe("Create Ticket validation", () => {
  it("UNIT-02 accepts valid data and trims user-entered text", () => {
    const result = validateCreateTicketInput({
      ...validInput,
      summary: "  Laptop battery drains quickly  ",
      description:
        "  The battery decreases from full to empty quickly.  ",
    });

    expect(result).toEqual({
      success: true,
      data: {
        ...validInput,
        summary: "Laptop battery drains quickly",
        description:
          "The battery decreases from full to empty quickly.",
      },
    });
  });

  it("rejects invalid identifiers, priority, and text lengths", () => {
    const result = validateCreateTicketInput({
      clientSubmissionId: "not-a-uuid",
      categoryId: 0,
      relatedSystemId: "2",
      requestedPriority: "CRITICAL",
      summary: "   ",
      description: "short",
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.fields).toMatchObject({
        clientSubmissionId:
          "Submission identifier must be a valid UUID.",
        categoryId:
          "Category must be a positive integer.",
        relatedSystemId:
          "Related System must be a positive integer.",
        requestedPriority:
          "Priority must be LOW, MEDIUM, HIGH, or URGENT.",
        summary:
          "Summary must contain 5 to 150 characters.",
        description:
          "Description must contain 10 to 5000 characters.",
      });
    }
  });

  it("treats whitespace-only required values as empty", () => {
    const result = validateCreateTicketInput({
      ...validInput,
      summary: "     ",
      description: "\n\t   ",
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.fields.summary).toBe(
        "Summary must contain 5 to 150 characters.",
      );
      expect(result.fields.description).toBe(
        "Description must contain 10 to 5000 characters.",
      );
    }
  });

  it("rejects unknown and system-managed fields", () => {
    const result = validateCreateTicketInput({
      ...validInput,
      requesterId: 999,
      ticketNumber: "TKT-2026-99999",
      currentStatus: "CLOSED",
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.fields.body).toBe(
        "Unknown fields are not allowed: requesterId, ticketNumber, currentStatus.",
      );
    }
  });
});