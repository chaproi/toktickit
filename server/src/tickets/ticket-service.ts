import { Prisma, type Ticket, type TicketStatus } from "@prisma/client";
import {
  lockCurrentActor,
  runSerializableMutation,
} from "../auth/eligibility-transaction.js";
import { getPrisma } from "../prisma.js";
import { formatTicketNumber } from "./ticket-number.js";
import type { CreateTicketInput } from "./ticket-validation.js";
import { buildTicketListOrderBy } from "./ticket-query.js";
import type { RequesterStatusGroup, RequesterTicketListQuery } from "./requester-ticket-query.js";

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
  owner: {
    select: { id: true, name: true, role: true },
  },
} satisfies Prisma.TicketInclude;

const ticketListSelect = {
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
  itPriority: true,
  currentStatus: true,
  owner: {
    select: { id: true, name: true, role: true },
  },
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
  itPriority: true,
  currentStatus: true,
  owner: {
    select: { id: true, name: true, role: true },
  },
  summary: true,
  description: true,
  requesterResolutionIndicatedAt: true,
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
      kind: "eligibility-conflict";
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
      items: Array<TicketListItem & { resolvedAt?: Date }>;
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
    }
  | {
      kind: "invalid-query";
      fields: Record<string, string>;
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
    await prisma.user.findFirst({
      where: {
        id: requesterId,
        isActive: true,
        role: "REQUESTER",
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
  query: RequesterTicketListQuery,
): Promise<ListTicketsResult> {
  const prisma = getPrisma();
  const requester = await prisma.user.findFirst({
    where: {
      id: requesterId,
      isActive: true,
      role: "REQUESTER",
    },
    select: { id: true },
  });
  if (!requester) return { kind: "invalid-requester" };

  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SET TRANSACTION READ ONLY`;
    const [clock] = await transaction.$queryRaw<Array<{ asOf: Date }>>`SELECT CURRENT_TIMESTAMP AS "asOf"`;

    const statusGroups: Record<RequesterStatusGroup, TicketStatus[]> = {
      active: ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED", "RESOLVED"],
      outstanding: ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"],
      resolved: ["RESOLVED", "CLOSED"],
    };
    const filters: Prisma.TicketWhereInput[] = [];
    if (query.itPriority != null) filters.push({ itPriority: query.itPriority });
    if (query.statusGroup !== undefined) filters.push({ currentStatus: { in: statusGroups[query.statusGroup] } });
    if (query.dashboardWidget === "outstanding") filters.push({ currentStatus: { in: statusGroups.outstanding } });
    if (query.dashboardWidget === "attention") filters.push({ currentStatus: "WAITING_FOR_REQUESTER" });
    if (query.updatedWindow !== undefined) filters.push({ updatedAt: {
      gte: query.updatedWindow.from, lt: query.updatedWindow.before, lte: clock.asOf,
    } });
    const resolvedBounds = query.resolvedWindow === undefined ? undefined : {
      gte: query.resolvedWindow.from, lt: query.resolvedWindow.before, lte: clock.asOf,
    };
    if (resolvedBounds !== undefined) filters.push({
      currentStatus: { in: statusGroups.resolved },
      statusHistory: { some: { toStatus: "RESOLVED", createdAt: resolvedBounds } },
    });

    const where: Prisma.TicketWhereInput = {
      requesterId,
      AND: filters,
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

    // Count parents (distinct Tickets), then paginate within this fresh snapshot.
    const totalItems = await transaction.ticket.count({ where });
    const totalPages = Math.ceil(totalItems / query.pageSize);
    const pagination = {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
      hasPreviousPage:
        totalItems > 0 && query.page > 1,
      hasNextPage:
        totalItems > 0 && query.page < totalPages,
    };
    if (query.page > totalPages) return { kind: "success", items: [], pagination };
    const skip = (query.page - 1) * query.pageSize;
    if (!Number.isSafeInteger(skip) || skip > 2_147_483_647) {
      return { kind: "invalid-query", fields: { page: "The requested page cannot be represented safely." } };
    }
    if (query.sortBy === "resolvedAt") {
      if (resolvedBounds === undefined) throw new Error("Resolution ordering requires validated bounds.");
      const events = await transaction.ticketStatusHistory.groupBy({
        by: ["ticketId"],
        where: { toStatus: "RESOLVED", createdAt: resolvedBounds, ticket: { is: where } },
        _max: { createdAt: true },
        orderBy: [{ _max: { createdAt: query.sortOrder } }, { ticketId: query.sortOrder }],
        skip, take: query.pageSize,
      });
      const tickets = await transaction.ticket.findMany({
        where: { AND: [where, { id: { in: events.map((event) => event.ticketId) } }] },
        select: ticketListSelect, take: query.pageSize,
      });
      const byId = new Map(tickets.map((ticket) => [ticket.id, ticket]));
      const items = events.map((event) => {
        const ticket = byId.get(event.ticketId);
        if (!ticket || event._max.createdAt === null) throw new Error("Incomplete resolution page projection.");
        return { ...ticket, resolvedAt: event._max.createdAt };
      });
      return { kind: "success", items, pagination };
    }
    const tickets = await transaction.ticket.findMany({
      where, select: ticketListSelect,
      orderBy: buildTicketListOrderBy(query.sortBy, query.sortOrder) as Prisma.TicketOrderByWithRelationInput[],
      skip, take: query.pageSize,
    });
    if (resolvedBounds === undefined) return { kind: "success", items: tickets, pagination };
    // A resolved date filter can retain another inherited sort. Project the
    // actual latest qualifying time for only the already bounded page.
    const events = await transaction.ticketStatusHistory.groupBy({
      by: ["ticketId"],
      where: { toStatus: "RESOLVED", createdAt: resolvedBounds,
        ticket: { is: { AND: [where, { id: { in: tickets.map((ticket) => ticket.id) } }] } } },
      _max: { createdAt: true },
    });
    const byId = new Map(events.map((event) => [event.ticketId, event._max.createdAt]));
    const items = tickets.map((ticket) => {
      const resolvedAt = byId.get(ticket.id);
      if (resolvedAt == null) throw new Error("Missing qualifying resolution in page projection.");
      return { ...ticket, resolvedAt };
    });
    return { kind: "success", items, pagination };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
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
  database: Pick<Prisma.TransactionClient, "ticket">,
  requesterId: number,
  clientSubmissionId: string,
): Promise<TicketWithReferences | null> {
  return database.ticket.findUnique({
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

export function buildRequesterTicketCreateData(
  requesterId: number,
  ticketNumber: string,
  input: CreateTicketInput,
): Prisma.TicketUncheckedCreateInput {
  return {
    ticketNumber,
    clientSubmissionId: input.clientSubmissionId,
    requesterId,
    categoryId: input.categoryId,
    relatedSystemId: input.relatedSystemId,
    requestedPriority: input.requestedPriority,
    itPriority: input.requestedPriority,
    currentStatus: "NEW",
    ownerId: null,
    summary: input.summary,
    description: input.description,
  };
}

export async function createTicketForRequester(
  requesterId: number,
  input: CreateTicketInput,
): Promise<CreateTicketResult> {
  const prisma = getPrisma();
  const year = new Date().getUTCFullYear();

  try {
    return await runSerializableMutation(async (transaction) => {
        if (!(await lockCurrentActor(transaction, requesterId, "REQUESTER"))) {
          return { kind: "eligibility-conflict" as const };
        }

        const existing = await findExistingTicket(
          transaction,
          requesterId,
          input.clientSubmissionId,
        );
        if (existing) return replayResult(existing, input);

        const [category, relatedSystem] = await Promise.all([
          transaction.category.findFirst({
            where: { id: input.categoryId, isActive: true },
            select: { id: true },
          }),
          transaction.relatedSystem.findFirst({
            where: { id: input.relatedSystemId, isActive: true },
            select: { id: true },
          }),
        ]);
        const fields: Record<string, string> = {};
        if (!category) fields.categoryId = "Category must identify an active Category.";
        if (!relatedSystem) fields.relatedSystemId = "Related System must identify an active Related System.";
        if (Object.keys(fields).length > 0) {
          return { kind: "invalid-reference" as const, fields };
        }

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

        const ticket = await transaction.ticket.create({
          data: buildRequesterTicketCreateData(
            requesterId,
            formatTicketNumber(year, sequence.lastValue),
            input,
          ),
          include: ticketInclude,
        });
        return { kind: "created" as const, ticket };
      }, undefined, [
        { scope: 1, id: requesterId },
        { scope: 3, id: year },
      ]);
  } catch (error) {
    if (
      error instanceof
        Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const replayed = await findExistingTicket(
        prisma,
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
