import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authResponse, jsonResponse, renderAt, requesterUser, requestUrl } from "./test-helpers.js";

// D-19 landing fixture: a genuine empty API-08 response, not an auth payload.
const emptyRequesterDashboard = {
  asOf: "2026-10-23T18:30:00.000Z", timezone: "Asia/Bangkok",
  recentWindow: { from: "2026-10-17T17:00:00.000Z", before: "2026-10-24T17:00:00.000Z" },
  filters: { search: "", categoryId: null, relatedSystemId: null, requestedPriority: null, itPriority: null, currentStatus: null },
  metrics: { outstanding: 0, needsAttention: 0, recentUpdated: 0, recentResolved: 0 },
  lists: { recentUpdated: [], recentResolved: [] },
  drillDown: {
    outstanding: { path: "/api/tickets", query: { dashboardWidget: "outstanding", statusGroup: "outstanding" } },
    needsAttention: { path: "/api/tickets", query: { dashboardWidget: "attention" } },
    recentUpdated: { path: "/api/tickets", query: { dashboardWidget: "recentUpdated", updatedFrom: "2026-10-17T17:00:00.000Z", updatedBefore: "2026-10-24T17:00:00.000Z", sortBy: "updatedAt", sortOrder: "desc" } },
    recentResolved: { path: "/api/tickets", query: { dashboardWidget: "recentResolved", statusGroup: "resolved", resolvedFrom: "2026-10-17T17:00:00.000Z", resolvedBefore: "2026-10-24T17:00:00.000Z", sortBy: "resolvedAt", sortOrder: "desc" } },
  },
};

// D-19 Staff/Admin landing uses the same safe API-09 contract for both roles.
function emptyStaffDashboard() {
  const byStatus = { NEW: 0, OPEN: 0, IN_PROGRESS: 0, WAITING_FOR_REQUESTER: 0, REOPENED: 0, RESOLVED: 0, CLOSED: 0, CANCELLED: 0 };
  const byItPriority = { LOW: 0, MEDIUM: 0, HIGH: 0, URGENT: 0 };
  const myActionsByStatus = { PLANNED: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELLED: 0 };
  const ticket = (widget: string, query: Record<string, string> = {}) => ({ path: "/api/staff/tickets", query: { dashboardWidget: widget, ...query } });
  const actions = (query: Record<string, string>) => ({ path: "/api/staff/actions", query: { assignee: "me", ...query } });
  return {
    asOf: "2026-10-23T18:30:00.000Z", timezone: "Asia/Bangkok",
    recentWindow: { from: "2026-10-17T17:00:00.000Z", before: "2026-10-24T17:00:00.000Z" },
    filters: { search: "", categoryId: null, relatedSystemId: null, requestedPriority: null, itPriority: null, currentStatus: null, owner: null },
    metrics: { unassigned: 0, mine: 0, byStatus, byItPriority, recentUpdated: 0, recentResolved: 0, myActionsByStatus, myUnfinishedActions: 0 },
    lists: { recentUpdated: [], recentResolved: [], myUnfinishedActions: [] },
    drillDown: {
      unassigned: ticket("unassigned", { statusGroup: "active" }), mine: ticket("mine", { statusGroup: "active" }),
      byStatus: Object.fromEntries(Object.keys(byStatus).map((status) => [status, ticket("status", { widgetStatus: status })])),
      byItPriority: Object.fromEntries(Object.keys(byItPriority).map((priority) => [priority, ticket("itPriority", { widgetItPriority: priority, statusGroup: "active" })])),
      recentUpdated: ticket("recentUpdated", { updatedFrom: "2026-10-17T17:00:00.000Z", updatedBefore: "2026-10-24T17:00:00.000Z", sortBy: "updatedAt", sortOrder: "desc" }),
      recentResolved: ticket("recentResolved", { statusGroup: "resolved", resolvedFrom: "2026-10-17T17:00:00.000Z", resolvedBefore: "2026-10-24T17:00:00.000Z", sortBy: "resolvedAt", sortOrder: "desc" }),
      myActionsByStatus: Object.fromEntries(Object.keys(myActionsByStatus).map((status) => [status, actions({ status })])),
      myUnfinishedActions: actions({ actionStatusGroup: "unfinished" }),
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("Issue 29 authenticated shell", () => {
  it("bootstraps the session, shows role navigation, and logs out with cache clearing", async () => {
    document.cookie = "toktickit_csrf=shell-csrf; path=/";
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.pathname === "/api/auth/me") return jsonResponse(authResponse(requesterUser));
      if (url.pathname === "/api/auth/logout") {
        expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe("shell-csrf");
        return jsonResponse(null, 204);
      }
      if (url.pathname === "/api/dashboard/requester") return jsonResponse(emptyRequesterDashboard);
      if (url.pathname === "/api/categories" || url.pathname === "/api/related-systems") {
        return jsonResponse([]);
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderAt("/select-requester");
    expect(await screen.findByText("Authenticated Requester")).toBeInTheDocument();
    expect(screen.getByText("Requester", { selector: ".badge" })).toBeInTheDocument();
    expect(screen.queryByText("Change Requester")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My Tickets" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create Ticket" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Logout" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it.each([
    ["IT_STAFF", "/staff/dashboard", "Staff Dashboard"],
    ["ADMINISTRATOR", "/staff/dashboard", "Staff Dashboard"],
  ] as const)("routes %s to its role destination", async (role, destination, heading) => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.pathname === "/api/auth/me") return jsonResponse(authResponse({
        ...requesterUser, role, name: `Issue 29 ${role}`,
      }));
      if (url.pathname === "/api/dashboard/staff") return jsonResponse(emptyStaffDashboard());
      if (url.pathname === "/api/categories" || url.pathname === "/api/related-systems") return jsonResponse([]);
      if (url.pathname === "/api/staff/assignees") return jsonResponse({ items: [{ id: requesterUser.id, name: `Issue 29 ${role}`, role }] });
      throw new Error(`Unexpected request: ${url.pathname}`);
    }));
    renderAt("/");
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(window.location.pathname).toBe(destination);
  });

  it("clears protected UI and redirects after a protected request reports expiry", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.pathname === "/api/auth/me") return jsonResponse(authResponse(requesterUser));
      if (url.pathname === "/api/tickets") {
        return jsonResponse({ error: { code: "AUTHENTICATION_REQUIRED" } }, 401);
      }
      if (url.pathname === "/api/categories" || url.pathname === "/api/related-systems") {
        return jsonResponse([]);
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    }));
    renderAt("/tickets");
    expect(await screen.findByText("Your session has expired. Please sign in again.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByText("Authenticated Requester")).not.toBeInTheDocument();
    expect(window.location.pathname).toBe("/login");
  });

  it("clears local authenticated state even when logout returns a safe failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.pathname === "/api/auth/me") return jsonResponse(authResponse(requesterUser));
      if (url.pathname === "/api/auth/logout") {
        return jsonResponse({ error: { code: "SAFE_FAILURE" } }, 500);
      }
      if (url.pathname === "/api/tickets") {
        return jsonResponse({ items: [], pagination: {
          page: 1, pageSize: 10, totalItems: 0, totalPages: 0,
          hasPreviousPage: false, hasNextPage: false,
        } });
      }
      if (url.pathname === "/api/categories" || url.pathname === "/api/related-systems") {
        return jsonResponse([]);
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    }));
    renderAt("/tickets");
    await userEvent.click(await screen.findByRole("button", { name: "Logout" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/login");
  });

  it("blocks signed-out direct access before protected content renders", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
      error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication is required." },
    }, 401)));
    renderAt("/tickets/88");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByText("Ticket Detail")).not.toBeInTheDocument();
    expect(window.location.pathname).toBe("/login");
  });

  it.each([
    ["REQUESTER", "/staff/tickets"],
    ["REQUESTER", "/admin/users"],
    ["IT_STAFF", "/tickets"],
  ] as const)("blocks %s direct access to %s", async (role, path) => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(authResponse({
      ...requesterUser,
      role,
    }))));
    renderAt(path);
    expect(await screen.findByRole("heading", { name: "Forbidden" })).toBeInTheDocument();
    expect(screen.queryByText("This role destination is reserved for a later Sprint 3 increment.")).not.toBeInTheDocument();
  });
});
