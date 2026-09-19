import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authResponse, jsonResponse, renderAt, requesterUser, requestUrl } from "./test-helpers.js";

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
    ["IT_STAFF", "/staff/tickets", "Ticket Queue"],
    ["ADMINISTRATOR", "/admin/users", "User Management"],
  ] as const)("routes %s to its role destination", async (role, destination, heading) => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(authResponse({
      ...requesterUser,
      role,
      name: `Issue 29 ${role}`,
    }))));
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
