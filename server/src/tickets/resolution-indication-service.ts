import type { TicketStatus } from "@prisma/client";
import { getPrisma } from "../prisma.js";

const ELIGIBLE = new Set<TicketStatus>([
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "REOPENED",
]);

type LockedTicket = {
  id: number;
  currentStatus: TicketStatus;
  requesterResolutionIndicatedAt: Date | null;
};

export async function indicateRequesterResolution(
  requesterId: number,
  ticketId: number,
) {
  return getPrisma().$transaction(async (transaction) => {
    const [ticket] = await transaction.$queryRaw<LockedTicket[]>`
      SELECT "id", "currentStatus", "requesterResolutionIndicatedAt"
      FROM "Ticket"
      WHERE "id" = ${ticketId} AND "requesterId" = ${requesterId}
      FOR UPDATE
    `;
    if (!ticket) return { kind: "not-found" as const };
    if (ticket.requesterResolutionIndicatedAt) {
      return {
        kind: "success" as const,
        ticketId,
        currentStatus: ticket.currentStatus,
        requesterResolutionIndicatedAt: ticket.requesterResolutionIndicatedAt,
      };
    }
    if (!ELIGIBLE.has(ticket.currentStatus)) {
      return { kind: "not-allowed" as const };
    }
    const now = new Date();
    const updated = await transaction.ticket.update({
      where: { id: ticketId },
      data: {
        requesterResolutionIndicatedAt: now,
        requesterResolutionIndicatedById: requesterId,
      },
      select: {
        id: true,
        currentStatus: true,
        requesterResolutionIndicatedAt: true,
      },
    });
    return {
      kind: "success" as const,
      ticketId: updated.id,
      currentStatus: updated.currentStatus,
      requesterResolutionIndicatedAt: updated.requesterResolutionIndicatedAt!,
    };
  });
}
