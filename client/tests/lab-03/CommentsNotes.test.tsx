import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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

  it("enforces trimmed public and private boundaries and renders markup-like content inertly", async () => {
    installStaffDetailFetch({
      commentsResponse: async () => jsonResponse({
        items: [{ id: 71, ticketId: detail.id, author: detail.requester, content: "<img src=x onerror=alert(1)>", createdAt: "2026-09-21T10:00:00.000Z" }],
        pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, hasPreviousPage: false, hasNextPage: false },
      }),
    });
    renderAt(`/staff/tickets/${detail.id}`);
    const comment = await screen.findByLabelText("Add a public comment");
    fireEvent.change(comment, { target: { value: "   " } });
    await userEvent.click(screen.getByRole("button", { name: "Post comment" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Comment must contain between 1 and 2000 characters.");
    fireEvent.change(comment, { target: { value: "x".repeat(2001) } });
    await userEvent.click(screen.getByRole("button", { name: "Post comment" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Comment must contain between 1 and 2000 characters.");

    const note = screen.getByLabelText("Add an internal note");
    fireEvent.change(note, { target: { value: "y".repeat(5001) } });
    await userEvent.click(screen.getByRole("button", { name: "Post internal note" }));
    expect(screen.getAllByRole("alert").at(-1)).toHaveTextContent("Internal Note must contain between 1 and 5000 characters.");
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.querySelector("img[src='x']")).toBeNull();
  });

  it("clears an initial blocking list failure after a successful authoritative post refresh", async () => {
    let listCalls = 0;
    const created = { id: 72, ticketId: detail.id, author: detail.requester, content: "Recovered comment", createdAt: "2026-09-21T10:10:00.000Z" };
    installStaffDetailFetch({
      commentsResponse: async () => {
        listCalls += 1;
        return listCalls === 1
          ? jsonResponse({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } }, 500)
          : jsonResponse({ items: [created], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, hasPreviousPage: false, hasNextPage: false } });
      },
      mutation: async (url) => url.pathname.endsWith("/comments") ? jsonResponse(created, 201) : jsonResponse({ ticket: detail }),
    });
    renderAt(`/staff/tickets/${detail.id}`);
    const publicSection = await screen.findByRole("region", { name: "Public Comments" });
    expect(within(publicSection).getByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    await userEvent.type(within(publicSection).getByLabelText("Add a public comment"), created.content);
    await userEvent.click(within(publicSection).getByRole("button", { name: "Post comment" }));
    expect(await within(publicSection).findByText(created.content)).toBeInTheDocument();
    expect(within(publicSection).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(publicSection).getByLabelText("Add a public comment")).toHaveValue("");
  });

  it("finds a concurrently paginated created Comment and retains it across later page changes", async () => {
    const created = { id: 99, ticketId: detail.id, author: detail.requester, content: "Authoritative concurrent comment", createdAt: "2026-09-21T10:30:00.000Z" };
    const older = { id: 52, ticketId: detail.id, author: detail.requester, content: "Older page comment", createdAt: "2026-09-21T09:00:00.000Z" };
    let firstPageCalls = 0;
    installStaffDetailFetch({
      commentsResponse: async (page) => {
        if (page === 1) firstPageCalls += 1;
        const items = page === 3 ? [created] : page === 2 ? [older] : [{ id: 51, ticketId: detail.id, author: detail.requester, content: "Oldest comment", createdAt: "2026-09-21T08:00:00.000Z" }];
        return jsonResponse({ items, pagination: { page, pageSize: 1, totalItems: firstPageCalls > 1 ? 3 : 2, totalPages: 3, hasPreviousPage: page > 1, hasNextPage: page < 3 } });
      },
      mutation: async (url) => url.pathname.endsWith("/comments") ? jsonResponse(created, 201) : jsonResponse({ ticket: detail }),
    });
    renderAt(`/staff/tickets/${detail.id}`);
    const publicSection = await screen.findByRole("region", { name: "Public Comments" });
    await userEvent.type(within(publicSection).getByLabelText("Add a public comment"), created.content);
    await userEvent.click(within(publicSection).getByRole("button", { name: "Post comment" }));
    expect(await within(publicSection).findByText(created.content)).toBeInTheDocument();
    expect(within(publicSection).getByText("Page 3 of 3")).toBeInTheDocument();
    expect(within(publicSection).getAllByText(created.content)).toHaveLength(1);
    await userEvent.click(within(publicSection).getByRole("button", { name: "Previous" }));
    await waitFor(() => expect(within(publicSection).getByText("Page 2 of 3")).toBeInTheDocument());
    expect(within(publicSection).getByText(older.content)).toBeInTheDocument();
    expect(within(publicSection).getByText(created.content)).toBeInTheDocument();
    expect(within(publicSection).getAllByText(created.content)).toHaveLength(1);
  });

  it("retains the exact created entry and gives a non-blocking warning when refresh fails", async () => {
    const created = { id: 100, ticketId: detail.id, author: detail.requester, content: "Posted despite refresh failure", createdAt: "2026-09-21T10:45:00.000Z" };
    let calls = 0;
    installStaffDetailFetch({
      commentsResponse: async () => calls++ === 0
        ? jsonResponse({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 1, hasPreviousPage: false, hasNextPage: false } })
        : jsonResponse({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } }, 500),
      mutation: async (url) => url.pathname.endsWith("/comments") ? jsonResponse(created, 201) : jsonResponse({ ticket: detail }),
    });
    renderAt(`/staff/tickets/${detail.id}`);
    const publicSection = await screen.findByRole("region", { name: "Public Comments" });
    await userEvent.type(within(publicSection).getByLabelText("Add a public comment"), created.content);
    await userEvent.click(within(publicSection).getByRole("button", { name: "Post comment" }));
    expect(await within(publicSection).findByText(created.content)).toBeInTheDocument();
    expect(within(publicSection).getByRole("status")).toHaveTextContent("was posted, but the latest list could not be refreshed");
    expect(within(publicSection).queryByRole("alert")).not.toBeInTheDocument();
  });
});
