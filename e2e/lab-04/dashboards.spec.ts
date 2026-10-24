import { expect, type Page, type Response } from "@playwright/test";
import type { RequesterDashboardResponse, TicketListResponse } from "../../client/src/api.js";
import { test, loginDashboardActor, type DashboardBrowserFixture } from "./requester-dashboard-browser-fixtures.js";

// Requester contribution to T-23/24/27/28/29/36/48 and AC-01/02/23/24/27/28/29/36/40.
// Real React/Express/PostgreSQL/authentication. Constructed read cohorts do not
// prove workflow transitions; separate HTTP reads use fresh snapshots.
// Landing/global navigation (#53), Staff Dashboard, layout/accessibility remain separate.
const api = "http://127.0.0.1:3100";
const dashboardPath = "/api/dashboard/requester";
const metricLabels = { outstanding: "Outstanding", needsAttention: "Needs attention", recentUpdated: "Recently updated", recentResolved: "Recently resolved" };
const aMetrics = { outstanding: 22, needsAttention: 2, recentUpdated: 28, recentResolved: 6 };
const bMetrics = { outstanding: 2, needsAttention: 1, recentUpdated: 3, recentResolved: 1 };
const zeros = { outstanding: 0, needsAttention: 0, recentUpdated: 0, recentResolved: 0 };
const root = (page: Page) => page.getByRole("region", { name: "Requester Dashboard", exact: true });
const read = (page: Page, path: string) => page.waitForResponse((response) => new URL(response.url()).pathname === path && response.request().method() === "GET");
const parameters = (response: Response) => Object.fromEntries(new URL(response.request().url()).searchParams);
function ticket(f: DashboardBrowserFixture, name: string) {
  const value = f.tickets.get(name);
  if (!value) throw new Error("Expected owned Dashboard fixture is absent.");
  return value;
}
async function dashboard(page: Page, action: () => Promise<unknown> = () => page.goto("/dashboard")) {
  const [response] = await Promise.all([read(page, dashboardPath), action()]);
  expect(response.status()).toBe(200);
  const body = await response.json() as RequesterDashboardResponse;
  await expect(root(page).getByText(/Loading your Dashboard/)).toHaveCount(0);
  await expect(root(page).getByText(/As of/)).toBeVisible();
  return body;
}
async function metrics(page: Page, values: typeof aMetrics) {
  for (const name of Object.keys(metricLabels) as Array<keyof typeof metricLabels>) {
    await expect(root(page).getByRole("link", { name: new RegExp(metricLabels[name], "i") }).getByText(String(values[name]), { exact: true })).toBeVisible();
  }
}
function ownedRows(f: DashboardBrowserFixture, rows: Array<{ id: number }>, requester: "A" | "B") {
  const ids = new Set([...f.tickets].filter(([key]) => key.startsWith(`${requester}-`)).map(([, value]) => value.id));
  expect(rows.every((row) => ids.has(row.id)), "Every observed response row belongs to this authenticated Requester").toBe(true);
}
function safeDashboard(f: DashboardBrowserFixture, body: RequesterDashboardResponse, requester: "A" | "B") {
  expect(Object.keys(body).sort()).toEqual(["asOf", "timezone", "recentWindow", "filters", "metrics", "lists", "drillDown"].sort());
  expect(body.timezone).toBe("Asia/Bangkok");
  expect(body.asOf).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  for (const name of ["recentUpdated", "recentResolved"] as const) {
    expect(body.lists[name].length).toBeLessThanOrEqual(5);
    ownedRows(f, body.lists[name], requester);
    for (const row of body.lists[name]) {
      expect(Object.keys(row).sort()).toEqual(["id", "ticketNumber", "summary", "currentStatus", "requestedPriority", "itPriority", "owner", "updatedAt", ...(name === "recentResolved" ? ["resolvedAt"] : [])].sort());
      if (row.owner) expect(Object.keys(row.owner).sort()).toEqual(["id", "name", "role"]);
    }
  }
  expect(JSON.stringify(body)).not.toMatch(/passwordHash|tokenHash|csrfToken|Internal Note|fingerprint|safeResponse|storageKey/);
}
async function list(page: Page, action: () => Promise<unknown>) {
  const [response] = await Promise.all([read(page, "/api/tickets"), action()]);
  expect(response.status()).toBe(200);
  const body = await response.json() as TicketListResponse;
  await expect(page.getByRole("heading", { name: "My Tickets", exact: true })).toBeVisible();
  await expect(page.getByText(/Loading your Tickets/)).toHaveCount(0);
  return { response, body };
}
async function logout(page: Page) {
  const [response] = await Promise.all([
    page.waitForResponse((value) => new URL(value.url()).pathname === "/api/auth/logout" && value.request().method() === "POST"),
    page.getByRole("button", { name: "Logout", exact: true }).click(),
  ]);
  expect(response.status()).toBe(204);
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
}
function filterQuery(f: DashboardBrowserFixture) {
  return { search: "VPN%_", categoryId: String(f.category.id), relatedSystemId: String(f.system.id), requestedPriority: "HIGH", itPriority: "MEDIUM", currentStatus: "OPEN" };
}

test("Requester Dashboard: real metrics, all four drill-downs, stable ordering, pagination and owned detail", async ({ page, dashboardFixture: f, browser, browserName }) => {
  console.info(`Issue47 browser=${browserName} ${browser.version()}; real browser/API/PostgreSQL; no successful response mocks.`);
  await loginDashboardActor(page, f.a);
  const first = await dashboard(page);
  safeDashboard(f, first, "A"); expect(first.metrics).toEqual(aMetrics); await metrics(page, aMetrics);
  const updatedNames = ["A-open-12", "A-open-11", "A-open-10", "A-open-9", "A-open-8"];
  const resolvedNames = ["A-resolved-6", "A-resolved-5", "A-resolved-4", "A-resolved-3", "A-resolved-2"];
  expect(first.lists.recentUpdated.map((row) => row.id)).toEqual(updatedNames.map((key) => ticket(f, key).id));
  expect(first.lists.recentResolved.map((row) => row.id)).toEqual(resolvedNames.map((key) => ticket(f, key).id));
  await expect(root(page).getByRole("region", { name: "Recently updated Tickets", exact: true }).getByRole("link")).toHaveText(updatedNames.map((key) => ticket(f, key).ticketNumber));
  await expect(root(page).getByRole("region", { name: "Recently resolved Tickets", exact: true }).getByRole("link")).toHaveText(resolvedNames.map((key) => ticket(f, key).ticketNumber));
  await expect(root(page).getByText(ticket(f, "A-open-12").summary, { exact: true })).toBeVisible();
  await expect(root(page).locator("script")).toHaveCount(0);
  await expect(root(page).getByText(/seven calendar days including today/i)).toBeVisible();

  const widgets = [
    { key: "outstanding" as const, total: 22, query: { dashboardWidget: "outstanding", statusGroup: "outstanding" }, names: ["A-open-12", "A-open-11", "A-open-10", "A-open-9", "A-open-8", "A-open-7", "A-open-6", "A-open-5", "A-open-4", "A-open-3"] },
    { key: "needsAttention" as const, total: 2, query: { dashboardWidget: "attention" }, names: ["A-waiting-2", "A-waiting-1"] },
    { key: "recentUpdated" as const, total: 28, query: { dashboardWidget: "recentUpdated", updatedFrom: first.recentWindow.from, updatedBefore: first.recentWindow.before, sortBy: "updatedAt", sortOrder: "desc" }, names: ["A-open-12", "A-open-11", "A-open-10", "A-open-9", "A-open-8", "A-open-7", "A-open-6", "A-open-5", "A-open-4", "A-open-3"] },
    { key: "recentResolved" as const, total: 6, query: { dashboardWidget: "recentResolved", statusGroup: "resolved", resolvedFrom: first.recentWindow.from, resolvedBefore: first.recentWindow.before, sortBy: "resolvedAt", sortOrder: "desc" }, names: ["A-resolved-6", "A-resolved-5", "A-resolved-4", "A-resolved-3", "A-resolved-2", "A-resolved-1"] },
  ];
  for (const widget of widgets) {
    if (widget.key !== "outstanding") await dashboard(page);
    const current = await list(page, () => root(page).getByRole("link", { name: new RegExp(metricLabels[widget.key], "i") }).click());
    expect(parameters(current.response)).toEqual({ sortBy: "updatedAt", sortOrder: "desc", ...widget.query, page: "1", pageSize: "10" });
    expect(current.body.pagination.totalItems).toBe(widget.total);
    expect(current.body.items.map((row) => row.id)).toEqual(widget.names.map((key) => ticket(f, key).id));
    ownedRows(f, current.body.items, "A");
    await expect(page.getByRole("navigation", { name: "My Tickets pagination" })).toContainText(`${widget.total} Tickets`);
    expect(current.body.items.some((row) => row.id === ticket(f, "B-open").id)).toBe(false);
    if (widget.key === "recentResolved") {
      for (const row of current.body.items) expect(row.resolvedAt).toBe(first.lists.recentResolved[0]!.resolvedAt);
      await expect(page.getByRole("columnheader", { name: "Resolved", exact: true })).toBeVisible();
    }
    if (widget.key === "outstanding") {
      const next = await list(page, () => page.getByRole("navigation", { name: "My Tickets pagination" }).getByRole("button", { name: "Next", exact: true }).click());
      expect(parameters(next.response)).toEqual({ sortBy: "updatedAt", sortOrder: "desc", ...widget.query, page: "2", pageSize: "10" });
      expect(next.body.items.map((row) => row.id)).toEqual(["A-open-2", "A-open-1", "A-decoy-search", "A-decoy-it", "A-decoy-requested", "A-decoy-system", "A-decoy-category", "A-waiting-2", "A-waiting-1", "A-progress"].map((key) => ticket(f, key).id));
      ownedRows(f, next.body.items, "A");
      expect(next.body.items.some((row) => current.body.items.some((previous) => previous.id === row.id))).toBe(false);
      const final = await list(page, () => page.getByRole("button", { name: "Next", exact: true }).click());
      expect(final.body.items.map((row) => row.id)).toEqual([ticket(f, "A-reopened").id, ticket(f, "A-new").id]);
      await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
    }
  }
  await dashboard(page);
  const target = ticket(f, "A-open-12");
  const [detail] = await Promise.all([
    read(page, `/api/tickets/${target.id}`),
    root(page).getByRole("region", { name: "Recently updated Tickets", exact: true }).getByRole("link", { name: target.ticketNumber, exact: true }).click(),
  ]);
  expect(detail.status()).toBe(200);
  expect((await detail.json()).requester).toEqual({ id: f.a.id, name: f.a.name });
  await expect(page.getByRole("heading", { name: "Ticket Detail", exact: true })).toBeVisible();
  await expect(page.getByText(target.description, { exact: true })).toBeVisible();
  await expect(page.getByText(ticket(f, "B-open").summary, { exact: true })).toHaveCount(0);
  expect(f.pageErrors).toEqual([]);
});

test("Requester Dashboard: all six filters, URL reload/back, intersections and retained list drafts", async ({ page, dashboardFixture: f }) => {
  await loginDashboardActor(page, f.a);
  await dashboard(page);
  const queries: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname === dashboardPath) queries.push(request.url()); });
  const form = root(page).getByRole("form", { name: "Dashboard filters" });
  await form.getByLabel("Search Tickets", { exact: true }).fill("  VPN%_  ");
  await form.getByLabel("Category", { exact: true }).selectOption(String(f.category.id));
  await form.getByLabel("Related System", { exact: true }).selectOption(String(f.system.id));
  await form.getByLabel("Requested Priority", { exact: true }).selectOption("HIGH");
  await form.getByLabel("IT Priority", { exact: true }).selectOption("MEDIUM");
  await form.getByLabel("Current Status", { exact: true }).selectOption("OPEN");
  expect(queries).toHaveLength(0);
  const filtered = await dashboard(page, () => form.getByRole("button", { name: "Apply Filters", exact: true }).click());
  expect(queries).toHaveLength(1);
  const expected = filterQuery(f);
  expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual(expected);
  expect(Object.fromEntries(new URL(queries[0]!).searchParams)).toEqual(expected);
  expect(new URL(page.url()).search).toContain("search=VPN%25_");
  expect(filtered.metrics).toEqual({ outstanding: 12, needsAttention: 0, recentUpdated: 12, recentResolved: 0 });
  await metrics(page, { outstanding: 12, needsAttention: 0, recentUpdated: 12, recentResolved: 0 });
  const summary = root(page).getByRole("region", { name: "Active filters", exact: true });
  for (const value of ["VPN%_", f.category.name, f.system.name, "High", "Medium", "Open"]) await expect(summary).toContainText(value);
  const reloaded = await dashboard(page, () => page.reload());
  expect(reloaded.metrics).toEqual(filtered.metrics);
  expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual(expected);

  const contradictory = await list(page, () => root(page).getByRole("link", { name: /Needs attention/i }).click());
  expect(parameters(contradictory.response)).toEqual({ ...expected, dashboardWidget: "attention", sortBy: "updatedAt", sortOrder: "desc", page: "1", pageSize: "10" });
  expect(contradictory.body.items).toEqual([]); expect(contradictory.body.pagination.totalItems).toBe(0);
  await expect(page.getByText("No Tickets match the current search and filters.", { exact: true })).toBeVisible();
  await dashboard(page, () => page.goBack());
  expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual(expected);

  await list(page, () => root(page).getByRole("link", { name: /Outstanding/i }).click());
  const idleDraft = "Unsubmitted draft must survive sort and paging";
  await page.getByLabel("Search Tickets", { exact: true }).fill(idleDraft);
  const sorted = await list(page, () => page.getByLabel("Sort Field", { exact: true }).selectOption("ticketNumber"));
  expect(parameters(sorted.response)).toEqual({ ...expected, dashboardWidget: "outstanding", statusGroup: "outstanding", sortBy: "ticketNumber", sortOrder: "desc", page: "1", pageSize: "10" });
  await expect(page.getByLabel("Search Tickets", { exact: true })).toHaveValue(idleDraft);
  await list(page, () => page.getByLabel("Sort Direction", { exact: true }).selectOption("asc"));
  const descending = await list(page, () => page.getByLabel("Sort Direction", { exact: true }).selectOption("desc"));
  const expectedNumbers = Array.from({ length: 12 }, (_, index) => ticket(f, `A-open-${index + 1}`).ticketNumber)
    .sort((left, right) => right.localeCompare(left)).slice(0, 10);
  expect(descending.body.items.map((row) => row.ticketNumber)).toEqual(expectedNumbers);
  await expect(page.getByRole("table", { name: "My Tickets", exact: true }).locator("tbody tr td:first-child a")).toHaveText(expectedNumbers);
  console.info("Issue47 sort diagnostic: real descending response and rendered page match after response readiness; no inherited assertion changed.");
  const next = await list(page, () => page.getByRole("button", { name: "Next", exact: true }).click());
  expect(parameters(next.response)).toEqual({ ...expected, dashboardWidget: "outstanding", statusGroup: "outstanding", sortBy: "ticketNumber", sortOrder: "desc", page: "2", pageSize: "10" });
  await expect(page.getByLabel("Search Tickets", { exact: true })).toHaveValue(idleDraft);
  ownedRows(f, next.body.items, "A");
  await dashboard(page, () => page.goto(`/dashboard?${new URLSearchParams(expected)}`));
  const cleared = await dashboard(page, () => root(page).getByRole("button", { name: "Clear filters", exact: true }).click());
  expect(new URL(page.url()).search).toBe(""); expect(cleared.metrics).toEqual(aMetrics);
  await expect(root(page).getByRole("textbox", { name: "Search Tickets", exact: true })).toHaveValue("");
  for (const name of ["Category", "Related System", "Requested Priority", "IT Priority", "Current Status"]) await expect(root(page).getByLabel(name, { exact: true })).toHaveValue("");
  await dashboard(page, () => page.goBack());
  expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual(expected);
  await metrics(page, { outstanding: 12, needsAttention: 0, recentUpdated: 12, recentResolved: 0 });
  expect(f.pageErrors).toEqual([]);
});

test("Requester Dashboard: real logout/login isolates accounts, owned details and operational-role denials", async ({ page, dashboardFixture: f }) => {
  await loginDashboardActor(page, f.a);
  await dashboard(page);
  await expect(root(page).getByText(ticket(f, "A-open-12").summary, { exact: true })).toBeVisible();
  await logout(page);
  await expect(page.getByText(f.a.name, { exact: true })).toHaveCount(0);
  await loginDashboardActor(page, f.b);
  const b = await dashboard(page);
  safeDashboard(f, b, "B"); expect(b.metrics).toEqual(bMetrics); await metrics(page, bMetrics);
  expect(b.lists.recentUpdated.map((row) => row.id)).toEqual(["B-open", "B-waiting", "B-resolved"].map((key) => ticket(f, key).id));
  await expect(root(page).getByText(ticket(f, "A-open-12").summary, { exact: true })).toHaveCount(0);
  const owned = await list(page, () => root(page).getByRole("link", { name: /Outstanding/i }).click());
  expect(owned.body.pagination.totalItems).toBe(2); ownedRows(f, owned.body.items, "B");
  const [foreign] = await Promise.all([read(page, `/api/tickets/${ticket(f, "A-open-12").id}`), page.goto(`/tickets/${ticket(f, "A-open-12").id}`)]);
  expect(foreign.status()).toBe(404);
  const denied = await foreign.json();
  expect(Object.keys(denied)).toEqual(["error"]); expect(denied.error.code).toBe("TICKET_NOT_FOUND");
  expect(JSON.stringify(denied)).not.toContain(ticket(f, "A-open-12").summary);
  await expect(page.getByText("Ticket not found.", { exact: true })).toBeVisible();
  await expect(page.getByText(ticket(f, "A-open-12").summary, { exact: true })).toHaveCount(0);
  await logout(page);

  for (const actor of [f.staff, f.admin]) {
    await loginDashboardActor(page, actor);
    let dashboardReads = 0;
    const record = (request: import("@playwright/test").Request) => { if (new URL(request.url()).pathname === dashboardPath) dashboardReads++; };
    page.on("request", record);
    try {
      await page.goto("/dashboard");
      await expect(page.getByRole("heading", { name: "Forbidden", exact: true })).toBeVisible();
      await expect(page.getByRole("alert")).toBeVisible();
      expect(dashboardReads).toBe(0);
      const response = await page.request.get(`${api}${dashboardPath}`);
      expect(response.status()).toBe(403);
      const body = await response.json();
      expect(Object.keys(body)).toEqual(["error"]); expect(body.error.code).toBe("ROLE_FORBIDDEN");
      expect(body).not.toHaveProperty("metrics"); expect(body).not.toHaveProperty("lists");
    } finally { page.off("request", record); }
    await logout(page);
  }
  expect(f.pageErrors).toEqual([]);
});

test("Requester Dashboard: genuine empty state and one injected transport failure recover through real reads", async ({ page, dashboardFixture: f }) => {
  await loginDashboardActor(page, f.empty);
  const empty = await dashboard(page);
  expect(empty.metrics).toEqual(zeros); expect(empty.lists).toEqual({ recentUpdated: [], recentResolved: [] });
  await metrics(page, zeros);
  await expect(root(page).getByText("No Tickets in the current Dashboard categories.", { exact: true })).toBeVisible();
  const create = root(page).getByRole("link", { name: "Create Ticket", exact: true });
  await expect(create).toHaveAttribute("href", "/tickets/new");
  await create.click(); await expect(page).toHaveURL(/\/tickets\/new$/);
  await expect(page.getByRole("button", { name: "Create Ticket", exact: true })).toBeVisible();
  await logout(page);
  await loginDashboardActor(page, f.a);
  await dashboard(page); // Settle StrictMode mount reads before the single fault.
  const path = `**${dashboardPath}`;
  let injections = 0;
  const fault = async (route: import("@playwright/test").Route) => { injections++; await route.abort("failed"); };
  await page.route(path, fault, { times: 1 });
  try {
    const failed = page.waitForEvent("requestfailed", (request) => new URL(request.url()).pathname === dashboardPath);
    await root(page).getByRole("button", { name: "Apply Filters", exact: true }).click(); await failed;
    await expect(root(page).getByRole("alert")).toContainText(/unable|try again/i);
    await expect(root(page).getByText("0", { exact: true })).toHaveCount(0);
    await expect(root(page).getByText(/No Tickets/)).toHaveCount(0);
    await expect(root(page).getByText(ticket(f, "A-open-12").summary, { exact: true })).toHaveCount(0);
    expect(injections).toBe(1);
  } finally { await page.unroute(path, fault); }
  const restored = await dashboard(page, () => root(page).getByRole("button", { name: "Retry", exact: true }).click());
  expect(restored.metrics).toEqual(aMetrics); safeDashboard(f, restored, "A"); await metrics(page, aMetrics);
  await expect(root(page).getByRole("alert")).toHaveCount(0);
  await expect(root(page).getByText(ticket(f, "A-open-12").summary, { exact: true })).toBeVisible();
  console.info("Issue47 recovery: exactly one browser transport abort; subsequent successful Dashboard response is the real API, not a simulated backend outage.");
  expect(f.pageErrors).toEqual([]);
});
