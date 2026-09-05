import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../src/App.js";

const REQUESTERS = [
  {
    id: 1,
    name: "Issue 17 Requester A",
    email: "issue17-requester-a@example.test",
  },
  {
    id: 2,
    name: "Issue 17 Requester B",
    email: "issue17-requester-b@example.test",
  },
];

const CATEGORIES = [
  { id: 11, name: "Hardware" },
  { id: 12, name: "Network" },
];

const RELATED_SYSTEMS = [
  { id: 21, name: "Email" },
  { id: 22, name: "Campus Wi-Fi" },
];

const REQUESTER_A_TICKET = {
  id: 101,
  ticketNumber: "TKT-2026-17001",
  ticketDate: "2026-09-04T08:30:00.000Z",
  summary: "Requester A laptop battery issue",
  category: CATEGORIES[0],
  relatedSystem: RELATED_SYSTEMS[0],
  requestedPriority: "URGENT",
  currentStatus: "IN_PROGRESS",
  createdAt: "2026-09-04T08:30:00.000Z",
  updatedAt: "2026-09-05T09:45:00.000Z",
};

const REQUESTER_B_TICKET = {
  id: 202,
  ticketNumber: "TKT-2026-18001",
  ticketDate: "2026-09-06T10:15:00.000Z",
  summary: "Requester B printer queue issue",
  category: CATEGORIES[1],
  relatedSystem: RELATED_SYSTEMS[1],
  requestedPriority: "LOW",
  currentStatus: "NEW",
  createdAt: "2026-09-06T10:15:00.000Z",
  updatedAt: "2026-09-06T11:20:00.000Z",
};

type TicketItem = typeof REQUESTER_A_TICKET;

type Pagination = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

type ListResponse = {
  items: TicketItem[];
  pagination: Pagination;
};

type TicketResponder = (
  url: URL,
  options?: RequestInit,
) => Response | Promise<Response>;

function jsonResponse(
  body: unknown,
  status = 200,
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function listResponse(
  items: TicketItem[] = [REQUESTER_A_TICKET],
  overrides: Partial<Pagination> = {},
): ListResponse {
  const totalItems =
    overrides.totalItems ?? items.length;
  const pageSize = overrides.pageSize ?? 10;
  const totalPages =
    overrides.totalPages ??
    (totalItems === 0
      ? 0
      : Math.ceil(totalItems / pageSize));
  const page = overrides.page ?? 1;

  return {
    items,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasPreviousPage:
        overrides.hasPreviousPage ??
        (totalItems > 0 && page > 1),
      hasNextPage:
        overrides.hasNextPage ??
        (totalItems > 0 && page < totalPages),
    },
  };
}

function installFetchMock(
  respondToTickets: TicketResponder = () =>
    jsonResponse(listResponse()),
) {
  const fetchMock = vi.fn(
    async (
      input: RequestInfo | URL,
      options?: RequestInit,
    ): Promise<Response> => {
      const url = new URL(String(input));

      if (url.pathname === "/api/development-requesters") {
        return jsonResponse(REQUESTERS);
      }

      if (url.pathname === "/api/categories") {
        return jsonResponse(CATEGORIES);
      }

      if (url.pathname === "/api/related-systems") {
        return jsonResponse(RELATED_SYSTEMS);
      }

      if (
        url.pathname === "/api/tickets" &&
        options?.method !== "POST"
      ) {
        return respondToTickets(url, options);
      }

      throw new Error(`Unexpected request: ${url.toString()}`);
    },
  );

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function ticketRequests(
  fetchMock: ReturnType<typeof vi.fn>,
) {
  return fetchMock.mock.calls.filter(([input, options]) => {
    const url = new URL(String(input));
    return (
      url.pathname === "/api/tickets" &&
      (options as RequestInit | undefined)?.method !== "POST"
    );
  });
}

function ticketRequestUrl(
  fetchMock: ReturnType<typeof vi.fn>,
  index = -1,
): URL {
  const requests = ticketRequests(fetchMock);
  const resolvedIndex = index < 0 ? requests.length + index : index;
  return new URL(String(requests[resolvedIndex][0]));
}

function ticketRequestHeaders(
  fetchMock: ReturnType<typeof vi.fn>,
  index = -1,
): Headers {
  const requests = ticketRequests(fetchMock);
  const resolvedIndex = index < 0 ? requests.length + index : index;
  const options = requests[resolvedIndex][1] as
    | RequestInit
    | undefined;
  return new Headers(options?.headers);
}

function emptyResponse(page = 1): ListResponse {
  return listResponse([], {
    page,
    totalItems: 0,
    totalPages: 0,
    hasPreviousPage: false,
    hasNextPage: false,
  });
}

describe("My Tickets", () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem("developmentRequesterId", "1");
    window.history.replaceState({}, "", "/tickets");
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/");
  });

  it("UI-05 preserves protected-route behavior when no Requester is selected", async () => {
    sessionStorage.clear();
    const fetchMock = installFetchMock();

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: "Select Development Requester",
      }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/select-requester");
    expect(ticketRequests(fetchMock)).toHaveLength(0);
  });

  it("UI-05 opens /tickets for the selected Requester, sends its context, and exposes a semantic loading state", async () => {
    let resolveTickets!: (response: Response) => void;
    const pendingTickets = new Promise<Response>((resolve) => {
      resolveTickets = resolve;
    });
    const fetchMock = installFetchMock(() => pendingTickets);

    render(<App />);

    expect(
      await screen.findByText(
        "Current Requester: Issue 17 Requester A",
      ),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/tickets");

    expect(
      await screen.findByRole("status"),
    ).toHaveTextContent("Loading your Tickets");
    expect(ticketRequests(fetchMock)).toHaveLength(1);
    expect(
      ticketRequestHeaders(fetchMock).get(
        "X-Development-Requester-Id",
      ),
    ).toBe("1");

    resolveTickets(jsonResponse(listResponse()));
  });

  it("UI-05 displays every approved Ticket field, text badges, one Detail link, and Create Ticket", async () => {
    installFetchMock();

    render(<App />);

    expect(
      await screen.findByText(
        REQUESTER_A_TICKET.ticketNumber,
      ),
    ).toBeInTheDocument();

    const table = screen.getByRole("table", {
      name: /my tickets/i,
    });
    for (const column of [
      "Ticket Number",
      "Ticket Date",
      "Summary",
      "Category",
      "Related System",
      "Priority",
      "Status",
      "Updated",
    ]) {
      expect(
        within(table).getByRole("columnheader", {
          name: column,
        }),
      ).toBeInTheDocument();
    }

    for (const value of [
      REQUESTER_A_TICKET.summary,
      REQUESTER_A_TICKET.category.name,
      REQUESTER_A_TICKET.relatedSystem.name,
    ]) {
      expect(within(table).getByText(value)).toBeInTheDocument();
    }

    expect(within(table).getAllByText(/2026/)).toHaveLength(2);
    expect(
      within(table).getByText("URGENT"),
    ).toHaveClass("badge");
    expect(
      within(table).getByText("IN_PROGRESS"),
    ).toHaveClass("badge");

    const detailLinks = screen.getAllByRole("link", {
      name: REQUESTER_A_TICKET.ticketNumber,
    });
    expect(detailLinks).toHaveLength(1);
    expect(detailLinks[0]).toHaveAttribute(
      "href",
      "/tickets/101",
    );
    expect(
      screen.getByRole("link", { name: "Create Ticket" }),
    ).toHaveAttribute("href", "/tickets/new");
  });

  it("UI-05 provides persistently labelled search, filter, sort, and page-size controls", async () => {
    installFetchMock();
    render(<App />);

    await screen.findByText(REQUESTER_A_TICKET.ticketNumber);

    expect(
      screen.getByRole("textbox", {
        name: /search.*ticket number.*summary/i,
      }),
    ).toBeInTheDocument();

    const category = screen.getByRole("combobox", {
      name: /^category/i,
    });
    const relatedSystem = screen.getByRole("combobox", {
      name: /related system/i,
    });
    const priority = screen.getByRole("combobox", {
      name: /requested priority/i,
    });
    const status = screen.getByRole("combobox", {
      name: /current status/i,
    });
    const sortField = screen.getByRole("combobox", {
      name: /sort field/i,
    });
    const sortDirection = screen.getByRole("combobox", {
      name: /sort direction/i,
    });
    const pageSize = screen.getByRole("combobox", {
      name: /page size/i,
    });

    expect(
      within(category).getByRole("option", {
        name: "Hardware",
      }),
    ).toBeInTheDocument();
    expect(
      within(relatedSystem).getByRole("option", {
        name: "Campus Wi-Fi",
      }),
    ).toBeInTheDocument();

    for (const value of ["LOW", "MEDIUM", "HIGH", "URGENT"]) {
      expect(
        within(priority).getByRole("option", { name: value }),
      ).toBeInTheDocument();
    }

    for (const value of [
      "NEW",
      "ASSIGNED",
      "IN_PROGRESS",
      "PENDING_REQUESTER",
      "RESOLVED",
      "CLOSED",
      "CANCELLED",
    ]) {
      expect(
        within(status).getByRole("option", { name: value }),
      ).toBeInTheDocument();
    }

    expect(within(sortField).getAllByRole("option")).toHaveLength(5);
    expect(
      within(sortDirection).getAllByRole("option"),
    ).toHaveLength(2);
    expect(
      within(pageSize)
        .getAllByRole("option")
        .map((option) => option.getAttribute("value")),
    ).toEqual(["10", "25", "50"]);
    expect(
      screen.getByRole("button", { name: /apply filters/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /clear filters/i }),
    ).toBeInTheDocument();
  });

  it("UI-05 keeps search and filter edits as drafts until Apply and resets to page 1", async () => {
    const user = userEvent.setup();
    const fetchMock = installFetchMock((url) => {
      const page = Number(url.searchParams.get("page") ?? "1");
      return jsonResponse(
        listResponse([REQUESTER_A_TICKET], {
          page,
          totalItems: 12,
          totalPages: 2,
          hasPreviousPage: page > 1,
          hasNextPage: page < 2,
        }),
      );
    });

    render(<App />);
    await screen.findByText(REQUESTER_A_TICKET.ticketNumber);

    await user.click(
      screen.getByRole("button", { name: /next/i }),
    );
    await waitFor(() => {
      expect(ticketRequests(fetchMock)).toHaveLength(2);
    });
    expect(ticketRequestUrl(fetchMock).searchParams.get("page")).toBe(
      "2",
    );

    await user.type(
      screen.getByRole("textbox", {
        name: /search.*ticket number.*summary/i,
      }),
      "  printer  ",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: /^category/i }),
      "11",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: /related system/i }),
      "22",
    );
    await user.selectOptions(
      screen.getByRole("combobox", {
        name: /requested priority/i,
      }),
      "HIGH",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: /current status/i }),
      "ASSIGNED",
    );

    expect(ticketRequests(fetchMock)).toHaveLength(2);

    await user.click(
      screen.getByRole("button", { name: /apply filters/i }),
    );
    await waitFor(() => {
      expect(ticketRequests(fetchMock)).toHaveLength(3);
    });

    const appliedUrl = ticketRequestUrl(fetchMock);
    expect(appliedUrl.searchParams.get("search")).toBe("printer");
    expect(appliedUrl.searchParams.get("categoryId")).toBe("11");
    expect(appliedUrl.searchParams.get("relatedSystemId")).toBe("22");
    expect(appliedUrl.searchParams.get("requestedPriority")).toBe(
      "HIGH",
    );
    expect(appliedUrl.searchParams.get("currentStatus")).toBe(
      "ASSIGNED",
    );
    expect(appliedUrl.searchParams.get("page")).toBe("1");
  });

  it("UI-05 clears applied search and filters, returns to page 1, and reloads", async () => {
    const user = userEvent.setup();
    const fetchMock = installFetchMock();

    render(<App />);
    await screen.findByText(REQUESTER_A_TICKET.ticketNumber);

    await user.type(
      screen.getByRole("textbox", {
        name: /search.*ticket number.*summary/i,
      }),
      "battery",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: /^category/i }),
      "11",
    );
    await user.click(
      screen.getByRole("button", { name: /apply filters/i }),
    );
    await waitFor(() => {
      expect(ticketRequests(fetchMock)).toHaveLength(2);
    });

    await user.click(
      screen.getByRole("button", { name: /clear filters/i }),
    );
    await waitFor(() => {
      expect(ticketRequests(fetchMock)).toHaveLength(3);
    });

    expect(
      screen.getByRole("textbox", {
        name: /search.*ticket number.*summary/i,
      }),
    ).toHaveValue("");
    expect(
      screen.getByRole("combobox", { name: /^category/i }),
    ).toHaveValue("");

    const clearedUrl = ticketRequestUrl(fetchMock);
    expect(clearedUrl.searchParams.has("search")).toBe(false);
    expect(clearedUrl.searchParams.has("categoryId")).toBe(false);
    expect(clearedUrl.searchParams.get("page")).toBe("1");
  });

  it("UI-05 applies sort field, direction, and page size immediately from page 1", async () => {
    const user = userEvent.setup();
    const fetchMock = installFetchMock();

    render(<App />);
    await screen.findByText(REQUESTER_A_TICKET.ticketNumber);

    await user.selectOptions(
      screen.getByRole("combobox", { name: /sort field/i }),
      "ticketDate",
    );
    await waitFor(() => {
      expect(ticketRequests(fetchMock)).toHaveLength(2);
    });
    expect(ticketRequestUrl(fetchMock).searchParams.get("sortBy")).toBe(
      "ticketDate",
    );
    expect(ticketRequestUrl(fetchMock).searchParams.get("page")).toBe(
      "1",
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: /sort direction/i }),
      "asc",
    );
    await waitFor(() => {
      expect(ticketRequests(fetchMock)).toHaveLength(3);
    });
    expect(
      ticketRequestUrl(fetchMock).searchParams.get("sortOrder"),
    ).toBe("asc");

    await user.selectOptions(
      screen.getByRole("combobox", { name: /page size/i }),
      "25",
    );
    await waitFor(() => {
      expect(ticketRequests(fetchMock)).toHaveLength(4);
    });
    expect(
      ticketRequestUrl(fetchMock).searchParams.get("pageSize"),
    ).toBe("25");
    expect(ticketRequestUrl(fetchMock).searchParams.get("page")).toBe(
      "1",
    );
  });

  it("UI-05 displays pagination metadata and preserves the applied query on Previous and Next", async () => {
    const user = userEvent.setup();
    const fetchMock = installFetchMock((url) => {
      const page = Number(url.searchParams.get("page") ?? "1");
      return jsonResponse(
        listResponse([REQUESTER_A_TICKET], {
          page,
          totalItems: 12,
          totalPages: 2,
          hasPreviousPage: page === 2,
          hasNextPage: page === 1,
        }),
      );
    });

    render(<App />);
    await screen.findByText(REQUESTER_A_TICKET.ticketNumber);

    await user.type(
      screen.getByRole("textbox", {
        name: /search.*ticket number.*summary/i,
      }),
      "battery",
    );
    await user.click(
      screen.getByRole("button", { name: /apply filters/i }),
    );

    expect(await screen.findByText(/page 1 of 2/i)).toBeInTheDocument();
    expect(screen.getByText(/12.*tickets/i)).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /page size/i }),
    ).toHaveValue("10");

    const previous = screen.getByRole("button", {
      name: /previous/i,
    });
    const next = screen.getByRole("button", { name: /next/i });
    expect(previous).toBeDisabled();
    expect(next).toBeEnabled();

    await user.click(next);
    expect(await screen.findByText(/page 2 of 2/i)).toBeInTheDocument();
    expect(previous).toBeEnabled();
    expect(next).toBeDisabled();

    let pageUrl = ticketRequestUrl(fetchMock);
    expect(pageUrl.searchParams.get("search")).toBe("battery");
    expect(pageUrl.searchParams.get("page")).toBe("2");

    await user.click(previous);
    await waitFor(() => {
      expect(ticketRequestUrl(fetchMock).searchParams.get("page")).toBe(
        "1",
      );
    });
    pageUrl = ticketRequestUrl(fetchMock);
    expect(pageUrl.searchParams.get("search")).toBe("battery");
  });

  it("UI-05 corrects one out-of-range page to the final valid page", async () => {
    const user = userEvent.setup();
    let ticketCallCount = 0;
    const fetchMock = installFetchMock(() => {
      ticketCallCount += 1;

      if (ticketCallCount === 1) {
        return jsonResponse(
          listResponse([REQUESTER_A_TICKET], {
            page: 1,
            totalItems: 11,
            totalPages: 2,
            hasNextPage: true,
          }),
        );
      }

      if (ticketCallCount === 2) {
        return jsonResponse(
          listResponse([], {
            page: 2,
            totalItems: 5,
            totalPages: 1,
            hasPreviousPage: true,
            hasNextPage: false,
          }),
        );
      }

      return jsonResponse(
        listResponse([REQUESTER_A_TICKET], {
          page: 1,
          totalItems: 5,
          totalPages: 1,
        }),
      );
    });

    render(<App />);
    await screen.findByText(REQUESTER_A_TICKET.ticketNumber);
    await user.click(
      screen.getByRole("button", { name: /next/i }),
    );

    await waitFor(() => {
      expect(ticketRequests(fetchMock)).toHaveLength(3);
    });
    expect(ticketRequestUrl(fetchMock).searchParams.get("page")).toBe(
      "1",
    );
    expect(
      screen.getByText(REQUESTER_A_TICKET.ticketNumber),
    ).toBeInTheDocument();
  });

  it("UI-05 shows the true empty state, hides pagination, does not refetch at totalPages zero, and keeps it after sorting", async () => {
    const user = userEvent.setup();
    const fetchMock = installFetchMock(() =>
      jsonResponse(emptyResponse()),
    );

    render(<App />);

    expect(
      await screen.findByText(
        "You have not created any Tickets yet.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Create Ticket" }),
    ).toHaveAttribute("href", "/tickets/new");
    expect(
      screen.queryByRole("navigation", { name: /pagination/i }),
    ).not.toBeInTheDocument();
    expect(ticketRequests(fetchMock)).toHaveLength(1);

    await user.selectOptions(
      screen.getByRole("combobox", { name: /sort direction/i }),
      "asc",
    );
    await waitFor(() => {
      expect(ticketRequests(fetchMock)).toHaveLength(2);
    });
    expect(
      screen.getByText("You have not created any Tickets yet."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "No Tickets match the current search and filters.",
      ),
    ).not.toBeInTheDocument();

    await Promise.resolve();
    expect(ticketRequests(fetchMock)).toHaveLength(2);
  });

  it("UI-05 shows no-results only for applied search or filters and Clear Filters reloads page 1", async () => {
    const user = userEvent.setup();
    let ticketCallCount = 0;
    const fetchMock = installFetchMock(() => {
      ticketCallCount += 1;
      return jsonResponse(
        ticketCallCount === 2
          ? emptyResponse()
          : listResponse(),
      );
    });

    render(<App />);
    await screen.findByText(REQUESTER_A_TICKET.ticketNumber);

    await user.type(
      screen.getByRole("textbox", {
        name: /search.*ticket number.*summary/i,
      }),
      "no match",
    );
    await user.click(
      screen.getByRole("button", { name: /apply filters/i }),
    );

    expect(
      await screen.findByText(
        "No Tickets match the current search and filters.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("You have not created any Tickets yet."),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /clear filters/i }),
    );
    expect(
      await screen.findByText(REQUESTER_A_TICKET.ticketNumber),
    ).toBeInTheDocument();

    const clearedUrl = ticketRequestUrl(fetchMock);
    expect(clearedUrl.searchParams.has("search")).toBe(false);
    expect(clearedUrl.searchParams.get("page")).toBe("1");
  });

  it("UI-05 replaces stale Tickets with a safe alert and retries the current applied query", async () => {
    const user = userEvent.setup();
    let ticketCallCount = 0;
    const fetchMock = installFetchMock(() => {
      ticketCallCount += 1;

      if (ticketCallCount === 2) {
        return jsonResponse(
          {
            error: {
              code: "INTERNAL_ERROR",
              message: "Something went wrong. Please try again.",
            },
          },
          500,
        );
      }

      return jsonResponse(listResponse());
    });

    render(<App />);
    await screen.findByText(REQUESTER_A_TICKET.ticketNumber);

    await user.type(
      screen.getByRole("textbox", {
        name: /search.*ticket number.*summary/i,
      }),
      "battery",
    );
    await user.click(
      screen.getByRole("button", { name: /apply filters/i }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Something went wrong. Please try again.",
    );
    expect(alert).not.toHaveTextContent(/prisma|sql|stack|secret/i);
    expect(
      screen.queryByText(REQUESTER_A_TICKET.ticketNumber),
    ).not.toBeInTheDocument();

    const failedUrl = ticketRequestUrl(fetchMock).toString();
    await user.click(
      screen.getByRole("button", { name: /try again/i }),
    );

    expect(
      await screen.findByText(REQUESTER_A_TICKET.ticketNumber),
    ).toBeInTheDocument();
    expect(ticketRequestUrl(fetchMock).toString()).toBe(failedUrl);
  });

  it("UI-05 clears Requester A data before loading Requester B and never crosses request contexts", async () => {
    const user = userEvent.setup();
    let resolveRequesterB!: (response: Response) => void;
    const requesterBPending = new Promise<Response>((resolve) => {
      resolveRequesterB = resolve;
    });
    const fetchMock = installFetchMock((_url, options) => {
      const requesterId = new Headers(options?.headers).get(
        "X-Development-Requester-Id",
      );

      if (requesterId === "2") {
        return requesterBPending;
      }

      return jsonResponse(listResponse([REQUESTER_A_TICKET]));
    });

    render(<App />);
    await screen.findByText(REQUESTER_A_TICKET.ticketNumber);

    await user.click(
      screen.getByRole("button", { name: /change requester/i }),
    );
    const requesterSelect = await screen.findByRole("combobox", {
      name: /development requester/i,
    });
    await user.selectOptions(requesterSelect, "2");
    await user.click(
      screen.getByRole("button", { name: /^continue$/i }),
    );

    expect(
      await screen.findByText(
        "Current Requester: Issue 17 Requester B",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(REQUESTER_A_TICKET.ticketNumber),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole("status"),
    ).toHaveTextContent("Loading your Tickets");

    const requesterHeaders = ticketRequests(fetchMock).map(
      (_request, index) =>
        ticketRequestHeaders(fetchMock, index).get(
          "X-Development-Requester-Id",
        ),
    );
    expect(requesterHeaders).toEqual(["1", "2"]);

    resolveRequesterB(
      jsonResponse(
        listResponse([
          REQUESTER_B_TICKET as TicketItem,
        ]),
      ),
    );

    expect(
      await screen.findByText(REQUESTER_B_TICKET.ticketNumber),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(REQUESTER_A_TICKET.summary),
    ).not.toBeInTheDocument();
  });
});
