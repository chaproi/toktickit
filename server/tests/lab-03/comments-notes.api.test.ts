import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import {
  authenticatedFixture,
  authenticatedUnsafe,
  cleanupIssue29Fixtures,
  createTicketFixture,
} from "./issue29-test-helpers.js";

afterEach(cleanupIssue29Fixtures);

describe("Issue 29 Public Comments", () => {
  it("appends safe content with backend author/time and lists oldest first", async () => {
    const owner = await authenticatedFixture({ label: "comment-owner" });
    const ticket = await createTicketFixture(owner.user.id);
    const content = "<img src=x onerror=alert(1)> visible as text";
    const created = await authenticatedUnsafe(
      request(app).post(`/api/tickets/${ticket.id}/comments`),
      owner,
    ).send({ content: `  ${content}  ` });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      ticketId: ticket.id,
      author: { id: owner.user.id, role: "REQUESTER" },
      content,
    });
    expect(new Date(created.body.createdAt).toString()).not.toBe("Invalid Date");

    const list = await request(app)
      .get(`/api/tickets/${ticket.id}/comments?page=1&pageSize=20`)
      .set("Cookie", owner.cookie);
    expect(list.status).toBe(200);
    expect(list.body.items.map((item: { content: string }) => item.content)).toEqual([content]);
    expect(list.body.pagination).toMatchObject({ page: 1, pageSize: 20, totalItems: 1 });
    expect(list.body.items[0]).not.toHaveProperty("internalNotes");
  });

  it("rejects invalid content and hides a foreign Ticket", async () => {
    const owner = await authenticatedFixture({ label: "comment-hidden-owner" });
    const other = await authenticatedFixture({ label: "comment-hidden-other" });
    const ticket = await createTicketFixture(owner.user.id);

    const empty = await authenticatedUnsafe(
      request(app).post(`/api/tickets/${ticket.id}/comments`),
      owner,
    ).send({ content: "   " });
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe("VALIDATION_ERROR");

    const tooLong = await authenticatedUnsafe(
      request(app).post(`/api/tickets/${ticket.id}/comments`),
      owner,
    ).send({ content: "x".repeat(2_001) });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.code).toBe("VALIDATION_ERROR");

    const unknownField = await authenticatedUnsafe(
      request(app).post(`/api/tickets/${ticket.id}/comments`),
      owner,
    ).send({ content: "Visible update", internal: true });
    expect(unknownField.status).toBe(400);
    expect(unknownField.body.error.code).toBe("VALIDATION_ERROR");

    const foreign = await request(app)
      .get(`/api/tickets/${ticket.id}/comments`)
      .set("Cookie", other.cookie);
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe("TICKET_NOT_FOUND");
  });

  it("allows operational roles to append/list and rejects invalid pagination", async () => {
    const owner = await authenticatedFixture({ label: "comment-role-owner" });
    const staff = await authenticatedFixture({ role: "IT_STAFF", label: "comment-staff" });
    const administrator = await authenticatedFixture({
      role: "ADMINISTRATOR",
      label: "comment-admin",
    });
    const ticket = await createTicketFixture(owner.user.id);

    for (const [index, fixture] of [staff, administrator].entries()) {
      const created = await authenticatedUnsafe(
        request(app).post(`/api/tickets/${ticket.id}/comments`),
        fixture,
      ).send({ content: `Public update from ${fixture.user.role}` });
      expect(created.status).toBe(201);
      expect(created.body.author).toMatchObject({
        id: fixture.user.id,
        role: fixture.user.role,
      });

      const listed = await request(app)
        .get(`/api/tickets/${ticket.id}/comments?page=1&pageSize=20`)
        .set("Cookie", fixture.cookie);
      expect(listed.status).toBe(200);
      expect(listed.body.pagination).toMatchObject({
        page: 1,
        pageSize: 20,
        totalItems: index + 1,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      });
    }

    const invalid = await request(app)
      .get(`/api/tickets/${ticket.id}/comments?page=0&pageSize=7&unexpected=true`)
      .set("Cookie", staff.cookie);
    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({
      error: {
        code: "INVALID_QUERY",
        fields: {
          page: expect.any(String),
          pageSize: expect.any(String),
          unexpected: expect.any(String),
        },
      },
    });
  });
});
