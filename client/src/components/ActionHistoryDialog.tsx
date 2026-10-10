import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ApiRequestError, getActionHistory, type ActionHistoryDTO, type ActionSnapshot, type TicketListPagination } from "../api.js";

const eventLabels: Record<ActionHistoryDTO["event"], string> = {
  ACTION_CREATED: "Created", ACTION_EDITED: "Edited", ACTION_REASSIGNED: "Reassigned",
  ACTION_STARTED: "Started", ACTION_COMPLETED: "Completed", ACTION_CANCELLED: "Cancelled",
  ACTION_CANCELLED_BY_TICKET: "Cancelled with Ticket",
};
const statusLabels: Record<ActionSnapshot["status"], string> = {
  PLANNED: "Planned", IN_PROGRESS: "In Progress", COMPLETED: "Completed (terminal)", CANCELLED: "Cancelled (terminal)",
};
const dateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Bangkok", year: "numeric", month: "short", day: "numeric",
  hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3,
});
function instant(value: string | null) {
  return value === null ? "Not recorded" : <time dateTime={value}>{dateFormat.format(new Date(value))} (Asia/Bangkok)</time>;
}
function field(label: string, value: ReactNode) {
  return <div><dt className="fw-semibold">{label}</dt><dd className="read-only-field public-comment-content">{value}</dd></div>;
}

function Snapshot({ name, value }: { name: "Before" | "After"; value: ActionSnapshot | null }) {
  const id = useId();
  return <section aria-labelledby={id} className="mb-3">
    <h4 id={id} className="h6">{name}</h4>
    {value === null ? <p>No previous record</p> : <dl className="ticket-detail-grid">
      {field("Action ID", value.id)}{field("Ticket ID", value.ticketId)}
      {field("Created by ID", value.createdById)}{field("Assigned to ID", value.assigneeId)}
      {field("Performed by ID", value.performedById ?? "Not completed")}
      {field("Status", statusLabels[value.status])}{field("Description", value.description)}
      {field("Result", value.result ?? "Not recorded")}
      {field("Follow-up required", value.followUpRequired ? "Yes" : "No")}
      {field("Follow-up note", value.followUpNote ?? "Not recorded")}
      {field("Attachment Notes", value.attachmentNotes ?? "Not recorded")}
      {field("Action Date/Time", instant(value.actionAt))}{field("Created at", instant(value.createdAt))}
      {field("Updated at", instant(value.updatedAt))}{field("Completed at", instant(value.completedAt))}
      {field("Cancelled at", instant(value.cancelledAt))}
      {field("Cancellation reason", value.cancellationReason ?? "Not recorded")}{field("Version", value.version)}
    </dl>}
  </section>;
}

type HistoryRead = {
  page: number; pageSize: 20 | 50 | 100; state: "loading" | "ready" | "error";
  data: { items: ActionHistoryDTO[]; pagination: TicketListPagination } | null; error: string;
};

export default function ActionHistoryDialog({ ticketId, actionId, trigger, onClose }: {
  ticketId: number; actionId: number; trigger: HTMLElement; onClose: () => void;
}) {
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<20 | 50 | 100>(20);
  const [retry, setRetry] = useState(0);
  const [read, setRead] = useState<HistoryRead>({ page: 1, pageSize: 20, state: "loading", data: null, error: "" });
  // A changed page must not display the previous page while its effect is scheduled.
  const current = read.page === page && read.pageSize === pageSize ? read : null;
  const state = current?.state ?? "loading";
  const data = current?.data;

  useEffect(() => {
    const controller = new AbortController();
    setRead({ page, pageSize, state: "loading", data: null, error: "" });
    void getActionHistory(ticketId, actionId, { page, pageSize }, controller.signal).then((response) => {
      if (controller.signal.aborted) return;
      const lastPage = Math.max(1, response.pagination.totalPages);
      if (page > lastPage) { setPage(lastPage); return; }
      setRead({ page, pageSize, state: "ready", data: response, error: "" });
    }).catch((caught: unknown) => {
      if (controller.signal.aborted) return;
      if (caught instanceof ApiRequestError && ["PASSWORD_CHANGE_REQUIRED", "ROLE_FORBIDDEN"].includes(caught.code ?? "")) {
        window.dispatchEvent(new Event("toktickit:auth-refresh"));
      }
      setRead({ page, pageSize, state: "error", data: null,
        error: caught instanceof ApiRequestError && caught.status === 404 ? "Action history is unavailable." : "Unable to load Action history. Please try again." });
    });
    return () => controller.abort();
  }, [ticketId, actionId, page, pageSize, retry]);

  useEffect(() => {
    // Match the existing Action dialogs: preserve previously inert siblings at every ancestor.
    const previous: Array<{ target: HTMLElement; inert: boolean }> = [];
    let branch: HTMLElement | null = dialogRef.current;
    while (branch?.parentElement && branch !== document.body) {
      for (const sibling of Array.from(branch.parentElement.children)) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          previous.push({ target: sibling, inert: sibling.hasAttribute("inert") });
          sibling.setAttribute("inert", "");
        }
      }
      branch = branch.parentElement;
    }
    dialogRef.current?.focus();
    return () => {
      for (const { target, inert } of previous) if (!inert) target.removeAttribute("inert");
      if (trigger.isConnected) trigger.focus();
    };
  }, [trigger]);

  useEffect(() => {
    // A disappearing Retry/loading control must not leave focus on the inert page.
    const dialog = dialogRef.current;
    if (dialog && !dialog.contains(document.activeElement)) dialog.focus();
  }, [state]);

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); onClose(); }
    if (event.key !== "Tab") return;
    const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled)") ?? []);
    const first = controls[0], last = controls.at(-1);
    if (!first) { event.preventDefault(); dialogRef.current?.focus(); }
    else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  return <div className="attachment-dialog-backdrop"><div ref={dialogRef} tabIndex={-1} className="attachment-dialog" role="dialog" aria-modal="true"
    aria-labelledby={`${id}-title`} aria-describedby={`${id}-explanation`} onKeyDown={keyDown}>
    <h2 id={`${id}-title`} className="h4">Action history</h2>
    <p id={`${id}-explanation`}>Read-only history for Action #{actionId} on Ticket #{ticketId}. Historical identity IDs are retained; all times are shown in Asia/Bangkok.</p>
    <div aria-busy={state === "loading"}>
      {state === "loading" && <p role="status">Loading Action history…</p>}
      {state === "error" && <div role="alert" className="alert alert-danger">{current?.error} <button type="button" className="btn btn-outline-success" onClick={() => {
        setRead({ page, pageSize, state: "loading", data: null, error: "" }); setRetry((value) => value + 1);
      }}>Retry</button></div>}
      {state === "ready" && data && <>
        {data.items.length === 0 ? <p>No Action history events yet.</p> : <ol className="public-comment-list" aria-label="Action history events">
          {data.items.map((event) => <li key={event.id} className="public-comment-item">
            <h3 className="h5">{eventLabels[event.event]}</h3>
            <dl className="ticket-detail-grid mb-3">
              {field("Actor", event.actor.name)}{field("Actor ID", event.actor.id)}
              {field("Event time", instant(event.createdAt))}{field("Action version", event.actionVersion)}
              {field("Source Ticket status-event ID", event.sourceTicketStatusHistoryId ?? "Not recorded")}
            </dl>
            <Snapshot name="Before" value={event.before} /><Snapshot name="After" value={event.after} />
          </li>)}
        </ol>}
      </>}
      <nav aria-label="Action history pagination" className="d-flex flex-wrap align-items-center gap-3 mb-3">
          {state === "ready" && data && <span>Page {data.pagination.page} of {data.pagination.totalPages}; {data.pagination.totalItems} events</span>}
          <label htmlFor={`${id}-page-size`}>History events per page</label>
          <select id={`${id}-page-size`} className="form-select w-auto" value={pageSize} onChange={(event) => {
            setPageSize(Number(event.target.value) as 20 | 50 | 100); setPage(1);
          }}><option value="20">20</option><option value="50">50</option><option value="100">100</option></select>
          <button type="button" className="btn btn-outline-success" disabled={state !== "ready" || !data?.pagination.hasPreviousPage} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
          <button type="button" className="btn btn-outline-success" disabled={state !== "ready" || !data?.pagination.hasNextPage} onClick={() => setPage((value) => value + 1)}>Next</button>
      </nav>
    </div>
    <div className="d-flex justify-content-end"><button type="button" className="btn btn-outline-secondary" onClick={onClose}>Close history</button></div>
  </div></div>;
}
