import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import request, { type Response } from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../../src/app.js";
import { setAttachmentStorageForTests } from "../../src/attachments/attachment-storage.js";
import { getPrisma } from "../../src/prisma.js";
import {
  authenticatedFixture,
  authenticatedUnsafe,
  cleanupIssue29Fixtures,
  createTicketFixture,
  referenceIds,
  type AuthenticatedFixture,
} from "./issue29-test-helpers.js";

type MutationKind = "ticket" | "comment" | "resolution" | "upload" | "remove";

type MutationScenario = {
  actor: AuthenticatedFixture;
  mutate: () => Promise<Response>;
  assertCommitted?: () => Promise<void>;
  assertRolledBack: (expectedAttempts: number) => Promise<void>;
};

type InteractiveOperation = (
  transaction: Prisma.TransactionClient,
) => Promise<unknown>;

function prismaRawFailure(sqlState: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Synthetic database failure.", {
    code: "P2010",
    clientVersion: Prisma.prismaVersion.client,
    meta: { code: sqlState, message: "Redacted database error." },
  });
}

function ambiguousP2034(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    "Synthetic ambiguous transaction failure containing 40001 only in its message.",
    {
      code: "P2034",
      clientVersion: Prisma.prismaVersion.client,
    },
  );
}

function injectPostOperationFailures(
  failures: Array<unknown | null>,
): () => number {
  const prisma = getPrisma();
  const originalTransaction = prisma.$transaction.bind(prisma) as (
    operation: InteractiveOperation,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ) => Promise<unknown>;
  let attempts = 0;

  vi.spyOn(prisma, "$transaction").mockImplementation((async (
    operation: unknown,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ) => {
    if (typeof operation !== "function") {
      throw new Error("This focused injector supports interactive transactions only.");
    }
    const attempt = attempts;
    attempts += 1;
    return originalTransaction(async (transaction) => {
      const result = await (operation as InteractiveOperation)(transaction);
      const failure = failures[attempt];
      if (failure) throw failure;
      return result;
    }, options);
  }) as typeof prisma.$transaction);

  return () => attempts;
}

async function createMutationScenario(kind: MutationKind): Promise<MutationScenario> {
  const prisma = getPrisma();
  if (kind === "ticket") {
    const actor = await authenticatedFixture({ label: "serialization-ticket" });
    const references = await referenceIds();
    const clientSubmissionId = randomUUID();
    return {
      actor,
      mutate: () => authenticatedUnsafe(request(app).post("/api/tickets"), actor).send({
        clientSubmissionId,
        ...references,
        requestedPriority: "HIGH",
        summary: "Serialization retry Ticket",
        description: "Every failed transaction must roll back completely.",
      }),
      assertCommitted: async () => {
        expect(await prisma.ticket.count({
          where: { requesterId: actor.user.id, clientSubmissionId },
        })).toBe(1);
      },
      assertRolledBack: async () => {
        expect(await prisma.ticket.count({
          where: { requesterId: actor.user.id, clientSubmissionId },
        })).toBe(0);
      },
    };
  }

  const actor = await authenticatedFixture({ label: `serialization-${kind}` });
  const ticket = await createTicketFixture(actor.user.id, "OPEN");

  if (kind === "comment") {
    const content = `Serialization Comment ${randomUUID()}`;
    return {
      actor,
      mutate: () => authenticatedUnsafe(
        request(app).post(`/api/tickets/${ticket.id}/comments`),
        actor,
      ).send({ content }),
      assertRolledBack: async () => {
        expect(await prisma.publicComment.count({
          where: { ticketId: ticket.id, content },
        })).toBe(0);
        expect(await prisma.ticketStatusHistory.count({ where: { ticketId: ticket.id } })).toBe(0);
      },
    };
  }

  if (kind === "resolution") {
    return {
      actor,
      mutate: () => authenticatedUnsafe(
        request(app).post(`/api/tickets/${ticket.id}/resolution-indication`),
        actor,
      ).send({ confirm: true }),
      assertRolledBack: async () => {
        const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
        expect(stored.requesterResolutionIndicatedAt).toBeNull();
        expect(stored.requesterResolutionIndicatedById).toBeNull();
        expect(stored.currentStatus).toBe("OPEN");
        expect(await prisma.ticketStatusHistory.count({ where: { ticketId: ticket.id } })).toBe(0);
      },
    };
  }

  const storedKeys: string[] = [];
  const removedKeys: string[] = [];
  const liveKeys = new Set<string>();
  setAttachmentStorageForTests({
    async store(input) {
      storedKeys.push(input.storageKey);
      liveKeys.add(input.storageKey);
    },
    async remove(storageKey) {
      removedKeys.push(storageKey);
      liveKeys.delete(storageKey);
    },
    async read() {
      return Buffer.from("synthetic");
    },
  });

  if (kind === "upload") {
    const filename = `serialization-upload-${randomUUID()}.png`;
    return {
      actor,
      mutate: () => authenticatedUnsafe(
        request(app).post(`/api/tickets/${ticket.id}/attachments`),
        actor,
      ).attach(
        "file",
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nFQAAAAASUVORK5CYII=",
          "base64",
        ),
        { filename, contentType: "image/png" },
      ),
      assertRolledBack: async (expectedAttempts) => {
        expect(await prisma.attachment.count({
          where: { ticketId: ticket.id, originalFilename: filename },
        })).toBe(0);
        expect(storedKeys).toHaveLength(expectedAttempts);
        expect(removedKeys).toEqual(storedKeys);
        expect(liveKeys.size).toBe(0);
        expect(await prisma.ticketStatusHistory.count({ where: { ticketId: ticket.id } })).toBe(0);
      },
    };
  }

  const attachment = await prisma.attachment.create({
    data: {
      ticketId: ticket.id,
      originalFilename: "serialization-removal.txt",
      storageKey: `serialization-removal-${randomUUID()}`,
      mimeType: "text/plain",
      sizeBytes: 9,
      uploadedByUserId: actor.user.id,
    },
  });
  return {
    actor,
    mutate: () => authenticatedUnsafe(
      request(app).delete(`/api/tickets/${ticket.id}/attachments/${attachment.id}`),
      actor,
    ).send({ removalReason: "Serialization rollback verification." }),
    assertRolledBack: async () => {
      const stored = await prisma.attachment.findUniqueOrThrow({ where: { id: attachment.id } });
      expect(stored.isRemoved).toBe(false);
      expect(stored.removedAt).toBeNull();
      expect(stored.removedByUserId).toBeNull();
      expect(removedKeys).toHaveLength(0);
      expect(liveKeys.size).toBe(0);
      expect(await prisma.ticketStatusHistory.count({ where: { ticketId: ticket.id } })).toBe(0);
    },
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  setAttachmentStorageForTests(null);
  await cleanupIssue29Fixtures();
});

describe("Issue 29 confirmed serialization retry boundary", () => {
  it("retries the observed Prisma P2010 meta.code 40001 shape once, then commits", async () => {
    const scenario = await createMutationScenario("ticket");
    const attempts = injectPostOperationFailures([prismaRawFailure("40001"), null]);

    const response = await scenario.mutate();

    expect(response.status).toBe(201);
    expect(attempts()).toBe(2);
    await scenario.assertCommitted?.();
  });

  it.each([
    ["deadlock 40P01", () => prismaRawFailure("40P01")],
    ["ambiguous P2034", () => ambiguousP2034()],
    ["unrelated constraint SQLSTATE", () => prismaRawFailure("23505")],
  ])("does not retry %s and rolls back the attempted mutation", async (_label, failure) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const scenario = await createMutationScenario("ticket");
    const attempts = injectPostOperationFailures([failure()]);

    const response = await scenario.mutate();

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." },
    });
    expect(attempts()).toBe(1);
    await scenario.assertRolledBack(1);
  });

  it.each<MutationKind>([
    "ticket",
    "comment",
    "resolution",
    "upload",
    "remove",
  ])("maps exhausted confirmed 40001 retries for %s to a safe 409 with no partial effects", async (kind) => {
    const scenario = await createMutationScenario(kind);
    const attempts = injectPostOperationFailures([
      prismaRawFailure("40001"),
      prismaRawFailure("40001"),
      prismaRawFailure("40001"),
    ]);

    const response = await scenario.mutate();

    expect(attempts()).toBe(3);
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: "CONCURRENT_UPDATE",
        message: "Your account eligibility changed. Reload and try again.",
      },
    });
    await scenario.assertRolledBack(3);
  });
});
