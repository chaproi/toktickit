import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ApiRequestError, getTicketAction, getTicketActions, type ActionDTO, type ActionListResponse, type ActionMutationResponse, type AuthUser, type TicketDetail } from "../api.js";
import { useLocation } from "react-router-dom";
import ActionOperationDialog, { type ActionOperation } from "./ActionOperationDialog.js";
import ActionCreateDialog from "./ActionCreateDialog.js";
import ActionHistoryDialog from "./ActionHistoryDialog.js";

const editableParents = new Set(["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"]);
const label = (value: string) => value.toLowerCase().split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
function date(value: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function ActionsTaken({ ticket, user, onTicketChanged }: {
  ticket: Pick<TicketDetail, "id" | "currentStatus" | "updatedAt">;
  user: AuthUser; onTicketChanged?: () => Promise<unknown>;
}) {
  const id = useId();
  const location = useLocation();
  const heading = useRef<HTMLHeadingElement>(null);
  const live = useRef(true);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [data, setData] = useState<ActionListResponse | null>(null);
  const [error, setError] = useState<{ message: string; http: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  const [notice, setNotice] = useState("");
  const [warning, setWarning] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<20 | 50 | 100>(20);
  const [dialog, setDialog] = useState<{ action: ActionDTO; operation: ActionOperation; trigger: HTMLElement } | null>(null);
  const [createTrigger, setCreateTrigger] = useState<HTMLElement | null>(null);
  const historyScope = `${ticket.id}:${user.id}:${user.role}:${user.mustChangePassword}`;
  const [history, setHistory] = useState<{ actionId: number; trigger: HTMLElement; scope: string } | null>(null);
  useEffect(() => { setHistory(null); }, [historyScope]);
  const selectedIdText = /^#action-([1-9]\d*)$/.exec(location.hash)?.[1];
  const selectedId = selectedIdText && Number.isSafeInteger(Number(selectedIdText)) && Number(selectedIdText) <= 2_147_483_647 ? Number(selectedIdText) : null;
  const selectedScope = historyScope + location.hash;
  const [selected, setSelected] = useState<{ scope: string; action: ActionDTO } | null>(null);
  const [selectedError, setSelectedError] = useState<{ scope: string; message: string } | null>(null);
  const [selectedRetry, setSelectedRetry] = useState(0);
  const mutable = user.role !== "REQUESTER" && !user.mustChangePassword && editableParents.has(ticket.currentStatus) && !warning && !refreshing;
  const load = useCallback((signal?: AbortSignal) => getTicketActions(ticket.id, { page, pageSize }, signal), [ticket.id, page, pageSize]);

  useEffect(() => {
    live.current = true;
    const controller = new AbortController();
    setState("loading"); setData(null); setError(null);
    void load(controller.signal).then((response) => {
      if (controller.signal.aborted) return;
      if (response.items.length === 0 && response.pagination.totalPages > 0 && page > response.pagination.totalPages) { setPage(response.pagination.totalPages); return; }
      setData(response); setState("ready");
    }).catch((caught: unknown) => {
      if (controller.signal.aborted) return;
      if (caught instanceof ApiRequestError && ["PASSWORD_CHANGE_REQUIRED", "ROLE_FORBIDDEN"].includes(caught.code ?? "")) window.dispatchEvent(new Event("toktickit:auth-refresh"));
      setError({ message: caught instanceof ApiRequestError && caught.status === 404 ? "Ticket not found." : "Unable to load Actions. Please try again.", http: caught instanceof ApiRequestError });
      setState("error");
    });
    return () => { live.current = false; controller.abort(); };
  }, [load, retry, page, user.id, user.role]);

  // A selected off-page record is separate from the authoritative paginated list.
  useEffect(() => {
    const controller = new AbortController();
    setSelected(null); setSelectedError(null);
    if (state !== "ready" || !data || selectedId === null || data.items.some((action) => action.id === selectedId)) return () => controller.abort();
    void getTicketAction(ticket.id, selectedId, controller.signal).then((response) => {
      if (!controller.signal.aborted) setSelected({ scope: selectedScope, action: response.action });
    }).catch((caught: unknown) => {
      if (controller.signal.aborted) return;
      if (caught instanceof ApiRequestError && ["PASSWORD_CHANGE_REQUIRED", "ROLE_FORBIDDEN"].includes(caught.code ?? "")) window.dispatchEvent(new Event("toktickit:auth-refresh"));
      setSelectedError({ scope: selectedScope, message: caught instanceof ApiRequestError && [403, 404].includes(caught.status) ? "Selected Action is not available." : "Unable to load the selected Action. Please try again." });
    });
    return () => controller.abort();
  }, [state, data, selectedId, selectedScope, selectedRetry, ticket.id]);
  useEffect(() => {
    if (selectedId === null || state !== "ready") return;
    const element = document.getElementById(`action-${selectedId}`);
    if (element) { element.focus(); element.scrollIntoView?.({ block: "nearest" }); }
  }, [state, data, selected, selectedId, selectedScope]);

  async function refreshSaved() {
    setRefreshing(true);
    const results = await Promise.allSettled([load(), onTicketChanged?.()]);
    if (!live.current) return;
    if (results[0]?.status === "fulfilled" && results[0].value) setData(results[0].value);
    const failed = results.some((result) => result.status === "rejected" || result.status === "fulfilled" && result.value === "failure");
    setWarning(failed ? "The Action was saved, but refresh failed. Reload the Ticket before another change." : "");
    setRefreshing(false);
    heading.current?.focus();
  }
  async function saved(response: ActionMutationResponse, created = false) {
    setDialog(null); setCreateTrigger(null);
    setSelected((previous) => previous?.action.id === response.action.id ? { ...previous, action: response.action } : previous);
    // Only render a successful server DTO; no optimistic state/performer is fabricated.
    setData((previous) => {
      if (!previous) return previous;
      const found = previous.items.some((item) => item.id === response.action.id);
      const items = found ? previous.items.map((item) => item.id === response.action.id ? response.action : item) :
        created ? [...previous.items, response.action].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id) : previous.items;
      // Pagination is replaced by the authoritative list read, not guessed from a write DTO.
      return { ...previous, items };
    });
    setNotice(created ? "Action created successfully." : "Action updated successfully."); setWarning("");
    await refreshSaved();
  }
  function field(name: string, value: string | null) {
    return <div><dt className="fw-semibold">{name}</dt><dd className="read-only-field public-comment-content">{value ?? "Not recorded"}</dd></div>;
  }
  function renderAction(action: ActionDTO) {
    const editable = mutable && ["PLANNED", "IN_PROGRESS"].includes(action.status);
    const controls: ActionOperation[] = editable ? ["edit", "reassign", action.status === "PLANNED" ? "start" : "complete", "cancel"] : [];
    return <li key={action.id} id={`action-${action.id}`} tabIndex={-1} className="public-comment-item">
      <h3 className="h5 public-comment-content">{action.description}</h3>
      <dl className="ticket-detail-grid mb-3">
        {field("Status", label(action.status))}
        <div><dt className="fw-semibold">Action Date/Time</dt><dd><time dateTime={action.actionAt}>{date(action.actionAt)} (Asia/Bangkok)</time></dd></div>
        {field("Created by", action.createdBy.name)}{field("Assigned to", action.assignee.name)}{field("Performed by", action.performedBy?.name ?? "Not completed")}
        {field("Result", action.result)}{field("Follow-up", action.followUpRequired ? "Follow-up required" : "No follow-up required")}
        {field("Follow-up note", action.followUpNote)}{field("Attachment Notes", action.attachmentNotes)}
        {action.cancellationReason !== null && field("Cancellation reason", action.cancellationReason)}
        <div><dt className="fw-semibold">Updated</dt><dd><time dateTime={action.updatedAt}>{date(action.updatedAt)}</time></dd></div>
        {action.completedAt && <div><dt className="fw-semibold">Completed</dt><dd><time dateTime={action.completedAt}>{date(action.completedAt)}</time></dd></div>}
        {action.cancelledAt && <div><dt className="fw-semibold">Cancelled</dt><dd><time dateTime={action.cancelledAt}>{date(action.cancelledAt)}</time></dd></div>}
      </dl>
      <div className="d-flex flex-wrap gap-2">
        <button type="button" className="btn btn-outline-success" onClick={(event) => setHistory({ actionId: action.id, trigger: event.currentTarget, scope: historyScope })}>View history</button>
        {controls.map((operation) => <button key={operation} type="button" className={`btn ${operation === "cancel" ? "btn-outline-danger" : "btn-outline-success"}`} onClick={(event) => setDialog({ action, operation, trigger: event.currentTarget })}>{label(operation)}</button>)}
      </div>
    </li>;
  }
  return <>
    <section className="card border-0 shadow-sm mb-4" aria-labelledby={`${id}-heading`} aria-busy={state === "loading"}>
      <div className="card-body p-4">
        <h2 ref={heading} id={`${id}-heading`} className="h4" tabIndex={-1}>Actions Taken</h2>
        {mutable && state === "ready" && <button type="button" className="btn btn-success mb-3" onClick={(event) => { setNotice(""); setCreateTrigger(event.currentTarget); }}>Create Action</button>}
        {state === "loading" && <p role="status">Loading Actions…</p>}
        {state === "error" && error && <div role={error.http ? "alert" : undefined} aria-live="assertive" className="alert alert-danger">
          {error.message} <button className="btn btn-outline-success" type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button>
        </div>}
        {notice && <p role="status" className="text-success">{notice}</p>}
        {refreshing && <p role="status">Refreshing Actions and Ticket…</p>}
        {warning && <div role="alert">{warning} <button type="button" className="btn btn-outline-success" disabled={refreshing} onClick={() => void refreshSaved()}>Reload Ticket</button></div>}
        {state === "ready" && data?.items.length === 0 && <p>No Actions Taken yet.</p>}
        {state === "ready" && data && data.items.length > 0 && <>
          <ul className="public-comment-list" aria-label="Actions Taken records">{data.items.map(renderAction)}</ul>
          {!warning && !refreshing && <nav aria-label="Actions pagination" className="d-flex flex-wrap align-items-center gap-3">
            <span>Page {data.pagination.page} of {data.pagination.totalPages}; {data.pagination.totalItems} Actions</span>
            <label htmlFor={`${id}-page-size`}>Actions per page</label><select id={`${id}-page-size`} className="form-select w-auto" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value) as 20 | 50 | 100); setPage(1); }}><option value="20">20</option><option value="50">50</option><option value="100">100</option></select>
            <button type="button" className="btn btn-outline-success" disabled={!data.pagination.hasPreviousPage} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
            <button type="button" className="btn btn-outline-success" disabled={!data.pagination.hasNextPage} onClick={() => setPage((value) => value + 1)}>Next</button>
          </nav>}
        </>}
        {state === "ready" && selectedId !== null && data && !data.items.some((action) => action.id === selectedId) && <div aria-labelledby={`${id}-selected`}>
          <h3 id={`${id}-selected`} className="h5">Selected Action (outside this page)</h3>
          {selected?.scope === selectedScope ? <ul className="public-comment-list" aria-label="Selected Action">{renderAction(selected.action)}</ul> :
            selectedError?.scope === selectedScope ? <div role="alert">{selectedError.message} <button type="button" className="btn btn-outline-success" onClick={() => setSelectedRetry((value) => value + 1)}>Retry selected Action</button></div> : <p role="status">Loading selected Action…</p>}
        </div>}
        {location.hash.startsWith("#action-") && selectedId === null && <p role="alert">Invalid selected Action identifier.</p>}
      </div>
    </section>
    {dialog && <ActionOperationDialog ticketId={ticket.id} action={dialog.action} operation={dialog.operation} trigger={dialog.trigger} editable={mutable} onClose={() => setDialog(null)} onSaved={saved} />}
    {createTrigger && <ActionCreateDialog ticketId={ticket.id} ticketUpdatedAt={ticket.updatedAt} user={user} trigger={createTrigger} editable={mutable} onClose={() => setCreateTrigger(null)} onCreated={(response) => saved(response, true)} />}
    {history && history.scope === historyScope && !user.mustChangePassword && <ActionHistoryDialog key={`${historyScope}:${history.actionId}`} ticketId={ticket.id} actionId={history.actionId} trigger={history.trigger} onClose={() => setHistory(null)} />}
  </>;
}
