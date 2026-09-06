import { Prisma, type Ticket } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { formatTicketNumber } from "./ticket-number.js";
import type { CreateTicketInput } from "./ticket-validation.js";
import {
  buildTicketListOrderBy,
  type TicketListQuery,
} from "./ticket-query.js";

const ticketInclude = {
  requester: {
    select: { id: true, name: true },
  },
  category: {
    select: { id: true, name: true },
  },
  relatedSystem: {
    select: { id: true, name: true },
  },
} satisfies Prisma.TicketInclude;

const ticketListSelect = {
  id: true,
  ticketNumber: true,
  ticketDate: true,
  category: {
    select: { id: true, name: true },
  },
  relatedSystem: {
    select: { id: true, name: true },
  },
  requestedPriority: true,
  currentStatus: true,
  summary: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TicketSelect;

const ticketDetailSelect = {
  id: true,
  ticketNumber: true,
  ticketDate: true,
  requester: {
    select: { id: true, name: true },
  },
  category: {
    select: { id: true, name: true },
  },
  relatedSystem: {
    select: { id: true, name: true },
  },
  requestedPriority: true,
  currentStatus: true,
  summary: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TicketSelect;

export type TicketWithReferences =
  Prisma.TicketGetPayload<{
    include: typeof ticketInclude;
  }>;

export type CreateTicketResult =
  | {
      kind: "created";
      ticket: TicketWithReferences;
    }
  | {
      kind: "replayed";
      ticket: TicketWithReferences;
    }
  | {
      kind: "invalid-requester";
    }
  | {
      kind: "invalid-reference";
      fields: Record<string, string>;
    }
  | {
      kind: "idempotency-conflict";
    };

export type TicketListItem = Prisma.TicketGetPayload<{
  select: typeof ticketListSelect;
}>;

export type ListTicketsResult =
  | {
      kind: "success";
      items: TicketListItem[];
      pagination: {
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
        hasPreviousPage: boolean;
        hasNextPage: boolean;
      };
    }
  | {
      kind: "invalid-requester";
    };

export type GetTicketDetailResult =
  | {
      kind: "success";
      ticket: Prisma.TicketGetPayload<{
        select: typeof ticketDetailSelect;
      }>;
    }
  | {
      kind: "invalid-requester";
    }
  | {
      kind: "not-found";
    };

export async function getTicketDetailForRequester(
  requesterId: number,
  ticketId: number,
): Promise<GetTicketDetailResult> {
  const prisma = getPrisma();
  const requester =
    await prisma.developmentRequester.findFirst({
      where: {
        id: requesterId,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

  if (!requester) {
    return {
      kind: "invalid-requester",
    };
  }

  const ticket = await prisma.ticket.findFirst({
    where: {
      id: ticketId,
      requesterId,
    },
    select: ticketDetailSelect,
  });

  if (!ticket) {
    return {
      kind: "not-found",
    };
  }

  return {
    kind: "success",
    ticket,
  };
}

export async function listTicketsForRequester(
  requesterId: number,
  query: TicketListQuery,
): Promise<ListTicketsResult> {
  const prisma = getPrisma();

  const requester =
    await prisma.developmentRequester.findFirst({
      where: {
        id: requesterId,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

  if (!requester) {
    return {
      kind: "invalid-requester",
    };
  }

  const where: Prisma.TicketWhereInput = {
    requesterId,
    ...(query.categoryId === null
      ? {}
      : { categoryId: query.categoryId }),
    ...(query.relatedSystemId === null
      ? {}
      : { relatedSystemId: query.relatedSystemId }),
    ...(query.requestedPriority === null
      ? {}
      : { requestedPriority: query.requestedPriority }),
    ...(query.currentStatus === null
      ? {}
      : { currentStatus: query.currentStatus }),
    ...(query.search === ""
      ? {}
      : {
          OR: [
            {
              ticketNumber: {
                contains: query.search,
                mode: "insensitive" as const,
              },
            },
            {
              summary: {
                contains: query.search,
                mode: "insensitive" as const,
              },
            },
          ],
        }),
  };

  const [totalItems, items] = await prisma.$transaction([
    prisma.ticket.count({ where }),
    prisma.ticket.findMany({
      where,
      select: ticketListSelect,
      orderBy:
        buildTicketListOrderBy(
          query.sortBy,
          query.sortOrder,
        ) as Prisma.TicketOrderByWithRelationInput[],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  const totalPages =
    totalItems === 0
      ? 0
      : Math.ceil(totalItems / query.pageSize);

  return {
    kind: "success",
    items,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
      hasPreviousPage:
        totalItems > 0 && query.page > 1,
      hasNextPage:
        totalItems > 0 && query.page < totalPages,
    },
  };
}

function payloadMatches(
  ticket: Ticket,
  input: CreateTicketInput,
): boolean {
  return (
    ticket.categoryId === input.categoryId &&
    ticket.relatedSystemId === input.relatedSystemId &&
    ticket.requestedPriority ===
      input.requestedPriority &&
    ticket.summary === input.summary &&
    ticket.description === input.description
  );
}

async function findExistingTicket(
  requesterId: number,
  clientSubmissionId: string,
): Promise<TicketWithReferences | null> {
  return getPrisma().ticket.findUnique({
    where: {
      requesterId_clientSubmissionId: {
        requesterId,
        clientSubmissionId,
      },
    },
    include: ticketInclude,
  });
}

function replayResult(
  ticket: TicketWithReferences,
  input: CreateTicketInput,
): CreateTicketResult {
  if (payloadMatches(ticket, input)) {
    return {
      kind: "replayed",
      ticket,
    };
  }

  return {
    kind: "idempotency-conflict",
  };
}

export async function createTicketForRequester(
  requesterId: number,
  input: CreateTicketInput,
): Promise<CreateTicketResult> {
  const prisma = getPrisma();

  const requester =
    await prisma.developmentRequester.findFirst({
      where: {
        id: requesterId,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

  if (!requester) {
    return {
      kind: "invalid-requester",
    };
  }

  const existing = await findExistingTicket(
    requesterId,
    input.clientSubmissionId,
  );

  if (existing) {
    return replayResult(existing, input);
  }

  const [category, relatedSystem] = await Promise.all([
    prisma.category.findFirst({
      where: {
        id: input.categoryId,
        isActive: true,
      },
      select: {
        id: true,
      },
    }),
    prisma.relatedSystem.findFirst({
      where: {
        id: input.relatedSystemId,
        isActive: true,
      },
      select: {
        id: true,
      },
    }),
  ]);

  const fields: Record<string, string> = {};

  if (!category) {
    fields.categoryId =
      "Category must identify an active Category.";
  }

  if (!relatedSystem) {
    fields.relatedSystemId =
      "Related System must identify an active Related System.";
  }

  if (Object.keys(fields).length > 0) {
    return {
      kind: "invalid-reference",
      fields,
    };
  }

  try {
    const ticket = await prisma.$transaction(
      async (transaction) => {
        const year = new Date().getUTCFullYear();

        const sequence =
          await transaction.ticketNumberSequence.upsert({
            where: {
              year,
            },
            create: {
              year,
              lastValue: 1,
            },
            update: {
              lastValue: {
                increment: 1,
              },
            },
          });

        return transaction.ticket.create({
          data: {
            ticketNumber: formatTicketNumber(
              year,
              sequence.lastValue,
            ),
            clientSubmissionId:
              input.clientSubmissionId,
            requesterId,
            categoryId: input.categoryId,
            relatedSystemId: input.relatedSystemId,
            requestedPriority:
              input.requestedPriority,
            summary: input.summary,
            description: input.description,
          },
          include: ticketInclude,
        });
      },
    );

    return {
      kind: "created",
      ticket,
    };
  } catch (error) {
    if (
      error instanceof
        Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const replayed = await findExistingTicket(
        requesterId,
        input.clientSubmissionId,
      );

      if (replayed) {
        return replayResult(replayed, input);
      }
    }

    throw error;
  }
}
