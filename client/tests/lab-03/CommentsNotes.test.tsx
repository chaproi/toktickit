import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderAt } from "./test-helpers.js";
import { detail, installStaffDetailFetch } from "./staff-detail-test-helpers.js";

afterEach(() => vi.unstubAllGlobals());

describe("UI-08 Public Comments and Internal Notes", () => {
  it("keeps public and private communication visibly and semantically separate with inert text", async () => {
    installStaffDetailFetch();
    renderAt(`/staff/tickets/${detail.id}`);
    const publicSection = await screen.findByRole("region", { name: "Public Comments" });
    const privateSection = screen.getByRole("region", { name: "Internal Notes" });
    expect(within(publicSection).getByText("Visible to the Requester and support team.")).toBeInTheDocument();
    expect(within(privateSection).getByText("Internal — not visible to Requester")).toBeInTheDocument();
    expect(within(privateSection).getByText("This note is private to IT Staff and Administrators.")).toBeInTheDocument();
    expect(within(publicSection).getByText("Public update")).toBeInTheDocument();
    expect(within(privateSection).getByText("Private diagnosis")).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
    expect(within(publicSection).queryByRole("button", { name: /edit|delete/i })).not.toBeInTheDocument();
    expect(within(privateSection).queryByRole("button", { name: /edit|delete/i })).not.toBeInTheDocument();
  });

  it("retains a failed Note draft and uses authoritative created data after success", async () => {
    let notePosts = 0;
    installStaffDetailFetch({ mutation: async (url) => {
      if (url.pathname.endsWith("/notes")) {
        notePosts += 1;
        return notePosts === 1
          ? jsonResponse({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } }, 500)
          : jsonResponse({ id: 62, ticketId: detail.id, author: { id: 91, name: "Workflow Staff", role: "IT_STAFF" }, content: "Retained private draft", createdAt: "2026-09-21T10:10:00.000Z" }, 201);
      }
      return jsonResponse({ ticket: detail });
    } });
    renderAt(`/staff/tickets/${detail.id}`);
    const composer = await screen.findByLabelText("Add an internal note");
    await userEvent.type(composer, "Retained private draft");
    await userEvent.click(screen.getByRole("button", { name: "Post internal note" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    expect(composer).toHaveValue("Retained private draft");
    await userEvent.click(screen.getByRole("button", { name: "Post internal note" }));
    expect(await screen.findByText("Retained private draft")).toBeInTheDocument();
    expect(composer).toHaveValue("");
  });
});
