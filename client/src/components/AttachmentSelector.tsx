import {
    useState,
    type ChangeEvent,
} from "react";

const MAX_FILE_SIZE = 5_000_000;
const MAX_FILES = 5;

const ALLOWED_FILE_TYPES: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
};

interface AttachmentSelectorProps {
    files: File[];
    disabled?: boolean;
    onFilesChange: (files: File[]) => void;
}

function getExtension(filename: string): string {
    const dotPosition = filename.lastIndexOf(".");

    if (dotPosition < 0) {
        return "";
    }

    return filename.slice(dotPosition).toLowerCase();
}

function formatFileSize(size: number): string {
    if (size >= 1_000_000) {
        return `${(size / 1_000_000).toFixed(2)} MB`;
    }

    if (size >= 1_000) {
        return `${(size / 1_000).toFixed(1)} KB`;
    }

    return `${size} bytes`;
}

function fileIdentity(file: File): string {
    return [
        file.name,
        file.size,
        file.type,
        file.lastModified,
    ].join(":");
}

export default function AttachmentSelector({
    files,
    disabled = false,
    onFilesChange,
}: AttachmentSelectorProps) {
    const [errors, setErrors] = useState<string[]>([]);

    function handleSelection(
        event: ChangeEvent<HTMLInputElement>,
    ) {
        const selectedFiles = Array.from(
            event.target.files ?? [],
        );

        const nextFiles = [...files];
        const nextErrors: string[] = [];

        for (const file of selectedFiles) {
            const extension = getExtension(file.name);
            const expectedMimeType =
                ALLOWED_FILE_TYPES[extension];

            if (
                !expectedMimeType ||
                file.type !== expectedMimeType
            ) {
                nextErrors.push(
                    `${file.name}: Unsupported file type.`,
                );
                continue;
            }

            if (file.size === 0) {
                nextErrors.push(
                    `${file.name}: Empty files are not permitted.`,
                );
                continue;
            }

            if (file.size > MAX_FILE_SIZE) {
                nextErrors.push(
                    `${file.name}: File must not exceed 5 MB.`,
                );
                continue;
            }

            const duplicate = nextFiles.some(
                (existingFile) =>
                    fileIdentity(existingFile) ===
                    fileIdentity(file),
            );

            if (duplicate) {
                nextErrors.push(
                    `${file.name}: This file is already selected.`,
                );
                continue;
            }

            if (nextFiles.length >= MAX_FILES) {
                nextErrors.push(
                    `${file.name}: A maximum of five files may be selected.`,
                );
                continue;
            }

            nextFiles.push(file);
        }

        onFilesChange(nextFiles);
        setErrors(nextErrors);

        event.target.value = "";
    }

    function removeFile(fileToRemove: File) {
        const identity = fileIdentity(fileToRemove);

        onFilesChange(
            files.filter(
                (file) => fileIdentity(file) !== identity,
            ),
        );
    }

    return (
        <div className="col-12">
            <label
                htmlFor="attachments"
                className="form-label"
            >
                Attachments
            </label>

            <input
                id="attachments"
                type="file"
                className="form-control"
                accept=".jpg,.jpeg,.png,.webp,.pdf"
                multiple
                disabled={disabled}
                onChange={handleSelection}
            />

            <div className="form-text">
                Up to five JPG, JPEG, PNG, WEBP, or PDF files.
                Maximum 5 MB each. Files upload after the Ticket
                is created.
            </div>

            {errors.length > 0 && (
                <div
                    className="alert alert-danger mt-3 mb-0"
                    role="alert"
                >
                    <ul className="mb-0">
                        {errors.map((error) => (
                            <li key={error}>{error}</li>
                        ))}
                    </ul>
                </div>
            )}

            {files.length > 0 && (
                <ul
                    className="list-group mt-3"
                    aria-label="Selected attachments"
                >
                    {files.map((file) => (
                        <li
                            key={fileIdentity(file)}
                            className="list-group-item d-flex align-items-center justify-content-between gap-3"
                        >
                            <div>
                                <strong className="d-block">
                                    {file.name}
                                </strong>

                                <span className="text-secondary small">
                                    {file.type} ·{" "}
                                    {formatFileSize(file.size)}
                                </span>
                            </div>

                            <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                disabled={disabled}
                                aria-label={`Remove ${file.name}`}
                                onClick={() => removeFile(file)}
                            >
                                Remove
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}