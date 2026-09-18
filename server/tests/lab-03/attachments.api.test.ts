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

describe("Issue 29 role-aware Attachments", () => {
  it("allows the owning Requester and operational roles to read metadata", async () => {
    const owner = await authenticatedFixture({ label: "attachment-owner" });
    const staff = await authenticatedFixture({ role: "IT_STAFF", label: "attachment-staff" });
    const ticket = await createTicketFixture(owner.user.id);
    const attachment = await getPrisma().attachment.create({
      data: {
        ticketId: ticket.id,
        originalFilename: "evidence.pdf",
        storageKey: `issue29-${ticket.id}`,
        mimeType: "application/pdf",
        sizeBytes: 12,
        uploadedByUserId: owner.user.id,
      },
    });

    for (const fixture of [owner, staff]) {
      const response = await request(app)
        .get(`/api/tickets/${ticket.id}/attachments`)
        .set("Cookie", fixture.cookie);
      expect(response.status).toBe(200);
      expect(response.body.items[0]).toMatchObject({ id: attachment.id, ticketId: ticket.id });
      expect(response.body.items[0]).not.toHaveProperty("storageKey");
    }
  });

  it("keeps mutation Requester-only and hides foreign ownership", async () => {
    const owner = await authenticatedFixture({ label: "mutation-owner" });
    const other = await authenticatedFixture({ label: "mutation-other" });
    const administrator = await authenticatedFixture({
      role: "ADMINISTRATOR",
      label: "mutation-admin",
    });
    const ticket = await createTicketFixture(owner.user.id);
    const attachment = await getPrisma().attachment.create({
      data: {
        ticketId: ticket.id,
        originalFilename: "owned.pdf",
        storageKey: `issue29-owned-${ticket.id}`,
        mimeType: "application/pdf",
        sizeBytes: 10,
        uploadedByUserId: owner.user.id,
      },
    });

    const foreign = await request(app)
      .get(`/api/tickets/${ticket.id}/attachments/${attachment.id}`)
      .set("Cookie", other.cookie);
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe("ATTACHMENT_NOT_FOUND");

    const denied = await authenticatedUnsafe(
      request(app).delete(`/api/tickets/${ticket.id}/attachments/${attachment.id}`),
      administrator,
    ).send({ removalReason: "Not permitted for this role." });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("ROLE_FORBIDDEN");
  });
});
