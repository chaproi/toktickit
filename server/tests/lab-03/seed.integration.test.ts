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

    const seededTickets = await prisma.ticket.findMany({
      where: { description: { startsWith: "Fictional seeded scenario:" } },
      include: { owner: true },
    });
    expect(new Set(seededTickets.map((ticket) => ticket.currentStatus))).toEqual(
      new Set([
        "NEW",
        "OPEN",
        "IN_PROGRESS",
        "WAITING_FOR_REQUESTER",
        "RESOLVED",
        "CLOSED",
        "REOPENED",
        "CANCELLED",
      ]),
    );
    expect(new Set(seededTickets.map((ticket) => ticket.requestedPriority))).toEqual(
      new Set(["LOW", "MEDIUM", "HIGH", "URGENT"]),
    );
    expect(seededTickets.some((ticket) => ticket.ownerId === null)).toBe(true);
    expect(seededTickets.some((ticket) => ticket.ownerId !== null)).toBe(true);
    expect(
      seededTickets
        .filter((ticket) => ticket.owner !== null)
        .every(
          (ticket) =>
            ticket.owner!.isActive &&
            ["IT_STAFF", "ADMINISTRATOR"].includes(ticket.owner!.role),
        ),
    ).toBe(true);

    const year = new Date().getUTCFullYear();
    const sequence = await prisma.ticketNumberSequence.findUniqueOrThrow({
      where: { year },
    });
    const maximumTicketNumber = Math.max(
      ...(
        await prisma.ticket.findMany({
          where: { ticketNumber: { startsWith: `TKT-${year}-` } },
          select: { ticketNumber: true },
        })
      ).map(({ ticketNumber }) => Number(ticketNumber.slice(-5))),
    );
    expect(sequence.lastValue).toBeGreaterThanOrEqual(maximumTicketNumber);
  });

  it("rejects an incomplete seed mapping before any write", async () => {
    const prisma = getPrisma();
    const before = {
      users: await prisma.user.count(),
      categories: await prisma.category.count(),
      tickets: await prisma.ticket.count(),
    };
    process.env.LAB3_SEED_INITIAL_CREDENTIALS = "{}";
    try {
      await expect(seedDatabase(prisma)).rejects.toThrow(/missing required keys/iu);
      await expect(
        Promise.all([
          prisma.user.count(),
          prisma.category.count(),
          prisma.ticket.count(),
        ]),
      ).resolves.toEqual([before.users, before.categories, before.tickets]);
    } finally {
      process.env.LAB3_SEED_INITIAL_CREDENTIALS = JSON.stringify(mapping);
    }
  });
});
