import { randomBytes, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { PrismaClient, TicketStatus } from "@prisma/client";
import type { Express } from "express";
import type { Client } from "pg";
import request from "supertest";
import { afterAll, describe, expect, it, vi } from "vitest";
import { hashPassword } from "../../src/auth/password.js";
import { configureTestDatabaseEnvironment } from "../../src/testing/test-database.js";
import {
  applyLab3Baseline, applyLaterMigrations, oldTables, query,
  snapshot, verifiedTestTarget, withDisposableSchema,
} from "./migration-test-fixtures.js";

// AC-19 / T-43, D-05/D-06; preservation also contributes to AC-30/T-30.
// The historical fixture is SQL setup, not an asserted end-to-end lifecycle.
// Every subsequent transition/write below goes through the real authorized App.
const origin = "http://localhost:5173";
const reason = "Legacy workflow reason <script>literal</script>.";
const domainTables = Object.fromEntries(Object.entries({
  ...oldTables, Action: "id", ActionHistory: "id", MutationReceipt: "id", SeedFixture: "id",
}).filter(([table]) => table !== "AuthSession" && table !== "LoginThrottle"));

function same(actual: unknown, expected: unknown, label: string) {
  expect(isDeepStrictEqual(actual, expected), `${label}; sensitive values withheld`).toBe(true);
}

function cookies(value: string | string[] | undefined) {
  const entries = typeof value === "string" ? [value] : value ?? [];
  const csrf = entries.find((item) => item.startsWith("toktickit_csrf="))?.split(";", 1)[0].slice("toktickit_csrf=".length);
  expect(Boolean(csrf), "Real login supplies CSRF").toBe(true);
  return { header: entries.map((item) => item.split(";", 1)[0]).join("; "), csrf: csrf! };
}

type LegacyContext = {
  app: Express; prisma: PrismaClient; cookie: ReturnType<typeof cookies>;
};

async function populateFocusedLegacy(client: Client, password: string) {
  // These four cases need two identities and three legitimate source states,
  // not the unrelated eight-status/six-password migration preservation cohort.
  // Keep real Argon2 settings and real authentication; no password mocks.
  const instant = "2026-09-25T10:11:12.123Z";
  for (const [id, role, secret] of [
    [1, "REQUESTER", `Aa1!${randomBytes(24).toString("base64url")}`],
    [3, "IT_STAFF", password],
  ] as const) {
    await query(client, `INSERT INTO "User" (id,name,email,role,"passwordHash","mustChangePassword",
      "isActive","passwordChangedAt","createdAt","updatedAt")
      VALUES ($1,$2,$3,$4::"UserRole",$5,false,true,$6,$6,$6)`,
    [id, `Migration User ${id}`, `migration-${id}@example.test`, role, await hashPassword(secret), instant]);
  }
  await query(client, `INSERT INTO "Category" (id,name) VALUES (1,'Focused legacy category')`);
  await query(client, `INSERT INTO "RelatedSystem" (id,name) VALUES (1,'Focused legacy system')`);
  for (const [id, status, owner] of [[11, "NEW", null], [12, "OPEN", 3], [15, "RESOLVED", 3]] as const) {
    await query(client, `INSERT INTO "Ticket" (id,"ticketNumber","ticketDate","clientSubmissionId",
      "requesterId","categoryId","relatedSystemId",summary,description,"requestedPriority","itPriority",
      "currentStatus","ownerId","createdAt","updatedAt")
      VALUES ($1,$2,$3,$4::uuid,1,1,1,$5,$6,'MEDIUM','HIGH',$7::"TicketStatus",$8,$3,$3)`,
    [id, `TKT-2026-${String(id).padStart(5, "0")}`, instant, randomUUID(), `Focused legacy ${status}`,
      "Retained legacy content <script>literal</script>.", status, owner]);
    const path = status === "RESOLVED" ? ["NEW", "OPEN", "IN_PROGRESS", "RESOLVED"]
      : status === "OPEN" ? ["NEW", "OPEN"] : ["NEW"];
    for (let index = 1; index < path.length; index++) {
      await query(client, `INSERT INTO "TicketStatusHistory" ("ticketId","actorId","fromStatus","toStatus",reason,"createdAt")
        VALUES ($1,3,$2::"TicketStatus",$3::"TicketStatus",$4,$5)`,
      [id, path[index - 1], path[index], index === 2 ? "Retained historical reason" : null, instant]);
    }
  }
  await query(client, `INSERT INTO "TicketNumberSequence" (year,"lastValue","updatedAt") VALUES (2026,15,$1)`, [instant]);
  for (const table of ["User", "Category", "RelatedSystem", "Ticket"]) {
    await query(client, `SELECT setval(pg_get_serial_sequence($1,'id'),(SELECT max(id) FROM "${table}"),true)`, [`"${table}"`]);
  }
}

const pendingApplications = new Set<Promise<void>>();
let applicationQueue = Promise.resolve();

function migratedApplication(work: (context: LegacyContext) => Promise<void>) {
  // Vitest timeouts do not cancel async work. Serialize environment scopes and
  // drain even failed/timed-out work before the worker can discard its clients.
  const pending = applicationQueue.then(() => isolatedMigratedApplication(work));
  pendingApplications.add(pending);
  applicationQueue = pending.then(() => undefined, () => undefined);
  void pending.then(() => pendingApplications.delete(pending), () => pendingApplications.delete(pending));
  return pending;
}

afterAll(async () => {
  await Promise.allSettled([...pendingApplications]);
  expect(pendingApplications.size, "All scoped application requests and cleanup have drained").toBe(0);
});

async function isolatedMigratedApplication(work: (context: LegacyContext) => Promise<void>) {
  await withDisposableSchema("populated", async (client, schema) => {
    await applyLab3Baseline(client);
    const password = `Aa1!${randomBytes(24).toString("base64url")}`;
    // Establish known synthetic credentials BEFORE the increment; compare them
    // by canonical checksum, never by printing credential values.
    await populateFocusedLegacy(client, password);
    const historical = await snapshot(client, schema);
    await applyLaterMigrations(client);
    same(await snapshot(client, schema, historical), historical,
      "All historical IDs, relationships, content, credentials and times survive the actual committed increment");
    for (const table of ["Action", "ActionHistory", "MutationReceipt", "SeedFixture"]) {
      const count = await query<{ count: number }>(client, `SELECT count(*)::int AS count FROM "${table}"`);
      expect(count.rows[0].count, `Migration fabricates no ${table}`).toBe(0);
    }

    const keys = ["DATABASE_URL", "TEST_DATABASE_URL", "TOKTICKIT_DEVELOPMENT_DATABASE_URL"] as const;
    const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    const selected = new URL(verifiedTestTarget().databaseUrl);
    selected.searchParams.set("schema", schema);
    let prisma: PrismaClient | undefined;
    try {
      process.env.TEST_DATABASE_URL = selected.toString();
      process.env.DATABASE_URL = selected.toString();
      const identity = configureTestDatabaseEnvironment();
      expect(identity.schema).toBe(schema);
      // No module mocks: reset the test module registry before loading BOTH
      // App and its lazy Prisma singleton. A separate client alone is not enough.
      vi.resetModules();
      const application = await import("../../src/app.js");
      prisma = (await import("../../src/prisma.js")).getPrisma();
      const [live] = await prisma.$queryRaw<Array<{ database: string; schema: string }>>`
        SELECT current_database() AS database,current_schema() AS schema`;
      expect(live.database === identity.databaseName && live.schema === schema,
        "The real App singleton targets the migrated owned schema; identifiers withheld").toBe(true);
      const login = await request(application.app).post("/api/auth/login").set("Origin", origin)
        .send({ email: "migration-3@example.test", password });
      expect(login.status, "Real migrated credential authentication succeeds").toBe(200);
      const cookie = cookies(login.headers["set-cookie"]);
      await work({ app: application.app, prisma, cookie });
      console.info("Legacy verification: actual historical SQL + forward increments; migrated App connection and real login verified; no invented legacy Actions.");
    } finally {
      try { await prisma?.$disconnect(); }
      finally {
        for (const key of keys) {
          if (original[key] === undefined) delete process.env[key];
          else process.env[key] = original[key];
        }
        vi.resetModules();
        same(Object.fromEntries(keys.map((key) => [key, process.env[key]])), original, "Scoped database environment restored");
        console.info("Legacy App cleanup: Prisma disconnected, module registry reset and database environment restored; owned schema removal follows.");
      }
    }
  });
}

async function state(context: LegacyContext, ticketId: number) {
  const { prisma } = context;
  return {
    ticket: await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } }),
    history: await prisma.ticketStatusHistory.findMany({ where: { ticketId }, orderBy: { id: "asc" } }),
    actions: await prisma.action.findMany({ where: { ticketId }, orderBy: { id: "asc" } }),
    actionHistory: await prisma.actionHistory.findMany({ where: { action: { ticketId } }, orderBy: { id: "asc" } }),
    receipts: await prisma.mutationReceipt.findMany({ where: { ticketId }, orderBy: { id: "asc" } }),
  };
}

function mutate(context: LegacyContext, method: "post" | "patch", path: string, input: object) {
  return request(context.app)[method](path).set("Origin", origin).set("Cookie", context.cookie.header)
    .set("X-CSRF-Token", context.cookie.csrf).send(input);
}

async function transition(context: LegacyContext, ticketId: number, targetStatus: TicketStatus) {
  const before = await state(context, ticketId);
  const response = await mutate(context, "patch", `/api/staff/tickets/${ticketId}/status`, {
    targetStatus, expectedUpdatedAt: before.ticket.updatedAt.toISOString(), confirm: true, reason: `  ${reason}  `,
  });
  expect(response.status).toBe(200);
  const after = await state(context, ticketId);
  expect(after.ticket.updatedAt.getTime()).toBeGreaterThan(before.ticket.updatedAt.getTime());
  same(after.ticket, { ...before.ticket, currentStatus: targetStatus, updatedAt: after.ticket.updatedAt,
    ...(targetStatus === "REOPENED" ? { requesterResolutionIndicatedAt: null, requesterResolutionIndicatedById: null } : {}),
  }, "Only the intended Ticket transition/timestamp and reopening indications change");
  expect(Object.keys(response.body)).toEqual(["ticket"]);
  same(response.body.ticket, { id: ticketId, owner: { id: 3, name: "Migration User 3", role: "IT_STAFF" },
    requestedPriority: after.ticket.requestedPriority, itPriority: after.ticket.itPriority,
    currentStatus: targetStatus, updatedAt: after.ticket.updatedAt.toISOString(),
    requesterResolutionIndicatedAt: after.ticket.requesterResolutionIndicatedAt?.toISOString() ?? null,
  }, "Exact inherited authoritative mutation DTO");
  expect(after.history).toHaveLength(before.history.length + 1);
  same(after.history.slice(0, -1), before.history, "All older reasons and attributed status rows retained");
  const event = after.history.at(-1)!;
  same(event, { id: event.id, ticketId, actorId: 3, fromStatus: before.ticket.currentStatus,
    toStatus: targetStatus, reason, createdAt: event.createdAt }, "One real correctly attributed literal reason-bearing event");
  expect(event.createdAt.getTime()).toBeGreaterThanOrEqual(before.ticket.updatedAt.getTime());
  same(after.actions, before.actions, "Workflow does not fabricate/change Action data");
  same(after.actionHistory, before.actionHistory, "Workflow retains Action audit exactly");
  same(after.receipts, before.receipts, "Workflow retains original operation receipts exactly");
  return after;
}

describe("T-43 / AC-19: genuine migrated legacy zero-Action and reopened workflows", () => {
  it("resolves a migrated active zero-Action Ticket with its eligible historical owner", async () => {
    await migratedApplication(async (context) => {
      const before = await state(context, 12);
      expect(before.ticket.currentStatus).toBe("OPEN");
      expect(before.ticket.ownerId).toBe(3);
      expect(before.actions).toEqual([]);
      const after = await transition(context, 12, "RESOLVED");
      expect(after.actions).toEqual([]);
    });
  });

  it("closes a migrated RESOLVED zero-Action Ticket without fabricating positive completion", async () => {
    await migratedApplication(async (context) => {
      const before = await state(context, 15);
      expect(before.ticket.currentStatus).toBe("RESOLVED");
      expect(before.actions).toEqual([]);
      expect((await transition(context, 15, "CLOSED")).actions).toEqual([]);
    });
  });

  it("reopens and performs later real work without requiring a new completion each cycle", async () => {
    await migratedApplication(async (context) => {
      const legacy = await state(context, 15);
      expect(legacy.ticket.currentStatus).toBe("RESOLVED");
      await transition(context, 15, "REOPENED");
      await transition(context, 15, "IN_PROGRESS");
      const create = async (description: string) => {
        const before = await state(context, 15);
        const response = await mutate(context, "post", "/api/tickets/15/actions", {
          description, result: null, assigneeId: 3, followUpRequired: true,
          followUpNote: "Optional future review remains valid after completion.", attachmentNotes: null,
          expectedTicketUpdatedAt: before.ticket.updatedAt.toISOString(), clientMutationId: randomUUID(),
        });
        expect(response.status).toBe(201);
        return response.body.action.id as number;
      };
      const advance = async (id: number, targetStatus: "IN_PROGRESS" | "COMPLETED" | "CANCELLED") => {
        const before = await state(context, 15);
        const action = before.actions.find((row) => row.id === id)!;
        const response = await mutate(context, "patch", `/api/tickets/15/actions/${id}/status`, {
          targetStatus, expectedVersion: action.version, expectedTicketUpdatedAt: before.ticket.updatedAt.toISOString(),
          clientMutationId: randomUUID(), ...(targetStatus === "COMPLETED" ? { confirm: true, result: "Actual later work <script>literal</script>." } : {}),
          ...(targetStatus === "CANCELLED" ? { confirm: true, reason: "Later optional work cancelled deliberately." } : {}),
        });
        expect(response.status).toBe(200);
      };
      const completedId = await create("Later work after migrating and reopening the legacy Ticket.");
      await advance(completedId, "IN_PROGRESS");
      await advance(completedId, "COMPLETED");
      const firstResolution = await transition(context, 15, "RESOLVED");
      const completed = firstResolution.actions.find((row) => row.id === completedId)!;
      expect(completed.status).toBe("COMPLETED");
      expect(completed.performedById).toBe(3);
      expect(completed.followUpRequired).toBe(true);
      expect(completed.followUpNote).toBe("Optional future review remains valid after completion.");
      await transition(context, 15, "REOPENED");
      await transition(context, 15, "IN_PROGRESS");
      const cancelledId = await create("Second-cycle optional work; deliberately cancelled, not completed.");
      await advance(cancelledId, "CANCELLED");
      const secondResolution = await transition(context, 15, "RESOLVED");
      same(secondResolution.actions.find((row) => row.id === completedId), completed, "Old completion is retained, never manufactured anew per cycle");
      expect(secondResolution.actions.map((row) => row.status).sort()).toEqual(["CANCELLED", "COMPLETED"]);
      same(secondResolution.history.filter((row) => legacy.history.some((old) => old.id === row.id)), legacy.history,
        "Original migrated history remains unchanged through both real cycles");
      const events = secondResolution.actionHistory;
      expect(events.filter((row) => row.event === "ACTION_COMPLETED")).toHaveLength(1);
      expect(events.filter((row) => row.event === "ACTION_CANCELLED")).toHaveLength(1);
      expect(events.filter((row) => row.event === "ACTION_CREATED")).toHaveLength(2);
      expect(secondResolution.receipts).toHaveLength(5);
    });
  });

  it("preserves the migrated null-owner guard and all domain state on rejection", async () => {
    await migratedApplication(async (context) => {
      const before = await state(context, 11);
      expect(before.ticket.currentStatus).toBe("NEW");
      expect(before.ticket.ownerId).toBeNull();
      expect(before.actions).toEqual([]);
      const domain = async () => {
        // Raw rows never leave the process or enter assertion output.
        const result: Record<string, unknown> = {};
        for (const [table, primary] of Object.entries(domainTables)) {
          result[table] = await context.prisma.$queryRawUnsafe(`SELECT * FROM "${table}" ORDER BY "${primary}"`);
        }
        return result;
      };
      const original = await domain();
      const response = await mutate(context, "patch", "/api/staff/tickets/11/status", {
        targetStatus: "OPEN", expectedUpdatedAt: before.ticket.updatedAt.toISOString(), confirm: true, reason,
      });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("STATUS_OWNER_REQUIRED");
      expect(Object.keys(response.body)).toEqual(["error"]);
      expect(Object.keys(response.body.error).sort()).toEqual(["code", "message"]);
      same(await state(context, 11), before, "Rejected migrated transition preserves parent, children, both histories and receipts");
      same(await domain(), original, "Every domain row in the disposable copy is unchanged; legitimate session bookkeeping excluded");
    });
  });
});
