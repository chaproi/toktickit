import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authResponse, jsonResponse, renderAt, requesterUser, requestUrl } from "./test-helpers.js";

afterEach(() => vi.unstubAllGlobals());

describe("Issue 29 resolution indication UI", () => {
  it("confirms the indication and never represents formal status as changed", async () => {
    document.cookie = "toktickit_csrf=resolution-csrf; path=/";
    const detail = {
      id: 88,
      ticketNumber: "TKT-2026-00088",
      ticketDate: "2026-09-18T08:00:00.000Z",
      requester: { id: requesterUser.id, name: requesterUser.name },
      category: { id: 1, name: "Hardware" },
      relatedSystem: { id: 2, name: "Laptop" },
      requestedPriority: "HIGH",
      itPriority: "MEDIUM",
      currentStatus: "IN_PROGRESS",
      owner: null,
      summary: "Authenticated Ticket",
      description: "Requester-visible description.",
      requesterResolutionIndicatedAt: null,
      createdAt: "2026-09-18T08:00:00.000Z",
      updatedAt: "2026-09-18T08:00:00.000Z",
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.pathname === "/api/auth/me") return jsonResponse(authResponse(requesterUser));
      if (url.pathname === "/api/tickets/88") return jsonResponse(detail);
      if (url.pathname === "/api/tickets/88/attachments") return jsonResponse({ items: [] });
      if (url.pathname === "/api/tickets/88/comments") return jsonResponse({ items: [], pagination: {
        page: 1, pageSize: 20, totalItems: 0, totalPages: 0,
        hasPreviousPage: false, hasNextPage: false,
      } });
      if (url.pathname === "/api/tickets/88/resolution-indication") {
        expect(init?.method).toBe("POST");
        return jsonResponse({
          ticketId: 88,
          currentStatus: "IN_PROGRESS",
          requesterResolutionIndicatedAt: "2026-09-18T10:00:00.000Z",
        });
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    }));
    renderAt("/tickets/88");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Problem Appears Resolved" }));
    expect(screen.getByRole("dialog", { name: "Does the problem appear resolved?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Yes, it appears resolved" }));
    expect(await screen.findByText("Waiting for the support team to formally resolve this Ticket.")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.queryByText("Resolved", { exact: true })).not.toBeInTheDocument();
  });

  it("reloads authoritative Ticket state and focuses it after RESOLUTION_INDICATION_NOT_ALLOWED", async () => {
    document.cookie = "toktickit_csrf=resolution-csrf; path=/";
    const detail = {
      id: 89,
      ticketNumber: "TKT-2026-00089",
      ticketDate: "2026-09-18T08:00:00.000Z",
      requester: { id: requesterUser.id, name: requesterUser.name },
      category: { id: 1, name: "Hardware" },
      relatedSystem: { id: 2, name: "Laptop" },
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: "WAITING_FOR_REQUESTER",
      owner: null,
      summary: "Concurrent update",
      description: "The support team changes this Ticket concurrently.",
      requesterResolutionIndicatedAt: null,
      createdAt: "2026-09-18T08:00:00.000Z",
      updatedAt: "2026-09-18T08:00:00.000Z",
    };
    let detailRequests = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.pathname === "/api/auth/me") return jsonResponse(authResponse(requesterUser));
      if (url.pathname === "/api/tickets/89") {
        detailRequests += 1;
        return jsonResponse(detailRequests === 1 ? detail : {
          ...detail,
          currentStatus: "RESOLVED",
          owner: { id: 301, name: "Authoritative Owner", role: "IT_STAFF" },
          updatedAt: "2026-09-18T11:00:00.000Z",
        });
      }
      if (url.pathname === "/api/tickets/89/attachments") return jsonResponse({ items: [] });
      if (url.pathname === "/api/tickets/89/comments") return jsonResponse({ items: [], pagination: {
        page: 1, pageSize: 20, totalItems: 0, totalPages: 0,
        hasPreviousPage: false, hasNextPage: false,
      } });
      if (url.pathname === "/api/tickets/89/resolution-indication") {
        return jsonResponse({ error: {
          code: "RESOLUTION_INDICATION_NOT_ALLOWED",
          message: "Sensitive state detail",
        } }, 409);
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    }));
    renderAt("/tickets/89");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Problem Appears Resolved" }));
    await user.click(screen.getByRole("button", { name: "Yes, it appears resolved" }));
    expect(await screen.findByText("The Ticket changed and this action is no longer available.")).toBeInTheDocument();
    expect(screen.queryByText("Sensitive state detail")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Resolved")).toBeInTheDocument();
    expect(screen.getByText("Authoritative Owner")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Problem Appears Resolved" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Waiting for the support team to formally resolve/u)).not.toBeInTheDocument();
    expect(detailRequests).toBe(2);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Ticket Detail" })).toHaveFocus());
    expect(document.activeElement?.closest('[role="dialog"]')).toBeNull();
  });

  it("reloads the complete authoritative Ticket and focuses it after CONCURRENT_UPDATE", async () => {
    document.cookie = "toktickit_csrf=resolution-csrf; path=/";
    const initial = {
      id: 95,
      ticketNumber: "TKT-2026-00095",
      ticketDate: "2026-09-18T08:00:00.000Z",
      requester: { id: requesterUser.id, name: requesterUser.name },
      category: { id: 1, name: "Hardware" },
      relatedSystem: { id: 2, name: "Laptop" },
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: "OPEN",
      owner: null,
      summary: "Pre-conflict summary",
      description: "Stale Ticket state.",
      requesterResolutionIndicatedAt: null,
      createdAt: "2026-09-18T08:00:00.000Z",
      updatedAt: "2026-09-18T08:00:00.000Z",
    };
    let detailRequests = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.pathname === "/api/auth/me") return jsonResponse(authResponse(requesterUser));
      if (url.pathname === "/api/tickets/95") {
        detailRequests += 1;
        return jsonResponse(detailRequests === 1 ? initial : {
          ...initial,
          currentStatus: "CLOSED",
          owner: { id: 302, name: "Reloaded Owner", role: "ADMINISTRATOR" },
          summary: "Authoritative summary",
          description: "Complete replacement from the server.",
          updatedAt: "2026-09-18T12:30:00.000Z",
        });
      }
      if (url.pathname === "/api/tickets/95/attachments") return jsonResponse({ items: [] });
      if (url.pathname === "/api/tickets/95/comments") return jsonResponse({ items: [], pagination: {
        page: 1, pageSize: 20, totalItems: 0, totalPages: 0,
        hasPreviousPage: false, hasNextPage: false,
      } });
      if (url.pathname === "/api/tickets/95/resolution-indication") return jsonResponse({
        error: { code: "CONCURRENT_UPDATE", message: "Sensitive database detail" },
      }, 409);
      throw new Error(`Unexpected request: ${url.pathname}`);
    }));

    renderAt("/tickets/95");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Problem Appears Resolved" }));
    await user.click(screen.getByRole("button", { name: "Yes, it appears resolved" }));

    expect(await screen.findByText("The Ticket changed and this action is no longer available.")).toBeInTheDocument();
    expect(screen.queryByText("Sensitive database detail")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Closed")).toBeInTheDocument();
    expect(screen.getByText("Reloaded Owner")).toBeInTheDocument();
    expect(screen.getByText("Authoritative summary")).toBeInTheDocument();
    expect(screen.getByText("Complete replacement from the server.")).toBeInTheDocument();
    expect(document.querySelector('time[datetime="2026-09-18T12:30:00.000Z"]')).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Problem Appears Resolved" })).not.toBeInTheDocument();
    expect(detailRequests).toBe(2);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Ticket Detail" })).toHaveFocus());
    expect(document.activeElement?.closest('[role="dialog"]')).toBeNull();
  });

  it("keeps the resolution action and gives retry guidance when CONCURRENT_UPDATE reload remains eligible", async () => {
    document.cookie = "toktickit_csrf=resolution-csrf; path=/";
    const initial = {
      id: 98,
      ticketNumber: "TKT-2026-00098",
      ticketDate: "2026-09-18T08:00:00.000Z",
      requester: { id: requesterUser.id, name: requesterUser.name },
      category: { id: 1, name: "Hardware" },
      relatedSystem: { id: 2, name: "Laptop" },
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: "OPEN",
      owner: null,
      summary: "Stale eligible detail",
      description: "A concurrent write changes non-eligibility fields.",
      requesterResolutionIndicatedAt: null,
      createdAt: "2026-09-18T08:00:00.000Z",
      updatedAt: "2026-09-18T08:00:00.000Z",
    };
    const authoritative = {
      ...initial,
      owner: { id: 303, name: "Current Owner", role: "IT_STAFF" },
      summary: "Authoritative eligible detail",
      description: "The refreshed Ticket remains eligible for another attempt.",
      updatedAt: "2026-09-18T13:00:00.000Z",
    };
    let detailRequests = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.pathname === "/api/auth/me") return jsonResponse(authResponse(requesterUser));
      if (url.pathname === "/api/tickets/98") {
        detailRequests += 1;
        return jsonResponse(detailRequests === 1 ? initial : authoritative);
      }
      if (url.pathname === "/api/tickets/98/attachments") return jsonResponse({ items: [] });
      if (url.pathname === "/api/tickets/98/comments") return jsonResponse({ items: [], pagination: {
        page: 1, pageSize: 20, totalItems: 0, totalPages: 0,
        hasPreviousPage: false, hasNextPage: false,
      } });
      if (url.pathname === "/api/tickets/98/resolution-indication") return jsonResponse({
        error: { code: "CONCURRENT_UPDATE", message: "Sensitive transaction detail" },
      }, 409);
      throw new Error(`Unexpected request: ${url.pathname}`);
    }));

    renderAt("/tickets/98");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Problem Appears Resolved" }));
    await user.click(screen.getByRole("button", { name: "Yes, it appears resolved" }));

    expect(await screen.findByText("The Ticket changed. Review the latest details and try again.")).toBeInTheDocument();
    expect(screen.queryByText("The Ticket changed and this action is no longer available.")).not.toBeInTheDocument();
    expect(screen.queryByText("Sensitive transaction detail")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Authoritative eligible detail")).toBeInTheDocument();
    expect(screen.getByText("The refreshed Ticket remains eligible for another attempt.")).toBeInTheDocument();
    expect(screen.getByText("Current Owner")).toBeInTheDocument();
    expect(document.querySelector('time[datetime="2026-09-18T13:00:00.000Z"]')).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Problem Appears Resolved" })).toBeEnabled();
    expect(detailRequests).toBe(2);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Ticket Detail" })).toHaveFocus());
    expect(document.activeElement?.closest('[role="dialog"]')).toBeNull();
  });

  it("shows the approved safe failure when conflict-state reload fails", async () => {
    document.cookie = "toktickit_csrf=resolution-csrf; path=/";
    let detailRequests = 0;
    const detail = {
      id: 93,
      ticketNumber: "TKT-2026-00093",
      ticketDate: "2026-09-18T08:00:00.000Z",
      requester: { id: requesterUser.id, name: requesterUser.name },
      category: { id: 1, name: "Hardware" },
      relatedSystem: { id: 2, name: "Laptop" },
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: "OPEN",
      owner: null,
      summary: "Reload failure",
      description: "Authoritative reload becomes unavailable.",
      requesterResolutionIndicatedAt: null,
      createdAt: "2026-09-18T08:00:00.000Z",
      updatedAt: "2026-09-18T08:00:00.000Z",
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.pathname === "/api/auth/me") return jsonResponse(authResponse(requesterUser));
      if (url.pathname === "/api/tickets/93") {
        detailRequests += 1;
        return detailRequests === 1
          ? jsonResponse(detail)
          : jsonResponse({ error: { code: "SERVICE_UNAVAILABLE", message: "Sensitive detail" } }, 503);
      }
      if (url.pathname === "/api/tickets/93/attachments") return jsonResponse({ items: [] });
      if (url.pathname === "/api/tickets/93/comments") return jsonResponse({ items: [], pagination: {
        page: 1, pageSize: 20, totalItems: 0, totalPages: 0,
        hasPreviousPage: false, hasNextPage: false,
      } });
      if (url.pathname === "/api/tickets/93/resolution-indication") return jsonResponse({
        error: { code: "RESOLUTION_INDICATION_NOT_ALLOWED", message: "Sensitive state detail" },
      }, 409);
      throw new Error(`Unexpected request: ${url.pathname}`);
    }));
    renderAt("/tickets/93");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Problem Appears Resolved" }));
    await user.click(screen.getByRole("button", { name: "Yes, it appears resolved" }));
    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText("Sensitive detail")).not.toBeInTheDocument();
    expect(screen.queryByText("Sensitive state detail")).not.toBeInTheDocument();
    expect(screen.queryByText("Problem appears resolved as of", { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const errorHeading = screen.getByRole("heading", { name: "Ticket Detail" });
    await waitFor(() => expect(errorHeading).toHaveFocus());
    expect(errorHeading).toHaveAttribute("tabindex", "-1");
    expect(document.activeElement?.closest('[role="dialog"]')).toBeNull();
  });

  it("traps focus, handles Escape safely, and restores focus to the trigger", async () => {
    document.cookie = "toktickit_csrf=resolution-csrf; path=/";
    let resolveIndication!: (response: Response) => void;
    const pendingIndication = new Promise<Response>((resolve) => { resolveIndication = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.pathname === "/api/auth/me") return jsonResponse(authResponse(requesterUser));
      if (url.pathname === "/api/tickets/94") return jsonResponse({
        id: 94,
        ticketNumber: "TKT-2026-00094",
        ticketDate: "2026-09-18T08:00:00.000Z",
        requester: { id: requesterUser.id, name: requesterUser.name },
        category: { id: 1, name: "Hardware" },
        relatedSystem: { id: 2, name: "Laptop" },
        requestedPriority: "MEDIUM",
        itPriority: "MEDIUM",
        currentStatus: "OPEN",
        owner: null,
        summary: "Accessible confirmation",
        description: "Keyboard focus remains inside the modal.",
        requesterResolutionIndicatedAt: null,
        createdAt: "2026-09-18T08:00:00.000Z",
        updatedAt: "2026-09-18T08:00:00.000Z",
      });
      if (url.pathname === "/api/tickets/94/attachments") return jsonResponse({ items: [] });
      if (url.pathname === "/api/tickets/94/comments") return jsonResponse({ items: [], pagination: {
        page: 1, pageSize: 20, totalItems: 0, totalPages: 0,
        hasPreviousPage: false, hasNextPage: false,
      } });
      if (url.pathname === "/api/tickets/94/resolution-indication") return pendingIndication;
      throw new Error(`Unexpected request: ${url.pathname}`);
    }));
    renderAt("/tickets/94");
    const user = userEvent.setup();
    const trigger = await screen.findByRole("button", { name: "Problem Appears Resolved" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Does the problem appear resolved?" });
    expect(dialog).toHaveAccessibleDescription(
      "This tells the support team the problem appears resolved. It does not formally resolve or close the Ticket.",
    );
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    const confirm = within(dialog).getByRole("button", { name: "Yes, it appears resolved" });
    await waitFor(() => expect(cancel).toHaveFocus());
    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    const reopened = screen.getByRole("dialog", { name: "Does the problem appear resolved?" });
    await user.click(within(reopened).getByRole("button", { name: "Yes, it appears resolved" }));
    expect(within(reopened).getByRole("button", { name: "Saving…" })).toBeDisabled();
    fireEvent.keyDown(reopened, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Does the problem appear resolved?" })).toBeInTheDocument();
    resolveIndication(jsonResponse({
      ticketId: 94,
      currentStatus: "OPEN",
      requesterResolutionIndicatedAt: "2026-09-18T11:00:00.000Z",
    }));
    expect(await screen.findByText(/Waiting for the support team to formally resolve/u)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ticket Detail" })).toHaveFocus();
  });

  it.each([
    ["NEW", null],
    ["RESOLVED", null],
    ["OPEN", "2026-09-18T10:00:00.000Z"],
  ] as const)("does not offer another indication for %s with cycle marker %s", async (currentStatus, indicatedAt) => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.pathname === "/api/auth/me") return jsonResponse(authResponse(requesterUser));
      if (url.pathname === "/api/tickets/91") return jsonResponse({
        id: 91,
        ticketNumber: "TKT-2026-00091",
        ticketDate: "2026-09-18T08:00:00.000Z",
        requester: { id: requesterUser.id, name: requesterUser.name },
        category: { id: 1, name: "Hardware" },
        relatedSystem: { id: 2, name: "Laptop" },
        requestedPriority: "MEDIUM",
        itPriority: "MEDIUM",
        currentStatus,
        owner: null,
        summary: "Eligibility state",
        description: "The action follows current-cycle eligibility.",
        requesterResolutionIndicatedAt: indicatedAt,
        createdAt: "2026-09-18T08:00:00.000Z",
        updatedAt: "2026-09-18T08:00:00.000Z",
      });
      if (url.pathname === "/api/tickets/91/attachments") return jsonResponse({ items: [] });
      if (url.pathname === "/api/tickets/91/comments") return jsonResponse({ items: [], pagination: {
        page: 1, pageSize: 20, totalItems: 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false,
      } });
      throw new Error(`Unexpected request: ${url.pathname}`);
    }));
    renderAt("/tickets/91");
    await screen.findByText("Eligibility state");
    expect(screen.queryByRole("button", { name: "Problem Appears Resolved" })).not.toBeInTheDocument();
    if (indicatedAt) {
      expect(screen.getByText(/Waiting for the support team to formally resolve/u)).toBeInTheDocument();
    }
  });

  it("keeps formal status and renders a safe dependency failure", async () => {
    document.cookie = "toktickit_csrf=resolution-csrf; path=/";
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.pathname === "/api/auth/me") return jsonResponse(authResponse(requesterUser));
      if (url.pathname === "/api/tickets/92") return jsonResponse({
        id: 92,
        ticketNumber: "TKT-2026-00092",
        ticketDate: "2026-09-18T08:00:00.000Z",
        requester: { id: requesterUser.id, name: requesterUser.name },
        category: { id: 1, name: "Hardware" },
        relatedSystem: { id: 2, name: "Laptop" },
        requestedPriority: "LOW",
        itPriority: "LOW",
        currentStatus: "OPEN",
        owner: null,
        summary: "Safe dependency failure",
        description: "The UI must not expose a dependency failure.",
        requesterResolutionIndicatedAt: null,
        createdAt: "2026-09-18T08:00:00.000Z",
        updatedAt: "2026-09-18T08:00:00.000Z",
      });
      if (url.pathname === "/api/tickets/92/attachments") return jsonResponse({ items: [] });
      if (url.pathname === "/api/tickets/92/comments") return jsonResponse({ items: [], pagination: {
        page: 1, pageSize: 20, totalItems: 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false,
      } });
      if (url.pathname === "/api/tickets/92/resolution-indication") return jsonResponse({
        error: { code: "DEPENDENCY_FAILURE", message: "Sensitive database detail" },
      }, 503);
      throw new Error(`Unexpected request: ${url.pathname}`);
    }));
    renderAt("/tickets/92");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Problem Appears Resolved" }));
    await user.click(screen.getByRole("button", { name: "Yes, it appears resolved" }));
    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText("Sensitive database detail")).not.toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
  });
});
