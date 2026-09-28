import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authResponse, jsonResponse, renderAt, requestUrl } from "./test-helpers.js";

const administrator = {
  id: 901,
  name: "Admin Avery",
  email: "admin.avery@example.test",
  role: "ADMINISTRATOR" as const,
  mustChangePassword: false,
};
const staff = {
  id: 902,
  name: "Staff Mina",
  email: "staff.mina@example.test",
  role: "IT_STAFF" as const,
  isActive: true,
  mustChangePassword: false,
  createdAt: "2026-09-28T08:00:00.000Z",
  updatedAt: "2026-09-28T08:00:00.000Z",
};
const self = {
  ...staff,
  id: administrator.id,
  name: administrator.name,
  email: administrator.email,
  role: "ADMINISTRATOR" as const,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function installFetch({
  auth = administrator,
  list = async () => jsonResponse({ items: [self, staff] }),
  mutate = async (_url: URL, _init?: RequestInit) => jsonResponse({ user: staff }),
}: {
  auth?: typeof administrator | typeof staff;
  list?: (url: URL) => Promise<Response>;
  mutate?: (url: URL, init?: RequestInit) => Promise<Response>;
} = {}) {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    calls.push({ url, init });
    if (url.pathname === "/api/auth/me") return jsonResponse(authResponse(auth));
    if (url.pathname === "/api/admin/users" && (!init?.method || init.method === "GET")) return list(url);
    if (url.pathname.startsWith("/api/admin/users")) return mutate(url, init);
    throw new Error(`Unexpected request: ${url.pathname}`);
  }));
  return calls;
}

describe("UI-10 and UI-11 Administrator User Management", () => {
  it("shows a safe role destination without requesting protected User data", async () => {
    const calls = installFetch({ auth: staff });
    renderAt("/admin/users");
    expect(await screen.findByRole("heading", { name: "Forbidden" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("This page is not available for your role.");
    expect(screen.getByRole("link", { name: "Go to role home" })).toHaveAttribute("href", "/staff/tickets");
    expect(calls.some(({ url }) => url.pathname === "/api/admin/users")).toBe(false);
  });

  it("keeps a named loading region, then renders safe table and mobile-card fields with navigation", async () => {
    let release: ((value: Response) => void) | undefined;
    const deferred = new Promise<Response>((resolve) => { release = resolve; });
    installFetch({ list: async () => deferred });
    const { container } = renderAt("/admin/users");
    expect(await screen.findByRole("heading", { name: "User Management" })).toBeInTheDocument();
    expect(screen.getByText("Loading users…")).toHaveAttribute("role", "status");
    expect(screen.getByRole("link", { name: "Ticket Queue" })).toHaveAttribute("href", "/staff/tickets");
    release!(jsonResponse({ items: [self, staff] }));
    const table = await screen.findByRole("table", { name: "Users" });
    for (const heading of ["Name", "Email", "Role", "Status", "Edit"]) expect(within(table).getByRole("columnheader", { name: heading })).toBeInTheDocument();
    expect(within(table).getByText("Staff Mina")).toBeInTheDocument();
    expect(within(table).getByText("IT Staff")).toBeInTheDocument();
    expect(within(table).getAllByText("Active").length).toBeGreaterThan(0);
    expect(container.querySelector(".admin-user-cards")).not.toBeNull();
  });

  it("applies trimmed search and one role filter and distinguishes empty from no-results", async () => {
    const calls = installFetch({ list: async (url) => jsonResponse({ items: url.search ? [] : [staff] }) });
    renderAt("/admin/users");
    await screen.findByText("Staff Mina");
    await userEvent.type(screen.getByLabelText("Search users"), "  mina  ");
    await userEvent.selectOptions(screen.getByLabelText("Role"), "IT_STAFF");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("No users match the current search.")).toBeInTheDocument();
    const request = calls.filter(({ url }) => url.pathname === "/api/admin/users").at(-1)!.url;
    expect(request.searchParams.get("search")).toBe("mina");
    expect(request.searchParams.get("role")).toBe("IT_STAFF");
    await userEvent.click(screen.getByRole("button", { name: "Clear Search" }));
    await screen.findByText("Staff Mina");
  });

  it("shows safe list failure without stale rows and retries", async () => {
    let attempt = 0;
    installFetch({ list: async () => {
      attempt += 1;
      return attempt === 1
        ? jsonResponse({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } }, 500)
        : jsonResponse({ items: [staff] });
    } });
    renderAt("/admin/users");
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    expect(screen.queryByText("Staff Mina")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try Again" }));
    expect(await screen.findByText("Staff Mina")).toBeInTheDocument();
  });

  it("creates a User with validation, busy protection, safe success, and focus on the new row", async () => {
    let release: ((value: Response) => void) | undefined;
    const deferred = new Promise<Response>((resolve) => { release = resolve; });
    const created = { ...staff, id: 903, name: "New User", email: "new.user@example.test", mustChangePassword: true };
    installFetch({ mutate: async () => deferred });
    renderAt("/admin/users");
    await screen.findByText("Staff Mina");
    await userEvent.click(screen.getByRole("button", { name: "Create User" }));
    const dialog = screen.getByRole("dialog", { name: "Create User" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Create User" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Please correct");
    await userEvent.type(within(dialog).getByLabelText("Name"), "New User");
    await userEvent.type(within(dialog).getByLabelText("Email"), "new.user@example.test");
    await userEvent.selectOptions(within(dialog).getByLabelText("Role"), "IT_STAFF");
    await userEvent.type(within(dialog).getByLabelText("Initial Password"), "Valid Issue35! 7");
    await userEvent.type(within(dialog).getByLabelText("Confirm Initial Password"), "Valid Issue35! 7");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create User" }));
    expect(within(dialog).getByRole("button", { name: "Creating user…" })).toBeDisabled();
    release!(jsonResponse({ user: created }, 201));
    expect(await screen.findByText("New User was created.")).toHaveAttribute("role", "status");
    expect(screen.queryByRole("dialog", { name: "Create User" })).not.toBeInTheDocument();
    expect(await screen.findByText("New User")).toHaveFocus();
    expect(document.body.textContent).not.toContain("Valid Issue35! 7");
  });

  it("traps focus, makes the background inert, restores focus, and blocks dismissal while saving", async () => {
    let release: ((value: Response) => void) | undefined;
    const deferred = new Promise<Response>((resolve) => { release = resolve; });
    installFetch({ mutate: async () => deferred });
    renderAt("/admin/users");
    await screen.findByText("Staff Mina");
    const trigger = screen.getByRole("button", { name: "Create User" });
    await userEvent.click(trigger);
    let dialog = screen.getByRole("dialog", { name: "Create User" });
    const name = within(dialog).getByLabelText("Name");
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), select:not(:disabled)",
    ));
    expect(focusable[0]).toBe(name);
    expect(focusable.at(-1)).toBe(cancel);
    expect(name).toHaveFocus();
    expect(screen.getByRole("banner", { hidden: true })).toHaveAttribute("inert");
    cancel.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(name).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(cancel).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Create User" })).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());

    await userEvent.click(trigger);
    dialog = screen.getByRole("dialog", { name: "Create User" });
    await userEvent.type(within(dialog).getByLabelText("Name"), "Busy User");
    await userEvent.type(within(dialog).getByLabelText("Email"), "busy.user@example.test");
    await userEvent.type(within(dialog).getByLabelText("Initial Password"), "Valid Issue35! 7");
    await userEvent.type(within(dialog).getByLabelText("Confirm Initial Password"), "Valid Issue35! 7");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create User" }));
    expect(within(dialog).getByRole("button", { name: "Creating user…" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Create User" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    release!(jsonResponse({ user: { ...staff, id: 904, name: "Busy User", email: "busy.user@example.test" } }, 201));
    expect(await screen.findByText("Busy User was created.")).toBeInTheDocument();
  });

  it("keeps duplicate-email errors and safe input inside the active dialog", async () => {
    installFetch({ mutate: async () => jsonResponse({ error: { code: "EMAIL_ALREADY_EXISTS", message: "A User with this email already exists." } }, 409) });
    renderAt("/admin/users");
    await screen.findByText("Staff Mina");
    await userEvent.click(screen.getByRole("button", { name: "Create User" }));
    const dialog = screen.getByRole("dialog", { name: "Create User" });
    await userEvent.type(within(dialog).getByLabelText("Name"), "Duplicate User");
    await userEvent.type(within(dialog).getByLabelText("Email"), "staff.mina@example.test");
    await userEvent.type(within(dialog).getByLabelText("Initial Password"), "Valid Issue35! 7");
    await userEvent.type(within(dialog).getByLabelText("Confirm Initial Password"), "Valid Issue35! 7");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create User" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("already exists");
    expect(within(dialog).getByLabelText("Email")).toHaveValue("staff.mina@example.test");
  });

  it("protects self role/status while allowing profile fields and omits self reset", async () => {
    installFetch();
    renderAt("/admin/users");
    await screen.findByText("Staff Mina");
    await userEvent.click(screen.getByRole("button", { name: `Edit ${self.name}` }));
    const dialog = screen.getByRole("dialog", { name: `Edit ${self.name}` });
    expect(within(dialog).getByLabelText("Role")).toBeDisabled();
    expect(within(dialog).getByLabelText("Status")).toBeDisabled();
    expect(within(dialog).getByText("You cannot change your own role or deactivate your own account here.")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Set New Initial Password" })).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Name")).toBeEnabled();
  });

  it("retains edits and focus after ordinary/conflict failures and can reload authoritative User state", async () => {
    let mutation = 0;
    installFetch({
      list: async () => jsonResponse({ items: mutation ? [{ ...staff, name: "Authoritative Staff", updatedAt: "2026-09-28T09:00:00.000Z" }] : [staff] }),
      mutate: async () => {
        mutation += 1;
        return jsonResponse({ error: { code: "STALE_WRITE", message: "This User changed. Reload and try again." } }, 409);
      },
    });
    renderAt("/admin/users");
    await screen.findByText("Staff Mina");
    await userEvent.click(screen.getByRole("button", { name: "Edit Staff Mina" }));
    const dialog = screen.getByRole("dialog", { name: "Edit Staff Mina" });
    const name = within(dialog).getByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "Entered Edit");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save User" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("changed since you opened");
    expect(name).toHaveValue("Entered Edit");
    expect(alert).toHaveFocus();
    await userEvent.click(within(dialog).getByRole("button", { name: "Reload User" }));
    expect(await within(dialog).findByDisplayValue("Authoritative Staff")).toBeInTheDocument();
  });

  it.each([
    ["USER_HAS_NON_TERMINAL_TICKETS", "Reassign or unassign this User's non-terminal Tickets first."],
    ["LAST_ACTIVE_ADMIN_REQUIRED", "At least one active Administrator is required."],
    ["CONCURRENT_UPDATE", "This user changed concurrently. Reload the latest details."],
  ])("keeps safe %s feedback and retained edits inside the active dialog", async (code, message) => {
    installFetch({
      mutate: async () => jsonResponse({ error: { code, message: "server-safe-message" } }, 409),
    });
    renderAt("/admin/users");
    await screen.findByText("Staff Mina");
    await userEvent.click(screen.getByRole("button", { name: "Edit Staff Mina" }));
    const dialog = screen.getByRole("dialog", { name: "Edit Staff Mina" });
    const name = within(dialog).getByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "Retained Edit");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save User" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(alert).toHaveFocus();
    expect(name).toHaveValue("Retained Edit");
    expect(screen.getByRole("banner", { hidden: true })).toHaveAttribute("inert");
    expect(screen.queryByText("server-safe-message")).not.toBeInTheDocument();
  });

  it("sets another User's initial password, clears password fields, and refreshes forced-change state", async () => {
    const updated = { ...staff, mustChangePassword: true, updatedAt: "2026-09-28T10:00:00.000Z" };
    installFetch({ mutate: async () => jsonResponse({ user: updated }) });
    renderAt("/admin/users");
    await screen.findByText("Staff Mina");
    await userEvent.click(screen.getByRole("button", { name: "Edit Staff Mina" }));
    await userEvent.click(screen.getByRole("button", { name: "Set New Initial Password" }));
    const dialog = screen.getByRole("dialog", { name: "Set New Initial Password" });
    await userEvent.type(within(dialog).getByLabelText("Initial Password"), "Another Issue35! 7");
    await userEvent.type(within(dialog).getByLabelText("Confirm Initial Password"), "Another Issue35! 7");
    await userEvent.click(within(dialog).getByRole("button", { name: "Set Initial Password" }));
    expect(await screen.findByText("A new initial password was set. The user must change it at next login.")).toHaveAttribute("role", "status");
    expect(document.body.textContent).not.toContain("Another Issue35! 7");
  });
});
