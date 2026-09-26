import { act, screen, waitFor, within } from "@testing-library/react";
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

  it.each([
    [403, "Forbidden"],
    [404, "Ticket not found."],
  ])("renders the exact safe state for a %s Detail response", async (status, expected) => {
    installStaffDetailFetch({
      detailResponse: async () => jsonResponse({ error: { code: status === 403 ? "FORBIDDEN" : "NOT_FOUND", message: expected } }, status),
    });
    renderAt(`/staff/tickets/${detail.id}`);
    expect(await screen.findByText(expected)).toBeInTheDocument();
    expect(screen.queryByText(detail.summary)).not.toBeInTheDocument();
    expect(screen.queryByText(detail.requester.email)).not.toBeInTheDocument();
  });

  it("offers Claim for an unassigned non-terminal Ticket and read-only Staff attachment actions", async () => {
    installStaffDetailFetch({ attachments: [
      {
        id: 41, ticketId: detail.id, originalFilename: "evidence.pdf", mimeType: "application/pdf",
        sizeBytes: 1000, isRemoved: false, createdAt: "2026-09-21T08:30:00.000Z", removedAt: null, removalReason: null,
      },
      {
        id: 42, ticketId: detail.id, originalFilename: "removed.txt", mimeType: "text/plain",
        sizeBytes: 25, isRemoved: true, createdAt: "2026-09-21T08:31:00.000Z",
        removedAt: "2026-09-21T09:00:00.000Z", removalReason: "Obsolete evidence",
      },
    ] });
    renderAt(`/staff/tickets/${detail.id}`);
    expect(await screen.findByRole("button", { name: "Claim Ticket" })).toBeInTheDocument();
    const attachments = screen.getByRole("region", { name: "Attachments" });
    expect(within(attachments).getByRole("button", { name: "Preview evidence.pdf" })).toBeInTheDocument();
    expect(within(attachments).getByRole("button", { name: "Download evidence.pdf" })).toBeInTheDocument();
    expect(within(attachments).queryByText("Add Attachment")).not.toBeInTheDocument();
    expect(within(attachments).queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
    expect(within(attachments).getByText("removed.txt")).toBeInTheDocument();
    expect(within(attachments).getByText("Removed")).toBeInTheDocument();
    expect(within(attachments).queryByRole("button", { name: /removed\.txt/i })).not.toBeInTheDocument();
  });

  it("clears Ticket A state immediately on route reuse and ignores Ticket A's late response", async () => {
    const ticketB = {
      ...detail,
      id: 502,
      ticketNumber: "TKT-2026-00502",
      summary: "Authoritative Ticket B",
      description: "Only Ticket B data may remain.",
    };
    let resolveA: ((response: Response) => void) | undefined;
    let resolveB: ((response: Response) => void) | undefined;
    installStaffDetailFetch({
      detailResponse: (ticketId) => new Promise<Response>((resolve) => {
        if (ticketId === detail.id) resolveA = resolve;
        else resolveB = resolve;
      }),
    });
    renderAt(`/staff/tickets/${detail.id}`);
    await screen.findByRole("status");

    act(() => {
      window.history.pushState({}, "", `/staff/tickets/${ticketB.id}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Loading Ticket Detail");
    expect(screen.queryByText(detail.summary)).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await act(async () => { resolveB!(jsonResponse(ticketB)); });
    expect(await screen.findByRole("heading", { name: ticketB.ticketNumber })).toBeInTheDocument();
    expect(screen.getByText(ticketB.summary)).toBeInTheDocument();

    await act(async () => { resolveA!(jsonResponse(detail)); });
    await waitFor(() => expect(screen.getByText(ticketB.summary)).toBeInTheDocument());
    expect(screen.queryByText(detail.summary)).not.toBeInTheDocument();
    expect(screen.queryByText(detail.ticketNumber)).not.toBeInTheDocument();
    expect(screen.queryByText("Private diagnosis")).not.toBeInTheDocument();
  });
});
