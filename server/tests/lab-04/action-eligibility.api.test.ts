import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ActionCreateFixtures } from "./action-create-test-fixtures.js";
import { MISSING_ID, assertSafeError } from "./action-read-test-fixtures.js";

const creates = new ActionCreateFixtures();
beforeAll(() => creates.initialize());
afterAll(() => creates.cleanup());

describe("API-04 initial assignee eligibility (partial AC-07; T-07)", () => {
  it.each(["inactive", "requester", "missing", "outside-database-ID-range"])("rejects %s with INVALID_ASSIGNEE and no domain writes", async (kind) => {
    const parent = await creates.parent();
    const assigneeId = kind === "inactive" ? creates.read.who("historical").user.id :
      kind === "requester" ? creates.read.who("requester").user.id :
      kind === "missing" ? MISSING_ID : Number.MAX_SAFE_INTEGER;
    // A positive safe numeric body ID passes syntax validation; absence/eligibility is a service check.
    // This is not an invented 32-bit body-validation cap, and must never leak a Prisma overflow error.
    const response = await creates.rejected(creates.path(parent.id), creates.input(parent, assigneeId));
    assertSafeError(response, 400, "INVALID_ASSIGNEE");
    expect(typeof response.body.error.fields.assigneeId).toBe("string");
    expect(Object.keys(response.body.error.fields)).toEqual(["assigneeId"]);
    expect(/email|isActive|role|passwordHash/u.test(JSON.stringify(response.body))).toBe(false);
  });
  // Concurrent demotion/deactivation, reassign eligibility and admin account guards remain later work.
});

import { ActionPatchFixtures } from "./action-patch-test-fixtures.js";

describe("API-05/06 initial eligibility (partial AC-07/09/10; T-07/09/10)", () => {
  const patches = new ActionPatchFixtures();
  beforeAll(() => patches.initialize());
  afterAll(() => patches.cleanup());

  it.each(["inactive", "requester", "missing", "outside-database-range"])("reassignment rejects %s without any writes", async (kind) => {
    const source = await patches.setup();
    const assigneeId = kind === "inactive" ? patches.read.who("historical").user.id : kind === "requester" ? patches.read.who("requester").user.id :
      kind === "missing" ? MISSING_ID : Number.MAX_SAFE_INTEGER;
    const response = await patches.rejected(patches.path(source, "edit"), patches.editInput(source, { assigneeId }));
    assertSafeError(response, 400, "INVALID_ASSIGNEE");
    expect(typeof response.body.error.fields.assigneeId).toBe("string");
  });

  it.each(["start", "complete"].flatMap((operation) => ["inactive", "requester"].map((ineligible) => ({ operation, ineligible }))) as Array<{ operation: "start" | "complete"; ineligible: string }>)(
    "$operation rejects an initially $ineligible assigned worker", async ({ operation, ineligible }) => {
      const worker = await patches.read.actor(`legacy-worker-${operation}-${ineligible}`, "IT_STAFF");
      const source = await patches.setup(operation === "complete" ? "IN_PROGRESS" : "PLANNED", { assigneeId: worker.user.id });
      // Explicit legacy/bypassed-guard state construction. No Admin guard implementation is claimed.
      await patches.prisma.user.update({ where: { id: worker.user.id }, data: ineligible === "inactive" ? { isActive: false } : { role: "REQUESTER" } });
      const response = await patches.rejected(patches.path(source, operation), patches.input(source, operation));
      assertSafeError(response, 400, "INVALID_ASSIGNEE"); // API contract: initial eligibility failure before a race.
      expect(typeof response.body.error.fields.assigneeId).toBe("string");
    },
  );
});
