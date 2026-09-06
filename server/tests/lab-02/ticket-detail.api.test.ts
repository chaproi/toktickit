import { randomUUID } from "node:crypto";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

const RUN_MARKER = `Issue19-Detail-${randomUUID()}`;
const ACTIVE_REQUESTER_EMAIL = "alex.morgan@example.com";
const OTHER_REQUESTER_EMAIL = "daniel.kim@example.com";
const INACTIVE_REQUESTER_EMAIL = "emily.carter@example.com";

let activeRequesterId: number;
let otherRequesterId: number;
let inactiveRequesterId: number;
let ownedTicketId: number;
let otherTicketId: number;
let ownedTicketNumber: string;
let otherTicketNumber: string;
let categoryId: number;
let relatedSystemId: number;
let createdTicketIds: number[] = [];

async function allocateTicketNumbers(count: number): Promise<string[]> {
  const existingNumbers = await getPrisma().ticket.findMany({
    where: {
      ticketNumber: {
        startsWith: "TKT-2098-",
      },
    },
    select: {
      ticketNumber: true,
    },
  });
  const usedNumbers = new Set(
    existingNumbers.map(({ ticketNumber }) => ticketNumber),
  );
  const ticketNumbers: string[] = [];

  for (let sequence = 1; sequence <= 99_999; sequence += 1) {
    const ticketNumber = `TKT-2098-${String(sequence).padStart(
      5,
      "0",
    )}`;

    if (!usedNumbers.has(ticketNumber)) {
      ticketNumbers.push(ticketNumber);
    }

    if (ticketNumbers.length === count) {
      return ticketNumbers;
    }
  }

  throw new Error("Unable to allocate Issue #19 Ticket Numbers.");
}

async function createFixtures(): Promise<void> {
  const prisma = getPrisma();
  const [
    activeRequester,
    otherRequester,
    inactiveRequester,
    category,
    relatedSystem,
  ] = await Promise.all([
    prisma.developmentRequester.findUnique({
      where: { email: ACTIVE_REQUESTER_EMAIL },
    }),
    prisma.developmentRequester.findUnique({
      where: { email: OTHER_REQUESTER_EMAIL },
    }),
    prisma.developmentRequester.findUnique({
      where: { email: INACTIVE_REQUESTER_EMAIL },
    }),
    prisma.category.findUnique({ where: { name: "Hardware" } }),
    prisma.relatedSystem.findUnique({
      where: { name: "Corporate Laptop" },
    }),
  ]);

  if (
    !activeRequester?.isActive ||
    !otherRequester?.isActive ||
    !inactiveRequester ||
    inactiveRequester.isActive ||
    !category?.isActive ||
    !relatedSystem?.isActive
  ) {
    throw new Error(
      "Required seeded Requesters, Category, or Related System is unavailable.",
    );
  }

  activeRequesterId = activeRequester.id;
  otherRequesterId = otherRequester.id;
  inactiveRequesterId = inactiveRequester.id;
  categoryId = category.id;
  relatedSystemId = relatedSystem.id;

  [ownedTicketNumber, otherTicketNumber] =
    await allocateTicketNumbers(2);

  const [ownedTicket, otherTicket] = await Promise.all([
    prisma.ticket.create({
      data: {
        ticketNumber: ownedTicketNumber,
        ticketDate: new Date("2042-06-01T08:30:00.000Z"),
        clientSubmissionId: randomUUID(),
        requesterId: activeRequesterId,
        categoryId,
        relatedSystemId,
        summary: `${RUN_MARKER} owned laptop display issue`,
        requestedPriority: "HIGH",
        description:
          "The corporate laptop display flickers after startup.",
        currentStatus: "IN_PROGRESS",
        createdAt: new Date("2042-06-01T08:30:00.000Z"),
        updatedAt: new Date("2042-06-02T09:45:00.000Z"),
      },
    }),
    prisma.ticket.create({
      data: {
        ticketNumber: otherTicketNumber,
        ticketDate: new Date("2042-06-03T10:15:00.000Z"),
        clientSubmissionId: randomUUID(),
        requesterId: otherRequesterId,
        categoryId,
        relatedSystemId,
        summary: `${RUN_MARKER} private other-requester issue`,
        requestedPriority: "URGENT",
        description:
          "This Ticket belongs only to the other Requester.",
        currentStatus: "NEW",
        createdAt: new Date("2042-06-03T10:15:00.000Z"),
        updatedAt: new Date("2042-06-03T10:15:00.000Z"),
      },
    }),
  ]);

  ownedTicketId = ownedTicket.id;
  otherTicketId = otherTicket.id;
  createdTicketIds = [ownedTicket.id, otherTicket.id];
}

async function cleanFixtures(): Promise<void> {
  if (createdTicketIds.length === 0) {
    return;
  }

  const prisma = getPrisma();
  await prisma.attachment.deleteMany({
    where: { ticketId: { in: createdTicketIds } },
  });
  await prisma.ticket.deleteMany({
    where: { id: { in: createdTicketIds } },
  });
  createdTicketIds = [];
}

function getTicket(ticketId: string | number, requesterId?: string | number) {
  const ticketRequest = request(app).get(`/api/tickets/${ticketId}`);

  if (requesterId !== undefined) {
    ticketRequest.set(
      "X-Development-Requester-Id",
      String(requesterId),
    );
  }

  return ticketRequest;
}

beforeAll(createFixtures, 30_000);
afterAll(cleanFixtures, 30_000);

describe("GET /api/tickets/:ticketId", () => {
  it("API-07 returns every approved read-only field for an owned Ticket", async () => {
    const response = await getTicket(ownedTicketId, activeRequesterId);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: ownedTicketId,
      ticketNumber: ownedTicketNumber,
      ticketDate: "2042-06-01T08:30:00.000Z",
      requester: {
        id: activeRequesterId,
        name: "Alex Morgan",
      },
      category: {
        id: categoryId,
        name: "Hardware",
      },
      relatedSystem: {
        id: relatedSystemId,
        name: "Corporate Laptop",
      },
      requestedPriority: "HIGH",
      currentStatus: "IN_PROGRESS",
      summary: `${RUN_MARKER} owned laptop display issue`,
      description:
        "The corporate laptop display flickers after startup.",
      createdAt: "2042-06-01T08:30:00.000Z",
      updatedAt: "2042-06-02T09:45:00.000Z",
    });
    expect(response.body).not.toHaveProperty("clientSubmissionId");
    expect(response.body).not.toHaveProperty("requesterId");
  });

  it("API-07 rejects a missing or malformed Development Requester header", async () => {
    for (const requesterId of [undefined, "not-an-id", "1.5", "0", "-1"]) {
      const response = await getTicket(ownedTicketId, requesterId);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: {
          code: "REQUESTER_REQUIRED",
          message: "A valid Development Requester is required.",
        },
      });
    }
  });

  it("API-07 rejects an inactive or unknown Development Requester safely", async () => {
    for (const requesterId of [inactiveRequesterId, 2_147_483_647]) {
      const response = await getTicket(ownedTicketId, requesterId);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: {
          code: "INVALID_REQUESTER",
          message: "The selected Development Requester is invalid.",
        },
      });
    }
  });

  it("API-07 rejects malformed Ticket identifiers", async () => {
    for (const ticketId of ["not-an-id", "1.5", "0", "-1"]) {
      const response = await getTicket(ticketId, activeRequesterId);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: {
          code: "INVALID_TICKET_ID",
          message: "Ticket identifier must be a positive integer.",
        },
      });
    }
  });

  it("API-07 gives missing and non-owned Tickets the same safe not-found response", async () => {
    for (const ticketId of [otherTicketId, 2_147_483_647]) {
      const response = await getTicket(ticketId, activeRequesterId);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: {
          code: "TICKET_NOT_FOUND",
          message: "Ticket not found.",
        },
      });

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain(otherTicketNumber);
      expect(serialized).not.toContain(
        `${RUN_MARKER} private other-requester issue`,
      );
      expect(serialized).not.toContain(OTHER_REQUESTER_EMAIL);
    }
  });

});
