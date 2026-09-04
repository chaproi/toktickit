import { randomUUID } from "node:crypto";
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getPrisma } from "../../src/prisma.js";
import request from "supertest";
import { app } from "../../src/app.js";

type ReferenceItem = {
  id: number;
  name: string;
};

async function getReferenceId(
  endpoint: string,
  name: string,
): Promise<number> {
  const response = await request(app).get(endpoint);

  expect(response.status).toBe(200);

  const item = (response.body as ReferenceItem[]).find(
    (candidate) => candidate.name === name,
  );

  expect(item).toBeDefined();
  return item!.id;
}

describe("POST /api/tickets", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("API-02 creates one valid Requester-owned Ticket", async () => {
        const [requesterId, categoryId, relatedSystemId] =
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
            String(requesterId),
        )
        .send({
            clientSubmissionId: randomUUID(),
            categoryId,
            relatedSystemId,
            requestedPriority: "MEDIUM",
            summary: "Laptop battery drains quickly",
            description:
            "The battery decreases from full to empty in approximately one hour.",
        });

        expect(response.status).toBe(201);
        expect(response.body.replayed).toBe(false);

        expect(response.body.ticket).toMatchObject({
        requester: {
            id: requesterId,
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
        requestedPriority: "MEDIUM",
        currentStatus: "NEW",
        summary: "Laptop battery drains quickly",
        });

        expect(response.body.ticket.ticketNumber).toMatch(
        /^TKT-\d{4}-\d{5}$/,
        );
        expect(response.body.ticket.ticketDate).toBeTruthy();
        expect(response.body.ticket.createdAt).toBeTruthy();
        expect(response.body.ticket.updatedAt).toBeTruthy();
    });
    it("API-03 rejects a missing Requester header", async () => {
    const response = await request(app)
        .post("/api/tickets")
        .send({
        clientSubmissionId: randomUUID(),
        categoryId: 1,
        relatedSystemId: 1,
        requestedPriority: "MEDIUM",
        summary: "Laptop battery drains quickly",
        description:
            "The battery decreases from full to empty quickly.",
        });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
        error: {
        code: "REQUESTER_REQUIRED",
        message:
            "A valid Development Requester is required.",
        },
    });
    });

    it("API-03 rejects invalid and unknown fields", async () => {
    const requesterId = await getReferenceId(
        "/api/development-requesters",
        "Alex Morgan",
    );

    const response = await request(app)
        .post("/api/tickets")
        .set(
        "X-Development-Requester-Id",
        String(requesterId),
        )
        .send({
        clientSubmissionId: "not-a-uuid",
        categoryId: 0,
        relatedSystemId: "invalid",
        requestedPriority: "CRITICAL",
        summary: " ",
        description: "short",
        requesterId: 999,
        });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(
        "VALIDATION_ERROR",
    );

    expect(response.body.error.fields).toMatchObject({
        clientSubmissionId:
        "Submission identifier must be a valid UUID.",
        categoryId:
        "Category must be a positive integer.",
        relatedSystemId:
        "Related System must be a positive integer.",
        requestedPriority:
        "Priority must be LOW, MEDIUM, HIGH, or URGENT.",
        summary:
        "Summary must contain 5 to 150 characters.",
        description:
        "Description must contain 10 to 5000 characters.",
        body: "Unknown fields are not allowed: requesterId.",
    });
    });

    it("API-03 rejects inactive and nonexistent Requesters", async () => {
    const inactiveRequester =
        await getPrisma().developmentRequester.findUnique({
        where: {
            email: "emily.carter@example.com",
        },
        select: {
            id: true,
        },
        });

    expect(inactiveRequester).not.toBeNull();

    for (const requesterId of [
        inactiveRequester!.id,
        999999,
    ]) {
        const response = await request(app)
        .post("/api/tickets")
        .set(
            "X-Development-Requester-Id",
            String(requesterId),
        )
        .send({
            clientSubmissionId: randomUUID(),
            categoryId: 1,
            relatedSystemId: 1,
            requestedPriority: "LOW",
            summary: "Unable to access the application",
            description:
            "The application displays an access error.",
        });

        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe(
        "INVALID_REQUESTER",
        );
    }
    });

    it("API-03 rejects inactive or nonexistent references", async () => {
    const requesterId = await getReferenceId(
        "/api/development-requesters",
        "Alex Morgan",
    );

    const response = await request(app)
        .post("/api/tickets")
        .set(
        "X-Development-Requester-Id",
        String(requesterId),
        )
        .send({
        clientSubmissionId: randomUUID(),
        categoryId: 999999,
        relatedSystemId: 999999,
        requestedPriority: "HIGH",
        summary: "Unable to print the document",
        description:
            "The selected printer does not respond.",
        });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(
        "VALIDATION_ERROR",
    );

    expect(response.body.error.fields).toEqual({
        categoryId:
        "Category must identify an active Category.",
        relatedSystemId:
        "Related System must identify an active Related System.",
    });
    });

    it("API-04 replays an identical submission without duplication", async () => {
    const [requesterId, categoryId, relatedSystemId] =
        await Promise.all([
        getReferenceId(
            "/api/development-requesters",
            "Daniel Kim",
        ),
        getReferenceId("/api/categories", "Software"),
        getReferenceId(
            "/api/related-systems",
            "LEB2 App",
        ),
        ]);

    const payload = {
        clientSubmissionId: randomUUID(),
        categoryId,
        relatedSystemId,
        requestedPriority: "HIGH",
        summary: "LEB2 App closes unexpectedly",
        description:
        "The application closes whenever a course is opened.",
    };

    const firstResponse = await request(app)
        .post("/api/tickets")
        .set(
        "X-Development-Requester-Id",
        String(requesterId),
        )
        .send(payload);

    const replayResponse = await request(app)
        .post("/api/tickets")
        .set(
        "X-Development-Requester-Id",
        String(requesterId),
        )
        .send(payload);

    expect(firstResponse.status).toBe(201);
    expect(replayResponse.status).toBe(200);
    expect(replayResponse.body.replayed).toBe(true);
    expect(replayResponse.body.ticket.id).toBe(
        firstResponse.body.ticket.id,
    );

    const ticketCount = await getPrisma().ticket.count({
        where: {
        requesterId,
        clientSubmissionId:
            payload.clientSubmissionId,
        },
    });

    expect(ticketCount).toBe(1);
    });

    it("API-04 returns 409 when an identifier is reused with changed data", async () => {
    const [requesterId, categoryId, relatedSystemId] =
        await Promise.all([
        getReferenceId(
            "/api/development-requesters",
            "Priya Shah",
        ),
        getReferenceId("/api/categories", "Network"),
        getReferenceId(
            "/api/related-systems",
            "Campus Wi-Fi",
        ),
        ]);

    const payload = {
        clientSubmissionId: randomUUID(),
        categoryId,
        relatedSystemId,
        requestedPriority: "MEDIUM",
        summary: "Campus Wi-Fi disconnects frequently",
        description:
        "The connection drops several times every hour.",
    };

    const firstResponse = await request(app)
        .post("/api/tickets")
        .set(
        "X-Development-Requester-Id",
        String(requesterId),
        )
        .send(payload);

    const conflictResponse = await request(app)
        .post("/api/tickets")
        .set(
        "X-Development-Requester-Id",
        String(requesterId),
        )
        .send({
        ...payload,
        summary: "Campus Wi-Fi cannot connect",
        });

    expect(firstResponse.status).toBe(201);
    expect(conflictResponse.status).toBe(409);

    expect(conflictResponse.body).toEqual({
        error: {
        code: "IDEMPOTENCY_CONFLICT",
        message:
            "This submission identifier has already been used with different Ticket data.",
        },
    });
    });

    it("API-03 returns a safe unexpected-error response", async () => {
    const requesterId = await getReferenceId(
        "/api/development-requesters",
        "Alex Morgan",
    );

    vi.spyOn(
        getPrisma().developmentRequester,
        "findFirst",
    ).mockRejectedValueOnce(
        new Error(
        "DATABASE_URL=postgresql://secret-database",
        ),
    );

    vi.spyOn(console, "error").mockImplementation(
        () => undefined,
    );

    const response = await request(app)
        .post("/api/tickets")
        .set(
        "X-Development-Requester-Id",
        String(requesterId),
        )
        .send({
        clientSubmissionId: randomUUID(),
        categoryId: 1,
        relatedSystemId: 1,
        requestedPriority: "LOW",
        summary: "Unable to access the application",
        description:
            "The application displays an unexpected error.",
        });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
        error: {
        code: "INTERNAL_ERROR",
        message:
            "Something went wrong. Please try again.",
        },
    });

    expect(JSON.stringify(response.body)).not.toContain(
        "secret-database",
    );
    });
});