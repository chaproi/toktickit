import { Prisma } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import {
  adminPatch,
  cleanupIssue35Fixtures,
  editableUser,
  issue35Actors,
} from "./issue35-test-helpers.js";
import { orderedOnMutationGate, overlapOnMutationGate } from "./issue33-test-helpers.js";

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupIssue35Fixtures();
});

describe("SEC-15 concurrent Administrator edits", () => {
  it.each(["first-administrator", "second-administrator"])(
    "preserves one active Administrator when %s acts first in crossing role changes",
    async (firstActor) => {
      const { administrator, otherAdministrator } = await issue35Actors();
      const prisma = getPrisma();
      const [first, second] = firstActor === "first-administrator"
        ? [administrator, otherAdministrator]
        : [otherAdministrator, administrator];
      const [firstRow, secondRow] = await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { id: first.user.id } }),
        prisma.user.findUniqueOrThrow({ where: { id: second.user.id } }),
      ]);
      const unrelatedAdministrators = await prisma.user.findMany({
        where: {
          role: "ADMINISTRATOR",
          id: { notIn: [first.user.id, second.user.id] },
        },
        select: { id: true, isActive: true, updatedAt: true },
      });
      await prisma.user.updateMany({
        where: { id: { in: unrelatedAdministrators.map(({ id }) => id) } },
        data: { isActive: false },
      });
      try {
        const sharedId = Math.min(first.user.id, second.user.id);
        const result = await orderedOnMutationGate(
          { scope: 1, id: sharedId },
          () => adminPatch(`/api/admin/users/${second.user.id}`, first, editableUser(secondRow, { role: "IT_STAFF" })),
          () => adminPatch(`/api/admin/users/${first.user.id}`, second, editableUser(firstRow, { role: "IT_STAFF" })),
        );
        expect(result.firstResponse.status).toBe(200);
        expect(result.secondResponse.status).toBe(409);
        expect(result.secondResponse.body).toEqual({
          error: {
            code: "CONCURRENT_UPDATE",
            message: "This User changed concurrently. Reload and try again.",
          },
        });
        expect(JSON.stringify(result.secondResponse.body)).not.toMatch(/password|ticket|session|sql|database/iu);

        const [storedFirst, storedSecond, activeAdministrators, firstSessions, secondSessions] = await Promise.all([
          prisma.user.findUniqueOrThrow({ where: { id: first.user.id } }),
          prisma.user.findUniqueOrThrow({ where: { id: second.user.id } }),
          prisma.user.count({ where: { role: "ADMINISTRATOR", isActive: true } }),
          prisma.authSession.count({ where: { userId: first.user.id } }),
          prisma.authSession.count({ where: { userId: second.user.id } }),
        ]);
        expect(storedFirst).toMatchObject({ role: "ADMINISTRATOR", isActive: true });
        expect(storedSecond).toMatchObject({ role: "IT_STAFF", isActive: true });
        expect(activeAdministrators).toBe(1);
        expect(firstSessions).toBeGreaterThan(0);
        expect(secondSessions).toBe(0);
      } finally {
        await Promise.all(unrelatedAdministrators.map((user) => prisma.user.update({
          where: { id: user.id },
          data: { isActive: user.isActive, updatedAt: user.updatedAt },
        })));
      }
    },
  );

  it("commits at most one edit for one expectedUpdatedAt and leaves sessions and role consistent", async () => {
    await import("../../src/users/admin-user-service.js");
    const { administrator, staff } = await issue35Actors();
    const prisma = getPrisma();
    const [target, firstActiveAdministrator] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: staff.user.id } }),
      prisma.user.findFirstOrThrow({
        where: { role: "ADMINISTRATOR", isActive: true },
        orderBy: { id: "asc" },
        select: { id: true },
      }),
    ]);
    const { responses } = await overlapOnMutationGate({ scope: 1, id: firstActiveAdministrator.id }, [
      () => adminPatch(`/api/admin/users/${target.id}`, administrator, editableUser(target, { name: "First Edit" })),
      () => adminPatch(`/api/admin/users/${target.id}`, administrator, editableUser(target, { name: "Second Edit" })),
    ]);
    expect(responses.filter(({ status }) => status === 200)).toHaveLength(1);
    expect(responses.filter(({ status }) => status === 409)).toHaveLength(1);
    expect(["STALE_WRITE", "CONCURRENT_UPDATE"]).toContain(responses.find(({ status }) => status === 409)?.body.error.code);
    expect(["First Edit", "Second Edit"]).toContain((await getPrisma().user.findUniqueOrThrow({ where: { id: target.id } })).name);
  });

  it("maps three confirmed serialization failures to exact redacted CONCURRENT_UPDATE with no partial edit", async () => {
    await import("../../src/users/admin-user-service.js");
    const { administrator, staff } = await issue35Actors();
    const prisma = getPrisma();
    const target = await prisma.user.findUniqueOrThrow({ where: { id: staff.user.id } });
    const original = prisma.$transaction.bind(prisma);
    let attempts = 0;
    vi.spyOn(prisma, "$transaction").mockImplementation((async (operation: unknown, options?: object) => {
      if ((options as { isolationLevel?: unknown } | undefined)?.isolationLevel !== Prisma.TransactionIsolationLevel.Serializable) {
        return original(operation as never, options as never);
      }
      attempts += 1;
      return original(async (transaction) => {
        const result = await (operation as (tx: Prisma.TransactionClient) => Promise<unknown>)(transaction);
        throw new Prisma.PrismaClientKnownRequestError("Redacted.", {
          code: "P2010",
          clientVersion: Prisma.prismaVersion.client,
          meta: { code: "40001" },
        });
      }, options as never);
    }) as typeof prisma.$transaction);
    const response = await adminPatch(`/api/admin/users/${target.id}`, administrator, editableUser(target, { name: "Must Roll Back" }));
    expect(attempts).toBe(3);
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: { code: "CONCURRENT_UPDATE", message: "This User changed concurrently. Reload and try again." } });
    expect(JSON.stringify(response.body)).not.toMatch(/password|ticket|sql|database|ownerId/i);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).name).toBe(target.name);
  });
});
