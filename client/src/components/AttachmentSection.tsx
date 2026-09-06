import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import {
  ApiRequestError,
  getAttachmentContent,
  getAttachments,
  removeAttachment,
  uploadAttachment,
  type Attachment,
} from "../api.js";

const MAX_FILE_SIZE = 5_000_000;
const MAX_ACTIVE_ATTACHMENTS = 5;
const ALLOWED_FILE_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = () => {
    throw new Error("Blob URLs are unavailable in this browser.");
  };
}

if (typeof URL.revokeObjectURL !== "function") {
  URL.revokeObjectURL = () => undefined;
}

interface AttachmentSectionProps {
  requesterId: number;
  ticketId: number;
  onInitialLoadComplete?: () => void;
}

type ListState = "loading" | "success" | "error";
type ContentDisposition = "inline" | "attachment";

function extensionOf(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex < 0
    ? ""
    : filename.slice(dotIndex).toLowerCase();
}

function formatFileSize(size: number): string {
  if (size >= 1_000_000) {
    return `${(size / 1_000_000).toFixed(2)} MB`;
  }

  if (size >= 1_000) {
    return `${(size / 1_000).toFixed(1)} KB`;
  }

  return `${size} ${size === 1 ? "byte" : "bytes"}`;
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function safeErrorMessage(error: unknown): string {
  return error instanceof ApiRequestError
    ? error.message
    : "Something went wrong. Please try again.";
}

export default function AttachmentSection({
  requesterId,
  ticketId,
  onInitialLoadComplete,
}: AttachmentSectionProps) {
  const [attachments, setAttachments] = useState<
    Attachment[]
  >([]);
  const [listState, setListState] =
    useState<ListState>("loading");
  const [retryVersion, setRetryVersion] = useState(0);
  const [listError, setListError] = useState("");
  const [selectedFile, setSelectedFile] =
    useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [actionError, setActionError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [activeContentAction, setActiveContentAction] =
    useState<number | null>(null);
  const [attachmentToRemove, setAttachmentToRemove] =
    useState<Attachment | null>(null);
  const [removalReason, setRemovalReason] = useState("");
  const [removalError, setRemovalError] = useState("");
  const [isRemoving, setIsRemoving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const reasonInputRef = useRef<HTMLTextAreaElement>(null);
  const removeButtonRef = useRef<HTMLButtonElement | null>(null);
  const shouldReturnFocus = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setListState("loading");
    setListError("");

    void getAttachments(
      requesterId,
      ticketId,
      controller.signal,
    )
      .then((response) => {
        setAttachments(response.items);
        setListState("success");
        onInitialLoadComplete?.();
      })
      .catch((error: unknown) => {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        setAttachments([]);
        setListError(safeErrorMessage(error));
        setListState("error");
        onInitialLoadComplete?.();
      });

    return () => controller.abort();
  }, [
    requesterId,
    ticketId,
    retryVersion,
    onInitialLoadComplete,
  ]);

  useEffect(() => {
    if (attachmentToRemove) {
      reasonInputRef.current?.focus();
      return;
    }

    if (
      shouldReturnFocus.current &&
      removeButtonRef.current?.isConnected
    ) {
      removeButtonRef.current.focus();
    }

    shouldReturnFocus.current = false;
  }, [attachmentToRemove]);

  const activeAttachmentCount = attachments.filter(
    (attachment) => !attachment.isRemoved,
  ).length;
  const limitReached =
    activeAttachmentCount >= MAX_ACTIVE_ATTACHMENTS;
  const anyActionPending =
    isUploading || isRemoving || activeContentAction !== null;

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(null);
    setFileError("");
    setActionError("");
    setSuccessMessage("");

    if (!file) {
      return;
    }

    if (limitReached) {
      setFileError(
        "This Ticket already has five active attachments.",
      );
      event.target.value = "";
      return;
    }

    const expectedMimeType =
      ALLOWED_FILE_TYPES[extensionOf(file.name)];

    if (!expectedMimeType || file.type !== expectedMimeType) {
      setFileError("This file type is not allowed.");
      event.target.value = "";
      return;
    }

    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      setFileError(
        file.size > MAX_FILE_SIZE
          ? "Each attachment must be 5 MB or smaller."
          : "Please select a non-empty file.",
      );
      event.target.value = "";
      return;
    }

    setSelectedFile(file);
  }

  async function handleUpload() {
    if (!selectedFile || isUploading || limitReached) {
      return;
    }

    setIsUploading(true);
    setFileError("");
    setActionError("");
    setSuccessMessage("");

    try {
      const uploaded = await uploadAttachment(
        requesterId,
        ticketId,
        selectedFile,
      );
      setAttachments((current) => [...current, uploaded]);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setSuccessMessage(
        `Attachment uploaded successfully. File: ${uploaded.originalFilename}.`,
      );
    } catch (error) {
      setActionError(safeErrorMessage(error));
    } finally {
      setIsUploading(false);
    }
  }

  async function handleContent(
    attachment: Attachment,
    disposition: ContentDisposition,
  ) {
    if (attachment.isRemoved || anyActionPending) {
      return;
    }

    setActiveContentAction(attachment.id);
    setActionError("");
    setSuccessMessage("");

    try {
      const content = await getAttachmentContent(
        requesterId,
        ticketId,
        attachment.id,
        disposition,
      );
      const objectUrl = URL.createObjectURL(content);

      if (disposition === "inline") {
        window.open(
          objectUrl,
          "_blank",
          "noopener,noreferrer",
        );
      } else {
        const downloadLink = document.createElement("a");
        downloadLink.href = objectUrl;
        downloadLink.download = attachment.originalFilename;
        downloadLink.click();
      }
    } catch (error) {
      setActionError(safeErrorMessage(error));
    } finally {
      setActiveContentAction(null);
    }
  }

  function openRemoval(
    attachment: Attachment,
    button: HTMLButtonElement,
  ) {
    if (anyActionPending) {
      return;
    }

    removeButtonRef.current = button;
    shouldReturnFocus.current = false;
    setAttachmentToRemove(attachment);
    setRemovalReason("");
    setRemovalError("");
    setActionError("");
    setSuccessMessage("");
  }

  function closeRemoval() {
    if (isRemoving) {
      return;
    }

    shouldReturnFocus.current = true;
    setAttachmentToRemove(null);
    setRemovalReason("");
    setRemovalError("");
  }

  function handleDialogKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
  ) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeRemoval();
      return;
    }

    if (event.key !== "Tab" || !dialogRef.current) {
      return;
    }

    const controls = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), textarea:not([disabled])",
      ),
    );

    if (controls.length === 0) {
      return;
    }

    const first = controls[0];
    const last = controls[controls.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      document.activeElement === last
    ) {
      event.preventDefault();
      first.focus();
    }
  }

  async function confirmRemoval() {
    if (!attachmentToRemove || isRemoving) {
      return;
    }

    const trimmedReason = removalReason.trim();

    if (
      trimmedReason.length < 5 ||
      trimmedReason.length > 200
    ) {
      setRemovalError(
        "Removal reason must contain between 5 and 200 characters.",
      );
      reasonInputRef.current?.focus();
      return;
    }

    setIsRemoving(true);
    setRemovalError("");

    try {
      const removed = await removeAttachment(
        requesterId,
        ticketId,
        attachmentToRemove.id,
        trimmedReason,
      );
      setAttachments((current) =>
        current.map((attachment) =>
          attachment.id === removed.id
            ? removed
            : attachment,
        ),
      );
      setAttachmentToRemove(null);
      setRemovalReason("");
      setSuccessMessage(
        `Attachment removed successfully. File: ${removed.originalFilename}.`,
      );
    } catch (error) {
      setRemovalError(safeErrorMessage(error));
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <section
      className="ticket-attachments card border-0 shadow-sm"
      aria-labelledby="attachments-heading"
    >
      <div className="card-body p-4">
        <div className="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-3">
          <div>
            <h2 id="attachments-heading" className="h4 mb-1">
              Attachments
            </h2>
            <p className="text-secondary mb-0">
              Add up to five active JPG, JPEG, PNG, WEBP, or PDF
              files, no larger than 5 MB each.
            </p>
          </div>
        </div>

        {successMessage && (
          <div className="alert alert-success" role="status">
            {successMessage}
          </div>
        )}

        {actionError && (
          <div className="alert alert-danger" role="alert">
            {actionError}
          </div>
        )}

        <div className="attachment-upload-panel mb-4">
          <label
            className="form-label fw-semibold"
            htmlFor="ticket-detail-attachment"
          >
            Add Attachment
          </label>
          <div className="attachment-upload-controls">
            <input
              ref={fileInputRef}
              id="ticket-detail-attachment"
              className="form-control"
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.pdf"
              disabled={isUploading || limitReached}
              onChange={selectFile}
            />
            <button
              type="button"
              className="btn btn-success"
              disabled={
                !selectedFile || isUploading || limitReached
              }
              onClick={() => void handleUpload()}
            >
              {isUploading ? "Uploading attachment…" : "Upload"}
            </button>
          </div>

          {selectedFile && (
            <p className="form-text mb-0">
              Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
            </p>
          )}

          {limitReached && !fileError && (
            <p className="text-warning mt-2 mb-0" role="alert">
              This Ticket already has five active attachments.
            </p>
          )}

          {fileError && (
            <p className="text-danger mt-2 mb-0" role="alert">
              {fileError}
            </p>
          )}
        </div>

        {listState === "loading" && (
          <div className="ticket-detail-state" role="status">
            Loading attachments…
          </div>
        )}

        {listState === "error" && (
          <div className="ticket-detail-state" role="alert">
            <div>
              <p className="mb-3">{listError}</p>
              <button
                type="button"
                className="btn btn-outline-success"
                onClick={() =>
                  setRetryVersion((current) => current + 1)
                }
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {listState === "success" && attachments.length === 0 && (
          <div className="ticket-detail-state">
            This Ticket has no active attachments.
          </div>
        )}

        {listState === "success" && attachments.length > 0 && (
          <ul className="attachment-list" aria-label="Attachments">
            {attachments.map((attachment) => (
              <li
                key={attachment.id}
                className={`attachment-item ${
                  attachment.isRemoved
                    ? "attachment-item-removed"
                    : ""
                }`}
              >
                <div className="attachment-item-details">
                  <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                    <strong className="attachment-filename">
                      {attachment.originalFilename}
                    </strong>
                    <span
                      className={`badge ${
                        attachment.isRemoved
                          ? "text-bg-secondary"
                          : "text-bg-success"
                      }`}
                    >
                      {attachment.isRemoved ? "Removed" : "Active"}
                    </span>
                  </div>
                  <p className="text-secondary small mb-1 attachment-metadata">
                    {attachment.mimeType} · {formatFileSize(attachment.sizeBytes)}
                  </p>
                  <p className="text-secondary small mb-0">
                    Uploaded {" "}
                    <time dateTime={attachment.createdAt}>
                      {formatDate(attachment.createdAt)}
                    </time>
                  </p>

                  {attachment.isRemoved && (
                    <div className="attachment-removal-details mt-2">
                      {attachment.removalReason && (
                        <p className="mb-1">
                          Removal reason: {attachment.removalReason}
                        </p>
                      )}
                      {attachment.removedAt && (
                        <p className="text-secondary small mb-0">
                          Removed {" "}
                          <time dateTime={attachment.removedAt}>
                            {formatDate(attachment.removedAt)}
                          </time>
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {!attachment.isRemoved && (
                  <div className="attachment-actions">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-success"
                      aria-label={`Preview ${attachment.originalFilename}`}
                      disabled={anyActionPending}
                      onClick={() =>
                        void handleContent(attachment, "inline")
                      }
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-success"
                      aria-label={`Download ${attachment.originalFilename}`}
                      disabled={anyActionPending}
                      onClick={() =>
                        void handleContent(
                          attachment,
                          "attachment",
                        )
                      }
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      aria-label={`Remove ${attachment.originalFilename}`}
                      disabled={anyActionPending}
                      onClick={(event) =>
                        openRemoval(
                          attachment,
                          event.currentTarget,
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {attachmentToRemove && (
        <div className="attachment-dialog-backdrop">
          <div
            ref={dialogRef}
            className="attachment-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-attachment-heading"
            onKeyDown={handleDialogKeyDown}
          >
            <h2 id="remove-attachment-heading" className="h4">
              Remove Attachment
            </h2>
            <p>
              {`Remove “${attachmentToRemove.originalFilename}”? This is a soft removal: its metadata remains visible, but its content will no longer be available.`}
            </p>

            <label
              className="form-label fw-semibold"
              htmlFor="attachment-removal-reason"
            >
              Removal reason
            </label>
            <textarea
              ref={reasonInputRef}
              id="attachment-removal-reason"
              className={`form-control ${
                removalError ? "is-invalid" : ""
              }`}
              rows={4}
              required
              minLength={5}
              maxLength={200}
              disabled={isRemoving}
              value={removalReason}
              aria-invalid={Boolean(removalError)}
              onChange={(event) => {
                setRemovalReason(event.target.value);
                if (removalError) {
                  setRemovalError("");
                }
              }}
            />
            <p className="form-text">5–200 characters</p>

            {removalError && (
              <div className="alert alert-danger" role="alert">
                {removalError}
              </div>
            )}

            <div className="d-flex flex-wrap justify-content-end gap-2">
              <button
                type="button"
                className="btn btn-outline-secondary"
                disabled={isRemoving}
                onClick={closeRemoval}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={isRemoving}
                onClick={() => void confirmRemoval()}
              >
                {isRemoving
                  ? "Removing attachment…"
                  : "Remove Attachment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
