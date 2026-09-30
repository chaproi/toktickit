import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import ChangePassword from "../../src/components/ChangePassword.js";
import CreateTicket from "../../src/components/CreateTicket.js";
import Login from "../../src/components/Login.js";
import { jsonResponse, renderAt } from "./test-helpers.js";
import { detail, installStaffDetailFetch } from "./staff-detail-test-helpers.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function expectDescribedInvalidField(field: HTMLElement, message: string) {
  expect(field).toHaveAttribute("aria-invalid", "true");
  const ids = field.getAttribute("aria-describedby")?.split(/\s+/u).filter(Boolean) ?? [];
  expect(ids.length).toBeGreaterThan(0);
  expect(ids.map((id) => document.getElementById(id)?.textContent).join(" ")).toContain(message);
}

describe("STYLE-01 shared Zen Green and accessibility contract", () => {
  it("defines the approved tokens, visible focus, and non-color visual distinctions", () => {
    const stylesheet = readFileSync(
      join(process.cwd(), "src", "lab2.css"),
      "utf8",
    );
    for (const token of [
      "--primary-green: #006b3c",
      "--secondary-green: #0b7a46",
      "--pale-green: #eaf6ef",
      "--page-background: #f5f7f6",
      "--surface: #ffffff",
      "--text-primary: #17352a",
      "--text-muted: #667085",
      "--border: #d0d5dd",
      "--read-only: #f0f4f1",
      "--danger: #b42318",
      "--warning: #b54708",
    ]) expect(stylesheet).toContain(token);
    expect(stylesheet).toMatch(/:focus-visible[\s\S]*box-shadow/iu);
    expect(stylesheet).toMatch(/\.read-only-field[\s\S]*border:/iu);
    expect(stylesheet).toMatch(/\.staff-public-comments[\s\S]*border-left:/iu);
    expect(stylesheet).toMatch(/\.staff-internal-notes[\s\S]*border-left:/iu);
  });

  it("programmatically associates Login required errors and announces safe feedback", async () => {
    render(<Login onAuthenticated={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveFocus();
    expectDescribedInvalidField(screen.getByLabelText("Email"), "Email is required.");
    expectDescribedInvalidField(screen.getByLabelText("Password", { exact: true }), "Password is required.");
  });

  it("associates mandatory password policy help and each validation error", async () => {
    render(<ChangePassword mandatory onChanged={vi.fn()} onLogout={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Save Password" }));
    expect(screen.getByRole("status")).toHaveTextContent("must replace the initial password");
    expectDescribedInvalidField(screen.getByLabelText("Current Password"), "Current Password is required.");
    expectDescribedInvalidField(screen.getByLabelText("New Password", { exact: true }), "between 12 and 128");
    expectDescribedInvalidField(screen.getByLabelText("Confirm New Password"), "must match");
    for (const field of ["New Password", "Confirm New Password"]) {
      const input = screen.getByLabelText(field, { exact: true });
      const descriptions = input.getAttribute("aria-describedby") ?? "";
      expect(descriptions).toMatch(/password-policy/iu);
    }
  });

  it("associates Create Ticket required errors, counts, and character limits", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path === "/api/categories") return jsonResponse([{ id: 1, name: "Hardware" }]);
      if (path === "/api/related-systems") return jsonResponse([{ id: 2, name: "Laptop" }]);
      throw new Error(`Unexpected request: ${path}`);
    }));
    render(
      <MemoryRouter>
        <CreateTicket requester={{
          id: 41,
          name: "Style Requester",
          email: "style@example.test",
          role: "REQUESTER",
          mustChangePassword: false,
        }} />
      </MemoryRouter>,
    );
    await screen.findByRole("option", { name: "Hardware" });
    await userEvent.click(screen.getByRole("button", { name: "Create Ticket" }));
    expectDescribedInvalidField(screen.getByLabelText(/Category/u), "Category is required.");
    expectDescribedInvalidField(screen.getByLabelText(/Related System/u), "Related System is required.");
    expectDescribedInvalidField(screen.getByLabelText(/Priority/u), "Priority is required.");
    expectDescribedInvalidField(screen.getByLabelText(/Summary/u), "Summary must contain");
    expectDescribedInvalidField(screen.getByLabelText(/Description/u), "Description must contain");
    expect(screen.getByLabelText(/Summary/u).getAttribute("aria-describedby")).toMatch(/summary-help/iu);
    expect(screen.getByLabelText(/Description/u).getAttribute("aria-describedby")).toMatch(/description-help/iu);
  });

  it("keeps badges, read-only content, editable controls, and Public/Internal regions distinguishable without color alone", async () => {
    installStaffDetailFetch();
    renderAt(`/staff/tickets/${detail.id}`);
    const publicSection = await screen.findByRole("region", { name: "Public Comments" });
    const internalSection = screen.getByRole("region", { name: "Internal Notes" });
    expect(publicSection).toHaveClass("staff-public-comments");
    expect(internalSection).toHaveClass("staff-internal-notes");
    expect(within(publicSection).getByText("Visible to the Requester and support team.")).toBeVisible();
    expect(within(internalSection).getByText("Internal — not visible to Requester")).toBeVisible();
    expect(screen.getByText("Requested Medium")).toBeVisible();
    expect(screen.getAllByText("In Progress", { selector: ".badge" }).length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".read-only-field").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("IT Priority")).toBeEnabled();
  });
});
