import { act, screen, waitFor, within } from "@testing-library/react";
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
    expect(screen.queryByText("Assign an active Ticket Owner first.")).not.toBeInTheDocument();
  });

  it("derives owner requirements from only the authoritative selected target", async () => {
    const unassignedNew = { ...detail, currentStatus: "NEW" as const, allowedStatusTransitions: ["OPEN" as const] };
    installStaffDetailFetch({ ticket: unassignedNew });
    renderAt(`/staff/tickets/${unassignedNew.id}`);
    await screen.findByText(unassignedNew.summary);
    const status = screen.getByLabelText("Next status");
    expect(within(status).getAllByRole("option").map((option) => option.getAttribute("value")))
      .toEqual(["", "OPEN"]);
    await userEvent.selectOptions(status, "OPEN");
    expect(screen.getByText("Assign an active Ticket Owner first.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update Status" })).toBeDisabled();
  });

  it.each(["IN_PROGRESS", "REOPENED"] as const)(
    "keeps the owner-independent %s to CANCELLED transition available",
    async (currentStatus) => {
      const ownerless = { ...detail, currentStatus, allowedStatusTransitions: ["CANCELLED" as const] };
      installStaffDetailFetch({ ticket: ownerless });
      renderAt(`/staff/tickets/${ownerless.id}`);
      await screen.findByText(ownerless.summary);
      await userEvent.selectOptions(screen.getByLabelText("Next status"), "CANCELLED");
      expect(screen.queryByText("Assign an active Ticket Owner first.")).not.toBeInTheDocument();
      expect(screen.getByRole("dialog", { name: "Cancel Ticket" })).toBeInTheDocument();
    },
  );

  it("makes an owner-required target available after authoritative assignment", async () => {
    const unassignedNew = { ...detail, currentStatus: "NEW" as const, allowedStatusTransitions: ["OPEN" as const] };
    const assigned = { ...unassignedNew, owner: { id: 91, name: "Workflow Staff", role: "IT_STAFF" as const } };
    let detailLoads = 0;
    installStaffDetailFetch({
      ticket: unassignedNew,
      detailResponse: async () => jsonResponse(detailLoads++ === 0 ? unassignedNew : assigned),
      mutation: async () => jsonResponse({ ticket: assigned }),
    });
    renderAt(`/staff/tickets/${unassignedNew.id}`);
    await screen.findByText(unassignedNew.summary);
    await userEvent.selectOptions(screen.getByLabelText("Next status"), "OPEN");
    expect(screen.getByRole("button", { name: "Update Status" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Assign Ticket" }));
    await userEvent.selectOptions(screen.getByLabelText("Ticket Owner"), "91");
    await userEvent.click(screen.getByRole("button", { name: "Save Owner" }));
    await waitFor(() => expect(screen.getByText("Owner: Workflow Staff")).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText("Next status"), "OPEN");
    expect(screen.getByRole("button", { name: "Update Status" })).toBeEnabled();
  });

  it("opens a trapped described assignment dialog and restores focus on Cancel and Escape", async () => {
    installStaffDetailFetch();
    renderAt(`/staff/tickets/${detail.id}`);
    const trigger = await screen.findByRole("button", { name: "Assign Ticket" });
    await userEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Assign Ticket" });
    expect(dialog).toHaveAttribute("aria-describedby");
    expect(within(dialog).getByLabelText("Ticket Owner")).toHaveFocus();
    const save = within(dialog).getByRole("button", { name: "Save Owner" });
    save.focus();
    await userEvent.tab();
    expect(within(dialog).getByLabelText("Ticket Owner")).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(save).toHaveFocus();
    expect(screen.getByRole("button", { name: "Check System" }).closest("section")).toHaveAttribute("inert");
    within(dialog).getByRole("button", { name: "Cancel" }).focus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("prevents duplicate owner submission and retains the dialog and input after ordinary failure", async () => {
    let resolveMutation: ((response: Response) => void) | undefined;
    let calls = 0;
    installStaffDetailFetch({ mutation: async () => {
      calls += 1;
      return new Promise<Response>((resolve) => { resolveMutation = resolve; });
    } });
    renderAt(`/staff/tickets/${detail.id}`);
    await userEvent.click(await screen.findByRole("button", { name: "Assign Ticket" }));
    await userEvent.selectOptions(screen.getByLabelText("Ticket Owner"), "92");
    const save = screen.getByRole("button", { name: "Save Owner" });
    await userEvent.dblClick(save);
    expect(calls).toBe(1);
    expect(save).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Assign Ticket" })).toBeInTheDocument();
    await act(async () => {
      resolveMutation!(jsonResponse({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } }, 500));
    });
    expect(await screen.findByRole("dialog", { name: "Assign Ticket" })).toBeInTheDocument();
    expect(screen.getByLabelText("Ticket Owner")).toHaveValue("92");
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
  });

  it("closes successful owner submission through the focus-restoring path", async () => {
    const assigned = { ...detail, owner: { id: 91, name: "Workflow Staff", role: "IT_STAFF" as const } };
    let loads = 0;
    installStaffDetailFetch({
      detailResponse: async () => jsonResponse(loads++ === 0 ? detail : assigned),
      mutation: async () => jsonResponse({ ticket: assigned }),
    });
    renderAt(`/staff/tickets/${detail.id}`);
    const trigger = await screen.findByRole("button", { name: "Assign Ticket" });
    await userEvent.click(trigger);
    await userEvent.selectOptions(screen.getByLabelText("Ticket Owner"), "91");
    await userEvent.click(screen.getByRole("button", { name: "Save Owner" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Assign Ticket" })).toHaveFocus();
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

  it("closes a conflict dialog after authoritative reload and focuses the stable heading when its trigger disappears", async () => {
    const terminal = {
      ...detail,
      currentStatus: "CLOSED" as const,
      allowedStatusTransitions: [],
      owner: { id: 91, name: "Workflow Staff", role: "IT_STAFF" as const },
    };
    let loads = 0;
    installStaffDetailFetch({
      detailResponse: async () => jsonResponse(loads++ === 0 ? detail : terminal),
      mutation: async () => jsonResponse({ error: { code: "OWNER_CONFLICT", message: "Ticket changed." } }, 409),
    });
    renderAt(`/staff/tickets/${detail.id}`);
    await userEvent.click(await screen.findByRole("button", { name: "Assign Ticket" }));
    await userEvent.click(screen.getByRole("button", { name: "Save Owner" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: terminal.ticketNumber })).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent("The Ticket changed.");
  });

  it("moves focus to a stable safe-failure heading when conflict reload fails", async () => {
    let loads = 0;
    installStaffDetailFetch({
      detailResponse: async () => loads++ === 0
        ? jsonResponse(detail)
        : jsonResponse({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } }, 500),
      mutation: async () => jsonResponse({ error: { code: "CONCURRENT_UPDATE", message: "Ticket changed." } }, 409),
    });
    renderAt(`/staff/tickets/${detail.id}`);
    await userEvent.click(await screen.findByRole("button", { name: "Assign Ticket" }));
    await userEvent.click(screen.getByRole("button", { name: "Save Owner" }));
    expect(await screen.findByRole("heading", { name: "Operational Ticket Detail" })).toHaveFocus();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(detail.summary)).not.toBeInTheDocument();
  });

  it.each([
    ["RESOLVED", "Resolved Ticket", "Confirm resolved"],
    ["CLOSED", "Closed Ticket", "Confirm closed"],
  ] as const)("requires explicit confirmation for %s", async (nextStatus, dialogName, confirmName) => {
    const owned = {
      ...detail,
      owner: { id: 91, name: "Workflow Staff", role: "IT_STAFF" as const },
      allowedStatusTransitions: [nextStatus],
    };
    installStaffDetailFetch({ ticket: owned });
    renderAt(`/staff/tickets/${owned.id}`);
    await screen.findByText(owned.summary);
    await userEvent.selectOptions(screen.getByLabelText("Next status"), nextStatus);
    const dialog = screen.getByRole("dialog", { name: dialogName });
    expect(within(dialog).getByRole("button", { name: confirmName })).toBeEnabled();
  });
});
