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
const JPEG_BUFFER = Buffer.from(
    "ffd8ffe000104a46494600010100000100010000",
    "hex",
);
const WEBP_BUFFER = Buffer.from(
    "524946460400000057454250",
    "hex",
);
const PDF_BUFFER = Buffer.from(
    "%PDF-1.7\n% Issue 19 attachment fixture\n%%EOF\n",
    "utf8",
);
const RUN_MARKER = `Issue19-Attachment-${randomUUID()}`;
const createdTicketIds: number[] = [];

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
            summary: `${RUN_MARKER} laptop display artifacts`,
            description:
                "The laptop screen displays visual artifacts after startup.",
        });

    expect(response.status).toBe(201);

    createdTicketIds.push(response.body.ticket.id);

    return {
        ticketId: response.body.ticket.id,
        requesterId,
    };
}

async function cleanCreatedTickets(): Promise<void> {
    if (createdTicketIds.length === 0) {
        return;
    }

    const ticketIds = createdTicketIds.splice(
        0,
        createdTicketIds.length,
    );
    const prisma = getPrisma();

    await prisma.attachment.deleteMany({
        where: {
            ticketId: {
                in: ticketIds,
            },
        },
    });
    await prisma.ticket.deleteMany({
        where: {
            id: {
                in: ticketIds,
            },
        },
    });
}

async function uploadAttachment(
    ticketId: number,
    requesterId: number,
    fixture: {
        filename: string;
        contentType: string;
        content: Buffer;
    } = {
        filename: "evidence.png",
        contentType: "image/png",
        content: PNG_BUFFER,
    },
) {
    return request(app)
        .post(`/api/tickets/${ticketId}/attachments`)
        .set(
            "X-Development-Requester-Id",
            String(requesterId),
        )
        .attach("file", fixture.content, {
            filename: fixture.filename,
            contentType: fixture.contentType,
        });
}

afterEach(async () => {
    setAttachmentStorageForTests(null);
    await cleanCreatedTickets();
});

describe("POST /api/tickets/:ticketId/attachments", () => {
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
            filename: "evidence.jpg",
            contentType: "image/jpeg",
            content: JPEG_BUFFER,
        },
        {
            filename: "evidence.jpeg",
            contentType: "image/jpeg",
            content: JPEG_BUFFER,
        },
        {
            filename: "evidence.webp",
            contentType: "image/webp",
            content: WEBP_BUFFER,
        },
        {
            filename: "evidence.pdf",
            contentType: "application/pdf",
            content: PDF_BUFFER,
        },
    ])(
        "API-08 accepts the permitted Attachment type $filename",
        async (fixture) => {
            const { ticketId, requesterId } =
                await createOwnedTicket();

            const response = await uploadAttachment(
                ticketId,
                requesterId,
                fixture,
            );

            expect(response.status).toBe(201);
            expect(response.body).toMatchObject({
                ticketId,
                originalFilename: fixture.filename,
                mimeType: fixture.contentType,
                sizeBytes: fixture.content.length,
                uploadedByRequesterId: requesterId,
                isRemoved: false,
            });
        },
    );
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

describe("owned Attachment metadata and content", () => {
    it("API-09 lists active and removed Attachment metadata without storage details", async () => {
        const { ticketId, requesterId } =
            await createOwnedTicket();
        const activeResponse = await uploadAttachment(
            ticketId,
            requesterId,
            {
                filename: "active-evidence.png",
                contentType: "image/png",
                content: PNG_BUFFER,
            },
        );
        const removedResponse = await uploadAttachment(
            ticketId,
            requesterId,
            {
                filename: "removed-evidence.pdf",
                contentType: "application/pdf",
                content: PDF_BUFFER,
            },
        );
        expect(activeResponse.status).toBe(201);
        expect(removedResponse.status).toBe(201);

        const removedAt = new Date("2042-07-01T12:00:00.000Z");
        await getPrisma().attachment.update({
            where: { id: removedResponse.body.id },
            data: {
                isRemoved: true,
                removedAt,
                removedByRequesterId: requesterId,
                removalReason: "Uploaded the wrong document.",
            },
        });

        const response = await request(app)
            .get(`/api/tickets/${ticketId}/attachments`)
            .set(
                "X-Development-Requester-Id",
                String(requesterId),
            );

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            items: [
                activeResponse.body,
                {
                    ...removedResponse.body,
                    isRemoved: true,
                    removedAt: removedAt.toISOString(),
                    removedByRequesterId: requesterId,
                    removalReason: "Uploaded the wrong document.",
                },
            ],
        });

        for (const attachment of response.body.items) {
            expect(Object.keys(attachment).sort()).toEqual(
                [
                    "id",
                    "ticketId",
                    "originalFilename",
                    "mimeType",
                    "sizeBytes",
                    "uploadedByRequesterId",
                    "isRemoved",
                    "createdAt",
                    "removedAt",
                    "removedByRequesterId",
                    "removalReason",
                ].sort(),
            );
            expect(attachment).not.toHaveProperty("storageKey");
        }
    });

    it("API-09 returns one owned Attachment's approved metadata", async () => {
        const { ticketId, requesterId } =
            await createOwnedTicket();
        const uploadResponse = await uploadAttachment(
            ticketId,
            requesterId,
        );
        expect(uploadResponse.status).toBe(201);

        const response = await request(app)
            .get(
                `/api/tickets/${ticketId}/attachments/${uploadResponse.body.id}`,
            )
            .set(
                "X-Development-Requester-Id",
                String(requesterId),
            );

        expect(response.status).toBe(200);
        expect(response.body).toEqual(uploadResponse.body);
        expect(response.body).not.toHaveProperty("storageKey");
    });

    it.each(["inline", "attachment"] as const)(
        "API-09 returns active Attachment content with %s disposition",
        async (disposition) => {
            const { ticketId, requesterId } =
                await createOwnedTicket();
            const uploadResponse = await uploadAttachment(
                ticketId,
                requesterId,
            );
            expect(uploadResponse.status).toBe(201);

            const response = await request(app)
                .get(
                    `/api/tickets/${ticketId}/attachments/${uploadResponse.body.id}/content?disposition=${disposition}`,
                )
                .set(
                    "X-Development-Requester-Id",
                    String(requesterId),
                );

            expect(response.status).toBe(200);
            expect(response.headers["content-type"]).toMatch(
                /^image\/png(?:;|$)/,
            );
            expect(response.headers["content-disposition"]).toContain(
                disposition,
            );
            expect(response.headers["content-disposition"]).toContain(
                "evidence.png",
            );
            expect(response.headers["x-content-type-options"]).toBe(
                "nosniff",
            );
            expect(response.body).toEqual(PNG_BUFFER);
            expect(JSON.stringify(response.headers)).not.toMatch(
                /seaweed|storageKey|127\.0\.0\.1:8333/i,
            );
        },
    );

    it.each([
        {
            operation: "list metadata",
            expectedCode: "TICKET_NOT_FOUND",
            execute: (
                ticketId: number,
                _attachmentId: number,
                requesterId: number,
            ) =>
                request(app)
                    .get(`/api/tickets/${ticketId}/attachments`)
                    .set(
                        "X-Development-Requester-Id",
                        String(requesterId),
                    ),
        },
        {
            operation: "get metadata",
            expectedCode: "ATTACHMENT_NOT_FOUND",
            execute: (
                ticketId: number,
                attachmentId: number,
                requesterId: number,
            ) =>
                request(app)
                    .get(
                        `/api/tickets/${ticketId}/attachments/${attachmentId}`,
                    )
                    .set(
                        "X-Development-Requester-Id",
                        String(requesterId),
                    ),
        },
        {
            operation: "download content",
            expectedCode: "ATTACHMENT_NOT_FOUND",
            execute: (
                ticketId: number,
                attachmentId: number,
                requesterId: number,
            ) =>
                request(app)
                    .get(
                        `/api/tickets/${ticketId}/attachments/${attachmentId}/content`,
                    )
                    .set(
                        "X-Development-Requester-Id",
                        String(requesterId),
                    ),
        },
        {
            operation: "soft remove",
            expectedCode: "ATTACHMENT_NOT_FOUND",
            execute: (
                ticketId: number,
                attachmentId: number,
                requesterId: number,
            ) =>
                request(app)
                    .delete(
                        `/api/tickets/${ticketId}/attachments/${attachmentId}`,
                    )
                    .set(
                        "X-Development-Requester-Id",
                        String(requesterId),
                    )
                    .send({
                        removalReason: "Uploaded the wrong file.",
                    }),
        },
    ])(
        "API-09 hides another Requester's Attachment during $operation",
        async ({ expectedCode, execute }) => {
            const { ticketId, requesterId } =
                await createOwnedTicket();
            const uploadResponse = await uploadAttachment(
                ticketId,
                requesterId,
            );
            expect(uploadResponse.status).toBe(201);

            const otherRequesterId = await getReferenceId(
                "/api/development-requesters",
                "Daniel Kim",
            );
            const response = await execute(
                ticketId,
                uploadResponse.body.id,
                otherRequesterId,
            );

            expect(response.status).toBe(404);
            expect(response.body).toEqual({
                error: {
                    code: expectedCode,
                    message:
                        expectedCode === "TICKET_NOT_FOUND"
                            ? "Ticket not found."
                            : "Attachment not found.",
                },
            });
            expect(JSON.stringify(response.body)).not.toContain(
                "evidence.png",
            );
        },
    );

});

describe("owned Attachment soft removal", () => {
    it("API-09 requires a valid trimmed removal reason and keeps metadata active after rejection", async () => {
        const { ticketId, requesterId } =
            await createOwnedTicket();
        const uploadResponse = await uploadAttachment(
            ticketId,
            requesterId,
        );
        expect(uploadResponse.status).toBe(201);

        for (const body of [
            {},
            { removalReason: "    " },
            { removalReason: "four" },
            { removalReason: "x".repeat(201) },
        ]) {
            const response = await request(app)
                .delete(
                    `/api/tickets/${ticketId}/attachments/${uploadResponse.body.id}`,
                )
                .set(
                    "X-Development-Requester-Id",
                    String(requesterId),
                )
                .send(body);

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe(
                "VALIDATION_ERROR",
            );
            expect(response.body.error.message).toBe(
                "Please correct the highlighted fields.",
            );
            expect(response.body.error.fields).toHaveProperty(
                "removalReason",
            );
        }

        const attachment = await getPrisma().attachment.findUnique({
            where: { id: uploadResponse.body.id },
        });
        expect(attachment).toMatchObject({
            isRemoved: false,
            removedAt: null,
            removedByRequesterId: null,
            removalReason: null,
        });
    });

    it("API-09 soft-removes an owned Attachment and preserves its removal metadata", async () => {
        const { ticketId, requesterId } =
            await createOwnedTicket();
        const uploadResponse = await uploadAttachment(
            ticketId,
            requesterId,
        );
        expect(uploadResponse.status).toBe(201);

        const response = await request(app)
            .delete(
                `/api/tickets/${ticketId}/attachments/${uploadResponse.body.id}`,
            )
            .set(
                "X-Development-Requester-Id",
                String(requesterId),
            )
            .send({
                removalReason: "  Uploaded the wrong image.  ",
            });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            id: uploadResponse.body.id,
            ticketId,
            originalFilename: "evidence.png",
            mimeType: "image/png",
            sizeBytes: PNG_BUFFER.length,
            uploadedByRequesterId: requesterId,
            isRemoved: true,
            removedByRequesterId: requesterId,
            removalReason: "Uploaded the wrong image.",
        });
        expect(response.body.removedAt).toEqual(expect.any(String));
        expect(response.body).not.toHaveProperty("storageKey");

        const retainedMetadata =
            await getPrisma().attachment.findUnique({
                where: { id: uploadResponse.body.id },
            });
        expect(retainedMetadata).toMatchObject({
            id: uploadResponse.body.id,
            isRemoved: true,
            removedByRequesterId: requesterId,
            removalReason: "Uploaded the wrong image.",
        });
        expect(retainedMetadata?.removedAt).not.toBeNull();
    });

    it("API-09 rejects repeated removal without changing the original metadata", async () => {
        const { ticketId, requesterId } =
            await createOwnedTicket();
        const uploadResponse = await uploadAttachment(
            ticketId,
            requesterId,
        );
        expect(uploadResponse.status).toBe(201);

        const firstResponse = await request(app)
            .delete(
                `/api/tickets/${ticketId}/attachments/${uploadResponse.body.id}`,
            )
            .set(
                "X-Development-Requester-Id",
                String(requesterId),
            )
            .send({ removalReason: "Uploaded the wrong image." });
        expect(firstResponse.status).toBe(200);

        const secondResponse = await request(app)
            .delete(
                `/api/tickets/${ticketId}/attachments/${uploadResponse.body.id}`,
            )
            .set(
                "X-Development-Requester-Id",
                String(requesterId),
            )
            .send({ removalReason: "A different removal reason." });

        expect(secondResponse.status).toBe(409);
        expect(secondResponse.body.error.code).toBe(
            "ATTACHMENT_ALREADY_REMOVED",
        );

        const retainedMetadata =
            await getPrisma().attachment.findUnique({
                where: { id: uploadResponse.body.id },
            });
        expect(retainedMetadata?.removedAt?.toISOString()).toBe(
            firstResponse.body.removedAt,
        );
        expect(retainedMetadata?.removedByRequesterId).toBe(
            requesterId,
        );
        expect(retainedMetadata?.removalReason).toBe(
            "Uploaded the wrong image.",
        );
    });

    it.each(["inline", "attachment"] as const)(
        "API-09 blocks %s content after soft removal",
        async (disposition) => {
            const { ticketId, requesterId } =
                await createOwnedTicket();
            const uploadResponse = await uploadAttachment(
                ticketId,
                requesterId,
            );
            expect(uploadResponse.status).toBe(201);

            const removeResponse = await request(app)
                .delete(
                    `/api/tickets/${ticketId}/attachments/${uploadResponse.body.id}`,
                )
                .set(
                    "X-Development-Requester-Id",
                    String(requesterId),
                )
                .send({
                    removalReason: "Uploaded the wrong image.",
                });
            expect(removeResponse.status).toBe(200);

            const response = await request(app)
                .get(
                    `/api/tickets/${ticketId}/attachments/${uploadResponse.body.id}/content?disposition=${disposition}`,
                )
                .set(
                    "X-Development-Requester-Id",
                    String(requesterId),
                );

            expect(response.status).toBe(410);
            expect(response.body).toEqual({
                error: {
                    code: "ATTACHMENT_REMOVED",
                    message:
                        "This attachment is no longer available.",
                },
            });
            expect(response.headers["content-disposition"]).toBeUndefined();
            expect(response.body).not.toEqual(PNG_BUFFER);
        },
    );
});
