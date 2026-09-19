import { Prisma, type UserRole } from "@prisma/client";
import {
  lockCurrentActor,
  runSerializableMutation,
} from "../auth/eligibility-transaction.js";
import { getPrisma } from "../prisma.js";
import type { CommentPageQuery } from "./comment-query.js";

const commentSelect = {
  id: true,
  ticketId: true,
  author: { select: { id: true, name: true, role: true } },
  content: true,
  createdAt: true,
} satisfies Prisma.PublicCommentSelect;

export function validateCommentBody(body: unknown):
  | { success: true; content: string }
  | { success: false; fields: Record<string, string> } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { success: false, fields: { body: "A JSON object is required." } };
  }
  const input = body as Record<string, unknown>;
  const fields: Record<string, string> = {};
  if (Object.keys(input).some((key) => key !== "content")) {
    fields.body = "Unknown fields are not permitted.";
  }
  const content = typeof input.content === "string" ? input.content.trim() : "";
  if (content.length < 1 || content.length > 2_000) {
    fields.content = "Comment must contain between 1 and 2000 characters.";
  }
  return Object.keys(fields).length > 0
    ? { success: false, fields }
    : { success: true, content };
}

function visibleTicketWhere(userId: number, role: UserRole): Prisma.TicketWhereInput {
  return {
    ...(role === "REQUESTER" ? { requesterId: userId } : {}),
  };
}

export async function listPublicComments(
  userId: number,
  role: UserRole,
  ticketId: number,
  query: CommentPageQuery,
) {
  const prisma = getPrisma();
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, ...visibleTicketWhere(userId, role) },
    select: { id: true },
  });
  if (!ticket) return { kind: "not-found" as const };
  const where = { ticketId };
  const [totalItems, items] = await prisma.$transaction([
    prisma.publicComment.count({ where }),
    prisma.publicComment.findMany({
      where,
      select: commentSelect,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize);
  return {
    kind: "success" as const,
    items,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
      hasPreviousPage: totalItems > 0 && query.page > 1,
      hasNextPage: totalItems > 0 && query.page < totalPages,
    },
  };
}

export async function addPublicComment(
  userId: number,
  role: UserRole,
  ticketId: number,
  content: string,
) {
  return runSerializableMutation(async (transaction) => {
    if (!(await lockCurrentActor(transaction, userId, role))) {
      return { kind: "eligibility-conflict" as const };
    }
    const tickets = await transaction.$queryRaw<Array<{ id: number }>>`
      SELECT "id"
      FROM "Ticket"
      WHERE "id" = ${ticketId}
        AND (${role}::"UserRole" <> 'REQUESTER'::"UserRole" OR "requesterId" = ${userId})
      FOR UPDATE
    `;
    if (tickets.length === 0) return { kind: "not-found" as const };
    const comment = await transaction.publicComment.create({
      data: { ticketId, authorId: userId, content },
      select: commentSelect,
    });
    return { kind: "created" as const, comment };
  }, undefined, [
    { scope: 1, id: userId },
    { scope: 2, id: ticketId },
  ]);
}
