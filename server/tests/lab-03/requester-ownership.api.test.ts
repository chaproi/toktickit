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
import { getPrisma } from "../../src/prisma.js";

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

  it("uses the authenticated Requester despite a spoofed legacy header and hides Ticket existence", async () => {
    const owner = await authenticatedFixture({ label: "ticket-probe-owner" });
    const other = await authenticatedFixture({ label: "ticket-probe-other" });
    const ownerTicketResponse = await authenticatedUnsafe(request(app).post("/api/tickets"), owner).send({
      clientSubmissionId: randomUUID(),
      ...(await referenceIds()),
      requestedPriority: "LOW",
      summary: "Authenticated owner Ticket",
      description: "Visible only to the authenticated owner.",
    });
    const otherTicketResponse = await authenticatedUnsafe(request(app).post("/api/tickets"), other).send({
      clientSubmissionId: randomUUID(),
      ...(await referenceIds()),
      requestedPriority: "HIGH",
      summary: "Foreign protected Ticket",
      description: "Must never be disclosed to another Requester.",
    });
    const ownerTicket = ownerTicketResponse.body.ticket as { id: number; ticketNumber: string };
    const otherTicket = otherTicketResponse.body.ticket as { id: number; ticketNumber: string };

    const list = await request(app)
      .get("/api/tickets")
      .set("Cookie", owner.cookie)
      .set("X-Development-Requester-Id", String(other.user.id));
    expect(list.status).toBe(200);
    expect(list.body.items.map((item: { id: number }) => item.id)).toContain(ownerTicket.id);
    expect(list.body.items.map((item: { id: number }) => item.id)).not.toContain(otherTicket.id);

    const denials = [];
    for (const ticketId of [otherTicket.id, 2_147_483_647]) {
      const response = await request(app)
        .get(`/api/tickets/${ticketId}`)
        .set("Cookie", owner.cookie)
        .set("X-Development-Requester-Id", String(other.user.id));
      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: { code: "TICKET_NOT_FOUND", message: "Ticket not found." },
      });
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain(otherTicket.ticketNumber);
      expect(serialized).not.toContain("Foreign protected Ticket");
      denials.push(response.body);
    }
    expect(denials[0]).toEqual(denials[1]);
  });

  it("makes foreign and missing Attachment probes indistinguishable", async () => {
    const owner = await authenticatedFixture({ label: "attachment-probe-owner" });
    const other = await authenticatedFixture({ label: "attachment-probe-other" });
    const ticket = await (async () => {
      const response = await authenticatedUnsafe(request(app).post("/api/tickets"), owner).send({
        clientSubmissionId: randomUUID(),
        ...(await referenceIds()),
        requestedPriority: "LOW",
        summary: "Attachment probe owner",
        description: "Synthetic ownership-probing fixture.",
      });
      return response.body.ticket as { id: number };
    })();
    const attachment = await getPrisma().attachment.create({
      data: {
        ticketId: ticket.id,
        originalFilename: "probe.txt",
        storageKey: `issue29-probe-${ticket.id}`,
        mimeType: "text/plain",
        sizeBytes: 5,
        uploadedByUserId: owner.user.id,
      },
    });

    for (const attachmentId of [attachment.id, 2_147_483_647]) {
      const response = await request(app)
        .get(`/api/tickets/${ticket.id}/attachments/${attachmentId}`)
        .set("Cookie", other.cookie);
      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: { code: "ATTACHMENT_NOT_FOUND", message: "Attachment not found." },
      });
    }
  });
});
