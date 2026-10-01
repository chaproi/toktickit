import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const testDatabase = vi.hoisted(() => ({ client: null as PrismaClient | null }));

vi.mock("../../src/prisma.js", () => ({
  getPrisma() {
    if (!testDatabase.client) throw new Error("Migration API fixture is not initialized.");
    return testDatabase.client;
  },
}));

import { app } from "../../src/app.js";
import { hashPassword } from "../../src/auth/password.js";
import {
  LEGACY_STATUS_MAPPING,
  buildSafeLegacySnapshot,
  migrateLab3Database,
  verifyLab3Migration,
} from "../../src/migration/lab3-migration.js";

const APPROVED_ORIGIN = "http://localhost:5173";
const cleanupCallbacks: Array<() => Promise<void>> = [];
const PROTECTED_FIELDS =
  /passwordHash|passwordChangedAt|failedLoginAttempts|lockedUntil|tokenHash|csrfTokenHash|toktickit_session|toktickit_csrf/iu;

beforeAll(() => {
  process.env.AUTH_ALLOWED_ORIGINS = APPROVED_ORIGIN;
  process.env.LOGIN_THROTTLE_HMAC_SECRET = "issue37-migration-api-hmac-secret-for-tests";
});

afterEach(async () => {
  if (testDatabase.client) {
    await testDatabase.client.$disconnect();
    testDatabase.client = null;
  }
  while (cleanupCallbacks.length > 0) await cleanupCallbacks.pop()!();
});

function credentials(ids: readonly number[]): string {
  return JSON.stringify(Object.fromEntries(ids.map((id) => [
    String(id),
    `Aa1!issue38-${id}-${randomBytes(12).toString("base64url")}`,
  ])));
}

function cookieValues(setCookie: string | string[] | undefined): string[] {
  return typeof setCookie === "string" ? [setCookie] : (setCookie ?? []);
}

function cookieHeader(setCookie: string | string[] | undefined): string {
  return cookieValues(setCookie).map((value) => value.split(";", 1)[0]).join("; ");
}

function cookieValue(setCookie: string | string[] | undefined, name: string): string {
  const cookie = cookieValues(setCookie).find((value) => value.startsWith(`${name}=`));
  if (!cookie) throw new Error(`Expected ${name} cookie.`);
  return cookie.slice(name.length + 1).split(";", 1)[0] ?? "";
}

async function login(email: string, password: string) {
  const response = await request(app)
    .post("/api/auth/login")
    .set("Origin", APPROVED_ORIGIN)
    .send({ email, password })
    .expect(200);
  return {
    cookie: cookieHeader(response.headers["set-cookie"]),
    csrf: cookieValue(response.headers["set-cookie"], "toktickit_csrf"),
  };
}

async function counts(prisma: PrismaClient) {
  const [users, tickets, attachments, comments, notes, history, sessions, throttles] =
    await Promise.all([
      prisma.user.count(),
      prisma.ticket.count(),
      prisma.attachment.count(),
      prisma.publicComment.count(),
      prisma.internalNote.count(),
      prisma.ticketStatusHistory.count(),
      prisma.authSession.count(),
      prisma.loginThrottle.count(),
    ]);
  return { users, tickets, attachments, comments, notes, history, sessions, throttles };
}

describe("MIG-06/API-23 migration-produced Queue and claim compatibility", () => {
  it("lists every real mapped Lab 2 Ticket and claims one non-terminal row only through authenticated APIs", async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    expect(databaseUrl).toBeTruthy();
    const fixture = await buildSafeLegacySnapshot({
      databaseUrl: databaseUrl!,
      schema: `issue27_api_seam_${randomUUID().replaceAll("-", "")}`,
    });
    cleanupCallbacks.push(fixture.cleanup);
    const migrated = await migrateLab3Database({
      databaseUrl: fixture.databaseUrl,
      rawCredentialMapping: credentials(fixture.requesterIds),
      markPrismaMigration: false,
    });
    expect((await verifyLab3Migration(fixture.databaseUrl, fixture.before)).preserved).toBe(true);

    const prisma = new PrismaClient({ datasources: { db: { url: fixture.databaseUrl } } });
    testDatabase.client = prisma;
    const staffPassword = `Aa1!staff-${randomBytes(18).toString("base64url")}`;
    const adminPassword = `Aa1!admin-${randomBytes(18).toString("base64url")}`;
    const [staff, administrator] = await Promise.all([
      prisma.user.create({ data: {
        name: "Migration Seam Staff",
        email: `migration-staff-${randomUUID()}@example.test`,
        role: "IT_STAFF",
        passwordHash: await hashPassword(staffPassword),
        mustChangePassword: false,
      } }),
      prisma.user.create({ data: {
        name: "Migration Seam Administrator",
        email: `migration-admin-${randomUUID()}@example.test`,
        role: "ADMINISTRATOR",
        passwordHash: await hashPassword(adminPassword),
        mustChangePassword: false,
      } }),
    ]);
    const [staffAuth, adminAuth] = await Promise.all([
      login(staff.email, staffPassword),
      login(administrator.email, adminPassword),
    ]);

    const migratedTickets = await prisma.ticket.findMany({
      orderBy: { id: "asc" },
      include: { requester: { select: { id: true, name: true, email: true } } },
    });
    expect(migratedTickets.map(({ currentStatus }) => currentStatus)).toEqual(
      Object.values(LEGACY_STATUS_MAPPING),
    );
    expect(migratedTickets.every(({ ownerId }) => ownerId === null)).toBe(true);
    const beforeApi = await counts(prisma);

    for (const actor of [staffAuth, adminAuth]) {
      const queue = await request(app)
        .get("/api/staff/tickets")
        .query({ search: "Fixture Ticket", pageSize: 10 })
        .set("Cookie", actor.cookie)
        .expect(200);
      expect(queue.body.items).toHaveLength(Object.keys(LEGACY_STATUS_MAPPING).length);
      expect(new Set(
        queue.body.items.map((item: { currentStatus: string }) => item.currentStatus),
      )).toEqual(new Set(Object.values(LEGACY_STATUS_MAPPING)));
      expect(queue.body.items.every((item: { owner: unknown }) => item.owner === null)).toBe(true);
      expect(queue.body.counts).toMatchObject({ matching: 7, unassigned: 7 });
      expect(queue.body.pagination).toMatchObject({ totalItems: 7, totalPages: 1 });
      expect(JSON.stringify(queue.body)).not.toMatch(PROTECTED_FIELDS);
      for (const item of queue.body.items as Array<{
        id: number;
        requester: { id: number; name: string; email: string };
      }>) {
        expect(item.requester).toEqual(
          migratedTickets.find(({ id }) => id === item.id)?.requester,
        );
      }
    }
    expect(await counts(prisma)).toEqual(beforeApi);

    const target = migratedTickets.find(({ currentStatus }) => currentStatus === "NEW")!;
    const claim = await request(app)
      .post(`/api/staff/tickets/${target.id}/claim`)
      .set("Cookie", staffAuth.cookie)
      .set("Origin", APPROVED_ORIGIN)
      .set("X-CSRF-Token", staffAuth.csrf)
      .send({ expectedUpdatedAt: target.updatedAt.toISOString() })
      .expect(200);
    expect(claim.body.ticket).toMatchObject({
      id: target.id,
      currentStatus: "NEW",
      owner: { id: staff.id, name: staff.name, role: "IT_STAFF" },
    });
    expect(JSON.stringify(claim.body)).not.toMatch(PROTECTED_FIELDS);

    const claimed = await prisma.ticket.findUniqueOrThrow({ where: { id: target.id } });
    expect(claimed).toMatchObject({
      id: target.id,
      requesterId: target.requesterId,
      currentStatus: target.currentStatus,
      ownerId: staff.id,
    });
    const authoritativeQueue = await request(app)
      .get("/api/staff/tickets")
      .query({ search: target.ticketNumber, owner: "me", pageSize: 10 })
      .set("Cookie", staffAuth.cookie)
      .expect(200);
    expect(authoritativeQueue.body.items).toHaveLength(1);
    expect(authoritativeQueue.body.items[0]).toMatchObject({
      id: target.id,
      currentStatus: target.currentStatus,
      owner: { id: staff.id },
      requester: target.requester,
    });

    expect(await counts(prisma)).toEqual(beforeApi);
    const untouched = await prisma.ticket.findMany({
      where: { id: { not: target.id } },
      orderBy: { id: "asc" },
    });
    expect(untouched).toEqual(
      migratedTickets
        .filter(({ id }) => id !== target.id)
        .map(({ requester: _requester, ...ticket }) => ticket),
    );
    expect(migrated.before.checksums).toEqual(fixture.before.checksums);
  }, 30_000);
});
