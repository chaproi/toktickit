import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { expect, type Locator, type Page, type Route } from "@playwright/test";
import type { RequesterDashboardResponse, TicketListResponse } from "../../client/src/api.js";
import { test as base, loginDashboardActor, type DashboardBrowserFixture } from "./requester-dashboard-browser-fixtures.js";
import { contrast, genuineZoom, geometry, keyboardFocus, reachable, viewports } from "./action-layout-helpers.js";

// Issue #47's bounded AC-37/T-37, AC-38/T-38 and AC-36/T-36 contribution.
// Real authentication/React/Express/PostgreSQL; #53 landing/navigation and
// comprehensive #49 cross-browser/screen-reader verification remain separate.
const directory = join(process.cwd(), "artifacts/lab-04/screenshots/requester-dashboard");
const phase = process.env.TOKTICKIT_REQUESTER_DASHBOARD_CAPTURE_PHASE ?? "initial";
if (!["initial", "final"].includes(phase)) throw new Error("Invalid Dashboard capture phase");
const executionHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const dashboardPath = "/api/dashboard/requester";
const root = (page: Page) => page.getByRole("region", { name: "Requester Dashboard", exact: true });
const filterNames = ["Search Tickets", "Category", "Related System", "Requested Priority", "IT Priority", "Current Status"] as const;
const metricNames = ["Outstanding", "Waiting for your response", "Recently updated", "Recently resolved"] as const;
const ownerName = "Support coordinator " + "Suvannaphumiphatthanawong".repeat(3);
const requesterName = "Requester for regional infrastructure coordination and multilingual service continuity ภาษาไทย";
const summary = (key: string) => `VPN%_ ${key} ภาษาไทย <script>literal</script> ` + "DiagnosticReference".repeat(5);

function observeWarnings(page: Page) {
  page.on("console", (message) => {
    if (message.type() === "warning") console.info(message.text().includes("React Router Future Flag")
      ? "Issue47 browser warning: inherited React Router future-flag notice."
      : "Issue47 browser warning observed; unrestricted text withheld.");
  });
}

// A wrapper owns only these temporary long-content fixture variations. Compare
// reads against the long-data baseline, then restore exact original values so
// the unchanged inherited fixture's own preservation/cleanup checks still run.
const test = base.extend<{ layout: DashboardBrowserFixture }>({
  layout: async ({ dashboardFixture: f, page }, use) => {
    observeWarnings(page);
    expect(ownerName.length).toBeLessThanOrEqual(120);
    expect(requesterName.length).toBeLessThanOrEqual(120);
    const people = await f.prisma.user.findMany({ where: { id: { in: [f.a.id, f.staff.id] } } });
    const changed = [...f.tickets].filter(([key]) => /^A-open-(?:8|9|10|11|12)$|^A-resolved-[2-6]$/u.test(key));
    const domain = () => Promise.all([
      f.prisma.user.findMany({ where: { id: { in: people.map((person) => person.id) } }, orderBy: { id: "asc" } }),
      f.prisma.ticket.findMany({ where: { id: { in: [...f.tickets.values()].map((ticket) => ticket.id) } }, orderBy: { id: "asc" } }),
      f.prisma.ticketStatusHistory.findMany({ where: { ticketId: { in: [...f.tickets.values()].map((ticket) => ticket.id) } }, orderBy: { id: "asc" } }),
    ]);
    try {
      await f.prisma.user.update({ where: { id: f.a.id }, data: { name: requesterName } });
      await f.prisma.user.update({ where: { id: f.staff.id }, data: { name: ownerName } });
      for (const [key, ticket] of changed) {
        expect(summary(key).length).toBeLessThanOrEqual(150);
        await f.prisma.ticket.update({ where: { id: ticket.id }, data: { summary: summary(key), updatedAt: ticket.updatedAt } });
      }
      const before = await domain();
      try { await use(f); }
      finally {
        expect(isDeepStrictEqual(await domain(), before), "Layout reads preserve complete owned long-content state; sensitive values withheld").toBe(true);
      }
    } finally {
      for (const [, ticket] of changed) await f.prisma.ticket.update({ where: { id: ticket.id }, data: { summary: ticket.summary, updatedAt: ticket.updatedAt } });
      for (const person of people) await f.prisma.user.update({ where: { id: person.id }, data: { name: person.name, updatedAt: person.updatedAt } });
    }
  },
});

async function capture(page: Page, name: string, state: string, zoom = 1, extra: object = {}, scope?: Locator) {
  const destination = join(directory, phase);
  mkdirSync(destination, { recursive: true });
  const session = await page.context().newCDPSession(page);
  let browser: string;
  try {
    browser = (await session.send("Browser.getVersion")).product;
    if (zoom === 2) {
      const result = await session.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      writeFileSync(join(destination, `${name}.png`), Buffer.from(result.data, "base64"));
    } else if (scope) await scope.screenshot({ path: join(destination, `${name}.png`), animations: "disabled" });
    else await page.screenshot({ path: join(destination, `${name}.png`), animations: "disabled", fullPage: false });
  } finally { await session.detach(); }
  const actualCSSViewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, pinchScale: visualViewport?.scale ?? 1 }));
  writeFileSync(join(destination, `${name}.json`), JSON.stringify({
    screenshot: `${name}.png`, capturedAt: new Date().toISOString(), executionHead,
    pendingProductionFiles: execFileSync("git", ["diff", "--name-only", "--", "client/src"], { encoding: "utf8" }).trim().split(/\r?\n/u).filter(Boolean),
    browser, configuredViewport: page.viewportSize(), actualCSSViewport,
    role: "REQUESTER", state, zoomFactor: zoom,
    zoomMethod: zoom === 2 ? "chrome.tabs.setZoom/getZoom via unchanged genuineZoom extension helper" : "unmodified tab zoom",
    captureScope: scope ? "Dashboard filter form" : "native viewport", syntheticDataOnly: true,
    visualInspection: "Pending visual inspection", ...extra,
  }, null, 2) + "\n");
}

async function dashboard(page: Page, action: () => Promise<unknown> = () => page.goto("/dashboard")) {
  const [response] = await Promise.all([
    page.waitForResponse((value) => new URL(value.url()).pathname === dashboardPath && value.request().method() === "GET"), action(),
  ]);
  expect(response.status()).toBe(200);
  const data = await response.json() as RequesterDashboardResponse;
  await expect(root(page).getByRole("status")).toHaveCount(0);
  await expect(root(page).getByText(/As of/)).toBeVisible();
  await expect(root(page).getByRole("link", { name: /Outstanding/ })).toContainText(String(data.metrics.outstanding));
  return data;
}

async function reach(control: Locator) {
  await control.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await reachable(control);
}

async function settledContrast(page: Page, target: Locator) {
  // Moving away ends incidental hover caused by a control replacing another
  // under the pointer. Await actual CSS transitions, never a fixed sleep or a
  // retry-until-contrast-passes loop, then measure the stable focused state.
  await page.mouse.move(0, 0);
  await target.evaluate(async (element) => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => undefined)));
  });
  return contrast(target);
}

async function textWrap(page: Page) {
  await geometry(page);
  const overflow = await root(page).locator("p,li,label,h1,h2").evaluateAll((elements) => elements.filter((element) => {
    const box = element.getBoundingClientRect();
    const range = document.createRange(); range.selectNodeContents(element);
    return box.width > 0 && (element.scrollWidth > element.clientWidth + 1 ||
      [...range.getClientRects()].some((r) => r.left < box.left - 1 || r.right > box.right + 1) ||
      ["hidden", "clip"].includes(getComputedStyle(element).overflowX));
  }).map((element) => `${element.tagName}.${element.className}`));
  expect(overflow, "Complete Dashboard text wraps without clipping or hiding essential content").toEqual([]);
}

async function populated(page: Page) {
  for (const name of metricNames) await expect(root(page).getByRole("link", { name: new RegExp(name, "i") })).toBeVisible();
  for (const name of ["Recently updated Tickets", "Recently resolved Tickets"]) {
    const list = root(page).getByRole("region", { name, exact: true });
    await expect(list.getByRole("listitem")).toHaveCount(5);
    await expect(list.getByText(`Owner: ${ownerName}`, { exact: true })).toHaveCount(5);
  }
  await expect(root(page).getByText(summary("A-open-12"), { exact: true })).toBeVisible();
  await expect(root(page).locator("script")).toHaveCount(0);
}

async function applySix(page: Page, f: DashboardBrowserFixture) {
  const form = root(page).getByRole("form", { name: "Dashboard filters" });
  for (const name of filterNames) {
    await expect(form.getByLabel(name, { exact: true })).toHaveAccessibleName(name);
    await reach(form.getByLabel(name, { exact: true }));
  }
  await form.getByLabel("Search Tickets", { exact: true }).fill("VPN%_");
  for (const [name, value] of [["Category", String(f.category.id)], ["Related System", String(f.system.id)],
    ["Requested Priority", "HIGH"], ["IT Priority", "MEDIUM"], ["Current Status", "OPEN"]]) {
    await form.getByLabel(name!, { exact: true }).selectOption(value!);
  }
  await dashboard(page, () => form.getByRole("button", { name: "Apply Filters", exact: true }).click());
  const active = root(page).getByRole("region", { name: "Active filters", exact: true });
  for (const value of ["VPN%_", f.category.name, f.system.name, "High", "Medium", "Open"]) await expect(active).toContainText(value);
  await textWrap(page);
  await reach(form.getByRole("button", { name: "Clear filters", exact: true }));
}

async function drillDown(page: Page, keyboard = false) {
  const link = root(page).getByRole("link", { name: /Outstanding/ });
  await reach(link);
  if (keyboard) await keyboardFocus(page, link);
  const [response] = await Promise.all([
    page.waitForResponse((value) => new URL(value.url()).pathname === "/api/tickets" && value.request().method() === "GET"),
    keyboard ? page.keyboard.press("Enter") : link.click(),
  ]);
  expect(response.status()).toBe(200);
  const body = await response.json() as TicketListResponse;
  expect(body.items.length).toBeGreaterThan(0);
  await expect(page.getByRole("heading", { name: "My Tickets", exact: true })).toBeVisible();
  await expect(page.getByRole("table", { name: "My Tickets", exact: true }).locator("tbody tr td:first-child a"))
    .toHaveText(body.items.map((ticket) => ticket.ticketNumber));
  await geometry(page);
  const scrollable = page.getByRole("region", { name: "Scrollable My Tickets table", exact: true });
  await expect(scrollable).toHaveAttribute("tabindex", "0");
  // The table may legitimately be taller than the viewport. Verify keyboard
  // arrival/visible outline and actual contained scrolling, not simultaneous
  // visibility of its entire multi-screen rectangle.
  await scrollable.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
  await expect(scrollable).toBeFocused();
  expect(await scrollable.evaluate((element) => {
    const style = getComputedStyle(element);
    return style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0 || style.boxShadow !== "none";
  }), "Keyboard-focusable table region has a visible focus treatment").toBe(true);
  const horizontal = await scrollable.evaluate((element) => element.scrollWidth > element.clientWidth + 1);
  if (horizontal) {
    await scrollable.evaluate((element) => { element.scrollLeft = 0; });
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => scrollable.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await scrollable.evaluate((element) => { element.scrollLeft = 0; });
  }
  const firstLink = scrollable.getByRole("link").first();
  await page.keyboard.press("Tab"); await expect(firstLink).toBeFocused();
  await firstLink.scrollIntoViewIfNeeded();
  expect(await firstLink.evaluate((element) => [...element.getClientRects()].some((box) => {
    // A wrapped inline link has several text rectangles. Its union-box center
    // may be whitespace in the TD; hit-test real text rectangles instead.
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return box.width > 0 && box.height > 0 && box.left >= 0 && box.right <= innerWidth &&
      box.top >= 0 && box.bottom <= innerHeight && Boolean(hit && (hit === element || element.contains(hit)));
  })), "Wrapped Ticket link remains keyboard-reachable and its text is unobscured").toBe(true);
  await reach(page.getByLabel("Page Size", { exact: true }));
  await reach(page.getByRole("navigation", { name: "My Tickets pagination" }).getByRole("button", { name: "Next", exact: true }));
  return body;
}

async function loadingAndRecovery(page: Page, name: string, zoom = 1) {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let finished!: () => void;
  const drained = new Promise<void>((resolve) => { finished = resolve; });
  let interceptions = 0;
  const pattern = /\/api\/dashboard\/requester(?:\?|$)/u;
  const fault = async (route: Route) => {
    interceptions++;
    try { await held; await route.abort("failed"); } finally { finished(); }
  };
  // Installed only after initial StrictMode reads have rendered successfully.
  await page.route(pattern, fault, { times: 1 });
  try {
    await root(page).getByRole("button", { name: "Apply Filters", exact: true }).click();
    await expect(root(page).getByRole("status")).toHaveAttribute("aria-busy", "true");
    await expect(root(page).getByRole("status")).toContainText("Loading your Dashboard");
    await expect(root(page).getByRole("alert")).toHaveCount(0);
    await expect(root(page).getByRole("link", { name: /Outstanding/ })).toHaveCount(0);
    release(); await drained;
    await expect(root(page).getByRole("alert")).toHaveCount(1);
    await expect(root(page).getByRole("alert")).toContainText(/unable|try again/i);
    await expect(root(page).getByRole("status")).toHaveCount(0);
    await expect(root(page).getByText("0", { exact: true })).toHaveCount(0);
    await expect(root(page).getByText(/No Tickets/)).toHaveCount(0);
    const retry = root(page).getByRole("button", { name: "Retry", exact: true });
    await keyboardFocus(page, retry); await reach(retry);
    const sampledContrast = { error: await settledContrast(page, root(page).getByRole("alert").locator("p")), retry: await settledContrast(page, retry) };
    await capture(page, name, "One held then aborted browser transport read; single honest alert and keyboard Retry", zoom, { sampledContrast });
    expect(interceptions).toBe(1);
  } finally {
    release(); if (interceptions > 0) await drained;
    await page.unroute(pattern, fault);
  }
  await dashboard(page, () => page.keyboard.press("Enter"));
  await expect(root(page).getByRole("alert")).toHaveCount(0);
  await populated(page);
  console.info("Issue47 layout: one controlled browser transport abort after settled mount; Retry uses real authoritative API data.");
}

for (const viewport of viewports) {
  test(`T-37 Requester Dashboard and drill-down reflow at ${viewport.width}x${viewport.height}`, async ({ page, layout: f }) => {
    await page.setViewportSize(viewport);
    await loginDashboardActor(page, f.a); await dashboard(page); await populated(page);
    const prefix = `${viewport.width}x${viewport.height}`;
    const form = root(page).getByRole("form", { name: "Dashboard filters" });
    await capture(page, `${prefix}-filters`, "All six labelled filters", 1, {}, form);
    await root(page).getByRole("link", { name: /Outstanding/ }).scrollIntoViewIfNeeded();
    await capture(page, `${prefix}-metrics-lists`, "Populated textual metrics; recent lists continue below the fold on mobile");
    await root(page).getByRole("region", { name: "Recently updated Tickets", exact: true }).scrollIntoViewIfNeeded();
    await capture(page, `${prefix}-recent-records`, "Long literal summary, owner name, textual status/priority and authoritative timestamps");
    await textWrap(page);
    await applySix(page, f);
    const body = await drillDown(page);
    expect(body.pagination.totalItems).toBe(12);
    expect(f.pageErrors).toEqual([]);
  });
}

test("T-38 Requester Dashboard keyboard labels, focus, Apply/Clear, loading and safe Retry", async ({ page, layout: f }) => {
  await loginDashboardActor(page, f.a); await dashboard(page); await populated(page);
  const form = root(page).getByRole("form", { name: "Dashboard filters" });
  await form.getByLabel(filterNames[0], { exact: true }).focus();
  for (const name of filterNames.slice(1)) {
    await page.keyboard.press("Tab"); await expect(form.getByLabel(name, { exact: true })).toBeFocused();
  }
  await page.keyboard.press("Tab"); await expect(form.getByRole("button", { name: "Apply Filters", exact: true })).toBeFocused();
  await keyboardFocus(page, form.getByRole("button", { name: "Apply Filters", exact: true }));
  await page.keyboard.press("Tab"); await expect(form.getByRole("button", { name: "Clear filters", exact: true })).toBeFocused();
  await applySix(page, f);
  const clear = form.getByRole("button", { name: "Clear filters", exact: true });
  await keyboardFocus(page, clear); await dashboard(page, () => page.keyboard.press("Enter"));
  expect(new URL(page.url()).search).toBe("");
  await expect(form.getByLabel("Search Tickets", { exact: true })).toHaveValue("");
  await loadingAndRecovery(page, "keyboard-error-retry");
  const sampledContrast = {
    metric: await settledContrast(page, root(page).getByRole("link", { name: /Outstanding/ }).locator("span")),
    summary: await settledContrast(page, root(page).getByText(summary("A-open-12"), { exact: true })),
    apply: await settledContrast(page, form.getByRole("button", { name: "Apply Filters", exact: true })),
  };
  console.info(`Issue47 representative computed contrast: ${JSON.stringify(sampledContrast)}; sampled solid backgrounds only, no certification.`);
  await drillDown(page, true);
  expect(f.pageErrors).toEqual([]);
});

test("T-38 Requester Dashboard genuine 200% tab zoom preserves filters, Retry and drill-down", async ({ layout: f }) => {
  await genuineZoom(async (page, _worker, zoom) => {
    observeWarnings(page);
    page.on("pageerror", () => f.pageErrors.push("Zoom page error"));
    await loginDashboardActor(page, f.a); await dashboard(page); await populated(page);
    const before = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, pinchScale: visualViewport?.scale ?? 1 }));
    expect(await zoom()).toBe(1); expect(await zoom(2)).toBe(2); await expect.poll(() => zoom()).toBe(2);
    await expect.poll(() => page.evaluate(() => innerWidth)).toBeLessThan(before.width);
    const zoomed = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, pinchScale: visualViewport?.scale ?? 1 }));
    expect(zoomed.pinchScale).toBe(1);
    await textWrap(page);
    for (const name of filterNames) await reach(root(page).getByLabel(name, { exact: true }));
    await root(page).getByRole("link", { name: /Outstanding/ }).scrollIntoViewIfNeeded();
    await capture(page, "zoom200-metrics-lists", "Genuine 2.0 tab zoom: readable metrics and long recent rows", 2, { verifiedTabZoom: await zoom(), before, zoomed });
    await root(page).getByRole("region", { name: "Recently updated Tickets", exact: true }).scrollIntoViewIfNeeded();
    await capture(page, "zoom200-recent-records", "Genuine 2.0 tab zoom: full literal summary and long owner name reflow", 2, { verifiedTabZoom: await zoom() });
    await loadingAndRecovery(page, "zoom200-error-retry", 2);
    await applySix(page, f); await drillDown(page, true);
    await page.getByRole("heading", { name: "My Tickets", exact: true }).scrollIntoViewIfNeeded();
    await capture(page, "zoom200-drilldown", "Genuine 2.0 tab zoom: authoritative My Tickets drill-down and filters", 2, { verifiedTabZoom: await zoom() });
    expect(await zoom(1)).toBe(1); await expect.poll(() => page.evaluate(() => innerWidth)).toBe(before.width);
    const restored = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, pinchScale: visualViewport?.scale ?? 1 }));
    console.info(`Issue47 genuine tab zoom: ${JSON.stringify({ factors: [1, 2, 1], before, zoomed, restored })}; extension-controlled, no viewport/device/CSS/pinch substitution.`);
    expect(f.pageErrors).toEqual([]);
  });
});
