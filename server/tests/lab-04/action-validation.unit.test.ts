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

// Second RED batch: remaining pure API-04 create fields, T-05 / AC-05 only.
// No eligibility, session, persistence, receipt or partial-edit assertions here.
describe("T-05 / AC-05: remaining pure create fields (second RED batch)", () => {
  describe("result", () => {
    it.each([
      { label: "omitted", overrides: {} },
      { label: "null", overrides: { result: null } },
    ])("normalizes $label to null", ({ overrides }) => {
      expect(validateWithoutInputMutation(createInput(overrides))).toMatchObject({
        success: true,
        data: { result: null },
      });
    });

    it.each([
      { label: "trimmed minimum 1", supplied: " \nx\t ", expected: "x" },
      {
        label: "trimmed maximum 2000",
        supplied: `  ${"x".repeat(2000)}  `,
        expected: "x".repeat(2000),
      },
    ])("accepts $label", ({ supplied, expected }) => {
      expect(validateWithoutInputMutation(createInput({ result: supplied }))).toMatchObject({
        success: true,
        data: { result: expected },
      });
    });

    it.each([
      { label: "empty", value: "" },
      { label: "whitespace-only", value: " \n\t " },
      { label: "trimmed length 2001", value: `  ${"x".repeat(2001)}  ` },
      { label: "number", value: 42 },
      { label: "boolean", value: false },
      { label: "array", value: ["Initial checks recorded"] },
      { label: "object", value: { text: "Initial checks recorded" } },
    ])("rejects $label with a result field error", ({ value }) => {
      expectFieldError(createInput({ result: value }), "result");
    });
  });

  describe("attachmentNotes", () => {
    it.each([
      { label: "omitted", overrides: {} },
      { label: "null", overrides: { attachmentNotes: null } },
      { label: "empty", overrides: { attachmentNotes: "" } },
      { label: "whitespace-only", overrides: { attachmentNotes: " \n\t " } },
    ])("normalizes $label to null", ({ overrides }) => {
      expect(validateWithoutInputMutation(createInput(overrides))).toMatchObject({
        success: true,
        data: { attachmentNotes: null },
      });
    });

    it.each([
      { label: "trimmed nonempty 1", supplied: " \nx\t ", expected: "x" },
      {
        label: "trimmed maximum 2000",
        supplied: `  ${"x".repeat(2000)}  `,
        expected: "x".repeat(2000),
      },
    ])("accepts $label", ({ supplied, expected }) => {
      expect(validateWithoutInputMutation(createInput({ attachmentNotes: supplied })))
        .toMatchObject({ success: true, data: { attachmentNotes: expected } });
    });

    it.each([
      { label: "trimmed length 2001", value: `  ${"x".repeat(2001)}  ` },
      { label: "number", value: 42 },
      { label: "boolean", value: true },
      { label: "array", value: ["See the Ticket attachment panel"] },
      { label: "object", value: { text: "See the Ticket attachment panel" } },
    ])("rejects $label with an attachmentNotes field error", ({ value }) => {
      expectFieldError(createInput({ attachmentNotes: value }), "attachmentNotes");
    });
  });

  describe("assigneeId", () => {
    // Numeric JSON IDs must be represented exactly; inherited path/query
    // validators use Number.isSafeInteger. No new body-ID range is imposed.
    it.each([1, 21, 2147483647])("preserves valid numeric ID %s", (value) => {
      expect(validateWithoutInputMutation(createInput({ assigneeId: value })))
        .toMatchObject({ success: true, data: { assigneeId: value } });
    });

    it("rejects an omitted ID with an assigneeId field error", () => {
      expectFieldError(createInput({}, ["assigneeId"]), "assigneeId");
    });

    it.each([
      { label: "null", value: null },
      { label: "undefined", value: undefined },
      { label: "zero", value: 0 },
      { label: "negative", value: -1 },
      { label: "fractional", value: 1.5 },
      { label: "NaN", value: Number.NaN },
      { label: "positive infinity", value: Number.POSITIVE_INFINITY },
      { label: "negative infinity", value: Number.NEGATIVE_INFINITY },
      { label: "unsafe integer representation", value: 9007199254740992 },
      { label: "numeric string", value: "21" },
      { label: "padded numeric string", value: " 21 " },
      { label: "boolean", value: true },
      { label: "array", value: [21] },
      { label: "object", value: { id: 21 } },
    ])("rejects $label with an assigneeId field error", ({ value }) => {
      expectFieldError(createInput({ assigneeId: value }), "assigneeId");
    });
  });

  describe("expectedTicketUpdatedAt", () => {
    it.each([
      "2026-10-05T03:00:00.000Z",
      "2024-02-29T23:59:59.999Z",
      "2026-12-31T23:59:59.123Z",
    ])("preserves strict UTC millisecond token %s exactly", (value) => {
      expect(validateWithoutInputMutation(createInput({ expectedTicketUpdatedAt: value })))
        .toMatchObject({ success: true, data: { expectedTicketUpdatedAt: value } });
    });

    it("rejects an omitted token with an expectedTicketUpdatedAt field error", () => {
      expectFieldError(createInput({}, ["expectedTicketUpdatedAt"]), "expectedTicketUpdatedAt");
    });

    it.each([
      { label: "null", value: null },
      { label: "undefined", value: undefined },
      { label: "number", value: 0 },
      { label: "boolean", value: true },
      { label: "array", value: ["2026-10-05T03:00:00.000Z"] },
      { label: "object", value: { time: "2026-10-05T03:00:00.000Z" } },
      { label: "empty", value: "" },
      { label: "malformed", value: "not-a-date" },
      { label: "date only", value: "2026-10-05" },
      { label: "missing milliseconds", value: "2026-10-05T03:00:00Z" },
      { label: "two millisecond digits", value: "2026-10-05T03:00:00.00Z" },
      { label: "four millisecond digits", value: "2026-10-05T03:00:00.0000Z" },
      { label: "missing timezone", value: "2026-10-05T03:00:00.000" },
      { label: "UTC offset instead of Z", value: "2026-10-05T03:00:00.000+00:00" },
      { label: "non-UTC offset", value: "2026-10-05T10:00:00.000+07:00" },
      { label: "lowercase z", value: "2026-10-05T03:00:00.000z" },
      { label: "padded token", value: " 2026-10-05T03:00:00.000Z " },
      { label: "February 30", value: "2026-02-30T03:00:00.000Z" },
      { label: "February 29 in a non-leap year", value: "2025-02-29T03:00:00.000Z" },
      { label: "April 31", value: "2026-04-31T03:00:00.000Z" },
      { label: "month 13", value: "2026-13-01T03:00:00.000Z" },
      { label: "day zero", value: "2026-10-00T03:00:00.000Z" },
      { label: "day 32", value: "2026-10-32T03:00:00.000Z" },
      { label: "hour 24", value: "2026-10-05T24:00:00.000Z" },
    ])("rejects $label with an expectedTicketUpdatedAt field error", ({ value }) => {
      expectFieldError(createInput({ expectedTicketUpdatedAt: value }), "expectedTicketUpdatedAt");
    });
  });

  describe("clientMutationId", () => {
    // The inherited UUID shape is case-insensitive, trims whitespace and
    // preserves letter case; it does not impose a version-four restriction.
    it.each([
      {
        label: "version one shape",
        supplied: "123e4567-e89b-12d3-a456-426614174000",
        expected: "123e4567-e89b-12d3-a456-426614174000",
      },
      {
        label: "version four shape",
        supplied: "5b7f6b32-e929-4ac8-9c95-079956888f2f",
        expected: "5b7f6b32-e929-4ac8-9c95-079956888f2f",
      },
      {
        label: "version seven shape",
        supplied: "01890f47-7e5a-7cc8-98c9-9c9c72c40a63",
        expected: "01890f47-7e5a-7cc8-98c9-9c9c72c40a63",
      },
      {
        label: "uppercase",
        supplied: "5B7F6B32-E929-4AC8-9C95-079956888F2F",
        expected: "5B7F6B32-E929-4AC8-9C95-079956888F2F",
      },
      {
        label: "padded uppercase",
        supplied: " \n5B7F6B32-E929-4AC8-9C95-079956888F2F\t ",
        expected: "5B7F6B32-E929-4AC8-9C95-079956888F2F",
      },
    ])("accepts $label with inherited normalization", ({ supplied, expected }) => {
      expect(validateWithoutInputMutation(createInput({ clientMutationId: supplied })))
        .toMatchObject({ success: true, data: { clientMutationId: expected } });
    });

    it("rejects an omitted key with a clientMutationId field error", () => {
      expectFieldError(createInput({}, ["clientMutationId"]), "clientMutationId");
    });

    it.each([
      { label: "null", value: null },
      { label: "undefined", value: undefined },
      { label: "number", value: 42 },
      { label: "boolean", value: false },
      { label: "array", value: ["5b7f6b32-e929-4ac8-9c95-079956888f2f"] },
      { label: "object", value: { key: "5b7f6b32-e929-4ac8-9c95-079956888f2f" } },
      { label: "empty", value: "" },
      { label: "whitespace-only", value: " \n\t " },
      { label: "malformed", value: "not-a-uuid" },
      { label: "missing hyphens", value: "5b7f6b32e9294ac89c95079956888f2f" },
      { label: "non-hex character", value: "gb7f6b32-e929-4ac8-9c95-079956888f2f" },
      { label: "short final group", value: "5b7f6b32-e929-4ac8-9c95-079956888f2" },
      { label: "extra suffix", value: "5b7f6b32-e929-4ac8-9c95-079956888f2f0" },
      { label: "braces", value: "{5b7f6b32-e929-4ac8-9c95-079956888f2f}" },
      { label: "URN prefix", value: "urn:uuid:5b7f6b32-e929-4ac8-9c95-079956888f2f" },
      { label: "embedded whitespace", value: "5b7f6b32-e929-4ac8-9c95-07995688 8f2f" },
    ])("rejects $label with a clientMutationId field error", ({ value }) => {
      expectFieldError(createInput({ clientMutationId: value }), "clientMutationId");
    });
  });

  it("returns all eight normalized fields for one complete valid payload", () => {
    const input = {
      description: "  Check the network  ",
      assigneeId: 21,
      followUpRequired: true,
      expectedTicketUpdatedAt: "2024-02-29T23:59:59.123Z",
      clientMutationId: "123e4567-e89b-12d3-a456-426614174000",
      result: "  Initial checks recorded  ",
      followUpNote: "  Arrange a diagnostic session  ",
      attachmentNotes: "  See the Ticket attachment panel  ",
    };
    expect(validateWithoutInputMutation(input)).toEqual({
      success: true,
      data: {
        description: "Check the network",
        assigneeId: 21,
        followUpRequired: true,
        expectedTicketUpdatedAt: "2024-02-29T23:59:59.123Z",
        clientMutationId: "123e4567-e89b-12d3-a456-426614174000",
        result: "Initial checks recorded",
        followUpNote: "Arrange a diagnostic session",
        attachmentNotes: "See the Ticket attachment panel",
      },
    });
  });

  it.each(["result", "attachmentNotes"])("preserves literal text in %s and the input", (field) => {
    const literal = "<script>alert('diagnostic')</script> & <b>plain text</b>";
    const input = createInput({ [field]: `  ${literal}  ` });
    expect(validateWithoutInputMutation(input)).toMatchObject({
      success: true,
      data: { [field]: literal },
    });
  });
});
