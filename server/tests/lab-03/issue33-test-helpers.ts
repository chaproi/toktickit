import { randomUUID } from "node:crypto";
import type { RequestedPriority, TicketStatus } from "@prisma/client";
import request from "supertest";
import { expect } from "vitest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import {
  authenticatedFixture,
  authenticatedUnsafe,
  cleanupIssue29Fixtures,
  createTicketFixture,
  type AuthenticatedFixture,
} from "./issue29-test-helpers.js";

export { authenticatedFixture, authenticatedUnsafe, cleanupIssue29Fixtures };

export async function issue33Actors() {
  const requester = await authenticatedFixture({ label: "issue33-requester" });
  const staff = await authenticatedFixture({ role: "IT_STAFF", label: "issue33-staff" });
  const otherStaff = await authenticatedFixture({ role: "IT_STAFF", label: "issue33-other" });
  const administrator = await authenticatedFixture({
    role: "ADMINISTRATOR",
    label: "issue33-admin",
  });
  return { requester, staff, otherStaff, administrator };
}

export async function issue33Ticket(
  requesterId: number,
  status: TicketStatus = "NEW",
  ownerId: number | null = null,
) {
  const ticket = await createTicketFixture(requesterId, status);
  return getPrisma().ticket.update({
    where: { id: ticket.id },
    data: { ownerId },
  });
}

export function staffGet(path: string, actor: AuthenticatedFixture) {
  return request(app).get(path).set("Cookie", actor.cookie);
}

export function staffPost(path: string, actor: AuthenticatedFixture, body: unknown) {
  return authenticatedUnsafe(request(app).post(path), actor).send(body as string | object | undefined);
}

export function staffPatch(path: string, actor: AuthenticatedFixture, body: unknown) {
  return authenticatedUnsafe(request(app).patch(path), actor).send(body as string | object | undefined);
}

export async function currentVersion(ticketId: number): Promise<string> {
  return (await getPrisma().ticket.findUniqueOrThrow({ where: { id: ticketId } }))
    .updatedAt.toISOString();
}

export async function setTicketVersion(ticketId: number): Promise<string> {
  const updated = await getPrisma().ticket.update({
    where: { id: ticketId },
    data: { summary: `Issue 33 version ${randomUUID()}` },
  });
  return updated.updatedAt.toISOString();
}

export async function assertTicketFields(
  ticketId: number,
  expected: {
    ownerId?: number | null;
    currentStatus?: TicketStatus;
    itPriority?: RequestedPriority;
    requestedPriority?: RequestedPriority;
  },
) {
  const ticket = await getPrisma().ticket.findUniqueOrThrow({ where: { id: ticketId } });
  expect(ticket).toMatchObject(expected);
  return ticket;
}
