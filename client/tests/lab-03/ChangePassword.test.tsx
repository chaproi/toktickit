import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authResponse, jsonResponse, renderAt, requesterUser, requestUrl } from "./test-helpers.js";

afterEach(() => vi.unstubAllGlobals());

describe("Issue 29 Change Password", () => {
  it("forces initial rotation, validates matching policy, and opens the role home", async () => {
    document.cookie = "toktickit_csrf=issue29-csrf; path=/";
    const forced = { ...requesterUser, mustChangePassword: true };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.pathname === "/api/auth/me") return jsonResponse(authResponse(forced));
      if (url.pathname === "/api/auth/change-password") {
        expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe("issue29-csrf");
        return jsonResponse(authResponse(requesterUser));
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
    renderAt("/tickets");

    expect(await screen.findByRole("heading", { name: "Create a new password" })).toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Current Password"), "Current1!Password");
    await user.type(screen.getByLabelText("New Password"), "NewSecure1!Password");
    await user.type(screen.getByLabelText("Confirm New Password"), "different");
    await user.click(screen.getByRole("button", { name: "Save Password" }));
    expect(await screen.findByText("New passwords must match.")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Confirm New Password"));
    await user.type(screen.getByLabelText("Confirm New Password"), "NewSecure1!Password");
    await user.click(screen.getByRole("button", { name: "Save Password" }));
    expect(await screen.findByText("Password changed successfully.")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "My Tickets" })).toBeInTheDocument();
  });
});
