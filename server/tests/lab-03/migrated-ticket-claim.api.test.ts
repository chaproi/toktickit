import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import {
  authenticatedUnsafe,
  cleanupIssue29Fixtures,
  createTicketFixture,
} from "./issue29-test-helpers.js";
import { issue33Actors } from "./issue33-test-helpers.js";

const MAPPED_STATUSES = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "CLOSED",
  "CANCELLED",
] as const;

afterEach(cleanupIssue29Fixtures);

describe("API-23 migrated Ticket Queue and claim compatibility", () => {
  it("lists every mapped unassigned status and claims only non-terminal Tickets without status rewrites", async () => {
    const actors = await issue33Actors();
    const marker = `Issue 37 migrated ${Date.now()}`;
    const tickets = [];
    for (const status of MAPPED_STATUSES) {
      const ticket = await createTicketFixture(actors.requester.user.id, status);
      tickets.push(await getPrisma().ticket.update({
        where: { id: ticket.id },
        data: { summary: `${marker} ${status}`, ownerId: null },
      }));
    }

    const queue = await request(app)
      .get("/api/staff/tickets")
      .query({ search: marker, pageSize: 10 })
      .set("Cookie", actors.staff.cookie);
    expect(queue.status).toBe(200);
    expect(queue.body.items).toHaveLength(MAPPED_STATUSES.length);
    expect(new Set(queue.body.items.map((item: { currentStatus: string }) => item.currentStatus)))
      .toEqual(new Set(MAPPED_STATUSES));
    expect(queue.body.items.every((item: { owner: unknown }) => item.owner === null)).toBe(true);
    expect(queue.body.counts).toMatchObject({ matching: 7, unassigned: 7 });

    for (const ticket of tickets) {
      const response = await authenticatedUnsafe(
        request(app).post(`/api/staff/tickets/${ticket.id}/claim`),
        actors.staff,
      ).send({ expectedUpdatedAt: ticket.updatedAt.toISOString() });
      if (ticket.currentStatus === "CLOSED" || ticket.currentStatus === "CANCELLED") {
        expect(response.status).toBe(409);
        expect(response.body).toEqual({
          error: {
            code: "TERMINAL_TICKET",
            message: "Terminal Tickets cannot be changed.",
          },
        });
        expect(await getPrisma().ticket.findUniqueOrThrow({ where: { id: ticket.id } }))
          .toMatchObject({ currentStatus: ticket.currentStatus, ownerId: null });
      } else {
        expect(response.status).toBe(200);
        expect(response.body.ticket).toMatchObject({
          id: ticket.id,
          currentStatus: ticket.currentStatus,
          owner: { id: actors.staff.user.id },
        });
        expect(await getPrisma().ticket.findUniqueOrThrow({ where: { id: ticket.id } }))
          .toMatchObject({ currentStatus: ticket.currentStatus, ownerId: actors.staff.user.id });
      }
    }
  }, 30_000);
});
