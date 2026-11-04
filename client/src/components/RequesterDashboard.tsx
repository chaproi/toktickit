import { useEffect, useId, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ApiRequestError, getCategories, getRelatedSystems, getRequesterDashboard,
  type Category, type RelatedSystem, type RequesterDashboardMetric,
  type RequesterDashboardResponse, type RequesterDashboardRow,
} from "../api.js";
import {
  parseRequesterQuery, readRequesterFilters, requesterDrillDown, requesterFilterNames,
  requesterPriorities, requesterStatuses, type RequesterFilters,
} from "../requester-query.js";

const label = (value: string) => value.toLowerCase().split("_").map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ");
const time = (value: string) => new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short",
}).format(new Date(value));
const metricLabels: Record<RequesterDashboardMetric, string> = {
  outstanding: "Outstanding", needsAttention: "Waiting for your response",
  recentUpdated: "Recently updated", recentResolved: "Recently resolved",
};

export default function RequesterDashboard() {
  const id = useId();
  const [parameters, setParameters] = useSearchParams();
  const search = parameters.toString();
  const parsed = parseRequesterQuery(parameters, "dashboard");
  const [draft, setDraft] = useState<RequesterFilters>(() => readRequesterFilters(parameters));
  const [retry, setRetry] = useState(0);
  const key = `${search}:${retry}`;
  const [result, setResult] = useState<{ key: string; data?: RequesterDashboardResponse; error?: string; invalid?: boolean } | null>(null);
  const [references, setReferences] = useState<{ categories: Category[]; systems: RelatedSystem[] } | null>(null);
  const [referenceError, setReferenceError] = useState(false);
  const [referenceRetry, setReferenceRetry] = useState(0);

  useEffect(() => { setDraft(readRequesterFilters(new URLSearchParams(search))); }, [search]);
  useEffect(() => {
    const controller = new AbortController();
    setReferenceError(false);
    void Promise.all([getCategories(controller.signal), getRelatedSystems(controller.signal)]).then(([categories, systems]) => {
      if (!controller.signal.aborted) setReferences({ categories, systems });
    }).catch(() => { if (!controller.signal.aborted) setReferenceError(true); });
    return () => controller.abort();
  }, [referenceRetry]);
  useEffect(() => {
    const query = parseRequesterQuery(new URLSearchParams(search), "dashboard");
    if (!query.success) return;
    const controller = new AbortController();
    setResult(null);
    void getRequesterDashboard(query.data, controller.signal).then((data) => {
      if (!controller.signal.aborted) setResult({ key, data });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiRequestError && ["ROLE_FORBIDDEN", "PASSWORD_CHANGE_REQUIRED"].includes(error.code ?? "")) window.dispatchEvent(new Event("toktickit:auth-refresh"));
      const invalid = error instanceof ApiRequestError && error.code === "INVALID_QUERY";
      setResult({ key, invalid, error: invalid
        ? "Invalid query filters. Check or clear the filters and try again."
        : "Unable to load your Dashboard. Please try again." });
    });
    return () => controller.abort();
  }, [search, key]);

  const data = result?.key === key ? result.data : undefined;
  const error = result?.key === key ? result.error : undefined;
  const invalid = !parsed.success || (result?.key === key && result.invalid);
  const filtered = parsed.success && Object.keys(parsed.data).length > 0;
  const empty = data && Object.values(data.metrics).every((count) => count === 0) && data.lists.recentUpdated.length === 0 && data.lists.recentResolved.length === 0;
  function apply(event: FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams();
    for (const name of requesterFilterNames) {
      const value = name === "search" ? draft[name].trim() : draft[name];
      if (value) next.set(name, value);
    }
    if (next.toString() === search) setRetry((value) => value + 1);
    else setParameters(next);
  }
  function clear() {
    setDraft(readRequesterFilters(new URLSearchParams()));
    if (search === "") setRetry((value) => value + 1);
    else setParameters({});
  }
  function select(name: keyof RequesterFilters, title: string, options: Array<{ value: string; name: string }>) {
    return <div><label htmlFor={`${id}-${name}`} className="form-label">{title}</label>
      <select id={`${id}-${name}`} className="form-select" value={draft[name]} onChange={(event) => setDraft((previous) => ({ ...previous, [name]: event.target.value }))}>
        <option value="">All</option>
        {draft[name] && !options.some((option) => option.value === draft[name]) && <option value={draft[name]}>Selected {title}: {draft[name]} (not in current options)</option>}
        {options.map((option) => <option key={option.value} value={option.value}>{option.name}</option>)}
      </select></div>;
  }
  function recent(name: "recentUpdated" | "recentResolved", rows: RequesterDashboardRow[]) {
    return <section className="card border-0 shadow-sm mb-3" aria-labelledby={`${id}-${name}`}>
      <div className="card-body"><h2 id={`${id}-${name}`} className="h4">{metricLabels[name]} Tickets</h2>
        {rows.length === 0 ? <p>No recent {name === "recentResolved" ? "resolutions" : "updates"} in this period.</p> : <ul className="list-unstyled mb-0">
          {rows.map((row) => <li key={row.id} className="border-top py-3">
            <Link to={`/tickets/${row.id}`} className="ticket-number-link">{row.ticketNumber}</Link>
            <p className="public-comment-content my-2">{row.summary}</p>
            <p className="mb-1">{label(row.currentStatus)} · Requested priority: {label(row.requestedPriority)} · IT priority: {label(row.itPriority)}</p>
            <p className="mb-1">Owner: {row.owner?.name ?? "Unassigned"}</p>
            <span>{name === "recentResolved" ? "Resolved" : "Updated"}: </span>
            <time dateTime={name === "recentResolved" ? row.resolvedAt : row.updatedAt}>{time(name === "recentResolved" ? row.resolvedAt! : row.updatedAt)}</time>
          </li>)}
        </ul>}
      </div>
    </section>;
  }
  const choices = (values: readonly string[]) => values.map((value) => ({ value, name: label(value) }));
  const filterLabels: Record<keyof RequesterFilters, string> = {
    search: "Search", categoryId: "Category", relatedSystemId: "Related System",
    requestedPriority: "Requested Priority", itPriority: "IT Priority", currentStatus: "Current Status",
  };
  function filterValue(name: keyof RequesterFilters, value: string | number) {
    if (name === "categoryId") return references?.categories.find((item) => item.id === Number(value))?.name ?? `Category ${value}`;
    if (name === "relatedSystemId") return references?.systems.find((item) => item.id === Number(value))?.name ?? `Related System ${value}`;
    return name === "search" ? String(value) : label(String(value));
  }

  return <section aria-labelledby={`${id}-heading`}>
    <h1 id={`${id}-heading`} className="h2 mb-3">Requester Dashboard</h1>
    {invalid ? <div className="alert alert-danger" role="alert">
      <h2 className="h5">Invalid query filters</h2>
      {!parsed.success && <ul>{Object.entries(parsed.fields).map(([name, message]) => <li key={name}>{name}: {message}</li>)}</ul>}
      {error && <p>{error}</p>}
      <button type="button" className="btn btn-outline-success" onClick={clear}>Clear filters</button>
    </div> : <>
      <form className="card border-0 shadow-sm mb-4" aria-label="Dashboard filters" onSubmit={apply}>
        <div className="card-body">
          <div className="my-tickets-filter-grid">
            <div><label htmlFor={`${id}-search`} className="form-label">Search Tickets</label><input id={`${id}-search`} className="form-control" value={draft.search} onChange={(event) => setDraft((previous) => ({ ...previous, search: event.target.value }))} /></div>
            {select("categoryId", "Category", (references?.categories ?? []).map((item) => ({ value: String(item.id), name: item.name })))}
            {select("relatedSystemId", "Related System", (references?.systems ?? []).map((item) => ({ value: String(item.id), name: item.name })))}
            {select("requestedPriority", "Requested Priority", choices(requesterPriorities))}
            {select("itPriority", "IT Priority", choices(requesterPriorities))}
            {select("currentStatus", "Current Status", choices(requesterStatuses))}
          </div>
          {referenceError && <div role="alert" className="alert alert-warning mt-3">Filter references could not be loaded. Your selections are retained. <button className="btn btn-outline-success" type="button" onClick={() => setReferenceRetry((value) => value + 1)}>Retry filters</button></div>}
          <div className="d-flex flex-wrap gap-2 mt-3"><button className="btn btn-success" type="submit">Apply Filters</button><button className="btn btn-outline-secondary" type="button" onClick={clear}>Clear filters</button></div>
        </div>
      </form>
      {!data && !error && <div role="status" aria-busy="true" className="my-tickets-state">Loading your Dashboard…</div>}
      {error && <div className="alert alert-danger" role="alert"><p>{error}</p><button className="btn btn-outline-success" type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button></div>}
      {data && <>
        <p>As of <time dateTime={data.asOf}>{time(data.asOf)}</time> (Asia/Bangkok).</p>
        <p>Recent activity covers seven calendar days including today: <time dateTime={data.recentWindow.from}>{time(data.recentWindow.from)}</time> to <time dateTime={data.recentWindow.before}>{time(data.recentWindow.before)}</time> (exclusive). Updates and resolutions are capped at the server as-of time.</p>
        {filtered && <section aria-labelledby={`${id}-filters`} className="mb-3"><h2 id={`${id}-filters`} className="h5">Active filters</h2><ul>
          {requesterFilterNames.map((name) => data.filters[name] !== null && data.filters[name] !== undefined && data.filters[name] !== "" && <li key={name}>{filterLabels[name]}: {filterValue(name, data.filters[name]!)}</li>)}
        </ul></section>}
        <div className="row g-3 mb-4">
          {(Object.keys(metricLabels) as RequesterDashboardMetric[]).map((name) => <div className="col-12 col-sm-6 col-xl-3" key={name}>
            <Link className="card h-100 text-decoration-none text-success shadow-sm" to={requesterDrillDown(data.drillDown[name])!}>
              <div className="card-body"><span className="d-block">{metricLabels[name]}</span><strong className="fs-2">{data.metrics[name]}</strong></div>
            </Link>
          </div>)}
        </div>
        {empty && <div className="my-tickets-state mb-3"><p>{filtered ? "No current or recent Dashboard items match these filters." : "No Tickets in the current Dashboard categories."}</p>
          {!filtered && <Link className="btn btn-success" to="/tickets/new">Create Ticket</Link>}
        </div>}
        {recent("recentUpdated", data.lists.recentUpdated)}
        {recent("recentResolved", data.lists.recentResolved)}
      </>}
    </>}
  </section>;
}
