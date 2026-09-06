import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";
import {
  ApiRequestError,
  getCategories,
  getRelatedSystems,
  getTickets,
  type Category,
  type RelatedSystem,
  type RequestedPriority,
  type TicketListItem,
  type TicketListPagination,
  type TicketPageSize,
  type TicketSortField,
  type TicketSortOrder,
  type TicketStatus,
} from "../api.js";

interface MyTicketsProps {
  requesterId: number;
}

type LoadState = "loading" | "success" | "error";
type ReferenceState = "loading" | "ready" | "error";

type FilterValues = {
  search: string;
  categoryId: string;
  relatedSystemId: string;
  requestedPriority: string;
  currentStatus: string;
};

const EMPTY_FILTERS: FilterValues = {
  search: "",
  categoryId: "",
  relatedSystemId: "",
  requestedPriority: "",
  currentStatus: "",
};

const PRIORITIES: RequestedPriority[] = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT",
];

const STATUSES: TicketStatus[] = [
  "NEW",
  "ASSIGNED",
  "IN_PROGRESS",
  "PENDING_REQUESTER",
  "RESOLVED",
  "CLOSED",
  "CANCELLED",
];

const SORT_FIELDS: Array<{
  value: TicketSortField;
  label: string;
}> = [
  { value: "ticketNumber", label: "Ticket Number" },
  { value: "ticketDate", label: "Ticket Date" },
  { value: "updatedAt", label: "Last Updated" },
  { value: "summary", label: "Summary" },
  { value: "requestedPriority", label: "Requested Priority" },
];

function hasAppliedSearchOrFilter(filters: FilterValues): boolean {
  return Object.values(filters).some((value) => value !== "");
}

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

function badgeClass(value: RequestedPriority | TicketStatus): string {
  if (value === "URGENT" || value === "CANCELLED") {
    return "text-bg-danger";
  }

  if (value === "HIGH" || value === "PENDING_REQUESTER") {
    return "text-bg-warning";
  }

  if (value === "LOW" || value === "RESOLVED" || value === "CLOSED") {
    return "text-bg-secondary";
  }

  return "text-bg-success";
}

export default function MyTickets({
  requesterId,
}: MyTicketsProps) {
  const [draftFilters, setDraftFilters] =
    useState<FilterValues>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] =
    useState<FilterValues>(EMPTY_FILTERS);
  const [sortBy, setSortBy] =
    useState<TicketSortField>("updatedAt");
  const [sortOrder, setSortOrder] =
    useState<TicketSortOrder>("desc");
  const [pageSize, setPageSize] =
    useState<TicketPageSize>(10);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<TicketListItem[]>([]);
  const [pagination, setPagination] =
    useState<TicketListPagination | null>(null);
  const [loadState, setLoadState] =
    useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [retryVersion, setRetryVersion] = useState(0);
  const requestVersion = useRef(0);

  const [categories, setCategories] = useState<Category[]>([]);
  const [relatedSystems, setRelatedSystems] = useState<
    RelatedSystem[]
  >([]);
  const [referenceState, setReferenceState] =
    useState<ReferenceState>("loading");
  const [referenceRetryVersion, setReferenceRetryVersion] =
    useState(0);

  useEffect(() => {
    let active = true;
    setReferenceState("loading");

    void Promise.all([getCategories(), getRelatedSystems()])
      .then(([loadedCategories, loadedSystems]) => {
        if (!active) {
          return;
        }

        setCategories(loadedCategories);
        setRelatedSystems(loadedSystems);
        setReferenceState("ready");
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setCategories([]);
        setRelatedSystems([]);
        setReferenceState("error");
      });

    return () => {
      active = false;
    };
  }, [referenceRetryVersion]);

  useEffect(() => {
    const activeRequest = ++requestVersion.current;
    const controller = new AbortController();

    setLoadState("loading");
    setErrorMessage("");
    setItems([]);

    const query = {
      ...(appliedFilters.search
        ? { search: appliedFilters.search }
        : {}),
      ...(appliedFilters.categoryId
        ? { categoryId: Number(appliedFilters.categoryId) }
        : {}),
      ...(appliedFilters.relatedSystemId
        ? {
            relatedSystemId: Number(
              appliedFilters.relatedSystemId,
            ),
          }
        : {}),
      ...(appliedFilters.requestedPriority
        ? {
            requestedPriority:
              appliedFilters.requestedPriority as RequestedPriority,
          }
        : {}),
      ...(appliedFilters.currentStatus
        ? {
            currentStatus:
              appliedFilters.currentStatus as TicketStatus,
          }
        : {}),
      sortBy,
      sortOrder,
      page,
      pageSize,
    };

    void getTickets(requesterId, query, controller.signal)
      .then((response) => {
        if (activeRequest !== requestVersion.current) {
          return;
        }

        if (
          response.items.length === 0 &&
          response.pagination.totalPages > 0 &&
          page > response.pagination.totalPages
        ) {
          setPage(response.pagination.totalPages);
          return;
        }

        setItems(response.items);
        setPagination(response.pagination);
        setLoadState("success");
      })
      .catch((error: unknown) => {
        if (
          activeRequest !== requestVersion.current ||
          (error instanceof DOMException &&
            error.name === "AbortError")
        ) {
          return;
        }

        setItems([]);
        setPagination(null);
        setErrorMessage(
          error instanceof ApiRequestError
            ? error.message
            : "Something went wrong. Please try again.",
        );
        setLoadState("error");
      });

    return () => {
      controller.abort();
    };
  }, [
    requesterId,
    appliedFilters,
    sortBy,
    sortOrder,
    page,
    pageSize,
    retryVersion,
  ]);

  function updateDraftFilter(
    field: keyof FilterValues,
    value: string,
  ) {
    setDraftFilters((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedFilters({
      ...draftFilters,
      search: draftFilters.search.trim(),
    });
    setPage(1);
  }

  function clearFilters() {
    setDraftFilters({ ...EMPTY_FILTERS });
    setAppliedFilters({ ...EMPTY_FILTERS });
    setPage(1);
  }

  const showEmpty =
    loadState === "success" &&
    items.length === 0 &&
    !hasAppliedSearchOrFilter(appliedFilters);
  const showNoResults =
    loadState === "success" &&
    items.length === 0 &&
    hasAppliedSearchOrFilter(appliedFilters);

  return (
    <section aria-labelledby="my-tickets-heading">
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-4">
        <div>
          <h1 id="my-tickets-heading" className="h2 mb-2">
            My Tickets
          </h1>
          <p className="text-secondary mb-0">
            Search and review your IT support requests.
          </p>
        </div>
      </div>

      <form
        className="card border-0 shadow-sm mb-4"
        onSubmit={applyFilters}
      >
        <div className="card-body p-4">
          <div className="my-tickets-filter-grid">
            <div className="my-tickets-search-field">
              <label className="form-label" htmlFor="ticket-search">
                Search by Ticket Number or Summary
              </label>
              <input
                id="ticket-search"
                className="form-control"
                value={draftFilters.search}
                maxLength={100}
                onChange={(event) =>
                  updateDraftFilter("search", event.target.value)
                }
              />
            </div>

            <div>
              <label className="form-label" htmlFor="ticket-category">
                Category
              </label>
              <select
                id="ticket-category"
                className="form-select"
                value={draftFilters.categoryId}
                disabled={referenceState === "loading"}
                onChange={(event) =>
                  updateDraftFilter("categoryId", event.target.value)
                }
              >
                <option value="">All Categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                className="form-label"
                htmlFor="ticket-related-system"
              >
                Related System
              </label>
              <select
                id="ticket-related-system"
                className="form-select"
                value={draftFilters.relatedSystemId}
                disabled={referenceState === "loading"}
                onChange={(event) =>
                  updateDraftFilter(
                    "relatedSystemId",
                    event.target.value,
                  )
                }
              >
                <option value="">All Related Systems</option>
                {relatedSystems.map((system) => (
                  <option key={system.id} value={system.id}>
                    {system.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label" htmlFor="ticket-priority">
                Requested Priority
              </label>
              <select
                id="ticket-priority"
                className="form-select"
                value={draftFilters.requestedPriority}
                onChange={(event) =>
                  updateDraftFilter(
                    "requestedPriority",
                    event.target.value,
                  )
                }
              >
                <option value="">All Priorities</option>
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label" htmlFor="ticket-status">
                Current Status
              </label>
              <select
                id="ticket-status"
                className="form-select"
                value={draftFilters.currentStatus}
                onChange={(event) =>
                  updateDraftFilter(
                    "currentStatus",
                    event.target.value,
                  )
                }
              >
                <option value="">All Statuses</option>
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {referenceState === "error" && (
            <div className="alert alert-warning mt-3 mb-0" role="alert">
              <span>
                Category and Related System filters could not be loaded.
              </span>{" "}
              <button
                type="button"
                className="btn btn-sm btn-outline-success ms-2"
                onClick={() =>
                  setReferenceRetryVersion((current) => current + 1)
                }
              >
                Retry filters
              </button>
            </div>
          )}

          <div className="d-flex flex-wrap gap-2 mt-3">
            <button type="submit" className="btn btn-success">
              Apply Filters
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={clearFilters}
            >
              Clear Filters
            </button>
          </div>
        </div>
      </form>

      <div className="card border-0 shadow-sm">
        <div className="card-body p-4">
          <div className="my-tickets-sort-grid mb-4">
            <div>
              <label className="form-label" htmlFor="ticket-sort-field">
                Sort Field
              </label>
              <select
                id="ticket-sort-field"
                className="form-select"
                value={sortBy}
                onChange={(event) => {
                  setSortBy(event.target.value as TicketSortField);
                  setPage(1);
                }}
              >
                {SORT_FIELDS.map((field) => (
                  <option key={field.value} value={field.value}>
                    {field.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                className="form-label"
                htmlFor="ticket-sort-direction"
              >
                Sort Direction
              </label>
              <select
                id="ticket-sort-direction"
                className="form-select"
                value={sortOrder}
                onChange={(event) => {
                  setSortOrder(event.target.value as TicketSortOrder);
                  setPage(1);
                }}
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </div>

            <div>
              <label className="form-label" htmlFor="ticket-page-size">
                Page Size
              </label>
              <select
                id="ticket-page-size"
                className="form-select"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(
                    Number(event.target.value) as TicketPageSize,
                  );
                  setPage(1);
                }}
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
            </div>
          </div>

          {loadState === "loading" && (
            <div className="my-tickets-state" role="status">
              <span
                className="spinner-border spinner-border-sm"
                aria-hidden="true"
              />
              <span>Loading your Ticketsโ€ฆ</span>
            </div>
          )}

          {loadState === "error" && (
            <div className="alert alert-danger mb-0" role="alert">
              <p>{errorMessage}</p>
              <button
                type="button"
                className="btn btn-outline-danger"
                onClick={() =>
                  setRetryVersion((current) => current + 1)
                }
              >
                Try Again
              </button>
            </div>
          )}

          {loadState === "success" && items.length > 0 && (
            <div className="my-tickets-table-wrap">
              <table
                className="table align-middle my-tickets-table"
                aria-label="My Tickets"
              >
                <thead>
                  <tr>
                    <th scope="col">Ticket Number</th>
                    <th scope="col">Ticket Date</th>
                    <th scope="col">Summary</th>
                    <th scope="col">Category</th>
                    <th scope="col">Related System</th>
                    <th scope="col">Priority</th>
                    <th scope="col">Status</th>
                    <th scope="col">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((ticket) => (
                    <tr key={ticket.id}>
                      <td data-label="Ticket Number">
                        <Link
                          className="ticket-number-link"
                          to={`/tickets/${ticket.id}`}
                        >
                          {ticket.ticketNumber}
                        </Link>
                      </td>
                      <td data-label="Ticket Date">
                        <time dateTime={ticket.ticketDate}>
                          {formatDate(ticket.ticketDate)}
                        </time>
                      </td>
                      <td
                        className="my-tickets-summary"
                        data-label="Summary"
                      >
                        {ticket.summary}
                      </td>
                      <td data-label="Category">
                        {ticket.category.name}
                      </td>
                      <td data-label="Related System">
                        {ticket.relatedSystem.name}
                      </td>
                      <td data-label="Priority">
                        <span
                          className={`badge ${badgeClass(
                            ticket.requestedPriority,
                          )}`}
                        >
                          {ticket.requestedPriority}
                        </span>
                      </td>
                      <td data-label="Status">
                        <span
                          className={`badge ${badgeClass(
                            ticket.currentStatus,
                          )}`}
                        >
                          {ticket.currentStatus}
                        </span>
                      </td>
                      <td data-label="Updated">
                        <time dateTime={ticket.updatedAt}>
                          {formatDate(ticket.updatedAt)}
                        </time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {showEmpty && (
            <div className="my-tickets-state">
              <p className="mb-0">
                You have not created any Tickets yet.
              </p>
            </div>
          )}

          {showNoResults && (
            <div className="my-tickets-state">
              <p className="mb-0">
                No Tickets match the current search and filters.
              </p>
            </div>
          )}

          {loadState !== "error" &&
            pagination !== null &&
            pagination.totalItems > 0 && (
              <nav
                className="my-tickets-pagination"
                aria-label="My Tickets pagination"
              >
                <div className="my-tickets-pagination-summary">
                  <span>
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <span>{pagination.totalItems} Tickets</span>
                  <span>Page size {pagination.pageSize}</span>
                </div>

                <div className="d-flex gap-2">
                  <button
                    type="button"
                    className="btn btn-outline-success"
                    disabled={
                      loadState === "loading" ||
                      !pagination.hasPreviousPage
                    }
                    onClick={() =>
                      setPage((current) => Math.max(1, current - 1))
                    }
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-success"
                    disabled={
                      loadState === "loading" ||
                      !pagination.hasNextPage
                    }
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Next
                  </button>
                </div>
              </nav>
            )}
        </div>
      </div>
    </section>
  );
}
