import { screen } from "@testing-library/react";
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

  it("closes the dialog and explains a concurrent eligibility conflict safely", async () => {
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
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.pathname === "/api/auth/me") return jsonResponse(authResponse(requesterUser));
      if (url.pathname === "/api/tickets/89") return jsonResponse(detail);
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
    expect(await screen.findByText("The Ticket changed and this action is no longer available. Reload the latest detail.")).toBeInTheDocument();
    expect(screen.queryByText("Sensitive state detail")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Waiting For Requester")).toBeInTheDocument();
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
