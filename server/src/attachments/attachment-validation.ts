export const MAX_ATTACHMENT_SIZE_BYTES = 5_000_000;
export const MAX_ACTIVE_ATTACHMENTS = 5;

const ALLOWED_FILE_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

export type AttachmentValidationInput = {
  originalFilename: string;
  declaredMimeType: string;
  detectedMimeType: string;
  sizeBytes: number;
  activeAttachmentCount: number;
};

export type AttachmentValidationResult =
  | {
      success: true;
      data: {
        originalFilename: string;
        mimeType: string;
        sizeBytes: number;
      };
    }
  | {
      success: false;
      code:
        | "FILE_REQUIRED"
        | "UNSUPPORTED_ATTACHMENT_TYPE"
        | "ATTACHMENT_TOO_LARGE"
        | "ATTACHMENT_LIMIT_REACHED";
      message: string;
    };

function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");

  if (lastDot < 0) {
    return "";
  }

  return filename.slice(lastDot).toLowerCase();
}

export function validateAttachmentInput(
  input: AttachmentValidationInput,
): AttachmentValidationResult {
  const originalFilename = input.originalFilename.trim();

  if (
    originalFilename.length === 0 ||
    !Number.isInteger(input.sizeBytes) ||
    input.sizeBytes <= 0
  ) {
    return {
      success: false,
      code: "FILE_REQUIRED",
      message: "Please select a file.",
    };
  }

  if (input.sizeBytes > MAX_ATTACHMENT_SIZE_BYTES) {
    return {
      success: false,
      code: "ATTACHMENT_TOO_LARGE",
      message: "Each attachment must be 5 MB or smaller.",
    };
  }

  if (
    input.activeAttachmentCount >=
    MAX_ACTIVE_ATTACHMENTS
  ) {
    return {
      success: false,
      code: "ATTACHMENT_LIMIT_REACHED",
      message:
        "This Ticket already has five active attachments.",
    };
  }

  const extension = getExtension(originalFilename);
  const expectedMimeType = ALLOWED_FILE_TYPES[extension];

  if (
    !expectedMimeType ||
    input.declaredMimeType !== expectedMimeType ||
    input.detectedMimeType !== expectedMimeType
  ) {
    return {
      success: false,
      code: "UNSUPPORTED_ATTACHMENT_TYPE",
      message: "This file type is not allowed.",
    };
  }

  return {
    success: true,
    data: {
      originalFilename,
      mimeType: input.detectedMimeType,
      sizeBytes: input.sizeBytes,
    },
  };
}