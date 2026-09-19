import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import {
  authenticatedFixture,
  authenticatedUnsafe,
  cleanupIssue29Fixtures,
  createTicketFixture,
  referenceIds,
} from "./issue29-test-helpers.js";

afterEach(cleanupIssue29Fixtures);

describe("Issue 29 authenticated Requester Tickets", () => {
  it("uses the live session for create/list/detail and ignores a spoof header", async () => {
    const owner = await authenticatedFixture({ label: "owner" });
    const other = await authenticatedFixture({ label: "other" });
    const references = await referenceIds();
    const payload = {
      clientSubmissionId: randomUUID(),
      ...references,
      requestedPriority: "HIGH",
      summary: "Authenticated creation",
      description: "Created from the authenticated Requester session.",
    };

    const created = await authenticatedUnsafe(
      request(app)
        .post("/api/tickets")
        .set("X-Development-Requester-Id", String(other.user.id)),
      owner,
    ).send(payload);

    expect(created.status).toBe(201);
    expect(created.body.ticket).toMatchObject({
      requester: { id: owner.user.id },
      requestedPriority: "HIGH",
      itPriority: "HIGH",
      currentStatus: "NEW",
      owner: null,
      requesterResolutionIndicatedAt: null,
    });

    const persisted = await getPrisma().ticket.findUniqueOrThrow({
      where: { id: created.body.ticket.id },
    });
    expect(persisted.requesterId).toBe(owner.user.id);
    expect(persisted).toMatchObject({
      currentStatus: "NEW",
      ownerId: null,
      requestedPriority: "HIGH",
      itPriority: "HIGH",
    });

    const identicalReplay = await authenticatedUnsafe(
      request(app).post("/api/tickets"),
      owner,
    ).send(payload);
    expect(identicalReplay.status).toBe(200);
    expect(identicalReplay.body.ticket.id).toBe(persisted.id);

    const changedReplay = await authenticatedUnsafe(
      request(app).post("/api/tickets"),
      owner,
    ).send({ ...payload, summary: "Changed replay must conflict" });
    expect(changedReplay.status).toBe(409);
    expect(changedReplay.body.error.code).toBe("IDEMPOTENCY_CONFLICT");

    const list = await request(app)
      .get("/api/tickets")
      .set("Cookie", owner.cookie)
      .set("X-Development-Requester-Id", String(other.user.id));
    expect(list.status).toBe(200);
    expect(list.body.items.map((item: { id: number }) => item.id)).toContain(persisted.id);

    const detail = await request(app)
      .get(`/api/tickets/${persisted.id}`)
      .set("Cookie", owner.cookie);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      id: persisted.id,
      requester: { id: owner.user.id, name: owner.user.name },
      category: { id: references.categoryId },
      relatedSystem: { id: references.relatedSystemId },
      requestedPriority: "HIGH",
      itPriority: "HIGH",
      currentStatus: "NEW",
      owner: null,
      requesterResolutionIndicatedAt: null,
    });
    expect(detail.body).not.toHaveProperty("internalNotes");
  });

  it("returns the same safe 404 for a missing and another Requester's Ticket", async () => {
    const owner = await authenticatedFixture({ label: "safe-owner" });
    const other = await authenticatedFixture({ label: "safe-other" });
    const foreign = await createTicketFixture(other.user.id);
    const missing = 2_147_483_647;

    for (const id of [foreign.id, missing]) {
      const response = await request(app)
        .get(`/api/tickets/${id}`)
        .set("Cookie", owner.cookie);
      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: { code: "TICKET_NOT_FOUND", message: "Ticket not found." },
      });
    }
  });

  it("blocks normal Ticket APIs until mandatory password change completes", async () => {
    const fixture = await authenticatedFixture({ mustChangePassword: true, label: "forced" });
    const response = await request(app).get("/api/tickets").set("Cookie", fixture.cookie);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");
  });
});
