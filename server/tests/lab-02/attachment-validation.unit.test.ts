import { describe, expect, it } from "vitest";
import { validateAttachmentInput } from "../../src/attachments/attachment-validation.js";

describe("Attachment validation", () => {
  it.each([
    ["photo.jpg", "image/jpeg"],
    ["photo.jpeg", "image/jpeg"],
    ["diagram.png", "image/png"],
    ["evidence.webp", "image/webp"],
    ["report.pdf", "application/pdf"],
  ])(
    "UNIT-03 accepts permitted file %s",
    (originalFilename, mimeType) => {
      const result = validateAttachmentInput({
        originalFilename,
        declaredMimeType: mimeType,
        detectedMimeType: mimeType,
        sizeBytes: 5_000_000,
        activeAttachmentCount: 0,
      });

      expect(result).toEqual({
        success: true,
        data: {
          originalFilename,
          mimeType,
          sizeBytes: 5_000_000,
        },
      });
    },
  );

  it("rejects unsupported extensions and MIME types", () => {
    const result = validateAttachmentInput({
      originalFilename: "malware.exe",
      declaredMimeType: "application/octet-stream",
      detectedMimeType: "application/octet-stream",
      sizeBytes: 1000,
      activeAttachmentCount: 0,
    });

    expect(result).toEqual({
      success: false,
      code: "UNSUPPORTED_ATTACHMENT_TYPE",
      message: "This file type is not allowed.",
    });
  });

  it("rejects a MIME type that does not match the detected content", () => {
    const result = validateAttachmentInput({
      originalFilename: "fake.pdf",
      declaredMimeType: "application/pdf",
      detectedMimeType: "image/png",
      sizeBytes: 1000,
      activeAttachmentCount: 0,
    });

    expect(result).toEqual({
      success: false,
      code: "UNSUPPORTED_ATTACHMENT_TYPE",
      message: "This file type is not allowed.",
    });
  });

  it("rejects a file larger than 5 MB", () => {
    const result = validateAttachmentInput({
      originalFilename: "large.pdf",
      declaredMimeType: "application/pdf",
      detectedMimeType: "application/pdf",
      sizeBytes: 5_000_001,
      activeAttachmentCount: 0,
    });

    expect(result).toEqual({
      success: false,
      code: "ATTACHMENT_TOO_LARGE",
      message: "Each attachment must be 5 MB or smaller.",
    });
  });

  it("rejects an upload when five active Attachments exist", () => {
    const result = validateAttachmentInput({
      originalFilename: "sixth.pdf",
      declaredMimeType: "application/pdf",
      detectedMimeType: "application/pdf",
      sizeBytes: 1000,
      activeAttachmentCount: 5,
    });

    expect(result).toEqual({
      success: false,
      code: "ATTACHMENT_LIMIT_REACHED",
      message:
        "This Ticket already has five active attachments.",
    });
  });

  it("rejects a missing filename or empty file", () => {
    const result = validateAttachmentInput({
      originalFilename: "",
      declaredMimeType: "application/pdf",
      detectedMimeType: "application/pdf",
      sizeBytes: 0,
      activeAttachmentCount: 0,
    });

    expect(result).toEqual({
      success: false,
      code: "FILE_REQUIRED",
      message: "Please select a file.",
    });
  });
});