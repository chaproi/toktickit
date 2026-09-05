import type { Ticket } from "@prisma/client";
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

const TEST_EMAILS = [
  "issue17-requester-a@example.test",
  "issue17-requester-b@example.test",
  "issue17-requester-empty@example.test",
  "issue17-requester-inactive@example.test",
];

const TEST_CATEGORY_NAMES = [
  "Issue 17 Category Alpha",
  "Issue 17 Category Beta",
];

const TEST_SYSTEM_NAMES = [
  "Issue 17 System Alpha",
  "Issue 17 System Beta",
];

const REQUESTER_A_TICKET_NUMBERS = Array.from(
  { length: 12 },
  (_, index) =>
    `TKT-2042-${String(17_001 + index).padStart(5, "0")}`,
);

const REQUESTER_B_TICKET_NUMBERS = [
  "TKT-2042-18001",
  "TKT-2042-18002",
];

const TEST_TICKET_NUMBERS = [
  ...REQUESTER_A_TICKET_NUMBERS,
  ...REQUESTER_B_TICKET_NUMBERS,
];

type TestReferences = {
  categoryAlphaId: number;
  categoryBetaId: number;
  systemAlphaId: number;
  systemBetaId: number;
};

type TestRequesters = {
  requesterAId: number;
  requesterBId: number;
  emptyRequesterId: number;
  inactiveRequesterId: number;
};

let references: TestReferences;
let requesters: TestRequesters;
let requesterATickets: Ticket[] = [];
let requesterBTickets: Ticket[] = [];

function submissionId(sequence: number): string {
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}

async function cleanIssue17Fixtures(): Promise<void> {
  const prisma = getPrisma();

  const existingRequesters =
    await prisma.developmentRequester.findMany({
      where: {
        email: {
          in: TEST_EMAILS,
        },
      },
      select: {
        id: true,
      },
    });

  const requesterIds = existingRequesters.map(
    ({ id }) => id,
  );

  const existingTickets = await prisma.ticket.findMany({
    where: {
      OR: [
        {
          ticketNumber: {
            in: TEST_TICKET_NUMBERS,
          },
        },
        {
          requesterId: {
            in: requesterIds,
          },
        },
      ],
    },
    select: {
      id: true,
    },
  });

  const ticketIds = existingTickets.map(({ id }) => id);

  if (ticketIds.length > 0) {
    await prisma.attachment.deleteMany({
      where: {
        ticketId: {
          in: ticketIds,
        },
      },
    });
  }

  await prisma.ticket.deleteMany({
    where: {
      id: {
        in: ticketIds,
      },
    },
  });

  await prisma.developmentRequester.deleteMany({
    where: {
      email: {
        in: TEST_EMAILS,
      },
    },
  });

  await prisma.category.deleteMany({
    where: {
      name: {
        in: TEST_CATEGORY_NAMES,
      },
    },
  });

  await prisma.relatedSystem.deleteMany({
    where: {
      name: {
        in: TEST_SYSTEM_NAMES,
      },
    },
  });
}

async function createIssue17Fixtures(): Promise<void> {
  const prisma = getPrisma();

  const [categoryAlpha, categoryBeta] = await Promise.all(
    TEST_CATEGORY_NAMES.map((name) =>
      prisma.category.create({
        data: {
          name,
          isActive: true,
        },
      }),
    ),
  );

  const [systemAlpha, systemBeta] = await Promise.all(
    TEST_SYSTEM_NAMES.map((name) =>
      prisma.relatedSystem.create({
        data: {
          name,
          isActive: true,
        },
      }),
    ),
  );

  references = {
    categoryAlphaId: categoryAlpha.id,
    categoryBetaId: categoryBeta.id,
    systemAlphaId: systemAlpha.id,
    systemBetaId: systemBeta.id,
  };

  const [requesterA, requesterB, emptyRequester, inactiveRequester] =
    await Promise.all([
      getPrisma().developmentRequester.create({
        data: {
          name: "Issue 17 Requester A",
          email: TEST_EMAILS[0],
          isActive: true,
        },
      }),
      getPrisma().developmentRequester.create({
        data: {
          name: "Issue 17 Requester B",
          email: TEST_EMAILS[1],
          isActive: true,
        },
      }),
      getPrisma().developmentRequester.create({
        data: {
          name: "Issue 17 Empty Requester",
          email: TEST_EMAILS[2],
          isActive: true,
        },
      }),
      getPrisma().developmentRequester.create({
        data: {
          name: "Issue 17 Inactive Requester",
          email: TEST_EMAILS[3],
          isActive: false,
        },
      }),
    ]);

  requesters = {
    requesterAId: requesterA.id,
    requesterBId: requesterB.id,
    emptyRequesterId: emptyRequester.id,
    inactiveRequesterId: inactiveRequester.id,
  };

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

  const summaries = [
    "Battery Sentinel Alpha",
    "Printer Queue Bravo",
    "Network Search Needle",
    "Email Search Needle",
    "Gamma Monitor",
    "Delta Monitor",
    "Epsilon Monitor",
    "Zeta Monitor",
    "Eta Monitor",
    "Theta Monitor",
    "Iota Monitor",
    "Kappa Monitor",
  ];

  const requesterASeeds = REQUESTER_A_TICKET_NUMBERS.map(
    (ticketNumber, index) => {
      const ticketDate = new Date(
        Date.UTC(2042, 0, 1, index + 1),
      );
      const updatedHour =
        index < 2 ? 20 : 19 - Math.floor(index / 2);

      return {
        ticketNumber,
        ticketDate,
        clientSubmissionId: submissionId(index + 1),
        requesterId: requesters.requesterAId,
        categoryId:
          index % 2 === 0
            ? references.categoryAlphaId
            : references.categoryBetaId,
        relatedSystemId:
          index % 3 === 0
            ? references.systemAlphaId
            : references.systemBetaId,
        summary: summaries[index],
        requestedPriority:
          priorities[index % priorities.length],
        description:
          "Deterministic Issue 17 Requester A test Ticket.",
        currentStatus: statuses[index % statuses.length],
        createdAt: ticketDate,
        updatedAt: new Date(
          Date.UTC(2042, 0, 2, updatedHour),
        ),
      };
    },
  );

  const requesterBSeeds = REQUESTER_B_TICKET_NUMBERS.map(
    (ticketNumber, index) => {
      const ticketDate = new Date(
        Date.UTC(2042, 1, 1, index + 1),
      );

      return {
        ticketNumber,
        ticketDate,
        clientSubmissionId: submissionId(101 + index),
        requesterId: requesters.requesterBId,
        categoryId: references.categoryBetaId,
        relatedSystemId: references.systemBetaId,
        summary: `Requester B Ticket ${index + 1}`,
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

  [requesterATickets, requesterBTickets] =
    await Promise.all([
      prisma.ticket.findMany({
        where: {
          requesterId: requesters.requesterAId,
        },
      }),
      prisma.ticket.findMany({
        where: {
          requesterId: requesters.requesterBId,
        },
      }),
    ]);
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
  await cleanIssue17Fixtures();
  await createIssue17Fixtures();
}, 30_000);

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await cleanIssue17Fixtures();
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
      "?pageSize=50",
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
    expect(serialized).not.toContain(TEST_EMAILS[1]);
    expect(serialized).not.toContain("Issue 17 Requester B");
    expect(serialized).not.toContain(
      REQUESTER_B_TICKET_NUMBERS[0],
    );
  });

  it("API-05 changes the returned list when the Requester changes", async () => {
    const requesterAResponse = await listTickets(
      requesters.requesterAId,
      "?pageSize=50",
    );
    const requesterBResponse = await listTickets(
      requesters.requesterBId,
      "?pageSize=50",
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
      expect.arrayContaining(REQUESTER_B_TICKET_NUMBERS),
    );
    expect(
      requesterBResponse.body.items.map(
        ({ ticketNumber }: { ticketNumber: string }) =>
          ticketNumber,
      ),
    ).not.toEqual(
      expect.arrayContaining(REQUESTER_A_TICKET_NUMBERS),
    );
  });
});

describe("GET /api/tickets list behavior", () => {
  it("API-06 searches case-insensitively by official Ticket Number", async () => {
    const response = await listTickets(
      requesters.requesterAId,
      "?search=%20%20tkt-2042-17003%20%20&pageSize=50",
    );

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].ticketNumber).toBe(
      "TKT-2042-17003",
    );
  });

  it("API-06 searches case-insensitively by Ticket Summary", async () => {
    const response = await listTickets(
      requesters.requesterAId,
      "?search=sEaRcH%20nEeDlE&pageSize=50",
    );

    expect(response.status).toBe(200);
    expect(
      response.body.items.map(
        ({ summary }: { summary: string }) => summary,
      ),
    ).toEqual([
      "Network Search Needle",
      "Email Search Needle",
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
        `?${query}&pageSize=50`,
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
      `?categoryId=${references.categoryAlphaId}&relatedSystemId=${references.systemBetaId}&requestedPriority=HIGH&currentStatus=IN_PROGRESS&pageSize=50`,
    );

    expect(combined.status).toBe(200);
    expect(combined.body.items).toHaveLength(1);
    expect(combined.body.items[0].ticketNumber).toBe(
      "TKT-2042-17003",
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
          `?sortBy=${sortBy}&sortOrder=${sortOrder}&pageSize=50`,
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
        `?sortBy=requestedPriority&sortOrder=${sortOrder}&pageSize=50`,
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
      "?page=1&pageSize=10",
    );
    const secondPage = await listTickets(
      requesters.requesterAId,
      "?page=2&pageSize=10",
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
        `?page=1&pageSize=${pageSize}`,
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
      "?page=99&pageSize=10",
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
      requesters.emptyRequesterId,
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
      "categoryId=2147483647",
      "relatedSystemId=2147483647",
    ]) {
      const response = await listTickets(
        requesters.requesterAId,
        `?${query}`,
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
      "Issue 17 Requester B",
      TEST_EMAILS[1],
    ]) {
      expect(serialized).not.toContain(prohibitedValue);
    }
  });
});
