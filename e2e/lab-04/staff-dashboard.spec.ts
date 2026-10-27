import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, type Response } from "@playwright/test";
import type { StaffDashboardResponse, StaffQueueResponse, StaffActionResponse } from "../../client/src/api.js";
import { test, login, type StaffBrowserFixture } from "./staff-dashboard-browser-fixtures.js";
import { geometry, keyboardFocus, reachable, viewports } from "./action-layout-helpers.js";

// Partial AC-01/02/24/25/26/27/28/29/35/36/37/38/40/44;
// T-01/02/24/25/26/27/28/29/35/36/37/38/48/54.
// Real browser/auth/React/Express/PostgreSQL. No successful response fabrication.
// #53 owns role landing/global active navigation; constructed histories are read fixtures.
const endpoint = "/api/dashboard/staff", directory = join(process.cwd(), "artifacts/lab-04/screenshots/staff-dashboard");
const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const root = (page: Page) => page.getByRole("region", { name: "Staff Dashboard", exact: true });
const query = (response: Response) => Object.fromEntries(new URL(response.request().url()).searchParams);
const read = (page: Page, path: string) => page.waitForResponse((response) => new URL(response.url()).pathname === path && response.request().method() === "GET");
const path = (f: StaffBrowserFixture) => `/staff/dashboard?categoryId=${f.category.id}`;
const t = (f: StaffBrowserFixture, name: string) => f.tickets.get(name)!;
const a = (f: StaffBrowserFixture, name: string) => f.actions.get(name)!;
const global = { unassigned: 3, byStatus: { NEW: 1, OPEN: 12, IN_PROGRESS: 1, WAITING_FOR_REQUESTER: 1, REOPENED: 1, RESOLVED: 2, CLOSED: 1, CANCELLED: 1 },
  byItPriority: { LOW: 2, MEDIUM: 13, HIGH: 2, URGENT: 1 }, recentUpdated: 17, recentResolved: 1 };
async function dashboard(page: Page, action: () => Promise<unknown>) {
  const [response] = await Promise.all([read(page, endpoint), action()]);
  expect(response.status()).toBe(200); expect(response.headers()["cache-control"]).toBe("private, no-store");
  const body = await response.json() as StaffDashboardResponse;
  await expect(root(page).getByText(/Loading Staff Dashboard/)).toHaveCount(0);
  await expect(root(page).getByText(/As of/)).toBeVisible();
  return body;
}
async function metric(page: Page, name: RegExp, value: number) {
  const link = root(page).getByRole("link", { name });
  await expect(link.getByText(String(value), { exact: true })).toBeVisible();
  return link;
}
async function queue(page: Page, action: () => Promise<unknown>) {
  const [response] = await Promise.all([read(page, "/api/staff/tickets"), action()]); expect(response.status()).toBe(200);
  const body = await response.json() as StaffQueueResponse;
  await expect(page.getByRole("heading", { name: "Ticket Queue", exact: true })).toBeVisible();
  await expect(page.getByText("Loading Ticket Queue…", { exact: true })).toHaveCount(0);
  const table = page.getByRole("table", { name: "Ticket Queue", exact: true });
  const numbers = await table.isVisible() ? table.locator("tbody tr td:first-child a") : page.getByRole("article").getByRole("link").filter({ hasText: /^E48-/ });
  await expect(numbers).toHaveText(body.items.map(item => item.ticketNumber));
  return { body, response };
}
async function assigned(page: Page, action: () => Promise<unknown>) {
  const [response] = await Promise.all([read(page, "/api/staff/actions"), action()]); expect(response.status()).toBe(200);
  const body = await response.json() as StaffActionResponse;
  await expect(page.getByRole("heading", { name: "My assigned Actions", exact: true })).toBeVisible();
  await expect(page.getByText(/Loading assigned Actions/)).toHaveCount(0);
  for (const row of body.items) await expect(page.getByText(row.action.description, { exact: true })).toBeVisible();
  return { body, response };
}
async function logout(page: Page) {
  const [response] = await Promise.all([page.waitForResponse(r => new URL(r.url()).pathname === "/api/auth/logout" && r.request().method() === "POST"), page.getByRole("button", { name: "Logout", exact: true }).click()]);
  expect(response.status()).toBe(204); await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
}
async function capture(page: Page, name: string, browser: string, state: string) {
  mkdirSync(directory, { recursive: true });
  await page.screenshot({ path: join(directory, `${name}.png`), animations: "disabled", fullPage: true });
  writeFileSync(join(directory, `${name}.json`), JSON.stringify({ screenshot: `${name}.png`, executionHead: head,
    date: new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "medium" }).format(new Date()),
    timezone: "Asia/Bangkok", browser, viewport: page.viewportSize(), state, role: "IT_STAFF", successfulReads: "Real React/Express/PostgreSQL",
    zoom: "Unmodified browser zoom; no genuine 200% zoom claim", visualInspection: "Pending" }, null, 2) + "\n");
}

test("Staff Dashboard: known aggregates, all Ticket widget destinations, pagination and preview detail", async ({ page, staffFixture: f, browser }) => {
  console.info(`Issue48 Chromium ${browser.version()}; real authenticated API/PostgreSQL reads.`);
  await login(page, f.a);
  const body = await dashboard(page, () => page.goto(path(f)));
  expect(body.metrics).toEqual({ ...global, mine: 12, myActionsByStatus: { PLANNED: 4, IN_PROGRESS: 2, COMPLETED: 1, CANCELLED: 1 }, myUnfinishedActions: 6 });
  expect(body.lists.recentUpdated.map(row => row.id)).toEqual([12, 11, 10, 9, 8].map(n => t(f, `open-${n}`).id));
  expect(body.lists.recentResolved.map(row => row.id)).toEqual([t(f, "resolved").id]);
  expect(body.lists.myUnfinishedActions.map(row => row.action.id)).toEqual([1, 2, 3, 4, 5].map(n => a(f, `A-${n}`).id));
  expect(body.timezone).toBe("Asia/Bangkok"); expect(JSON.stringify(body)).not.toMatch(/passwordHash|tokenHash|safeResponse|Internal Note|storageKey/);
  await metric(page, /Unassigned active Tickets/i, 3); await metric(page, /My active Tickets/i, 12); await metric(page, /^Recently updated\s+17$/i, 17);
  await expect(root(page).locator("script")).toHaveCount(0);
  const widgets = [
    { label: /My active Tickets/i, total: 12, fields: { dashboardWidget: "mine", statusGroup: "active" }, ids: Array.from({ length: 10 }, (_, i) => `open-${11 - i}`), second: ["open-1", "reopened"] },
    { label: /Unassigned active Tickets/i, total: 3, fields: { dashboardWidget: "unassigned", statusGroup: "active" }, ids: ["waiting", "new", "legacy"] },
    { label: /^Open\s+12$/i, total: 12, fields: { dashboardWidget: "status", widgetStatus: "OPEN" }, ids: Array.from({ length: 10 }, (_, i) => `open-${12 - i}`) },
    { label: /^Medium\s+13$/i, total: 13, fields: { dashboardWidget: "itPriority", widgetItPriority: "MEDIUM", statusGroup: "active" }, ids: Array.from({ length: 10 }, (_, i) => `open-${12 - i}`) },
    { label: /^Recently updated\s+17$/i, total: 17, fields: { dashboardWidget: "recentUpdated", updatedFrom: body.recentWindow.from, updatedBefore: body.recentWindow.before, sortBy: "updatedAt", sortOrder: "desc" }, ids: Array.from({ length: 10 }, (_, i) => `open-${12 - i}`) },
    { label: /^Recently resolved\s+1$/i, total: 1, fields: { dashboardWidget: "recentResolved", statusGroup: "resolved", resolvedFrom: body.recentWindow.from, resolvedBefore: body.recentWindow.before, sortBy: "resolvedAt", sortOrder: "desc" }, ids: ["resolved"] },
  ];
  for (const widget of widgets) {
    await dashboard(page, () => page.goto(path(f)));
    const first = await queue(page, () => root(page).getByRole("link", { name: widget.label }).click());
    const expected = { categoryId: String(f.category.id), sortBy: "updatedAt", sortOrder: "desc", ...widget.fields, page: "1", pageSize: "10" };
    expect(query(first.response)).toEqual(expected); expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual({ categoryId: String(f.category.id), ...widget.fields, page: "1", pageSize: "10" });
    expect(first.body.pagination.totalItems).toBe(widget.total); expect(first.body.items.map(row => row.id)).toEqual(widget.ids.map(name => t(f, name).id));
    if (widget.second) {
      const next = await queue(page, () => page.getByRole("navigation", { name: "Ticket Queue pagination" }).getByRole("button", { name: "Next", exact: true }).click());
      expect(query(next.response)).toEqual({ ...expected, page: "2" }); expect(next.body.items.map(row => row.id)).toEqual(widget.second.map(name => t(f, name).id));
    }
  }
  await dashboard(page, () => page.goto(path(f)));
  const preview = root(page).getByRole("region", { name: "Recently updated Tickets", exact: true });
  await preview.getByRole("link", { name: t(f, "open-12").ticketNumber, exact: true }).click();
  await expect(page.getByRole("heading", { name: t(f, "open-12").ticketNumber, exact: true })).toBeVisible();
  expect(f.pageErrors).toEqual([]);
});

test("Staff Dashboard: Administrator parity and actor with no assignments retains global data", async ({ page, staffFixture: f }) => {
  for (const actor of [f.b, f.c]) {
    await login(page, actor); const body = await dashboard(page, () => page.goto(path(f)));
    const { mine, myActionsByStatus, myUnfinishedActions, ...shared } = body.metrics; expect(shared).toEqual(global);
    expect(mine).toBe(actor.id === f.b.id ? 3 : 0);
    expect(myActionsByStatus).toEqual(actor.id === f.b.id ? { PLANNED: 1, IN_PROGRESS: 0, COMPLETED: 1, CANCELLED: 0 } : { PLANNED: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELLED: 0 });
    expect(myUnfinishedActions).toBe(actor.id === f.b.id ? 1 : 0); await metric(page, /My active Tickets/i, mine);
    if (actor.id === f.c.id) { await expect(root(page).getByText("No unfinished actions assigned to you", { exact: true })).toBeVisible(); await metric(page, /^Open\s+12$/i, 12); }
    await logout(page);
  }
  expect(f.pageErrors).toEqual([]);
});

test("Staff Dashboard: seven filters Apply/Clear, reload/back/forward, empty and old CLOSED matches", async ({ page, staffFixture: f }) => {
  await login(page, f.a); await dashboard(page, () => page.goto(path(f)));
  const form = root(page).getByRole("form", { name: "Dashboard filters" });
  await form.getByLabel("Search Tickets", { exact: true }).fill("  VPN%_  ");
  for (const [name, value] of [["Category", String(f.category.id)], ["Related System", String(f.system.id)], ["Requested Priority", "HIGH"], ["IT Priority", "MEDIUM"], ["Current Status", "OPEN"], ["Owner", "me"]]) await form.getByLabel(name!, { exact: true }).selectOption(value!);
  const filtered = await dashboard(page, () => form.getByRole("button", { name: "Apply Filters", exact: true }).click());
  const expected = { search: "VPN%_", categoryId: String(f.category.id), relatedSystemId: String(f.system.id), requestedPriority: "HIGH", itPriority: "MEDIUM", currentStatus: "OPEN", owner: "me" };
  expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual(expected); expect(filtered.metrics.mine).toBe(11); expect(filtered.metrics.byStatus.OPEN).toBe(11);
  await expect(root(page).getByRole("region", { name: "Active filters" })).toContainText("VPN%_");
  expect((await dashboard(page, () => page.reload())).metrics).toEqual(filtered.metrics);
  await dashboard(page, () => root(page).getByRole("button", { name: "Clear filters", exact: true }).click()); expect(new URL(page.url()).search).toBe("");
  await dashboard(page, () => page.goBack()); expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual(expected);
  await dashboard(page, () => page.goForward()); expect(new URL(page.url()).search).toBe("");
  const empty = await dashboard(page, () => page.goto(`/staff/dashboard?categoryId=${f.emptyCategory.id}`));
  expect(Object.values(empty.metrics.byStatus)).toEqual(Array(8).fill(0)); expect(empty.lists).toEqual({ recentUpdated: [], recentResolved: [], myUnfinishedActions: [] });
  await expect(root(page).getByText("No Dashboard items match these filters.", { exact: true })).toBeVisible();
  const old = await dashboard(page, () => page.goto(`${path(f)}&currentStatus=CLOSED`));
  expect(old.metrics.byStatus.CLOSED).toBe(1); expect(old.metrics.mine).toBe(0); expect(old.metrics.recentUpdated).toBe(0); expect(old.metrics.recentResolved).toBe(0);
  await expect(root(page).getByText(/No Tickets.*available|No Dashboard items match/i)).toHaveCount(0);
  const list = await queue(page, () => root(page).getByRole("region", { name: "Ticket status", exact: true }).getByRole("link", { name: "Closed 1", exact: true }).click());
  expect(list.body.items.map(row => row.id)).toEqual([t(f, "closed").id]); expect(f.pageErrors).toEqual([]);
});

test("Staff Dashboard: actor-assigned unfinished/completed drill-downs and selected Action browser focus", async ({ page, staffFixture: f }) => {
  await login(page, f.a); await dashboard(page, () => page.goto(path(f)));
  const current = await assigned(page, () => root(page).getByRole("link", { name: "View my actions", exact: true }).click());
  expect(query(current.response)).toEqual({ categoryId: String(f.category.id), assignee: "me", actionStatusGroup: "unfinished", page: "1", pageSize: "10" });
  expect(current.body.items.map(row => row.action.id)).toEqual([1, 2, 3, 4, 5, 6].map(n => a(f, `A-${n}`).id));
  expect(current.body.items.every(row => row.action.assignee.id === f.a.id && row.action.createdBy.id === f.c.id && row.ticket.id === t(f, "open-12").id)).toBe(true);
  // Actual delivered #48 screen consumes #45's reconstructed return URL; role
  // landing/global active navigation and the full #53 chain remain unclaimed.
  const back = await dashboard(page, () => page.getByRole("link", { name: "Back to Dashboard", exact: true }).click()); expect(back.filters.categoryId).toBe(f.category.id);
  const completed = await assigned(page, () => root(page).getByRole("region", { name: "My assigned Action status", exact: true }).getByRole("link", { name: "Completed 1", exact: true }).click());
  expect(query(completed.response)).toEqual({ categoryId: String(f.category.id), assignee: "me", status: "COMPLETED", page: "1", pageSize: "10" });
  expect(completed.body.items.map(row => row.action.id)).toEqual([a(f, "A-completed").id]); expect(completed.body.items[0]!.action.performedBy!.id).toBe(f.c.id);
  await dashboard(page, () => page.goto(path(f)));
  const preview = root(page).getByRole("region", { name: "My unfinished Actions", exact: true });
  await preview.getByRole("link", { name: t(f, "open-12").ticketNumber, exact: true }).first().click();
  await expect(page.getByRole("heading", { name: t(f, "open-12").ticketNumber, exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/staff/tickets/${t(f, "open-12").id}#action-${a(f, "A-1").id}$`));
  const selected = page.locator(`#action-${a(f, "A-1").id}`); await expect(selected).toBeVisible();
  await expect.poll(() => selected.evaluate(node => node === document.activeElement || node.contains(document.activeElement))).toBe(true);
  // Non-assignee eligible operator C retains permitted operations; no write is
  // performed in this read-only suite (real mutation coverage is inherited).
  await logout(page); await login(page, f.c); await page.goto(`/staff/tickets/${t(f, "open-12").id}#action-${a(f, "A-2").id}`);
  const running = page.locator(`#action-${a(f, "A-2").id}`); await expect(running.getByRole("button", { name: "Complete", exact: true })).toBeEnabled();
  expect(f.pageErrors).toEqual([]);
});

test("Staff Dashboard: unauthenticated/Requester denial and late real response after logout", async ({ page, staffFixture: f }) => {
  await page.goto(path(f)); await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
  await login(page, f.requester); let privileged = 0;
  const observe = (request: import("@playwright/test").Request) => { if (new URL(request.url()).pathname === endpoint) privileged++; };
  page.on("request", observe);
  try { await page.goto(path(f)); await expect(page.getByRole("heading", { name: "Forbidden", exact: true })).toBeVisible(); expect(privileged).toBe(0); }
  finally { page.off("request", observe); }
  const denial = await page.request.get(`http://127.0.0.1:3100${endpoint}`); expect(denial.status()).toBe(403); expect((await denial.json()).error.code).toBe("ROLE_FORBIDDEN");
  await logout(page); await login(page, f.a); await dashboard(page, () => page.goto(path(f)));
  let release!: () => void, readDone!: () => void, finished!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; }), observed = new Promise<void>(resolve => { readDone = resolve; }), settled = new Promise<void>(resolve => { finished = resolve; });
  const pattern = `**${endpoint}?*`;
  const handler = async (route: import("@playwright/test").Route) => {
    try { const real = await route.fetch(); expect(real.status()).toBe(200); readDone(); await held;
      // Fulfil with the unmodified real response after logout; an aborted
      // consumer may discard it, which is the expected production behaviour.
      await route.fulfill({ response: real });
    } finally { finished(); }
  };
  await page.route(pattern, handler, { times: 1 });
  try {
    await root(page).getByRole("button", { name: "Apply Filters", exact: true }).click(); await observed;
    await expect(root(page).getByRole("status")).toContainText("Loading"); await logout(page); release(); await settled;
    await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByText(t(f, "open-12").summary, { exact: true })).toHaveCount(0); await expect(page.getByRole("heading", { name: "Staff Dashboard", exact: true })).toHaveCount(0);
  } finally { release(); await settled; await page.unroute(pattern, handler); }
  expect(f.pageErrors).toEqual([]);
});

for (const viewport of viewports) test(`Staff Dashboard layout and keyboard: ${viewport.width}x${viewport.height}`, async ({ page, staffFixture: f, browser }) => {
  await page.setViewportSize(viewport); await login(page, f.a); await dashboard(page, () => page.goto(path(f)));
  await geometry(page); const form = root(page).getByRole("form", { name: "Dashboard filters" });
  for (const label of ["Search Tickets", "Category", "Related System", "Requested Priority", "IT Priority", "Current Status", "Owner"]) await reachable(form.getByLabel(label, { exact: true }));
  await keyboardFocus(page, form.getByRole("button", { name: "Apply Filters", exact: true }));
  const mine = await metric(page, /My active Tickets/i, 12); await keyboardFocus(page, mine);
  await page.evaluate(() => scrollTo(0, 0)); await capture(page, `dashboard-${viewport.width}`, browser.version(), "Populated seven-filter Dashboard; long literal summaries and worker name");
  await queue(page, () => mine.click()); await geometry(page);
  const navigation = page.getByRole("navigation", { name: "Ticket Queue pagination" }); await reachable(navigation.getByRole("button", { name: "Next", exact: true }));
  await expect(page.getByText(/12 Tickets/, { exact: true })).toBeVisible();
  expect(f.pageErrors).toEqual([]);
});
