import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
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
    uploadedByRequesterId: true,
    isRemoved: true,
    createdAt: true,
    removedAt: true,
    removedByRequesterId: true,
    removalReason: true,
} satisfies Prisma.AttachmentSelect;

const attachmentContentSelect = {
    ...attachmentMetadataSelect,
    storageKey: true,
} satisfies Prisma.AttachmentSelect;

export type AttachmentMetadata =
    Prisma.AttachmentGetPayload<{
        select: typeof attachmentMetadataSelect;
    }>;

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

async function isActiveRequester(
    requesterId: number,
): Promise<boolean> {
    const requester =
        await getPrisma().developmentRequester.findFirst({
            where: {
                id: requesterId,
                isActive: true,
            },
            select: {
                id: true,
            },
        });

    return requester !== null;
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

export async function listAttachmentsForRequester(
    requesterId: number,
    ticketId: number,
): Promise<ListAttachmentsResult> {
    const prisma = getPrisma();

    if (!(await isActiveRequester(requesterId))) {
        return { kind: "invalid-requester" };
    }

    const ticket = await prisma.ticket.findFirst({
        where: {
            id: ticketId,
            requesterId,
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
        attachments,
    };
}

export async function getAttachmentForRequester(
    requesterId: number,
    ticketId: number,
    attachmentId: number,
): Promise<GetAttachmentResult> {
    if (!(await isActiveRequester(requesterId))) {
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

    const { storageKey: _storageKey, ...metadata } =
        attachment;

    return {
        kind: "success",
        attachment: metadata,
    };
}

export async function getAttachmentContentForRequester(
    requesterId: number,
    ticketId: number,
    attachmentId: number,
): Promise<GetAttachmentContentResult> {
    if (!(await isActiveRequester(requesterId))) {
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
        return { kind: "removed" };
    }

    const storage = getAttachmentStorage();

    if (!storage.read) {
        throw new StorageUnavailableError();
    }

    const content = await storage.read(attachment.storageKey);
    const { storageKey: _storageKey, ...metadata } =
        attachment;

    return {
        kind: "success",
        attachment: metadata,
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

    if (!(await isActiveRequester(requesterId))) {
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
            removedByRequesterId: requesterId,
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
            "Unable to remove soft-removed Attachment content:",
            error,
        );
    }

    return {
        kind: "success",
        attachment: removedAttachment,
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
        await prisma.developmentRequester.findFirst({
            where: {
                id: requesterId,
                isActive: true,
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
        select: {
            id: true,
        },
    });

    if (!ticket) {
        return {
            kind: "not-found",
        };
    }

    const activeAttachmentCount =
        await prisma.attachment.count({
            where: {
                ticketId,
                isRemoved: false,
            },
        });

    const detectedFileType =
        await fileTypeFromBuffer(file.buffer);

    const validation = validateAttachmentInput({
        originalFilename: file.originalname,
        declaredMimeType: file.mimetype,
        detectedMimeType: detectedFileType?.mime ?? "",
        sizeBytes: file.size,
        activeAttachmentCount,
    });

    if (!validation.success) {
        return {
            kind: "invalid-file",
            validation,
        };
    }

    const storage = getAttachmentStorage();
    const storageKey = randomUUID();

    await storage.store({
        storageKey,
        content: file.buffer,
        mimeType: validation.data.mimeType,
    });

    try {
        const attachment = await prisma.attachment.create({
            data: {
                ticketId,
                originalFilename:
                    validation.data.originalFilename,
                storageKey,
                mimeType: validation.data.mimeType,
                sizeBytes: validation.data.sizeBytes,
                uploadedByRequesterId: requesterId,
            },
            select: {
                id: true,
                ticketId: true,
                originalFilename: true,
                mimeType: true,
                sizeBytes: true,
                uploadedByRequesterId: true,
                isRemoved: true,
                createdAt: true,
                removedAt: true,
                removedByRequesterId: true,
                removalReason: true,
            },
        });

        return {
            kind: "uploaded",
            attachment,
        };
    } catch (error) {
        try {
            await storage.remove(storageKey);
        } catch (cleanupError) {
            console.error(
                "Unable to remove an orphaned Attachment object:",
                cleanupError,
            );
        }

        throw error;
    }
}
