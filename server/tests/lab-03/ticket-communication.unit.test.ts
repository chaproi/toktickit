import { describe, expect, it } from "vitest";
import * as comments from "../../src/comments/comment-service.js";

describe("UNIT-06 Ticket communication validation", () => {
  it("trims valid Internal Notes and enforces the 1 to 5000 character boundary", () => {
    const validate = (comments as unknown as {
      validateInternalNoteBody?: (body: unknown) => unknown;
    }).validateInternalNoteBody;
    expect(validate).toBeTypeOf("function");
    expect(validate?.({ content: "  private operational note  " })).toEqual({
      success: true,
      content: "private operational note",
    });
    expect(validate?.({ content: "   " })).toMatchObject({ success: false });
    expect(validate?.({ content: "x".repeat(5_001) })).toMatchObject({ success: false });
    expect(validate?.({ content: "valid", ticketId: 10 })).toMatchObject({ success: false });
  });

  it("keeps Public Comment and Internal Note limits distinct", () => {
    expect(comments.validateCommentBody({ content: "x".repeat(2_001) })).toMatchObject({ success: false });
    const validate = (comments as unknown as {
      validateInternalNoteBody?: (body: unknown) => unknown;
    }).validateInternalNoteBody;
    expect(validate?.({ content: "x".repeat(2_001) })).toMatchObject({ success: true });
  });
});
