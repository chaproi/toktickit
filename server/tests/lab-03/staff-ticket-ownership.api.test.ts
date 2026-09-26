import { afterEach, describe, expect, it } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import {
  assertTicketFields,
  cleanupIssue29Fixtures,
  currentVersion,
  issue33Actors,
  issue33Ticket,
  overlapOnMutationGate,
  staffPatch,
  staffPost,
} from "./issue33-test-helpers.js";

afterEach(cleanupIssue29Fixtures);

describe("API-11 Staff claim and ownership", () => {
  it("claims every unassigned non-terminal status without rewriting status and is idempotent", async () => {
    const actors = await issue33Actors();
    for (const status of ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "REOPENED"] as const) {
      const ticket = await issue33Ticket(actors.requester.user.id, status);
      const body = { expectedUpdatedAt: ticket.updatedAt.toISOString() };
      const claimed = await staffPost(`/api/staff/tickets/${ticket.id}/claim`, actors.staff, body);
      expect(claimed.status).toBe(200);
      expect(claimed.body.ticket).toMatchObject({ id: ticket.id, currentStatus: status, owner: { id: actors.staff.user.id } });
      await assertTicketFields(ticket.id, { ownerId: actors.staff.user.id, currentStatus: status });
      const replay = await staffPost(`/api/staff/tickets/${ticket.id}/claim`, actors.staff, {
        expectedUpdatedAt: claimed.body.ticket.updatedAt,
      });
      expect(replay.status).toBe(200);
    }
  });

  it("returns exact safe conflicts for competing, stale, terminal, and ineligible ownership", async () => {
    const actors = await issue33Actors();
    const owned = await issue33Ticket(actors.requester.user.id, "OPEN", actors.staff.user.id);
    const competing = await staffPost(`/api/staff/tickets/${owned.id}/claim`, actors.otherStaff, {
      expectedUpdatedAt: owned.updatedAt.toISOString(),
    });
    expect(competing.status).toBe(409);
    expect(competing.body.error.code).toBe("OWNER_CONFLICT");

    const terminal = await issue33Ticket(actors.requester.user.id, "CLOSED");
    expect((await staffPost(`/api/staff/tickets/${terminal.id}/claim`, actors.staff, {
      expectedUpdatedAt: terminal.updatedAt.toISOString(),
    })).body.error.code).toBe("TERMINAL_TICKET");

    const target = await getPrisma().user.update({
      where: { id: actors.otherStaff.user.id },
      data: { isActive: false },
    });
    const assign = await staffPatch(`/api/staff/tickets/${owned.id}/owner`, actors.staff, {
      ownerId: target.id,
      expectedUpdatedAt: await currentVersion(owned.id),
    });
    expect(assign.status).toBe(404);
    expect(assign.body.error.code).toBe("OWNER_NOT_FOUND");
    expect(JSON.stringify(assign.body)).not.toMatch(/ticketNumber|password|hash|session/i);
  });

  it("assigns, reassigns, and only deliberately unassigns NEW, OPEN, or REOPENED", async () => {
    const actors = await issue33Actors();
    for (const status of ["NEW", "OPEN", "REOPENED"] as const) {
      const ticket = await issue33Ticket(actors.requester.user.id, status);
      const assigned = await staffPatch(`/api/staff/tickets/${ticket.id}/owner`, actors.staff, {
        ownerId: actors.otherStaff.user.id,
        expectedUpdatedAt: ticket.updatedAt.toISOString(),
      });
      expect(assigned.status).toBe(200);
      const reassigned = await staffPatch(`/api/staff/tickets/${ticket.id}/owner`, actors.staff, {
        ownerId: actors.administrator.user.id,
        expectedUpdatedAt: assigned.body.ticket.updatedAt,
      });
      expect(reassigned.status).toBe(200);
      const unassigned = await staffPatch(`/api/staff/tickets/${ticket.id}/owner`, actors.staff, {
        ownerId: null,
        expectedUpdatedAt: reassigned.body.ticket.updatedAt,
      });
      expect(unassigned.status).toBe(200);
      await assertTicketFields(ticket.id, { ownerId: null, currentStatus: status });
    }
    const blocked = await issue33Ticket(actors.requester.user.id, "IN_PROGRESS", actors.staff.user.id);
    const response = await staffPatch(`/api/staff/tickets/${blocked.id}/owner`, actors.staff, {
      ownerId: null,
      expectedUpdatedAt: blocked.updatedAt.toISOString(),
    });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("OWNER_CHANGE_NOT_ALLOWED");
    await assertTicketFields(blocked.id, { ownerId: actors.staff.user.id });
  });

  it("serializes genuinely overlapping competing claims and commits exactly one owner", async () => {
    const actors = await issue33Actors();
    const ticket = await issue33Ticket(actors.requester.user.id, "OPEN");
    const body = { expectedUpdatedAt: ticket.updatedAt.toISOString() };
    const { responses, blockedCount } = await overlapOnMutationGate(
      { scope: 2, id: ticket.id },
      [
        () => staffPost(`/api/staff/tickets/${ticket.id}/claim`, actors.staff, body),
        () => staffPost(`/api/staff/tickets/${ticket.id}/claim`, actors.otherStaff, body),
      ],
    );
    expect(blockedCount).toBeGreaterThanOrEqual(2);
    const winner = responses.find(({ status }) => status === 200);
    const loser = responses.find(({ status }) => status === 409);
    expect(winner?.body.ticket).toMatchObject({ id: ticket.id, currentStatus: "OPEN" });
    expect(loser?.body).toEqual({ error: { code: "OWNER_CONFLICT", message: "This Ticket is already owned by another User." } });
    expect(JSON.stringify(loser?.body)).not.toMatch(/ticketNumber|requester|password|hash|session|ownerId/i);
    const persisted = await assertTicketFields(ticket.id, { currentStatus: "OPEN" });
    expect([actors.staff.user.id, actors.otherStaff.user.id]).toContain(persisted.ownerId);
    expect(persisted.ownerId).toBe(winner?.body.ticket.owner.id);
  });
});
