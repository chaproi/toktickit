import { screen, waitFor, within } from "@testing-library/react";
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

  it("completes public Comment, Attachment, and resolution-indication actions without changing formal status", async () => {
    document.cookie = "toktickit_csrf=requester-flow-csrf; path=/";
    let commentPosted = false;
    let uploadedAttachment: Record<string, unknown> | null = null;
    const detail = {
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
      summary: "Complete Requester workflow",
      description: "Exercise each authenticated Requester detail action.",
      requesterResolutionIndicatedAt: null,
      createdAt: "2026-09-18T08:00:00.000Z",
      updatedAt: "2026-09-18T08:00:00.000Z",
    };
    const attachment = {
      id: 7,
      ticketId: 88,
      originalFilename: "requester-evidence.png",
      mimeType: "image/png",
      sizeBytes: 68,
      uploadedByRequesterId: requesterUser.id,
      isRemoved: false,
      createdAt: "2026-09-18T09:00:00.000Z",
      removedAt: null,
      removedByRequesterId: null,
      removalReason: null,
    };

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.pathname === "/api/auth/me") return jsonResponse(authResponse(requesterUser));
      if (url.pathname === "/api/tickets/88") return jsonResponse(detail);
      if (url.pathname === "/api/tickets/88/comments" && init?.method === "POST") {
        expect(new Headers(init.headers).get("X-CSRF-Token")).toBe("requester-flow-csrf");
        expect(JSON.parse(String(init.body))).toEqual({ content: "The issue now works for me." });
        commentPosted = true;
        return jsonResponse({
          id: 10,
          ticketId: 88,
          author: { id: requesterUser.id, name: requesterUser.name, role: "REQUESTER" },
          content: "The issue now works for me.",
          createdAt: "2026-09-18T09:15:00.000Z",
        }, 201);
      }
      if (url.pathname === "/api/tickets/88/comments") {
        return jsonResponse({
          items: commentPosted ? [{
            id: 10,
            ticketId: 88,
            author: { id: requesterUser.id, name: requesterUser.name, role: "REQUESTER" },
            content: "The issue now works for me.",
            createdAt: "2026-09-18T09:15:00.000Z",
          }] : [],
          pagination: {
            page: 1,
            pageSize: 20,
            totalItems: commentPosted ? 1 : 0,
            totalPages: commentPosted ? 1 : 0,
            hasPreviousPage: false,
            hasNextPage: false,
          },
        });
      }
      if (url.pathname === "/api/tickets/88/attachments" && init?.method === "POST") {
        expect(new Headers(init.headers).get("X-CSRF-Token")).toBe("requester-flow-csrf");
        expect(init.body).toBeInstanceOf(FormData);
        uploadedAttachment = attachment;
        return jsonResponse(attachment, 201);
      }
      if (url.pathname === "/api/tickets/88/attachments") {
        return jsonResponse({ items: uploadedAttachment ? [uploadedAttachment] : [] });
      }
      if (url.pathname === "/api/tickets/88/attachments/7" && init?.method === "DELETE") {
        expect(new Headers(init.headers).get("X-CSRF-Token")).toBe("requester-flow-csrf");
        expect(JSON.parse(String(init.body))).toEqual({ removalReason: "No longer needed for diagnosis." });
        uploadedAttachment = {
          ...attachment,
          isRemoved: true,
          removedAt: "2026-09-18T09:30:00.000Z",
          removedByRequesterId: requesterUser.id,
          removalReason: "No longer needed for diagnosis.",
        };
        return jsonResponse(uploadedAttachment);
      }
      if (url.pathname === "/api/tickets/88/resolution-indication" && init?.method === "POST") {
        expect(new Headers(init.headers).get("X-CSRF-Token")).toBe("requester-flow-csrf");
        expect(JSON.parse(String(init.body))).toEqual({ confirm: true });
        return jsonResponse({
          ticketId: 88,
          currentStatus: "OPEN",
          requesterResolutionIndicatedAt: "2026-09-18T09:45:00.000Z",
        });
      }
      throw new Error(`Unexpected request: ${url.pathname} ${init?.method ?? "GET"}`);
    }));

    renderAt("/tickets/88");
    const user = userEvent.setup();
    expect(await screen.findByText("Complete Requester workflow")).toBeInTheDocument();
    expect(await screen.findByText("No public comments yet.")).toBeInTheDocument();
    expect(await screen.findByText("This Ticket has no active attachments.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Add a public comment"), "The issue now works for me.");
    await user.click(screen.getByRole("button", { name: "Post comment" }));
    expect(await screen.findByText("The issue now works for me.")).toBeInTheDocument();

    const file = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "requester-evidence.png", {
      type: "image/png",
    });
    await user.upload(screen.getByLabelText("Add Attachment"), file);
    await user.click(screen.getByRole("button", { name: "Upload" }));
    expect(await screen.findByText("Attachment uploaded successfully. File: requester-evidence.png.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove requester-evidence.png" }));
    const removalDialog = screen.getByRole("dialog", { name: "Remove Attachment" });
    await user.type(within(removalDialog).getByLabelText("Removal reason"), "No longer needed for diagnosis.");
    await user.click(within(removalDialog).getByRole("button", { name: "Remove Attachment" }));
    expect(await screen.findByText("Attachment removed successfully. File: requester-evidence.png.")).toBeInTheDocument();
    expect(screen.getAllByText("Removed", { exact: true }).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Problem Appears Resolved" }));
    const resolutionDialog = screen.getByRole("dialog", { name: "Does the problem appear resolved?" });
    await user.click(within(resolutionDialog).getByRole("button", { name: "Yes, it appears resolved" }));
    expect(await screen.findByText(/Waiting for the support team to formally resolve this Ticket/u)).toBeInTheDocument();
    expect(screen.getByText("Open", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("Resolved", { exact: true })).not.toBeInTheDocument();
  });

  it("shows a newly posted Comment on its authoritative final page without clearing failed drafts", async () => {
    document.cookie = "toktickit_csrf=requester-flow-csrf; path=/";
    const detail = {
      id: 95,
      ticketNumber: "TKT-2026-00095",
      ticketDate: "2026-09-18T08:00:00.000Z",
      requester: { id: requesterUser.id, name: requesterUser.name },
      category: { id: 1, name: "Hardware" },
      relatedSystem: { id: 2, name: "Laptop" },
      requestedPriority: "HIGH",
      itPriority: "HIGH",
      currentStatus: "OPEN",
      owner: null,
      summary: "Paginated Comments",
      description: "New server Comments must remain visible beyond page one.",
      requesterResolutionIndicatedAt: null,
      createdAt: "2026-09-18T08:00:00.000Z",
      updatedAt: "2026-09-18T08:00:00.000Z",
    };
    const firstPage = Array.from({ length: 20 }, (_, index) => ({
      id: index + 1,
      ticketId: 95,
      author: { id: requesterUser.id, name: `Author ${index + 1}`, role: "REQUESTER" },
      content: `Older comment ${index + 1}`,
      createdAt: `2026-09-18T${String(index).padStart(2, "0")}:00:00.000Z`,
    }));
    const created = {
      id: 21,
      ticketId: 95,
      author: { id: 501, name: "Server Author", role: "REQUESTER" },
      content: "Newest server comment",
      createdAt: "2026-09-19T05:06:07.000Z",
    };
    let postCount = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.pathname === "/api/auth/me") return jsonResponse(authResponse(requesterUser));
      if (url.pathname === "/api/tickets/95") return jsonResponse(detail);
      if (url.pathname === "/api/tickets/95/attachments") return jsonResponse({ items: [] });
      if (url.pathname === "/api/tickets/95/comments" && init?.method === "POST") {
        postCount += 1;
        if (postCount === 1) return jsonResponse(created, 201);
        return jsonResponse({ error: { code: "SERVICE_UNAVAILABLE", message: "Something went wrong. Please try again." } }, 503);
      }
      if (url.pathname === "/api/tickets/95/comments") {
        const page = Number(url.searchParams.get("page"));
        return jsonResponse(page === 2 ? {
          items: [created],
          pagination: { page: 2, pageSize: 20, totalItems: 21, totalPages: 2, hasPreviousPage: true, hasNextPage: false },
        } : {
          items: firstPage,
          pagination: { page: 1, pageSize: 20, totalItems: 20, totalPages: 1, hasPreviousPage: false, hasNextPage: false },
        });
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    }));
    renderAt("/tickets/95");
    const user = userEvent.setup();
    await screen.findByText("Older comment 20");
    const composer = screen.getByLabelText("Add a public comment") as HTMLTextAreaElement;
    await user.type(composer, "Newest server comment");
    await user.click(screen.getByRole("button", { name: "Post comment" }));
    expect(await screen.findByText("Newest server comment")).toBeInTheDocument();
    expect(screen.getByText("Server Author")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 2 · 21 comments")).toBeInTheDocument();
    expect(screen.getAllByText("Newest server comment")).toHaveLength(1);
    expect(composer).toHaveValue("");
    expect(screen.getByRole("button", { name: "Previous comments" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next comments" })).toBeDisabled();

    await user.type(composer, "Keep this draft after failure");
    await user.click(screen.getByRole("button", { name: "Post comment" }));
    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
    expect(composer).toHaveValue("Keep this draft after failure");
  });

  it("recovers from an initial Comment-list failure after a successful POST", async () => {
    document.cookie = "toktickit_csrf=requester-flow-csrf; path=/";
    const detail = {
      id: 96,
      ticketNumber: "TKT-2026-00096",
      ticketDate: "2026-09-18T08:00:00.000Z",
      requester: { id: requesterUser.id, name: requesterUser.name },
      category: { id: 1, name: "Hardware" },
      relatedSystem: { id: 2, name: "Laptop" },
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: "OPEN",
      owner: null,
      summary: "Comment recovery",
      description: "The composer remains usable after a safe list failure.",
      requesterResolutionIndicatedAt: null,
      createdAt: "2026-09-18T08:00:00.000Z",
      updatedAt: "2026-09-18T08:00:00.000Z",
    };
    const created = {
      id: 601,
      ticketId: 96,
      author: { id: requesterUser.id, name: "Server-confirmed Author", role: "REQUESTER" },
      content: "Visible after list recovery",
      createdAt: "2026-09-19T06:00:00.000Z",
    };
    let listRequests = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.pathname === "/api/auth/me") return jsonResponse(authResponse(requesterUser));
      if (url.pathname === "/api/tickets/96") return jsonResponse(detail);
      if (url.pathname === "/api/tickets/96/attachments") return jsonResponse({ items: [] });
      if (url.pathname === "/api/tickets/96/comments" && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({ content: "Visible after list recovery" });
        return jsonResponse(created, 201);
      }
      if (url.pathname === "/api/tickets/96/comments") {
        listRequests += 1;
        if (listRequests === 1) {
          return jsonResponse({
            error: {
              code: "DEPENDENCY_FAILURE",
              message: "Something went wrong. Please try again.",
              debug: "private database detail",
            },
          }, 503);
        }
        return jsonResponse({
          items: [created],
          pagination: {
            page: 1,
            pageSize: 20,
            totalItems: 1,
            totalPages: 1,
            hasPreviousPage: false,
            hasNextPage: false,
          },
        });
      }
      throw new Error(`Unexpected request: ${url.pathname} ${init?.method ?? "GET"}`);
    }));

    renderAt("/tickets/96");
    const user = userEvent.setup();
    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
    const composer = screen.getByLabelText("Add a public comment") as HTMLTextAreaElement;
    expect(composer).toBeEnabled();
    await user.type(composer, "Visible after list recovery");
    await user.click(screen.getByRole("button", { name: "Post comment" }));

    expect(await screen.findByText("Visible after list recovery")).toBeInTheDocument();
    expect(screen.getByText("Server-confirmed Author")).toBeInTheDocument();
    expect(composer).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Try Again" })).not.toBeInTheDocument();
    expect(screen.queryByText("private database detail")).not.toBeInTheDocument();
    expect(listRequests).toBeGreaterThanOrEqual(2);
  });

  it("locates a concurrently shifted created Comment on authoritative page 3", async () => {
    document.cookie = "toktickit_csrf=requester-flow-csrf; path=/";
    const detail = {
      id: 97,
      ticketNumber: "TKT-2026-00097",
      ticketDate: "2026-09-18T08:00:00.000Z",
      requester: { id: requesterUser.id, name: requesterUser.name },
      category: { id: 1, name: "Hardware" },
      relatedSystem: { id: 2, name: "Laptop" },
      requestedPriority: "HIGH",
      itPriority: "HIGH",
      currentStatus: "OPEN",
      owner: null,
      summary: "Concurrent Comment pagination",
      description: "Authoritative pagination must replace stale local totals.",
      requesterResolutionIndicatedAt: null,
      createdAt: "2026-09-18T08:00:00.000Z",
      updatedAt: "2026-09-18T08:00:00.000Z",
    };
    const comment = (id: number) => ({
      id,
      ticketId: 97,
      author: { id: 500 + id, name: `Author ${id}`, role: "REQUESTER" },
      content: `Comment ${id}`,
      createdAt: `2026-09-${String(id < 20 ? 18 : 19).padStart(2, "0")}T${String(id % 20).padStart(2, "0")}:00:00.000Z`,
    });
    const created = {
      ...comment(41),
      author: { id: requesterUser.id, name: "Authoritative Poster", role: "REQUESTER" },
      content: "Concurrent created comment 41",
      createdAt: "2026-09-20T00:00:00.000Z",
    };
    let posted = false;
    const pagesAfterPost: number[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.pathname === "/api/auth/me") return jsonResponse(authResponse(requesterUser));
      if (url.pathname === "/api/tickets/97") return jsonResponse(detail);
      if (url.pathname === "/api/tickets/97/attachments") return jsonResponse({ items: [] });
      if (url.pathname === "/api/tickets/97/comments" && init?.method === "POST") {
        posted = true;
        return jsonResponse(created, 201);
      }
      if (url.pathname === "/api/tickets/97/comments") {
        const page = Number(url.searchParams.get("page"));
        if (!posted) {
          return jsonResponse({
            items: Array.from({ length: 20 }, (_, index) => comment(index + 1)),
            pagination: { page: 1, pageSize: 20, totalItems: 20, totalPages: 1, hasPreviousPage: false, hasNextPage: false },
          });
        }
        pagesAfterPost.push(page);
        if (page === 3) {
          return jsonResponse({
            items: [created],
            pagination: { page: 3, pageSize: 20, totalItems: 41, totalPages: 3, hasPreviousPage: true, hasNextPage: false },
          });
        }
        return jsonResponse({
          items: page === 1
            ? Array.from({ length: 20 }, (_, index) => comment(index + 1))
            : Array.from({ length: 20 }, (_, index) => comment(index + 21)),
          pagination: {
            page,
            pageSize: 20,
            totalItems: 41,
            totalPages: 3,
            hasPreviousPage: page > 1,
            hasNextPage: page < 3,
          },
        });
      }
      throw new Error(`Unexpected request: ${url.pathname} ${init?.method ?? "GET"}`);
    }));

    renderAt("/tickets/97");
    const user = userEvent.setup();
    await screen.findByText("Comment 20");
    const composer = screen.getByLabelText("Add a public comment") as HTMLTextAreaElement;
    await user.type(composer, "Concurrent created comment 41");
    await user.click(screen.getByRole("button", { name: "Post comment" }));

    await waitFor(() => expect(pagesAfterPost.filter((page) => page === 3).length).toBeGreaterThanOrEqual(2));
    expect(screen.getByText("Concurrent created comment 41")).toBeInTheDocument();
    expect(screen.getAllByText("Concurrent created comment 41")).toHaveLength(1);
    expect(screen.getByText("Authoritative Poster")).toBeInTheDocument();
    expect(screen.getByText(/Page 3 of 3.*41 comments/u)).toBeInTheDocument();
    expect(composer).toHaveValue("");
    expect(pagesAfterPost).not.toContain(2);
  });

  it("shows deterministic loading, empty, no-results, validation, and dependency-failure states", async () => {
    let resolveInitialTickets: ((response: Response) => void) | undefined;
    let ticketRequests = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.pathname === "/api/auth/me") return jsonResponse(authResponse(requesterUser));
      if (url.pathname === "/api/categories") return jsonResponse([{ id: 1, name: "Hardware" }]);
      if (url.pathname === "/api/related-systems") return jsonResponse([{ id: 2, name: "Laptop" }]);
      if (url.pathname === "/api/tickets") {
        ticketRequests += 1;
        if (ticketRequests === 1) {
          return new Promise<Response>((resolve) => { resolveInitialTickets = resolve; });
        }
        return jsonResponse({
          items: [],
          pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false },
        });
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const view = renderAt("/tickets");
    expect(await screen.findByText(/Loading your Tickets/u)).toBeInTheDocument();
    resolveInitialTickets?.(jsonResponse({
      items: [],
      pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false },
    }));
    expect(await screen.findByText("You have not created any Tickets yet.")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Search Tickets"), "missing");
    await user.click(screen.getByRole("button", { name: "Apply Filters" }));
    expect(await screen.findByText("No Tickets match the current search and filters.")).toBeInTheDocument();

    view.unmount();
    renderAt("/tickets/new");
    expect(await screen.findByLabelText(/Category/u)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create Ticket" }));
    expect(await screen.findByText(/Please correct the highlighted fields before creating the Ticket/u)).toBeInTheDocument();
    expect(screen.getByText("Summary is required")).toBeInTheDocument();
  });

  it("renders a safe retryable dependency failure without protected detail", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.pathname === "/api/auth/me") return jsonResponse(authResponse(requesterUser));
      if (url.pathname === "/api/tickets/500") {
        return jsonResponse({
          error: { code: "SERVICE_UNAVAILABLE", message: "Something went wrong. Please try again." },
        }, 503);
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    }));
    renderAt("/tickets/500");
    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try Again" })).toBeInTheDocument();
    expect(screen.queryByText("Requester-visible description.")).not.toBeInTheDocument();
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
