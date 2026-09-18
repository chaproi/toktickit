import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authResponse, jsonResponse, renderAt, requesterUser, requestUrl } from "./test-helpers.js";

afterEach(() => vi.unstubAllGlobals());

describe("Issue 29 Requester UI regression", () => {
  it("lists authenticated Tickets with both priorities, owner, and no development identity", async () => {
    sessionStorage.setItem("developmentRequesterId", "999");
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
    await waitFor(() => expect(sessionStorage.getItem("developmentRequesterId")).toBeNull());
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).pathname === "/api/development-requesters")).toBe(false);
  });
});
