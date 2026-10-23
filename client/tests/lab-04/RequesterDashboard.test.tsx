import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TicketDetail, TicketListItem, TicketStatus } from "../../src/api.js";
import {
  authResponse, jsonResponse, renderAt, requesterUser, requestUrl, type SafeUser,
} from "../lab-03/test-helpers.js";

// HTTP simulations only: partial AC-23/T-23, AC-24/T-24, AC-27/T-27,
// AC-28/T-28, AC-29/T-29, AC-01/02 and AC-36/T-36. Role landing/global
// navigation (#53), database snapshots and browser verification are not proved here.
const asOf = "2026-10-23T18:30:00.000Z"; // October 24, 01:30 in Bangkok.
const from = "2026-10-17T17:00:00.000Z";
const before = "2026-10-24T17:00:00.000Z";
const literalSummary = 'VPN%_ <script>alert("literal summary")</script>';
const owner = { id: 81, name: "Assigned support worker", role: "IT_STAFF" as const };
const category = { id: 11, name: "Network" };
const relatedSystem = { id: 21, name: "Campus VPN" };
const baseFilters = {
  search: "VPN%_", categoryId: "11", relatedSystemId: "21",
  requestedPriority: "MEDIUM", itPriority: "HIGH",
};
const allFilters = { ...baseFilters, currentStatus: "OPEN" };
type Filters = {
  search: string; categoryId: number | null; relatedSystemId: number | null;
  requestedPriority: "MEDIUM" | null; itPriority: "HIGH" | null;
  currentStatus: TicketStatus | null;
};
const noFilters: Filters = {
  search: "", categoryId: null, relatedSystemId: null,
  requestedPriority: null, itPriority: null, currentStatus: null,
};
const selectedFilters: Filters = {
  search: "VPN%_", categoryId: 11, relatedSystemId: 21,
  requestedPriority: "MEDIUM", itPriority: "HIGH", currentStatus: "OPEN",
};

function safeRow(id: number, currentStatus: TicketStatus, updatedAt: string, summary: string) {
  return {
    id, ticketNumber: `TKT-2026-${String(id).padStart(5, "0")}`, summary,
    currentStatus, requestedPriority: "MEDIUM" as const, itPriority: "HIGH" as const,
    owner, updatedAt,
  };
}
const updatedRows = [
  safeRow(505, "OPEN", "2026-10-23T18:29:00.000Z", literalSummary),
  safeRow(504, "WAITING_FOR_REQUESTER", "2026-10-23T18:29:00.000Z", "VPN%_ awaiting my answer"),
  safeRow(503, "IN_PROGRESS", "2026-10-23T18:28:00.000Z", "VPN%_ connection repair"),
  safeRow(502, "NEW", "2026-10-23T18:27:00.000Z", "VPN%_ new request"),
  safeRow(501, "REOPENED", "2026-10-23T18:26:00.000Z", "VPN%_ reopened request"),
];
const resolvedRows = [
  { ...safeRow(603, "CLOSED", "2026-10-23T18:25:00.000Z", "VPN%_ resolution newest tie"), resolvedAt: "2026-10-23T18:15:00.000Z" },
  { ...safeRow(602, "RESOLVED", "2026-10-23T18:15:00.000Z", "VPN%_ resolution second tie"), resolvedAt: "2026-10-23T18:15:00.000Z" },
  { ...safeRow(601, "RESOLVED", "2026-10-23T18:00:00.000Z", "VPN%_ resolution third"), resolvedAt: "2026-10-23T18:00:00.000Z" },
  { ...safeRow(600, "CLOSED", "2026-10-23T18:10:00.000Z", "VPN%_ resolution fourth"), resolvedAt: "2026-10-23T17:50:00.000Z" },
  { ...safeRow(599, "RESOLVED", "2026-10-23T17:40:00.000Z", "VPN%_ resolution fifth"), resolvedAt: "2026-10-23T17:40:00.000Z" },
];

function dashboardFixture(filters: Filters = noFilters, empty = false) {
  const base: Record<string, string> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value !== null && value !== "") base[key] = String(value);
  }
  // Fixture construction, not production projection/filter helpers. These are
  // the actual fixed paths and API-08 descriptor predicates, not arbitrary URLs.
  return {
    asOf, timezone: "Asia/Bangkok", recentWindow: { from, before }, filters: { ...filters },
    metrics: empty
      ? { outstanding: 0, needsAttention: 0, recentUpdated: 0, recentResolved: 0 }
      : { outstanding: 7, needsAttention: 2, recentUpdated: 14, recentResolved: 6 },
    lists: { recentUpdated: empty ? [] : updatedRows, recentResolved: empty ? [] : resolvedRows },
    drillDown: {
      outstanding: { path: "/api/tickets", query: { ...base, dashboardWidget: "outstanding", statusGroup: "outstanding" } },
      needsAttention: { path: "/api/tickets", query: { ...base, dashboardWidget: "attention" } },
      recentUpdated: { path: "/api/tickets", query: {
        ...base, dashboardWidget: "recentUpdated", updatedFrom: from, updatedBefore: before, sortBy: "updatedAt", sortOrder: "desc",
      } },
      recentResolved: { path: "/api/tickets", query: {
        ...base, dashboardWidget: "recentResolved", statusGroup: "resolved", resolvedFrom: from, resolvedBefore: before,
        sortBy: "resolvedAt", sortOrder: "desc",
      } },
    },
  };
}

function openFilteredDashboard() {
  const response = dashboardFixture(selectedFilters);
  return {
    ...response,
    metrics: { outstanding: 3, needsAttention: 0, recentUpdated: 3, recentResolved: 0 },
    lists: { recentUpdated: [
      updatedRows[0]!,
      safeRow(508, "OPEN", "2026-10-23T18:10:00.000Z", "VPN%_ filtered second"),
      safeRow(507, "OPEN", "2026-10-23T18:00:00.000Z", "VPN%_ filtered third"),
    ], recentResolved: [] },
  };
}

function ticketRow(id: number, currentStatus: TicketStatus = "OPEN"): TicketListItem {
  return {
    id, ticketNumber: `TKT-2026-${String(id).padStart(5, "0")}`,
    ticketDate: "2026-10-18T02:00:00.000Z", requester: { id: requesterUser.id, name: requesterUser.name },
    category, relatedSystem, requestedPriority: "MEDIUM", itPriority: "HIGH", currentStatus, owner,
    summary: `Authoritative list record ${id}`, createdAt: "2026-10-18T02:00:00.000Z",
    updatedAt: "2026-10-23T18:20:00.000Z",
  };
}
const detail: TicketDetail = {
  ...ticketRow(505), summary: "Authoritative detail loaded after Dashboard navigation",
  description: "The current owned Ticket description comes from its detail endpoint.",
  updatedAt: "2026-10-23T18:29:00.000Z",
  requesterResolutionIndicatedAt: null,
};
function page(items: TicketListItem[], totalItems = items.length, currentPage = 1, pageSize = 10) {
  const totalPages = Math.ceil(totalItems / pageSize);
  return { items, pagination: {
    page: currentPage, pageSize, totalItems, totalPages,
    hasPreviousPage: currentPage > 1, hasNextPage: currentPage < totalPages,
  } };
}

type Call = { url: URL; method: string; init?: RequestInit };
const unexpected: string[] = [];
const pending: Array<{ finish: () => void; settled: Promise<Response> }> = [];
function deferredDashboard() {
  let resolve!: (response: Response) => void;
  const settled = new Promise<Response>((done) => { resolve = done; });
  const request = { settled, finish: () => resolve(jsonResponse(dashboardFixture())) };
  pending.push(request);
  return request;
}
function installFetch(options: {
  user?: SafeUser | null;
  dashboard?: (url: URL, attempt: number) => Response | Promise<Response>;
  tickets?: (url: URL) => Response | Promise<Response>;
} = {}) {
  const user = options.user === undefined ? requesterUser : options.user;
  const calls: Call[] = [], dashboardCalls: Call[] = [], listCalls: Call[] = [];
  document.cookie = "toktickit_csrf=dashboard-ui-csrf; path=/";
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input), method = init?.method ?? "GET";
    const call = { url, method, init };
    calls.push(call);
    if (url.pathname === "/api/auth/me" && method === "GET") return user
      ? jsonResponse(authResponse(user))
      : jsonResponse({ error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication is required." } }, 401);
    if (url.pathname === "/api/auth/logout" && method === "POST") {
      expect(init?.credentials).toBe("include");
      expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe("dashboard-ui-csrf");
      return jsonResponse(null, 204);
    }
    if (method === "GET") {
      if (url.pathname === "/api/dashboard/requester") {
        dashboardCalls.push(call);
        return options.dashboard?.(url, dashboardCalls.length) ?? jsonResponse(dashboardFixture());
      }
      if (url.pathname === "/api/categories") return jsonResponse([category]);
      if (url.pathname === "/api/related-systems") return jsonResponse([relatedSystem]);
      if (url.pathname === "/api/tickets") {
        listCalls.push(call);
        return options.tickets?.(url) ?? jsonResponse(page([]));
      }
      if (url.pathname === "/api/tickets/505") return jsonResponse(detail);
      if (url.pathname === "/api/tickets/505/attachments") return jsonResponse({ items: [] });
      if (["/api/tickets/505/comments", "/api/tickets/505/actions"].includes(url.pathname)) {
        return jsonResponse(page([], 0, 1, 20));
      }
    }
    unexpected.push(`${method} ${url.pathname}`);
    return jsonResponse({ error: { code: "SAFE_FAILURE", message: "Unable to load this resource." } }, 500);
  }));
  return { calls, dashboardCalls, listCalls };
}

async function ready(path = "/dashboard") {
  renderAt(path);
  await screen.findByRole("button", { name: "Logout" });
  const heading = await screen.findByRole("heading", { name: /^(?:Requester )?Dashboard$/i });
  return heading.closest("section") ?? screen.getByRole("main");
}
function metricControl(root: HTMLElement, label: RegExp) {
  const controls = [
    ...within(root).queryAllByRole("link", { name: label }),
    ...within(root).queryAllByRole("button", { name: label }),
  ];
  expect(controls).toHaveLength(1);
  return controls[0]!;
}
function expectMetrics(root: HTMLElement, counts: [number, number, number, number]) {
  [/outstanding/i, /needs attention|waiting for (?:my|your) response/i, /recent(?:ly)? updated/i, /recent(?:ly)? resolved/i]
    .forEach((label, index) => {
      expect(within(metricControl(root, label)).getByText(String(counts[index]), { exact: true })).toBeInTheDocument();
    });
}
function expectNoPrivateReads(harness: ReturnType<typeof installFetch>) {
  expect(harness.calls.filter(({ url }) => /\/api\/(?:staff|admin)\//.test(url.pathname) || /\/notes(?:\/|$)/.test(url.pathname))).toEqual([]);
  expect(harness.calls.every(({ method }) => method === "GET")).toBe(true);
}
function parameters(url: URL) { return Object.fromEntries(url.searchParams); }
async function clearFilters(root: HTMLElement) {
  const controls = [
    ...within(root).queryAllByRole("button", { name: /^clear filters$/i }),
    ...within(root).queryAllByRole("link", { name: /^clear filters$/i }),
  ];
  expect(controls).toHaveLength(1);
  await userEvent.click(controls[0]!);
}

afterEach(async () => {
  cleanup();
  try {
    await act(async () => {
      pending.forEach((request) => request.finish());
      await Promise.all(pending.map((request) => request.settled));
    });
    expect(unexpected).toEqual([]);
  } finally {
    pending.length = 0; unexpected.length = 0;
    vi.unstubAllGlobals(); vi.restoreAllMocks();
    document.cookie = "toktickit_csrf=; max-age=0; path=/";
    window.history.replaceState({}, "", "/");
  }
});

describe("Issue 47 Requester Dashboard UI — partial Dashboard, drill-down and safe-state contracts", () => {
  it("renders four server metrics, bounded ordered safe lists, Bangkok dates and the calendar-window explanation", async () => {
    const harness = installFetch();
    const root = await ready();
    await within(root).findByText(literalSummary, { exact: true });
    expectMetrics(root, [7, 2, 14, 6]);
    const updated = within(root).getByRole("region", { name: /recent(?:ly)? updated/i });
    const resolved = within(root).getByRole("region", { name: /recent(?:ly)? resolved/i });
    expect(within(updated).getAllByRole("link", { name: /TKT-2026-/ }).map((link) => link.textContent)).toEqual([
      "TKT-2026-00505", "TKT-2026-00504", "TKT-2026-00503", "TKT-2026-00502", "TKT-2026-00501",
    ]);
    expect(within(resolved).getAllByRole("link", { name: /TKT-2026-/ }).map((link) => link.textContent)).toEqual([
      "TKT-2026-00603", "TKT-2026-00602", "TKT-2026-00601", "TKT-2026-00600", "TKT-2026-00599",
    ]);
    const serverTime = root.querySelector(`time[datetime="${asOf}"]`);
    expect(serverTime).not.toBeNull();
    expect(serverTime).toHaveTextContent(/24/);
    expect(serverTime).toHaveTextContent(/0?1:30/);
    expect(root).toHaveTextContent(/Asia\/Bangkok/);
    expect(root).toHaveTextContent(/(?:seven|7) calendar days/i);
    expect(root.querySelector("script")).toBeNull();
    expect(within(root).queryByRole("combobox", { name: /requester/i })).not.toBeInTheDocument();
    expect(root).not.toHaveTextContent(/Internal Notes|passwordHash|tokenHash|fingerprint|unassigned total|Staff totals/i);
    expect(harness.dashboardCalls).toHaveLength(1);
    expect(parameters(harness.dashboardCalls[0]!.url)).toEqual({});
    expect(harness.dashboardCalls[0]!.init?.credentials).toBe("include");
    expectNoPrivateReads(harness);
  });

  it("keeps a pending initial read busy without zero/empty flashes, then displays the authoritative response", async () => {
    const controlled = deferredDashboard();
    const harness = installFetch({ dashboard: () => controlled.settled });
    const root = await ready();
    expect(within(root).getByRole("status")).toHaveTextContent(/loading/i);
    expect(within(root).queryByText("0", { exact: true })).not.toBeInTheDocument();
    expect(within(root).queryByText(/no .*tickets|no .*results|no .*matches/i)).not.toBeInTheDocument();
    expect(within(root).queryByText(literalSummary)).not.toBeInTheDocument();
    expect(harness.dashboardCalls).toHaveLength(1);
    await act(async () => { controlled.finish(); await controlled.settled; });
    await within(root).findByText(literalSummary);
    expectMetrics(root, [7, 2, 14, 6]);
    expect(within(root).queryByText(/loading/i)).not.toBeInTheDocument();
  });

  it("shows genuine unfiltered zeros and a page-content Create Ticket action", async () => {
    installFetch({ dashboard: () => jsonResponse(dashboardFixture(noFilters, true)) });
    const root = await ready();
    expect(await within(root).findByText(/no .*tickets|no tickets yet/i)).toBeInTheDocument();
    expectMetrics(root, [0, 0, 0, 0]);
    expect(within(root).getByRole("link", { name: /create (?:a )?ticket/i })).toHaveAttribute("href", "/tickets/new");
    expect(within(root).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(root).queryByRole("link", { name: /TKT-2026-/ })).not.toBeInTheDocument();
  });

  it("distinguishes filtered no-results and Clear filters from an account with no Tickets", async () => {
    installFetch({ dashboard: () => jsonResponse(dashboardFixture(selectedFilters, true)) });
    const root = await ready(`/dashboard?${new URLSearchParams(allFilters)}`);
    expect(await within(root).findByText(/no .*match|no .*results/i)).toBeInTheDocument();
    expectMetrics(root, [0, 0, 0, 0]);
    expect(within(root).queryByText(/no tickets yet|you (?:have|haven't) (?:no|not created)/i)).not.toBeInTheDocument();
    expect(within(root).getByRole("button", { name: /^clear filters$/i })).toBeInTheDocument();
    expect(within(root).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("retries a safe dependency failure without fabricated zeros and uses the successful server data", async () => {
    const harness = installFetch({ dashboard: (_url, attempt) => attempt === 1
      ? jsonResponse({ error: { code: "SERVICE_UNAVAILABLE", message: "Service is temporarily unavailable. Please try again." } }, 503)
      : jsonResponse(dashboardFixture()) });
    const root = await ready();
    expect(await within(root).findByRole("alert")).not.toHaveTextContent(/^\s*$/);
    expect(within(root).queryByText("0", { exact: true })).not.toBeInTheDocument();
    expect(within(root).queryByText(/no .*tickets/i)).not.toBeInTheDocument();
    await userEvent.click(within(root).getByRole("button", { name: /^retry|try again$/i }));
    await within(root).findByText(literalSummary);
    expectMetrics(root, [7, 2, 14, 6]);
    expect(within(root).queryByRole("alert")).not.toBeInTheDocument();
    expect(harness.dashboardCalls).toHaveLength(2);
    expect(parameters(harness.dashboardCalls[1]!.url)).toEqual({});
  });

  it("reports invalid query without silently dropping it or displaying successful metrics", async () => {
    const harness = installFetch({ dashboard: () => jsonResponse({ error: {
      code: "INVALID_QUERY", message: "The query is invalid.", fields: { requesterId: "This query parameter is not supported." },
    } }, 400) });
    const root = await ready("/dashboard?requesterId=999");
    expect(await within(root).findByRole("alert")).toHaveTextContent(/invalid|not supported|not allowed/i);
    expect(new URLSearchParams(window.location.search).get("requesterId")).toBe("999");
    expect(within(root).queryByText(literalSummary)).not.toBeInTheDocument();
    expect(within(root).queryByText("7", { exact: true })).not.toBeInTheDocument();
    const recovery = [
      ...within(root).queryAllByRole("button", { name: /clear|reset|correct|edit filters/i }),
      ...within(root).queryAllByRole("link", { name: /clear|reset|correct|edit filters/i }),
    ];
    expect(recovery.length).toBeGreaterThan(0);
    for (const call of harness.dashboardCalls) expect(parameters(call.url)).toEqual({ requesterId: "999" });
  });

  it("applies all six trimmed base filters together, summarizes them and does not fetch while editing drafts", async () => {
    const harness = installFetch({ dashboard: (url) => jsonResponse(
      url.searchParams.size ? openFilteredDashboard() : dashboardFixture(),
    ) });
    const root = await ready();
    await within(root).findByText(literalSummary);
    const user = userEvent.setup();
    await within(root).findByRole("option", { name: "Network" });
    await user.type(within(root).getByRole("textbox", { name: /search/i }), "  VPN%_  ");
    await user.selectOptions(within(root).getByRole("combobox", { name: /^category$/i }), "11");
    await user.selectOptions(within(root).getByRole("combobox", { name: /^related system$/i }), "21");
    await user.selectOptions(within(root).getByRole("combobox", { name: /^requested priority$/i }), "MEDIUM");
    await user.selectOptions(within(root).getByRole("combobox", { name: /^IT priority$/i }), "HIGH");
    await user.selectOptions(within(root).getByRole("combobox", { name: /^current status$/i }), "OPEN");
    expect(harness.dashboardCalls).toHaveLength(1);
    await user.click(within(root).getByRole("button", { name: /^apply(?: filters)?$/i }));
    await waitFor(() => expect(harness.dashboardCalls).toHaveLength(2));
    expect(parameters(harness.dashboardCalls[1]!.url)).toEqual(allFilters);
    expect(Object.fromEntries(new URLSearchParams(window.location.search))).toEqual(allFilters);
    const summaryLabel = await within(root).findByText(/active filters/i);
    const summary = summaryLabel.closest("section, aside, [role=group]") ?? summaryLabel.parentElement!;
    for (const value of ["VPN%_", "Network", "Campus VPN", "Medium", "High", "Open"]) {
      expect(summary).toHaveTextContent(new RegExp(value, "i"));
    }
    await within(root).findByText(literalSummary);
    expectMetrics(root, [3, 0, 3, 0]);
    expectNoPrivateReads(harness);
  });

  it("clears every base filter and URL context through a new unfiltered authoritative read", async () => {
    const harness = installFetch({ dashboard: (url) => jsonResponse(dashboardFixture(
      url.searchParams.size ? selectedFilters : noFilters, url.searchParams.size > 0,
    )) });
    const root = await ready(`/dashboard?${new URLSearchParams(allFilters)}`);
    await within(root).findByText(/no .*match|no .*results/i);
    expect(parameters(harness.dashboardCalls[0]!.url)).toEqual(allFilters);
    await clearFilters(root);
    await within(root).findByText(literalSummary);
    expect(harness.dashboardCalls).toHaveLength(2);
    expect(parameters(harness.dashboardCalls[1]!.url)).toEqual({});
    expect(window.location.pathname).toBe("/dashboard");
    expect(window.location.search).toBe("");
    expect(within(root).getByRole("textbox", { name: /search/i })).toHaveValue("");
    for (const name of [/^category$/i, /^related system$/i, /^requested priority$/i, /^IT priority$/i, /^current status$/i]) {
      expect(within(root).getByRole("combobox", { name })).toHaveValue("");
    }
    expectMetrics(root, [7, 2, 14, 6]);
  });

  it.each([
    { widget: "outstanding", label: /outstanding/i, status: "OPEN" as const, predicates: { dashboardWidget: "outstanding", statusGroup: "outstanding" } },
    { widget: "needsAttention", label: /needs attention|waiting for (?:my|your) response/i, status: "WAITING_FOR_REQUESTER" as const, predicates: { dashboardWidget: "attention" } },
    { widget: "recentUpdated", label: /recent(?:ly)? updated/i, status: "OPEN" as const, predicates: {
      dashboardWidget: "recentUpdated", updatedFrom: from, updatedBefore: before, sortBy: "updatedAt", sortOrder: "desc",
    } },
    { widget: "recentResolved", label: /recent(?:ly)? resolved/i, status: "RESOLVED" as const, predicates: {
      dashboardWidget: "recentResolved", statusGroup: "resolved", resolvedFrom: from, resolvedBefore: before, sortBy: "resolvedAt", sortOrder: "desc",
    } },
  ])("$widget opens My Tickets and retains descriptor predicates through fresh-total pagination", async ({ widget, label, status, predicates }) => {
    const harness = installFetch({
      dashboard: (url) => jsonResponse(dashboardFixture({ ...selectedFilters, currentStatus: url.searchParams.has("currentStatus") ? "OPEN" : null }, url.searchParams.has("currentStatus"))),
      tickets: (url) => {
        if (url.searchParams.get("currentStatus") === "OPEN" && url.searchParams.get("dashboardWidget") === "attention") {
          return jsonResponse(page([]));
        }
        const currentPage = Number(url.searchParams.get("page") ?? "1");
        const items = currentPage === 1
          ? [710, 709, 708, 707, 706, 705, 704, 703, 702, 701].map((id) => ticketRow(id, status))
          : [ticketRow(700, status)];
        // Eleven fresh matches intentionally differ from every Dashboard metric.
        return jsonResponse(page(widget === "recentResolved"
          ? items.map((row) => ({ ...row, resolvedAt: "2026-10-23T18:00:00.000Z" }))
          : items, 11, currentPage));
      },
    });
    const root = await ready(`/dashboard?${new URLSearchParams(baseFilters)}`);
    await within(root).findByText(literalSummary);
    await userEvent.click(metricControl(root, label));
    expect(await screen.findByRole("heading", { name: "My Tickets" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/tickets");
    await screen.findByText("Authoritative list record 710");
    expect(harness.listCalls).toHaveLength(1);
    const expected = { ...baseFilters, ...predicates, page: "1", pageSize: "10" };
    expect(parameters(harness.listCalls[0]!.url)).toEqual({ sortBy: "updatedAt", sortOrder: "desc", ...expected });
    const pagination = screen.getByRole("navigation", { name: "My Tickets pagination" });
    expect(pagination).toHaveTextContent("11 Tickets");
    expect(screen.getAllByRole("link", { name: /TKT-2026-/ }).map((link) => link.textContent)).toEqual([
      "TKT-2026-00710", "TKT-2026-00709", "TKT-2026-00708", "TKT-2026-00707", "TKT-2026-00706",
      "TKT-2026-00705", "TKT-2026-00704", "TKT-2026-00703", "TKT-2026-00702", "TKT-2026-00701",
    ]);
    await userEvent.click(within(pagination).getByRole("button", { name: "Next" }));
    await screen.findByText("Authoritative list record 700");
    expect(harness.listCalls).toHaveLength(2);
    expect(parameters(harness.listCalls[1]!.url)).toEqual({ sortBy: "updatedAt", sortOrder: "desc", ...expected, page: "2" });
    expect(harness.listCalls.every(({ init }) => init?.credentials === "include")).toBe(true);

    if (widget === "needsAttention") {
      // A separate contradictory, valid intersection within this card case.
      cleanup();
      const contradictory = await ready(`/dashboard?${new URLSearchParams(allFilters)}`);
      await within(contradictory).findByText(/no .*match|no .*results/i);
      await userEvent.click(metricControl(contradictory, label));
      await screen.findByRole("heading", { name: "My Tickets" });
      expect(await screen.findByText(/no .*match|no .*results/i)).toBeInTheDocument();
      expect(parameters(harness.listCalls[2]!.url)).toEqual({
        ...allFilters, dashboardWidget: "attention", sortBy: "updatedAt", sortOrder: "desc", page: "1", pageSize: "10",
      });
      expect(screen.queryByText("Authoritative list record 710")).not.toBeInTheDocument();
    }
    expectNoPrivateReads(harness);
  });

  it("opens an owned recent Ticket through its existing detail route and authoritative detail read", async () => {
    const harness = installFetch();
    const root = await ready();
    const updated = within(root).getByRole("region", { name: /recent(?:ly)? updated/i });
    await userEvent.click(await within(updated).findByRole("link", { name: "TKT-2026-00505" }));
    expect(await screen.findByRole("heading", { name: "Ticket Detail" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/tickets/505");
    expect(await screen.findByText(detail.description)).toBeInTheDocument();
    expect(screen.getByText(detail.summary)).toBeInTheDocument();
    expect(harness.calls.filter(({ url }) => url.pathname === "/api/tickets/505")).toHaveLength(1);
    expectNoPrivateReads(harness);
  });

  it("removes protected state on logout and ignores a late pending Dashboard response", async () => {
    const controlled = deferredDashboard();
    const harness = installFetch({ dashboard: () => controlled.settled });
    const root = await ready();
    expect(within(root).getByRole("status")).toHaveTextContent(/loading/i);
    expect(harness.dashboardCalls).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Logout" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    await act(async () => { controlled.finish(); await controlled.settled; });
    expect(window.location.pathname).toBe("/login");
    expect(screen.queryByText(literalSummary)).not.toBeInTheDocument();
    expect(screen.queryByText(requesterUser.name)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^(?:Requester )?Dashboard$/i })).not.toBeInTheDocument();
    expect(harness.dashboardCalls).toHaveLength(1);
    expect(harness.calls.filter(({ method }) => method !== "GET").map(({ url }) => url.pathname)).toEqual(["/api/auth/logout"]);
  });

  it("sends unauthenticated direct access to Login without Dashboard business reads", async () => {
    const harness = installFetch({ user: null });
    renderAt("/dashboard");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/login");
    expect(harness.calls.map(({ url }) => url.pathname)).toEqual(["/api/auth/me"]);
    expect(harness.dashboardCalls).toEqual([]);
  });

  it("requires mandatory password change before Dashboard content or business reads", async () => {
    const harness = installFetch({ user: { ...requesterUser, mustChangePassword: true } });
    renderAt("/dashboard");
    expect(await screen.findByRole("heading", { name: "Create a new password" })).toBeInTheDocument();
    expect(screen.queryByText(literalSummary)).not.toBeInTheDocument();
    expect(harness.calls.map(({ url }) => url.pathname)).toEqual(["/api/auth/me"]);
    expect(harness.dashboardCalls).toEqual([]);
  });

  it.each(["IT_STAFF", "ADMINISTRATOR"] as const)("%s receives accessible Forbidden without Requester Dashboard reads", async (role) => {
    const harness = installFetch({ user: { ...requesterUser, id: 82, name: `Operational ${role}`, role } });
    renderAt("/dashboard");
    await screen.findByRole("button", { name: "Logout" });
    expect(await screen.findByRole("heading", { name: "Forbidden" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).not.toHaveTextContent(/^\s*$/);
    expect(screen.queryByText(literalSummary)).not.toBeInTheDocument();
    expect(harness.calls.map(({ url }) => url.pathname)).toEqual(["/api/auth/me"]);
    expect(harness.dashboardCalls).toEqual([]);
  });
});
