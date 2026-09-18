import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authResponse,
  jsonResponse,
  renderAt,
  requesterUser,
  requestUrl,
} from "./test-helpers.js";

afterEach(() => vi.unstubAllGlobals());

describe("Issue 29 Login", () => {
  it("shows accessible validation and authenticates without persisting a password", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.pathname === "/api/auth/me") {
        return jsonResponse({ error: { code: "AUTHENTICATION_REQUIRED" } }, 401);
      }
      if (url.pathname === "/api/auth/login") {
        expect(init?.credentials).toBe("include");
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
    renderAt("/login");

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Email is required.")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "requester@example.test");
    await user.type(screen.getByLabelText("Password"), "Synthetic1!Password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "My Tickets" })).toBeInTheDocument();
    expect(sessionStorage.getItem("developmentRequesterId")).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("uses approved safe messages and clears the password after failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.pathname === "/api/auth/me") {
        return jsonResponse({ error: { code: "AUTHENTICATION_REQUIRED" } }, 401);
      }
      return jsonResponse({
        error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." },
      }, 401);
    }));
    renderAt("/login");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Email"), "nobody@example.test");
    const password = screen.getByLabelText("Password") as HTMLInputElement;
    await user.type(password, "Wrong1!Password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Email or password is incorrect.")).toBeInTheDocument();
    await waitFor(() => expect(password.value).toBe(""));
  });

  it.each([
    ["ACCOUNT_INACTIVE", 403, undefined, "This account is inactive. Contact an Administrator."],
    ["LOGIN_THROTTLED", 429, 42, "Too many login attempts. Try again in 42 seconds."],
    ["ORIGIN_REQUIRED", 403, undefined, "The sign-in request could not be verified. Reload this page and try again."],
    ["ORIGIN_FORBIDDEN", 403, undefined, "The sign-in request could not be verified. Reload this page and try again."],
    ["SAFE_FAILURE", 500, undefined, "Something went wrong. Please try again."],
  ] as const)("renders the approved %s failure without exposing server detail", async (
    code,
    status,
    retryAfterSeconds,
    expected,
  ) => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (requestUrl(input).pathname === "/api/auth/me") {
        return jsonResponse({ error: { code: "AUTHENTICATION_REQUIRED" } }, 401);
      }
      return jsonResponse({
        error: { code, message: "Sensitive server detail", retryAfterSeconds },
      }, status);
    }));
    renderAt("/login");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Email"), "requester@example.test");
    await user.type(screen.getByLabelText("Password"), "Synthetic1!Password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText(expected)).toBeInTheDocument();
    expect(screen.queryByText("Sensitive server detail")).not.toBeInTheDocument();
  });

  it("disables the form while login is pending and prevents duplicate submission", async () => {
    let resolveLogin!: (response: Response) => void;
    const pendingLogin = new Promise<Response>((resolve) => { resolveLogin = resolve; });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (requestUrl(input).pathname === "/api/auth/me") {
        return jsonResponse({ error: { code: "AUTHENTICATION_REQUIRED" } }, 401);
      }
      return pendingLogin;
    });
    vi.stubGlobal("fetch", fetchMock);
    renderAt("/login");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Email"), "requester@example.test");
    await user.type(screen.getByLabelText("Password"), "Synthetic1!Password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    const busyButton = screen.getByRole("button", { name: "Signing in…" });
    expect(busyButton).toBeDisabled();
    fireEvent.click(busyButton);
    expect(fetchMock.mock.calls.filter(([input]) => requestUrl(input).pathname === "/api/auth/login")).toHaveLength(1);
    resolveLogin(jsonResponse({ error: { code: "INVALID_CREDENTIALS" } }, 401));
    expect(await screen.findByText("Email or password is incorrect.")).toBeInTheDocument();
  });
});
