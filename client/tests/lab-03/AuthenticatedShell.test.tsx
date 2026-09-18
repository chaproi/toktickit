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
});
