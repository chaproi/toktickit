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

async function blockedAdvisoryWaiters(
  observer: Client,
  gate: { scope: 1 | 2 | 3; id: number },
): Promise<number> {
  const result = await observer.query<{ count: string }>(`
    SELECT COUNT(*)::text AS count
    FROM pg_locks waiting
    WHERE waiting.locktype = 'advisory'
      AND waiting.classid = $1::oid
      AND waiting.objid = $2::oid
      AND waiting.granted = false
      AND cardinality(pg_blocking_pids(waiting.pid)) > 0
  `, [gate.scope, gate.id]);
  return Number(result.rows[0]?.count ?? 0);
}

async function waitForBlockedAdvisoryCount(
  observer: Client,
  gate: { scope: 1 | 2 | 3; id: number },
  expected: number,
): Promise<number> {
  const deadline = Date.now() + 5_000;
  let observed = 0;
  while (Date.now() < deadline) {
    observed = await blockedAdvisoryWaiters(observer, gate);
    if (observed >= expected) return observed;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return observed;
}

export async function orderedOnMutationGate<T>(
  sharedGate: { scope: 1; id: number },
  first: () => Promise<T>,
  second: () => Promise<T>,
): Promise<{ firstResponse: T; secondResponse: T; blockedCounts: [number, number] }> {
  if (!process.env.DATABASE_URL) throw new Error("Validated test database URL is unavailable.");
  const blocker = new Client({ connectionString: process.env.DATABASE_URL, application_name: `issue35-ordered-blocker-${randomUUID()}` });
  const observer = new Client({ connectionString: process.env.DATABASE_URL, application_name: `issue35-ordered-observer-${randomUUID()}` });
  let transactionOpen = false;
  await Promise.all([blocker.connect(), observer.connect()]);
  try {
    await blocker.query("BEGIN");
    transactionOpen = true;
    const blockerPid = (await blocker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;
    await blocker.query('SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE', [sharedGate.id]);

    const firstPending = Promise.resolve(first());
    const blockDeadline = Date.now() + 5_000;
    let firstBlocked = 0;
    while (Date.now() < blockDeadline) {
      const blocked = await observer.query<{ count: string }>(`
        SELECT COUNT(*)::text AS count
        FROM pg_stat_activity activity
        WHERE $1::integer = ANY(pg_blocking_pids(activity.pid))
      `, [blockerPid]);
      firstBlocked = Number(blocked.rows[0]?.count ?? 0);
      if (firstBlocked >= 1) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(firstBlocked).toBeGreaterThanOrEqual(1);

    const secondPending = Promise.resolve(second());
    const secondBlocked = await waitForBlockedAdvisoryCount(observer, sharedGate, 1);
    expect(secondBlocked).toBeGreaterThanOrEqual(1);

    await blocker.query("COMMIT");
    transactionOpen = false;
    const [firstResponse, secondResponse] = await Promise.all([firstPending, secondPending]);
    return { firstResponse, secondResponse, blockedCounts: [firstBlocked, secondBlocked] };
  } finally {
    if (transactionOpen) await blocker.query("ROLLBACK").catch(() => undefined);
    await Promise.all([blocker.end(), observer.end()]);
  }
}
