import { randomBytes, randomUUID } from "node:crypto";
import { expect, test as base, type Page } from "@playwright/test";
import { hashPassword } from "../../server/src/auth/password.js";
import { getPrisma } from "../../server/src/prisma.js";
import { configureTestDatabaseEnvironment } from "../../server/src/testing/test-database.js";
import type { ActionDTO, ActionSnapshot } from "../../client/src/api.js";

type Worker = { id: number; name: string; email: string; password: string };
type Fixture = {
  prisma: ReturnType<typeof getPrisma>; marker: string;
  operator: Worker; assignee: Worker; owner: Worker; requester: Worker; foreign: Worker;
  ticket: { id: number; ticketNumber: string; summary: string };
  categoryId: number; relatedSystemId: number; pageErrors: string[];
};

function safeFixtureError(stage: string, error: unknown): Error {
  const code = typeof error === "object" && error !== null && "code" in error &&
    typeof error.code === "string" && /^P\d{4}$/.test(error.code) ? error.code : "UNCLASSIFIED";
  return new Error(`Actions browser fixture ${stage} failed (${code}); sensitive details withheld.`);
}

export const test = base.extend<{ fixture: Fixture }>({
  fixture: async ({ page }, use) => {
    // The existing Playwright global setup owns this migrated disposable schema.
    const identity = configureTestDatabaseEnvironment();
    if (identity.schema !== process.env.TOKTICKIT_ISSUE27_TEST_SCHEMA || !/^issue27_suite_[a-f0-9]{32}$/.test(identity.schema)) {
      throw new Error("Refusing browser fixtures outside the exact prepared test schema.");
    }
    const prisma = getPrisma();
    const userIds: number[] = [], ticketIds: number[] = [], categoryIds: number[] = [], systemIds: number[] = [];
    const marker = `Issue45-${randomUUID().slice(0, 8)}`;
    const pageErrors: string[] = [];
    page.on("pageerror", () => pageErrors.push("Browser page error"));
    try {
      const live = await prisma.$queryRaw<Array<{ database: string; schema: string }>>`SELECT current_database() AS database, current_schema() AS schema`;
      expect(live.length).toBe(1);
      expect(live[0]!.database === identity.databaseName && live[0]!.schema === identity.schema).toBe(true);
      const user = async (role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR", label: string): Promise<Worker> => {
        const password = `Aa1!${randomBytes(18).toString("base64url")}`;
        try {
          const record = await prisma.user.create({ data: {
            name: `${marker} ${label}`, email: `issue45-${label}-${randomUUID()}@example.test`, role,
            passwordHash: await hashPassword(password), mustChangePassword: false, isActive: true,
          }, select: { id: true, name: true, email: true } });
          userIds.push(record.id);
          return { ...record, password };
        } catch (error) { throw safeFixtureError("user setup", error); }
      };
      const operator = await user("IT_STAFF", "operator"), assignee = await user("IT_STAFF", "assignee");
      const owner = await user("ADMINISTRATOR", "owner"), requester = await user("REQUESTER", "requester");
      const foreign = await user("REQUESTER", "foreign");
      const category = await prisma.category.create({ data: { name: `${marker} category` } }); categoryIds.push(category.id);
      const system = await prisma.relatedSystem.create({ data: { name: `${marker} system` } }); systemIds.push(system.id);
      const ticket = await prisma.ticket.create({ data: {
        ticketNumber: `E45-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
        clientSubmissionId: randomUUID(), requesterId: requester.id, ownerId: owner.id,
        categoryId: category.id, relatedSystemId: system.id, requestedPriority: "HIGH", itPriority: "MEDIUM",
        currentStatus: "OPEN", summary: `${marker} browser workflow`, description: "Owned synthetic Actions browser verification Ticket.",
      }, select: { id: true, ticketNumber: true, summary: true } }); ticketIds.push(ticket.id);
      await prisma.internalNote.create({ data: { ticketId: ticket.id, authorId: owner.id, content: `${marker} private Internal Note` } });
      await use({ prisma, marker, operator, assignee, owner, requester, foreign, ticket, categoryId: category.id, relatedSystemId: system.id, pageErrors });
    } finally {
      try {
        // Every predicate is bounded to identities created by this fixture, including partial setup.
        await prisma.$transaction([
          prisma.seedFixture.deleteMany({ where: { OR: [
            { userId: { in: userIds } }, { ticketId: { in: ticketIds } },
            { categoryId: { in: categoryIds } }, { relatedSystemId: { in: systemIds } },
          ] } }),
          prisma.mutationReceipt.deleteMany({ where: { ticketId: { in: ticketIds } } }),
          prisma.actionHistory.deleteMany({ where: { action: { ticketId: { in: ticketIds } } } }),
          prisma.action.deleteMany({ where: { ticketId: { in: ticketIds } } }),
          prisma.ticketStatusHistory.deleteMany({ where: { ticketId: { in: ticketIds } } }),
          prisma.internalNote.deleteMany({ where: { ticketId: { in: ticketIds } } }),
          prisma.publicComment.deleteMany({ where: { ticketId: { in: ticketIds } } }),
          prisma.attachment.deleteMany({ where: { ticketId: { in: ticketIds } } }),
          prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } }),
          prisma.authSession.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.user.deleteMany({ where: { id: { in: userIds } } }),
          prisma.category.deleteMany({ where: { id: { in: categoryIds } } }),
          prisma.relatedSystem.deleteMany({ where: { id: { in: systemIds } } }),
        ]);
        const remaining = await Promise.all([
          prisma.user.count({ where: { id: { in: userIds } } }), prisma.ticket.count({ where: { id: { in: ticketIds } } }),
          prisma.action.count({ where: { ticketId: { in: ticketIds } } }), prisma.actionHistory.count({ where: { actorId: { in: userIds } } }),
          prisma.mutationReceipt.count({ where: { actorId: { in: userIds } } }), prisma.authSession.count({ where: { userId: { in: userIds } } }),
          prisma.category.count({ where: { id: { in: categoryIds } } }), prisma.relatedSystem.count({ where: { id: { in: systemIds } } }),
        ]);
        expect(remaining).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
        console.info("Issue45 owned fixture/domain/session cleanup verified; client disconnect follows.");
      } catch (error) { throw safeFixtureError("cleanup", error); }
      finally { await prisma.$disconnect(); }
    }
  },
});

export async function login(page: Page, user: Worker) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  const [response] = await Promise.all([
    page.waitForResponse((value) => new URL(value.url()).pathname === "/api/auth/login" && value.request().method() === "POST"),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
  expect(response.status()).toBe(200);
  await page.waitForURL((url) => url.pathname !== "/login");
}

export function historySnapshot(action: Awaited<ReturnType<Fixture["prisma"]["action"]["create"]>>): ActionSnapshot {
  // Explicit test projection; never use production DTO/snapshot helpers for expectations.
  return {
    id: action.id, ticketId: action.ticketId, createdById: action.createdById,
    assigneeId: action.assigneeId, performedById: action.performedById,
    description: action.description, result: action.result, status: action.status,
    followUpRequired: action.followUpRequired, followUpNote: action.followUpNote,
    attachmentNotes: action.attachmentNotes, cancellationReason: action.cancellationReason,
    actionAt: action.actionAt.toISOString(), createdAt: action.createdAt.toISOString(), updatedAt: action.updatedAt.toISOString(),
    completedAt: action.completedAt?.toISOString() ?? null, cancelledAt: action.cancelledAt?.toISOString() ?? null, version: action.version,
  };
}

export async function syntheticAction(fixture: Fixture, options: {
  description: string; assigneeId?: number; status?: "PLANNED" | "IN_PROGRESS" | "COMPLETED";
  followUpNote?: string; attachmentNotes?: string; createdAt?: Date;
}) {
  const at = options.createdAt ?? new Date(Date.now() - 60_000);
  const started = new Date(at.getTime() + 1), completed = new Date(at.getTime() + 2);
  const status = options.status ?? "PLANNED";
  const version = status === "PLANNED" ? 1 : status === "IN_PROGRESS" ? 2 : 3;
  const action = await fixture.prisma.action.create({ data: {
    ticketId: fixture.ticket.id, createdById: fixture.owner.id, assigneeId: options.assigneeId ?? fixture.assignee.id,
    performedById: status === "COMPLETED" ? fixture.operator.id : null, description: options.description,
    result: status === "COMPLETED" ? "Synthetic completed fixture result" : null, status,
    followUpRequired: Boolean(options.followUpNote), followUpNote: options.followUpNote ?? null,
    attachmentNotes: options.attachmentNotes ?? null, actionAt: at, createdAt: at,
    updatedAt: status === "PLANNED" ? at : status === "IN_PROGRESS" ? started : completed,
    completedAt: status === "COMPLETED" ? completed : null, version,
  } });
  const planned = { ...action, status: "PLANNED" as const, result: null, performedById: null, completedAt: null, updatedAt: at, version: 1 };
  await fixture.prisma.actionHistory.create({ data: {
    actionId: action.id, actorId: fixture.owner.id, event: "ACTION_CREATED", createdAt: at, actionVersion: 1, after: historySnapshot(planned),
  } });
  if (version >= 2) {
    const inProgress = { ...planned, status: "IN_PROGRESS" as const, updatedAt: started, version: 2 };
    await fixture.prisma.actionHistory.create({ data: { actionId: action.id, actorId: fixture.owner.id,
      event: "ACTION_STARTED", createdAt: started, actionVersion: 2, before: historySnapshot(planned), after: historySnapshot(inProgress) } });
    if (version === 3) await fixture.prisma.actionHistory.create({ data: { actionId: action.id, actorId: fixture.operator.id,
      event: "ACTION_COMPLETED", createdAt: completed, actionVersion: 3, before: historySnapshot(inProgress), after: historySnapshot(action) } });
  }
  return action;
}

export type { Fixture, ActionDTO };
