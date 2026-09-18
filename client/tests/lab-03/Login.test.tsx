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
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();

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
});
