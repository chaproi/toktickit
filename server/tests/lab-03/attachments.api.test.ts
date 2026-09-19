import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { setAttachmentStorageForTests } from "../../src/attachments/attachment-storage.js";
import { getPrisma } from "../../src/prisma.js";
import {
  authenticatedFixture,
  authenticatedUnsafe,
  cleanupIssue29Fixtures,
  createTicketFixture,
} from "./issue29-test-helpers.js";

afterEach(async () => {
  setAttachmentStorageForTests(null);
  await cleanupIssue29Fixtures();
});

describe("Issue 29 role-aware Attachments", () => {
  it("persists an owning Requester's upload and soft removal without exposing storage data", async () => {
    const owner = await authenticatedFixture({ label: "attachment-mutation-owner" });
    const staff = await authenticatedFixture({ role: "IT_STAFF", label: "attachment-mutation-staff" });
    const administrator = await authenticatedFixture({
      role: "ADMINISTRATOR",
      label: "attachment-mutation-admin",
    });
    const ticket = await createTicketFixture(owner.user.id);
    const removedStorageKeys: string[] = [];

    setAttachmentStorageForTests({
      async store() {},
      async remove(storageKey) { removedStorageKeys.push(storageKey); },
      async read() { return Buffer.from("synthetic attachment content"); },
    });

    const upload = await authenticatedUnsafe(
      request(app).post(`/api/tickets/${ticket.id}/attachments`),
      owner,
    ).attach(
      "file",
      Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nFQAAAAASUVORK5CYII=", "base64"),
      { filename: "requester-evidence.png", contentType: "image/png" },
    );

    expect(upload.status).toBe(201);
    expect(upload.body).toMatchObject({
      ticketId: ticket.id,
      originalFilename: "requester-evidence.png",
      mimeType: "image/png",
      uploadedByRequesterId: owner.user.id,
      isRemoved: false,
    });
    expect(upload.body).not.toHaveProperty("storageKey");

    const attachmentId = upload.body.id as number;
    const persisted = await getPrisma().attachment.findUniqueOrThrow({
      where: { id: attachmentId },
    });
    expect(persisted).toMatchObject({
      ticketId: ticket.id,
      uploadedByUserId: owner.user.id,
      isRemoved: false,
    });

    for (const fixture of [staff, administrator]) {
      const deniedUpload = await authenticatedUnsafe(
        request(app).post(`/api/tickets/${ticket.id}/attachments`),
        fixture,
      ).attach("file", Buffer.from("synthetic"), {
        filename: "denied.txt",
        contentType: "text/plain",
      });
      expect(deniedUpload.status).toBe(403);
      expect(deniedUpload.body.error.code).toBe("ROLE_FORBIDDEN");

      const deniedRemoval = await authenticatedUnsafe(
        request(app).delete(`/api/tickets/${ticket.id}/attachments/${attachmentId}`),
        fixture,
      ).send({ removalReason: "Operational roles cannot remove it." });
      expect(deniedRemoval.status).toBe(403);
      expect(deniedRemoval.body.error.code).toBe("ROLE_FORBIDDEN");
    }

    const removalReason = "The evidence is no longer relevant.";
    const removal = await authenticatedUnsafe(
      request(app).delete(`/api/tickets/${ticket.id}/attachments/${attachmentId}`),
      owner,
    ).send({ removalReason });
    expect(removal.status).toBe(200);
    expect(removal.body).toMatchObject({
      id: attachmentId,
      ticketId: ticket.id,
      isRemoved: true,
      removedByRequesterId: owner.user.id,
      removalReason,
    });
    expect(removal.body).not.toHaveProperty("storageKey");

    const removed = await getPrisma().attachment.findUniqueOrThrow({
      where: { id: attachmentId },
    });
    expect(removed.isRemoved).toBe(true);
    expect(removed.removedByUserId).toBe(owner.user.id);
    expect(removed.removalReason).toBe(removalReason);
    expect(removed.removedAt).toBeInstanceOf(Date);
    expect(removedStorageKeys).toEqual([persisted.storageKey]);
  }, 15_000);

  it("allows the owning Requester and operational roles to read metadata and active content", async () => {
    const owner = await authenticatedFixture({ label: "attachment-owner" });
    const staff = await authenticatedFixture({ role: "IT_STAFF", label: "attachment-staff" });
    const administrator = await authenticatedFixture({
      role: "ADMINISTRATOR",
      label: "attachment-admin-reader",
    });
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

    setAttachmentStorageForTests({
      async store() {},
      async remove() {},
      async read() { return Buffer.from("synthetic attachment content"); },
    });

    for (const fixture of [owner, staff, administrator]) {
      const response = await request(app)
        .get(`/api/tickets/${ticket.id}/attachments`)
        .set("Cookie", fixture.cookie);
      expect(response.status).toBe(200);
      expect(response.body.items[0]).toMatchObject({ id: attachment.id, ticketId: ticket.id });
      expect(response.body.items[0]).not.toHaveProperty("storageKey");

      const content = await request(app)
        .get(`/api/tickets/${ticket.id}/attachments/${attachment.id}/content`)
        .set("Cookie", fixture.cookie);
      expect(content.status).toBe(200);
      expect(content.headers["x-content-type-options"]).toBe("nosniff");
    }

    await getPrisma().attachment.update({
      where: { id: attachment.id },
      data: { isRemoved: true, removedAt: new Date(), removedByUserId: owner.user.id },
    });
    const removed = await request(app)
      .get(`/api/tickets/${ticket.id}/attachments/${attachment.id}/content`)
      .set("Cookie", staff.cookie);
    expect(removed.status).toBe(410);
    expect(removed.body.error.code).toBe("ATTACHMENT_REMOVED");
  }, 15_000);

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

    const staff = await authenticatedFixture({ role: "IT_STAFF", label: "mutation-staff" });
    for (const fixture of [staff, administrator]) {
      const deniedUpload = await authenticatedUnsafe(
        request(app).post(`/api/tickets/${ticket.id}/attachments`),
        fixture,
      ).attach("file", Buffer.from("synthetic"), {
        filename: "synthetic.txt",
        contentType: "text/plain",
      });
      expect(deniedUpload.status).toBe(403);
      expect(deniedUpload.body.error.code).toBe("ROLE_FORBIDDEN");

      const deniedRemoval = await authenticatedUnsafe(
        request(app).delete(`/api/tickets/${ticket.id}/attachments/${attachment.id}`),
        fixture,
      ).send({ removalReason: "Operational roles cannot remove Requester attachments." });
      expect(deniedRemoval.status).toBe(403);
      expect(deniedRemoval.body.error.code).toBe("ROLE_FORBIDDEN");
    }
  });
});
