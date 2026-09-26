import { randomUUID } from "node:crypto";
import type { RequestedPriority, TicketStatus } from "@prisma/client";
import { Client } from "pg";
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

export async function overlapOnMutationGate<T>(
  gate: { scope: 1 | 2 | 3; id: number },
  operations: ReadonlyArray<() => Promise<T>>,
): Promise<{ responses: T[]; blockedCount: number }> {
  if (!process.env.DATABASE_URL) throw new Error("Validated test database URL is unavailable.");
  const blocker = new Client({ connectionString: process.env.DATABASE_URL, application_name: `issue33-blocker-${randomUUID()}` });
  const observer = new Client({ connectionString: process.env.DATABASE_URL, application_name: `issue33-observer-${randomUUID()}` });
  let transactionOpen = false;
  await Promise.all([blocker.connect(), observer.connect()]);
  try {
    await blocker.query("BEGIN");
    transactionOpen = true;
    await blocker.query("SELECT pg_advisory_xact_lock($1::integer, $2::integer)", [gate.scope, gate.id]);
    const pending = operations.map((operation) => Promise.resolve(operation()));
    const deadline = Date.now() + 5_000;
    let blockedCount = 0;
    while (Date.now() < deadline) {
      const result = await observer.query<{ count: string }>(`
        SELECT COUNT(*)::text AS count
        FROM pg_locks waiting
        WHERE waiting.locktype = 'advisory'
          AND waiting.classid = $1::oid
          AND waiting.objid = $2::oid
          AND waiting.granted = false
          AND cardinality(pg_blocking_pids(waiting.pid)) > 0
      `, [gate.scope, gate.id]);
      blockedCount = Number(result.rows[0]?.count ?? 0);
      if (blockedCount >= operations.length) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(blockedCount).toBeGreaterThanOrEqual(operations.length);
    await blocker.query("COMMIT");
    transactionOpen = false;
    return { responses: await Promise.all(pending), blockedCount };
  } finally {
    if (transactionOpen) await blocker.query("ROLLBACK").catch(() => undefined);
    await Promise.all([blocker.end(), observer.end()]);
  }
}
