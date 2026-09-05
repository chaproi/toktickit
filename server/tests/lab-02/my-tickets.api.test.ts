import type { Ticket } from "@prisma/client";
import { randomUUID } from "node:crypto";
import request from "supertest";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

const REQUESTER_A_EMAIL = "alex.morgan@example.com";
const REQUESTER_B_EMAIL = "daniel.kim@example.com";
const INACTIVE_REQUESTER_EMAIL = "emily.carter@example.com";
const REQUESTER_B_NAME = "Daniel Kim";
const RUN_MARKER = `Issue17-${randomUUID()}`;
const MARKER_QUERY = encodeURIComponent(RUN_MARKER);

let requesterATicketNumbers: string[] = [];
let requesterBTicketNumbers: string[] = [];
let createdTicketIds: number[] = [];
let unmatchedCategoryId: number;
let unmatchedSystemId: number;

type TestReferences = {
  categoryAlphaId: number;
  categoryBetaId: number;
  systemAlphaId: number;
  systemBetaId: number;
};

type TestRequesters = {
  requesterAId: number;
  requesterBId: number;
  inactiveRequesterId: number;
};

let references: TestReferences;
let requesters: TestRequesters;
let requesterATickets: Ticket[] = [];
let requesterBTickets: Ticket[] = [];

async function cleanIssue17Tickets(): Promise<void> {
  const prisma = getPrisma();
  const markedTickets = await prisma.ticket.findMany({
    where: {
      summary: {
        startsWith: RUN_MARKER,
      },
    },
    select: {
      id: true,
    },
  });
  const ticketIds = [
    ...new Set([
      ...createdTicketIds,
      ...markedTickets.map(({ id }) => id),
    ]),
  ];

  if (ticketIds.length > 0) {
    await prisma.attachment.deleteMany({
      where: {
        ticketId: {
          in: ticketIds,
        },
      },
    });
    await prisma.ticket.deleteMany({
      where: {
        id: {
          in: ticketIds,
        },
      },
    });
  }

  createdTicketIds = [];
}

async function createIssue17Fixtures(): Promise<void> {
  const prisma = getPrisma();
  const [
    requesterA,
    requesterB,
    inactiveRequester,
    categoryAlpha,
    categoryBeta,
    systemAlpha,
    systemBeta,
    categoryMaximum,
    systemMaximum,
  ] = await Promise.all([
    prisma.developmentRequester.findUnique({
      where: { email: REQUESTER_A_EMAIL },
    }),
    prisma.developmentRequester.findUnique({
      where: { email: REQUESTER_B_EMAIL },
    }),
    prisma.developmentRequester.findUnique({
      where: { email: INACTIVE_REQUESTER_EMAIL },
    }),
    prisma.category.findUnique({ where: { name: "Hardware" } }),
    prisma.category.findUnique({ where: { name: "Network" } }),
    prisma.relatedSystem.findUnique({ where: { name: "Email" } }),
    prisma.relatedSystem.findUnique({
      where: { name: "Campus Wi-Fi" },
    }),
    prisma.category.aggregate({ _max: { id: true } }),
    prisma.relatedSystem.aggregate({ _max: { id: true } }),
  ]);

  if (
    !requesterA?.isActive ||
    !requesterB?.isActive ||
    !inactiveRequester ||
    inactiveRequester.isActive ||
    !categoryAlpha?.isActive ||
    !categoryBeta?.isActive ||
    !systemAlpha?.isActive ||
    !systemBeta?.isActive
  ) {
    throw new Error(
      "Required seeded Requesters, Categories, or Related Systems are unavailable.",
    );
  }

  references = {
    categoryAlphaId: categoryAlpha.id,
    categoryBetaId: categoryBeta.id,
    systemAlphaId: systemAlpha.id,
    systemBetaId: systemBeta.id,
  };
  requesters = {
    requesterAId: requesterA.id,
    requesterBId: requesterB.id,
    inactiveRequesterId: inactiveRequester.id,
  };
  unmatchedCategoryId = (categoryMaximum._max.id ?? 0) + 1;
  unmatchedSystemId = (systemMaximum._max.id ?? 0) + 1;

  const existing2099Numbers = await prisma.ticket.findMany({
    where: {
      ticketNumber: {
        startsWith: "TKT-2099-",
      },
    },
    select: {
      ticketNumber: true,
    },
  });
  const usedNumbers = new Set(
    existing2099Numbers.map(({ ticketNumber }) => ticketNumber),
  );
  const allocatedNumbers: string[] = [];

  for (let sequence = 10_000; sequence <= 99_999; sequence += 1) {
    const ticketNumber = `TKT-2099-${String(sequence).padStart(
      5,
      "0",
    )}`;

    if (!usedNumbers.has(ticketNumber)) {
      allocatedNumbers.push(ticketNumber);
    }

    if (allocatedNumbers.length === 14) {
      break;
    }
  }

  if (allocatedNumbers.length !== 14) {
    throw new Error("Unable to allocate unique Issue 17 Ticket Numbers.");
  }

  requesterATicketNumbers = allocatedNumbers.slice(0, 12);
  requesterBTicketNumbers = allocatedNumbers.slice(12);

  const priorities: Ticket["requestedPriority"][] = [
    "LOW",
    "MEDIUM",
    "HIGH",
    "URGENT",
  ];
  const statuses: Ticket["currentStatus"][] = [
    "NEW",
    "ASSIGNED",
    "IN_PROGRESS",
    "PENDING_REQUESTER",
    "RESOLVED",
    "CLOSED",
    "CANCELLED",
  ];
  const summaryLabels = [
    "Battery Sentinel Alpha",
    "Printer Queue Bravo",
    "Search Needle Network",
    "Search Needle Email",
    "Gamma Monitor",
    "Delta Monitor",
    "Epsilon Monitor",
    "Zeta Monitor",
    "Eta Monitor",
    "Theta Monitor",
    "Iota Monitor",
    "Kappa Monitor",
  ];

  const requesterASeeds = requesterATicketNumbers.map(
    (ticketNumber, index) => {
      const ticketDate = new Date(Date.UTC(2042, 0, 1, index + 1));
      const updatedHour =
        index < 2 ? 20 : 19 - Math.floor(index / 2);

      return {
        ticketNumber,
        ticketDate,
        clientSubmissionId: randomUUID(),
        requesterId: requesters.requesterAId,
        categoryId:
          index % 2 === 0
            ? references.categoryAlphaId
            : references.categoryBetaId,
        relatedSystemId:
          index % 3 === 0
            ? references.systemAlphaId
            : references.systemBetaId,
        summary: `${RUN_MARKER} ${summaryLabels[index]}`,
        requestedPriority: priorities[index % priorities.length],
        description:
          "Deterministic Issue 17 Requester A test Ticket.",
        currentStatus: statuses[index % statuses.length],
        createdAt: ticketDate,
        updatedAt: new Date(Date.UTC(2042, 0, 2, updatedHour)),
      };
    },
  );
  const requesterBSeeds = requesterBTicketNumbers.map(
    (ticketNumber, index) => {
      const ticketDate = new Date(Date.UTC(2042, 1, 1, index + 1));

      return {
        ticketNumber,
        ticketDate,
        clientSubmissionId: randomUUID(),
        requesterId: requesters.requesterBId,
        categoryId: references.categoryBetaId,
        relatedSystemId: references.systemBetaId,
        summary: `${RUN_MARKER} Requester B Ticket ${index + 1}`,
        requestedPriority: priorities[index],
        description:
          "Deterministic Issue 17 Requester B test Ticket.",
        currentStatus: statuses[index],
        createdAt: ticketDate,
        updatedAt: ticketDate,
      };
    },
  );

  await prisma.ticket.createMany({
    data: [...requesterASeeds, ...requesterBSeeds],
  });

  const createdTickets = await prisma.ticket.findMany({
    where: {
      ticketNumber: {
        in: allocatedNumbers,
      },
    },
  });
  createdTicketIds = createdTickets.map(({ id }) => id);
  requesterATickets = createdTickets.filter(
    ({ requesterId }) => requesterId === requesters.requesterAId,
  );
  requesterBTickets = createdTickets.filter(
    ({ requesterId }) => requesterId === requesters.requesterBId,
  );
}

function listTickets(requesterId: number, query = "") {
  return request(app)
    .get(`/api/tickets${query}`)
    .set(
      "X-Development-Requester-Id",
      String(requesterId),
    );
}

function comparePrimitive(
  left: string | number,
  right: string | number,
): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function sortedTicketIds(
  tickets: Ticket[],
  sortBy:
    | "ticketNumber"
    | "ticketDate"
    | "updatedAt"
    | "summary",
  sortOrder: "asc" | "desc",
): number[] {
  return [...tickets]
    .sort((left, right) => {
      const leftValue =
        sortBy === "ticketDate" || sortBy === "updatedAt"
          ? left[sortBy].getTime()
          : left[sortBy];
      const rightValue =
        sortBy === "ticketDate" || sortBy === "updatedAt"
          ? right[sortBy].getTime()
          : right[sortBy];
      const primary = comparePrimitive(
        leftValue,
        rightValue,
      );
      const stable =
        primary === 0 ? comparePrimitive(left.id, right.id) : primary;

      return sortOrder === "asc" ? stable : -stable;
    })
    .map(({ id }) => id);
}

function prioritySortedTicketIds(
  tickets: Ticket[],
  sortOrder: "asc" | "desc",
): number[] {
  const severity = {
    LOW: 0,
    MEDIUM: 1,
    HIGH: 2,
    URGENT: 3,
  } as const;

  return [...tickets]
    .sort((left, right) => {
      const primary = comparePrimitive(
        severity[left.requestedPriority],
        severity[right.requestedPriority],
      );
      const stable =
        primary === 0 ? comparePrimitive(left.id, right.id) : primary;

      return sortOrder === "asc" ? stable : -stable;
    })
    .map(({ id }) => id);
}

beforeAll(async () => {
  await createIssue17Fixtures();
}, 30_000);

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await cleanIssue17Tickets();
}, 30_000);

describe("GET /api/tickets Requester ownership", () => {
  it("API-05 rejects a missing or malformed Requester header", async () => {
    const missing = await request(app).get("/api/tickets");

    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe(
      "REQUESTER_REQUIRED",
    );

    for (const value of ["not-an-id", "1.5", "0", "-1"]) {
      const malformed = await request(app)
        .get("/api/tickets")
        .set("X-Development-Requester-Id", value);

      expect(malformed.status).toBe(400);
      expect(malformed.body.error.code).toBe(
        "REQUESTER_REQUIRED",
      );
    }
  });

  it("API-05 rejects an unknown or inactive Requester", async () => {
    for (const requesterId of [
      requesters.inactiveRequesterId,
      2_147_483_647,
    ]) {
      const response = await listTickets(requesterId);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe(
        "INVALID_REQUESTER",
      );
    }
  });

  it("API-05 returns only the selected Requester's Tickets, counts, and approved DTO fields", async () => {
    const response = await listTickets(
      requesters.requesterAId,
      `?search=${MARKER_QUERY}&pageSize=50`,
    );

    expect(response.status).toBe(200);
    expect(response.body.pagination.totalItems).toBe(
      requesterATickets.length,
    );
    expect(response.body.items).toHaveLength(
      requesterATickets.length,
    );

    const requesterBTicketIds = new Set(
      requesterBTickets.map(({ id }) => id),
    );

    for (const item of response.body.items) {
      expect(requesterBTicketIds.has(item.id)).toBe(false);
      expect(Object.keys(item).sort()).toEqual(
        [
          "id",
          "ticketNumber",
          "ticketDate",
          "category",
          "relatedSystem",
          "requestedPriority",
          "currentStatus",
          "summary",
          "createdAt",
          "updatedAt",
        ].sort(),
      );
      expect(Object.keys(item.category).sort()).toEqual([
        "id",
        "name",
      ]);
      expect(Object.keys(item.relatedSystem).sort()).toEqual([
        "id",
        "name",
      ]);
    }

    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(REQUESTER_B_EMAIL);
    expect(serialized).not.toContain(REQUESTER_B_NAME);
    expect(serialized).not.toContain(
      requesterBTicketNumbers[0],
    );
  });

  it("API-05 changes the returned list when the Requester changes", async () => {
    const requesterAResponse = await listTickets(
      requesters.requesterAId,
      `?search=${MARKER_QUERY}&pageSize=50`,
    );
    const requesterBResponse = await listTickets(
      requesters.requesterBId,
      `?search=${MARKER_QUERY}&pageSize=50`,
    );

    expect(requesterAResponse.status).toBe(200);
    expect(requesterBResponse.status).toBe(200);
    expect(requesterAResponse.body.pagination.totalItems).toBe(12);
    expect(requesterBResponse.body.pagination.totalItems).toBe(2);
    expect(
      requesterBResponse.body.items.map(
        ({ ticketNumber }: { ticketNumber: string }) =>
          ticketNumber,
      ),
    ).toEqual(
      expect.arrayContaining(requesterBTicketNumbers),
    );
    expect(
      requesterBResponse.body.items.map(
        ({ ticketNumber }: { ticketNumber: string }) =>
          ticketNumber,
      ),
    ).not.toEqual(
      expect.arrayContaining(requesterATicketNumbers),
    );
  });
});

describe("GET /api/tickets list behavior", () => {
  it("API-06 searches case-insensitively by official Ticket Number", async () => {
    const searchedTicketNumber = requesterATicketNumbers[2];
    const response = await listTickets(
      requesters.requesterAId,
      `?search=%20%20${searchedTicketNumber.toLowerCase()}%20%20&pageSize=50`,
    );

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].ticketNumber).toBe(
      searchedTicketNumber,
    );
  });

  it("API-06 searches case-insensitively by Ticket Summary", async () => {
    const response = await listTickets(
      requesters.requesterAId,
      `?search=${encodeURIComponent(
        `${RUN_MARKER} sEaRcH nEeDlE`,
      )}&pageSize=50`,
    );

    expect(response.status).toBe(200);
    expect(
      response.body.items.map(
        ({ summary }: { summary: string }) => summary,
      ),
    ).toEqual([
      `${RUN_MARKER} Search Needle Email`,
      `${RUN_MARKER} Search Needle Network`,
    ]);
  });

  it("API-06 applies Category, Related System, Priority, and Status filters", async () => {
    const filterCases = [
      [
        `categoryId=${references.categoryAlphaId}`,
        (ticket: Ticket) =>
          ticket.categoryId === references.categoryAlphaId,
      ],
      [
        `relatedSystemId=${references.systemAlphaId}`,
        (ticket: Ticket) =>
          ticket.relatedSystemId === references.systemAlphaId,
      ],
      [
        "requestedPriority=HIGH",
        (ticket: Ticket) =>
          ticket.requestedPriority === "HIGH",
      ],
      [
        "currentStatus=ASSIGNED",
        (ticket: Ticket) =>
          ticket.currentStatus === "ASSIGNED",
      ],
    ] as const;

    for (const [query, predicate] of filterCases) {
      const response = await listTickets(
        requesters.requesterAId,
        `?search=${MARKER_QUERY}&${query}&pageSize=50`,
      );

      expect(response.status).toBe(200);
      expect(
        response.body.items.map(
          ({ id }: { id: number }) => id,
        ),
      ).toEqual(
        expect.arrayContaining(
          requesterATickets
            .filter(predicate)
            .map(({ id }) => id),
        ),
      );
      expect(response.body.items).toHaveLength(
        requesterATickets.filter(predicate).length,
      );
    }

    const combined = await listTickets(
      requesters.requesterAId,
      `?search=${MARKER_QUERY}&categoryId=${references.categoryAlphaId}&relatedSystemId=${references.systemBetaId}&requestedPriority=HIGH&currentStatus=IN_PROGRESS&pageSize=50`,
    );

    expect(combined.status).toBe(200);
    expect(combined.body.items).toHaveLength(1);
    expect(combined.body.items[0].ticketNumber).toBe(
      requesterATicketNumbers[2],
    );
  });

  it("API-06 sorts every non-priority field in both directions with same-direction id ties", async () => {
    const sortFields = [
      "ticketNumber",
      "ticketDate",
      "updatedAt",
      "summary",
    ] as const;

    for (const sortBy of sortFields) {
      for (const sortOrder of ["asc", "desc"] as const) {
        const response = await listTickets(
          requesters.requesterAId,
          `?search=${MARKER_QUERY}&sortBy=${sortBy}&sortOrder=${sortOrder}&pageSize=50`,
        );

        expect(response.status).toBe(200);
        expect(
          response.body.items.map(
            ({ id }: { id: number }) => id,
          ),
        ).toEqual(
          sortedTicketIds(
            requesterATickets,
            sortBy,
            sortOrder,
          ),
        );
      }
    }
  });

  it("API-06 sorts Requested Priority by business severity in both directions", async () => {
    for (const sortOrder of ["asc", "desc"] as const) {
      const response = await listTickets(
        requesters.requesterAId,
        `?search=${MARKER_QUERY}&sortBy=requestedPriority&sortOrder=${sortOrder}&pageSize=50`,
      );

      expect(response.status).toBe(200);
      expect(
        response.body.items.map(
          ({ id }: { id: number }) => id,
        ),
      ).toEqual(
        prioritySortedTicketIds(
          requesterATickets,
          sortOrder,
        ),
      );
    }
  });

  it("API-06 applies one-based pagination and every permitted page size", async () => {
    const firstPage = await listTickets(
      requesters.requesterAId,
      `?search=${MARKER_QUERY}&page=1&pageSize=10`,
    );
    const secondPage = await listTickets(
      requesters.requesterAId,
      `?search=${MARKER_QUERY}&page=2&pageSize=10`,
    );

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.items).toHaveLength(10);
    expect(firstPage.body.pagination).toEqual({
      page: 1,
      pageSize: 10,
      totalItems: 12,
      totalPages: 2,
      hasPreviousPage: false,
      hasNextPage: true,
    });

    expect(secondPage.status).toBe(200);
    expect(secondPage.body.items).toHaveLength(2);
    expect(secondPage.body.pagination).toEqual({
      page: 2,
      pageSize: 10,
      totalItems: 12,
      totalPages: 2,
      hasPreviousPage: true,
      hasNextPage: false,
    });

    for (const pageSize of [25, 50]) {
      const response = await listTickets(
        requesters.requesterAId,
        `?search=${MARKER_QUERY}&page=1&pageSize=${pageSize}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(12);
      expect(response.body.pagination).toEqual({
        page: 1,
        pageSize,
        totalItems: 12,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      });
    }
  });

  it("API-06 returns an empty successful page beyond the final page", async () => {
    const response = await listTickets(
      requesters.requesterAId,
      `?search=${MARKER_QUERY}&page=99&pageSize=10`,
    );

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([]);
    expect(response.body.pagination).toEqual({
      page: 99,
      pageSize: 10,
      totalItems: 12,
      totalPages: 2,
      hasPreviousPage: true,
      hasNextPage: false,
    });
  });

  it("API-06 returns totalPages zero and false page flags when no items exist", async () => {
    const response = await listTickets(
      requesters.requesterAId,
      `?search=${encodeURIComponent(`${RUN_MARKER}-no-match`)}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([]);
    expect(response.body.pagination).toEqual({
      page: 1,
      pageSize: 10,
      totalItems: 0,
      totalPages: 0,
      hasPreviousPage: false,
      hasNextPage: false,
    });
  });

  it("API-06 accepts unmatched positive Category and Related System IDs", async () => {
    for (const query of [
      `categoryId=${unmatchedCategoryId}`,
      `relatedSystemId=${unmatchedSystemId}`,
    ]) {
      const response = await listTickets(
        requesters.requesterAId,
        `?search=${MARKER_QUERY}&${query}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.items).toEqual([]);
      expect(response.body.pagination).toMatchObject({
        totalItems: 0,
        totalPages: 0,
        hasPreviousPage: false,
        hasNextPage: false,
      });
    }
  });

  it("API-06 rejects invalid query values with safe INVALID_QUERY responses", async () => {
    const invalidQueries = [
      ["categoryId=abc", "categoryId"],
      ["relatedSystemId=1.5", "relatedSystemId"],
      ["requestedPriority=CRITICAL", "requestedPriority"],
      ["currentStatus=UNKNOWN", "currentStatus"],
      ["sortBy=requester", "sortBy"],
      ["sortOrder=sideways", "sortOrder"],
      ["page=0", "page"],
      ["pageSize=20", "pageSize"],
      [`search=${"x".repeat(101)}`, "search"],
    ] as const;

    for (const [query, field] of invalidQueries) {
      const response = await listTickets(
        requesters.requesterAId,
        `?${query}`,
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe(
        "INVALID_QUERY",
      );
      expect(response.body.error.message).toBe(
        "One or more query parameters are invalid.",
      );
      expect(response.body.error.fields).toHaveProperty(field);
    }
  });

  it("API-06 rejects unknown or repeated query parameters", async () => {
    for (const [query, field] of [
      ["unknown=value", "unknown"],
      ["page=1&page=2", "page"],
      ["search=alpha&search=beta", "search"],
    ] as const) {
      const response = await listTickets(
        requesters.requesterAId,
        `?${query}`,
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe(
        "INVALID_QUERY",
      );
      expect(response.body.error.fields).toHaveProperty(field);
    }
  });

  it("API-06 returns a safe response for an unexpected database failure", async () => {
    vi.spyOn(
      getPrisma().developmentRequester,
      "findFirst",
    ).mockRejectedValueOnce(
      new Error(
        "Prisma SQL SELECT DATABASE_URL=C:\\private\\secret",
      ),
    );
    vi.spyOn(console, "error").mockImplementation(
      () => undefined,
    );

    const response = await listTickets(
      requesters.requesterAId,
    );

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Please try again.",
      },
    });

    const serialized = JSON.stringify(response.body);
    for (const prohibitedValue of [
      "Prisma",
      "SQL",
      "DATABASE_URL",
      "private",
      "secret",
      REQUESTER_B_NAME,
      REQUESTER_B_EMAIL,
    ]) {
      expect(serialized).not.toContain(prohibitedValue);
    }
  });
});
