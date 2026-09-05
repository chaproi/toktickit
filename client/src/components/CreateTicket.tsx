import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type FormEvent,
} from "react";
import { Link } from "react-router-dom";
import AttachmentSelector from "./AttachmentSelector.js";
import {
    ApiRequestError,
    createTicket,
    getCategories,
    getRelatedSystems,
    uploadAttachment,
    type Category,
    type CreatedTicket,
    type DevelopmentRequester,
    type RelatedSystem,
    type RequestedPriority,
} from "../api.js";

interface CreateTicketProps {
    requester: DevelopmentRequester;
}

type ReferenceState = "loading" | "ready" | "error";

type SubmissionState =
    | "idle"
    | "submitting"
    | "success"
    | "error";

type FieldName =
    | "categoryId"
    | "relatedSystemId"
    | "priority"
    | "summary"
    | "description";

interface FormValues {
    categoryId: string;
    relatedSystemId: string;
    priority: string;
    summary: string;
    description: string;
}

type FieldErrors = Partial<Record<FieldName, string>>;

const INITIAL_FORM: FormValues = {
    categoryId: "",
    relatedSystemId: "",
    priority: "",
    summary: "",
    description: "",
};

const FIELD_NAMES: FieldName[] = [
    "categoryId",
    "relatedSystemId",
    "priority",
    "summary",
    "description",
];

function generateSubmissionId(): string {
    if (
        typeof globalThis.crypto !== "undefined" &&
        typeof globalThis.crypto.randomUUID === "function"
    ) {
        return globalThis.crypto.randomUUID();
    }

    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
        /[xy]/g,
        (character) => {
            const randomValue = Math.floor(Math.random() * 16);
            const value =
                character === "x"
                    ? randomValue
                    : (randomValue & 0x3) | 0x8;

            return value.toString(16);
        },
    );
}

function validateField(
    field: FieldName,
    value: string,
): string | undefined {
    const trimmedValue = value.trim();

    switch (field) {
        case "categoryId":
            return trimmedValue
                ? undefined
                : "Category is required";

        case "relatedSystemId":
            return trimmedValue
                ? undefined
                : "Related System is required";

        case "priority":
            return trimmedValue
                ? undefined
                : "Priority is required";

        case "summary":
            if (!trimmedValue) {
                return "Summary is required";
            }

            if (
                trimmedValue.length < 5 ||
                trimmedValue.length > 150
            ) {
                return "Summary must contain between 5 and 150 characters";
            }

            return undefined;

        case "description":
            if (!trimmedValue) {
                return "Description is required";
            }

            if (
                trimmedValue.length < 10 ||
                trimmedValue.length > 5000
            ) {
                return "Description must contain between 10 and 5000 characters";
            }

            return undefined;
    }
}
function RequiredMark() {
    return (
        <>
            <span
                className="text-danger"
                aria-hidden="true"
            >
                {" *"}
            </span>

            <span className="visually-hidden">
                {" required"}
            </span>
        </>
    );
}
export default function CreateTicket({
    requester,
}: CreateTicketProps) {
    const errorSummaryRef = useRef<HTMLDivElement>(null);
    const submissionIdRef = useRef<string | null>(null);

    const [referenceState, setReferenceState] =
        useState<ReferenceState>("loading");

    const [submissionState, setSubmissionState] =
        useState<SubmissionState>("idle");

    const [categories, setCategories] = useState<Category[]>(
        [],
    );

    const [relatedSystems, setRelatedSystems] = useState<
        RelatedSystem[]
    >([]);

    const [form, setForm] =
        useState<FormValues>(INITIAL_FORM);

    const [errors, setErrors] = useState<FieldErrors>({});
    const [showErrorSummary, setShowErrorSummary] =
        useState(false);

    const [apiError, setApiError] = useState<string | null>(
        null,
    );

    const [createdTicket, setCreatedTicket] =
        useState<CreatedTicket | null>(null);

    const [selectedFiles, setSelectedFiles] =
        useState<File[]>([]);

    const [attachmentSelectorKey, setAttachmentSelectorKey] =
        useState(0);

    const [failedAttachmentNames, setFailedAttachmentNames] =
        useState<string[]>([]);

    const loadReferenceData = useCallback(async () => {
        setReferenceState("loading");

        try {
            const [categoryRecords, systemRecords] =
                await Promise.all([
                    getCategories(),
                    getRelatedSystems(),
                ]);

            setCategories(categoryRecords);
            setRelatedSystems(systemRecords);
            setReferenceState("ready");
        } catch {
            setCategories([]);
            setRelatedSystems([]);
            setReferenceState("error");
        }
    }, []);

    useEffect(() => {
        void loadReferenceData();
    }, [loadReferenceData]);

    function updateField(
        field: FieldName,
        value: string,
    ) {
        setForm((current) => ({
            ...current,
            [field]: value,
        }));

        if (errors[field]) {
            setErrors((current) => ({
                ...current,
                [field]: validateField(field, value),
            }));
        }

        if (submissionState === "error") {
            submissionIdRef.current = null;
            setSubmissionState("idle");
            setApiError(null);
        }
    }

    function validateOnBlur(field: FieldName) {
        setErrors((current) => ({
            ...current,
            [field]: validateField(field, form[field]),
        }));
    }
    function handleClearForm() {
        setForm(INITIAL_FORM);
        setSelectedFiles([]);
        setAttachmentSelectorKey((current) => current + 1);
        setErrors({});
        setShowErrorSummary(false);
        setApiError(null);
        setCreatedTicket(null);
        setFailedAttachmentNames([]);
        setSubmissionState("idle");
        submissionIdRef.current = null;
    }
    async function handleSubmit(
        event: FormEvent<HTMLFormElement>,
    ) {
        event.preventDefault();

        if (submissionState === "submitting") {
            return;
        }

        const nextErrors: FieldErrors = {};

        for (const field of FIELD_NAMES) {
            const message = validateField(field, form[field]);

            if (message) {
                nextErrors[field] = message;
            }
        }

        setErrors(nextErrors);

        if (Object.keys(nextErrors).length > 0) {
            setShowErrorSummary(true);

            window.requestAnimationFrame(() => {
                errorSummaryRef.current?.focus();
            });

            return;
        }

        setShowErrorSummary(false);
        setApiError(null);
        setSubmissionState("submitting");

        const clientSubmissionId =
            submissionIdRef.current ??
            generateSubmissionId();

        submissionIdRef.current = clientSubmissionId;

        try {
            const response = await createTicket(requester.id, {
                clientSubmissionId,
                categoryId: Number(form.categoryId),
                relatedSystemId: Number(
                    form.relatedSystemId,
                ),
                requestedPriority:
                    form.priority as RequestedPriority,
                summary: form.summary.trim(),
                description: form.description.trim(),
            });

            const failedFiles: string[] = [];

            for (const file of selectedFiles) {
                try {
                    await uploadAttachment(
                        requester.id,
                        response.ticket.id,
                        file,
                    );
                } catch {
                    failedFiles.push(file.name);
                }
            }

            setFailedAttachmentNames(failedFiles);

            setCreatedTicket(response.ticket);
            setSubmissionState("success");
        } catch (error) {
            const message =
                error instanceof ApiRequestError
                    ? error.message
                    : "Unable to create the Ticket. Please try again.";

            setApiError(message);
            setSubmissionState("error");
        }
    }

    if (referenceState === "loading") {
        return (
            <section aria-labelledby="create-ticket-heading">
                <h1 id="create-ticket-heading">
                    Create Ticket
                </h1>

                <p role="status">
                    Loading ticket reference data…
                </p>
            </section>
        );
    }

    if (referenceState === "error") {
        return (
            <section aria-labelledby="create-ticket-heading">
                <h1 id="create-ticket-heading">
                    Create Ticket
                </h1>

                <div className="alert alert-danger" role="alert">
                    Unable to load ticket reference data. Please try
                    again.
                </div>

                <button
                    type="button"
                    className="btn btn-outline-success"
                    onClick={() => void loadReferenceData()}
                >
                    Retry
                </button>
            </section>
        );
    }

    if (
        submissionState === "success" &&
        createdTicket
    ) {
        return (
            <section aria-labelledby="create-ticket-heading">
                <h1 id="create-ticket-heading" className="h2 mb-4">
                    Create Ticket
                </h1>

                <div
                    className="card border-success shadow-sm"
                    role="status"
                >
                    <div className="card-body p-4">
                        <h2 className="h4 text-success">
                            Ticket Created Successfully
                        </h2>

                        {failedAttachmentNames.length > 0 && (
                            <div
                                className="alert alert-warning"
                                role="alert"
                            >
                                <p className="mb-2">
                                    Ticket created, but some attachments
                                    could not be uploaded.
                                </p>

                                <ul className="mb-0">
                                    {failedAttachmentNames.map((filename) => (
                                        <li key={filename}>{filename}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <p className="mb-1">
                            Ticket Number
                        </p>

                        <p className="fs-4 fw-semibold">
                            {createdTicket.ticketNumber}
                        </p>

                        <p className="mb-1">
                            Ticket Date
                        </p>

                        <p>
                            <time dateTime={createdTicket.ticketDate}>
                                {new Date(
                                    createdTicket.ticketDate,
                                ).toLocaleString()}
                            </time>
                        </p>

                        <p>
                            Current Status:{" "}
                            <strong>
                                {createdTicket.currentStatus}
                            </strong>
                        </p>

                        <div className="d-flex flex-wrap gap-2">
                            <Link
                                className="btn btn-success"
                                to={`/tickets/${createdTicket.id}`}
                            >
                                Open Ticket
                            </Link>

                            <Link
                                className="btn btn-outline-success"
                                to="/tickets"
                            >
                                My Tickets
                            </Link>
                        </div>
                    </div>
                </div>
            </section>
        );
    }

    const isSubmitting =
        submissionState === "submitting";

    return (
        <section aria-labelledby="create-ticket-heading">
            <div className="mb-4">
                <h1 id="create-ticket-heading" className="h2">
                    Create Ticket
                </h1>

                <p className="text-secondary mb-0">
                    Submit a new IT support request.
                </p>
            </div>

            {showErrorSummary && (
                <div
                    ref={errorSummaryRef}
                    className="alert alert-danger"
                    role="alert"
                    tabIndex={-1}
                >
                    Please correct the highlighted fields before
                    creating the Ticket.
                </div>
            )}

            {apiError && (
                <div className="alert alert-danger" role="alert">
                    {apiError}
                </div>
            )}

            <div className="card border-0 shadow-sm">
                <div className="card-body p-4">
                    <h2 className="h5">
                        Requester information
                    </h2>

                    <div className="read-only-field mb-4">
                        <strong className="d-block">
                            {requester.name}
                        </strong>

                        <span className="text-secondary">
                            {requester.email}
                        </span>
                    </div>

                    <form noValidate onSubmit={handleSubmit}>
                        <div className="row g-3">
                            <div className="col-md-6">
                                <label className="form-label">
                                    Ticket Number
                                </label>

                                <p className="form-control-plaintext read-only-field">
                                    Generated after creation
                                </p>
                            </div>

                            <div className="col-md-6">
                                <label className="form-label">
                                    Ticket Date
                                </label>

                                <p className="form-control-plaintext read-only-field">
                                    Assigned by server on creation
                                </p>
                            </div>
                            <div className="col-md-4">
                                <label className="form-label">
                                    Current Status
                                </label>

                                <p className="form-control-plaintext read-only-field">
                                    NEW after creation
                                </p>
                            </div>

                            <div className="col-md-4">
                                <label className="form-label">
                                    IT Priority
                                </label>

                                <p className="form-control-plaintext read-only-field">
                                    Not assigned
                                </p>
                            </div>

                            <div className="col-md-4">
                                <label className="form-label">
                                    Ticket Owner
                                </label>

                                <p className="form-control-plaintext read-only-field">
                                    Not assigned
                                </p>
                            </div>

                            <div className="col-md-6">
                                <label
                                    htmlFor="category"
                                    className="form-label"
                                >
                                    Category
                                    <RequiredMark />
                                </label>

                                <select
                                    id="category"
                                    className={`form-select ${errors.categoryId
                                        ? "is-invalid"
                                        : ""
                                        }`}
                                    value={form.categoryId}
                                    disabled={isSubmitting}
                                    onChange={(event) =>
                                        updateField(
                                            "categoryId",
                                            event.target.value,
                                        )
                                    }
                                    onBlur={() =>
                                        validateOnBlur("categoryId")
                                    }
                                    aria-invalid={Boolean(
                                        errors.categoryId,
                                    )}
                                    required
                                >
                                    <option value="">
                                        Select a category
                                    </option>

                                    {categories.map((category) => (
                                        <option
                                            key={category.id}
                                            value={category.id}
                                        >
                                            {category.name}
                                        </option>
                                    ))}
                                </select>

                                {errors.categoryId && (
                                    <div className="invalid-feedback">
                                        {errors.categoryId}
                                    </div>
                                )}
                            </div>

                            <div className="col-md-6">
                                <label
                                    htmlFor="related-system"
                                    className="form-label"
                                >
                                    Related System
                                    <RequiredMark />
                                </label>

                                <select
                                    id="related-system"
                                    className={`form-select ${errors.relatedSystemId
                                        ? "is-invalid"
                                        : ""
                                        }`}
                                    value={form.relatedSystemId}
                                    disabled={isSubmitting}
                                    onChange={(event) =>
                                        updateField(
                                            "relatedSystemId",
                                            event.target.value,
                                        )
                                    }
                                    onBlur={() =>
                                        validateOnBlur("relatedSystemId")
                                    }
                                    aria-invalid={Boolean(
                                        errors.relatedSystemId,
                                    )}
                                    required
                                >
                                    <option value="">
                                        Select a related system
                                    </option>

                                    {relatedSystems.map((system) => (
                                        <option
                                            key={system.id}
                                            value={system.id}
                                        >
                                            {system.name}
                                        </option>
                                    ))}
                                </select>

                                {errors.relatedSystemId && (
                                    <div className="invalid-feedback">
                                        {errors.relatedSystemId}
                                    </div>
                                )}
                            </div>

                            <div className="col-md-6">
                                <label
                                    htmlFor="priority"
                                    className="form-label"
                                >
                                    Priority
                                    <RequiredMark />
                                </label>

                                <select
                                    id="priority"
                                    className={`form-select ${errors.priority
                                        ? "is-invalid"
                                        : ""
                                        }`}
                                    value={form.priority}
                                    disabled={isSubmitting}
                                    onChange={(event) =>
                                        updateField(
                                            "priority",
                                            event.target.value,
                                        )
                                    }
                                    onBlur={() =>
                                        validateOnBlur("priority")
                                    }
                                    aria-invalid={Boolean(
                                        errors.priority,
                                    )}
                                    required
                                >
                                    <option value="">
                                        Select a priority
                                    </option>

                                    {[
                                        "LOW",
                                        "MEDIUM",
                                        "HIGH",
                                        "URGENT",
                                    ].map((priority) => (
                                        <option
                                            key={priority}
                                            value={priority}
                                        >
                                            {priority}
                                        </option>
                                    ))}
                                </select>

                                {errors.priority && (
                                    <div className="invalid-feedback">
                                        {errors.priority}
                                    </div>
                                )}
                            </div>

                            <div className="col-12">
                                <label
                                    htmlFor="summary"
                                    className="form-label"
                                >
                                    Summary
                                    <RequiredMark />
                                </label>

                                <input
                                    id="summary"
                                    className={`form-control ${errors.summary
                                        ? "is-invalid"
                                        : ""
                                        }`}
                                    value={form.summary}
                                    disabled={isSubmitting}
                                    maxLength={150}
                                    onChange={(event) =>
                                        updateField(
                                            "summary",
                                            event.target.value,
                                        )
                                    }
                                    onBlur={() =>
                                        validateOnBlur("summary")
                                    }
                                    aria-invalid={Boolean(
                                        errors.summary,
                                    )}
                                    required
                                />

                                <div className="form-text">
                                    5–150 characters
                                </div>

                                {errors.summary && (
                                    <div className="invalid-feedback">
                                        {errors.summary}
                                    </div>
                                )}
                            </div>

                            <div className="col-12">
                                <label
                                    htmlFor="description"
                                    className="form-label"
                                >
                                    Description
                                    <RequiredMark />
                                </label>

                                <textarea
                                    id="description"
                                    className={`form-control ${errors.description
                                        ? "is-invalid"
                                        : ""
                                        }`}
                                    rows={6}
                                    value={form.description}
                                    disabled={isSubmitting}
                                    maxLength={5000}
                                    onChange={(event) =>
                                        updateField(
                                            "description",
                                            event.target.value,
                                        )
                                    }
                                    onBlur={() =>
                                        validateOnBlur("description")
                                    }
                                    aria-invalid={Boolean(
                                        errors.description,
                                    )}
                                    required
                                />

                                <div className="form-text">
                                    10–5000 characters
                                </div>

                                {errors.description && (
                                    <div className="invalid-feedback">
                                        {errors.description}
                                    </div>
                                )}
                            </div>

                            <AttachmentSelector
                                key={attachmentSelectorKey}
                                files={selectedFiles}
                                disabled={isSubmitting}
                                onFilesChange={setSelectedFiles}
                            />

                            <div className="col-12 d-flex flex-wrap gap-2">
                                <button
                                    type="submit"
                                    className="btn btn-success"
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting
                                        ? "Creating…"
                                        : "Create Ticket"}
                                </button>

                                <button
                                    type="button"
                                    className="btn btn-outline-secondary"
                                    disabled={isSubmitting}
                                    onClick={handleClearForm}
                                >
                                    Clear Form
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </section>
    );
}