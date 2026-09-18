import { pathToFileURL } from "node:url";
import type {
  PrismaClient,
  RequestedPriority,
  TicketStatus,
  UserRole,
} from "@prisma/client";
import { parseCredentialMapping } from "../src/auth/credential-map.js";
import { hashPassword } from "../src/auth/password.js";
import { formatTicketNumber } from "../src/tickets/ticket-number.js";

export const LAB3_SEEDED_USERS = [
  { name: "Jennifer Anderson", email: "jennifer.anderson@example.com", role: "REQUESTER", isActive: true },
  { name: "Alex Morgan", email: "alex.morgan@example.com", role: "REQUESTER", isActive: true },
  { name: "Priya Shah", email: "priya.shah@example.com", role: "REQUESTER", isActive: true },
  { name: "Daniel Kim", email: "daniel.kim@example.com", role: "REQUESTER", isActive: true },
  { name: "Emily Carter", email: "emily.carter@example.com", role: "REQUESTER", isActive: false },
  { name: "Mina Patel", email: "mina.patel@example.com", role: "IT_STAFF", isActive: true },
  { name: "Noah Williams", email: "noah.williams@example.com", role: "IT_STAFF", isActive: true },
  { name: "Sofia Garcia", email: "sofia.garcia@example.com", role: "IT_STAFF", isActive: true },
  { name: "Inactive Support", email: "inactive.support@example.com", role: "IT_STAFF", isActive: false },
  { name: "Avery Chen", email: "avery.chen@example.com", role: "ADMINISTRATOR", isActive: true },
] as const satisfies ReadonlyArray<{
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
}>;

const SEEDED_TICKETS = [
  { key: "00000000-0000-4000-8000-000000000101", requester: "jennifer.anderson@example.com", status: "NEW", priority: "LOW", owner: null, summary: "Shared printer is unavailable" },
  { key: "00000000-0000-4000-8000-000000000102", requester: "alex.morgan@example.com", status: "OPEN", priority: "MEDIUM", owner: "mina.patel@example.com", summary: "Laptop battery drains quickly" },
  { key: "00000000-0000-4000-8000-000000000103", requester: "priya.shah@example.com", status: "IN_PROGRESS", priority: "HIGH", owner: "noah.williams@example.com", summary: "VPN disconnects during classes" },
  { key: "00000000-0000-4000-8000-000000000104", requester: "daniel.kim@example.com", status: "WAITING_FOR_REQUESTER", priority: "URGENT", owner: "sofia.garcia@example.com", summary: "Grade submission access is blocked" },
  { key: "00000000-0000-4000-8000-000000000105", requester: "jennifer.anderson@example.com", status: "RESOLVED", priority: "MEDIUM", owner: "mina.patel@example.com", summary: "Email profile required repair" },
  { key: "00000000-0000-4000-8000-000000000106", requester: "alex.morgan@example.com", status: "CLOSED", priority: "LOW", owner: "noah.williams@example.com", summary: "Archived software install request" },
  { key: "00000000-0000-4000-8000-000000000107", requester: "priya.shah@example.com", status: "REOPENED", priority: "HIGH", owner: null, summary: "Campus Wi-Fi issue returned" },
  { key: "00000000-0000-4000-8000-000000000108", requester: "daniel.kim@example.com", status: "CANCELLED", priority: "URGENT", owner: null, summary: "Duplicate account access request" },
] as const satisfies ReadonlyArray<{
  key: string;
  requester: string;
  status: TicketStatus;
  priority: RequestedPriority;
  owner: string | null;
  summary: string;
}>;

async function seedReferenceData(prisma: PrismaClient): Promise<void> {
  for (const name of ["Account and Access", "Hardware", "Software", "Network"]) {
    await prisma.category.upsert({
      where: { name },
      update: { isActive: true },
      create: { name, isActive: true },
    });
  }

  for (const name of [
    "Email",
    "Campus Wi-Fi",
    "VPN",
    "LEB2 App",
    "Grade Submission App",
    "Printer",
    "Corporate Laptop",
  ]) {
    await prisma.relatedSystem.upsert({
      where: { name },
      update: { isActive: true },
      create: { name, isActive: true },
    });
  }
}

async function seedUsers(prisma: PrismaClient): Promise<Map<string, number>> {
  const credentials = parseCredentialMapping(
    process.env.LAB3_SEED_INITIAL_CREDENTIALS,
    LAB3_SEEDED_USERS.map((user) => user.email),
    "LAB3_SEED_INITIAL_CREDENTIALS",
  );
  const ids = new Map<string, number>();

  for (const fixture of LAB3_SEEDED_USERS) {
    const existing = await prisma.user.findUnique({
      where: { email: fixture.email },
      select: { id: true },
    });
    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: {
            name: fixture.name,
            role: fixture.role,
            isActive: fixture.isActive,
          },
          select: { id: true },
        })
      : await prisma.user.create({
          data: {
            name: fixture.name,
            email: fixture.email,
            role: fixture.role,
            isActive: fixture.isActive,
            passwordHash: await hashPassword(credentials.get(fixture.email)!),
            mustChangePassword: true,
          },
          select: { id: true },
        });
    ids.set(fixture.email, user.id);
  }

  return ids;
}

async function nextTicketNumber(prisma: PrismaClient): Promise<string> {
  return prisma.$transaction(async (transaction) => {
    const year = new Date().getUTCFullYear();
    const prefix = `TKT-${year}-`;
    const existing = await transaction.ticket.findMany({
      where: { ticketNumber: { startsWith: prefix } },
      select: { ticketNumber: true },
    });
    const minimumNext =
      Math.max(
        0,
        ...existing.map(({ ticketNumber }) => Number(ticketNumber.slice(prefix.length))),
      ) + 1;
    const [sequence] = await transaction.$queryRaw<Array<{ lastValue: number }>>`
      INSERT INTO "TicketNumberSequence" ("year", "lastValue", "updatedAt")
      VALUES (${year}, ${minimumNext}, CURRENT_TIMESTAMP)
      ON CONFLICT ("year") DO UPDATE
      SET "lastValue" = GREATEST(
            "TicketNumberSequence"."lastValue" + 1,
            EXCLUDED."lastValue"
          ),
          "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "lastValue"
    `;
    if (!sequence) throw new Error("Ticket number allocation failed.");
    return formatTicketNumber(year, sequence.lastValue);
  });
}

async function seedTickets(
  prisma: PrismaClient,
  userIds: Map<string, number>,
): Promise<number[]> {
  const category = await prisma.category.findUniqueOrThrow({
    where: { name: "Hardware" },
  });
  const system = await prisma.relatedSystem.findUniqueOrThrow({
    where: { name: "Corporate Laptop" },
  });
  const ticketIds: number[] = [];

  for (const fixture of SEEDED_TICKETS) {
    const requesterId = userIds.get(fixture.requester)!;
    const existing = await prisma.ticket.findUnique({
      where: {
        requesterId_clientSubmissionId: {
          requesterId,
          clientSubmissionId: fixture.key,
        },
      },
      select: { id: true },
    });
    if (existing) {
      ticketIds.push(existing.id);
      continue;
    }

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: await nextTicketNumber(prisma),
        clientSubmissionId: fixture.key,
        requesterId,
        categoryId: category.id,
        relatedSystemId: system.id,
        requestedPriority: fixture.priority,
        itPriority: fixture.priority,
        currentStatus: fixture.status,
        ownerId: fixture.owner ? userIds.get(fixture.owner)! : null,
        summary: fixture.summary,
        description: `Fictional seeded scenario: ${fixture.summary}.`,
      },
      select: { id: true },
    });
    ticketIds.push(ticket.id);
  }

  return ticketIds;
}

async function seedCommunications(
  prisma: PrismaClient,
  ticketIds: number[],
  userIds: Map<string, number>,
): Promise<void> {
  const publicContent = "Fictional requester update for the seeded support scenario.";
  const noteContent = "Fictional internal diagnostic note for the seeded support scenario.";
  const ticketId = ticketIds[1]!;
  const requesterId = userIds.get("alex.morgan@example.com")!;
  const staffId = userIds.get("mina.patel@example.com")!;

  const existingComment = await prisma.publicComment.findFirst({
    where: { ticketId, authorId: requesterId, content: publicContent },
    select: { id: true },
  });
  if (!existingComment) {
    await prisma.publicComment.create({
      data: { ticketId, authorId: requesterId, content: publicContent },
    });
  }

  const existingNote = await prisma.internalNote.findFirst({
    where: { ticketId, authorId: staffId, content: noteContent },
    select: { id: true },
  });
  if (!existingNote) {
    await prisma.internalNote.create({
      data: { ticketId, authorId: staffId, content: noteContent },
    });
  }
}

export async function seedDatabase(prisma: PrismaClient): Promise<void> {
  // Validation deliberately precedes every write.
  parseCredentialMapping(
    process.env.LAB3_SEED_INITIAL_CREDENTIALS,
    LAB3_SEEDED_USERS.map((user) => user.email),
    "LAB3_SEED_INITIAL_CREDENTIALS",
  );
  await seedReferenceData(prisma);
  const userIds = await seedUsers(prisma);
  const ticketIds = await seedTickets(prisma, userIds);
  await seedCommunications(prisma, ticketIds, userIds);
  console.log("Seeded deterministic Lab 3 reference and workflow fixtures.");
}

async function main(): Promise<void> {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    await seedDatabase(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (executedPath === import.meta.url) {
  void main().catch((error: unknown) => {
    const safeKeys =
      error && typeof error === "object" && "safeKeys" in error
        ? (error as { safeKeys?: string[] }).safeKeys
        : undefined;
    console.error(
      safeKeys && safeKeys.length > 0
        ? `${(error as Error).message} User email keys: ${safeKeys.join(", ")}`
        : error instanceof Error
          ? error.message
          : "Seed failed safely.",
    );
    process.exitCode = 1;
  });
}
