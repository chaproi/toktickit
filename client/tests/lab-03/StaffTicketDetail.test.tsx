import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderAt } from "./test-helpers.js";
import { detail, installStaffDetailFetch } from "./staff-detail-test-helpers.js";

afterEach(() => vi.unstubAllGlobals());

describe("UI-06 Staff operational Ticket Detail", () => {
  it("renders the six distinct groups, authoritative fields, indication, and read-only history", async () => {
    installStaffDetailFetch();
    renderAt(`/staff/tickets/${detail.id}`);
    expect(await screen.findByRole("heading", { name: detail.ticketNumber })).toBeInTheDocument();
    for (const heading of [
      "Requester-reported information", "Operations", "Attachments",
      "Public Comments", "Internal Notes", "Status History",
    ]) expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Queue" })).toHaveAttribute("href", "/staff/tickets");
    expect(screen.getByText(detail.summary)).toBeInTheDocument();
    expect(screen.getByText("Requested Medium")).toBeInTheDocument();
    expect(screen.getByText("Requester reports that the problem appears resolved")).toBeInTheDocument();
    expect(screen.getByText("Open to In Progress")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit history/i })).not.toBeInTheDocument();
  });

  it("keeps loading distinct and handles missing, forbidden, safe failure, and retry without stale data", async () => {
    let resolveDetail: ((value: Response) => void) | undefined;
    let attempt = 0;
    installStaffDetailFetch({ detailResponse: () => {
      attempt += 1;
      if (attempt === 1) return new Promise<Response>((resolve) => { resolveDetail = resolve; });
      return Promise.resolve(jsonResponse(detail));
    } });
    renderAt(`/staff/tickets/${detail.id}`);
    await screen.findByText("Workflow Staff");
    expect(screen.getByRole("status")).toHaveTextContent("Loading Ticket Detail");
    expect(screen.queryByText(detail.summary)).not.toBeInTheDocument();
    resolveDetail!(jsonResponse({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } }, 500));
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    expect(screen.queryByText(detail.summary)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try Again" }));
    await waitFor(() => expect(screen.getByText(detail.summary)).toBeInTheDocument());
  });

  it("offers Claim for an unassigned non-terminal Ticket and read-only Staff attachment actions", async () => {
    installStaffDetailFetch();
    renderAt(`/staff/tickets/${detail.id}`);
    expect(await screen.findByRole("button", { name: "Claim Ticket" })).toBeInTheDocument();
    const attachments = screen.getByRole("region", { name: "Attachments" });
    expect(within(attachments).getByRole("button", { name: "Preview evidence.pdf" })).toBeInTheDocument();
    expect(within(attachments).getByRole("button", { name: "Download evidence.pdf" })).toBeInTheDocument();
    expect(within(attachments).queryByText("Add Attachment")).not.toBeInTheDocument();
    expect(within(attachments).queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
  });
});
