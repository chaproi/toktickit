import { randomBytes, randomUUID } from "node:crypto";
import type { UserRole } from "@prisma/client";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { setAttachmentStorageForTests } from "../../src/attachments/attachment-storage.js";
import { getPrisma } from "../../src/prisma.js";
import {
  APPROVED_ORIGIN,
  cookieHeader,
  cookieValue,
} from "./auth-test-helpers.js";
import {
  authenticatedFixture,
  authenticatedUnsafe,
  cleanupIssue29Fixtures,
  createTicketFixture,
  referenceIds,
  type AuthenticatedFixture,
} from "./issue29-test-helpers.js";

type Method = "get" | "post" | "patch" | "delete";
type ProtectedOperation = {
  id: string;
  method: Method;
  path: string;
  allowed: readonly UserRole[];
};

const APPLICATION_OPERATIONS: readonly ProtectedOperation[] = [
  { id: "OP-08", method: "post", path: "/api/tickets", allowed: ["REQUESTER"] },
  { id: "OP-09", method: "get", path: "/api/tickets", allowed: ["REQUESTER"] },
  { id: "OP-10", method: "get", path: "/api/tickets/2147483000", allowed: ["REQUESTER"] },
  { id: "OP-11", method: "post", path: "/api/tickets/2147483000/attachments", allowed: ["REQUESTER"] },
  { id: "OP-12", method: "get", path: "/api/tickets/2147483000/attachments", allowed: ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"] },
  { id: "OP-13", method: "get", path: "/api/tickets/2147483000/attachments/2147483000", allowed: ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"] },
  { id: "OP-14", method: "get", path: "/api/tickets/2147483000/attachments/2147483000/content", allowed: ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"] },
  { id: "OP-15", method: "delete", path: "/api/tickets/2147483000/attachments/2147483000", allowed: ["REQUESTER"] },
  { id: "OP-16", method: "get", path: "/api/tickets/2147483000/comments", allowed: ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"] },
  { id: "OP-17", method: "post", path: "/api/tickets/2147483000/comments", allowed: ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"] },
  { id: "OP-18", method: "post", path: "/api/tickets/2147483000/resolution-indication", allowed: ["REQUESTER"] },
  { id: "OP-19", method: "get", path: "/api/staff/tickets", allowed: ["IT_STAFF", "ADMINISTRATOR"] },
  { id: "OP-20", method: "get", path: "/api/staff/tickets/2147483000", allowed: ["IT_STAFF", "ADMINISTRATOR"] },
  { id: "OP-21", method: "get", path: "/api/staff/assignees", allowed: ["IT_STAFF", "ADMINISTRATOR"] },
  { id: "OP-22", method: "post", path: "/api/staff/tickets/2147483000/claim", allowed: ["IT_STAFF", "ADMINISTRATOR"] },
  { id: "OP-23", method: "patch", path: "/api/staff/tickets/2147483000/owner", allowed: ["IT_STAFF", "ADMINISTRATOR"] },
  { id: "OP-24", method: "patch", path: "/api/staff/tickets/2147483000/it-priority", allowed: ["IT_STAFF", "ADMINISTRATOR"] },
  { id: "OP-25", method: "patch", path: "/api/staff/tickets/2147483000/status", allowed: ["IT_STAFF", "ADMINISTRATOR"] },
  { id: "OP-26", method: "get", path: "/api/staff/tickets/2147483000/notes", allowed: ["IT_STAFF", "ADMINISTRATOR"] },
  { id: "OP-27", method: "post", path: "/api/staff/tickets/2147483000/notes", allowed: ["IT_STAFF", "ADMINISTRATOR"] },
  { id: "OP-28", method: "get", path: "/api/admin/users", allowed: ["ADMINISTRATOR"] },
  { id: "OP-29", method: "post", path: "/api/admin/users", allowed: ["ADMINISTRATOR"] },
  { id: "OP-30", method: "patch", path: "/api/admin/users/2147483000", allowed: ["ADMINISTRATOR"] },
  { id: "OP-31", method: "post", path: "/api/admin/users/2147483000/initial-password", allowed: ["ADMINISTRATOR"] },
] as const;

const ROLES = ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"] as const;

afterEach(async () => {
  setAttachmentStorageForTests(null);
  await cleanupIssue29Fixtures();
});

function call(operation: ProtectedOperation, cookie?: string) {
  const pending = request(app)[operation.method](operation.path);
  if (cookie) pending.set("Cookie", cookie);
  return pending;
}

function expectOnlySafeError(response: request.Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.body.error.code).toBe(code);
  expect(JSON.stringify(response.body)).not.toMatch(
    /ticketNumber|summary|description|requesterId|ownerId|passwordHash|tokenHash|csrfTokenHash|Internal Note|private note/iu,
  );
}

async function attachmentFixture(requesterId: number) {
  const ticket = await createTicketFixture(requesterId, "OPEN");
  const attachment = await getPrisma().attachment.create({
    data: {
      ticketId: ticket.id,
      originalFilename: "issue37.pdf",
      storageKey: `issue37-${randomUUID()}`,
      mimeType: "application/pdf",
      sizeBytes: 12,
      uploadedByUserId: requesterId,
    },
  });
  return { ticket, attachment };
}

async function successfulOperation(
  id: string,
  actor: AuthenticatedFixture,
  owner: AuthenticatedFixture,
): Promise<request.Response> {
  const prisma = getPrisma();
  const unsafe = (pending: request.Test) => authenticatedUnsafe(pending, actor);
  const safe = (pending: request.Test) => pending.set("Cookie", actor.cookie);
  const actorOwns = actor.user.role === "REQUESTER" ? actor : owner;

  if (id === "OP-08") {
    const refs = await referenceIds();
    return unsafe(request(app).post("/api/tickets")).send({
      clientSubmissionId: randomUUID(),
      ...refs,
      requestedPriority: "MEDIUM",
      summary: "Issue 37 authorization Ticket",
      description: "Complete allowed-cell authorization fixture.",
    });
  }
  if (id === "OP-09") return safe(request(app).get("/api/tickets"));
  if (id === "OP-10") {
    const ticket = await createTicketFixture(actor.user.id);
    return safe(request(app).get(`/api/tickets/${ticket.id}`));
  }
  if (id === "OP-11") {
    const ticket = await createTicketFixture(actor.user.id);
    return unsafe(request(app).post(`/api/tickets/${ticket.id}/attachments`))
      .attach("file", Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nFQAAAAASUVORK5CYII=",
        "base64",
      ), { filename: "allowed.png", contentType: "image/png" });
  }
  if (["OP-12", "OP-13", "OP-14", "OP-15"].includes(id)) {
    const { ticket, attachment } = await attachmentFixture(actorOwns.user.id);
    if (id === "OP-12") return safe(request(app).get(`/api/tickets/${ticket.id}/attachments`));
    if (id === "OP-13") return safe(request(app).get(`/api/tickets/${ticket.id}/attachments/${attachment.id}`));
    if (id === "OP-14") return safe(request(app).get(`/api/tickets/${ticket.id}/attachments/${attachment.id}/content`));
    return unsafe(request(app).delete(`/api/tickets/${ticket.id}/attachments/${attachment.id}`))
      .send({ removalReason: "Issue 37 authorization removal." });
  }
  if (["OP-16", "OP-17"].includes(id)) {
    const ticket = await createTicketFixture(actorOwns.user.id, "OPEN");
    return id === "OP-16"
      ? safe(request(app).get(`/api/tickets/${ticket.id}/comments`))
      : unsafe(request(app).post(`/api/tickets/${ticket.id}/comments`)).send({ content: "Issue 37 allowed comment." });
  }
  if (id === "OP-18") {
    const ticket = await createTicketFixture(actor.user.id, "OPEN");
    return unsafe(request(app).post(`/api/tickets/${ticket.id}/resolution-indication`)).send({ confirm: true });
  }
  if (id === "OP-19") return safe(request(app).get("/api/staff/tickets"));
  if (id === "OP-20") {
    const ticket = await createTicketFixture(owner.user.id);
    return safe(request(app).get(`/api/staff/tickets/${ticket.id}`));
  }
  if (id === "OP-21") return safe(request(app).get("/api/staff/assignees"));
  if (["OP-22", "OP-23", "OP-24", "OP-25"].includes(id)) {
    const ticket = await createTicketFixture(owner.user.id, id === "OP-25" ? "NEW" : "OPEN");
    if (id === "OP-25") {
      await prisma.ticket.update({ where: { id: ticket.id }, data: { ownerId: actor.user.id } });
    }
    const latest = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    const path = id === "OP-22" ? "claim" : id === "OP-23" ? "owner" : id === "OP-24" ? "it-priority" : "status";
    const pending = id === "OP-22"
      ? request(app).post(`/api/staff/tickets/${ticket.id}/${path}`)
      : request(app).patch(`/api/staff/tickets/${ticket.id}/${path}`);
    const body = id === "OP-22"
      ? { expectedUpdatedAt: latest.updatedAt.toISOString() }
      : id === "OP-23"
        ? { ownerId: actor.user.id, expectedUpdatedAt: latest.updatedAt.toISOString() }
        : id === "OP-24"
          ? { itPriority: "URGENT", expectedUpdatedAt: latest.updatedAt.toISOString() }
          : { targetStatus: "OPEN", confirm: true, reason: null, expectedUpdatedAt: latest.updatedAt.toISOString() };
    return unsafe(pending).send(body);
  }
  if (["OP-26", "OP-27"].includes(id)) {
    const ticket = await createTicketFixture(owner.user.id, "OPEN");
    return id === "OP-26"
      ? safe(request(app).get(`/api/staff/tickets/${ticket.id}/notes`))
      : unsafe(request(app).post(`/api/staff/tickets/${ticket.id}/notes`)).send({ content: "Issue 37 private note." });
  }
  if (id === "OP-28") return safe(request(app).get("/api/admin/users"));
  if (id === "OP-29") {
    const email = `issue29-issue37-created-${randomUUID()}@example.test`;
    const password = `Aa1!${randomBytes(16).toString("base64url")}`;
    return unsafe(request(app).post("/api/admin/users")).send({
      name: "Issue 37 Created User",
      email,
      role: "REQUESTER",
      isActive: true,
      initialPassword: password,
      confirmPassword: password,
    });
  }
  const target = await authenticatedFixture({ label: `issue37-admin-target-${id.toLowerCase()}` });
  const stored = await prisma.user.findUniqueOrThrow({ where: { id: target.user.id } });
  if (id === "OP-30") {
    return unsafe(request(app).patch(`/api/admin/users/${target.user.id}`)).send({
      name: "Issue 37 Edited User",
      email: target.user.email,
      role: "REQUESTER",
      isActive: true,
      expectedUpdatedAt: stored.updatedAt.toISOString(),
    });
  }
  const password = `Aa1!${randomBytes(16).toString("base64url")}`;
  return unsafe(request(app).post(`/api/admin/users/${target.user.id}/initial-password`)).send({
    initialPassword: password,
    confirmPassword: password,
  });
}

describe("SEC-01 authentication gates on every protected application operation", () => {
  it("returns only safe 401 responses without, after-expiry, and after-logout sessions", async () => {
    const expired = await authenticatedFixture({ label: "issue37-expired" });
    await getPrisma().authSession.updateMany({
      where: { userId: expired.user.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const loggedOut = await authenticatedFixture({ label: "issue37-logged-out" });
    await authenticatedUnsafe(request(app).post("/api/auth/logout"), loggedOut).expect(204);

    for (const operation of APPLICATION_OPERATIONS) {
      for (const cookie of [undefined, expired.cookie, loggedOut.cookie]) {
        const response = await call(operation, cookie);
        expectOnlySafeError(response, 401, "AUTHENTICATION_REQUIRED");
      }
    }
  }, 30_000);

  it("returns PASSWORD_CHANGE_REQUIRED before validation, CSRF, role, or resource lookup", async () => {
    const forced = await authenticatedFixture({
      mustChangePassword: true,
      label: "issue37-forced-change",
    });
    for (const operation of APPLICATION_OPERATIONS) {
      const response = await call(operation, forced.cookie);
      expectOnlySafeError(response, 403, "PASSWORD_CHANGE_REQUIRED");
    }
  }, 30_000);

  it("keeps current-user and password change available at the forced-change gate", async () => {
    const password = `Aa1!${randomBytes(16).toString("base64url")}`;
    const email = `issue29-issue37-forced-auth-${randomUUID()}@example.test`;
    await getPrisma().user.create({
      data: {
        name: "Issue 37 Forced Auth",
        email,
        role: "REQUESTER",
        passwordHash: await (await import("../../src/auth/password.js")).hashPassword(password),
        mustChangePassword: true,
      },
    });
    const login = await request(app).post("/api/auth/login").set("Origin", APPROVED_ORIGIN).send({ email, password });
    const cookie = cookieHeader(login.headers["set-cookie"]);
    const csrf = cookieValue(login.headers["set-cookie"], "toktickit_csrf");
    expect((await request(app).get("/api/auth/me").set("Cookie", cookie)).status).toBe(200);
    const replacement = `Bb2!${randomBytes(16).toString("base64url")}`;
    const changed = await request(app).post("/api/auth/change-password")
      .set("Cookie", cookie)
      .set("Origin", APPROVED_ORIGIN)
      .set("X-CSRF-Token", csrf)
      .send({ currentPassword: password, newPassword: replacement, confirmPassword: replacement });
    expect(changed.status).toBe(200);
    expect(changed.body.user.mustChangePassword).toBe(false);
  });
});

describe("SEC-02 complete backend role-operation matrix", () => {
  it("allows every documented role cell and denies every forbidden cell before lookup", async () => {
    const actors = {
      REQUESTER: await authenticatedFixture({ role: "REQUESTER", label: "issue37-matrix-requester" }),
      IT_STAFF: await authenticatedFixture({ role: "IT_STAFF", label: "issue37-matrix-staff" }),
      ADMINISTRATOR: await authenticatedFixture({ role: "ADMINISTRATOR", label: "issue37-matrix-admin" }),
    } satisfies Record<UserRole, AuthenticatedFixture>;
    const owner = await authenticatedFixture({ label: "issue37-matrix-owner" });
    setAttachmentStorageForTests({
      async store() {},
      async remove() {},
      async read() { return Buffer.from("Issue 37 attachment content"); },
    });

    for (const operation of APPLICATION_OPERATIONS) {
      for (const role of ROLES) {
        const actor = actors[role];
        if (operation.allowed.includes(role)) {
          const response = await successfulOperation(operation.id, actor, owner);
          expect(response.status, `${operation.id} should allow ${role}: ${JSON.stringify(response.body)}`)
            .toBeGreaterThanOrEqual(200);
          expect(response.status).toBeLessThan(300);
        } else {
          const response = await call(operation, actor.cookie);
          expectOnlySafeError(response, 403, "ROLE_FORBIDDEN");
        }
      }
    }
  }, 60_000);
});

describe("SEC-05 Internal Note denial before resource lookup", () => {
  it("gives a Requester identical safe denials for valid and invalid Ticket probes", async () => {
    const requester = await authenticatedFixture({ label: "issue37-note-requester" });
    const staff = await authenticatedFixture({ role: "IT_STAFF", label: "issue37-note-staff" });
    const ticket = await createTicketFixture(requester.user.id, "OPEN");
    const privateContent = `private-note-${randomUUID()}`;
    await getPrisma().internalNote.create({
      data: { ticketId: ticket.id, authorId: staff.user.id, content: privateContent },
    });

    const responses = await Promise.all([
      request(app).get(`/api/staff/tickets/${ticket.id}/notes`).set("Cookie", requester.cookie),
      request(app).get("/api/staff/tickets/2147483000/notes").set("Cookie", requester.cookie),
      authenticatedUnsafe(request(app).post(`/api/staff/tickets/${ticket.id}/notes`), requester)
        .send({ content: "probe" }),
      authenticatedUnsafe(request(app).post("/api/staff/tickets/2147483000/notes"), requester)
        .send({ content: "probe" }),
    ]);

    for (const response of responses) {
      expectOnlySafeError(response, 403, "ROLE_FORBIDDEN");
      expect(JSON.stringify(response.body)).not.toContain(privateContent);
    }
    expect(responses.map(({ body }) => body)).toEqual(Array(4).fill(responses[0]!.body));
  });
});
