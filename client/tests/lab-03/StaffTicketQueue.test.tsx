import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authResponse,
  jsonResponse,
  renderAt,
  requesterUser,
  requestUrl,
} from "./test-helpers.js";

const staffUser = {
  ...requesterUser,
  id: 71,
  name: "Queue Staff",
  email: "queue.staff@example.test",
  role: "IT_STAFF" as const,
};
const adminUser = {
  ...staffUser,
  id: 72,
  name: "Queue Administrator",
  role: "ADMINISTRATOR" as const,
};
const ticket = {
  id: 301,
  ticketNumber: "TKT-2026-00301",
  ticketDate: "2026-09-20T08:00:00.000Z",
  summary: "VPN connection drops",
  requester: { id: 81, name: "Rina Requester", email: "rina@example.test" },
  category: { id: 1, name: "Network" },
  relatedSystem: { id: 2, name: "VPN" },
  requestedPriority: "MEDIUM",
  itPriority: "HIGH",
  currentStatus: "WAITING_FOR_REQUESTER",
  owner: null,
  requesterResolutionIndicatedAt: "2026-09-20T09:00:00.000Z",
  updatedAt: "2026-09-20T10:00:00.000Z",
};
const references = {
  categories: [{ id: 1, name: "Network" }],
  systems: [{ id: 2, name: "VPN" }],
  assignees: [
    { id: 71, name: "Queue Staff", role: "IT_STAFF" },
    { id: 72, name: "Queue Administrator", role: "ADMINISTRATOR" },
  ],
};
const populated = {
  items: [ticket],
  counts: { matching: 1, unassigned: 1, mine: 0 },
  pagination: {
    page: 1, pageSize: 10, totalItems: 1, totalPages: 1,
    hasPreviousPage: false, hasNextPage: false,
  },
};

afterEach(() => vi.unstubAllGlobals());

function installFetch({
  user = staffUser,
  queue = async () => jsonResponse(populated),
}: {
  user?: typeof staffUser | typeof adminUser | typeof requesterUser;
  queue?: (url: URL) => Promise<Response>;
} = {}) {
  const calls: URL[] = [];
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const url = requestUrl(input);
    if (url.pathname === "/api/auth/me") return jsonResponse(authResponse(user));
    if (url.pathname === "/api/categories") return jsonResponse(references.categories);
    if (url.pathname === "/api/related-systems") return jsonResponse(references.systems);
    if (url.pathname === "/api/staff/assignees") return jsonResponse({ items: references.assignees });
    if (url.pathname === "/api/staff/tickets") {
      calls.push(url);
      return queue(url);
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  vi.stubGlobal("fetch", mock);
  return { calls, mock };
}

describe("UI-05 IT Staff Ticket Queue", () => {
  it.each([
    [staffUser, "/staff/tickets"],
    [adminUser, "/staff/tickets"],
  ])("renders the complete populated Queue for $user.role", async (user, path) => {
    installFetch({ user });
    const { container } = renderAt(path);
    expect(await screen.findByRole("heading", { name: "Ticket Queue" })).toBeInTheDocument();
    expect(screen.getByText("1 matching")).toBeInTheDocument();
    expect(screen.getByText("1 unassigned")).toBeInTheDocument();
    expect(screen.getByText("0 mine")).toBeInTheDocument();

    for (const label of [
      "Search Queue", "Category", "Related System", "Requested Priority",
      "IT Priority", "Status", "Owner", "Sort Field", "Sort Direction", "Page Size",
    ]) expect(screen.getByLabelText(label)).toBeInTheDocument();
    expect(within(screen.getByLabelText("Owner")).getByRole("option", { name: "Unassigned" })).toBeInTheDocument();
    expect(within(screen.getByLabelText("Owner")).getByRole("option", { name: /Queue Staff.*IT Staff/i })).toBeInTheDocument();

    const table = screen.getByRole("table", { name: "Ticket Queue" });
    expect(within(table).getByText(ticket.ticketNumber)).toBeInTheDocument();
    expect(within(table).getByText(ticket.summary)).toBeInTheDocument();
    expect(within(table).getByText("Network / VPN")).toBeInTheDocument();
    expect(within(table).getByText("Rina Requester")).toBeInTheDocument();
    expect(within(table).getByText("rina@example.test")).toHaveClass("visually-hidden");
    expect(within(table).getByText("Requested Medium")).toBeInTheDocument();
    expect(within(table).getByText("IT High")).toBeInTheDocument();
    expect(within(table).getByText("Waiting for Requester")).toBeInTheDocument();
    expect(within(table).getByText("Requester reports problem appears resolved")).toBeInTheDocument();
    expect(within(table).getByText("Unassigned")).toBeInTheDocument();
    expect(within(table).getByRole("link", { name: "Open Ticket" })).toHaveAttribute("href", "/staff/tickets/301");

    const cards = container.querySelector(".staff-queue-cards");
    expect(cards).not.toBeNull();
    expect(within(cards as HTMLElement).getByText(ticket.ticketNumber)).toBeInTheDocument();
    expect(within(cards as HTMLElement).getByText("Owner")).toBeInTheDocument();
  });

  it("keeps search and filters draft until Apply, then clears them and resets page one", async () => {
    const { calls } = installFetch();
    renderAt("/staff/tickets");
    await screen.findByText(ticket.summary);
    const initialCalls = calls.length;
    await userEvent.type(screen.getByLabelText("Search Queue"), "  vpn  ");
    await userEvent.selectOptions(screen.getByLabelText("Category"), "1");
    await userEvent.selectOptions(screen.getByLabelText("IT Priority"), "HIGH");
    await userEvent.selectOptions(screen.getByLabelText("Owner"), "me");
    expect(calls).toHaveLength(initialCalls);

    await userEvent.click(screen.getByRole("button", { name: "Apply Filters" }));
    await waitFor(() => expect(calls.length).toBe(initialCalls + 1));
    const applied = calls.at(-1)!;
    expect(applied.searchParams.get("search")).toBe("vpn");
    expect(applied.searchParams.get("categoryId")).toBe("1");
    expect(applied.searchParams.get("itPriority")).toBe("HIGH");
    expect(applied.searchParams.get("owner")).toBe("me");
    expect(applied.searchParams.get("page")).toBe("1");

    await userEvent.click(screen.getByRole("button", { name: "Clear Filters" }));
    await waitFor(() => expect(calls.length).toBe(initialCalls + 2));
    const cleared = calls.at(-1)!;
    expect(cleared.searchParams.has("search")).toBe(false);
    expect(cleared.searchParams.has("categoryId")).toBe(false);
    expect(cleared.searchParams.has("itPriority")).toBe(false);
    expect(cleared.searchParams.has("owner")).toBe(false);
    expect(cleared.searchParams.get("page")).toBe("1");
  });

  it("applies sort, direction, and page size immediately with page reset and accessible pagination", async () => {
    const responses = (url: URL) => Promise.resolve(jsonResponse({
      ...populated,
      pagination: {
        page: Number(url.searchParams.get("page")),
        pageSize: Number(url.searchParams.get("pageSize")),
        totalItems: 12,
        totalPages: 2,
        hasPreviousPage: url.searchParams.get("page") === "2",
        hasNextPage: url.searchParams.get("page") === "1",
      },
    }));
    const { calls } = installFetch({ queue: responses });
    renderAt("/staff/tickets");
    await screen.findByText("Page 1 of 2");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Page 2 of 2");

    await userEvent.selectOptions(screen.getByLabelText("Sort Field"), "currentStatus");
    await waitFor(() => expect(calls.at(-1)!.searchParams.get("sortBy")).toBe("currentStatus"));
    expect(calls.at(-1)!.searchParams.get("page")).toBe("1");
    await userEvent.selectOptions(screen.getByLabelText("Sort Direction"), "asc");
    await waitFor(() => expect(calls.at(-1)!.searchParams.get("sortOrder")).toBe("asc"));
    expect(calls.at(-1)!.searchParams.get("page")).toBe("1");
    await userEvent.selectOptions(screen.getByLabelText("Page Size"), "25");
    await waitFor(() => expect(calls.at(-1)!.searchParams.get("pageSize")).toBe("25"));
    expect(calls.at(-1)!.searchParams.get("page")).toBe("1");
  });

  it("distinguishes loading and the unfiltered empty state", async () => {
    let release: ((response: Response) => void) | undefined;
    const deferred = new Promise<Response>((resolve) => { release = resolve; });
    installFetch({ queue: async () => deferred });
    renderAt("/staff/tickets");
    expect(await screen.findByText("Loading Ticket Queue…")).toHaveAttribute("role", "status");
    release!(jsonResponse({
      items: [], counts: { matching: 0, unassigned: 0, mine: 0 },
      pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false },
    }));
    expect(await screen.findByText("No Tickets are available in the Queue.")).toBeInTheDocument();
  });

  it("recovers an out-of-range page by requesting the final valid page once", async () => {
    const { calls } = installFetch({ queue: async (url) => {
      if (url.searchParams.get("page") === "3") return jsonResponse({
        items: [], counts: populated.counts,
        pagination: { page: 3, pageSize: 10, totalItems: 12, totalPages: 2, hasPreviousPage: true, hasNextPage: false },
      });
      const page = Number(url.searchParams.get("page"));
      return jsonResponse({
        ...populated,
        pagination: {
          ...populated.pagination,
          page,
          totalItems: 30,
          totalPages: 3,
          hasPreviousPage: page > 1,
          hasNextPage: page < 3,
        },
      });
    } });
    renderAt("/staff/tickets");
    await screen.findByText("Page 1 of 3");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Page 2 of 3");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(calls.map((url) => url.searchParams.get("page")))
      .toEqual(["1", "2", "3", "2"]));
    expect(await screen.findByText("Page 2 of 3")).toBeInTheDocument();
  });

  it("shows no-results with Clear Filters after an applied query", async () => {
    installFetch({ queue: async (url) => jsonResponse(url.searchParams.has("search") ? {
      items: [], counts: { matching: 0, unassigned: 0, mine: 0 },
      pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false },
    } : populated) });
    renderAt("/staff/tickets");
    await screen.findByText(ticket.summary);
    await userEvent.type(screen.getByLabelText("Search Queue"), "not present");
    await userEvent.click(screen.getByRole("button", { name: "Apply Filters" }));
    expect(await screen.findByText("No Tickets match the current Queue filters.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear Filters" })).toBeInTheDocument();
  });

  it("removes stale Queue data on safe failure and retries successfully", async () => {
    let count = 0;
    installFetch({ queue: async (url) => {
      count += 1;
      if (count === 2) return jsonResponse({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } }, 500);
      return jsonResponse(populated);
    } });
    renderAt("/staff/tickets");
    await screen.findByText(ticket.summary);
    await userEvent.selectOptions(screen.getByLabelText("Sort Direction"), "asc");
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    expect(screen.queryByText(ticket.summary)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try Again" }));
    expect(await screen.findByText(ticket.summary)).toBeInTheDocument();
  });

  it("blocks Requesters and clears Queue content on session expiry", async () => {
    installFetch({ user: requesterUser });
    renderAt("/staff/tickets");
    expect(await screen.findByRole("heading", { name: "Forbidden" })).toBeInTheDocument();
    expect(screen.queryByText(ticket.summary)).not.toBeInTheDocument();

    cleanup();
    vi.unstubAllGlobals();
    installFetch({ queue: async () => jsonResponse({
      error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication is required." },
    }, 401) });
    renderAt("/staff/tickets");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByText("Your session has expired. Please sign in again.")).toBeInTheDocument();
    expect(screen.queryByText(ticket.summary)).not.toBeInTheDocument();
  });
});
