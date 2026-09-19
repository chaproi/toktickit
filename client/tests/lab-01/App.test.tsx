import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../src/App.js";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("App", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders the TokTickIT bootstrap heading", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    render(<App />);
    expect(screen.getByText("TokTickIT")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading your session");
  });

  it("shows the Login screen when no live session exists", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({
      error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication is required." },
    }, 401)));
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows a safe retry state when session bootstrap is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({}, 503)));
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong. Please try again.",
    );
    expect(screen.getByRole("button", { name: "Try Again" })).toBeInTheDocument();
  });

  it("retains the authenticated Check System Online and category workflow", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.pathname === "/api/auth/me") return response({
        user: { id: 1, name: "Requester", email: "requester@example.test", role: "REQUESTER", mustChangePassword: false },
        session: { expiresAt: "2099-01-01T00:00:00.000Z" },
      });
      if (url.pathname === "/api/tickets") return response({ items: [], pagination: {
        page: 1, pageSize: 10, totalItems: 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false,
      } });
      if (url.pathname === "/api/related-systems") return response([]);
      if (url.pathname === "/api/categories") return response([
        { id: 1, name: "Account and Access" },
        { id: 2, name: "Hardware" },
        { id: 3, name: "Software" },
        { id: 4, name: "Network" },
      ]);
      if (url.pathname === "/api/health") return response({ status: "ok" });
      throw new Error(`Unexpected request: ${url.pathname}`);
    }));
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Check System" }));
    expect(await screen.findByText("Online")).toBeInTheDocument();
    for (const name of ["Account and Access", "Hardware", "Software", "Network"]) {
      expect(screen.getAllByText(name).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("retains the authenticated Check System Offline failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.pathname === "/api/auth/me") return response({
        user: { id: 1, name: "Requester", email: "requester@example.test", role: "REQUESTER", mustChangePassword: false },
        session: { expiresAt: "2099-01-01T00:00:00.000Z" },
      });
      if (url.pathname === "/api/tickets") return response({ items: [], pagination: {
        page: 1, pageSize: 10, totalItems: 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false,
      } });
      if (url.pathname === "/api/categories" || url.pathname === "/api/related-systems") return response([]);
      if (url.pathname === "/api/health") return response({}, 503);
      throw new Error(`Unexpected request: ${url.pathname}`);
    }));
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Check System" }));
    expect(await screen.findByText("Offline")).toBeInTheDocument();
  });
});
