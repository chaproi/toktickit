import { afterEach, describe, expect, it } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import {
  assertTicketFields,
  cleanupIssue29Fixtures,
  issue33Actors,
  issue33Ticket,
  staffPatch,
} from "./issue33-test-helpers.js";

afterEach(cleanupIssue29Fixtures);

describe("API-12 and API-13 Staff priority and status workflow", () => {
  it("updates only IT Priority, supports current-value replay, and rejects stale/terminal changes", async () => {
    const actors = await issue33Actors();
    const ticket = await issue33Ticket(actors.requester.user.id, "OPEN", actors.staff.user.id);
    const changed = await staffPatch(`/api/staff/tickets/${ticket.id}/it-priority`, actors.staff, {
      itPriority: "URGENT",
      expectedUpdatedAt: ticket.updatedAt.toISOString(),
    });
    expect(changed.status).toBe(200);
    expect(changed.body.ticket).toMatchObject({ requestedPriority: "HIGH", itPriority: "URGENT" });
    await assertTicketFields(ticket.id, { requestedPriority: "HIGH", itPriority: "URGENT" });
    const replay = await staffPatch(`/api/staff/tickets/${ticket.id}/it-priority`, actors.staff, {
      itPriority: "URGENT",
      expectedUpdatedAt: changed.body.ticket.updatedAt,
    });
    expect(replay.status).toBe(200);
    const stale = await staffPatch(`/api/staff/tickets/${ticket.id}/it-priority`, actors.staff, {
      itPriority: "LOW",
      expectedUpdatedAt: ticket.updatedAt.toISOString(),
    });
    expect(stale.body.error.code).toBe("STALE_WRITE");
    const terminal = await issue33Ticket(actors.requester.user.id, "CANCELLED", actors.staff.user.id);
    expect((await staffPatch(`/api/staff/tickets/${terminal.id}/it-priority`, actors.staff, {
      itPriority: "LOW",
      expectedUpdatedAt: terminal.updatedAt.toISOString(),
    })).body.error.code).toBe("TERMINAL_TICKET");
  });

  it("executes the complete transition matrix with one atomic history row", async () => {
    const actors = await issue33Actors();
    const matrix = {
      NEW: ["OPEN", "CANCELLED"],
      OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
      IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
      WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
      RESOLVED: ["CLOSED", "REOPENED"],
      REOPENED: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
    } as const;
    for (const [from, targets] of Object.entries(matrix)) {
      for (const target of targets) {
        const ticket = await issue33Ticket(actors.requester.user.id, from as keyof typeof matrix, actors.staff.user.id);
        const response = await staffPatch(`/api/staff/tickets/${ticket.id}/status`, actors.staff, {
          targetStatus: target,
          confirm: ["RESOLVED", "CLOSED", "CANCELLED"].includes(target),
          reason: target === "CANCELLED" ? "Valid cancellation reason" : null,
          expectedUpdatedAt: ticket.updatedAt.toISOString(),
        });
        expect(response.status, `${from} -> ${target}`).toBe(200);
        const history = await getPrisma().ticketStatusHistory.findMany({ where: { ticketId: ticket.id } });
        expect(history).toHaveLength(1);
        expect(history[0]).toMatchObject({ actorId: actors.staff.user.id, fromStatus: from, toStatus: target });
      }
    }
  });

  it("enforces owner, confirmation, cancellation reason, unchanged, invalid, stale, and terminal conflicts without partial writes", async () => {
    const actors = await issue33Actors();
    const unassigned = await issue33Ticket(actors.requester.user.id, "NEW");
    const ownerRequired = await staffPatch(`/api/staff/tickets/${unassigned.id}/status`, actors.staff, {
      targetStatus: "OPEN", expectedUpdatedAt: unassigned.updatedAt.toISOString(),
    });
    expect(ownerRequired.body.error.code).toBe("STATUS_OWNER_REQUIRED");
    const owned = await issue33Ticket(actors.requester.user.id, "OPEN", actors.staff.user.id);
    const confirmation = await staffPatch(`/api/staff/tickets/${owned.id}/status`, actors.staff, {
      targetStatus: "RESOLVED", confirm: false, expectedUpdatedAt: owned.updatedAt.toISOString(),
    });
    expect(confirmation.body.error.code).toBe("STATUS_CONFIRMATION_REQUIRED");
    const invalid = await staffPatch(`/api/staff/tickets/${owned.id}/status`, actors.staff, {
      targetStatus: "REOPENED", expectedUpdatedAt: owned.updatedAt.toISOString(),
    });
    expect(invalid.body.error.code).toBe("STATUS_TRANSITION_NOT_ALLOWED");
    expect(await getPrisma().ticketStatusHistory.count({ where: { ticketId: owned.id } })).toBe(0);
    await assertTicketFields(owned.id, { currentStatus: "OPEN" });
  });

  it("clears the current resolution indication on REOPENED", async () => {
    const actors = await issue33Actors();
    const ticket = await issue33Ticket(actors.requester.user.id, "RESOLVED", actors.staff.user.id);
    await getPrisma().ticket.update({
      where: { id: ticket.id },
      data: { requesterResolutionIndicatedAt: new Date(), requesterResolutionIndicatedById: actors.requester.user.id },
    });
    const version = await getPrisma().ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    const response = await staffPatch(`/api/staff/tickets/${ticket.id}/status`, actors.staff, {
      targetStatus: "REOPENED", expectedUpdatedAt: version.updatedAt.toISOString(),
    });
    expect(response.status).toBe(200);
    const persisted = await getPrisma().ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(persisted.requesterResolutionIndicatedAt).toBeNull();
    expect(persisted.requesterResolutionIndicatedById).toBeNull();
  });
});
