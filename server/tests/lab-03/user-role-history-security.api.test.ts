import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import {
  adminPatch,
  cleanupIssue35Fixtures,
  editableUser,
  issue35Actors,
} from "./issue35-test-helpers.js";

afterEach(cleanupIssue35Fixtures);

describe("SEC-08 immediate authorization and safe history", () => {
  it("revokes sessions immediately after Requester role change without rewriting historical references", async () => {
    const { administrator, requester } = await issue35Actors();
    const { createTicketFixture } = await import("./issue29-test-helpers.js");
    const ticket = await createTicketFixture(requester.user.id);
    const target = await getPrisma().user.findUniqueOrThrow({ where: { id: requester.user.id } });
    const changed = await adminPatch(`/api/admin/users/${target.id}`, administrator, editableUser(target, { role: "IT_STAFF" }));
    expect(changed.status).toBe(200);
    const formerRequester = await request(app).get("/api/tickets").set("Cookie", requester.cookie);
    expect(formerRequester.status).toBe(401);
    expect(formerRequester.body.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect((await getPrisma().ticket.findUniqueOrThrow({ where: { id: ticket.id } })).requesterId).toBe(target.id);
  });

  it("redacts Ticket contents from non-terminal owner conflicts", async () => {
    const { administrator, staff, requester } = await issue35Actors();
    const { ownedTicket } = await import("./issue35-test-helpers.js");
    const ticket = await ownedTicket(requester.user.id, staff.user.id, "IN_PROGRESS");
    const target = await getPrisma().user.findUniqueOrThrow({ where: { id: staff.user.id } });
    const response = await adminPatch(`/api/admin/users/${target.id}`, administrator, editableUser(target, { isActive: false }));
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: "USER_HAS_NON_TERMINAL_TICKETS",
        message: "Reassign or unassign this User's non-terminal Tickets first.",
      },
    });
    expect(JSON.stringify(response.body)).not.toMatch(new RegExp(`${ticket.id}|${ticket.ticketNumber}|${ticket.summary}`, "u"));
  });
});
