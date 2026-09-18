import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
