import { describe, expect, it } from "vitest";
import { validateCreateActionInput } from "../../src/actions/action-validation.js";

// Partial RED coverage only: T-05 / AC-05 and T-49 / AC-41.
// Planned public interface: validateCreateActionInput(input: unknown) returns
// { success: true, data: normalized create fields } or
// { success: false, fields: Record<string, string> }. No database access.
// API-04 allows exactly these five required fields plus result,
// followUpNote and attachmentNotes. Identity/status/times are server-owned.
const validCreateInput = {
  description: "Investigate the reported connection failure",
  assigneeId: 21,
  followUpRequired: false,
  expectedTicketUpdatedAt: "2026-10-05T03:00:00.000Z",
  clientMutationId: "5b7f6b32-e929-4ac8-9c95-079956888f2f",
};

function createInput(
  overrides: Record<string, unknown> = {},
  omittedFields: readonly string[] = [],
): Record<string, unknown> {
  const input: Record<string, unknown> = { ...validCreateInput, ...overrides };
  for (const field of omittedFields) delete input[field];
  return input;
}

function validateWithoutInputMutation(input: Record<string, unknown>) {
  const before = structuredClone(input);
  const result = validateCreateActionInput(input);
  expect(input).toStrictEqual(before);
  return result;
}

function expectFieldError(input: Record<string, unknown>, field: string) {
  expect(validateWithoutInputMutation(input)).toMatchObject({
    success: false,
    fields: { [field]: expect.any(String) },
  });
}

describe("T-05 / AC-05: pure Action create validation", () => {
  it("accepts the minimum required payload", () => {
    expect(validateWithoutInputMutation(createInput())).toMatchObject({
      success: true,
      data: { ...validCreateInput, followUpNote: null },
    });
  });

  it("accepts all eight API-04 fields with explicit normalized values", () => {
    const input = createInput({
      description: "  Check the network  ",
      result: "  Initial checks recorded  ",
      followUpRequired: true,
      followUpNote: "  Arrange a diagnostic session  ",
      attachmentNotes: "  See the Ticket attachment panel  ",
    });
    expect(validateWithoutInputMutation(input)).toMatchObject({
      success: true,
      data: {
        ...validCreateInput,
        description: "Check the network",
        result: "Initial checks recorded",
        followUpRequired: true,
        followUpNote: "Arrange a diagnostic session",
        attachmentNotes: "See the Ticket attachment panel",
      },
    });
  });

  it.each([
    { label: "trimmed minimum 5", supplied: " \nabcde\t ", expected: "abcde" },
    { label: "trimmed maximum 2000", supplied: `  ${"x".repeat(2000)}  `, expected: "x".repeat(2000) },
  ])("accepts description at $label", ({ supplied, expected }) => {
    expect(validateWithoutInputMutation(createInput({ description: supplied }))).toMatchObject({
      success: true,
      data: { description: expected },
    });
  });

  it.each([
    { label: "trimmed length 4", value: "  abcd  " },
    { label: "trimmed length 2001", value: `  ${"x".repeat(2001)}  ` },
    { label: "empty", value: "" },
    { label: "whitespace-only", value: " \n\t " },
    { label: "null", value: null },
    { label: "undefined", value: undefined },
    { label: "number", value: 42 },
    { label: "boolean", value: false },
    { label: "array", value: ["Valid description text"] },
    { label: "object", value: { text: "Valid description text" } },
  ])("rejects a $label description with its field error", ({ value }) => {
    expectFieldError(createInput({ description: value }), "description");
  });

  it("rejects an omitted description with its field error", () => {
    expectFieldError(createInput({}, ["description"]), "description");
  });

  it.each([
    ["unexpected", "extra"],
    ["ticketId", 121],
    ["createdById", 22],
    ["createdBy", { id: 22, name: "Supplied creator" }],
    ["performedById", 23],
    ["performedBy", { id: 23, name: "Supplied performer" }],
    ["status", "COMPLETED"],
    ["actionAt", "2026-10-05T03:00:00.000Z"],
    ["createdAt", "2026-10-05T03:00:00.000Z"],
    ["updatedAt", "2026-10-05T03:00:00.000Z"],
    ["completedAt", "2026-10-05T03:00:00.000Z"],
    ["cancelledAt", "2026-10-05T03:00:00.000Z"],
    ["cancellationReason", "Supplied cancellation reason"],
    ["version", 1],
    ["history", []],
    ["expectedVersion", 1],
    ["attachmentId", 301],
    ["attachmentIds", [301]],
    ["attachments", [{ id: 301 }]],
  ] satisfies Array<[string, unknown]>)("rejects non-allowlisted field %s", (field, value) => {
    const result = validateWithoutInputMutation(createInput({ [field]: value }));
    expect(result).toMatchObject({ success: false, fields: expect.any(Object) });
    if (!result.success) {
      expect(Object.keys(result.fields).length).toBeGreaterThan(0);
      expect(Object.values(result.fields).every((message) => typeof message === "string"))
        .toBe(true);
    }
  });

  it.each([
    { label: "null", value: null },
    { label: "undefined", value: undefined },
    { label: "string true", value: "true" },
    { label: "string false", value: "false" },
    { label: "number zero", value: 0 },
    { label: "number one", value: 1 },
    { label: "array", value: [] },
    { label: "object", value: {} },
  ])("rejects $label instead of a boolean followUpRequired", ({ value }) => {
    expectFieldError(createInput({ followUpRequired: value }), "followUpRequired");
  });

  it("requires followUpRequired even when the note is omitted", () => {
    expectFieldError(createInput({}, ["followUpRequired"]), "followUpRequired");
  });

  it("preserves literal script-like text without interpreting or encoding it", () => {
    const literal = "<script>alert('diagnostic')</script> & <b>plain text</b>";
    const input = createInput({
      description: `  ${literal}  `,
      result: literal,
      followUpRequired: true,
      followUpNote: literal,
      attachmentNotes: literal,
    });
    expect(validateWithoutInputMutation(input)).toMatchObject({
      success: true,
      data: {
        description: literal,
        result: literal,
        followUpRequired: true,
        followUpNote: literal,
        attachmentNotes: literal,
      },
    });
  });

  it.each([
    { label: "accepted trimmed text", overrides: { description: "  Check the network  " } },
    { label: "rejected description", overrides: { description: "  abcd  " } },
    { label: "rejected nested note", overrides: { followUpNote: { text: "Do not alter this object" } } },
  ])("does not mutate input with $label", ({ overrides }) => {
    const input = createInput(overrides);
    const before = structuredClone(input);
    validateCreateActionInput(input);
    expect(input).toStrictEqual(before);
  });
});

describe("T-49 / AC-41: pure create follow-up note validation", () => {
  it("normalizes an omitted false-follow-up note to null", () => {
    expect(validateWithoutInputMutation(createInput())).toMatchObject({
      success: true,
      data: { followUpRequired: false, followUpNote: null },
    });
  });

  it.each([
    { label: "null", value: null },
    { label: "empty", value: "" },
    { label: "whitespace-only", value: " \n\t " },
  ])("normalizes a $label false-follow-up note to null", ({ value }) => {
    expect(validateWithoutInputMutation(createInput({ followUpNote: value }))).toMatchObject({
      success: true,
      data: { followUpRequired: false, followUpNote: null },
    });
  });

  it.each([
    { label: "nonempty", value: "x" },
    { label: "padded nonempty", value: "  Arrange a diagnostic session  " },
    { label: "number", value: 42 },
    { label: "boolean", value: false },
    { label: "array", value: [] },
    { label: "object", value: { text: "Arrange a diagnostic session" } },
  ])("rejects a $label false-follow-up note instead of discarding it", ({ value }) => {
    expectFieldError(createInput({ followUpNote: value }), "followUpNote");
  });

  it.each([
    { label: "trimmed minimum 1", supplied: " \nx\t ", expected: "x" },
    { label: "trimmed maximum 2000", supplied: `  ${"x".repeat(2000)}  `, expected: "x".repeat(2000) },
  ])("accepts a true-follow-up note at $label", ({ supplied, expected }) => {
    expect(validateWithoutInputMutation(createInput({
      followUpRequired: true,
      followUpNote: supplied,
    }))).toMatchObject({
      success: true,
      data: { followUpRequired: true, followUpNote: expected },
    });
  });

  it("rejects an omitted true-follow-up note with its field error", () => {
    expectFieldError(createInput({ followUpRequired: true }), "followUpNote");
  });

  it.each([
    { label: "null", value: null },
    { label: "undefined", value: undefined },
    { label: "empty", value: "" },
    { label: "whitespace-only", value: " \n\t " },
    { label: "trimmed length 2001", value: `  ${"x".repeat(2001)}  ` },
    { label: "number", value: 42 },
    { label: "boolean", value: true },
    { label: "array", value: ["Arrange a diagnostic session"] },
    { label: "object", value: { text: "Arrange a diagnostic session" } },
  ])("rejects a $label true-follow-up note with its field error", ({ value }) => {
    expectFieldError(createInput({ followUpRequired: true, followUpNote: value }), "followUpNote");
  });
});
