import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
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
import {
  setAttachmentStorageForTests,
  StorageUnavailableError,
  type AttachmentStorage,
} from "../../src/attachments/attachment-storage.js";
import { getPrisma } from "../../src/prisma.js";

const PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nFQAAAAASUVORK5CYII=",
  "base64",
);

let requesterId: number;
let ticketId: number;

async function getReferenceId(
  endpoint: string,
  name: string,
): Promise<number> {
  const response = await request(app).get(endpoint);
  expect(response.status).toBe(200);

  const item = (
    response.body as Array<{ id: number; name: string }>
  ).find((candidate) => candidate.name === name);
  expect(item).toBeDefined();
  return item!.id;
}

async function createFixture(): Promise<void> {
  const [selectedRequesterId, categoryId, relatedSystemId] =
    await Promise.all([
      getReferenceId(
        "/api/development-requesters",
        "Alex Morgan",
      ),
      getReferenceId("/api/categories", "Hardware"),
      getReferenceId(
        "/api/related-systems",
        "Corporate Laptop",
      ),
    ]);

  const response = await request(app)
    .post("/api/tickets")
    .set(
      "X-Development-Requester-Id",
      String(selectedRequesterId),
    )
    .send({
      clientSubmissionId: randomUUID(),
      categoryId,
      relatedSystemId,
      requestedPriority: "MEDIUM",
      summary: `Issue19-Errors-${randomUUID()} storage failure`,
      description:
        "This isolated Ticket exercises safe Issue #19 errors.",
    });

  expect(response.status).toBe(201);
  requesterId = selectedRequesterId;
  ticketId = response.body.ticket.id;
}

async function cleanFixture(): Promise<void> {
  if (!ticketId) {
    return;
  }

  await getPrisma().attachment.deleteMany({
    where: { ticketId },
  });
  await getPrisma().ticket.delete({
    where: { id: ticketId },
  });
}

beforeAll(createFixture, 30_000);

afterEach(() => {
  setAttachmentStorageForTests(null);
  vi.restoreAllMocks();
});

afterAll(cleanFixture, 30_000);

describe("Issue #19 safe API failures", () => {
  it("API-10 returns a safe response when Attachment storage is unavailable", async () => {
    const failingStorage: AttachmentStorage = {
      async store() {
        throw new StorageUnavailableError();
      },
      async remove() {
        return;
      },
    };
    setAttachmentStorageForTests(failingStorage);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .set(
        "X-Development-Requester-Id",
        String(requesterId),
      )
      .attach("file", PNG_BUFFER, {
        filename: "evidence.png",
        contentType: "image/png",
      });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: {
        code: "STORAGE_UNAVAILABLE",
        message:
          "Attachment storage is temporarily unavailable. Please try again.",
      },
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /SeaweedFS|127\.0\.0\.1|bucket|secret|stack|path/i,
    );
  });

  it("API-10 hides internal details when Attachment metadata retrieval fails", async () => {
    vi.spyOn(
      getPrisma().attachment,
      "findMany",
    ).mockRejectedValueOnce(
      new Error(
        "Prisma SQL SEAWEEDFS_SECRET_KEY=C:\\private\\attachment",
      ),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await request(app)
      .get(`/api/tickets/${ticketId}/attachments`)
      .set(
        "X-Development-Requester-Id",
        String(requesterId),
      );

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Please try again.",
      },
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /Prisma|SQL|SEAWEEDFS|private|secret|stack/i,
    );
  });

  it("API-10 returns safe responses for unexpected and unavailable Ticket Detail database failures", async () => {
    const unavailableError = new Prisma.PrismaClientInitializationError(
      "Cannot reach the private Ticket database.",
      Prisma.prismaVersion.client,
      "P1001",
    );
    vi.spyOn(getPrisma().ticket, "findFirst")
      .mockRejectedValueOnce(
        new Error(
          "Prisma SQL DATABASE_URL=C:\\private\\ticket-detail-secret",
        ),
      )
      .mockRejectedValueOnce(unavailableError);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const internalResponse = await request(app)
      .get(`/api/tickets/${ticketId}`)
      .set(
        "X-Development-Requester-Id",
        String(requesterId),
      );
    expect(internalResponse.status).toBe(500);
    expect(internalResponse.body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Please try again.",
      },
    });
    expect(JSON.stringify(internalResponse.body)).not.toMatch(
      /Prisma|SQL|DATABASE_URL|private|secret|stack/i,
    );

    const unavailableResponse = await request(app)
      .get(`/api/tickets/${ticketId}`)
      .set(
        "X-Development-Requester-Id",
        String(requesterId),
      );
    expect(unavailableResponse.status).toBe(503);
    expect(unavailableResponse.body).toEqual({
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Service is temporarily unavailable. Please try again.",
      },
    });
    expect(JSON.stringify(unavailableResponse.body)).not.toContain(
      "private Ticket database",
    );
  });
});
