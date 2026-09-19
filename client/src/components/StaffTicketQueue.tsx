import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ApiRequestError,
  getCategories,
  getRelatedSystems,
  getStaffAssignees,
  getStaffTickets,
  type Category,
  type EligibleAssignee,
  type RelatedSystem,
  type RequestedPriority,
  type StaffQueueItem,
  type StaffQueueResponse,
  type StaffQueueSortField,
  type TicketPageSize,
  type TicketSortOrder,
  type TicketStatus,
} from "../api.js";

type Filters = {
  search: string;
  categoryId: string;
  relatedSystemId: string;
  requestedPriority: string;
  itPriority: string;
  currentStatus: string;
  owner: string;
};
type LoadState = "loading" | "success" | "error";
type ReferenceState = "loading" | "ready" | "error";

const EMPTY_FILTERS: Filters = {
  search: "",
  categoryId: "",
  relatedSystemId: "",
  requestedPriority: "",
  itPriority: "",
  currentStatus: "",
  owner: "",
};
const PRIORITIES: RequestedPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const STATUSES: TicketStatus[] = [
  "NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER",
  "REOPENED", "RESOLVED", "CLOSED", "CANCELLED",
];
const SORT_FIELDS: Array<{ value: StaffQueueSortField; label: string }> = [
  { value: "ticketNumber", label: "Ticket Number" },
  { value: "ticketDate", label: "Ticket Date" },
  { value: "updatedAt", label: "Last Updated" },
  { value: "requestedPriority", label: "Requested Priority" },
  { value: "itPriority", label: "IT Priority" },
  { value: "currentStatus", label: "Current Status" },
];

function enumLabel(value: string): string {
  return value.toLowerCase().split("_")
    .map((part, index) => index > 0 && ["for", "of", "to"].includes(part)
      ? part
      : part[0]?.toUpperCase() + part.slice(1)).join(" ");
}

function roleLabel(role: EligibleAssignee["role"]): string {
  return role === "IT_STAFF" ? "IT Staff" : "Administrator";
}

function badgeClass(value: RequestedPriority | TicketStatus): string {
  if (value === "URGENT" || value === "CANCELLED") return "text-bg-danger";
  if (value === "HIGH" || value === "WAITING_FOR_REQUESTER") return "text-bg-warning";
  if (value === "LOW" || value === "RESOLVED" || value === "CLOSED") return "text-bg-secondary";
  return "text-bg-success";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

function ownerLabel(ticket: StaffQueueItem): string {
  return ticket.owner ? `${ticket.owner.name} (${roleLabel(ticket.owner.role)})` : "Unassigned";
}

function hasFilters(filters: Filters): boolean {
  return Object.values(filters).some((value) => value !== "");
}

function QueueTable({ items }: { items: StaffQueueItem[] }) {
  return (
    <div className="staff-queue-table-wrap" role="region" aria-label="Scrollable Ticket Queue table" tabIndex={0}>
      <table className="table align-middle staff-queue-table" aria-label="Ticket Queue">
        <thead><tr>
          <th scope="col">Ticket</th><th scope="col">Summary</th><th scope="col">Requester</th>
          <th scope="col">Priorities</th><th scope="col">Status</th><th scope="col">Owner</th>
          <th scope="col">Updated</th>
        </tr></thead>
        <tbody>{items.map((ticket) => (
          <tr key={ticket.id}>
            <td><span className="ticket-number-link">{ticket.ticketNumber}</span><small>{formatDate(ticket.ticketDate)}</small></td>
            <td className="staff-queue-summary"><strong>{ticket.summary}</strong><small>{ticket.category.name} / {ticket.relatedSystem.name}</small></td>
            <td>{ticket.requester.name}<span className="visually-hidden">{ticket.requester.email}</span></td>
            <td><span className={`badge ${badgeClass(ticket.requestedPriority)}`}>Requested {enumLabel(ticket.requestedPriority)}</span>{" "}<span className={`badge ${badgeClass(ticket.itPriority)}`}>IT {enumLabel(ticket.itPriority)}</span></td>
            <td><span className={`badge ${badgeClass(ticket.currentStatus)}`}>{enumLabel(ticket.currentStatus)}</span>{ticket.requesterResolutionIndicatedAt && <small>Requester reports problem appears resolved</small>}</td>
            <td>{ownerLabel(ticket)}</td>
            <td><time dateTime={ticket.updatedAt}>{formatDate(ticket.updatedAt)}</time><Link className="btn btn-sm btn-outline-success" to={`/staff/tickets/${ticket.id}`}>Open Ticket</Link></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function QueueCards({ items }: { items: StaffQueueItem[] }) {
  return (
    <div className="staff-queue-cards">
      {items.map((ticket) => {
        const words = ticket.summary.split(" ");
        return (
          <article className="staff-queue-card" key={ticket.id}>
            <div><strong>{ticket.ticketNumber}</strong><small>{formatDate(ticket.ticketDate)}</small></div>
            <dl>
              <div><dt>Summary</dt><dd>{words.map((word, index) => <span key={`${word}-${index}`}>{word}{index < words.length - 1 ? " " : ""}</span>)}</dd></div>
              <div><dt>Category / Related System</dt><dd>{ticket.category.name} / {ticket.relatedSystem.name}</dd></div>
              <div><dt>Requester</dt><dd>{ticket.requester.name}<span className="visually-hidden"> {ticket.requester.email}</span></dd></div>
              <div><dt>Requested Priority</dt><dd>{enumLabel(ticket.requestedPriority)}</dd></div>
              <div><dt>IT Priority</dt><dd>{enumLabel(ticket.itPriority)}</dd></div>
              <div><dt>Status</dt><dd>{enumLabel(ticket.currentStatus)}{ticket.requesterResolutionIndicatedAt && <small>Requester reports problem appears resolved</small>}</dd></div>
              <div><dt>Owner</dt><dd>{ownerLabel(ticket)}</dd></div>
              <div><dt>Updated</dt><dd>{formatDate(ticket.updatedAt)}</dd></div>
            </dl>
            <Link className="btn btn-outline-success" to={`/staff/tickets/${ticket.id}`}>Open Ticket</Link>
          </article>
        );
      })}
    </div>
  );
}

export default function StaffTicketQueue() {
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [sortBy, setSortBy] = useState<StaffQueueSortField>("updatedAt");
  const [sortOrder, setSortOrder] = useState<TicketSortOrder>("desc");
  const [pageSize, setPageSize] = useState<TicketPageSize>(10);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<StaffQueueResponse | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [retry, setRetry] = useState(0);
  const requestVersion = useRef(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [systems, setSystems] = useState<RelatedSystem[]>([]);
  const [assignees, setAssignees] = useState<EligibleAssignee[]>([]);
  const [referenceState, setReferenceState] = useState<ReferenceState>("loading");
  const [referenceRetry, setReferenceRetry] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setReferenceState("loading");
    void Promise.all([getCategories(), getRelatedSystems(), getStaffAssignees(controller.signal)])
      .then(([nextCategories, nextSystems, nextAssignees]) => {
        if (!active) return;
        setCategories(nextCategories); setSystems(nextSystems); setAssignees(nextAssignees);
        setReferenceState("ready");
      })
      .catch(() => {
        if (!active) return;
        setCategories([]); setSystems([]); setAssignees([]); setReferenceState("error");
      });
    return () => { active = false; controller.abort(); };
  }, [referenceRetry]);

  useEffect(() => {
    const version = ++requestVersion.current;
    const controller = new AbortController();
    setLoadState("loading"); setErrorMessage(""); setResult(null);
    const owner = applied.owner === "" ? undefined
      : applied.owner === "me" || applied.owner === "unassigned" ? applied.owner
        : Number(applied.owner);
    void getStaffTickets({
      ...(applied.search ? { search: applied.search } : {}),
      ...(applied.categoryId ? { categoryId: Number(applied.categoryId) } : {}),
      ...(applied.relatedSystemId ? { relatedSystemId: Number(applied.relatedSystemId) } : {}),
      ...(applied.requestedPriority ? { requestedPriority: applied.requestedPriority as RequestedPriority } : {}),
      ...(applied.itPriority ? { itPriority: applied.itPriority as RequestedPriority } : {}),
      ...(applied.currentStatus ? { currentStatus: applied.currentStatus as TicketStatus } : {}),
      ...(owner === undefined ? {} : { owner }),
      sortBy, sortOrder, page, pageSize,
    }, controller.signal).then((response) => {
      if (version !== requestVersion.current) return;
      if (response.items.length === 0 && response.pagination.totalPages > 0 && page > response.pagination.totalPages) {
        setPage(response.pagination.totalPages);
        return;
      }
      setResult(response); setLoadState("success");
    }).catch((error: unknown) => {
      if (version !== requestVersion.current || (error instanceof DOMException && error.name === "AbortError")) return;
      setResult(null);
      setErrorMessage(error instanceof ApiRequestError ? error.message : "Something went wrong. Please try again.");
      setLoadState("error");
    });
    return () => controller.abort();
  }, [applied, sortBy, sortOrder, page, pageSize, retry]);

  function update(field: keyof Filters, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApplied({ ...draft, search: draft.search.trim() }); setPage(1);
  }
  function clear() {
    setDraft({ ...EMPTY_FILTERS }); setApplied({ ...EMPTY_FILTERS }); setPage(1);
  }

  const items = result?.items ?? [];
  const empty = loadState === "success" && items.length === 0 && !hasFilters(applied);
  const noResults = loadState === "success" && items.length === 0 && hasFilters(applied);

  return (
    <section aria-labelledby="staff-queue-heading">
      {loadState !== "loading" && <h1 id="staff-queue-heading" className="h2">Ticket Queue</h1>}
      <p className="text-secondary">Search and triage Tickets across Requesters.</p>
      <form className="card border-0 shadow-sm mb-4" onSubmit={apply}>
        <div className="card-body p-4">
          <div className="staff-queue-filter-grid">
            <div className="staff-queue-search"><label className="form-label" htmlFor="queue-search">Search Queue</label><input id="queue-search" className="form-control" maxLength={100} value={draft.search} onChange={(event) => update("search", event.target.value)} /></div>
            <div><label className="form-label" htmlFor="queue-category">Category</label><select id="queue-category" className="form-select" value={draft.categoryId} disabled={referenceState === "loading"} onChange={(event) => update("categoryId", event.target.value)}><option value="">All Categories</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
            <div><label className="form-label" htmlFor="queue-system">Related System</label><select id="queue-system" className="form-select" value={draft.relatedSystemId} disabled={referenceState === "loading"} onChange={(event) => update("relatedSystemId", event.target.value)}><option value="">All Related Systems</option>{systems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
            <div><label className="form-label" htmlFor="queue-requested-priority">Requested Priority</label><select id="queue-requested-priority" className="form-select" value={draft.requestedPriority} onChange={(event) => update("requestedPriority", event.target.value)}><option value="">All Priorities</option>{PRIORITIES.map((item) => <option key={item} value={item}>{enumLabel(item)}</option>)}</select></div>
            <div><label className="form-label" htmlFor="queue-it-priority">IT Priority</label><select id="queue-it-priority" className="form-select" value={draft.itPriority} onChange={(event) => update("itPriority", event.target.value)}><option value="">All Priorities</option>{PRIORITIES.map((item) => <option key={item} value={item}>{enumLabel(item)}</option>)}</select></div>
            <div><label className="form-label" htmlFor="queue-status">Status</label><select id="queue-status" className="form-select" value={draft.currentStatus} onChange={(event) => update("currentStatus", event.target.value)}><option value="">All Statuses</option>{STATUSES.map((item) => <option key={item} value={item}>{enumLabel(item)}</option>)}</select></div>
            <div><label className="form-label" htmlFor="queue-owner">Owner</label><select id="queue-owner" className="form-select" value={draft.owner} disabled={referenceState === "loading"} onChange={(event) => update("owner", event.target.value)}><option value="">All Owners</option><option value="unassigned">Unassigned</option><option value="me">Mine</option>{assignees.map((item) => <option key={item.id} value={item.id}>{item.name} ({roleLabel(item.role)})</option>)}</select></div>
          </div>
          {referenceState === "error" && <div className="alert alert-warning mt-3 mb-0" role="alert">Queue filters could not be loaded. <button type="button" className="btn btn-sm btn-outline-success" onClick={() => setReferenceRetry((value) => value + 1)}>Retry filters</button></div>}
          <div className="d-flex flex-wrap gap-2 mt-3"><button type="submit" className="btn btn-success">Apply Filters</button><button type="button" className="btn btn-outline-secondary" onClick={clear}>Clear Filters</button></div>
        </div>
      </form>

      <div className="card border-0 shadow-sm"><div className="card-body p-4">
        <div className="staff-queue-summary-bar" aria-live="polite">
          <span>{result?.counts.matching ?? 0} matching</span><span>{result?.counts.unassigned ?? 0} unassigned</span><span>{result?.counts.mine ?? 0} mine</span>
        </div>
        <div className="staff-queue-sort-grid mb-4">
          <div><label className="form-label" htmlFor="queue-sort">Sort Field</label><select id="queue-sort" className="form-select" value={sortBy} onChange={(event) => { setSortBy(event.target.value as StaffQueueSortField); setPage(1); }}>{SORT_FIELDS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
          <div><label className="form-label" htmlFor="queue-direction">Sort Direction</label><select id="queue-direction" className="form-select" value={sortOrder} onChange={(event) => { setSortOrder(event.target.value as TicketSortOrder); setPage(1); }}><option value="asc">Ascending</option><option value="desc">Descending</option></select></div>
          <div><label className="form-label" htmlFor="queue-page-size">Page Size</label><select id="queue-page-size" className="form-select" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value) as TicketPageSize); setPage(1); }}><option value="10">10</option><option value="25">25</option><option value="50">50</option></select></div>
        </div>
        {loadState === "loading" && <div className="my-tickets-state"><span className="spinner-border spinner-border-sm" aria-hidden="true" /><span role="status">Loading Ticket Queue…</span></div>}
        {loadState === "error" && <div className="alert alert-danger mb-0" role="alert"><p>{errorMessage}</p><button type="button" className="btn btn-outline-danger" onClick={() => setRetry((value) => value + 1)}>Try Again</button></div>}
        {loadState === "success" && items.length > 0 && <><QueueTable items={items} /><QueueCards items={items} /></>}
        {empty && <div className="my-tickets-state">No Tickets are available in the Queue.</div>}
        {noResults && <div className="my-tickets-state">No Tickets match the current Queue filters.</div>}
        {loadState !== "error" && result && result.pagination.totalItems > 0 && <nav className="my-tickets-pagination" aria-label="Ticket Queue pagination"><div className="my-tickets-pagination-summary"><span>Page {result.pagination.page} of {result.pagination.totalPages}</span><span>{result.pagination.totalItems} Tickets</span><span>Page size {result.pagination.pageSize}</span></div><div className="d-flex gap-2"><button type="button" className="btn btn-outline-success" disabled={loadState === "loading" || !result.pagination.hasPreviousPage} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><button type="button" className="btn btn-outline-success" disabled={loadState === "loading" || !result.pagination.hasNextPage} onClick={() => setPage((value) => value + 1)}>Next</button></div></nav>}
      </div></div>
    </section>
  );
}
