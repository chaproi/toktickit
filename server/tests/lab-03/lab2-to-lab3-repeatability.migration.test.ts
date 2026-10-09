import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";
import {
  LEGACY_STATUS_MAPPING,
  buildSafeLegacySnapshot,
  migrateLab3Database,
  verifyLab3Migration,
} from "../../src/migration/lab3-migration.js";

const cleanupCallbacks: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanupCallbacks.length > 0) {
    await cleanupCallbacks.pop()!();
  }
});

function credentials(ids: readonly number[], run: number): string {
  return JSON.stringify(Object.fromEntries(ids.map((id) => [
    String(id),
    `Aa1!issue37-${run}-${id}-${randomBytes(12).toString("base64url")}`,
  ])));
}

describe("MIG-06 repeatable populated Lab 2 migration", () => {
  it("produces identical preservation checksums and operational mapped Ticket invariants twice", async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    expect(databaseUrl).toBeTruthy();
    const runs = [];

    for (const run of [1, 2]) {
      const fixture = await buildSafeLegacySnapshot({
        databaseUrl: databaseUrl!,
        schema: `issue27_repeat_${run}_${randomUUID().replaceAll("-", "")}`,
      });
      cleanupCallbacks.push(fixture.cleanup);
      const migrated = await migrateLab3Database({
        databaseUrl: fixture.databaseUrl,
        rawCredentialMapping: credentials(fixture.requesterIds, run),
        markPrismaMigration: false,
      });
      const verified = await verifyLab3Migration(fixture.databaseUrl, fixture.before);
      const prisma = new PrismaClient({ datasources: { db: { url: fixture.databaseUrl } } });
      try {
        const tickets = await prisma.ticket.findMany({
          orderBy: { id: "asc" },
          select: { id: true, currentStatus: true, ownerId: true, updatedAt: true },
        });
        expect(tickets).toHaveLength(Object.keys(LEGACY_STATUS_MAPPING).length);
        expect(tickets.every(({ ownerId }) => ownerId === null)).toBe(true);
        expect(tickets.map(({ currentStatus }) => currentStatus)).toEqual(Object.values(LEGACY_STATUS_MAPPING));

        const operationalUser = await prisma.user.create({
          data: {
            name: `Issue 37 Migration Staff ${run}`,
            email: `issue37-migration-staff-${run}-${randomUUID()}@example.test`,
            role: "IT_STAFF",
            passwordHash: `$argon2id$fixture-${run}`,
            mustChangePassword: true,
          },
        });
        for (const ticket of tickets) {
          if (ticket.currentStatus === "CLOSED" || ticket.currentStatus === "CANCELLED") {
            expect(ticket.ownerId).toBeNull();
            continue;
          }
          const changed = await prisma.ticket.updateMany({
            where: {
              id: ticket.id,
              ownerId: null,
              currentStatus: ticket.currentStatus,
              updatedAt: ticket.updatedAt,
            },
            data: { ownerId: operationalUser.id },
          });
          expect(changed.count).toBe(1);
          expect(await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } }))
            .toMatchObject({ ownerId: operationalUser.id, currentStatus: ticket.currentStatus });
        }
        runs.push({
          before: fixture.before,
          after: migrated.after,
          verified,
          visibleStatuses: tickets.map(({ currentStatus }) => currentStatus),
        });
      } finally {
        await prisma.$disconnect();
      }
    }

    expect(runs[0]!.before.checksums).toEqual(runs[1]!.before.checksums);
    expect(runs[0]!.after.checksums).toEqual(runs[1]!.after.checksums);
    expect(runs[0]!.verified.preserved).toBe(true);
    expect(runs[1]!.verified.preserved).toBe(true);
    expect(runs[0]!.verified.ownerIds).toEqual(Array(7).fill(null));
    expect(runs[1]!.verified.ownerIds).toEqual(Array(7).fill(null));
    expect(runs[0]!.visibleStatuses).toEqual(runs[1]!.visibleStatuses);
  }, 10_000); // Two real migration/hash batches; loaded run exceeded the default 5s.
});
