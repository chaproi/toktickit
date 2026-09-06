import { getPrisma } from "../server/src/prisma.js";

const FIXTURE_DESCRIPTIONS = [
  "Deterministic end-to-end Ticket data for final Lab 2 verification.",
  "This Ticket was created through the complete real-browser requester workflow.",
];

export default async function globalTeardown(): Promise<void> {
  const runMarker = process.env.TOKTICKIT_E2E_RUN_MARKER;

  if (!runMarker?.startsWith("Issue21-")) {
    throw new Error("Refusing E2E cleanup without a valid Issue 21 run marker.");
  }

  const prisma = getPrisma();

  try {
    const tickets = await prisma.ticket.findMany({
      where: {
        summary: { startsWith: runMarker },
        description: { in: FIXTURE_DESCRIPTIONS },
      },
      select: { id: true },
    });
    const ticketIds = tickets.map((ticket) => ticket.id);

    if (ticketIds.length > 0) {
      await prisma.$transaction([
        prisma.attachment.deleteMany({
          where: { ticketId: { in: ticketIds } },
        }),
        prisma.ticket.deleteMany({
          where: { id: { in: ticketIds } },
        }),
      ]);
    }
  } finally {
    await prisma.$disconnect();
  }
}
