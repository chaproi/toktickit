import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authResponse, jsonResponse, renderAt, requesterUser, requestUrl } from "./test-helpers.js";

afterEach(() => vi.unstubAllGlobals());

describe("Issue 29 Change Password", () => {
  it.each([
    { caseName: "the exact 12-character boundary", password: "Aa1!bcdefghi" },
    { caseName: "the exact 128-character boundary", password: `Aa1!${"x".repeat(124)}` },
    { caseName: "Unicode letter and number categories", password: "ÄÖÜäöü１２３!xyz" },
    { caseName: "internal whitespace", password: "Abcd 1234!xyz" },
  ])("accepts $caseName without exposing password values", async ({ password }) => {
    document.cookie = "toktickit_csrf=issue29-csrf; path=/";
    const forced = { ...requesterUser, mustChangePassword: true };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.pathname === "/api/auth/me") return jsonResponse(authResponse(forced));
      if (url.pathname === "/api/auth/change-password") {
        return new Promise<Response>(() => undefined);
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderAt("/change-password");
    const user = userEvent.setup();
    fireEvent.change(await screen.findByLabelText("Current Password"), {
      target: { value: "Current1!Password" },
    });
    fireEvent.change(screen.getByLabelText("New Password"), {
      target: { value: password },
    });
    fireEvent.change(screen.getByLabelText("Confirm New Password"), {
      target: { value: password },
    });
    await user.click(screen.getByRole("button", { name: "Save Password" }));

    await waitFor(() => expect(fetchMock.mock.calls.filter(
      ([input]) => requestUrl(input).pathname === "/api/auth/change-password",
    )).toHaveLength(1));
  });

  it.each([
    { caseName: "11 characters", password: "Aa1!bcdefgh" },
    { caseName: "129 characters", password: `Aa1!${"x".repeat(125)}` },
    { caseName: "fewer than three categories", password: "abcdefghijkl" },
    { caseName: "whitespace-only content", password: "            " },
  ])("rejects $caseName before sending a request", async ({ password }) => {
    const forced = { ...requesterUser, mustChangePassword: true };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => jsonResponse(authResponse(forced)));
    vi.stubGlobal("fetch", fetchMock);
    renderAt("/change-password");
    const user = userEvent.setup();
    fireEvent.change(await screen.findByLabelText("Current Password"), {
      target: { value: "Current1!Password" },
    });
    fireEvent.change(screen.getByLabelText("New Password"), {
      target: { value: password },
    });
    fireEvent.change(screen.getByLabelText("Confirm New Password"), {
      target: { value: password },
    });
    await user.click(screen.getByRole("button", { name: "Save Password" }));

    expect(fetchMock.mock.calls.filter(
      ([input]) => requestUrl(input).pathname === "/api/auth/change-password",
    )).toHaveLength(0);
    expect(screen.getByRole("alert")).toHaveTextContent("Please correct the highlighted fields.");
  });

  it("rejects a new password equal to the current password", async () => {
    const forced = { ...requesterUser, mustChangePassword: true };
    const fetchMock = vi.fn(async () => jsonResponse(authResponse(forced)));
    vi.stubGlobal("fetch", fetchMock);
    renderAt("/change-password");
    const user = userEvent.setup();
    for (const label of ["Current Password", "New Password", "Confirm New Password"]) {
      await user.type(await screen.findByLabelText(label), "SameSecure1!Password");
    }
    await user.click(screen.getByRole("button", { name: "Save Password" }));
    expect(await screen.findByText("New password must be different from the current password.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

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

  it("shows the safe wrong-current failure and clears every password field", async () => {
    document.cookie = "toktickit_csrf=issue29-csrf; path=/";
    const forced = { ...requesterUser, mustChangePassword: true };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.pathname === "/api/auth/me") return jsonResponse(authResponse(forced));
      return jsonResponse({
        error: { code: "INVALID_CURRENT_PASSWORD", message: "Sensitive detail" },
      }, 400);
    }));
    renderAt("/change-password");
    const user = userEvent.setup();
    const current = await screen.findByLabelText("Current Password") as HTMLInputElement;
    const next = screen.getByLabelText("New Password") as HTMLInputElement;
    const confirm = screen.getByLabelText("Confirm New Password") as HTMLInputElement;
    await user.type(current, "Current1!Password");
    await user.type(next, "NewSecure1!Password");
    await user.type(confirm, "NewSecure1!Password");
    await user.click(screen.getByRole("button", { name: "Save Password" }));
    expect(await screen.findByText("Current password is incorrect.")).toBeInTheDocument();
    expect(screen.queryByText("Sensitive detail")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(current.value).toBe("");
      expect(next.value).toBe("");
      expect(confirm.value).toBe("");
    });
  });

  it("locks controls while the password change is pending", async () => {
    document.cookie = "toktickit_csrf=issue29-csrf; path=/";
    const forced = { ...requesterUser, mustChangePassword: true };
    let resolveChange!: (response: Response) => void;
    const pendingChange = new Promise<Response>((resolve) => { resolveChange = resolve; });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (requestUrl(input).pathname === "/api/auth/me") return jsonResponse(authResponse(forced));
      return pendingChange;
    });
    vi.stubGlobal("fetch", fetchMock);
    renderAt("/change-password");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Current Password"), "Current1!Password");
    await user.type(screen.getByLabelText("New Password"), "NewSecure1!Password");
    await user.type(screen.getByLabelText("Confirm New Password"), "NewSecure1!Password");
    await user.click(screen.getByRole("button", { name: "Save Password" }));
    const busyButton = screen.getByRole("button", { name: "Saving password…" });
    expect(busyButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "Logout" })).toBeDisabled();
    fireEvent.click(busyButton);
    expect(fetchMock.mock.calls.filter(([input]) => requestUrl(input).pathname === "/api/auth/change-password")).toHaveLength(1);
    resolveChange(jsonResponse({ error: { code: "SAFE_FAILURE" } }, 500));
    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
  });
});
