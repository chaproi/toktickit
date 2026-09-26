import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import {
  cleanupIssue29Fixtures,
  issue33Actors,
  issue33Ticket,
  staffGet,
} from "./issue33-test-helpers.js";

afterEach(cleanupIssue29Fixtures);

describe("API-10 Staff operational Ticket Detail", () => {
  it("denies Requesters before lookup and returns the exact safe DTO to Staff/Admin", async () => {
    const actors = await issue33Actors();
    const ticket = await issue33Ticket(actors.requester.user.id, "IN_PROGRESS", actors.staff.user.id);
    await getPrisma().ticketStatusHistory.create({
      data: { ticketId: ticket.id, actorId: actors.staff.user.id, fromStatus: "OPEN", toStatus: "IN_PROGRESS" },
    });

    const deniedExisting = await staffGet(`/api/staff/tickets/${ticket.id}`, actors.requester);
    const deniedMissing = await staffGet("/api/staff/tickets/2147483647", actors.requester);
    expect(deniedExisting.status).toBe(403);
    expect(deniedMissing.body).toEqual(deniedExisting.body);
    expect(JSON.stringify(deniedExisting.body)).not.toContain(ticket.ticketNumber);

    for (const actor of [actors.staff, actors.administrator]) {
      const response = await staffGet(`/api/staff/tickets/${ticket.id}`, actor);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        requester: { id: actors.requester.user.id, name: actors.requester.user.name, email: actors.requester.user.email },
        owner: { id: actors.staff.user.id, role: "IT_STAFF" },
        requestedPriority: "HIGH",
        itPriority: "MEDIUM",
        currentStatus: "IN_PROGRESS",
        allowedStatusTransitions: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
        statusHistory: [expect.objectContaining({ fromStatus: "OPEN", toStatus: "IN_PROGRESS" })],
      });
      expect(JSON.stringify(response.body)).not.toMatch(/password|hash|session|cookie|token|storageKey|internalNotes/i);
    }
  });

  it("uses safe invalid and missing responses", async () => {
    const { staff } = await issue33Actors();
    expect((await staffGet("/api/staff/tickets/not-a-number", staff)).status).toBe(400);
    const missing = await staffGet("/api/staff/tickets/2147483647", staff);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: { code: "TICKET_NOT_FOUND", message: "Ticket not found." } });
    expect((await request(app).get("/api/staff/tickets/1")).status).toBe(401);
  });
});
