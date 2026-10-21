import { useEffect, useId, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiRequestError, getCategories, getRelatedSystems, getStaffActions, getStaffAssignees,
  type AuthUser, type Category, type EligibleAssignee, type RelatedSystem, type StaffActionResponse } from "../api.js";
import { actionStates, dashboardFilters, filterNames, parseMyActionQuery, priorities, queryParameters, readFilters, ticketStates, type Filters } from "./my-action-query.js";

const label = (value: string) => value.toLowerCase().split("_").map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ");
function time(value: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
function refreshAuthorization(error: unknown) {
  if (error instanceof ApiRequestError && ["ROLE_FORBIDDEN", "PASSWORD_CHANGE_REQUIRED"].includes(error.code ?? "")) {
    window.dispatchEvent(new Event("toktickit:auth-refresh"));
  }
}

export default function MyActions({ user }: { user: AuthUser }) {
  const id = useId();
  const [parameters, setParameters] = useSearchParams();
  const search = parameters.toString();
  const parsed = parseMyActionQuery(parameters);
  const [draft, setDraft] = useState<Filters>(() => readFilters(parameters));
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: StaffActionResponse; error?: string } | null>(null);
  const [references, setReferences] = useState<{ categories: Category[]; systems: RelatedSystem[]; workers: EligibleAssignee[] } | null>(null);
  const [referenceError, setReferenceError] = useState(false);
  const [referenceRetry, setReferenceRetry] = useState(0);
  const key = `${user.id}:${user.role}:${search}:${retry}`;
  const valid = parsed.success;

  useEffect(() => { setDraft(readFilters(new URLSearchParams(search))); }, [search]);
  useEffect(() => {
    if (!valid) return;
    const controller = new AbortController();
    setReferences(null); setReferenceError(false);
    void Promise.all([getCategories(controller.signal), getRelatedSystems(controller.signal), getStaffAssignees(controller.signal)]).then(([categories, systems, workers]) => {
      if (!controller.signal.aborted) setReferences({ categories, systems, workers });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      refreshAuthorization(error); setReferenceError(true);
    });
    return () => controller.abort();
  }, [valid, user.id, user.role, referenceRetry]);
  useEffect(() => {
    const query = parseMyActionQuery(new URLSearchParams(search));
    if (!query.success) return;
    const controller = new AbortController();
    setResult(null);
    void getStaffActions(query.data, controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      const finalPage = Math.max(1, data.pagination.totalPages);
      if (query.data.page > finalPage) {
        setParameters(queryParameters({ ...query.data, page: finalPage }), { replace: true });
        return;
      }
      setResult({ key, data });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      refreshAuthorization(error);
      setResult({ key, error: error instanceof ApiRequestError && error.code === "INVALID_QUERY"
        ? "Invalid query filters. Check the selected filters and try again."
        : "Unable to load assigned Actions. Please try again." });
    });
    return () => controller.abort();
  }, [search, key, setParameters]);

  const data = result?.key === key ? result.data : undefined;
  const error = result?.key === key ? result.error : undefined;
  const base = new URLSearchParams();
  if (parsed.success) for (const name of dashboardFilters) {
    const value = parsed.data[name];
    if (value !== undefined) base.set(name, String(value));
  }
  const filtered = parsed.success && filterNames.some((name) => parsed.data[name] !== undefined);
  function apply(event: FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams({ assignee: "me", page: "1", pageSize: parsed.success ? String(parsed.data.pageSize) : "10" });
    for (const name of filterNames) if (draft[name] !== "") next.set(name, name === "search" ? draft[name].trim() : draft[name]);
    setParameters(next);
  }
  function select(name: keyof Filters, title: string, options: ReadonlyArray<{ value: string; name: string }>) {
    const known = options.some((option) => option.value === draft[name]);
    return <div><label className="form-label" htmlFor={`${id}-${name}`}>{title}</label>
      <select id={`${id}-${name}`} className="form-select" value={draft[name]} onChange={(event) => setDraft((previous) => ({ ...previous, [name]: event.target.value }))}>
        <option value="">All</option>
        {!known && draft[name] && <option value={draft[name]}>Selected {title}: {draft[name]} (not in current options)</option>}
        {options.map((option) => <option key={option.value} value={option.value}>{option.name}</option>)}
      </select></div>;
  }
  const choices = (values: readonly string[]) => values.map((value) => ({ value, name: label(value) }));
  const field = (name: string, value: string | null) => <div><dt>{name}</dt><dd className="public-comment-content">{value ?? "Not recorded"}</dd></div>;

  return <section aria-labelledby={`${id}-heading`}>
    <div className="d-flex flex-wrap justify-content-between gap-3 mb-3">
      <h1 id={`${id}-heading`} className="h2">My assigned Actions</h1>
      <Link className="btn btn-outline-success" to={`/staff/dashboard${base.size ? `?${base}` : ""}`}>Back to Dashboard</Link>
    </div>
    {!parsed.success && <div className="alert alert-danger" role="alert">
      <h2 className="h5">Invalid query filters</h2><ul>{Object.entries(parsed.fields).map(([name, message]) => <li key={name}>{name}: {message}</li>)}</ul>
      <button type="button" className="btn btn-outline-success" onClick={() => setParameters({ assignee: "me", page: "1", pageSize: "10" })}>Clear filters</button>
    </div>}
    {parsed.success && <>
      <form className="card border-0 shadow-sm mb-4" aria-label="Assigned Actions filters" onSubmit={apply}>
        <div className="card-body">
          <div className="staff-queue-filter-grid">
            <div><label htmlFor={`${id}-search`} className="form-label">Search</label><input id={`${id}-search`} className="form-control" value={draft.search} onChange={(event) => setDraft((previous) => ({ ...previous, search: event.target.value }))} /></div>
            {select("status", "Action status", choices(actionStates))}
            {select("actionStatusGroup", "Action status group", choices(["unfinished"]))}
            {select("currentStatus", "Ticket current status", choices(ticketStates))}
            {select("statusGroup", "Ticket status group", choices(["active", "outstanding", "resolved"]))}
            {select("categoryId", "Category", (references?.categories ?? []).map((item) => ({ value: String(item.id), name: item.name })))}
            {select("relatedSystemId", "Related System", (references?.systems ?? []).map((item) => ({ value: String(item.id), name: item.name })))}
            {select("requestedPriority", "Requested Priority", choices(priorities))}
            {select("itPriority", "IT Priority", choices(priorities))}
            {select("owner", "Ticket Owner", [{ value: "me", name: "Me" }, { value: "unassigned", name: "Unassigned" }, ...(references?.workers ?? []).map((item) => ({ value: String(item.id), name: item.name }))])}
            {(["updatedFrom", "updatedBefore", "resolvedFrom", "resolvedBefore"] as const).map((name) => <div key={name}>
              <label className="form-label" htmlFor={`${id}-${name}`}>{name.replace(/([A-Z])/g, " $1")} (UTC)</label>
              <input className="form-control" id={`${id}-${name}`} placeholder="YYYY-MM-DDTHH:mm:ss.sssZ" value={draft[name]} onChange={(event) => setDraft((previous) => ({ ...previous, [name]: event.target.value }))} />
            </div>)}
          </div>
          {referenceError && <p role="alert">Unable to load filter options. Existing filters are retained. <button type="button" className="btn btn-outline-success" onClick={() => setReferenceRetry((value) => value + 1)}>Reload filter options</button></p>}
          <div className="d-flex gap-2 mt-3"><button className="btn btn-success" type="submit">Apply filters</button>
            <button className="btn btn-outline-success" type="button" onClick={() => setParameters({ assignee: "me", page: "1", pageSize: String(parsed.data.pageSize) })}>Clear filters</button></div>
        </div>
      </form>
      {!data && !error && <p role="status">Loading assigned Actions…</p>}
      {error && <div className="alert alert-danger" role="alert">{error} <button className="btn btn-outline-success" type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button></div>}
      {data && <>
        {data.items.length === 0 ? <p>{filtered ? "No Actions match these filters." : "No Actions assigned to you."}</p> :
          <ul className="public-comment-list" aria-label="My assigned Actions records">{data.items.map(({ ticket, action }) => <li key={action.id} className="public-comment-item">
            <h2 className="h5 public-comment-content">{action.description}</h2>
            <Link to={`/staff/tickets/${ticket.id}#action-${action.id}`} className="ticket-number-link">{ticket.ticketNumber}</Link>
            <dl className="ticket-detail-grid">
              {field("Ticket summary", ticket.summary)}{field("Ticket status", label(ticket.currentStatus))}{field("Action status", label(action.status))}
              {field("Created by", action.createdBy.name)}{field("Assigned to", action.assignee.name)}{field("Performed by", action.performedBy?.name ?? "Not completed")}
              {field("Result", action.result)}{field("Follow-up", action.followUpRequired ? "Follow-up required" : "No follow-up required")}
              {field("Follow-up note", action.followUpNote)}{field("Attachment Notes", action.attachmentNotes)}{field("Cancellation reason", action.cancellationReason)}
              <div><dt>Action Date/Time (Asia/Bangkok)</dt><dd><time dateTime={action.actionAt}>{time(action.actionAt)}</time></dd></div>
              <div><dt>Updated (Asia/Bangkok)</dt><dd><time dateTime={action.updatedAt}>{time(action.updatedAt)}</time></dd></div>
            </dl>
          </li>)}</ul>}
        <nav aria-label="My Actions pagination" className="d-flex flex-wrap align-items-center gap-3">
          <span>Page {data.pagination.page} of {Math.max(1, data.pagination.totalPages)}; {data.pagination.totalItems} Actions</span>
          <label htmlFor={`${id}-pageSize`}>Actions per page</label>
          <select className="form-select w-auto" id={`${id}-pageSize`} value={parsed.data.pageSize} onChange={(event) => setParameters(queryParameters({ ...parsed.data, page: 1, pageSize: Number(event.target.value) as 10 | 25 | 50 }))}>
            {[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
          <button className="btn btn-outline-success" type="button" disabled={!data.pagination.hasPreviousPage} onClick={() => setParameters(queryParameters({ ...parsed.data, page: Math.max(1, parsed.data.page - 1) }))}>Previous</button>
          <button className="btn btn-outline-success" type="button" disabled={!data.pagination.hasNextPage} onClick={() => setParameters(queryParameters({ ...parsed.data, page: parsed.data.page + 1 }))}>Next</button>
        </nav>
      </>}
    </>}
  </section>;
}
