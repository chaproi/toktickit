import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import {
  authenticatedFixture,
  authenticatedUnsafe,
  cleanupIssue29Fixtures,
  createTicketFixture,
} from "./issue29-test-helpers.js";
import { staffPatch } from "./issue33-test-helpers.js";

afterEach(cleanupIssue29Fixtures);

describe("Issue 29 Problem Appears Resolved", () => {
  it("records one current-cycle indication without changing formal status", async () => {
    const owner = await authenticatedFixture({ label: "resolution-owner" });
    const ticket = await createTicketFixture(owner.user.id, "IN_PROGRESS");

    const first = await authenticatedUnsafe(
      request(app).post(`/api/tickets/${ticket.id}/resolution-indication`),
      owner,
    ).send({ confirm: true });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ ticketId: ticket.id, currentStatus: "IN_PROGRESS" });
    expect(first.body.requesterResolutionIndicatedAt).toEqual(expect.any(String));

    const replay = await authenticatedUnsafe(
      request(app).post(`/api/tickets/${ticket.id}/resolution-indication`),
      owner,
    ).send({ confirm: true });
    expect(replay.status).toBe(200);
    expect(replay.body.requesterResolutionIndicatedAt).toBe(
      first.body.requesterResolutionIndicatedAt,
    );

    const persisted = await getPrisma().ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(persisted.currentStatus).toBe("IN_PROGRESS");
    expect(persisted.requesterResolutionIndicatedById).toBe(owner.user.id);
  });

  it("rejects ineligible state and hides a foreign Ticket", async () => {
    const owner = await authenticatedFixture({ label: "resolution-state-owner" });
    const other = await authenticatedFixture({ label: "resolution-state-other" });
    const ticket = await createTicketFixture(owner.user.id, "NEW");

    const invalid = await authenticatedUnsafe(
      request(app).post(`/api/tickets/${ticket.id}/resolution-indication`),
      owner,
    ).send({ confirm: true });
    expect(invalid.status).toBe(409);
    expect(invalid.body.error.code).toBe("RESOLUTION_INDICATION_NOT_ALLOWED");

    const foreign = await authenticatedUnsafe(
      request(app).post(`/api/tickets/${ticket.id}/resolution-indication`),
      other,
    ).send({ confirm: true });
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe("TICKET_NOT_FOUND");

    const missingConfirmation = await authenticatedUnsafe(
      request(app).post(`/api/tickets/${ticket.id}/resolution-indication`),
      owner,
    ).send({ confirm: false });
    expect(missingConfirmation.status).toBe(400);
    expect(missingConfirmation.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("clears the indication through an authoritative REOPENED transition and permits a new cycle", async () => {
    const owner = await authenticatedFixture({ label: "resolution-reopen-owner" });
    const staff = await authenticatedFixture({ role: "IT_STAFF", label: "resolution-reopen-staff" });
    const ticket = await createTicketFixture(owner.user.id, "RESOLVED");
    const indicated = await getPrisma().ticket.update({
      where: { id: ticket.id },
      data: {
        ownerId: staff.user.id,
        requesterResolutionIndicatedAt: new Date(),
        requesterResolutionIndicatedById: owner.user.id,
      },
    });
    const reopened = await staffPatch(`/api/staff/tickets/${ticket.id}/status`, staff, {
      targetStatus: "REOPENED",
      expectedUpdatedAt: indicated.updatedAt.toISOString(),
    });
    expect(reopened.status).toBe(200);
    expect(reopened.body.ticket).toMatchObject({
      currentStatus: "REOPENED",
      requesterResolutionIndicatedAt: null,
    });
    const nextCycle = await authenticatedUnsafe(
      request(app).post(`/api/tickets/${ticket.id}/resolution-indication`),
      owner,
    ).send({ confirm: true });
    expect(nextCycle.status).toBe(200);
    expect(nextCycle.body.currentStatus).toBe("REOPENED");
  });
});
