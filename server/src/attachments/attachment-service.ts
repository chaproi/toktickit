import { randomUUID } from "node:crypto";
import { Prisma, type UserRole } from "@prisma/client";
import { fileTypeFromBuffer } from "file-type";
import { getPrisma } from "../prisma.js";
import {
    validateAttachmentInput,
    type AttachmentValidationResult,
} from "./attachment-validation.js";
import {
    getAttachmentStorage,
    StorageUnavailableError,
} from "./attachment-storage.js";

const attachmentMetadataSelect = {
    id: true,
    ticketId: true,
    originalFilename: true,
    mimeType: true,
    sizeBytes: true,
    uploadedByUserId: true,
    isRemoved: true,
    createdAt: true,
    removedAt: true,
    removedByUserId: true,
    removalReason: true,
} satisfies Prisma.AttachmentSelect;

const attachmentContentSelect = {
    ...attachmentMetadataSelect,
    storageKey: true,
} satisfies Prisma.AttachmentSelect;

type StoredAttachmentMetadata = Prisma.AttachmentGetPayload<{
    select: typeof attachmentMetadataSelect;
}>;

export type AttachmentMetadata = Omit<
    StoredAttachmentMetadata,
    "uploadedByUserId" | "removedByUserId"
> & {
    uploadedByRequesterId: number;
    removedByRequesterId: number | null;
};

function compatibilityMetadata(
    attachment: StoredAttachmentMetadata,
): AttachmentMetadata {
    const {
        uploadedByUserId,
        removedByUserId,
        ...metadata
    } = attachment;
    return {
        ...metadata,
        uploadedByRequesterId: uploadedByUserId,
        removedByRequesterId: removedByUserId,
    };
}

type AttachmentRequesterFailure =
    | { kind: "invalid-requester" }
    | { kind: "not-found" };

export type ListAttachmentsResult =
    | {
        kind: "success";
        attachments: AttachmentMetadata[];
    }
    | AttachmentRequesterFailure;

export type GetAttachmentResult =
    | {
        kind: "success";
        attachment: AttachmentMetadata;
    }
    | AttachmentRequesterFailure;

export type GetAttachmentContentResult =
    | {
        kind: "success";
        attachment: AttachmentMetadata;
        content: Buffer;
    }
    | { kind: "removed" }
    | AttachmentRequesterFailure;

export type RemoveAttachmentResult =
    | {
        kind: "success";
        attachment: AttachmentMetadata;
    }
    | { kind: "already-removed" }
    | AttachmentRequesterFailure;

async function isActiveActor(
    userId: number,
    role: UserRole,
): Promise<boolean> {
    const user =
        await getPrisma().user.findFirst({
            where: {
                id: userId,
                isActive: true,
                role,
            },
            select: {
                id: true,
            },
        });

    return user !== null;
}

async function findOwnedAttachment(
    requesterId: number,
    ticketId: number,
    attachmentId: number,
) {
    return getPrisma().attachment.findFirst({
        where: {
            id: attachmentId,
            ticketId,
            ticket: {
                requesterId,
            },
        },
        select: attachmentContentSelect,
    });
}

async function findVisibleAttachment(
    userId: number,
    role: UserRole,
    ticketId: number,
    attachmentId: number,
) {
    return getPrisma().attachment.findFirst({
        where: {
            id: attachmentId,
            ticketId,
            ...(role === "REQUESTER"
                ? { ticket: { requesterId: userId } }
                : {}),
        },
        select: attachmentContentSelect,
    });
}

export async function listAttachmentsForRequester(
    requesterId: number,
    ticketId: number,
    role: UserRole = "REQUESTER",
): Promise<ListAttachmentsResult> {
    const prisma = getPrisma();

    if (!(await isActiveActor(requesterId, role))) {
        return { kind: "invalid-requester" };
    }

    const ticket = await prisma.ticket.findFirst({
        where: {
            id: ticketId,
            ...(role === "REQUESTER" ? { requesterId } : {}),
        },
        select: {
            id: true,
        },
    });

    if (!ticket) {
        return { kind: "not-found" };
    }

    const attachments = await prisma.attachment.findMany({
        where: {
            ticketId,
        },
        select: attachmentMetadataSelect,
        orderBy: [
            { isRemoved: "asc" },
            { createdAt: "asc" },
            { id: "asc" },
        ],
    });

    return {
        kind: "success",
        attachments: attachments.map(compatibilityMetadata),
    };
}

export async function getAttachmentForRequester(
    requesterId: number,
    ticketId: number,
    attachmentId: number,
    role: UserRole = "REQUESTER",
): Promise<GetAttachmentResult> {
    if (!(await isActiveActor(requesterId, role))) {
        return { kind: "invalid-requester" };
    }

    const attachment = await findVisibleAttachment(
        requesterId,
        role,
        ticketId,
        attachmentId,
    );

    if (!attachment) {
        return { kind: "not-found" };
    }

    const { storageKey: _storageKey, ...storedMetadata } =
        attachment;

    return {
        kind: "success",
        attachment: compatibilityMetadata(storedMetadata),
    };
}

export async function getAttachmentContentForRequester(
    requesterId: number,
    ticketId: number,
    attachmentId: number,
    role: UserRole = "REQUESTER",
): Promise<GetAttachmentContentResult> {
    if (!(await isActiveActor(requesterId, role))) {
        return { kind: "invalid-requester" };
    }

    const attachment = await findVisibleAttachment(
        requesterId,
        role,
        ticketId,
        attachmentId,
    );

    if (!attachment) {
        return { kind: "not-found" };
    }

    if (attachment.isRemoved) {
        return { kind: "removed" };
    }

    const storage = getAttachmentStorage();

    if (!storage.read) {
        throw new StorageUnavailableError();
    }

    const content = await storage.read(attachment.storageKey);
    const { storageKey: _storageKey, ...storedMetadata } =
        attachment;

    return {
        kind: "success",
        attachment: compatibilityMetadata(storedMetadata),
        content,
    };
}

export async function removeAttachmentForRequester(
    requesterId: number,
    ticketId: number,
    attachmentId: number,
    removalReason: string,
): Promise<RemoveAttachmentResult> {
    const prisma = getPrisma();

    if (!(await isActiveActor(requesterId, "REQUESTER"))) {
        return { kind: "invalid-requester" };
    }

    const attachment = await findOwnedAttachment(
        requesterId,
        ticketId,
        attachmentId,
    );

    if (!attachment) {
        return { kind: "not-found" };
    }

    if (attachment.isRemoved) {
        return { kind: "already-removed" };
    }

    const removal = await prisma.attachment.updateMany({
        where: {
            id: attachment.id,
            isRemoved: false,
        },
        data: {
            isRemoved: true,
            removedAt: new Date(),
            removedByUserId: requesterId,
            removalReason,
        },
    });

    if (removal.count === 0) {
        return { kind: "already-removed" };
    }

    const removedAttachment =
        await prisma.attachment.findUniqueOrThrow({
            where: {
                id: attachment.id,
            },
            select: attachmentMetadataSelect,
        });

    try {
        await getAttachmentStorage().remove(
            attachment.storageKey,
        );
    } catch (error) {
        console.error(
            "Unable to remove soft-removed Attachment content.",
        );
    }

    return {
        kind: "success",
        attachment: compatibilityMetadata(removedAttachment),
    };
}

export type UploadedAttachmentFile = {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
};

export type UploadAttachmentResult =
    | {
        kind: "uploaded";
        attachment: {
            id: number;
            ticketId: number;
            originalFilename: string;
            mimeType: string;
            sizeBytes: number;
            uploadedByRequesterId: number;
            isRemoved: boolean;
            createdAt: Date;
            removedAt: Date | null;
            removedByRequesterId: number | null;
            removalReason: string | null;
        };
    }
    | {
        kind: "invalid-requester";
    }
    | {
        kind: "not-found";
    }
    | {
        kind: "invalid-file";
        validation: Extract<
            AttachmentValidationResult,
            { success: false }
        >;
    };

export async function uploadAttachmentForRequester(
    requesterId: number,
    ticketId: number,
    file: UploadedAttachmentFile,
): Promise<UploadAttachmentResult> {
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
    const detectedFileType =
        await fileTypeFromBuffer(file.buffer);
    const storage = getAttachmentStorage();
    let storedKey: string | null = null;

    try {
        return await prisma.$transaction(async (transaction) => {
            const ownedTickets = await transaction.$queryRaw<
                Array<{ id: number }>
            >`
                SELECT "id"
                FROM "Ticket"
                WHERE "id" = ${ticketId}
                  AND "requesterId" = ${requesterId}
                FOR UPDATE
            `;

            if (ownedTickets.length === 0) {
                return {
                    kind: "not-found" as const,
                };
            }

            const activeAttachmentCount =
                await transaction.attachment.count({
                    where: {
                        ticketId,
                        isRemoved: false,
                    },
                });
            const validation = validateAttachmentInput({
                originalFilename: file.originalname,
                declaredMimeType: file.mimetype,
                detectedMimeType: detectedFileType?.mime ?? "",
                sizeBytes: file.size,
                activeAttachmentCount,
            });

            if (!validation.success) {
                return {
                    kind: "invalid-file" as const,
                    validation,
                };
            }

            const storageKey = randomUUID();
            await storage.store({
                storageKey,
                content: file.buffer,
                mimeType: validation.data.mimeType,
            });
            storedKey = storageKey;

            const attachment =
                await transaction.attachment.create({
                    data: {
                        ticketId,
                        originalFilename:
                            validation.data.originalFilename,
                        storageKey,
                        mimeType: validation.data.mimeType,
                        sizeBytes: validation.data.sizeBytes,
                        uploadedByUserId: requesterId,
                    },
                    select: attachmentMetadataSelect,
                });

            return {
                kind: "uploaded" as const,
                attachment: compatibilityMetadata(attachment),
            };
        });
    } catch (error) {
        if (storedKey !== null) {
            try {
                await storage.remove(storedKey);
            } catch (cleanupError) {
                console.error(
                    "Unable to remove an orphaned Attachment object.",
                );
            }
        }

        throw error;
    }
}
