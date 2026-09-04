import { randomUUID } from "node:crypto";
import {
    afterEach,
    describe,
    expect,
    it,
} from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import {
    setAttachmentStorageForTests,
    StorageUnavailableError,
    type AttachmentStorage,
} from "../../src/attachments/attachment-storage.js";

type ReferenceItem = {
    id: number;
    name: string;
};

const PNG_BUFFER = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nFQAAAAASUVORK5CYII=",
    "base64",
);

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

async function createOwnedTicket(): Promise<{
    ticketId: number;
    requesterId: number;
}> {
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
            summary: "Laptop screen displays visual artifacts",
            description:
                "The laptop screen displays visual artifacts after startup.",
        });

    expect(response.status).toBe(201);

    return {
        ticketId: response.body.ticket.id,
        requesterId,
    };
}

describe("POST /api/tickets/:ticketId/attachments", () => {
    afterEach(() => {
        setAttachmentStorageForTests(null);
    });
    it("API-08 uploads one permitted Attachment", async () => {
        const { ticketId, requesterId } =
            await createOwnedTicket();

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

        expect(response.status).toBe(201);

        expect(response.body).toMatchObject({
            ticketId,
            originalFilename: "evidence.png",
            mimeType: "image/png",
            sizeBytes: PNG_BUFFER.length,
            uploadedByRequesterId: requesterId,
            isRemoved: false,
            removedAt: null,
            removedByRequesterId: null,
            removalReason: null,
        });

        expect(response.body.id).toEqual(
            expect.any(Number),
        );
        expect(response.body.createdAt).toBeTruthy();

        // Internal SeaweedFS information must not leak.
        expect(response.body.storageKey).toBeUndefined();
    });
    it.each([
        {
            filename: "malware.exe",
            contentType: "application/octet-stream",
            content: Buffer.from("not permitted"),
        },
        {
            filename: "fake.pdf",
            contentType: "application/pdf",
            content: PNG_BUFFER,
        },
    ])(
        "API-08 rejects unsupported or mismatched file $filename",
        async ({ filename, contentType, content }) => {
            const { ticketId, requesterId } =
                await createOwnedTicket();

            const response = await request(app)
                .post(`/api/tickets/${ticketId}/attachments`)
                .set(
                    "X-Development-Requester-Id",
                    String(requesterId),
                )
                .attach("file", content, {
                    filename,
                    contentType,
                });

            expect(response.status).toBe(415);
            expect(response.body).toEqual({
                error: {
                    code: "UNSUPPORTED_ATTACHMENT_TYPE",
                    message: "This file type is not allowed.",
                },
            });
        },
    );

    it("API-08 rejects a file larger than 5 MB", async () => {
        const { ticketId, requesterId } =
            await createOwnedTicket();

        const response = await request(app)
            .post(`/api/tickets/${ticketId}/attachments`)
            .set(
                "X-Development-Requester-Id",
                String(requesterId),
            )
            .attach("file", Buffer.alloc(5_000_001), {
                filename: "large.png",
                contentType: "image/png",
            });

        expect(response.status).toBe(413);
        expect(response.body).toEqual({
            error: {
                code: "ATTACHMENT_TOO_LARGE",
                message:
                    "Each attachment must be 5 MB or smaller.",
            },
        });
    });

    it("API-08 rejects a missing file", async () => {
        const { ticketId, requesterId } =
            await createOwnedTicket();

        const response = await request(app)
            .post(`/api/tickets/${ticketId}/attachments`)
            .set(
                "X-Development-Requester-Id",
                String(requesterId),
            );

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
            error: {
                code: "FILE_REQUIRED",
                message: "Please select a file.",
            },
        });
    });

    it("API-08 hides a Ticket owned by another Requester", async () => {
        const { ticketId } = await createOwnedTicket();

        const otherRequesterId = await getReferenceId(
            "/api/development-requesters",
            "Daniel Kim",
        );

        const response = await request(app)
            .post(`/api/tickets/${ticketId}/attachments`)
            .set(
                "X-Development-Requester-Id",
                String(otherRequesterId),
            )
            .attach("file", PNG_BUFFER, {
                filename: "evidence.png",
                contentType: "image/png",
            });

        expect(response.status).toBe(404);
        expect(response.body).toEqual({
            error: {
                code: "TICKET_NOT_FOUND",
                message: "Ticket not found.",
            },
        });
    });
    it("API-08 rejects an inactive Development Requester", async () => {
        const { ticketId } = await createOwnedTicket();

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

        const response = await request(app)
            .post(`/api/tickets/${ticketId}/attachments`)
            .set(
                "X-Development-Requester-Id",
                String(inactiveRequester!.id),
            )
            .attach("file", PNG_BUFFER, {
                filename: "evidence.png",
                contentType: "image/png",
            });

        expect(response.status).toBe(400);

        expect(response.body).toEqual({
            error: {
                code: "INVALID_REQUESTER",
                message:
                    "The selected Development Requester is invalid.",
            },
        });
    });

    it("API-08 limits a Ticket to five active Attachments", async () => {
        const { ticketId, requesterId } =
            await createOwnedTicket();

        for (let index = 1; index <= 5; index += 1) {
            const response = await request(app)
                .post(`/api/tickets/${ticketId}/attachments`)
                .set(
                    "X-Development-Requester-Id",
                    String(requesterId),
                )
                .attach("file", PNG_BUFFER, {
                    filename: `evidence-${index}.png`,
                    contentType: "image/png",
                });

            expect(response.status).toBe(201);
        }

        const sixthResponse = await request(app)
            .post(`/api/tickets/${ticketId}/attachments`)
            .set(
                "X-Development-Requester-Id",
                String(requesterId),
            )
            .attach("file", PNG_BUFFER, {
                filename: "evidence-6.png",
                contentType: "image/png",
            });

        expect(sixthResponse.status).toBe(409);
        expect(sixthResponse.body).toEqual({
            error: {
                code: "ATTACHMENT_LIMIT_REACHED",
                message:
                    "This Ticket already has five active attachments.",
            },
        });
    });

    it("API-08 keeps the Ticket when Attachment storage fails", async () => {
        const { ticketId, requesterId } =
            await createOwnedTicket();

        const failingStorage: AttachmentStorage = {
            async store() {
                throw new StorageUnavailableError();
            },
            async remove() {
                return;
            },
        };

        setAttachmentStorageForTests(failingStorage);

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

        const [savedTicket, attachmentCount] =
            await Promise.all([
                getPrisma().ticket.findUnique({
                    where: {
                        id: ticketId,
                    },
                }),
                getPrisma().attachment.count({
                    where: {
                        ticketId,
                    },
                }),
            ]);

        expect(savedTicket).not.toBeNull();
        expect(attachmentCount).toBe(0);
    });
});