import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Link, useParams } from "react-router-dom";
import {
  ApiRequestError,
  addPublicComment,
  getPublicComments,
  getTicketDetail,
  indicateResolution,
  type PublicComment,
  type PublicCommentResponse,
  type RequestedPriority,
  type TicketDetail,
  type TicketStatus,
} from "../api.js";
import AttachmentSection from "./AttachmentSection.js";

type LoadState = "loading" | "success" | "error";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function enumLabel(value: string): string {
  return value.toLowerCase().split("_").map((part) =>
    part[0]?.toUpperCase() + part.slice(1),
  ).join(" ");
}

function badgeClass(value: RequestedPriority | TicketStatus): string {
  if (value === "URGENT" || value === "CANCELLED") return "text-bg-danger";
  if (value === "HIGH" || value === "WAITING_FOR_REQUESTER") return "text-bg-warning";
  if (value === "LOW" || value === "RESOLVED" || value === "CLOSED") {
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
      <dd className="read-only-field ticket-detail-value">{children}</dd>
    </div>
  );
}

const COMMENT_PAGE_SIZE = 20;
const SAFE_COMMENT_ERROR = "Something went wrong. Please try again.";
const COMMENT_REFRESH_WARNING =
  "Your comment was posted, but the latest comments could not be refreshed. Please try again.";

function includeCreatedComment(
  items: PublicComment[],
  created: PublicComment,
): PublicComment[] {
  return [...items.filter(({ id }) => id !== created.id), created].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt) || left.id - right.id);
}

function PublicComments({ ticketId }: { ticketId: number }) {
  const [state, setState] = useState<LoadState>("loading");
  const [items, setItems] = useState<PublicComment[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [content, setContent] = useState("");
  const [listError, setListError] = useState("");
  const [postError, setPostError] = useState("");
  const [refreshWarning, setRefreshWarning] = useState("");
  const [posting, setPosting] = useState(false);
  const [retry, setRetry] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const loadSequenceRef = useRef(0);
  const retainedCreatedRef = useRef<{
    comment: PublicComment;
    page: number;
  } | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const sequence = ++loadSequenceRef.current;
    setState("loading");
    setListError("");
    setRefreshWarning("");
    try {
      const response = await getPublicComments(ticketId, page, COMMENT_PAGE_SIZE, signal);
      if (sequence !== loadSequenceRef.current) return;
      const retained = retainedCreatedRef.current?.page === page
        ? retainedCreatedRef.current.comment
        : null;
      setItems(retained ? includeCreatedComment(response.items, retained) : response.items);
      setTotalPages(response.pagination.totalPages);
      setTotalItems(response.pagination.totalItems);
      setState("success");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      if (sequence !== loadSequenceRef.current) return;
      const retained = retainedCreatedRef.current?.page === page
        ? retainedCreatedRef.current.comment
        : null;
      if (retained) {
        setItems((current) => includeCreatedComment(current, retained));
        setRefreshWarning(COMMENT_REFRESH_WARNING);
        setState("success");
      } else {
        setListError(SAFE_COMMENT_ERROR);
        setState("error");
      }
    }
  }, [page, ticketId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, retry]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (posting) return;
    const trimmed = content.trim();
    if (trimmed.length < 1 || trimmed.length > 2_000) {
      setPostError("Comment must contain between 1 and 2000 characters.");
      inputRef.current?.focus();
      return;
    }
    setPosting(true);
    setPostError("");
    setRefreshWarning("");
    try {
      const created = await addPublicComment(ticketId, trimmed);
      setContent("");
      const sequence = ++loadSequenceRef.current;
      try {
        const firstResponse = await getPublicComments(ticketId, 1, COMMENT_PAGE_SIZE);
        let locatedResponse: PublicCommentResponse | null = firstResponse.items.some(({ id }) => id === created.id)
          ? firstResponse
          : null;

        for (
          let candidatePage = firstResponse.pagination.totalPages;
          locatedResponse === null && candidatePage >= 2;
          candidatePage -= 1
        ) {
          const candidate = await getPublicComments(ticketId, candidatePage, COMMENT_PAGE_SIZE);
          if (candidate.items.some(({ id }) => id === created.id)) locatedResponse = candidate;
        }

        if (locatedResponse === null) {
          const nextAuthoritativePage = Math.max(2, firstResponse.pagination.totalPages + 1);
          const candidate = await getPublicComments(ticketId, nextAuthoritativePage, COMMENT_PAGE_SIZE);
          if (candidate.items.some(({ id }) => id === created.id)) locatedResponse = candidate;
        }

        if (locatedResponse === null) throw new Error("Created Comment was not found in authoritative pagination.");
        if (sequence !== loadSequenceRef.current) return;

        const authoritativePage = locatedResponse.pagination.page;
        retainedCreatedRef.current = { comment: created, page: authoritativePage };
        setItems(includeCreatedComment(locatedResponse.items, created));
        setTotalItems(locatedResponse.pagination.totalItems);
        setTotalPages(locatedResponse.pagination.totalPages);
        setListError("");
        setState("success");
        setPage(authoritativePage);
      } catch {
        if (sequence !== loadSequenceRef.current) return;
        retainedCreatedRef.current = { comment: created, page };
        setItems((current) => includeCreatedComment(current, created));
        setTotalItems((current) => Math.max(current + 1, 1));
        setTotalPages((current) => Math.max(current, page, 1));
        setListError("");
        setRefreshWarning(COMMENT_REFRESH_WARNING);
        setState("success");
      }
    } catch {
      setPostError(SAFE_COMMENT_ERROR);
    } finally {
      setPosting(false);
    }
  }

  return (
    <section className="card border-0 shadow-sm mb-4" aria-labelledby="comments-heading">
      <div className="card-body p-4">
        <h2 id="comments-heading" className="h4">Public Comments</h2>
        {state === "loading" && <p role="status">Loading public comments…</p>}
        {state === "error" && (
          <div className="alert alert-danger" role="alert">
            <p>{listError}</p>
            <button className="btn btn-outline-danger" type="button" onClick={() => setRetry((value) => value + 1)}>Try Again</button>
          </div>
        )}
        {refreshWarning && <div className="alert alert-warning" role="status">{refreshWarning}</div>}
        {state === "success" && items.length === 0 && <p>No public comments yet.</p>}
        {state === "success" && items.length > 0 && (
          <ol className="public-comment-list">
            {items.map((comment) => (
              <li key={comment.id} className="public-comment-item">
                <p className="mb-1"><strong>{comment.author.name}</strong> <span className="badge text-bg-light">{enumLabel(comment.author.role)}</span></p>
                <p className="mb-1 public-comment-content">{comment.content}</p>
                <time className="text-secondary small" dateTime={comment.createdAt}>{formatDate(comment.createdAt)}</time>
              </li>
            ))}
          </ol>
        )}
        {totalPages > 1 && (
          <div className="d-flex gap-2 mb-4">
            <button className="btn btn-outline-success" type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous comments</button>
            <span className="align-self-center">Page {page} of {totalPages} · {totalItems} comments</span>
            <button className="btn btn-outline-success" type="button" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Next comments</button>
          </div>
        )}
        <form onSubmit={(event) => void submit(event)}>
          <label className="form-label fw-semibold" htmlFor="public-comment">Add a public comment</label>
          <p className="form-text">Visible to you and the support team.</p>
          <textarea
            ref={inputRef}
            id="public-comment"
            className="form-control"
            rows={4}
            maxLength={2_000}
            disabled={posting}
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
          <p className="form-text">{content.length}/2000 characters</p>
          {postError && <div className="alert alert-danger" role="alert">{postError}</div>}
          <button className="btn btn-success" type="submit" disabled={posting}>
            {posting ? "Posting…" : "Post comment"}
          </button>
        </form>
      </div>
    </section>
  );
}

const RESOLUTION_STATUSES = new Set<TicketStatus>([
  "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED",
]);

function isResolutionEligible(ticket: TicketDetail): boolean {
  return RESOLUTION_STATUSES.has(ticket.currentStatus) &&
    ticket.requesterResolutionIndicatedAt === null;
}

export default function RequesterTicketDetail() {
  const { ticketId: parameter = "" } = useParams();
  const ticketId = Number(parameter);
  const [state, setState] = useState<LoadState>("loading");
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [indicating, setIndicating] = useState(false);
  const [indicationError, setIndicationError] = useState("");
  const resolutionTriggerRef = useRef<HTMLButtonElement>(null);
  const resolutionDialogRef = useRef<HTMLDivElement>(null);
  const resolutionCancelRef = useRef<HTMLButtonElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const errorHeadingRef = useRef<HTMLHeadingElement>(null);
  const backgroundRef = useRef<HTMLDivElement>(null);
  const [restoreFocusTarget, setRestoreFocusTarget] = useState<
    "trigger" | "heading" | "error" | null
  >(null);

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    setError("");
    void getTicketDetail(ticketId, controller.signal)
      .then((response) => {
        setTicket(response);
        setState("success");
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        const notFound = caught instanceof ApiRequestError && (caught.status === 403 || caught.status === 404);
        setError(notFound ? "Ticket not found." : caught instanceof ApiRequestError ? caught.message : "Something went wrong. Please try again.");
        setState("error");
      });
    return () => controller.abort();
  }, [retry, ticketId]);

  useEffect(() => {
    const background = backgroundRef.current;
    if (dialogOpen) {
      background?.setAttribute("inert", "");
      resolutionCancelRef.current?.focus();
    } else {
      background?.removeAttribute("inert");
      if (restoreFocusTarget === "trigger") resolutionTriggerRef.current?.focus();
      if (restoreFocusTarget === "heading") detailHeadingRef.current?.focus();
      if (restoreFocusTarget === "error") errorHeadingRef.current?.focus();
      if (restoreFocusTarget !== null) setRestoreFocusTarget(null);
    }
    return () => background?.removeAttribute("inert");
  }, [dialogOpen, restoreFocusTarget, state, ticket]);

  function closeResolutionDialog(): void {
    if (indicating) return;
    setRestoreFocusTarget("trigger");
    setDialogOpen(false);
  }

  function handleResolutionDialogKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      closeResolutionDialog();
      return;
    }
    if (event.key !== "Tab" || indicating) return;
    const buttons = Array.from(
      resolutionDialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
    );
    if (buttons.length === 0) return;
    const first = buttons[0]!;
    const last = buttons.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function confirmResolution() {
    if (!ticket || indicating) return;
    setIndicating(true);
    setIndicationError("");
    try {
      const result = await indicateResolution(ticket.id);
      setTicket({
        ...ticket,
        currentStatus: result.currentStatus,
        requesterResolutionIndicatedAt: result.requesterResolutionIndicatedAt,
      });
      setRestoreFocusTarget("heading");
      setDialogOpen(false);
    } catch (caught) {
      if (caught instanceof ApiRequestError && [
        "RESOLUTION_INDICATION_NOT_ALLOWED",
        "CONCURRENT_UPDATE",
      ].includes(caught.code ?? "")) {
        setRestoreFocusTarget(null);
        setDialogOpen(false);
        try {
          const authoritative = await getTicketDetail(ticket.id);
          setTicket(authoritative);
          setIndicationError(isResolutionEligible(authoritative)
            ? "The Ticket changed. Review the latest details and try again."
            : "The Ticket changed and this action is no longer available.");
          setRestoreFocusTarget("heading");
        } catch {
          setTicket(null);
          setError("Something went wrong. Please try again.");
          setState("error");
          setRestoreFocusTarget("error");
        }
      } else {
        setIndicationError("Something went wrong. Please try again.");
      }
    } finally {
      setIndicating(false);
    }
  }

  if (state === "loading") {
    return <section><h1 className="h2">Loading Ticket Detail</h1><div className="ticket-detail-state" role="status">Loading Ticket Detail…</div></section>;
  }
  if (state === "error" || !ticket) {
    return (
      <section>
        <h1 ref={errorHeadingRef} className="h2" tabIndex={-1}>Ticket Detail</h1>
        <div className="ticket-detail-state" role="alert">
          <div>
            <p>{error}</p>
            {error !== "Ticket not found." && <button className="btn btn-success" type="button" onClick={() => setRetry((value) => value + 1)}>Try Again</button>}
            <Link className="btn btn-outline-success ms-2" to="/tickets">Back to My Tickets</Link>
          </div>
        </div>
      </section>
    );
  }

  const mayIndicate = isResolutionEligible(ticket) && !indicating;
  return (
    <section className="ticket-detail-page" aria-labelledby="ticket-detail-heading">
      <div ref={backgroundRef} aria-hidden={dialogOpen ? true : undefined}>
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-4">
        <div>
          <h1 ref={detailHeadingRef} id="ticket-detail-heading" className="h2 mb-2" tabIndex={-1}>Ticket Detail</h1>
          <p className="ticket-detail-number mb-0">{ticket.ticketNumber}</p>
        </div>
        <Link className="btn btn-outline-success" to="/tickets">Back to My Tickets</Link>
      </div>
      {indicationError && <div className="alert alert-warning" role="alert">{indicationError}</div>}
      {ticket.requesterResolutionIndicatedAt && (
        <div className="alert alert-success" role="status">
          <p className="mb-1">Problem appears resolved as of {formatDate(ticket.requesterResolutionIndicatedAt)}.</p>
          <p className="mb-0">Waiting for the support team to formally resolve this Ticket.</p>
        </div>
      )}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body p-4">
          <p className="text-secondary">Ticket information is read-only.</p>
          <dl className="ticket-detail-grid mb-0">
            <ReadOnlyValue label="Ticket Number">{ticket.ticketNumber}</ReadOnlyValue>
            <ReadOnlyValue label="Ticket Date"><time dateTime={ticket.ticketDate}>{formatDate(ticket.ticketDate)}</time></ReadOnlyValue>
            <ReadOnlyValue label="Requester">{ticket.requester.name}</ReadOnlyValue>
            <ReadOnlyValue label="Category">{ticket.category.name}</ReadOnlyValue>
            <ReadOnlyValue label="Related System">{ticket.relatedSystem.name}</ReadOnlyValue>
            <ReadOnlyValue label="Requested Priority"><span className={`badge ${badgeClass(ticket.requestedPriority)}`}>{enumLabel(ticket.requestedPriority)}</span></ReadOnlyValue>
            <ReadOnlyValue label="IT Priority"><span className={`badge ${badgeClass(ticket.itPriority)}`}>{enumLabel(ticket.itPriority)}</span></ReadOnlyValue>
            <ReadOnlyValue label="Owner">{ticket.owner?.name ?? "Unassigned"}</ReadOnlyValue>
            <ReadOnlyValue label="Status"><span className={`badge ${badgeClass(ticket.currentStatus)}`}>{enumLabel(ticket.currentStatus)}</span></ReadOnlyValue>
            <ReadOnlyValue label="Created"><time dateTime={ticket.createdAt}>{formatDate(ticket.createdAt)}</time></ReadOnlyValue>
            <ReadOnlyValue label="Updated"><time dateTime={ticket.updatedAt}>{formatDate(ticket.updatedAt)}</time></ReadOnlyValue>
            <ReadOnlyValue label="Summary" className="ticket-detail-wide">{ticket.summary}</ReadOnlyValue>
            <ReadOnlyValue label="Description" className="ticket-detail-wide"><span className="ticket-detail-description">{ticket.description}</span></ReadOnlyValue>
          </dl>
          {mayIndicate && (
            <button ref={resolutionTriggerRef} className="btn btn-outline-success mt-4" type="button" onClick={() => setDialogOpen(true)}>
              Problem Appears Resolved
            </button>
          )}
        </div>
      </div>
      <PublicComments ticketId={ticket.id} />
      <AttachmentSection ticketId={ticket.id} />
      </div>
      {dialogOpen && (
        <div className="attachment-dialog-backdrop">
          <div
            ref={resolutionDialogRef}
            className="attachment-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="resolution-heading"
            aria-describedby="resolution-description"
            onKeyDown={handleResolutionDialogKeyDown}
          >
            <h2 id="resolution-heading" className="h4">Does the problem appear resolved?</h2>
            <p id="resolution-description">This tells the support team the problem appears resolved. It does not formally resolve or close the Ticket.</p>
            <div className="d-flex justify-content-end gap-2">
              <button ref={resolutionCancelRef} className="btn btn-outline-secondary" type="button" disabled={indicating} onClick={closeResolutionDialog}>Cancel</button>
              <button className="btn btn-success" type="button" disabled={indicating} onClick={() => void confirmResolution()}>
                {indicating ? "Saving…" : "Yes, it appears resolved"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
