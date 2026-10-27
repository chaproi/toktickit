import { useEffect, useId, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiRequestError, getCategories, getRelatedSystems, getStaffAssignees, getStaffDashboard,
  type AuthUser, type Category, type EligibleAssignee, type RelatedSystem, type StaffDashboardResponse, type RequesterDashboardRow } from "../api.js";
import { actionStates } from "./my-action-query.js";
import { parseStaffQuery, priorities, readStaffFilters, staffDrillDown, staffFilterNames, staffTicketStates, type StaffDescriptor, type StaffFilters } from "../staff-dashboard-query.js";

const label = (value: string) => value.toLowerCase().split("_").map((word, index) => index > 0 && word === "for" ? word : word[0]?.toUpperCase() + word.slice(1)).join(" ");
const time = (value: string) => new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
function authorization(error: unknown) {
  if (error instanceof ApiRequestError && ["ROLE_FORBIDDEN", "PASSWORD_CHANGE_REQUIRED"].includes(error.code ?? "")) window.dispatchEvent(new Event("toktickit:auth-refresh"));
}

export default function StaffDashboard({ user }: { user: AuthUser }) {
  const id = useId(), [parameters, setParameters] = useSearchParams(), search = parameters.toString();
  const parsed = parseStaffQuery(parameters, "dashboard");
  const [draft, setDraft] = useState<StaffFilters>(() => readStaffFilters(parameters));
  const [retry, setRetry] = useState(0), [referenceRetry, setReferenceRetry] = useState(0);
  const [references, setReferences] = useState<{ categories: Category[]; systems: RelatedSystem[]; workers: EligibleAssignee[] } | null>(null);
  const [referenceError, setReferenceError] = useState(false);
  const key = `${user.id}:${user.role}:${search}:${retry}`;
  const [result, setResult] = useState<{ key: string; data?: StaffDashboardResponse; error?: string; invalid?: boolean } | null>(null);
  useEffect(() => { setDraft(readStaffFilters(new URLSearchParams(search))); }, [search]);
  useEffect(() => {
    const controller = new AbortController(); setReferenceError(false); setReferences(null);
    void Promise.all([getCategories(controller.signal), getRelatedSystems(controller.signal), getStaffAssignees(controller.signal)])
      .then(([categories, systems, workers]) => { if (!controller.signal.aborted) setReferences({ categories, systems, workers }); })
      .catch((error: unknown) => { if (!controller.signal.aborted) { authorization(error); setReferenceError(true); } });
    return () => controller.abort();
  }, [user.id, user.role, referenceRetry]);
  useEffect(() => {
    const query = parseStaffQuery(new URLSearchParams(search), "dashboard");
    if (!query.success) return;
    const controller = new AbortController(); setResult(null);
    void getStaffDashboard(query.data, controller.signal).then((data) => {
      if (!controller.signal.aborted) setResult({ key, data });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      authorization(error);
      const invalid = error instanceof ApiRequestError && error.code === "INVALID_QUERY";
      setResult({ key, invalid, error: invalid ? "Invalid query filters. Check or clear the filters and try again." : "Unable to load Staff Dashboard. Please try again." });
    });
    return () => controller.abort();
  }, [key, search]);
  const data = result?.key === key ? result.data : undefined, error = result?.key === key ? result.error : undefined;
  const invalid = !parsed.success || result?.key === key && result.invalid;
  const filtered = parsed.success && Object.keys(parsed.data).length > 0;
  // All eight server bins cover the full filtered Ticket set, including old
  // terminal records. Zero active/recent/mine widgets alone do NOT prove empty.
  const empty = data && Object.values(data.metrics.byStatus).every((count) => count === 0) &&
    Object.values(data.metrics.myActionsByStatus).every((count) => count === 0) &&
    Object.values(data.lists).every((rows) => rows.length === 0);
  function apply(event: FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams();
    for (const name of staffFilterNames) { const value = name === "search" ? draft[name].trim() : draft[name]; if (value) next.set(name, value); }
    if (next.toString() === search) setRetry((value) => value + 1); else setParameters(next);
  }
  function clear() {
    setDraft(readStaffFilters(new URLSearchParams()));
    if (search === "") setRetry((value) => value + 1); else setParameters({});
  }
  function select(name: keyof StaffFilters, title: string, options: Array<{ value: string; name: string }>) {
    return <div><label className="form-label" htmlFor={`${id}-${name}`}>{title}</label>
      <select id={`${id}-${name}`} className="form-select" value={draft[name]} onChange={(event) => setDraft((previous) => ({ ...previous, [name]: event.target.value }))}>
        <option value="">All</option>
        {draft[name] && !options.some((item) => item.value === draft[name]) && <option value={draft[name]}>Selected {title}: {draft[name]} (not in current options)</option>}
        {options.map((item) => <option key={item.value} value={item.value}>{item.name}</option>)}
      </select></div>;
  }
  const choices = (values: readonly string[]) => values.map((value) => ({ value, name: label(value) }));
  function metric(title: string, count: number, descriptor: StaffDescriptor) {
    const destination = staffDrillDown(descriptor);
    const contents = <><span className="d-block">{title}</span><strong className="fs-2">{count}</strong></>;
    return destination ? <Link className="card h-100 text-decoration-none text-success shadow-sm" to={destination}><div className="card-body">{contents}</div></Link>
      : <div className="card h-100"><div className="card-body">{contents}<span>Drill-down unavailable</span></div></div>;
  }
  function bins(title: string, name: string, values: readonly string[], counts: Record<string, number>, descriptors: Record<string, StaffDescriptor>) {
    return <section aria-labelledby={`${id}-${name}`} className="mb-4">
      <h2 className="h4" id={`${id}-${name}`}>{title}</h2>
      <div className="row g-3">{values.map((value) => <div className="col-6 col-md-3" key={value}>{metric(label(value), counts[value], descriptors[value])}</div>)}</div>
    </section>;
  }
  function recent(title: string, name: string, rows: RequesterDashboardRow[], resolved: boolean) {
    return <section aria-labelledby={`${id}-${name}`} className="card border-0 shadow-sm mb-4"><div className="card-body">
      <h2 className="h4" id={`${id}-${name}`}>{title}</h2>
      {rows.length === 0 ? <p>No recent {resolved ? "resolutions" : "updates"} in this period.</p> : <ul className="list-unstyled mb-0">
        {rows.map((row) => <li key={row.id} className="border-top py-3">
          <Link className="ticket-number-link" to={`/staff/tickets/${row.id}`}>{row.ticketNumber}</Link>
          <p className="public-comment-content my-2">{row.summary}</p>
          <p>{label(row.currentStatus)} · Requested priority: {label(row.requestedPriority)} · IT priority: {label(row.itPriority)}</p>
          <p>Owner: {row.owner?.name ?? "Unassigned"}</p>
          <span>{resolved ? "Resolved" : "Updated"}: </span><time dateTime={resolved ? row.resolvedAt : row.updatedAt}>{time(resolved ? row.resolvedAt! : row.updatedAt)}</time>
        </li>)}
      </ul>}
    </div></section>;
  }
  const filterLabels: Record<keyof StaffFilters, string> = { search: "Search", categoryId: "Category", relatedSystemId: "Related System", requestedPriority: "Requested Priority", itPriority: "IT Priority", currentStatus: "Current Status", owner: "Owner" };
  function filterValue(name: keyof StaffFilters, value: string | number) {
    if (name === "categoryId") return references?.categories.find(({ id }) => id === Number(value))?.name ?? `Category ${value}`;
    if (name === "relatedSystemId") return references?.systems.find(({ id }) => id === Number(value))?.name ?? `Related System ${value}`;
    if (name === "owner") return value === "me" ? "Mine" : value === "unassigned" ? "Unassigned" : references?.workers.find(({ id }) => id === Number(value))?.name ?? `Worker ${value}`;
    return name === "search" ? String(value) : label(String(value));
  }
  return <section aria-labelledby={`${id}-heading`}>
    <h1 className="h2 mb-3" id={`${id}-heading`}>Staff Dashboard</h1>
    {invalid ? <div role="alert" className="alert alert-danger"><h2 className="h5">Invalid query filters</h2>
      {!parsed.success && <ul>{Object.entries(parsed.fields).map(([name, message]) => <li key={name}>{name}: {message}</li>)}</ul>}
      {error && <p>{error}</p>}<button className="btn btn-outline-success" type="button" onClick={clear}>Clear filters</button>
    </div> : <>
      <form aria-label="Dashboard filters" className="card border-0 shadow-sm mb-4" onSubmit={apply}><div className="card-body">
        <div className="staff-queue-filter-grid">
          <div><label className="form-label" htmlFor={`${id}-search`}>Search Tickets</label><input id={`${id}-search`} className="form-control" value={draft.search} onChange={(event) => setDraft((previous) => ({ ...previous, search: event.target.value }))} /></div>
          {select("categoryId", "Category", (references?.categories ?? []).map((item) => ({ value: String(item.id), name: item.name })))}
          {select("relatedSystemId", "Related System", (references?.systems ?? []).map((item) => ({ value: String(item.id), name: item.name })))}
          {select("requestedPriority", "Requested Priority", choices(priorities))}{select("itPriority", "IT Priority", choices(priorities))}
          {select("currentStatus", "Current Status", choices(staffTicketStates))}
          {select("owner", "Owner", [{ value: "unassigned", name: "Unassigned" }, { value: "me", name: "Mine" }, ...(references?.workers ?? []).map((item) => ({ value: String(item.id), name: item.name }))])}
        </div>
        {referenceError && <p role="alert">Unable to load filter options. Your filters are retained. <button className="btn btn-outline-success" type="button" onClick={() => setReferenceRetry((value) => value + 1)}>Retry filters</button></p>}
        <div className="d-flex flex-wrap gap-2 mt-3"><button className="btn btn-success" type="submit">Apply Filters</button><button className="btn btn-outline-secondary" type="button" onClick={clear}>Clear filters</button></div>
      </div></form>
      {!data && !error && <div role="status" aria-busy="true" className="my-tickets-state">Loading Staff Dashboard…</div>}
      {error && <div className="alert alert-danger" role="alert"><p>{error}</p><button className="btn btn-outline-success" type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button></div>}
      {data && <>
        <p>As of <time dateTime={data.asOf}>{time(data.asOf)}</time> (Asia/Bangkok).</p>
        <p>Recent activity covers seven calendar days including today: <time dateTime={data.recentWindow.from}>{time(data.recentWindow.from)}</time> to <time dateTime={data.recentWindow.before}>{time(data.recentWindow.before)}</time> (exclusive). Activity is capped at the server as-of time.</p>
        <p>Active Tickets include Resolved and exclude Closed and Cancelled. Outstanding is a different set.</p>
        {filtered && <section aria-labelledby={`${id}-filters`} className="mb-3"><h2 className="h5" id={`${id}-filters`}>Active filters</h2><ul>
          {staffFilterNames.map((name) => data.filters[name] !== null && data.filters[name] !== undefined && data.filters[name] !== "" && <li key={name}>{filterLabels[name]}: {filterValue(name, data.filters[name]!)}</li>)}
        </ul></section>}
        <div className="row g-3 mb-4">
          {([["Unassigned active Tickets", data.metrics.unassigned, data.drillDown.unassigned], ["My active Tickets", data.metrics.mine, data.drillDown.mine],
            ["Recently updated", data.metrics.recentUpdated, data.drillDown.recentUpdated], ["Recently resolved", data.metrics.recentResolved, data.drillDown.recentResolved]] as const)
            .map(([title, count, descriptor]) => <div className="col-12 col-sm-6 col-xl-3" key={title}>{metric(title, count, descriptor)}</div>)}
        </div>
        {bins("Ticket status", "statuses", staffTicketStates, data.metrics.byStatus, data.drillDown.byStatus)}
        {bins("Active IT priorities", "priorities", priorities, data.metrics.byItPriority, data.drillDown.byItPriority)}
        {bins("My assigned Action status", "action-statuses", actionStates, data.metrics.myActionsByStatus, data.drillDown.myActionsByStatus)}
        <div className="mb-3">{metric("My unfinished Actions", data.metrics.myUnfinishedActions, data.drillDown.myUnfinishedActions)}</div>
        {empty && <div className="my-tickets-state mb-3">{filtered ? "No Dashboard items match these filters." : "No Tickets are available in the Dashboard."}</div>}
        {recent("Recently updated Tickets", "updated", data.lists.recentUpdated, false)}
        {recent("Recently resolved Tickets", "resolved", data.lists.recentResolved, true)}
        <section className="card border-0 shadow-sm mb-4" aria-labelledby={`${id}-actions`}><div className="card-body">
          <h2 className="h4" id={`${id}-actions`}>My unfinished Actions</h2>
          {data.lists.myUnfinishedActions.length === 0 ? <p>No unfinished actions assigned to you</p> : <ul className="list-unstyled mb-0">
            {data.lists.myUnfinishedActions.map(({ ticket, action }) => <li key={action.id} className="border-top py-3">
              <p className="public-comment-content">{action.description}</p>
              <Link className="ticket-number-link" to={`/staff/tickets/${ticket.id}#action-${action.id}`}>{ticket.ticketNumber}</Link>
              <p className="public-comment-content my-2">{ticket.summary}</p><p>{label(action.status)} · Assigned to: {action.assignee.name}</p>
              <span>Created: </span><time dateTime={action.createdAt}>{time(action.createdAt)}</time>
            </li>)}
          </ul>}
          <Link className="btn btn-outline-success mt-3" to={staffDrillDown(data.drillDown.myUnfinishedActions)!}>View my actions</Link>
        </div></section>
      </>}
    </>}
  </section>;
}
