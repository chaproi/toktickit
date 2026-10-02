import { afterEach, describe, expect, it } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import {
  adminPatch,
  cleanupIssue35Fixtures,
  editableUser,
  issue35Actors,
  ownedTicket,
} from "./issue35-test-helpers.js";

afterEach(cleanupIssue35Fixtures);

describe("API-22 historical references and Administrator protections", () => {
  it("preserves historical requesterId while current role immediately governs access", async () => {
    const { administrator, requester } = await issue35Actors();
    const prisma = getPrisma();
    const ticket = await import("./issue29-test-helpers.js").then(({ createTicketFixture }) => createTicketFixture(requester.user.id));
    const target = await prisma.user.findUniqueOrThrow({ where: { id: requester.user.id } });
    const response = await adminPatch(`/api/admin/users/${target.id}`, administrator, editableUser(target, { role: "IT_STAFF" }));
    expect(response.status).toBe(200);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).requesterId).toBe(target.id);
  });

  it("blocks unsafe self changes without blocking ordinary self-profile updates", async () => {
    const { administrator } = await issue35Actors();
    const prisma = getPrisma();
    const self = await prisma.user.findUniqueOrThrow({ where: { id: administrator.user.id } });
    for (const change of [{ isActive: false }, { role: "IT_STAFF" }]) {
      const response = await adminPatch(`/api/admin/users/${self.id}`, administrator, editableUser(self, change));
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("SELF_ADMIN_CHANGE_FORBIDDEN");
    }
    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: administrator.user.id } });
    const profile = await adminPatch(`/api/admin/users/${refreshed.id}`, administrator, editableUser(refreshed, { name: "Updated Admin Profile" }));
    expect(profile.status).toBe(200);
  });

  it("blocks non-terminal owner demotion/deactivation but preserves terminal ownership and permits operational role swaps", async () => {
    const { administrator, staff, requester } = await issue35Actors();
    const prisma = getPrisma();
    const active = await ownedTicket(requester.user.id, staff.user.id, "OPEN");
    let target = await prisma.user.findUniqueOrThrow({ where: { id: staff.user.id } });
    const blocked = await adminPatch(`/api/admin/users/${target.id}`, administrator, editableUser(target, { role: "REQUESTER" }));
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("USER_HAS_NON_TERMINAL_TICKETS");
    expect(JSON.stringify(blocked.body)).not.toMatch(new RegExp(`${active.id}|${active.ticketNumber}|${active.summary}`, "u"));

    await prisma.ticket.update({ where: { id: active.id }, data: { currentStatus: "CLOSED" } });
    target = await prisma.user.findUniqueOrThrow({ where: { id: staff.user.id } });
    const historical = await adminPatch(`/api/admin/users/${target.id}`, administrator, editableUser(target, { role: "REQUESTER", isActive: false }));
    expect(historical.status).toBe(200);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: active.id } })).ownerId).toBe(target.id);

    const operational = await prisma.user.update({ where: { id: target.id }, data: { role: "IT_STAFF", isActive: true } });
    const swapped = await adminPatch(`/api/admin/users/${target.id}`, administrator, editableUser(operational, { role: "ADMINISTRATOR" }));
    expect(swapped.status).toBe(200);
  });
});
