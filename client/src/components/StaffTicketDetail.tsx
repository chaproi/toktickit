import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Link, useParams } from "react-router-dom";
import {
  ApiRequestError,
  addInternalNote,
  addPublicComment,
  claimStaffTicket,
  getAttachmentContent,
  getAttachments,
  getInternalNotes,
  getPublicComments,
  getStaffAssignees,
  getStaffTicketDetail,
  setStaffTicketOwner,
  setStaffTicketPriority,
  setStaffTicketStatus,
  type Attachment,
  type EligibleAssignee,
  type InternalNote,
  type PublicComment,
  type PublicCommentResponse,
  type RequestedPriority,
  type StaffTicketDetail as StaffTicket,
  type TicketStatus,
} from "../api.js";

const SAFE_ERROR = "Something went wrong. Please try again.";
const TERMINAL = new Set<TicketStatus>(["CLOSED", "CANCELLED"]);
const OWNER_REQUIRED = new Set<TicketStatus>([
  "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED",
]);

function label(value: string): string {
  return value.toLowerCase().split("_").map((part) => `${part[0]?.toUpperCase()}${part.slice(1)}`).join(" ");
}

function date(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(parsed);
}

function Field({ name, children }: { name: string; children: ReactNode }) {
  return <div><dt className="fw-semibold">{name}</dt><dd>{children}</dd></div>;
}

function Dialog({
  title,
  description,
  initialFocus,
  processing,
  onClose,
  children,
}: {
  title: string;
  description: string;
  initialFocus: React.RefObject<HTMLElement | null>;
  processing: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = `dialog-title-${title.replaceAll(" ", "-").toLowerCase()}`;
  const descriptionId = `${titleId}-description`;
  useEffect(() => { initialFocus.current?.focus(); }, [initialFocus]);
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !processing) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), select:not(:disabled), textarea:not(:disabled), input:not(:disabled)",
    ) ?? []);
    if (controls.length === 0) return;
    const first = controls[0]!;
    const last = controls.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }
  return (
    <div className="attachment-dialog-backdrop">
      <div ref={dialog} className="attachment-dialog" role="dialog" aria-modal="true"
        aria-labelledby={titleId} aria-describedby={descriptionId} onKeyDown={keyDown}>
        <h2 id={titleId} className="h4">{title}</h2>
        <p id={descriptionId}>{description}</p>
        {children}
      </div>
    </div>
  );
}

function Messages({
  title,
  privateChannel,
  ticketId,
  initialResponse,
}: {
  title: "Public Comments" | "Internal Notes";
  privateChannel: boolean;
  ticketId: number;
  initialResponse: PublicCommentResponse | null;
}) {
  const [items, setItems] = useState<Array<PublicComment | InternalNote>>(initialResponse?.items ?? []);
  const [content, setContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [listError, setListError] = useState(initialResponse ? "" : SAFE_ERROR);
  const [postError, setPostError] = useState("");
  const [warning, setWarning] = useState("");
  const [page, setPage] = useState(initialResponse?.pagination.page ?? 1);
  const [pagination, setPagination] = useState(initialResponse?.pagination ?? null);
  useEffect(() => {
    setItems(initialResponse?.items ?? []);
    setPagination(initialResponse?.pagination ?? null);
    setPage(initialResponse?.pagination.page ?? 1);
    setListError(initialResponse ? "" : SAFE_ERROR);
  }, [initialResponse]);

  async function loadPage(targetPage: number) {
    setListError("");
    setWarning("");
    try {
      const response = privateChannel
        ? await getInternalNotes(ticketId, targetPage, 20)
        : await getPublicComments(ticketId, targetPage, 20);
      setItems(response.items);
      setPagination(response.pagination);
      setPage(targetPage);
    } catch {
      setListError(SAFE_ERROR);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (posting) return;
    const trimmed = content.trim();
    const maximum = privateChannel ? 5_000 : 2_000;
    if (!trimmed || trimmed.length > maximum) {
      setPostError(`${privateChannel ? "Internal Note" : "Comment"} must contain between 1 and ${maximum} characters.`);
      return;
    }
    setPosting(true);
    setPostError("");
    setWarning("");
    try {
      const created = privateChannel
        ? await addInternalNote(ticketId, trimmed)
        : await addPublicComment(ticketId, trimmed);
      setContent("");
      setListError("");
      try {
        const first = privateChannel
          ? await getInternalNotes(ticketId, 1, 20)
          : await getPublicComments(ticketId, 1, 20);
        let located: PublicCommentResponse | null = first.items.some(({ id }) => id === created.id)
          ? first
          : null;
        for (let candidate = first.pagination.totalPages; !located && candidate >= 2; candidate -= 1) {
          const response = privateChannel
            ? await getInternalNotes(ticketId, candidate, 20)
            : await getPublicComments(ticketId, candidate, 20);
          if (response.items.some(({ id }) => id === created.id)) located = response;
        }
        if (!located) {
          const candidate = Math.max(2, first.pagination.totalPages + 1);
          const response = privateChannel
            ? await getInternalNotes(ticketId, candidate, 20)
            : await getPublicComments(ticketId, candidate, 20);
          if (response.items.some(({ id }) => id === created.id)) located = response;
        }
        if (!located) throw new Error("Created entry was not returned by the authoritative list.");
        setItems(located.items);
        setPagination(located.pagination);
        setPage(located.pagination.page);
      } catch {
        setItems((current) => [...current.filter(({ id }) => id !== created.id), created]);
        setWarning(`Your ${privateChannel ? "Internal Note" : "comment"} was posted, but the latest list could not be refreshed.`);
      }
    } catch {
      setPostError(SAFE_ERROR);
    } finally {
      setPosting(false);
    }
  }

  const id = privateChannel ? "internal-notes-heading" : "public-comments-heading";
  return (
    <section className="card border-0 shadow-sm mb-4" aria-labelledby={id}>
      <div className="card-body p-4">
        <h2 id={id} className="h4">{title}</h2>
        <p>{privateChannel ? "Internal — not visible to Requester" : "Visible to the Requester and support team."}</p>
        {privateChannel && <p>This note is private to IT Staff and Administrators.</p>}
        {listError && <div className="alert alert-danger" role="alert">{listError} <button className="btn btn-sm btn-outline-danger" type="button" onClick={() => void loadPage(page)}>Try Again</button></div>}
        {warning && <div className="alert alert-warning" role="status">{warning}</div>}
        {!listError && items.length === 0 && <p>No {title.toLowerCase()} yet.</p>}
        <ol className="public-comment-list">
          {items.map((item) => <li className="public-comment-item" key={item.id}>
            <p className="mb-1"><strong>{item.author.name}</strong></p>
            <p className="mb-1">{item.content}</p>
            <time className="small text-secondary" dateTime={item.createdAt}>{date(item.createdAt)}</time>
          </li>)}
        </ol>
        {pagination && pagination.totalPages > 1 && <div className="d-flex align-items-center gap-2 mb-3">
          <button className="btn btn-outline-success" type="button" disabled={!pagination.hasPreviousPage} onClick={() => void loadPage(page - 1)}>Previous</button>
          <span>Page {page} of {pagination.totalPages}</span>
          <button className="btn btn-outline-success" type="button" disabled={!pagination.hasNextPage} onClick={() => void loadPage(page + 1)}>Next</button>
        </div>}
        <form onSubmit={(event) => void submit(event)}>
          <label className="form-label fw-semibold" htmlFor={privateChannel ? "internal-note" : "staff-public-comment"}>
            {privateChannel ? "Add an internal note" : "Add a public comment"}
          </label>
          <textarea id={privateChannel ? "internal-note" : "staff-public-comment"} className="form-control" rows={4}
            maxLength={privateChannel ? 5_000 : 2_000} disabled={posting} value={content}
            onChange={(event) => setContent(event.target.value)} />
          {postError && <div className="alert alert-danger mt-3" role="alert">{postError}</div>}
          <button className="btn btn-success mt-3" type="submit" disabled={posting}>
            {posting ? "Posting…" : privateChannel ? "Post internal note" : "Post comment"}
          </button>
        </form>
      </div>
    </section>
  );
}

function StaffAttachments({ ticketId }: { ticketId: number }) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void getAttachments(ticketId, controller.signal).then((response) => setItems(response.items)).catch((caught) => {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(SAFE_ERROR);
    });
    return () => controller.abort();
  }, [ticketId]);
  async function open(item: Attachment, disposition: "inline" | "attachment") {
    try {
      const blob = await getAttachmentContent(ticketId, item.id, disposition);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.target = disposition === "inline" ? "_blank" : "_self";
      if (disposition === "attachment") link.download = item.originalFilename;
      link.click();
      URL.revokeObjectURL(url);
    } catch { setError(SAFE_ERROR); }
  }
  return (
    <section className="card border-0 shadow-sm mb-4" aria-labelledby="staff-attachments-heading">
      <div className="card-body p-4">
        <h2 id="staff-attachments-heading" className="h4">Attachments</h2>
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        {items.length === 0 ? <p>No Attachments.</p> : <ul>
          {items.map((item) => <li key={item.id} className="mb-2">
            {item.originalFilename}{" "}{item.isRemoved
              ? <span className="badge text-bg-secondary">Removed</span>
              : <>
                <button className="btn btn-sm btn-outline-success" type="button" onClick={() => void open(item, "inline")}>Preview {item.originalFilename}</button>{" "}
                <button className="btn btn-sm btn-outline-success" type="button" onClick={() => void open(item, "attachment")}>Download {item.originalFilename}</button>
              </>}
          </li>)}
        </ul>}
      </div>
    </section>
  );
}

export default function StaffTicketDetail() {
  const { ticketId: parameter = "" } = useParams();
  const ticketId = Number(parameter);
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [ticket, setTicket] = useState<StaffTicket | null>(null);
  const [assignees, setAssignees] = useState<EligibleAssignee[]>([]);
  const [publicComments, setPublicComments] = useState<PublicCommentResponse | null>(null);
  const [internalNotes, setInternalNotes] = useState<PublicCommentResponse | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [priority, setPriority] = useState<RequestedPriority>("MEDIUM");
  const [nextStatus, setNextStatus] = useState<TicketStatus | "">("");
  const [dialog, setDialog] = useState<"owner" | "status" | null>(null);
  const [selectedOwner, setSelectedOwner] = useState("");
  const [reason, setReason] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const assignTriggerRef = useRef<HTMLButtonElement>(null);
  const ownerSelectRef = useRef<HTMLSelectElement>(null);
  const statusCancelRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (dialog) contentRef.current?.setAttribute("inert", "");
    else contentRef.current?.removeAttribute("inert");
    return () => contentRef.current?.removeAttribute("inert");
  }, [dialog]);

  const load = useCallback(async (signal?: AbortSignal, focus = false) => {
    setError("");
    try {
      const [detail, available, comments, notes] = await Promise.all([
        getStaffTicketDetail(ticketId, signal),
        getStaffAssignees(signal),
        getPublicComments(ticketId, 1, 20, signal).catch(() => null),
        getInternalNotes(ticketId, 1, 20, signal).catch(() => null),
      ]);
      setTicket(detail);
      setAssignees(available);
      setPublicComments(comments);
      setInternalNotes(notes);
      setPriority(detail.itPriority);
      setNextStatus("");
      setState("success");
      if (focus) headingRef.current?.focus();
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      const missing = caught instanceof ApiRequestError && [403, 404].includes(caught.status);
      setTicket(null);
      setError(missing ? "Ticket not found." : SAFE_ERROR);
      setState("error");
    }
  }, [ticketId]);

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    void load(controller.signal);
    return () => controller.abort();
  }, [load, retry]);

  async function mutate(action: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await action();
      await load(undefined, true);
      setNotice(success);
    } catch (caught) {
      if (caught instanceof ApiRequestError && [
        "STALE_WRITE", "CONCURRENT_UPDATE", "OWNER_CONFLICT", "OWNER_ELIGIBILITY_CONFLICT",
        "TERMINAL_TICKET", "STATUS_OWNER_REQUIRED", "STATUS_TRANSITION_NOT_ALLOWED",
      ].includes(caught.code ?? "")) {
        await load(undefined, true);
        setError("The Ticket changed. Review the latest details and try again.");
      } else setError(caught instanceof ApiRequestError ? caught.message : SAFE_ERROR);
    } finally { setBusy(false); }
  }

  function closeOwner() { if (!busy) { assignTriggerRef.current?.focus(); setDialog(null); } }
  function closeStatus() { if (!busy) { headingRef.current?.focus(); setDialog(null); setNextStatus(""); } }

  if (state === "loading") return <section><h1 className="h2">Loading Ticket Detail</h1><p role="status">Loading Ticket Detail…</p></section>;
  if (state === "error" || !ticket) return <section><h1 className="h2">Operational Ticket Detail</h1><div role="alert" className="alert alert-danger"><p>{error}</p>{error !== "Ticket not found." && <button type="button" className="btn btn-success" onClick={() => setRetry((value) => value + 1)}>Try Again</button>} <Link to="/staff/tickets" className="btn btn-outline-success">Back to Queue</Link></div></section>;

  const terminal = TERMINAL.has(ticket.currentStatus);
  const ownerMissing = OWNER_REQUIRED.has(ticket.currentStatus) && ticket.owner === null;
  const needsConfirmation = nextStatus === "RESOLVED" || nextStatus === "CLOSED" || nextStatus === "CANCELLED";
  return (
    <section aria-labelledby="staff-ticket-heading">
      <div ref={contentRef}>
      <div className="d-flex flex-wrap justify-content-between gap-3 mb-4">
        <div><h1 ref={headingRef} id="staff-ticket-heading" className="h2" tabIndex={-1}>{ticket.ticketNumber}</h1>
          <p className="mb-0">Status: {label(ticket.currentStatus)} · Updated <time dateTime={ticket.updatedAt}>{date(ticket.updatedAt)}</time></p>
        </div>
        <Link className="btn btn-outline-success align-self-start" to="/staff/tickets">Back to Queue</Link>
      </div>
      {error && <div className="alert alert-warning" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}
      {ticket.requesterResolutionIndicatedAt && <div className="alert alert-success"><span>Requester reports that the problem appears resolved</span> · <time dateTime={ticket.requesterResolutionIndicatedAt}>{date(ticket.requesterResolutionIndicatedAt)}</time></div>}

      <section className="card border-0 shadow-sm mb-4" aria-labelledby="reported-heading"><div className="card-body p-4">
        <h2 id="reported-heading" className="h4">Requester-reported information</h2>
        <dl className="ticket-detail-grid mb-0">
          <Field name="Requester">{ticket.requester.name} ({ticket.requester.email})</Field>
          <Field name="Category">{ticket.category.name}</Field><Field name="Related System">{ticket.relatedSystem.name}</Field>
          <Field name="Requested Priority"><span>Requested {label(ticket.requestedPriority)}</span></Field>
          <Field name="Summary">{ticket.summary}</Field><Field name="Description">{ticket.description}</Field>
          <Field name="Created"><time dateTime={ticket.createdAt}>{date(ticket.createdAt)}</time></Field>
        </dl>
      </div></section>

      <section className="card border-0 shadow-sm mb-4" aria-labelledby="operations-heading"><div className="card-body p-4">
        <h2 id="operations-heading" className="h4">Operations</h2>
        <p>Owner: {ticket.owner?.name ?? "Unassigned"}</p>
        <p>Current Status: {label(ticket.currentStatus)}</p>
        {!terminal && ticket.owner === null && <button className="btn btn-success me-2" type="button" disabled={busy}
          onClick={() => void mutate(() => claimStaffTicket(ticket.id, ticket.updatedAt), "Ticket claimed successfully.")}>Claim Ticket</button>}
        {!terminal && <button ref={assignTriggerRef} className="btn btn-outline-success" type="button" disabled={busy}
          onClick={() => {
            const mayUnassign = (["NEW", "OPEN", "REOPENED"] as TicketStatus[]).includes(ticket.currentStatus);
            setSelectedOwner(ticket.owner ? String(ticket.owner.id) : mayUnassign ? "" : String(assignees[0]?.id ?? ""));
            setDialog("owner");
          }}>Assign Ticket</button>}
        <div className="row mt-4 g-3"><div className="col-md-6">
          <label className="form-label" htmlFor="it-priority">IT Priority</label>
          <select id="it-priority" className="form-select" disabled={terminal || busy} value={priority}
            onChange={(event) => setPriority(event.target.value as RequestedPriority)}>
            {(["LOW", "MEDIUM", "HIGH", "URGENT"] as RequestedPriority[]).map((value) => <option key={value} value={value}>{label(value)}</option>)}
          </select>
          <button className="btn btn-success mt-2" type="button" disabled={terminal || busy || priority === ticket.itPriority}
            onClick={() => void mutate(() => setStaffTicketPriority(ticket.id, priority, ticket.updatedAt), "IT Priority updated successfully.")}>Save IT Priority</button>
        </div><div className="col-md-6">
          <label className="form-label" htmlFor="next-status">Next status</label>
          <select id="next-status" className="form-select" disabled={terminal || busy} value={nextStatus}
            onChange={(event) => {
              const value = event.target.value as TicketStatus | "";
              setNextStatus(value);
              if (["RESOLVED", "CLOSED", "CANCELLED"].includes(value)) setDialog("status");
            }}>
            <option value="">Select a status</option>
            {ticket.allowedStatusTransitions.map((value) => <option key={value} value={value}>{label(value)}</option>)}
          </select>
          {terminal && <p className="form-text">No further status changes are available.</p>}
          {ownerMissing && <p className="form-text">Assign an active Ticket Owner first.</p>}
          <button className="btn btn-success mt-2" type="button" disabled={!nextStatus || needsConfirmation || busy || ownerMissing}
            onClick={() => nextStatus && void mutate(() => setStaffTicketStatus(ticket.id, nextStatus, ticket.updatedAt), "Status updated successfully.")}>Update Status</button>
        </div></div>
      </div></section>

      <StaffAttachments ticketId={ticket.id} />
      <Messages title="Public Comments" privateChannel={false} ticketId={ticket.id} initialResponse={publicComments} />
      <Messages title="Internal Notes" privateChannel ticketId={ticket.id} initialResponse={internalNotes} />
      <section className="card border-0 shadow-sm mb-4" aria-labelledby="history-heading"><div className="card-body p-4">
        <h2 id="history-heading" className="h4">Status History</h2>
        {ticket.statusHistory.length === 0 ? <p>No status changes yet.</p> : <ol>{ticket.statusHistory.map((entry) => <li key={entry.id}>
          <strong>{label(entry.fromStatus)} to {label(entry.toStatus)}</strong> by {entry.actor.name} on {date(entry.createdAt)}{entry.reason ? ` — ${entry.reason}` : ""}
        </li>)}</ol>}
      </div></section>
      </div>

      {dialog === "owner" && <Dialog title="Assign Ticket" description="Choose an active IT Staff member or Administrator."
        initialFocus={ownerSelectRef} processing={busy} onClose={closeOwner}>
        <label className="form-label" htmlFor="ticket-owner">Ticket Owner</label>
        <select ref={ownerSelectRef} id="ticket-owner" className="form-select" value={selectedOwner} onChange={(event) => setSelectedOwner(event.target.value)}>
          {(["NEW", "OPEN", "REOPENED"] as TicketStatus[]).includes(ticket.currentStatus) && <option value="">Unassigned</option>}
          {assignees.map((owner) => <option key={owner.id} value={owner.id}>{owner.name} ({label(owner.role)})</option>)}
        </select>
        <div className="d-flex justify-content-end gap-2 mt-3"><button className="btn btn-outline-secondary" type="button" disabled={busy} onClick={closeOwner}>Cancel</button>
          <button className="btn btn-success" type="button" disabled={busy} onClick={() => void mutate(
            () => setStaffTicketOwner(ticket.id, selectedOwner ? Number(selectedOwner) : null, ticket.updatedAt), "Ticket Owner updated successfully.",
          ).then(() => setDialog(null))}>Save Owner</button></div>
      </Dialog>}

      {dialog === "status" && nextStatus && <Dialog title={nextStatus === "CANCELLED" ? "Cancel Ticket" : `${label(nextStatus)} Ticket`}
        description="Confirm this formal Ticket status change." initialFocus={statusCancelRef} processing={busy} onClose={closeStatus}>
        {nextStatus === "CANCELLED" && <><label className="form-label" htmlFor="cancellation-reason">Cancellation reason</label>
          <textarea id="cancellation-reason" className="form-control" required minLength={5} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></>}
        <div className="d-flex justify-content-end gap-2 mt-3"><button ref={statusCancelRef} className="btn btn-outline-secondary" type="button" disabled={busy} onClick={closeStatus}>Cancel</button>
          <button className="btn btn-success" type="button" disabled={busy || (nextStatus === "CANCELLED" && reason.trim().length < 5)} onClick={() => void mutate(
            () => setStaffTicketStatus(ticket.id, nextStatus, ticket.updatedAt, true, nextStatus === "CANCELLED" ? reason.trim() : null), "Status updated successfully.",
          ).then(() => { setDialog(null); setReason(""); })}>{nextStatus === "CANCELLED" ? "Confirm cancellation" : `Confirm ${label(nextStatus).toLowerCase()}`}</button></div>
      </Dialog>}
    </section>
  );
}
