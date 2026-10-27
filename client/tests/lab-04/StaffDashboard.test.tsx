import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActionDTO, ActionStatus, RequestedPriority, StaffQueueItem, StaffTicketDetail, TicketStatus } from "../../src/api.js";
import { authResponse, jsonResponse, renderAt, requesterUser, requestUrl, type SafeUser } from "../lab-03/test-helpers.js";

// Partial AC-01/25/26/27/28/29/34/35/36/38/44; T-01/25/26/27/28/29/34/35/36/38/54.
// Real App/router, explicit API-09/API-07/inherited Staff DTO fetch simulations.
// Existing MyActions/RequesterDashboard/Shell tests retain their own coverage.
// #53 owns role landing/global navigation; no browser geometry, SQL snapshot,
// backend authorization or end-to-end verification is claimed here.
const staff: SafeUser = { id: 71, name: "Current support worker", email: "staff.dashboard@example.test", role: "IT_STAFF", mustChangePassword: false };
const administrator: SafeUser = { id: 72, name: "Current administrator", email: "admin.dashboard@example.test", role: "ADMINISTRATOR", mustChangePassword: false };
const historical = { id: 91, name: "Retained historical worker", role: "IT_STAFF" as const };
const category = { id: 11, name: "Network" }, system = { id: 21, name: "VPN" };
const asOf = "2026-10-23T18:30:00.000Z", from = "2026-10-17T17:00:00.000Z", before = "2026-10-24T17:00:00.000Z";
const literal = '<script>window.staffDashboardExecuted=true</script> VPN%_ literal';
const ticketStates: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED", "RESOLVED", "CLOSED", "CANCELLED"];
const priorities: RequestedPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const actionStates: ActionStatus[] = ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
const labels = { NEW: "New", OPEN: "Open", IN_PROGRESS: "In Progress", WAITING_FOR_REQUESTER: "Waiting for Requester",
  REOPENED: "Reopened", RESOLVED: "Resolved", CLOSED: "Closed", CANCELLED: "Cancelled", PLANNED: "Planned", COMPLETED: "Completed",
  LOW: "Low", MEDIUM: "Medium", HIGH: "High", URGENT: "Urgent" };
type Base = Partial<Record<"search" | "categoryId" | "relatedSystemId" | "requestedPriority" | "itPriority" | "currentStatus" | "owner", string>>;
const base: Base = { search: "VPN%_", categoryId: "11", relatedSystemId: "21", requestedPriority: "HIGH", itPriority: "MEDIUM" };
type Descriptor = { path: string; query: Record<string, string> };
type Preview = Pick<StaffQueueItem, "id" | "ticketNumber" | "summary" | "currentStatus" | "requestedPriority" | "itPriority" | "owner" | "updatedAt"> & { resolvedAt?: string };
type Assigned = { ticket: Pick<StaffQueueItem, "id" | "ticketNumber" | "summary" | "currentStatus">; action: ActionDTO };
interface Dashboard {
  asOf: string; timezone: "Asia/Bangkok"; recentWindow: { from: string; before: string };
  filters: { search: string; categoryId: number | null; relatedSystemId: number | null; requestedPriority: RequestedPriority | null;
    itPriority: RequestedPriority | null; currentStatus: TicketStatus | null; owner: "me" | "unassigned" | number | null };
  metrics: { unassigned: number; mine: number; byStatus: Record<TicketStatus, number>; byItPriority: Record<RequestedPriority, number>;
    recentUpdated: number; recentResolved: number; myActionsByStatus: Record<ActionStatus, number>; myUnfinishedActions: number };
  lists: { recentUpdated: Preview[]; recentResolved: Preview[]; myUnfinishedActions: Assigned[] };
  drillDown: { unassigned: Descriptor; mine: Descriptor; byStatus: Record<TicketStatus, Descriptor>; byItPriority: Record<RequestedPriority, Descriptor>;
    recentUpdated: Descriptor; recentResolved: Descriptor; myActionsByStatus: Record<ActionStatus, Descriptor>; myUnfinishedActions: Descriptor };
}
function preview(id: number, status: TicketStatus, instant: string): Preview {
  return { id, ticketNumber: `TKT-2026-${String(id).padStart(5, "0")}`, summary: id === 505 ? literal : `VPN%_ safe summary ${id}`,
    currentStatus: status, requestedPriority: "HIGH", itPriority: "MEDIUM", owner: historical, updatedAt: instant };
}
const updated: Preview[] = [
  preview(505, "OPEN", "2026-10-23T18:29:00.000Z"), preview(504, "WAITING_FOR_REQUESTER", "2026-10-23T18:29:00.000Z"),
  preview(503, "RESOLVED", "2026-10-23T18:28:00.000Z"), preview(502, "NEW", "2026-10-23T18:27:00.000Z"), preview(501, "REOPENED", "2026-10-23T18:26:00.000Z"),
];
const resolved: Preview[] = [
  { ...preview(603, "CLOSED", "2026-10-23T18:25:00.000Z"), resolvedAt: "2026-10-23T18:15:00.000Z" },
  { ...preview(602, "RESOLVED", "2026-10-23T18:15:00.000Z"), resolvedAt: "2026-10-23T18:15:00.000Z" },
  { ...preview(601, "RESOLVED", "2026-10-23T18:00:00.000Z"), resolvedAt: "2026-10-23T18:00:00.000Z" },
  { ...preview(600, "CLOSED", "2026-10-23T18:10:00.000Z"), resolvedAt: "2026-10-23T17:50:00.000Z" },
  { ...preview(599, "RESOLVED", "2026-10-23T17:40:00.000Z"), resolvedAt: "2026-10-23T17:40:00.000Z" },
];
function assigned(user: SafeUser, index: number): Assigned {
  const createdAt = index < 2 ? "2026-10-20T08:00:00.000Z" : `2026-10-20T08:0${index - 1}:00.000Z`;
  const started = user.id === administrator.id && index === 1;
  return { ticket: { id: 505, ticketNumber: "TKT-2026-00505", summary: literal, currentStatus: "OPEN" }, action: {
    id: 700 + index, ticketId: 505, actionAt: createdAt, createdAt, updatedAt: started ? "2026-10-20T08:10:00.000Z" : createdAt, version: started ? 2 : 1,
    description: `Literal assigned Action ${index + 1} <script>inert text</script>`, result: null,
    createdBy: { id: historical.id, name: historical.name }, assignee: { id: user.id, name: user.name }, performedBy: null,
    status: started ? "IN_PROGRESS" : "PLANNED", followUpRequired: true, followUpNote: "Preserved follow-up", attachmentNotes: "<script>literal notes</script>",
    cancellationReason: null, completedAt: null, cancelledAt: null,
  } };
}
function dashboard(user = staff, filters: Base = {}, mode: "normal" | "empty" | "no-assignments" | "terminal-only" | "old-closed" = "normal"): Dashboard {
  const ticket = (widget: string, extra: Record<string, string> = {}): Descriptor => ({ path: "/api/staff/tickets", query: { ...filters, dashboardWidget: widget, ...extra } });
  const action = (extra: Record<string, string>): Descriptor => ({ path: "/api/staff/actions", query: { ...filters, assignee: "me", ...extra } });
  const response: Dashboard = {
    asOf, timezone: "Asia/Bangkok", recentWindow: { from, before },
    filters: { search: filters.search ?? "", categoryId: filters.categoryId ? Number(filters.categoryId) : null,
      relatedSystemId: filters.relatedSystemId ? Number(filters.relatedSystemId) : null, requestedPriority: filters.requestedPriority as RequestedPriority ?? null,
      itPriority: filters.itPriority as RequestedPriority ?? null, currentStatus: filters.currentStatus as TicketStatus ?? null,
      owner: filters.owner === "me" || filters.owner === "unassigned" ? filters.owner : filters.owner ? Number(filters.owner) : null },
    metrics: { unassigned: 9, mine: user.id === staff.id ? 4 : 2,
      byStatus: { NEW: 4, OPEN: 8, IN_PROGRESS: 6, WAITING_FOR_REQUESTER: 3, REOPENED: 2, RESOLVED: 7, CLOSED: 5, CANCELLED: 2 },
      byItPriority: { LOW: 5, MEDIUM: 12, HIGH: 9, URGENT: 4 }, recentUpdated: 19, recentResolved: 11,
      myActionsByStatus: user.id === staff.id ? { PLANNED: 8, IN_PROGRESS: 3, COMPLETED: 4, CANCELLED: 2 } : { PLANNED: 1, IN_PROGRESS: 1, COMPLETED: 6, CANCELLED: 0 },
      myUnfinishedActions: user.id === staff.id ? 11 : 2 },
    lists: { recentUpdated: updated.map((row) => ({ ...row })), recentResolved: resolved.map((row) => ({ ...row })),
      myUnfinishedActions: Array.from({ length: user.id === staff.id ? 5 : 2 }, (_, index) => assigned(user, index)) },
    drillDown: { unassigned: ticket("unassigned", { statusGroup: "active" }), mine: ticket("mine", { statusGroup: "active" }),
      byStatus: Object.fromEntries(ticketStates.map((status) => [status, ticket("status", { widgetStatus: status })])) as Record<TicketStatus, Descriptor>,
      byItPriority: Object.fromEntries(priorities.map((priority) => [priority, ticket("itPriority", { widgetItPriority: priority, statusGroup: "active" })])) as Record<RequestedPriority, Descriptor>,
      recentUpdated: ticket("recentUpdated", { updatedFrom: from, updatedBefore: before, sortBy: "updatedAt", sortOrder: "desc" }),
      recentResolved: ticket("recentResolved", { statusGroup: "resolved", resolvedFrom: from, resolvedBefore: before, sortBy: "resolvedAt", sortOrder: "desc" }),
      myActionsByStatus: Object.fromEntries(actionStates.map((status) => [status, action({ status })])) as Record<ActionStatus, Descriptor>,
      myUnfinishedActions: action({ actionStatusGroup: "unfinished" }) },
  };
  if (filters.itPriority === "MEDIUM") {
    // All 30 active matches in this narrowed cohort are MEDIUM. Retaining a
    // nonzero HIGH bin under an explicit MEDIUM base filter would be invalid.
    response.metrics.byItPriority = { LOW: 0, MEDIUM: 30, HIGH: 0, URGENT: 0 };
  }
  if (filters.currentStatus === "OPEN") {
    response.metrics = { ...response.metrics, unassigned: 0, mine: 3,
      byStatus: { NEW: 0, OPEN: 3, IN_PROGRESS: 0, WAITING_FOR_REQUESTER: 0, REOPENED: 0, RESOLVED: 0, CLOSED: 0, CANCELLED: 0 },
      byItPriority: { LOW: 0, MEDIUM: 3, HIGH: 0, URGENT: 0 }, recentUpdated: 3, recentResolved: 0,
      myActionsByStatus: { PLANNED: 8, IN_PROGRESS: 0, COMPLETED: 1, CANCELLED: 0 }, myUnfinishedActions: 8 };
    response.lists.recentUpdated = updated.slice(0, 3).map((row) => ({ ...row, currentStatus: "OPEN", owner: { id: user.id, name: user.name, role: user.role } }));
    response.lists.recentResolved = [];
  }
  if (mode === "no-assignments" || mode === "terminal-only") {
    response.metrics.mine = 0; response.metrics.myActionsByStatus = { PLANNED: 0, IN_PROGRESS: 0, COMPLETED: mode === "terminal-only" ? 4 : 0, CANCELLED: mode === "terminal-only" ? 2 : 0 };
    response.metrics.myUnfinishedActions = 0; response.lists.myUnfinishedActions = [];
  }
  if (mode === "empty" || mode === "old-closed") {
    response.metrics = { unassigned: 0, mine: 0, byStatus: { NEW: 0, OPEN: 0, IN_PROGRESS: 0, WAITING_FOR_REQUESTER: 0, REOPENED: 0, RESOLVED: 0, CLOSED: mode === "old-closed" ? 1 : 0, CANCELLED: 0 },
      byItPriority: { LOW: 0, MEDIUM: 0, HIGH: 0, URGENT: 0 }, recentUpdated: 0, recentResolved: 0,
      myActionsByStatus: { PLANNED: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELLED: 0 }, myUnfinishedActions: 0 };
    response.lists = { recentUpdated: [], recentResolved: [], myUnfinishedActions: [] };
  }
  return response;
}
function queueRow(id: number, status: TicketStatus = "OPEN"): StaffQueueItem {
  return { ...preview(id, status, "2026-10-23T18:20:00.000Z"), summary: `Authoritative Staff list record ${id}`,
    ticketDate: "2026-10-18T02:00:00.000Z", requester: { id: 41, name: requesterUser.name, email: requesterUser.email },
    category, relatedSystem: system, requesterResolutionIndicatedAt: null };
}
function pagination(totalItems: number, page = 1, pageSize = 10) {
  const totalPages = Math.ceil(totalItems / pageSize);
  return { page, pageSize, totalItems, totalPages, hasPreviousPage: totalItems > 0 && page > 1, hasNextPage: totalItems > 0 && page < totalPages };
}
const detail: StaffTicketDetail = { ...queueRow(505), summary: literal, description: "Authoritative selected Ticket detail",
  createdAt: "2026-10-18T02:00:00.000Z", allowedStatusTransitions: ["IN_PROGRESS", "RESOLVED", "CANCELLED"], statusHistory: [] };
type Call = { url: URL; method: string; init?: RequestInit };
const unexpected: string[] = [];
const pending: Array<{ resolve: (body?: Dashboard) => void; settled: Promise<Response> }> = [];
function controlled() {
  let finish!: (response: Response) => void;
  const settled = new Promise<Response>((done) => { finish = done; });
  const result = { settled, resolve: (body = dashboard()) => finish(jsonResponse(body)) };
  pending.push(result); return result;
}
function install(options: {
  user?: SafeUser | null; dashboard?: (url: URL, attempt: number) => Response | Promise<Response>;
  tickets?: (url: URL) => Response; actions?: (url: URL) => Response;
} = {}) {
  let user = options.user === undefined ? staff : options.user;
  const calls: Call[] = [], dashboardCalls: Call[] = [], ticketCalls: Call[] = [], actionCalls: Call[] = [];
  document.cookie = "toktickit_csrf=staff-dashboard-ui-csrf; path=/";
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input), method = init?.method ?? "GET", call = { url, method, init }; calls.push(call);
    if (url.pathname === "/api/auth/me" && method === "GET") return user ? jsonResponse(authResponse(user)) : jsonResponse({ error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication is required." } }, 401);
    if (url.pathname === "/api/auth/logout" && method === "POST") {
      expect(init?.credentials).toBe("include"); expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe("staff-dashboard-ui-csrf");
      user = null; return jsonResponse(null, 204);
    }
    if (method === "GET") {
      if (url.pathname === "/api/health") return jsonResponse({ status: "ok", service: "toktickit" });
      if (url.pathname === "/api/categories") return jsonResponse([category]);
      if (url.pathname === "/api/related-systems") return jsonResponse([system]);
      if (url.pathname === "/api/staff/assignees") return jsonResponse({ items: [staff, administrator].map(({ id, name, role }) => ({ id, name, role })) });
      if (url.pathname === "/api/dashboard/staff") {
        dashboardCalls.push(call);
        const filters = Object.fromEntries(url.searchParams) as Base;
        return options.dashboard?.(url, dashboardCalls.length) ?? jsonResponse(dashboard(user ?? staff, filters));
      }
      if (url.pathname === "/api/staff/tickets") {
        ticketCalls.push(call);
        return options.tickets?.(url) ?? jsonResponse({ items: [], counts: { matching: 0, mine: 0, unassigned: 0 }, pagination: pagination(0) });
      }
      if (url.pathname === "/api/staff/actions") {
        actionCalls.push(call);
        return options.actions?.(url) ?? jsonResponse({ items: [], pagination: pagination(0) });
      }
      if (url.pathname === "/api/staff/tickets/505") return jsonResponse(detail);
      if (url.pathname === "/api/tickets/505/actions/700") return jsonResponse({ action: assigned(user ?? staff, 0).action, ticketUpdatedAt: detail.updatedAt });
      if (url.pathname === "/api/tickets/505/actions") return jsonResponse({ items: [assigned(user ?? staff, 0).action], pagination: pagination(1, 1, 20) });
      if (["/api/staff/tickets/505/notes", "/api/tickets/505/comments"].includes(url.pathname)) return jsonResponse({ items: [], pagination: pagination(0, 1, 20) });
      if (url.pathname === "/api/tickets/505/attachments") return jsonResponse({ items: [] });
    }
    unexpected.push(`${method} ${url.pathname}`);
    return jsonResponse({ error: { code: "SAFE_FAILURE", message: "Unable to load this resource." } }, 500);
  }));
  return { calls, dashboardCalls, ticketCalls, actionCalls };
}
async function ready(path = "/staff/dashboard") {
  renderAt(path); await screen.findByRole("button", { name: "Logout" });
  const heading = await screen.findByRole("heading", { name: /^(?:(?:IT )?Staff(?:\/Administrator)? )?Dashboard$/i });
  return heading.closest("section") ?? screen.getByRole("main");
}
function region(root: HTMLElement, name: RegExp) { return within(root).getByRole("region", { name }); }
function metric(root: HTMLElement, name: RegExp, count: number) {
  const link = within(root).getByRole("link", { name });
  expect(within(link).getByText(String(count), { exact: true })).toBeInTheDocument(); return link;
}
function bins(root: HTMLElement, keys: Array<TicketStatus | RequestedPriority | ActionStatus>, counts: number[]) {
  const links = within(root).getAllByRole("link");
  expect(links).toHaveLength(keys.length);
  keys.forEach((key, index) => {
    expect(links[index]).toHaveAccessibleName(new RegExp(`^${labels[key]}\\s+${counts[index]}$`, "i"));
    expect(within(links[index]!).getByText(String(counts[index]), { exact: true })).toBeInTheDocument();
  });
}
function readOnly(harness: ReturnType<typeof install>) {
  expect(harness.calls.every(({ method }) => method === "GET")).toBe(true);
  expect(harness.calls.some(({ url }) => /^\/api\/admin\//.test(url.pathname) || /\/notes$/.test(url.pathname))).toBe(false);
  expect(harness.dashboardCalls.every(({ init }) => init?.credentials === "include" && init.signal instanceof AbortSignal)).toBe(true);
}
const params = (url: URL) => Object.fromEntries(url.searchParams);
afterEach(async () => {
  cleanup();
  try {
    await act(async () => { pending.forEach((value) => value.resolve()); await Promise.all(pending.map(({ settled }) => settled)); });
    expect(unexpected).toEqual([]);
  } finally {
    pending.length = 0; unexpected.length = 0; vi.unstubAllGlobals(); vi.restoreAllMocks();
    document.cookie = "toktickit_csrf=; max-age=0; path=/"; window.history.replaceState({}, "", "/");
  }
});

describe("Issue 48 Staff Dashboard route and authoritative rendering", () => {
  it.each([staff, administrator])("$role reads its own server counts, all bins and bounded literal previews", async (user) => {
    const harness = install({ user }), root = await ready();
    await within(root).findAllByText(literal, { exact: true });
    metric(root, /unassigned.*active|active.*unassigned/i, 9); metric(root, /my active|mine.*active|active.*mine/i, user.id === staff.id ? 4 : 2);
    metric(root, /^recent(?:ly)? updated\s+19$/i, 19); metric(root, /^recent(?:ly)? resolved\s+11$/i, 11);
    bins(region(root, /ticket status/i), ticketStates, [4, 8, 6, 3, 2, 7, 5, 2]);
    bins(region(root, /active.*IT priorit|IT priorit.*active/i), priorities, [5, 12, 9, 4]);
    bins(region(root, /(?:my|assigned).*action status|action status.*(?:my|assigned)/i), actionStates, user.id === staff.id ? [8, 3, 4, 2] : [1, 1, 6, 0]);
    metric(root, /unfinished.*(?:action|assigned)|(?:action|assigned).*unfinished/i, user.id === staff.id ? 11 : 2);
    const updates = region(root, /recent(?:ly)? updated.*tickets/i), resolutions = region(root, /recent(?:ly)? resolved.*tickets/i);
    expect(within(updates).getAllByRole("link", { name: /^TKT-/ }).map((link) => link.textContent)).toEqual(["TKT-2026-00505", "TKT-2026-00504", "TKT-2026-00503", "TKT-2026-00502", "TKT-2026-00501"]);
    expect(within(resolutions).getAllByRole("link", { name: /^TKT-/ }).map((link) => link.textContent)).toEqual(["TKT-2026-00603", "TKT-2026-00602", "TKT-2026-00601", "TKT-2026-00600", "TKT-2026-00599"]);
    expect(updates).toHaveTextContent(historical.name); expect(resolutions.querySelector('time[datetime="2026-10-23T18:15:00.000Z"]')).not.toBeNull();
    const previewRegion = region(root, /unfinished.*actions|assigned actions preview/i);
    expect(within(previewRegion).getAllByText(/Literal assigned Action \d/).map((node) => node.textContent)).toEqual(Array.from({ length: user.id === staff.id ? 5 : 2 }, (_, index) => assigned(user, index).action.description));
    expect(previewRegion).toHaveTextContent(user.name); expect(previewRegion).toHaveTextContent("Planned");
    expect(root).toHaveTextContent(/Asia\/Bangkok/); expect(root).toHaveTextContent(/seven.*calendar.*days|7.*calendar.*days/i);
    expect(root.querySelector(`time[datetime="${asOf}"]`)).not.toBeNull();
    expect(root).toHaveTextContent(/active.*resolved|resolved.*active/i); expect(root).toHaveTextContent(/exclud.*closed.*cancelled/i);
    expect(root.querySelector("script, [onclick], [onerror]")).toBeNull();
    expect(root).not.toHaveTextContent(/passwordHash|tokenHash|inputFingerprint|safeResponse|Internal Notes|storageKey/);
    expect(harness.dashboardCalls).toHaveLength(1); expect(params(harness.dashboardCalls[0]!.url)).toEqual({});
    expect(harness.ticketCalls).toEqual([]); expect(harness.actionCalls).toEqual([]); readOnly(harness);
    // Preserve the inherited destinations; adding a Dashboard screen does not
    // authorize #53's role-home/global-navigation changes in this batch.
    const navigation = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(navigation).getByRole("link", { name: "Ticket Queue" })).toHaveAttribute("href", "/staff/tickets");
    expect(within(navigation).getByRole("link", { name: "My assigned Actions" })).toHaveAttribute("href", "/staff/actions");
    if (user.role === "ADMINISTRATOR") expect(within(navigation).getByRole("link", { name: "User Management" })).toHaveAttribute("href", "/admin/users");
  });
  it("denies Requester direct access without privileged Dashboard/worker/list requests", async () => {
    const harness = install({ user: requesterUser }); renderAt("/staff/dashboard");
    expect(await screen.findByRole("heading", { name: "Forbidden" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).not.toHaveTextContent(/^\s*$/); expect(harness.calls.map(({ url }) => url.pathname)).toEqual(["/api/auth/me"]);
  });
  it("sends unauthenticated direct access to Login without business reads", async () => {
    const harness = install({ user: null }); renderAt("/staff/dashboard");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument(); expect(window.location.pathname).toBe("/login");
    expect(harness.calls.map(({ url }) => url.pathname)).toEqual(["/api/auth/me"]);
  });
  it("enforces mandatory password change before rendering or fetching Staff Dashboard", async () => {
    const harness = install({ user: { ...administrator, mustChangePassword: true } }); renderAt("/staff/dashboard");
    expect(await screen.findByRole("heading", { name: "Create a new password" })).toBeInTheDocument();
    expect(harness.calls.map(({ url }) => url.pathname)).toEqual(["/api/auth/me"]);
  });
});

describe("Staff Dashboard honest async and empty states", () => {
  it("announces pending loading without fabricated zeros/empty state, then renders the resolved response", async () => {
    const deferred = controlled(), harness = install({ dashboard: () => deferred.settled }), root = await ready();
    expect(within(root).getByRole("status")).toHaveTextContent(/loading/i);
    expect(within(root).queryByText(/no .*tickets|no .*actions/i)).not.toBeInTheDocument();
    expect(within(root).queryByRole("link", { name: /unassigned.*\d/i })).not.toBeInTheDocument();
    await act(async () => { deferred.resolve(); await deferred.settled; });
    await within(root).findAllByText(literal, { exact: true }); expect(within(root).queryAllByRole("status").filter((node) => /loading/i.test(node.textContent ?? ""))).toEqual([]);
    expect(harness.dashboardCalls).toHaveLength(1); readOnly(harness);
  });
  it("shows one accessible dependency error and explicit Retry, never fake zero success", async () => {
    const harness = install({ dashboard: (_url, attempt) => attempt === 1 ? jsonResponse({ error: { code: "SERVICE_UNAVAILABLE", message: "Service is temporarily unavailable." } }, 503) : jsonResponse(dashboard()) });
    const root = await ready(); const alert = await within(root).findByRole("alert"); expect(alert).toHaveTextContent(/unable|unavailable|try again/i);
    expect(within(root).getAllByRole("alert")).toHaveLength(1); expect(within(root).queryByRole("link", { name: /unassigned.*0/i })).not.toBeInTheDocument();
    await userEvent.click(within(root).getByRole("button", { name: /^retry$|^try again$/i }));
    await within(root).findAllByText(literal, { exact: true }); expect(within(root).queryByRole("alert")).not.toBeInTheDocument();
    expect(harness.dashboardCalls).toHaveLength(2); readOnly(harness);
  });
  it("removes protected data when the Dashboard read reports an expired session", async () => {
    const expired = install({ dashboard: () => jsonResponse({ error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication is required." } }, 401) });
    renderAt("/staff/dashboard");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument(); expect(window.location.pathname).toBe("/login");
    expect(screen.queryByText(literal, { exact: true })).not.toBeInTheDocument(); expect(expired.dashboardCalls).toHaveLength(1);
    expect(expired.calls.some(({ method }) => method !== "GET")).toBe(false);
  });
  it("shows genuine global zero bins and empty lists without a dependency error", async () => {
    const harness = install({ dashboard: () => jsonResponse(dashboard(staff, {}, "empty")) }), root = await ready();
    await within(root).findByText(/no .*tickets.*(?:available|yet)|no .*dashboard.*(?:items|data)/i);
    bins(region(root, /ticket status/i), ticketStates, Array(8).fill(0)); bins(region(root, /active.*IT priorit|IT priorit.*active/i), priorities, Array(4).fill(0));
    metric(root, /unassigned.*active|active.*unassigned/i, 0); expect(within(root).getByText("No unfinished actions assigned to you", { exact: false })).toBeInTheDocument();
    expect(within(root).queryByRole("alert")).not.toBeInTheDocument(); expect(within(root).queryByRole("status")).not.toBeInTheDocument(); readOnly(harness);
  });
  it("retains CLOSED filter/bin while zero active/recent widgets do not claim no matching Tickets", async () => {
    const harness = install({ dashboard: () => jsonResponse(dashboard(staff, { currentStatus: "CLOSED" }, "old-closed")),
      tickets: () => jsonResponse({ items: [{ ...queueRow(890, "CLOSED"), ticketDate: "2026-09-01T02:00:00.000Z", updatedAt: "2026-09-03T02:00:00.000Z" }], counts: { matching: 1, mine: 0, unassigned: 0 }, pagination: pagination(1) }) });
    const root = await ready("/staff/dashboard?currentStatus=CLOSED");
    const statuses = region(root, /ticket status/i); metric(statuses, /^closed\s+1$/i, 1);
    metric(root, /my active|mine.*active|active.*mine/i, 0); metric(root, /^recent(?:ly)? resolved\s+0$/i, 0);
    expect(within(root).getByRole("combobox", { name: /(?:current )?status/i })).toHaveValue("CLOSED");
    expect(region(root, /active filters/i)).toHaveTextContent(/closed/i);
    expect(within(root).queryByText(/no tickets match|no tickets.*available/i)).not.toBeInTheDocument();
    await userEvent.click(metric(statuses, /^closed\s+1$/i, 1)); await screen.findByText("Authoritative Staff list record 890");
    expect(params(harness.ticketCalls[0]!.url)).toMatchObject({ currentStatus: "CLOSED", dashboardWidget: "status", widgetStatus: "CLOSED" });
  });
  it("shows filtered no-results with retained context and a working Clear filters recovery", async () => {
    const harness = install({ dashboard: (url) => jsonResponse(url.searchParams.has("search") ? dashboard(staff, { search: "absent literal" }, "empty") : dashboard()) });
    const root = await ready("/staff/dashboard?search=absent+literal");
    await within(root).findByText(/no .*match|no .*results/i);
    bins(region(root, /ticket status/i), ticketStates, Array(8).fill(0));
    expect(region(root, /active filters/i)).toHaveTextContent("absent literal");
    expect(within(root).getByRole("textbox", { name: /search/i })).toHaveValue("absent literal");
    expect(within(root).queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.click(within(root).getByRole("button", { name: /^clear(?: filters)?$/i }));
    await within(root).findAllByText(literal, { exact: true }); expect(window.location.search).toBe("");
    expect(harness.dashboardCalls).toHaveLength(2); expect(params(harness.dashboardCalls[1]!.url)).toEqual({}); readOnly(harness);
  });
  it.each(["no-assignments", "terminal-only"] as const)("keeps global data with %s and no unfinished assignments", async (mode) => {
    const harness = install({ dashboard: () => jsonResponse(dashboard(staff, {}, mode)) }), root = await ready();
    await within(root).findAllByText(literal, { exact: true }); metric(root, /my active|mine.*active|active.*mine/i, 0);
    metric(root, /unassigned.*active|active.*unassigned/i, 9); metric(region(root, /ticket status/i), /^open\s+8$/i, 8);
    expect(within(root).getByText("No unfinished actions assigned to you", { exact: false })).toBeInTheDocument();
    bins(region(root, /(?:my|assigned).*action status|action status.*(?:my|assigned)/i), actionStates, mode === "terminal-only" ? [0, 0, 4, 2] : [0, 0, 0, 0]); readOnly(harness);
  });
  it("keeps all seven filters in URL/API, applies deliberately, clears, and ignores an obsolete response", async () => {
    const stale = controlled();
    const harness = install({ dashboard: (url, attempt) => attempt === 1 ? stale.settled : jsonResponse(dashboard(staff, Object.fromEntries(url.searchParams) as Base)) });
    const root = await ready(); await waitFor(() => expect(harness.dashboardCalls).toHaveLength(1));
    const user = userEvent.setup();
    await user.type(within(root).getByRole("textbox", { name: /search/i }), "  VPN%_  ");
    for (const [name, value] of [[/category/i, "11"], [/related system/i, "21"], [/requested priority/i, "HIGH"], [/IT priority/i, "MEDIUM"], [/(?:current )?status/i, "OPEN"], [/owner/i, "me"]] as const) {
      const control = within(root).getByRole("combobox", { name }); await waitFor(() => expect(within(control).getByRole("option", { name: value === "11" ? category.name : value === "21" ? system.name : value === "me" ? /mine|me/i : value === "OPEN" ? "Open" : new RegExp(labels[value as keyof typeof labels], "i") })).toBeInTheDocument());
      await user.selectOptions(control, value);
    }
    expect(harness.dashboardCalls).toHaveLength(1);
    const apply = within(root).getByRole("button", { name: /^apply(?: filters)?$/i }); apply.focus(); await user.keyboard("{Enter}");
    await within(root).findAllByText(literal, { exact: true });
    const expected = { ...base, currentStatus: "OPEN", owner: "me" };
    expect(params(harness.dashboardCalls[1]!.url)).toEqual(expected); expect(Object.fromEntries(new URLSearchParams(window.location.search))).toEqual(expected);
    expect(region(root, /active filters/i)).toHaveTextContent(/VPN%_/); metric(region(root, /ticket status/i), /^open\s+3$/i, 3);
    await act(async () => { stale.resolve(); await stale.settled; });
    expect(harness.dashboardCalls[0]!.init?.signal?.aborted).toBe(true); metric(region(root, /ticket status/i), /^open\s+3$/i, 3);
    expect(within(root).queryByRole("link", { name: /^closed\s+5$/i })).not.toBeInTheDocument();
    await user.click(within(root).getByRole("button", { name: /^clear(?: filters)?$/i }));
    await waitFor(() => expect(harness.dashboardCalls).toHaveLength(3)); expect(params(harness.dashboardCalls[2]!.url)).toEqual({});
    expect(window.location.search).toBe(""); readOnly(harness);
  });
});

const ticketWidgets = [
  { name: "mine", label: /my active|mine.*active|active.*mine/i, predicates: { dashboardWidget: "mine", statusGroup: "active" } },
  { name: "status", label: /^open\s+8$/i, section: /ticket status/i, predicates: { dashboardWidget: "status", widgetStatus: "OPEN" } },
  { name: "IT priority", label: /^medium\s+30$/i, section: /active.*IT priorit|IT priorit.*active/i, predicates: { dashboardWidget: "itPriority", widgetItPriority: "MEDIUM", statusGroup: "active" } },
  { name: "recent updates", label: /^recent(?:ly)? updated\s+19$/i, predicates: { dashboardWidget: "recentUpdated", updatedFrom: from, updatedBefore: before, sortBy: "updatedAt", sortOrder: "desc" } },
  { name: "recent resolutions", label: /^recent(?:ly)? resolved\s+11$/i, predicates: { dashboardWidget: "recentResolved", statusGroup: "resolved", resolvedFrom: from, resolvedBefore: before, sortBy: "resolvedAt", sortOrder: "desc" } },
];
describe("Staff Dashboard structured drill-downs use real destination consumers", () => {
  it.each(ticketWidgets)("$name retains all descriptor predicates through Staff Queue pagination", async ({ name, label, section, predicates }) => {
    const harness = install({ tickets: (url) => {
      const page = Number(url.searchParams.get("page") ?? "1");
      const rows = (page === 1 ? [810, 809, 808, 807, 806, 805, 804, 803, 802, 801] : [800]).map((id) => queueRow(id, name === "recent resolutions" ? "RESOLVED" : "OPEN"));
      return jsonResponse({ items: name === "recent resolutions" ? rows.map((row) => ({ ...row, resolvedAt: "2026-10-23T18:15:00.000Z" })) : rows,
        counts: { matching: 11, mine: 2, unassigned: 4 }, pagination: pagination(11, page) });
    } });
    const root = await ready(`/staff/dashboard?${new URLSearchParams(base)}`); await within(root).findAllByText(literal, { exact: true });
    const scope = section ? region(root, section) : root;
    const link = within(scope).getByRole("link", { name: label }); link.focus(); await userEvent.keyboard("{Enter}");
    expect(await screen.findByRole("heading", { name: "Ticket Queue" })).toBeInTheDocument(); expect(window.location.pathname).toBe("/staff/tickets");
    await screen.findAllByText("Authoritative Staff list record 810");
    const expected = { sortBy: "updatedAt", sortOrder: "desc", ...base, ...predicates, page: "1", pageSize: "10" };
    expect(params(harness.ticketCalls[0]!.url)).toEqual(expected);
    const navigation = screen.getByRole("navigation", { name: "Ticket Queue pagination" }); expect(navigation).toHaveTextContent("11 Tickets");
    // The fresh list total (11) is independent of the older card total.
    await userEvent.click(within(navigation).getByRole("button", { name: "Next" })); await screen.findAllByText("Authoritative Staff list record 800");
    expect(params(harness.ticketCalls[1]!.url)).toEqual({ ...expected, page: "2" }); expect(harness.ticketCalls).toHaveLength(2);
    expect(harness.ticketCalls.every(({ init }) => init?.credentials === "include")).toBe(true);
  });
  it.each([
    { name: "View my actions", target: /view my actions/i, predicates: { actionStatusGroup: "unfinished" } },
    { name: "terminal Completed count", target: /^completed\s+4$/i, predicates: { status: "COMPLETED" } },
  ])("$name maps to assignee=me, retains base filters and My Actions paging", async ({ name, target, predicates }) => {
    const harness = install({ actions: (url) => {
      const page = Number(url.searchParams.get("page") ?? "1");
      const row = assigned(staff, page === 1 ? 0 : 1);
      if (name.startsWith("terminal")) row.action = { ...row.action, status: "COMPLETED", version: 3, result: "Authoritative historical result",
        performedBy: { id: historical.id, name: historical.name }, completedAt: "2026-10-20T08:10:00.000Z", updatedAt: "2026-10-20T08:10:00.000Z" };
      // Contract-valid full pages; exact preview length never supplies totals.
      const items = page === 1 ? Array.from({ length: 10 }, (_, index) => ({ ...row, action: { ...row.action, id: 900 + index, description: `Authoritative assigned result ${index}` } }))
        : [{ ...row, action: { ...row.action, id: 910, description: "Authoritative assigned result 10" } }];
      return jsonResponse({ items, pagination: pagination(11, page) });
    } });
    const root = await ready(`/staff/dashboard?${new URLSearchParams(base)}`); await within(root).findAllByText(literal, { exact: true });
    const scope = name.startsWith("terminal") ? region(root, /(?:my|assigned).*action status|action status.*(?:my|assigned)/i) : root;
    await userEvent.click(within(scope).getByRole("link", { name: target }));
    expect(await screen.findByRole("heading", { name: /^My (?:assigned )?Actions$/i })).toBeInTheDocument(); expect(window.location.pathname).toBe("/staff/actions");
    await screen.findByText("Authoritative assigned result 0");
    const expected = { ...base, assignee: "me", ...predicates, page: "1", pageSize: "10" };
    expect(params(harness.actionCalls[0]!.url)).toEqual(expected);
    const navigation = screen.getByRole("navigation", { name: "My Actions pagination" }); expect(navigation).toHaveTextContent("11 Actions");
    await userEvent.click(within(navigation).getByRole("button", { name: "Next" })); await screen.findByText("Authoritative assigned result 10");
    expect(params(harness.actionCalls[1]!.url)).toEqual({ ...expected, page: "2" }); expect(harness.ticketCalls).toEqual([]);
  });
  it.each(["Ticket", "Action"])("%s preview opens the real authorized detail route", async (kind) => {
    const harness = install(), root = await ready(); await within(root).findAllByText(literal, { exact: true });
    const scope = region(root, kind === "Ticket" ? /recent(?:ly)? updated.*tickets/i : /unfinished.*actions|assigned actions preview/i);
    const links = within(scope).getAllByRole("link").filter((link) => link.getAttribute("href") === (kind === "Ticket" ? "/staff/tickets/505" : "/staff/tickets/505#action-700"));
    expect(links).toHaveLength(1); await userEvent.click(links[0]!);
    expect(await screen.findByRole("heading", { name: detail.ticketNumber })).toBeInTheDocument(); await screen.findByText(detail.description);
    expect(window.location.pathname).toBe("/staff/tickets/505");
    if (kind === "Action") {
      expect(window.location.hash).toBe("#action-700");
      await waitFor(() => expect(document.getElementById("action-700")).not.toBeNull());
      const selected = document.getElementById("action-700")!; await waitFor(() => expect(selected.contains(document.activeElement) || selected === document.activeElement).toBe(true));
    }
    expect(harness.calls.filter(({ url }) => url.pathname === "/api/staff/tickets/505")).toHaveLength(1);
  });
  it("does not turn an unapproved descriptor destination into an actionable external link", async () => {
    const response = dashboard(); response.drillDown.mine = { path: "https://untrusted.example.test/collect", query: { actorId: "72" } };
    const harness = install({ dashboard: () => jsonResponse(response) }); renderAt("/staff/dashboard"); await screen.findByRole("button", { name: "Logout" });
    await screen.findByRole("heading", { name: /^(?:(?:IT )?Staff(?:\/Administrator)? )?Dashboard$/i });
    // A safe whole-response error or an individually unavailable widget are
    // both permitted. Do not prescribe a proposed parser/component structure.
    await waitFor(() => expect(harness.dashboardCalls).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText(/loading.*dashboard/i)).not.toBeInTheDocument());
    expect(screen.queryByRole("link", { name: /my active|mine.*active|active.*mine/i })).not.toBeInTheDocument();
    expect(document.querySelector('a[href^="https://untrusted.example.test/"]')).toBeNull();
    expect(harness.calls.some(({ url }) => url.hostname === "untrusted.example.test")).toBe(false);
  });
});

it("clears pending Staff Dashboard data on logout and ignores its late response", async () => {
  const deferred = controlled(), harness = install({ dashboard: () => deferred.settled }); const root = await ready();
  expect(within(root).getByRole("status")).toHaveTextContent(/loading/i);
  await waitFor(() => expect(harness.dashboardCalls).toHaveLength(1));
  await userEvent.click(screen.getByRole("button", { name: "Logout" }));
  expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  await act(async () => { deferred.resolve(); await deferred.settled; });
  expect(window.location.pathname).toBe("/login"); expect(screen.queryByText(literal, { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByText(staff.name, { exact: true })).not.toBeInTheDocument();
  expect(harness.dashboardCalls[0]!.init?.signal?.aborted).toBe(true);
  expect(harness.calls.filter(({ method }) => method !== "GET").map(({ url }) => url.pathname)).toEqual(["/api/auth/logout"]);
});
