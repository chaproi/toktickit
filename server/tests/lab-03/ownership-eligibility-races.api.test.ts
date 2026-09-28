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
  issue33Ticket,
  orderedOnMutationGate,
  staffPatch,
  staffPost,
} from "./issue33-test-helpers.js";
import { authenticatedFixture } from "./issue29-test-helpers.js";

afterEach(cleanupIssue35Fixtures);

type EditChange =
  | { isActive: false; role?: never }
  | { role: "REQUESTER"; isActive?: never };
type LockOrder = "ownership-first" | "edit-first";

const changes: Array<[string, EditChange]> = [
  ["deactivation", { isActive: false }],
  ["Requester role change", { role: "REQUESTER" }],
];
const orders: LockOrder[] = ["ownership-first", "edit-first"];

function exactConflict(response: { status: number; body: unknown }, code: string, message: string) {
  expect(response.status).toBe(409);
  expect(response.body).toEqual({ error: { code, message } });
  expect(JSON.stringify(response.body)).not.toMatch(/ticketNumber|summary|description|requester|ownerId|password|session|sql|database/iu);
}

async function runOrdered<T>(
  sharedGate: { scope: 1; id: number },
  order: LockOrder,
  ownership: () => Promise<T>,
  edit: () => Promise<T>,
) {
  const result = order === "ownership-first"
    ? await orderedOnMutationGate(sharedGate, ownership, edit)
    : await orderedOnMutationGate(sharedGate, edit, ownership);
  return order === "ownership-first"
    ? { ownership: result.firstResponse, edit: result.secondResponse }
    : { ownership: result.secondResponse, edit: result.firstResponse };
}

describe("SEC-09 through SEC-14 ownership eligibility races", () => {
  it.each(orders)("proves claim versus claimant deactivation with %s locking", async (order) => {
    const { administrator, staff, requester } = await issue35Actors();
    const ticket = await issue33Ticket(requester.user.id, "OPEN");
    const target = await getPrisma().user.findUniqueOrThrow({ where: { id: staff.user.id } });
    const beforeSessions = await getPrisma().authSession.count({ where: { userId: staff.user.id } });
    const responses = await runOrdered(
      { scope: 1, id: staff.user.id },
      order,
      () => staffPost(`/api/staff/tickets/${ticket.id}/claim`, staff, { expectedUpdatedAt: ticket.updatedAt.toISOString() }),
      () => adminPatch(`/api/admin/users/${target.id}`, administrator, editableUser(target, { isActive: false })),
    );

    const [storedUser, storedTicket, sessions, historyCount] = await Promise.all([
      getPrisma().user.findUniqueOrThrow({ where: { id: staff.user.id } }),
      getPrisma().ticket.findUniqueOrThrow({ where: { id: ticket.id } }),
      getPrisma().authSession.count({ where: { userId: staff.user.id } }),
      getPrisma().ticketStatusHistory.count({ where: { ticketId: ticket.id } }),
    ]);
    expect(storedTicket.currentStatus).toBe("OPEN");
    expect(historyCount).toBe(0);
    if (order === "ownership-first") {
      expect(responses.ownership.status).toBe(200);
      exactConflict(responses.edit, "USER_HAS_NON_TERMINAL_TICKETS", "Reassign or unassign this User's non-terminal Tickets first.");
      expect(storedTicket.ownerId).toBe(staff.user.id);
      expect(storedUser).toMatchObject({ role: "IT_STAFF", isActive: true });
      expect(sessions).toBe(beforeSessions);
    } else {
      expect(responses.edit.status).toBe(200);
      exactConflict(responses.ownership, "OWNER_ELIGIBILITY_CONFLICT", "Ownership eligibility changed. Reload and try again.");
      expect(storedTicket.ownerId).toBeNull();
      expect(storedUser).toMatchObject({ role: "IT_STAFF", isActive: false });
      expect(sessions).toBe(0);
    }
  });

  it.each(changes.flatMap(([label, change]) => orders.map((order) => [label, change, order] as const)))(
    "proves assign versus target %s with %s locking",
    async (_label, change, order) => {
      const { administrator, staff, requester } = await issue35Actors();
      const target = await authenticatedFixture({ role: "IT_STAFF", label: "issue35-race-target" });
      const ticket = await issue33Ticket(requester.user.id, "OPEN", staff.user.id);
      const targetRow = await getPrisma().user.findUniqueOrThrow({ where: { id: target.user.id } });
      const beforeSessions = await getPrisma().authSession.count({ where: { userId: target.user.id } });
      const responses = await runOrdered(
        { scope: 1, id: target.user.id },
        order,
        () => staffPatch(`/api/staff/tickets/${ticket.id}/owner`, staff, { ownerId: target.user.id, expectedUpdatedAt: ticket.updatedAt.toISOString() }),
        () => adminPatch(`/api/admin/users/${target.user.id}`, administrator, editableUser(targetRow, change)),
      );

      const [storedUser, storedTicket, sessions, historyCount] = await Promise.all([
        getPrisma().user.findUniqueOrThrow({ where: { id: target.user.id } }),
        getPrisma().ticket.findUniqueOrThrow({ where: { id: ticket.id } }),
        getPrisma().authSession.count({ where: { userId: target.user.id } }),
        getPrisma().ticketStatusHistory.count({ where: { ticketId: ticket.id } }),
      ]);
      expect(storedTicket.currentStatus).toBe("OPEN");
      expect(historyCount).toBe(0);
      if (order === "ownership-first") {
        expect(responses.ownership.status).toBe(200);
        exactConflict(responses.edit, "USER_HAS_NON_TERMINAL_TICKETS", "Reassign or unassign this User's non-terminal Tickets first.");
        expect(storedTicket.ownerId).toBe(target.user.id);
        expect(storedUser).toMatchObject({ role: "IT_STAFF", isActive: true });
        expect(sessions).toBe(beforeSessions);
      } else {
        expect(responses.edit.status).toBe(200);
        exactConflict(responses.ownership, "OWNER_ELIGIBILITY_CONFLICT", "Ownership eligibility changed. Reload and try again.");
        expect(storedTicket.ownerId).toBe(staff.user.id);
        expect(storedUser.isActive).toBe(change.isActive ?? true);
        expect(storedUser.role).toBe(change.role ?? "IT_STAFF");
        expect(sessions).toBe(0);
      }
    },
  );

  it.each(changes.flatMap(([label, change]) => orders.map((order) => [label, change, order] as const)))(
    "proves reassign versus old-owner %s with %s locking",
    async (_label, change, order) => {
      const { administrator, staff, requester } = await issue35Actors();
      const newOwner = await authenticatedFixture({ role: "IT_STAFF", label: "issue35-new-owner" });
      const ticket = await ownedTicket(requester.user.id, staff.user.id, "OPEN");
      const oldOwner = await getPrisma().user.findUniqueOrThrow({ where: { id: staff.user.id } });
      const beforeSessions = await getPrisma().authSession.count({ where: { userId: staff.user.id } });
      const responses = await runOrdered(
        { scope: 1, id: staff.user.id },
        order,
        () => staffPatch(`/api/staff/tickets/${ticket.id}/owner`, staff, { ownerId: newOwner.user.id, expectedUpdatedAt: ticket.updatedAt.toISOString() }),
        () => adminPatch(`/api/admin/users/${staff.user.id}`, administrator, editableUser(oldOwner, change)),
      );

      const [storedOldOwner, storedNewOwner, storedTicket, sessions, historyCount] = await Promise.all([
        getPrisma().user.findUniqueOrThrow({ where: { id: staff.user.id } }),
        getPrisma().user.findUniqueOrThrow({ where: { id: newOwner.user.id } }),
        getPrisma().ticket.findUniqueOrThrow({ where: { id: ticket.id } }),
        getPrisma().authSession.count({ where: { userId: staff.user.id } }),
        getPrisma().ticketStatusHistory.count({ where: { ticketId: ticket.id } }),
      ]);
      expect(responses.ownership.status).toBe(200);
      expect(storedTicket).toMatchObject({ ownerId: newOwner.user.id, currentStatus: "OPEN" });
      expect(storedNewOwner).toMatchObject({ role: "IT_STAFF", isActive: true });
      expect(historyCount).toBe(0);
      if (order === "ownership-first") {
        expect(responses.edit.status).toBe(200);
        expect(storedOldOwner.isActive).toBe(change.isActive ?? true);
        expect(storedOldOwner.role).toBe(change.role ?? "IT_STAFF");
        expect(sessions).toBe(0);
      } else {
        exactConflict(responses.edit, "USER_HAS_NON_TERMINAL_TICKETS", "Reassign or unassign this User's non-terminal Tickets first.");
        expect(storedOldOwner).toMatchObject({ role: "IT_STAFF", isActive: true });
        expect(sessions).toBe(beforeSessions);
      }
    },
  );

  it.each(changes.flatMap(([label, change]) => orders.map((order) => [label, change, order] as const)))(
    "proves reassign versus new-owner %s with %s locking",
    async (_label, change, order) => {
      const { administrator, staff, requester } = await issue35Actors();
      const newOwner = await authenticatedFixture({ role: "IT_STAFF", label: "issue35-new-owner" });
      const ticket = await ownedTicket(requester.user.id, staff.user.id, "OPEN");
      const target = await getPrisma().user.findUniqueOrThrow({ where: { id: newOwner.user.id } });
      const beforeSessions = await getPrisma().authSession.count({ where: { userId: newOwner.user.id } });
      const responses = await runOrdered(
        { scope: 1, id: newOwner.user.id },
        order,
        () => staffPatch(`/api/staff/tickets/${ticket.id}/owner`, staff, { ownerId: newOwner.user.id, expectedUpdatedAt: ticket.updatedAt.toISOString() }),
        () => adminPatch(`/api/admin/users/${newOwner.user.id}`, administrator, editableUser(target, change)),
      );

      const [storedUser, storedTicket, sessions, historyCount] = await Promise.all([
        getPrisma().user.findUniqueOrThrow({ where: { id: newOwner.user.id } }),
        getPrisma().ticket.findUniqueOrThrow({ where: { id: ticket.id } }),
        getPrisma().authSession.count({ where: { userId: newOwner.user.id } }),
        getPrisma().ticketStatusHistory.count({ where: { ticketId: ticket.id } }),
      ]);
      expect(storedTicket.currentStatus).toBe("OPEN");
      expect(historyCount).toBe(0);
      if (order === "ownership-first") {
        expect(responses.ownership.status).toBe(200);
        exactConflict(responses.edit, "USER_HAS_NON_TERMINAL_TICKETS", "Reassign or unassign this User's non-terminal Tickets first.");
        expect(storedTicket.ownerId).toBe(newOwner.user.id);
        expect(storedUser).toMatchObject({ role: "IT_STAFF", isActive: true });
        expect(sessions).toBe(beforeSessions);
      } else {
        expect(responses.edit.status).toBe(200);
        exactConflict(responses.ownership, "OWNER_ELIGIBILITY_CONFLICT", "Ownership eligibility changed. Reload and try again.");
        expect(storedTicket.ownerId).toBe(staff.user.id);
        expect(storedUser.isActive).toBe(change.isActive ?? true);
        expect(storedUser.role).toBe(change.role ?? "IT_STAFF");
        expect(sessions).toBe(0);
      }
    },
  );

  it.each(changes.flatMap(([label, change]) => orders.map((order) => [label, change, order] as const)))(
    "proves non-terminal status versus owner %s with %s locking",
    async (_label, change, order) => {
      const { administrator, staff, requester } = await issue35Actors();
      const ticket = await ownedTicket(requester.user.id, staff.user.id, "OPEN");
      const target = await getPrisma().user.findUniqueOrThrow({ where: { id: staff.user.id } });
      const beforeSessions = await getPrisma().authSession.count({ where: { userId: staff.user.id } });
      const responses = await runOrdered(
        { scope: 1, id: staff.user.id },
        order,
        () => staffPatch(`/api/staff/tickets/${ticket.id}/status`, staff, { targetStatus: "IN_PROGRESS", confirm: false, reason: null, expectedUpdatedAt: ticket.updatedAt.toISOString() }),
        () => adminPatch(`/api/admin/users/${staff.user.id}`, administrator, editableUser(target, change)),
      );
      expect(responses.ownership.status).toBe(200);
      exactConflict(responses.edit, "USER_HAS_NON_TERMINAL_TICKETS", "Reassign or unassign this User's non-terminal Tickets first.");
      const [storedUser, storedTicket, sessions, history] = await Promise.all([
        getPrisma().user.findUniqueOrThrow({ where: { id: staff.user.id } }),
        getPrisma().ticket.findUniqueOrThrow({ where: { id: ticket.id } }),
        getPrisma().authSession.count({ where: { userId: staff.user.id } }),
        getPrisma().ticketStatusHistory.findMany({ where: { ticketId: ticket.id } }),
      ]);
      expect(storedUser).toMatchObject({ role: "IT_STAFF", isActive: true });
      expect(storedTicket).toMatchObject({ ownerId: staff.user.id, currentStatus: "IN_PROGRESS" });
      expect(sessions).toBe(beforeSessions);
      expect(history).toMatchObject([{ actorId: staff.user.id, fromStatus: "OPEN", toStatus: "IN_PROGRESS" }]);
    },
  );

  it.each(changes.flatMap(([label, change]) => orders.map((order) => [label, change, order] as const)))(
    "proves terminal status versus owner %s with %s locking",
    async (_label, change, order) => {
      const { administrator, staff, requester } = await issue35Actors();
      const ticket = await ownedTicket(requester.user.id, staff.user.id, "RESOLVED");
      const target = await getPrisma().user.findUniqueOrThrow({ where: { id: staff.user.id } });
      const beforeSessions = await getPrisma().authSession.count({ where: { userId: staff.user.id } });
      const responses = await runOrdered(
        { scope: 1, id: staff.user.id },
        order,
        () => staffPatch(`/api/staff/tickets/${ticket.id}/status`, staff, { targetStatus: "CLOSED", confirm: true, reason: null, expectedUpdatedAt: ticket.updatedAt.toISOString() }),
        () => adminPatch(`/api/admin/users/${staff.user.id}`, administrator, editableUser(target, change)),
      );
      expect(responses.ownership.status).toBe(200);
      const [storedUser, storedTicket, sessions, history] = await Promise.all([
        getPrisma().user.findUniqueOrThrow({ where: { id: staff.user.id } }),
        getPrisma().ticket.findUniqueOrThrow({ where: { id: ticket.id } }),
        getPrisma().authSession.count({ where: { userId: staff.user.id } }),
        getPrisma().ticketStatusHistory.findMany({ where: { ticketId: ticket.id } }),
      ]);
      expect(storedTicket).toMatchObject({ ownerId: staff.user.id, currentStatus: "CLOSED" });
      expect(history).toMatchObject([{ actorId: staff.user.id, fromStatus: "RESOLVED", toStatus: "CLOSED" }]);
      if (order === "ownership-first") {
        expect(responses.edit.status).toBe(200);
        expect(storedUser.isActive).toBe(change.isActive ?? true);
        expect(storedUser.role).toBe(change.role ?? "IT_STAFF");
        expect(sessions).toBe(0);
      } else {
        exactConflict(responses.edit, "USER_HAS_NON_TERMINAL_TICKETS", "Reassign or unassign this User's non-terminal Tickets first.");
        expect(storedUser).toMatchObject({ role: "IT_STAFF", isActive: true });
        expect(sessions).toBe(beforeSessions);
      }
    },
  );
});
