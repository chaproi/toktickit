import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ApiRequestError,
  getTicketDetail,
  type DevelopmentRequester,
  type RequestedPriority,
  type TicketDetail,
  type TicketStatus,
} from "../api.js";
import AttachmentSection from "./AttachmentSection.js";

interface RequesterTicketDetailProps {
  requester: DevelopmentRequester;
}

type DetailState = "loading" | "success" | "error";

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

function badgeClass(
  value: RequestedPriority | TicketStatus,
): string {
  if (value === "URGENT" || value === "CANCELLED") {
    return "text-bg-danger";
  }

  if (value === "HIGH" || value === "PENDING_REQUESTER") {
    return "text-bg-warning";
  }

  if (
    value === "LOW" ||
    value === "RESOLVED" ||
    value === "CLOSED"
  ) {
    return "text-bg-secondary";
  }

  return "text-bg-success";
}

function ReadOnlyValue({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="ticket-detail-label">{label}</dt>
      <dd className="read-only-field ticket-detail-value">
        {children}
      </dd>
    </div>
  );
}

export default function RequesterTicketDetail({
  requester,
}: RequesterTicketDetailProps) {
  const { ticketId: ticketIdParameter = "" } = useParams();
  const ticketId = Number(ticketIdParameter);
  const [detailState, setDetailState] =
    useState<DetailState>("loading");
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [retryVersion, setRetryVersion] = useState(0);
  const [attachmentInitialLoadComplete, setAttachmentInitialLoadComplete] =
    useState(false);

  const completeAttachmentInitialLoad = useCallback(() => {
    setAttachmentInitialLoadComplete(true);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setDetailState("loading");
    setTicket(null);
    setErrorMessage("");
    setAttachmentInitialLoadComplete(false);

    void getTicketDetail(
      requester.id,
      ticketId,
      controller.signal,
    )
      .then((loadedTicket) => {
        setTicket(loadedTicket);
        setDetailState("success");
      })
      .catch((error: unknown) => {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        const isSafeDenial =
          error instanceof ApiRequestError &&
          (error.status === 403 || error.status === 404);
        setErrorMessage(
          isSafeDenial
            ? "Ticket not found."
            : error instanceof ApiRequestError
              ? error.message
              : "Something went wrong. Please try again.",
        );
        setDetailState("error");
      });

    return () => controller.abort();
  }, [requester.id, ticketId, retryVersion]);

  if (detailState === "loading") {
    return (
      <section aria-labelledby="ticket-detail-heading">
        <h1 id="ticket-detail-heading" className="h2">
          Loading Ticket Detail
        </h1>
        <div className="ticket-detail-state" role="status">
          Loading Ticket Detail…
        </div>
      </section>
    );
  }

  if (detailState === "error" || !ticket) {
    const isNotFound = errorMessage === "Ticket not found.";

    return (
      <section aria-labelledby="ticket-detail-heading">
        <h1 id="ticket-detail-heading" className="h2">
          Ticket Detail
        </h1>
        <div className="ticket-detail-state" role="alert">
          <div>
            <p className="mb-3">{errorMessage}</p>
            <div className="d-flex flex-wrap justify-content-center gap-2">
              {!isNotFound && (
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={() =>
                    setRetryVersion((current) => current + 1)
                  }
                >
                  Try Again
                </button>
              )}
              <Link className="btn btn-outline-success" to="/tickets">
                Back to My Tickets
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className="ticket-detail-page"
      aria-labelledby="ticket-detail-heading"
    >
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-4">
        <div>
          <h1 id="ticket-detail-heading" className="h2 mb-2">
            {attachmentInitialLoadComplete
              ? "Ticket Detail"
              : "Loading Ticket Detail"}
          </h1>
          <p className="ticket-detail-number mb-0">
            Official Ticket {ticket.ticketNumber}
          </p>
        </div>
        <Link className="btn btn-outline-success" to="/tickets">
          Back to My Tickets
        </Link>
      </div>

      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body p-4">
          <p className="text-secondary mb-4">
            Ticket information is read-only.
          </p>
          <dl className="ticket-detail-grid mb-0">
            <ReadOnlyValue label="Ticket Number">
              <span className="ticket-number-link">
                {ticket.ticketNumber}
              </span>
            </ReadOnlyValue>
            <ReadOnlyValue label="Ticket Date">
              <time dateTime={ticket.ticketDate}>
                {formatDate(ticket.ticketDate)}
              </time>
            </ReadOnlyValue>
            <ReadOnlyValue label="Development Requester">
              {ticket.requester.name}
            </ReadOnlyValue>
            <ReadOnlyValue label="Category">
              {ticket.category.name}
            </ReadOnlyValue>
            <ReadOnlyValue label="Related System">
              {ticket.relatedSystem.name}
            </ReadOnlyValue>
            <ReadOnlyValue label="Priority">
              <span
                className={`badge ${badgeClass(
                  ticket.requestedPriority,
                )}`}
              >
                {ticket.requestedPriority}
              </span>
            </ReadOnlyValue>
            <ReadOnlyValue label="Status">
              <span
                className={`badge ${badgeClass(
                  ticket.currentStatus,
                )}`}
              >
                {ticket.currentStatus}
              </span>
            </ReadOnlyValue>
            <ReadOnlyValue label="Created">
              <time dateTime={ticket.createdAt}>
                {formatDate(ticket.createdAt)}
              </time>
            </ReadOnlyValue>
            <ReadOnlyValue label="Updated">
              <time dateTime={ticket.updatedAt}>
                {formatDate(ticket.updatedAt)}
              </time>
            </ReadOnlyValue>
            <ReadOnlyValue
              label="Summary"
              className="ticket-detail-wide"
            >
              {ticket.summary}
            </ReadOnlyValue>
            <ReadOnlyValue
              label="Description"
              className="ticket-detail-wide"
            >
              <span className="ticket-detail-description">
                {ticket.description}
              </span>
            </ReadOnlyValue>
          </dl>
        </div>
      </div>

      <AttachmentSection
        key={`${requester.id}-${ticket.id}`}
        requesterId={requester.id}
        ticketId={ticket.id}
        onInitialLoadComplete={completeAttachmentInitialLoad}
      />
    </section>
  );
}
