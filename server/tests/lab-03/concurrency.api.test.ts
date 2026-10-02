import { Prisma } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runSerializableMutation } from "../../src/auth/eligibility-transaction.js";
import { getPrisma } from "../../src/prisma.js";

afterEach(() => vi.restoreAllMocks());

function databaseFailure(code: string) {
  return new Prisma.PrismaClientKnownRequestError("Synthetic redacted database failure.", {
    code: "P2010",
    clientVersion: Prisma.prismaVersion.client,
    meta: { code },
  });
}

describe("SEC-07 shared retry and lock-order boundary", () => {
  it("retries only structured 40001 at most twice and never retries P2034, 40P01, or unrelated errors", async () => {
    const prisma = getPrisma();
    const original = prisma.$transaction.bind(prisma);
    let attempts = 0;
    vi.spyOn(prisma, "$transaction").mockImplementation((async (operation: unknown, options?: object) => {
      attempts += 1;
      if (attempts < 3) throw databaseFailure("40001");
      return original(operation as never, options as never);
    }) as typeof prisma.$transaction);
    await expect(runSerializableMutation(async () => "committed")).resolves.toBe("committed");
    expect(attempts).toBe(3);

    for (const failure of [
      new Prisma.PrismaClientKnownRequestError("Ambiguous.", { code: "P2034", clientVersion: Prisma.prismaVersion.client }),
      databaseFailure("40P01"),
      databaseFailure("23505"),
    ]) {
      vi.restoreAllMocks();
      attempts = 0;
      vi.spyOn(prisma, "$transaction").mockImplementation((async () => { attempts += 1; throw failure; }) as typeof prisma.$transaction);
      await expect(runSerializableMutation(async () => "never")).rejects.toBe(failure);
      expect(attempts).toBe(1);
    }
  });
});
