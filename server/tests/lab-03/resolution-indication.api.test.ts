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
  });
});
