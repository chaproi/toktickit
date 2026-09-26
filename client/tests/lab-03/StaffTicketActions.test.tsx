import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderAt } from "./test-helpers.js";
import { detail, installStaffDetailFetch } from "./staff-detail-test-helpers.js";

afterEach(() => vi.unstubAllGlobals());

describe("UI-07 Staff Ticket actions", () => {
  it("uses accessible owner, priority, and status controls from the authoritative DTO", async () => {
    installStaffDetailFetch();
    renderAt(`/staff/tickets/${detail.id}`);
    expect(await screen.findByRole("button", { name: "Claim Ticket" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assign Ticket" })).toBeInTheDocument();
    expect(screen.getByLabelText("IT Priority")).toHaveValue("HIGH");
    expect(screen.getByText("Requested Medium")).toBeInTheDocument();
    const status = screen.getByLabelText("Next status");
    expect(within(status).getAllByRole("option").map((option) => option.getAttribute("value")))
      .toEqual(["", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"]);
    expect(screen.getByText("Assign an active Ticket Owner first.")).toBeInTheDocument();
  });

  it("opens a trapped described assignment dialog and restores focus on Cancel and Escape", async () => {
    installStaffDetailFetch();
    renderAt(`/staff/tickets/${detail.id}`);
    const trigger = await screen.findByRole("button", { name: "Assign Ticket" });
    await userEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Assign Ticket" });
    expect(dialog).toHaveAttribute("aria-describedby");
    expect(within(dialog).getByLabelText("Ticket Owner")).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("confirms RESOLVED/CANCELLED, requires a cancellation reason, and protects processing", async () => {
    const owned = { ...detail, owner: { id: 91, name: "Workflow Staff", role: "IT_STAFF" as const } };
    installStaffDetailFetch({ ticket: owned });
    renderAt(`/staff/tickets/${owned.id}`);
    await screen.findByText(owned.summary);
    await userEvent.selectOptions(screen.getByLabelText("Next status"), "CANCELLED");
    const dialog = screen.getByRole("dialog", { name: "Cancel Ticket" });
    expect(within(dialog).getByLabelText("Cancellation reason")).toBeRequired();
    expect(within(dialog).getByRole("button", { name: "Confirm cancellation" })).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText("Cancellation reason"), "Customer withdrew request");
    expect(within(dialog).getByRole("button", { name: "Confirm cancellation" })).toBeEnabled();
  });

  it("reloads authoritative state after a stale conflict without showing false success", async () => {
    const owned = { ...detail, owner: { id: 91, name: "Workflow Staff", role: "IT_STAFF" as const } };
    let detailLoads = 0;
    installStaffDetailFetch({
      ticket: owned,
      detailResponse: async () => {
        detailLoads += 1;
        return jsonResponse(detailLoads === 1 ? owned : { ...owned, itPriority: "LOW", updatedAt: "2026-09-21T11:00:00.000Z" });
      },
      mutation: async () => jsonResponse({ error: { code: "STALE_WRITE", message: "Ticket changed." } }, 409),
    });
    renderAt(`/staff/tickets/${owned.id}`);
    await screen.findByText(owned.summary);
    await userEvent.selectOptions(screen.getByLabelText("IT Priority"), "URGENT");
    await userEvent.click(screen.getByRole("button", { name: "Save IT Priority" }));
    await waitFor(() => expect(detailLoads).toBe(2));
    expect(screen.getByLabelText("IT Priority")).toHaveValue("LOW");
    expect(screen.queryByText(/updated successfully/i)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: owned.ticketNumber })).toHaveFocus();
  });
});
