import { afterEach, describe, expect, it } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import {
  adminPatch,
  cleanupIssue35Fixtures,
  editableUser,
  issue35Actors,
  ownedTicket,
} from "./issue35-test-helpers.js";
import {
  overlapOnMutationGate,
  staffPatch,
  staffPost,
} from "./issue33-test-helpers.js";

afterEach(cleanupIssue35Fixtures);

describe("SEC-09 through SEC-14 ownership eligibility races", () => {
  it("keeps claim versus claimant deactivation in a valid final state", async () => {
    await import("../../src/users/admin-user-service.js");
    const { administrator, staff, requester } = await issue35Actors();
    const ticket = await import("./issue33-test-helpers.js").then(({ issue33Ticket }) => issue33Ticket(requester.user.id, "OPEN"));
    const target = await getPrisma().user.findUniqueOrThrow({ where: { id: staff.user.id } });
    const { responses } = await overlapOnMutationGate({ scope: 1, id: staff.user.id }, [
      () => staffPost(`/api/staff/tickets/${ticket.id}/claim`, staff, { expectedUpdatedAt: ticket.updatedAt.toISOString() }),
      () => adminPatch(`/api/admin/users/${target.id}`, administrator, editableUser(target, { isActive: false })),
    ]);
    expect(responses.some(({ status }) => status === 200)).toBe(true);
    const [storedUser, storedTicket] = await Promise.all([
      getPrisma().user.findUniqueOrThrow({ where: { id: staff.user.id } }),
      getPrisma().ticket.findUniqueOrThrow({ where: { id: ticket.id } }),
    ]);
    expect(storedTicket.ownerId === null || (storedTicket.ownerId === storedUser.id && storedUser.isActive)).toBe(true);
  });

  it.each([
    ["deactivation", { isActive: false }],
    ["Requester role change", { role: "REQUESTER" }],
  ])("keeps assign versus target %s in a valid final state", async (_label, change) => {
    await import("../../src/users/admin-user-service.js");
    const { administrator, staff, requester } = await issue35Actors();
    const target = await import("./issue29-test-helpers.js").then(({ authenticatedFixture }) => authenticatedFixture({ role: "IT_STAFF", label: "issue35-race-target" }));
    const ticket = await import("./issue33-test-helpers.js").then(({ issue33Ticket }) => issue33Ticket(requester.user.id, "OPEN", staff.user.id));
    const targetRow = await getPrisma().user.findUniqueOrThrow({ where: { id: target.user.id } });
    await overlapOnMutationGate({ scope: 1, id: target.user.id }, [
      () => staffPatch(`/api/staff/tickets/${ticket.id}/owner`, staff, { ownerId: target.user.id, expectedUpdatedAt: ticket.updatedAt.toISOString() }),
      () => adminPatch(`/api/admin/users/${target.user.id}`, administrator, editableUser(targetRow, change)),
    ]);
    const [storedUser, storedTicket] = await Promise.all([
      getPrisma().user.findUniqueOrThrow({ where: { id: target.user.id } }),
      getPrisma().ticket.findUniqueOrThrow({ where: { id: ticket.id } }),
    ]);
    expect(storedTicket.ownerId !== target.user.id || (storedUser.isActive && ["IT_STAFF", "ADMINISTRATOR"].includes(storedUser.role))).toBe(true);
  });

  it("keeps reassign versus old/new owner edits free of ineligible ownership", async () => {
    await import("../../src/users/admin-user-service.js");
    const { administrator, staff, requester } = await issue35Actors();
    const newOwner = await import("./issue29-test-helpers.js").then(({ authenticatedFixture }) => authenticatedFixture({ role: "IT_STAFF", label: "issue35-new-owner" }));
    const ticket = await ownedTicket(requester.user.id, staff.user.id, "OPEN");
    const oldRow = await getPrisma().user.findUniqueOrThrow({ where: { id: staff.user.id } });
    await overlapOnMutationGate({ scope: 1, id: staff.user.id }, [
      () => staffPatch(`/api/staff/tickets/${ticket.id}/owner`, staff, { ownerId: newOwner.user.id, expectedUpdatedAt: ticket.updatedAt.toISOString() }),
      () => adminPatch(`/api/admin/users/${staff.user.id}`, administrator, editableUser(oldRow, { isActive: false })),
    ]);
    const stored = await getPrisma().ticket.findUniqueOrThrow({ where: { id: ticket.id }, include: { owner: true } });
    expect(stored.owner === null || (stored.owner.isActive && ["IT_STAFF", "ADMINISTRATOR"].includes(stored.owner.role))).toBe(true);
  });

  it("allows a terminal transition to preserve historical ownership during an eligibility edit", async () => {
    await import("../../src/users/admin-user-service.js");
    const { administrator, staff, requester } = await issue35Actors();
    const ticket = await ownedTicket(requester.user.id, staff.user.id, "RESOLVED");
    const target = await getPrisma().user.findUniqueOrThrow({ where: { id: staff.user.id } });
    await overlapOnMutationGate({ scope: 1, id: staff.user.id }, [
      () => staffPatch(`/api/staff/tickets/${ticket.id}/status`, staff, { targetStatus: "CLOSED", confirm: true, reason: null, expectedUpdatedAt: ticket.updatedAt.toISOString() }),
      () => adminPatch(`/api/admin/users/${staff.user.id}`, administrator, editableUser(target, { isActive: false })),
    ]);
    const stored = await getPrisma().ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(stored.currentStatus).toBe("CLOSED");
    expect(stored.ownerId).toBe(staff.user.id);
  });
});
