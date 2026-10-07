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
