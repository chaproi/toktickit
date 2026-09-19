import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authResponse, jsonResponse, renderAt, requesterUser, requestUrl } from "./test-helpers.js";

afterEach(() => vi.unstubAllGlobals());

describe("Issue 29 Requester UI regression", () => {
  it("lists authenticated Tickets with both priorities, owner, and no development identity", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.pathname === "/api/auth/me") return jsonResponse(authResponse(requesterUser));
      if (url.pathname === "/api/categories") return jsonResponse([{ id: 1, name: "Hardware" }]);
      if (url.pathname === "/api/related-systems") return jsonResponse([{ id: 2, name: "Laptop" }]);
      if (url.pathname === "/api/tickets") {
        expect(new Headers(init?.headers).has("X-Development-Requester-Id")).toBe(false);
        return jsonResponse({
          items: [{
            id: 88,
            ticketNumber: "TKT-2026-00088",
            ticketDate: "2026-09-18T08:00:00.000Z",
            category: { id: 1, name: "Hardware" },
            relatedSystem: { id: 2, name: "Laptop" },
            requestedPriority: "HIGH",
            itPriority: "MEDIUM",
            currentStatus: "OPEN",
            owner: null,
            summary: "Authenticated Ticket",
            createdAt: "2026-09-18T08:00:00.000Z",
            updatedAt: "2026-09-18T08:00:00.000Z",
          }],
          pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1,
            hasPreviousPage: false, hasNextPage: false },
        });
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderAt("/tickets");
    expect(await screen.findByText("TKT-2026-00088")).toBeInTheDocument();
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
    await waitFor(() => expect(sessionStorage.length).toBe(0));
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).pathname === "/api/development-requesters")).toBe(false);
  });

  it("creates a Ticket from session identity without client ownership fields", async () => {
    document.cookie = "toktickit_csrf=requester-flow-csrf; path=/";
    let submitted: Record<string, unknown> | undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.pathname === "/api/auth/me") return jsonResponse(authResponse(requesterUser));
      if (url.pathname === "/api/categories") return jsonResponse([{ id: 1, name: "Hardware" }]);
      if (url.pathname === "/api/related-systems") return jsonResponse([{ id: 2, name: "Laptop" }]);
      if (url.pathname === "/api/tickets" && init?.method === "POST") {
        submitted = JSON.parse(String(init.body)) as Record<string, unknown>;
        return jsonResponse({ replayed: false, ticket: {
          id: 90,
          ticketNumber: "TKT-2026-00090",
          ticketDate: "2026-09-18T08:00:00.000Z",
          requester: { id: requesterUser.id, name: requesterUser.name },
          category: { id: 1, name: "Hardware" },
          relatedSystem: { id: 2, name: "Laptop" },
          requestedPriority: "HIGH",
          itPriority: "HIGH",
          currentStatus: "NEW",
          owner: null,
          summary: "Authenticated creation",
          description: "Created using the live session identity.",
          requesterResolutionIndicatedAt: null,
          createdAt: "2026-09-18T08:00:00.000Z",
          updatedAt: "2026-09-18T08:00:00.000Z",
        } });
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderAt("/tickets/new");
    const user = userEvent.setup();
    expect(await screen.findByLabelText(/Category/u)).toBeInTheDocument();
    expect(screen.getAllByText(requesterUser.name)).toHaveLength(2);
    await user.selectOptions(screen.getByLabelText(/Category/u), "1");
    await user.selectOptions(screen.getByLabelText(/Related System/u), "2");
    await user.selectOptions(screen.getByLabelText(/^Priority/u), "HIGH");
    await user.type(screen.getByLabelText(/Summary/u), "Authenticated creation");
    await user.type(screen.getByLabelText(/Description/u), "Created using the live session identity.");
    await user.click(screen.getByRole("button", { name: "Create Ticket" }));

    expect(await screen.findByRole("heading", { name: "Ticket Created Successfully" })).toBeInTheDocument();
    expect(submitted).not.toHaveProperty("requesterId");
    expect(submitted).toMatchObject({
      categoryId: 1,
      relatedSystemId: 2,
      requestedPriority: "HIGH",
      summary: "Authenticated creation",
    });
  });

  it("sends the documented search, filter, sort, and pagination controls", async () => {
    const ticketQueries: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.pathname === "/api/auth/me") return jsonResponse(authResponse(requesterUser));
      if (url.pathname === "/api/categories") return jsonResponse([{ id: 1, name: "Hardware" }]);
      if (url.pathname === "/api/related-systems") return jsonResponse([{ id: 2, name: "Laptop" }]);
      if (url.pathname === "/api/tickets") {
        ticketQueries.push(url);
        return jsonResponse({
          items: [{
            id: 88,
            ticketNumber: "TKT-2026-00088",
            ticketDate: "2026-09-18T08:00:00.000Z",
            category: { id: 1, name: "Hardware" },
            relatedSystem: { id: 2, name: "Laptop" },
            requestedPriority: "HIGH",
            itPriority: "MEDIUM",
            currentStatus: "OPEN",
            owner: null,
            summary: "Searchable Ticket",
            createdAt: "2026-09-18T08:00:00.000Z",
            updatedAt: "2026-09-18T08:00:00.000Z",
          }],
          pagination: { page: Number(url.searchParams.get("page")), pageSize: Number(url.searchParams.get("pageSize")), totalItems: 2, totalPages: 2,
            hasPreviousPage: url.searchParams.get("page") === "2", hasNextPage: url.searchParams.get("page") === "1" },
        });
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    }));
    renderAt("/tickets");
    const user = userEvent.setup();
    await screen.findByText("TKT-2026-00088");
    await user.type(screen.getByLabelText("Search Tickets"), "Searchable");
    await user.selectOptions(screen.getByLabelText("Category"), "1");
    await user.selectOptions(screen.getByLabelText("Related System"), "2");
    await user.selectOptions(screen.getByLabelText("Requested Priority"), "HIGH");
    await user.selectOptions(screen.getByLabelText("Current Status"), "OPEN");
    await user.selectOptions(screen.getByLabelText("Sort Field"), "ticketNumber");
    await user.selectOptions(screen.getByLabelText("Sort Direction"), "asc");
    await user.selectOptions(screen.getByLabelText("Page Size"), "25");
    await user.click(screen.getByRole("button", { name: "Apply Filters" }));
    await waitFor(() => {
      const query = ticketQueries.at(-1)?.searchParams;
      expect(Object.fromEntries(query ?? [])).toMatchObject({
        search: "Searchable",
        categoryId: "1",
        relatedSystemId: "2",
        requestedPriority: "HIGH",
        currentStatus: "OPEN",
        sortBy: "ticketNumber",
        sortOrder: "asc",
        page: "1",
        pageSize: "25",
      });
    });
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(ticketQueries.at(-1)?.searchParams.get("page")).toBe("2"));
  });

  it("renders only public owned detail, Comments, and retained Attachments", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.pathname === "/api/auth/me") return jsonResponse(authResponse(requesterUser));
      if (url.pathname === "/api/tickets/88") return jsonResponse({
        id: 88,
        ticketNumber: "TKT-2026-00088",
        ticketDate: "2026-09-18T08:00:00.000Z",
        requester: { id: requesterUser.id, name: requesterUser.name },
        category: { id: 1, name: "Hardware" },
        relatedSystem: { id: 2, name: "Laptop" },
        requestedPriority: "HIGH",
        itPriority: "MEDIUM",
        currentStatus: "OPEN",
        owner: null,
        summary: "Public owned detail",
        description: "Requester-visible description.",
        requesterResolutionIndicatedAt: null,
        createdAt: "2026-09-18T08:00:00.000Z",
        updatedAt: "2026-09-18T08:00:00.000Z",
      });
      if (url.pathname === "/api/tickets/88/attachments") return jsonResponse({ items: [{
        id: 3, ticketId: 88, originalFilename: "evidence.pdf", mimeType: "application/pdf", sizeBytes: 42,
        uploadedByRequesterId: requesterUser.id, isRemoved: false, createdAt: "2026-09-18T08:00:00.000Z",
        removedAt: null, removedByRequesterId: null, removalReason: null,
      }] });
      if (url.pathname === "/api/tickets/88/comments") return jsonResponse({ items: [{
        id: 4, ticketId: 88, author: { id: requesterUser.id, name: requesterUser.name, role: "REQUESTER" },
        content: "Visible public update", createdAt: "2026-09-18T09:00:00.000Z",
      }], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, hasPreviousPage: false, hasNextPage: false } });
      throw new Error(`Unexpected request: ${url.pathname}`);
    }));
    renderAt("/tickets/88");
    expect(await screen.findByText("Public owned detail")).toBeInTheDocument();
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
    expect(await screen.findByText("Visible public update")).toBeInTheDocument();
    expect(await screen.findByText("evidence.pdf")).toBeInTheDocument();
    expect(screen.queryByText(/Internal Notes/u)).not.toBeInTheDocument();
  });

  it("shows the same safe not-found state for inaccessible detail", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.pathname === "/api/auth/me") return jsonResponse(authResponse(requesterUser));
      if (url.pathname === "/api/tickets/404") return jsonResponse({
        error: { code: "TICKET_NOT_FOUND", message: "Ticket not found." },
      }, 404);
      throw new Error(`Unexpected request: ${url.pathname}`);
    }));
    renderAt("/tickets/404");
    expect(await screen.findByText("Ticket not found.")).toBeInTheDocument();
    expect(screen.queryByText("Requester-visible description.")).not.toBeInTheDocument();
  });
});
