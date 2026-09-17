import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  LEGACY_STATUS_MAPPING,
  buildSafeLegacySnapshot,
  inspectLegacySnapshot,
  migrateLab3Database,
  verifyLab3Migration,
} from "../../src/migration/lab3-migration.js";

function credential(label: string): string {
  return `Aa1!${label}${randomBytes(12).toString("base64url")}`;
}

describe("MIG-01 through MIG-03 lossless Lab 2 migration", () => {
  it("defines the exact complete deterministic status map", () => {
    expect(LEGACY_STATUS_MAPPING).toEqual({
      NEW: "NEW",
      ASSIGNED: "OPEN",
      IN_PROGRESS: "IN_PROGRESS",
      PENDING_REQUESTER: "WAITING_FOR_REQUESTER",
      RESOLVED: "RESOLVED",
      CLOSED: "CLOSED",
      CANCELLED: "CANCELLED",
    });
  });

  it("preserves populated snapshot identities, relationships, timestamps, and counts", async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    expect(databaseUrl).toBeTruthy();
    const schema = `issue27_mig_${randomUUID().replaceAll("-", "")}`;
    const fixture = await buildSafeLegacySnapshot({ databaseUrl: databaseUrl!, schema });
    const mapping = Object.fromEntries(
      fixture.requesterIds.map((id) => [String(id), credential(String(id))]),
    );

    try {
      const result = await migrateLab3Database({
        databaseUrl: fixture.databaseUrl,
        rawCredentialMapping: JSON.stringify(mapping),
        markPrismaMigration: false,
      });
      const verified = await verifyLab3Migration(
        fixture.databaseUrl,
        fixture.before,
      );

      expect(result.requesterIds).toEqual(fixture.requesterIds);
      expect(verified.preserved).toBe(true);
      expect(verified.ownerIds).toEqual([null, null, null, null, null, null, null]);
      expect(verified.statuses).toEqual([
        "NEW",
        "OPEN",
        "IN_PROGRESS",
        "WAITING_FOR_REQUESTER",
        "RESOLVED",
        "CLOSED",
        "CANCELLED",
      ]);
      expect(verified.itPrioritiesMatch).toBe(true);
      expect(verified.statusHistoryCount).toBe(0);
      expect(verified.passwordHashes.every((hash) => hash.startsWith("$argon2id$"))).toBe(true);
      expect(new Set(verified.passwordHashes).size).toBe(verified.passwordHashes.length);
      expect(verified.mustChangePassword.every(Boolean)).toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects an uncovered status before schema or data mutation", async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    expect(databaseUrl).toBeTruthy();
    const schema = `issue27_unknown_${randomUUID().replaceAll("-", "")}`;
    const fixture = await buildSafeLegacySnapshot({
      databaseUrl: databaseUrl!,
      schema,
      includeUnknownStatus: true,
    });
    const mapping = Object.fromEntries(
      fixture.requesterIds.map((id) => [String(id), credential(String(id))]),
    );

    try {
      await expect(
        migrateLab3Database({
          databaseUrl: fixture.databaseUrl,
          rawCredentialMapping: JSON.stringify(mapping),
          markPrismaMigration: false,
        }),
      ).rejects.toThrow(/unsupported legacy Ticket status/iu);
      const after = await inspectLegacySnapshot(fixture.databaseUrl);
      expect(after).toEqual(fixture.before);
    } finally {
      await fixture.cleanup();
    }
  });
});
