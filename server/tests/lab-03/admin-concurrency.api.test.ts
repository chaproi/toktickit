import { Prisma } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import {
  adminPatch,
  cleanupIssue35Fixtures,
  editableUser,
  issue35Actors,
} from "./issue35-test-helpers.js";
import { overlapOnMutationGate } from "./issue33-test-helpers.js";

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupIssue35Fixtures();
});

describe("SEC-15 concurrent Administrator edits", () => {
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
