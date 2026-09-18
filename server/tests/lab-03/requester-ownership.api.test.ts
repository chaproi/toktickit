import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import {
  authenticatedFixture,
  authenticatedUnsafe,
  cleanupIssue29Fixtures,
  referenceIds,
} from "./issue29-test-helpers.js";

afterEach(cleanupIssue29Fixtures);

describe("Issue 29 identity and probing resistance", () => {
  it("removes the development identity endpoint and never accepts body ownership", async () => {
    const endpoint = await request(app).get("/api/development-requesters");
    expect(endpoint.status).toBe(404);

    const owner = await authenticatedFixture({ label: "body-owner" });
    const other = await authenticatedFixture({ label: "body-other" });
    const response = await authenticatedUnsafe(request(app).post("/api/tickets"), owner).send({
      clientSubmissionId: randomUUID(),
      ...(await referenceIds()),
      requestedPriority: "LOW",
      summary: "Body spoof attempt",
      description: "The server must reject supplied ownership fields.",
      requesterId: other.user.id,
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("requires authentication even when a legacy development header is supplied", async () => {
    const fixture = await authenticatedFixture({ label: "header-only" });
    const response = await request(app)
      .get("/api/tickets")
      .set("X-Development-Requester-Id", String(fixture.user.id));
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });
});
