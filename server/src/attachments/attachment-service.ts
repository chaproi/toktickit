import { randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { getPrisma } from "../prisma.js";
import {
    validateAttachmentInput,
    type AttachmentValidationResult,
} from "./attachment-validation.js";
import { getAttachmentStorage } from "./attachment-storage.js";

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