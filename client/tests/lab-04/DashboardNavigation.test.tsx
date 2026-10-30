import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ActionDTO, RequesterDashboardResponse, StaffDashboardResponse,
  StaffTicketDetail, TicketDetail, TicketListItem,
} from "../../src/api.js";
import { authResponse, jsonResponse, renderAt, requestUrl, type SafeUser } from "../lab-03/test-helpers.js";

// Issue #53: partial AC-35/T-35, AC-44/T-54 and AC-01/02 (T-01/02).
// Actual App/BrowserRouter; only HTTP is simulated. These cases do not prove
// PostgreSQL authorization, browser layout, real session expiry or full T-48.
// Dashboard screens already exist; RED must expose navigation, not absent screens.
const requester: SafeUser = { id: 41, name: "Navigation Requester A", email: "navigation.a@example.test", role: "REQUESTER", mustChangePassword: false };
const staff: SafeUser = { id: 71, name: "Navigation Staff A", email: "navigation.staff@example.test", role: "IT_STAFF", mustChangePassword: false };
const administrator: SafeUser = { id: 72, name: "Navigation Administrator", email: "navigation.admin@example.test", role: "ADMINISTRATOR", mustChangePassword: false };
const secondStaff: SafeUser = { ...staff, id: 74, name: "Navigation Staff B", email: "navigation.other@example.test" };
const roles = [requester, staff, administrator];
const category = { id: 11, name: "Navigation Network" }, relatedSystem = { id: 21, name: "Navigation VPN" };
const owner = { id: 93, name: "Distinct Ticket Owner", role: "IT_STAFF" as const };
const creator = { id: 94, name: "Distinct Action Creator" };
const asOf = "2026-10-23T18:30:00.000Z", from = "2026-10-17T17:00:00.000Z", before = "2026-10-24T17:00:00.000Z";
const base = { search: "VPN%_", categoryId: "11", relatedSystemId: "21", requestedPriority: "HIGH", itPriority: "MEDIUM", currentStatus: "OPEN", owner: "93" };
const destinations = [
  { actor: requester, path: "/dashboard", heading: "Requester Dashboard", forbidden: "/staff/dashboard" },
  { actor: staff, path: "/staff/dashboard", heading: "Staff Dashboard", forbidden: "/admin/users" },
  { actor: administrator, path: "/staff/dashboard", heading: "Staff Dashboard", forbidden: "/dashboard" },
];
const ticket = (actor: SafeUser): StaffTicketDetail => ({
  id: 505, ticketNumber: "TKT-2026-00505", summary: `VPN%_ ${actor.name} owned navigation record`,
  ticketDate: "2026-10-18T02:00:00.000Z", createdAt: "2026-10-18T02:00:00.000Z", updatedAt: "2026-10-23T18:29:00.000Z",
  requester: { id: requester.id, name: requester.name, email: requester.email }, category, relatedSystem,
  requestedPriority: "HIGH", itPriority: "MEDIUM", currentStatus: "OPEN", owner,
  requesterResolutionIndicatedAt: null, description: "Authorized navigation destination detail",
  allowedStatusTransitions: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"], statusHistory: [],
});
function ownedTicket(): TicketDetail {
  const source = ticket(requester);
  return { id: source.id, ticketNumber: source.ticketNumber, summary: source.summary, ticketDate: source.ticketDate,
    createdAt: source.createdAt, updatedAt: source.updatedAt, requester: { id: requester.id, name: requester.name },
    category, relatedSystem, requestedPriority: "HIGH", itPriority: "MEDIUM", currentStatus: "OPEN", owner,
    description: source.description, requesterResolutionIndicatedAt: null };
}
function action(actor: SafeUser, index = 0): ActionDTO {
  const createdAt = new Date(Date.parse("2026-10-20T08:00:00.000Z") + index * 60_000).toISOString();
  return { id: 700 + index, ticketId: 505, actionAt: createdAt, createdAt,
    updatedAt: new Date(Date.parse(createdAt) + 30_000).toISOString(), version: 2,
    description: `${actor.name} assigned navigation Action ${index + 1}`, result: null, createdBy: creator,
    assignee: { id: actor.id, name: actor.name }, performedBy: null, status: "IN_PROGRESS",
    followUpRequired: false, followUpNote: null, attachmentNotes: "<script>literal navigation note</script>",
    cancellationReason: null, completedAt: null, cancelledAt: null };
}
function page<T>(items: T[], totalItems = items.length, currentPage = 1, pageSize = 10) {
  const totalPages = Math.ceil(totalItems / pageSize);
  return { items, pagination: { page: currentPage, pageSize, totalItems, totalPages,
    hasPreviousPage: totalItems > 0 && currentPage > 1, hasNextPage: currentPage < totalPages } };
}
function preview(actor: SafeUser) {
  const row = ticket(actor);
  return { id: row.id, ticketNumber: row.ticketNumber, summary: row.summary, currentStatus: row.currentStatus,
    requestedPriority: row.requestedPriority, itPriority: row.itPriority, owner, updatedAt: row.updatedAt };
}
function assigned(actor: SafeUser, index: number) {
  return { ticket: { id: 505, ticketNumber: "TKT-2026-00505", summary: ticket(actor).summary, currentStatus: "OPEN" as const }, action: action(actor, index) };
}
function staffDashboard(actor: SafeUser, query = new URLSearchParams()): StaffDashboardResponse {
  const filters = Object.fromEntries(query), ticketDescriptor = (widget: string, extra: Record<string, string> = {}) =>
    ({ path: "/api/staff/tickets", query: { ...filters, dashboardWidget: widget, ...extra } });
  const actionDescriptor = (extra: Record<string, string>) => ({ path: "/api/staff/actions", query: { ...filters, assignee: "me", ...extra } });
  return { asOf, timezone: "Asia/Bangkok", recentWindow: { from, before }, filters: {
    search: filters.search ?? "", categoryId: filters.categoryId ? Number(filters.categoryId) : null,
    relatedSystemId: filters.relatedSystemId ? Number(filters.relatedSystemId) : null,
    requestedPriority: filters.requestedPriority ?? null, itPriority: filters.itPriority ?? null,
    currentStatus: filters.currentStatus ?? null, owner: filters.owner ? Number(filters.owner) : null },
    metrics: { unassigned: 0, mine: 0, byStatus: { NEW: 0, OPEN: 1, IN_PROGRESS: 0, WAITING_FOR_REQUESTER: 0, REOPENED: 0, RESOLVED: 0, CLOSED: 0, CANCELLED: 0 },
      byItPriority: { LOW: 0, MEDIUM: 1, HIGH: 0, URGENT: 0 }, recentUpdated: 1, recentResolved: 0,
      myActionsByStatus: { PLANNED: 0, IN_PROGRESS: 26, COMPLETED: 0, CANCELLED: 0 }, myUnfinishedActions: 26 },
    lists: { recentUpdated: [preview(actor)], recentResolved: [], myUnfinishedActions: Array.from({ length: 5 }, (_, index) => assigned(actor, index)) },
    drillDown: { unassigned: ticketDescriptor("unassigned", { statusGroup: "active" }), mine: ticketDescriptor("mine", { statusGroup: "active" }),
      byStatus: { NEW: ticketDescriptor("status", { widgetStatus: "NEW" }), OPEN: ticketDescriptor("status", { widgetStatus: "OPEN" }),
        IN_PROGRESS: ticketDescriptor("status", { widgetStatus: "IN_PROGRESS" }), WAITING_FOR_REQUESTER: ticketDescriptor("status", { widgetStatus: "WAITING_FOR_REQUESTER" }),
        REOPENED: ticketDescriptor("status", { widgetStatus: "REOPENED" }), RESOLVED: ticketDescriptor("status", { widgetStatus: "RESOLVED" }),
        CLOSED: ticketDescriptor("status", { widgetStatus: "CLOSED" }), CANCELLED: ticketDescriptor("status", { widgetStatus: "CANCELLED" }) },
      byItPriority: { LOW: ticketDescriptor("itPriority", { widgetItPriority: "LOW", statusGroup: "active" }), MEDIUM: ticketDescriptor("itPriority", { widgetItPriority: "MEDIUM", statusGroup: "active" }),
        HIGH: ticketDescriptor("itPriority", { widgetItPriority: "HIGH", statusGroup: "active" }), URGENT: ticketDescriptor("itPriority", { widgetItPriority: "URGENT", statusGroup: "active" }) },
      recentUpdated: ticketDescriptor("recentUpdated", { updatedFrom: from, updatedBefore: before, sortBy: "updatedAt", sortOrder: "desc" }),
      recentResolved: ticketDescriptor("recentResolved", { statusGroup: "resolved", resolvedFrom: from, resolvedBefore: before, sortBy: "resolvedAt", sortOrder: "desc" }),
      myActionsByStatus: { PLANNED: actionDescriptor({ status: "PLANNED" }), IN_PROGRESS: actionDescriptor({ status: "IN_PROGRESS" }),
        COMPLETED: actionDescriptor({ status: "COMPLETED" }), CANCELLED: actionDescriptor({ status: "CANCELLED" }) },
      myUnfinishedActions: actionDescriptor({ actionStatusGroup: "unfinished" }) } };
}
function requesterDashboard(): RequesterDashboardResponse {
  return { asOf, timezone: "Asia/Bangkok", recentWindow: { from, before }, filters: {
    search: "", categoryId: null, relatedSystemId: null, requestedPriority: null, itPriority: null, currentStatus: null },
    metrics: { outstanding: 1, needsAttention: 0, recentUpdated: 1, recentResolved: 0 }, lists: { recentUpdated: [preview(requester)], recentResolved: [] },
    drillDown: { outstanding: { path: "/api/tickets", query: { dashboardWidget: "outstanding", statusGroup: "outstanding" } },
      needsAttention: { path: "/api/tickets", query: { dashboardWidget: "attention" } },
      recentUpdated: { path: "/api/tickets", query: { dashboardWidget: "recentUpdated", updatedFrom: from, updatedBefore: before, sortBy: "updatedAt", sortOrder: "desc" } },
      recentResolved: { path: "/api/tickets", query: { dashboardWidget: "recentResolved", statusGroup: "resolved", resolvedFrom: from, resolvedBefore: before, sortBy: "resolvedAt", sortOrder: "desc" } } } };
}

const unexpected: string[] = [];
const pending: Array<{ finish: (response: Response) => void; promise: Promise<Response> }> = [];
function controlled() {
  let finish!: (response: Response) => void;
  const promise = new Promise<Response>((resolve) => { finish = resolve; });
  const result = { finish, promise }; pending.push(result); return result;
}
type Call = { url: URL; method: string; actorId: number | null; signal?: AbortSignal | null };
function install(initial: SafeUser | null, options: {
  loginAs?: SafeUser;
  read?: (url: URL, actor: SafeUser) => Response | Promise<Response> | undefined;
} = {}) {
  let session = initial;
  const calls: Call[] = [];
  document.cookie = "toktickit_csrf=navigation-test-csrf; path=/";
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input), method = init?.method ?? "GET";
    calls.push({ url, method, actorId: session?.id ?? null, signal: init?.signal });
    expect(init?.credentials).toBe("include");
    if (url.pathname === "/api/auth/me") return session ? jsonResponse(authResponse(session)) : jsonResponse({ error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication is required." } }, 401);
    if (url.pathname === "/api/auth/login" && method === "POST") { session = options.loginAs ?? requester; return jsonResponse(authResponse(session)); }
    if (url.pathname === "/api/auth/logout" && method === "POST") {
      expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe("navigation-test-csrf"); session = null; return jsonResponse(null, 204);
    }
    if (url.pathname === "/api/auth/change-password" && method === "POST" && session) {
      expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe("navigation-test-csrf");
      session = { ...session, mustChangePassword: false }; return jsonResponse(authResponse(session));
    }
    if (method !== "GET" || !session) { unexpected.push(`${method} ${url.pathname}`); return jsonResponse({ error: { code: "AUTHENTICATION_REQUIRED" } }, 401); }
    const actor = session;
    if (actor.role === "REQUESTER" && (/^\/api\/(staff|admin)\//.test(url.pathname) || url.pathname === "/api/dashboard/staff")) {
      return jsonResponse({ error: { code: "ROLE_FORBIDDEN", message: "This operation is not permitted." } }, 403);
    }
    const injected = options.read?.(url, actor); if (injected) return injected;
    if (url.pathname === "/api/categories") return jsonResponse([category]);
    if (url.pathname === "/api/related-systems") return jsonResponse([relatedSystem]);
    if (url.pathname === "/api/staff/assignees") return jsonResponse({ items: [staff, administrator, owner].map(({ id, name, role }) => ({ id, name, role })) });
    if (url.pathname === "/api/dashboard/requester") return jsonResponse(requesterDashboard());
    if (url.pathname === "/api/dashboard/staff") return jsonResponse(staffDashboard(actor, url.searchParams));
    if (url.pathname === "/api/tickets") {
      const { description: _description, requesterResolutionIndicatedAt: _indication, ...row } = ownedTicket();
      return jsonResponse(page<TicketListItem>([row]));
    }
    if (url.pathname === "/api/tickets/505") return jsonResponse(ownedTicket());
    if (url.pathname === "/api/staff/tickets") {
      const { description: _description, createdAt: _createdAt, allowedStatusTransitions: _transitions, statusHistory: _history, ...row } = ticket(actor);
      return jsonResponse({ ...page([row]), counts: { matching: 1, mine: 0, unassigned: 0 } });
    }
    if (url.pathname === "/api/staff/tickets/505") return jsonResponse(ticket(actor));
    if (url.pathname === "/api/admin/users") return jsonResponse({ items: [] });
    if (url.pathname === "/api/staff/actions") {
      const currentPage = Number(url.searchParams.get("page") ?? 1), size = Number(url.searchParams.get("pageSize") ?? 10);
      const rows = Array.from({ length: 26 }, (_, index) => assigned(actor, index));
      return jsonResponse(page(rows.slice((currentPage - 1) * size, currentPage * size), 26, currentPage, size));
    }
    if (url.pathname === "/api/tickets/505/actions") {
      // An owned Requester reads Staff-assigned work, never an unfinished
      // assignment to that Requester. This is a read fixture, not a write API.
      const assignee = actor.role === "REQUESTER" ? staff : actor;
      return jsonResponse(page(Array.from({ length: 20 }, (_, index) => action(assignee, index)), 26, 1, 20));
    }
    if (url.pathname === "/api/tickets/505/actions/725") return jsonResponse({ action: action(actor, 25), ticketUpdatedAt: ticket(actor).updatedAt });
    if (url.pathname === "/api/tickets/505/attachments") return jsonResponse({ items: [] });
    if (["/api/tickets/505/comments", "/api/staff/tickets/505/notes"].includes(url.pathname)) return jsonResponse(page([], 0, 1, 20));
    unexpected.push(`${method} ${url.pathname}`); return jsonResponse({ error: { code: "INTERNAL_ERROR", message: "Unable to load this resource." } }, 500);
  }));
  return { calls, setSession: (value: SafeUser | null) => { session = value; } };
}
const primary = () => screen.getByRole("navigation", { name: "Primary navigation" });
const params = () => Object.fromEntries(new URLSearchParams(window.location.search));
const businessCalls = (h: ReturnType<typeof install>) => h.calls.filter(({ url }) => !url.pathname.startsWith("/api/auth/"));
async function signIn() {
  await screen.findByRole("heading", { name: "Sign in" });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "navigation@example.test" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "SyntheticNavigation1!" } });
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByRole("button", { name: "Logout" });
}
async function expectDashboard(path: string, heading: string) {
  // Location is an observable router outcome; do not wait for a missing screen.
  await waitFor(() => expect(window.location.pathname).toBe(path));
  expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  await screen.findAllByText(path === "/dashboard" ? ticket(requester).summary : /VPN%_ Navigation .* owned navigation record/);
}
function expectActive(name: string) {
  const navigation = primary(), target = within(navigation).getByRole("link", { name });
  expect(target).toHaveAttribute("aria-current", "page");
  expect(navigation.querySelectorAll('a[aria-current="page"]')).toHaveLength(1);
  expect(target).toHaveClass("active", "fw-semibold");
  expect(navigation.querySelectorAll("a.active")).toHaveLength(1);
}
afterEach(async () => {
  cleanup();
  try {
    await act(async () => { for (const item of pending) item.finish(jsonResponse({ error: { code: "INTERNAL_ERROR", message: "Read cancelled." } }, 500)); await Promise.all(pending.map(({ promise }) => promise)); });
    expect(unexpected).toEqual([]);
  } finally {
    pending.length = 0; unexpected.length = 0; vi.unstubAllGlobals(); vi.restoreAllMocks();
    document.cookie = "toktickit_csrf=; max-age=0; path=/"; window.history.replaceState({}, "", "/");
  }
});

describe("Issue 53 approved role landing - AC-35/T-35", () => {
  it.each(destinations)("$actor.role login opens $path", async ({ actor, path, heading }) => {
    const harness = install(null, { loginAs: actor }); renderAt("/login"); await signIn();
    await expectDashboard(path, heading);
    expect(harness.calls.filter(({ url, method }) => url.pathname === "/api/auth/login" && method === "POST")).toHaveLength(1);
  });
  for (const entry of ["/", "/login"]) {
    it.each(destinations)(`$actor.role authenticated ${entry} opens its Dashboard`, async ({ actor, path, heading }) => {
      install(actor); renderAt(entry); await screen.findByRole("button", { name: "Logout" }); await expectDashboard(path, heading);
    });
  }
  it.each(destinations)("$actor.role brand-home interaction returns to $path", async ({ actor, path, heading }) => {
    install(actor); renderAt(actor.role === "REQUESTER" ? "/tickets" : "/staff/tickets");
    await screen.findByRole("heading", { name: actor.role === "REQUESTER" ? "My Tickets" : "Ticket Queue" });
    await userEvent.click(screen.getByRole("link", { name: "TokTickIT" })); await expectDashboard(path, heading);
  });
  it.each(destinations)("$actor.role forbidden-page role home uses $path without protected reads", async ({ actor, path, heading, forbidden }) => {
    const h = install(actor); renderAt(forbidden); await screen.findByRole("heading", { name: "Forbidden" });
    expect(businessCalls(h)).toEqual([]);
    await userEvent.click(screen.getByRole("link", { name: "Go to role home" })); await expectDashboard(path, heading);
  });
  it.each(destinations)("$actor.role must change password before any Dashboard landing", async ({ actor, path, heading }) => {
    const h = install({ ...actor, mustChangePassword: true }); renderAt(path);
    await screen.findByRole("heading", { name: "Create a new password" });
    expect(businessCalls(h)).toEqual([]); expect(screen.queryByRole("navigation", { name: "Primary navigation" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Current Password"), { target: { value: "CurrentNavigation1!" } });
    fireEvent.change(screen.getByLabelText("New Password"), { target: { value: "ChangedNavigation2!" } });
    fireEvent.change(screen.getByLabelText("Confirm New Password"), { target: { value: "ChangedNavigation2!" } });
    await userEvent.click(screen.getByRole("button", { name: "Save Password" }));
    await screen.findByText("Password changed successfully."); await expectDashboard(path, heading);
  });
});

describe("Dashboard navigation and preserved earlier routes - AC-35/T-35", () => {
  it.each(destinations)("$actor.role has accessible Dashboard navigation with distinct active states", async ({ actor, path, heading }) => {
    install(actor); renderAt(path); await expectDashboard(path, heading);
    const dashboardLink = within(primary()).getByRole("link", { name: "Dashboard" });
    expect(dashboardLink).toHaveAttribute("href", path); expectActive("Dashboard");
    const listName = actor.role === "REQUESTER" ? "My Tickets" : "Ticket Queue";
    await userEvent.click(within(primary()).getByRole("link", { name: listName }));
    await screen.findByRole("heading", { name: listName }); expectActive(listName);
    expect(within(primary()).getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
    if (actor.role !== "REQUESTER") {
      await userEvent.click(within(primary()).getByRole("link", { name: "My assigned Actions" }));
      await screen.findByRole("heading", { name: "My assigned Actions" }); expectActive("My assigned Actions");
    }
    if (actor.role === "ADMINISTRATOR") {
      await userEvent.click(within(primary()).getByRole("link", { name: "User Management" }));
      await screen.findByRole("heading", { name: "User Management" }); expectActive("User Management");
    }
    await userEvent.click(within(primary()).getByRole("link", { name: "Dashboard" })); await expectDashboard(path, heading); expectActive("Dashboard");
  });
  it("Requester retains My Tickets, owned detail and Create Ticket without privileged lookups", async () => {
    const h = install(requester); renderAt("/tickets"); await screen.findByRole("heading", { name: "My Tickets" });
    await userEvent.click(screen.getByRole("link", { name: "TKT-2026-00505" }));
    await screen.findByRole("heading", { name: "Ticket Detail" }); await screen.findByText(ticket(requester).description);
    expect(window.location.pathname).toBe("/tickets/505");
    expectActive("My Tickets");
    await userEvent.click(within(primary()).getByRole("link", { name: "Create Ticket" }));
    await screen.findByRole("heading", { name: "Create Ticket" }); expect(window.location.pathname).toBe("/tickets/new");
    expect(h.calls.filter(({ url }) => /^\/api\/(staff|admin)\//.test(url.pathname))).toEqual([]);
  });
  it.each([staff, administrator])("$role retains Queue, authorized detail and earlier operational navigation", async (actor) => {
    const h = install(actor); renderAt("/staff/tickets"); await screen.findByRole("heading", { name: "Ticket Queue" });
    const queue = await screen.findByRole("table", { name: "Ticket Queue" });
    await userEvent.click(within(queue).getByRole("link", { name: "TKT-2026-00505" }));
    await screen.findByRole("heading", { name: "TKT-2026-00505" }); await screen.findByText(ticket(actor).description);
    expect(window.location.pathname).toBe("/staff/tickets/505");
    expectActive("Ticket Queue");
    await userEvent.click(within(primary()).getByRole("link", { name: actor.role === "ADMINISTRATOR" ? "User Management" : "My assigned Actions" }));
    await screen.findByRole("heading", { name: actor.role === "ADMINISTRATOR" ? "User Management" : "My assigned Actions" });
    expect(h.calls.filter(({ method }) => method !== "GET")).toEqual([]);
    if (actor.role === "IT_STAFF") expect(h.calls.filter(({ url }) => url.pathname.startsWith("/api/admin/"))).toEqual([]);
  });
});

describe("Actual Actions return consumer - AC-44/T-54 and partial AC-35/T-35", () => {
  it.each([staff, administrator])("$role completes filtered Dashboard -> My Actions -> selected Action -> Dashboard return", async (actor) => {
    const h = install(actor); renderAt(`/staff/dashboard?${new URLSearchParams(base)}`); await expectDashboard("/staff/dashboard", "Staff Dashboard");
    await userEvent.click(screen.getByRole("link", { name: "View my actions" }));
    await screen.findByRole("heading", { name: "My assigned Actions" }); await screen.findByText(action(actor).description);
    const form = screen.getByRole("form", { name: "Assigned Actions filters" });
    await userEvent.selectOptions(within(form).getByRole("combobox", { name: "Action status" }), "IN_PROGRESS");
    fireEvent.change(within(form).getByLabelText("updated From (UTC)"), { target: { value: from } });
    fireEvent.change(within(form).getByLabelText("updated Before (UTC)"), { target: { value: before } });
    await userEvent.click(within(form).getByRole("button", { name: "Apply filters" }));
    await waitFor(() => expect(params().status).toBe("IN_PROGRESS")); await screen.findByText(action(actor).description);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Actions per page" }), "25");
    await screen.findByText(action(actor, 24).description);
    await userEvent.click(within(screen.getByRole("navigation", { name: "My Actions pagination" })).getByRole("button", { name: "Next" }));
    await screen.findByText(action(actor, 25).description);
    const originalQuery = { ...base, assignee: "me", actionStatusGroup: "unfinished", status: "IN_PROGRESS", updatedFrom: from, updatedBefore: before, page: "2", pageSize: "25" };
    expect(params()).toEqual(originalQuery);
    await userEvent.click(screen.getByRole("link", { name: "TKT-2026-00505" }));
    await screen.findByRole("heading", { name: "TKT-2026-00505" });
    const actions = await screen.findByRole("region", { name: "Actions Taken" }); await within(actions).findByText(action(actor, 25).description);
    expect(window.location.hash).toBe("#action-725");
    expectActive("Ticket Queue");
    const selected = document.getElementById("action-725")!;
    await waitFor(() => expect(selected === document.activeElement || selected.contains(document.activeElement)).toBe(true));
    expect(h.calls.filter(({ url }) => url.pathname === "/api/tickets/505/actions/725")).toHaveLength(1);
    // Real BrowserRouter history, not a mocked navigation outcome. Back returns
    // to the actual list entry before using its approved Dashboard return link.
    act(() => window.history.back());
    await screen.findByRole("heading", { name: "My assigned Actions" }); await screen.findByText(action(actor, 25).description);
    expect(params()).toEqual(originalQuery);
    const back = screen.getByRole("link", { name: "Back to Dashboard" });
    const destination = new URL(back.getAttribute("href")!, window.location.origin);
    expect(destination.pathname).toBe("/staff/dashboard"); expect(Object.fromEntries(destination.searchParams)).toEqual(base);
    await userEvent.click(back); await expectDashboard("/staff/dashboard", "Staff Dashboard"); expect(params()).toEqual(base);
    expect(Object.fromEntries(h.calls.filter(({ url }) => url.pathname === "/api/dashboard/staff").at(-1)!.url.searchParams)).toEqual(base);
    expect(h.calls.filter(({ method }) => method !== "GET")).toEqual([]);
  });
  it("rejects an unsafe return selector, then Clear and Back reach the actual known Dashboard", async () => {
    const h = install(staff); renderAt("/staff/actions?returnTo=https%3A%2F%2Funtrusted.example.test%2F");
    await screen.findByRole("heading", { name: "Invalid query filters" });
    expect(h.calls.filter(({ url }) => url.pathname === "/api/staff/actions")).toEqual([]);
    expect(document.querySelector('a[href^="https://untrusted.example.test/"]')).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" })); await screen.findByText(action(staff).description);
    await userEvent.click(screen.getByRole("link", { name: "Back to Dashboard" })); await expectDashboard("/staff/dashboard", "Staff Dashboard");
    expect(window.location.search).toBe(""); expect(h.calls.every(({ url }) => url.hostname !== "untrusted.example.test")).toBe(true);
  });
});

describe("Navigation identity/session isolation - partial AC-01/02/35, T-01/02/35", () => {
  it.each(["Dashboard", "Actions"] as const)("late prior-user %s response cannot return after logout/login as another worker", async (surface) => {
    const deferred = controlled(), heldPath = surface === "Dashboard" ? "/api/dashboard/staff" : "/api/staff/actions";
    const h = install(staff, { loginAs: secondStaff, read: (url, actor) => actor.id === staff.id && url.pathname === heldPath ? deferred.promise : undefined });
    renderAt(surface === "Dashboard" ? "/staff/dashboard" : "/staff/actions");
    await screen.findByRole("button", { name: "Logout" }); await waitFor(() => expect(h.calls.filter(({ url }) => url.pathname === heldPath)).toHaveLength(1));
    await userEvent.click(screen.getByRole("button", { name: "Logout" })); await signIn();
    // The separate landing RED cases cover the default. Existing operational
    // links let this independent isolation case execute before landing GREEN.
    await userEvent.click(within(primary()).getByRole("link", { name: "My assigned Actions" })); await screen.findByText(action(secondStaff).description);
    await userEvent.click(screen.getByRole("link", { name: "Back to Dashboard" })); await expectDashboard("/staff/dashboard", "Staff Dashboard");
    await act(async () => { deferred.finish(jsonResponse(surface === "Dashboard" ? staffDashboard(staff) : page(Array.from({ length: 10 }, (_, index) => assigned(staff, index)), 26))); await deferred.promise; });
    expect(h.calls.find(({ url, actorId }) => url.pathname === heldPath && actorId === staff.id)!.signal?.aborted).toBe(true);
    expect(screen.queryByText(ticket(staff).summary)).not.toBeInTheDocument(); expect(screen.queryByText(action(staff).description)).not.toBeInTheDocument();
    expect(screen.getAllByText(ticket(secondStaff).summary).length).toBeGreaterThan(0);
    // An eligible worker's public name can legitimately remain in Owner options;
    // it must not remain as the authenticated shell identity or owned records.
    expect(screen.getByText(secondStaff.name, { exact: true, selector: "p" })).toBeInTheDocument();
    expect(screen.queryByText(staff.name, { exact: true, selector: "p" })).not.toBeInTheDocument();
  });
  it("current role loss rechecks the session, removes Staff data and prevents further privileged navigation", async () => {
    const denied = controlled(); const h = install(staff, { read: (url) => url.pathname === "/api/staff/actions" ? denied.promise : undefined });
    renderAt("/staff/dashboard"); await expectDashboard("/staff/dashboard", "Staff Dashboard");
    await userEvent.click(within(primary()).getByRole("link", { name: "My assigned Actions" })); await screen.findByRole("heading", { name: "My assigned Actions" });
    await waitFor(() => expect(h.calls.filter(({ url }) => url.pathname === "/api/staff/actions")).toHaveLength(1));
    h.setSession(requester);
    await act(async () => { denied.finish(jsonResponse({ error: { code: "ROLE_FORBIDDEN", message: "This operation is not permitted." } }, 403)); await denied.promise; });
    await screen.findByRole("heading", { name: "Forbidden" });
    expect(screen.getByText(requester.name, { exact: true })).toBeInTheDocument(); expect(screen.queryByText(ticket(staff).summary)).not.toBeInTheDocument();
    expect(within(primary()).queryByRole("link", { name: "My assigned Actions" })).not.toBeInTheDocument();
    const refreshedSession = h.calls.findIndex(({ url, actorId }) => url.pathname === "/api/auth/me" && actorId === requester.id);
    expect(refreshedSession).toBeGreaterThanOrEqual(0);
    const callsAfterRoleChange = h.calls.slice(refreshedSession);
    expect(callsAfterRoleChange.filter(({ url }) => /^\/api\/(staff|admin)\//.test(url.pathname) || url.pathname === "/api/dashboard/staff")).toEqual([]);
  });
  it.each([
    { condition: "expired", path: "/staff/dashboard", api: "/api/dashboard/staff" },
    { condition: "revoked", path: "/staff/actions", api: "/api/staff/actions" },
    { condition: "inactive", path: "/dashboard", api: "/api/dashboard/requester" },
  ])("$condition session read denial removes the shell and protected navigation", async ({ path, api }) => {
    // HTTP simulations use the inherited 401 envelope. Real expiration/revocation/
    // inactivity mechanisms are already tested server-side, not simulated here.
    const h = install(path === "/dashboard" ? requester : staff, { read: (url) => url.pathname === api ? jsonResponse({ error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication is required." } }, 401) : undefined });
    renderAt(path); await screen.findByRole("heading", { name: "Sign in" });
    expect(window.location.pathname).toBe("/login"); expect(screen.queryByRole("navigation", { name: "Primary navigation" })).not.toBeInTheDocument();
    expect(screen.queryByText(/owned navigation record/)).not.toBeInTheDocument();
    expect(h.calls.filter(({ url }) => url.pathname === api)).toHaveLength(1);
  });
});


// PR #57 review regression: the reserved create route is not a Ticket detail.
it("/tickets/new activates Create Ticket only - AC-35/T-35", async () => {
  const h = install(requester); renderAt("/tickets/new");
  await screen.findByRole("heading", { name: /^Create Ticket$/ });
  expectActive("Create Ticket");
  expect(within(primary()).getByRole("link", { name: /^My Tickets$/ })).not.toHaveAttribute("aria-current");
  expect(within(primary()).getByRole("link", { name: /^My Tickets$/ })).not.toHaveClass("active");
  expect(h.calls.filter(({ url }) => /^\/api\/(staff|admin)\//.test(url.pathname))).toEqual([]);
});
