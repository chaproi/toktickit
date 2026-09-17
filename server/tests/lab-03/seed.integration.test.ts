import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import {
  LAB3_SEEDED_USERS,
  seedDatabase,
} from "../../prisma/seed.js";

function credential(email: string): string {
  return `Aa1!${email.length}${randomBytes(12).toString("base64url")}`;
}

describe("MIG-04 idempotent Lab 3 seed", () => {
  const mapping = Object.fromEntries(
    LAB3_SEEDED_USERS.map((user) => [user.email, credential(user.email)]),
  );

  beforeAll(() => {
    process.env.LAB3_SEED_INITIAL_CREDENTIALS = JSON.stringify(mapping);
  });

  afterAll(() => {
    delete process.env.LAB3_SEED_INITIAL_CREDENTIALS;
  });

  it("creates the required roles, workflow fixtures, comments, and notes exactly once", async () => {
    const prisma = getPrisma();
    await seedDatabase(prisma);
    const firstUsers = await prisma.user.findMany({
      where: { email: { in: LAB3_SEEDED_USERS.map((user) => user.email) } },
      orderBy: { email: "asc" },
    });
    const firstHashes = new Map(firstUsers.map((user) => [user.email, user.passwordHash]));
    const firstCounts = {
      users: firstUsers.length,
      tickets: await prisma.ticket.count(),
      comments: await prisma.publicComment.count(),
      notes: await prisma.internalNote.count(),
    };

    await seedDatabase(prisma);
    const secondUsers = await prisma.user.findMany({
      where: { email: { in: LAB3_SEEDED_USERS.map((user) => user.email) } },
      orderBy: { email: "asc" },
    });
    const secondCounts = {
      users: secondUsers.length,
      tickets: await prisma.ticket.count(),
      comments: await prisma.publicComment.count(),
      notes: await prisma.internalNote.count(),
    };

    expect(secondCounts).toEqual(firstCounts);
    expect(secondUsers.map((user) => user.passwordHash)).toEqual(
      secondUsers.map((user) => firstHashes.get(user.email)),
    );
    expect(firstUsers.filter((user) => user.role === "REQUESTER" && user.isActive)).toHaveLength(4);
    expect(firstUsers.filter((user) => user.role === "REQUESTER" && !user.isActive)).toHaveLength(1);
    expect(firstUsers.filter((user) => user.role === "IT_STAFF" && user.isActive)).toHaveLength(3);
    expect(firstUsers.filter((user) => user.role === "IT_STAFF" && !user.isActive)).toHaveLength(1);
    expect(firstUsers.filter((user) => user.role === "ADMINISTRATOR" && user.isActive)).toHaveLength(1);
    expect(firstCounts.comments).toBeGreaterThan(0);
    expect(firstCounts.notes).toBeGreaterThan(0);
  });
});
