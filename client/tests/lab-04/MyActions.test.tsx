import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActionDTO, StaffTicketDetail } from "../../src/api.js";
import { authResponse, jsonResponse, renderAt, requesterUser, requestUrl, type SafeUser } from "../lab-03/test-helpers.js";

// Partial AC-01/03/36/44, T-35/36/54. Dashboard widgets/equivalence remain #47/#48;
// these fixtures verify the known return URL only, not Dashboard implementation.
const staff: SafeUser = { id: 71, name: "Assigned Support Worker", email: "assigned.staff@example.test", role: "IT_STAFF", mustChangePassword: false };
const administrator: SafeUser = { ...staff, id: 72, name: "Assigned Administrator", role: "ADMINISTRATOR" };
const literalDescription = 'Investigate 😀 <script>window.myActionExecuted=true</script>';
const literalSummary = 'VPN <a href="https://untrusted.example.test/">literal support summary</a>';
type AssignedRow = {
  ticket: { id: number; ticketNumber: string; summary: string; currentStatus: StaffTicketDetail["currentStatus"] };
  action: ActionDTO;
};

function assignedRow(user = staff, id = 605, description = literalDescription): AssignedRow {
  return {
    ticket: { id: 501, ticketNumber: "TKT-2026-00501", summary: literalSummary, currentStatus: "WAITING_FOR_REQUESTER" },
    action: {
      id, ticketId: 501, actionAt: "2026-10-09T09:00:00.000Z", description,
      result: null, createdBy: { id: 173, name: "Independent Action Creator" },
      assignee: { id: user.id, name: user.name }, performedBy: null, status: "IN_PROGRESS",
      followUpRequired: true, followUpNote: "Arrange another diagnostic session",
      attachmentNotes: '<script>window.myAttachmentNoteExecuted=true</script>', cancellationReason: null,
      createdAt: "2026-10-09T09:00:00.000Z", updatedAt: "2026-10-09T09:05:00.000Z",
      completedAt: null, cancelledAt: null, version: 2,
    },
  };
}

function envelope(items: AssignedRow[], page = 1, pageSize = 10, totalItems = items.length) {
  const totalPages = Math.ceil(totalItems / pageSize);
  return { items, pagination: { page, pageSize, totalItems, totalPages,
    hasPreviousPage: totalItems > 0 && page > 1, hasNextPage: totalItems > 0 && page < totalPages } };
}
function ticketDetail(row: AssignedRow): StaffTicketDetail {
  return {
    ...row.ticket, ticketDate: "2026-10-09T08:00:00.000Z",
    requester: { id: 41, name: "Ticket Requester", email: "ticket.requester@example.test" },
    category: { id: 1, name: "Network" }, relatedSystem: { id: 2, name: "VPN" },
    requestedPriority: "MEDIUM", itPriority: "HIGH", owner: { id: 174, name: "Distinct Ticket Owner", role: "IT_STAFF" },
    description: "Ticket detail for the selected assigned Action", requesterResolutionIndicatedAt: null,
    createdAt: "2026-10-09T08:00:00.000Z", updatedAt: "2026-10-09T09:30:00.000Z",
    allowedStatusTransitions: ["IN_PROGRESS", "RESOLVED", "CANCELLED"], statusHistory: [],
  };
}

const pending: Array<{ finish: () => void; settled: Promise<Response> }> = [];
const unexpected: string[] = [];
function controlledRows(row: AssignedRow) {
  let resolve!: (response: Response) => void;
  const settled = new Promise<Response>((finish) => { resolve = finish; });
  const finish = () => resolve(jsonResponse(envelope([row])));
  pending.push({ finish, settled });
  return { finish, settled };
}

function installFetch(options: {
  user?: SafeUser | null;
  response?: (url: URL, attempt: number) => Promise<Response>;
  detailOffFirstPage?: boolean;
} = {}) {
  const user = options.user === undefined ? staff : options.user;
  const row = assignedRow(user ?? staff);
  const calls: Array<{ url: URL; method: string; init?: RequestInit }> = [];
  const assignedCalls: Array<{ url: URL; init?: RequestInit }> = [];
  const detailCalls: URL[] = [];
  const initialActions = options.detailOffFirstPage ? Array.from({ length: 20 }, (_, index) => ({
    ...assignedRow({ ...staff, id: 179, name: "Other Assigned Worker" }, 401 + index, `Earlier Ticket Action ${index + 1}`).action,
    actionAt: new Date(Date.parse("2026-10-09T08:10:00.000Z") + index * 1000).toISOString(),
    createdAt: new Date(Date.parse("2026-10-09T08:10:00.000Z") + index * 1000).toISOString(),
    updatedAt: "2026-10-09T08:20:00.000Z",
  })) : [row.action];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input), method = init?.method ?? "GET";
    calls.push({ url, method, init });
    if (method !== "GET") {
      unexpected.push(`${method} ${url.pathname}`);
      return jsonResponse({ error: { code: "ROLE_FORBIDDEN", message: "Operation not permitted." } }, 403);
    }
    if (url.pathname === "/api/auth/me") return user ? jsonResponse(authResponse(user)) :
      jsonResponse({ error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication is required." } }, 401);
    if (url.pathname.startsWith("/api/staff/") && (!user || user.role === "REQUESTER" || user.mustChangePassword)) {
      assignedCalls.push({ url, init });
      return jsonResponse({ error: { code: user?.mustChangePassword ? "PASSWORD_CHANGE_REQUIRED" : "ROLE_FORBIDDEN", message: "Operation not permitted." } }, 403);
    }
    if (url.pathname === "/api/staff/actions") {
      assignedCalls.push({ url, init });
      return options.response?.(url, assignedCalls.length) ?? jsonResponse(envelope([row]));
    }
    if (url.pathname === "/api/categories") return jsonResponse([{ id: 1, name: "Network" }]);
    if (url.pathname === "/api/related-systems") return jsonResponse([{ id: 2, name: "VPN" }]);
    if (url.pathname === "/api/staff/assignees") return jsonResponse({ items: [
      { id: 71, name: staff.name, role: "IT_STAFF" }, { id: 72, name: administrator.name, role: "ADMINISTRATOR" },
      { id: 174, name: "Distinct Ticket Owner", role: "IT_STAFF" },
    ] });
    if (url.pathname === "/api/staff/tickets/501") return jsonResponse(ticketDetail(row));
    if (url.pathname === "/api/tickets/501/actions/605") {
      detailCalls.push(url);
      return jsonResponse({ action: row.action, ticketUpdatedAt: ticketDetail(row).updatedAt });
    }
    if (url.pathname === "/api/tickets/501/actions") {
      const totalItems = options.detailOffFirstPage ? 21 : 1;
      return jsonResponse({ items: initialActions, pagination: { page: 1, pageSize: 20, totalItems,
        totalPages: options.detailOffFirstPage ? 2 : 1, hasPreviousPage: false, hasNextPage: Boolean(options.detailOffFirstPage) } });
    }
    if (url.pathname === "/api/tickets/501/attachments") return jsonResponse({ items: [] });
    if (["/api/tickets/501/comments", "/api/staff/tickets/501/notes"].includes(url.pathname)) return jsonResponse({
      items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false },
    });
    unexpected.push(`${method} ${url.pathname}`);
    return jsonResponse({ error: { code: "SAFE_FAILURE", message: "Unable to load this resource." } }, 500);
  }));
  return { calls, assignedCalls, detailCalls, row };
}

async function authenticatedAt(path: string) {
  renderAt(path);
  await screen.findByRole("button", { name: "Logout" });
  return screen.getByRole("main");
}
async function ready(path = "/staff/actions") {
  const main = await authenticatedAt(path);
  expect(within(main).getByRole("heading", { name: /^My (?:assigned )?Actions$/i })).toBeInTheDocument();
  return main;
}
function record(main: HTMLElement, description: string): HTMLElement {
  const text = within(main).getAllByText(description, { exact: true })[0]!;
  const result = text.closest("tr, li, article, [role=row], [role=listitem], [role=group]");
  expect(result).not.toBeNull();
  return result as HTMLElement;
}
function parameters(url: URL) { return Object.fromEntries(url.searchParams); }
function assertReadOnly(harness: ReturnType<typeof installFetch>) {
  expect(harness.calls.every(({ method }) => method === "GET")).toBe(true);
  expect(harness.calls.filter(({ url }) => url.pathname === "/api/staff/tickets" || /^\/api\/tickets\/\d+\/actions/.test(url.pathname))).toEqual([]);
}

afterEach(async () => {
  cleanup();
  try {
    await act(async () => { for (const request of pending) request.finish(); await Promise.all(pending.map((request) => request.settled)); });
    expect(unexpected).toEqual([]);
  } finally {
    pending.length = 0; unexpected.length = 0;
    vi.unstubAllGlobals(); vi.restoreAllMocks();
    document.cookie = "toktickit_csrf=; max-age=0; path=/";
    window.history.replaceState({}, "", "/");
  }
});

describe("Issue 45 My assigned Actions — partial AC-01/03/36/44, T-35/36/54", () => {
  it.each([staff, administrator])("$role reads actor-assigned safe Action/Ticket rows with 1/10 defaults and literal text", async (user) => {
    const harness = installFetch({ user });
    const main = await ready();
    await within(main).findAllByText(literalDescription);
    const item = record(main, literalDescription);
    expect(within(item).getByText(literalSummary)).toBeInTheDocument();
    expect(within(item).getByText("TKT-2026-00501")).toBeInTheDocument();
    expect(within(item).getByText(user.name)).toBeInTheDocument();
    expect(within(item).getByText(/^in progress$/i)).toBeInTheDocument();
    expect(within(item).getByText(/^waiting for requester$/i)).toBeInTheDocument();
    expect(item.querySelector("script, [onclick], [onerror], a[href='https://untrusted.example.test/']")).toBeNull();
    expect(main).not.toHaveTextContent(/passwordHash|tokenHash|fingerprint|safeResponse|storageKey|Internal Notes/);
    expect(harness.assignedCalls).toHaveLength(1);
    expect(parameters(harness.assignedCalls[0]!.url)).toEqual({ assignee: "me", page: "1", pageSize: "10" });
    expect(harness.assignedCalls[0]!.init?.credentials).toBe("include");
    assertReadOnly(harness);
  });

  it("Requester receives accessible Forbidden without any Staff Actions or privileged lookups", async () => {
    const harness = installFetch({ user: requesterUser });
    const main = await authenticatedAt("/staff/actions");
    expect(within(main).getByRole("heading", { name: "Forbidden" })).toBeInTheDocument();
    expect(harness.calls.filter(({ url }) => url.pathname.startsWith("/api/staff/") || url.pathname.startsWith("/api/admin/"))).toEqual([]);
    expect(within(main).queryByText(literalDescription)).not.toBeInTheDocument();
  });
  it("signed-out access reaches Login without protected requests", async () => {
    const harness = installFetch({ user: null });
    renderAt("/staff/actions");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/login");
    expect(harness.assignedCalls).toEqual([]);
  });
  it("mandatory password change gates the route before Staff Actions reads", async () => {
    const harness = installFetch({ user: { ...staff, mustChangePassword: true } });
    renderAt("/staff/actions");
    expect(await screen.findByRole("heading", { name: "Create a new password" })).toBeInTheDocument();
    expect(screen.queryByText(literalDescription)).not.toBeInTheDocument();
    expect(harness.assignedCalls).toEqual([]);
  });

  it("pending data has accessible loading without empty/no-results flash, then renders the server row", async () => {
    const controlled = controlledRows(assignedRow());
    installFetch({ response: () => controlled.settled });
    const main = await ready();
    expect(within(main).getByRole("status")).toHaveTextContent(/loading/i);
    expect(within(main).queryByText(/no .*actions|no .*results|no .*matches/i)).not.toBeInTheDocument();
    expect(within(main).queryByText(literalDescription)).not.toBeInTheDocument();
    await act(async () => { controlled.finish(); await controlled.settled; });
    expect((await within(main).findAllByText(literalDescription)).length).toBeGreaterThan(0);
    expect(within(main).queryByText(/loading/i)).not.toBeInTheDocument();
  });
  it("genuine empty assignments are not a dependency failure or filtered no-results", async () => {
    installFetch({ response: async () => jsonResponse(envelope([])) });
    const main = await ready();
    expect(await within(main).findByText(/no .*actions.*assigned to you|no assigned actions/i)).toBeInTheDocument();
    expect(within(main).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(main).queryByText(/loading|no .*match|no .*results/i)).not.toBeInTheDocument();
  });
  it("contradictory Action status/group yields a genuine filtered no-results state with both predicates retained", async () => {
    const harness = installFetch({ response: async () => jsonResponse(envelope([])) });
    const main = await ready("/staff/actions?status=COMPLETED&actionStatusGroup=unfinished&owner=me");
    expect(await within(main).findByText(/no .*match|no .*results/i)).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: /^clear filters$/i })).toBeInTheDocument();
    expect(within(main).queryByRole("alert")).not.toBeInTheDocument();
    expect(parameters(harness.assignedCalls[0]!.url)).toEqual({ status: "COMPLETED", actionStatusGroup: "unfinished", owner: "me", assignee: "me", page: "1", pageSize: "10" });
  });
  it("safe dependency failure offers Retry without fake empty data and renders the authoritative retry", async () => {
    const harness = installFetch({ response: async (_url, attempt) => attempt === 1 ? jsonResponse({ error: {
      code: "SERVICE_UNAVAILABLE", message: "Service is temporarily unavailable. Please try again.",
    } }, 503) : jsonResponse(envelope([assignedRow()])) });
    const main = await ready();
    expect(await within(main).findByRole("alert")).not.toHaveTextContent(/^\s*$/);
    expect(within(main).queryByText(/no .*actions|no .*results/i)).not.toBeInTheDocument();
    await userEvent.click(within(main).getByRole("button", { name: /^retry|try again$/i }));
    await within(main).findAllByText(literalDescription);
    expect(within(main).queryByRole("alert")).not.toBeInTheDocument();
    expect(harness.assignedCalls).toHaveLength(2);
    expect(parameters(harness.assignedCalls[1]!.url)).toEqual(parameters(harness.assignedCalls[0]!.url));
  });

  it("preserves every approved URL predicate, keeping Action status distinct from parent Ticket currentStatus", async () => {
    const filters = { assignee: "me", status: "IN_PROGRESS", actionStatusGroup: "unfinished", search: "VPN%_", categoryId: "1", relatedSystemId: "2",
      requestedPriority: "MEDIUM", itPriority: "HIGH", currentStatus: "WAITING_FOR_REQUESTER", owner: "174", statusGroup: "outstanding",
      updatedFrom: "2026-10-09T00:00:00.000Z", updatedBefore: "2026-10-10T00:00:00.000Z",
      resolvedFrom: "2026-10-08T00:00:00.000Z", resolvedBefore: "2026-10-09T00:00:00.000Z", page: "2", pageSize: "25" };
    // Current WAITING_FOR_REQUESTER plus resolvedWindow legitimately has no matches; do not fabricate a qualifying Ticket.
    const harness = installFetch({ response: async (url) => jsonResponse(envelope([], Number(url.searchParams.get("page")), 25)) });
    const main = await ready(`/staff/actions?${new URLSearchParams(filters)}`);
    await within(main).findByText(/no .*match|no .*results/i);
    expect(parameters(harness.assignedCalls[0]!.url)).toEqual(filters);
    for (const call of harness.assignedCalls) {
      const { page: _page, ...actual } = parameters(call.url);
      const { page: _originalPage, ...expected } = filters;
      expect(actual).toEqual(expected);
    }
    assertReadOnly(harness);
  });

  it.each([
    ["unknown", "dashboardWidget=mine"], ["repeated", "status=PLANNED&status=IN_PROGRESS"],
    ["another assignee", "assignee=71"], ["Ticket enum used as Action enum", "status=OPEN"],
    ["unsupported size", "pageSize=20"], ["invalid page", "page=0"],
    ["unpaired date", "updatedFrom=2026-10-09T00%3A00%3A00.000Z"],
    ["reversed dates", "resolvedFrom=2026-10-10T00%3A00%3A00.000Z&resolvedBefore=2026-10-09T00%3A00%3A00.000Z"],
    ["external return destination", "returnTo=https%3A%2F%2Funtrusted.example.test%2F"],
  ])("rejects %s URL parameters visibly without silently fetching a modified query", async (_kind, query) => {
    const harness = installFetch();
    const main = await authenticatedAt(`/staff/actions?${query}`);
    expect(within(main).getByRole("alert")).toHaveTextContent(/invalid|query|filter|not supported|provided once/i);
    expect(harness.assignedCalls).toEqual([]);
    expect(within(main).queryByText(literalDescription)).not.toBeInTheDocument();
    expect(main.querySelector('a[href^="https://untrusted.example.test/"]')).toBeNull();
  });

  it("accessible filters reset paging; 10/25/50 choices preserve server order, ties and authoritative totals", async () => {
    const rows = Array.from({ length: 32 }, (_, index) => assignedRow(staff, 700 + index, `Ordered assigned Action ${index + 1}`));
    rows.forEach((row, index) => { row.ticket.summary = "VPN%_ paging fixture summary"; row.action.createdAt = row.action.actionAt = new Date(Date.parse("2026-10-09T09:00:00.000Z") + Math.floor(index / 2) * 1000).toISOString(); row.action.updatedAt = "2026-10-09T09:05:00.000Z"; });
    const harness = installFetch({ response: async (url) => {
      const page = Number(url.searchParams.get("page")), size = Number(url.searchParams.get("pageSize"));
      return jsonResponse(envelope(rows.slice((page - 1) * size, page * size), page, size, 32));
    } });
    const main = await ready();
    await within(main).findAllByText("Ordered assigned Action 10");
    const first = record(main, "Ordered assigned Action 1"), second = record(main, "Ordered assigned Action 2");
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(main).toHaveTextContent(/32/);
    const pagination = within(main).getByRole("navigation", { name: /(?:assigned actions|my actions|actions) pagination/i });
    const size = within(main).getByRole("combobox", { name: /page size|actions per page/i });
    expect(size).toHaveValue("10");
    expect(within(size).getAllByRole("option").map((option) => option.getAttribute("value"))).toEqual(["10", "25", "50"]);
    await userEvent.click(within(pagination).getByRole("button", { name: /^next$/i }));
    await within(main).findAllByText("Ordered assigned Action 20");
    expect(within(main).queryByText("Ordered assigned Action 1", { exact: true })).not.toBeInTheDocument();
    await userEvent.selectOptions(within(main).getByRole("combobox", { name: /page size|actions per page/i }), "25");
    await within(main).findAllByText("Ordered assigned Action 25");
    expect(parameters(harness.assignedCalls.at(-1)!.url)).toEqual({ assignee: "me", page: "1", pageSize: "25" });
    await userEvent.click(within(main).getByRole("button", { name: /^next$/i }));
    await within(main).findAllByText("Ordered assigned Action 32");
    expect(harness.assignedCalls.at(-1)!.url.searchParams.get("page")).toBe("2");
    await userEvent.selectOptions(within(main).getByRole("combobox", { name: /^action status$/i }), "IN_PROGRESS");
    await userEvent.type(within(main).getByRole("textbox", { name: /search/i }), "  VPN%_  ");
    await userEvent.click(within(main).getByRole("button", { name: /^apply filters$/i }));
    await waitFor(() => expect(harness.assignedCalls.at(-1)!.url.searchParams.get("search")).toBe("VPN%_"));
    expect(parameters(harness.assignedCalls.at(-1)!.url)).toEqual({ assignee: "me", page: "1", pageSize: "25", status: "IN_PROGRESS", search: "VPN%_" });
    expect(window.location.search).toContain("status=IN_PROGRESS");
    await within(main).findAllByText("Ordered assigned Action 25");
    await userEvent.selectOptions(within(main).getByRole("combobox", { name: /page size|actions per page/i }), "50");
    await within(main).findAllByText("Ordered assigned Action 32");
    expect(parameters(harness.assignedCalls.at(-1)!.url)).toEqual({ assignee: "me", page: "1", pageSize: "50", status: "IN_PROGRESS", search: "VPN%_" });
    expect(within(main).getByRole("button", { name: /^next$/i })).toBeDisabled();
    assertReadOnly(harness);
  });

  it.each([false, true])("corrects page 9 to a bounded authoritative page without a loop (zero results=%s)", async (empty) => {
    const harness = installFetch({ response: async (url) => {
      const page = Number(url.searchParams.get("page"));
      return jsonResponse(envelope(!empty && page === 2 ? [assignedRow()] : [], page, 10, empty ? 0 : 11));
    } });
    const main = await ready("/staff/actions?page=9");
    if (empty) await within(main).findByText(/no .*actions.*assigned to you|no assigned actions/i);
    else await within(main).findAllByText(literalDescription);
    const lastPage = empty ? "1" : "2";
    expect(harness.assignedCalls.map(({ url }) => url.searchParams.get("page"))).toEqual(["9", lastPage]);
    expect(new URLSearchParams(window.location.search).get("page")).toBe(lastPage);
    expect(within(main).getByRole("button", { name: /^next$/i })).toBeDisabled();
    assertReadOnly(harness);
  });

  it.each([false, true])("opens and focuses the hash-selected Action on authorized Ticket detail (off initial page=%s)", async (offPage) => {
    const harness = installFetch({ detailOffFirstPage: offPage });
    const main = await ready();
    await within(main).findAllByText(literalDescription);
    const item = record(main, literalDescription);
    const link = within(item).getAllByRole("link").find((candidate) => candidate.getAttribute("href") === "/staff/tickets/501#action-605");
    expect(link).toBeInTheDocument(); expect(link).toHaveAccessibleName();
    await userEvent.click(link!);
    expect(await screen.findByRole("heading", { name: "TKT-2026-00501" })).toBeInTheDocument();
    const actions = await screen.findByRole("region", { name: "Actions Taken" });
    await within(actions).findAllByText(literalDescription);
    const selected = document.getElementById("action-605");
    expect(selected).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement === selected || selected!.contains(document.activeElement)).toBe(true));
    expect(window.location.hash).toBe("#action-605");
    if (offPage) expect(harness.detailCalls.map((url) => url.pathname)).toEqual(["/api/tickets/501/actions/605"]);
    expect(within(actions).queryByText("Independent Action Creator (Ticket Owner)")).not.toBeInTheDocument();
    expect(harness.calls.every(({ method }) => method === "GET")).toBe(true);
  });

  it("Back to Dashboard reconstructs only the seven shared base filters; Dashboard rendering remains #47/#48", async () => {
    const base = { search: "VPN%_", categoryId: "1", relatedSystemId: "2", requestedPriority: "MEDIUM", itPriority: "HIGH", currentStatus: "WAITING_FOR_REQUESTER", owner: "me" };
    const query = new URLSearchParams({ ...base, status: "IN_PROGRESS", actionStatusGroup: "unfinished", statusGroup: "outstanding", page: "2", pageSize: "25",
      updatedFrom: "2026-10-09T00:00:00.000Z", updatedBefore: "2026-10-10T00:00:00.000Z", resolvedFrom: "2026-10-08T00:00:00.000Z", resolvedBefore: "2026-10-09T00:00:00.000Z" });
    installFetch({ response: async (url) => jsonResponse(envelope([], Number(url.searchParams.get("page")), 25)) });
    const main = await ready(`/staff/actions?${query}`);
    await within(main).findByText(/no .*match|no .*results/i);
    const link = within(main).getByRole("link", { name: /^back to dashboard$/i });
    const destination = new URL(link.getAttribute("href")!, window.location.origin);
    expect(destination.origin).toBe(window.location.origin);
    expect(destination.pathname).toBe("/staff/dashboard");
    expect(parameters(destination)).toEqual(base);
    expect(destination.hash).toBe("");
    // Intentionally do not click: no Dashboard screen or metric fixture is fabricated here.
  });
});
