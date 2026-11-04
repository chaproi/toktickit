import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { chromium, expect, type Page } from "@playwright/test";
import { test, login, syntheticAction, type Fixture } from "./action-browser-fixtures.js";
import { geometry, keyboardFocus, reachable, trap } from "./action-layout-helpers.js";

// Bounded T-37/T-38 contribution. Reuses a separately guarded review runtime;
// normal Playwright global setup can also run this file with its own schema.
const api = "http://127.0.0.1:3100";
const output = join(process.cwd(), "artifacts/lab-04/hardening/browser-closeout-2026-11-04",
  process.env.TOKTICKIT_CLOSEOUT_ATTEMPT ?? "standalone");
mkdirSync(output, { recursive: true });
const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const dirty = execFileSync("git", ["-c", "core.longpaths=true", "status", "--short"], { encoding: "utf8" }).trim();

async function capture(page: Page, name: string, role: string, state: string, zoom = 1, extra: object = {}) {
  const session = await page.context().newCDPSession(page);
  try {
    const browser = await session.send("Browser.getVersion");
    // Compositor-only application viewport: no browser chrome/personal tabs.
    const png = await session.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    writeFileSync(join(output, `${name}.png`), Buffer.from(png.data, "base64"));
    writeFileSync(join(output, `${name}.json`), JSON.stringify({ capturedAt: new Date().toISOString(),
      timezone: "Asia/Bangkok", sourceHead: head, dirtyState: dirty, role, state,
      browser: browser.product, userAgent: browser.userAgent, zoom,
      nativeViewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight, pinchScale: visualViewport?.scale })),
      syntheticDataOnly: true, visualInspection: "Pending", ...extra }, null, 2) + "\n");
  } finally { await session.detach(); }
}

async function digest(f: Fixture) {
  const data = await f.prisma.$transaction(async tx => ({
    ticket: await tx.ticket.findUniqueOrThrow({ where: { id: f.ticket.id } }),
    actions: await tx.action.findMany({ where: { ticketId: f.ticket.id }, orderBy: { id: "asc" } }),
    history: await tx.actionHistory.findMany({ where: { action: { ticketId: f.ticket.id } }, orderBy: { id: "asc" } }),
    statusHistory: await tx.ticketStatusHistory.findMany({ where: { ticketId: f.ticket.id }, orderBy: { id: "asc" } }),
    receipts: await tx.mutationReceipt.findMany({ where: { ticketId: f.ticket.id }, orderBy: { id: "asc" } }),
  }));
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

async function openTicket(page: Page, f: Fixture) {
  await page.goto(`/staff/tickets/${f.ticket.id}`);
  await expect(page.getByRole("heading", { name: f.ticket.ticketNumber, exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Actions Taken", exact: true })).toHaveAttribute("aria-busy", "false");
}

test("T-38 Staff History controlled read failure and real Retry with keyboard focus", async ({ page, fixture: f }) => {
  const action = await syntheticAction(f, { description: "Owned review History with literal <script>inert</script> text.", status: "IN_PROGRESS" });
  await login(page, f.operator); await openTicket(page, f);
  const before = await digest(f);
  const trigger = page.locator(`#action-${action.id}`).getByRole("button", { name: "View history", exact: true });
  const pattern = `**/api/tickets/${f.ticket.id}/actions/${action.id}/history?*`;
  let aborted = 0;
  await page.route(pattern, async route => { aborted++; await route.abort("failed"); });
  try {
    await keyboardFocus(page, trigger); await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Action history", exact: true });
    await expect(dialog).toBeFocused();
    await expect(dialog.getByRole("alert")).toHaveCount(1);
    await expect(dialog.getByRole("alert")).toContainText("Unable to load Action history. Please try again.");
    await expect(dialog.getByRole("status")).toHaveCount(0);
    await trap(page, dialog);
    const retry = dialog.getByRole("button", { name: "Retry", exact: true });
    await keyboardFocus(page, retry);
    await capture(page, "staff-history-controlled-error", "IT_STAFF", "Controlled browser transport abort; one alert and focused Retry");
    await page.unroute(pattern);
    const response = page.waitForResponse(r => new URL(r.url()).pathname === `/api/tickets/${f.ticket.id}/actions/${action.id}/history` && r.request().method() === "GET");
    await page.keyboard.press("Enter"); expect((await response).status()).toBe(200);
    await expect(dialog.getByRole("list", { name: "Action history events" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Started", exact: true })).toBeVisible();
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await expect.poll(() => dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    await trap(page, dialog);
    await capture(page, "staff-history-recovered", "IT_STAFF", "Real server History after explicit Retry; keyboard containment");
    await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
    await expect(page.locator("[inert]")).toHaveCount(0);
    expect(aborted).toBeGreaterThan(0); expect(await digest(f)).toBe(before);
    expect(f.pageErrors).toEqual([]);
  } finally { await page.unroute(pattern); }
});

test("T-38 real In Progress Ticket blocker and keyboard View Actions Taken handoff", async ({ page, fixture: f }) => {
  const action = await syntheticAction(f, { description: "Owned unfinished review task; resolution must be rejected.", status: "IN_PROGRESS" });
  await login(page, f.operator);
  const parent = await f.prisma.ticket.findUniqueOrThrow({ where: { id: f.ticket.id } });
  const csrf = (await page.context().cookies(api)).find(c => c.name === "toktickit_csrf")?.value;
  expect(Boolean(csrf)).toBe(true);
  const changed = await page.request.patch(`${api}/api/staff/tickets/${f.ticket.id}/status`, {
    headers: { Origin: "http://127.0.0.1:4173", "X-CSRF-Token": csrf! },
    data: { targetStatus: "IN_PROGRESS", expectedUpdatedAt: parent.updatedAt.toISOString(), confirm: false, reason: "Owned review setup transition" },
  });
  expect(changed.status()).toBe(200);
  await openTicket(page, f);
  expect((await f.prisma.ticket.findUniqueOrThrow({ where: { id: f.ticket.id } })).currentStatus).toBe("IN_PROGRESS");
  expect((await f.prisma.action.findUniqueOrThrow({ where: { id: action.id } })).status).toBe("IN_PROGRESS");
  await expect(page.locator(`#action-${action.id}`).getByText("In Progress", { exact: true })).toBeVisible();
  const before = await digest(f);
  const select = page.getByLabel("Next status", { exact: true });
  await select.selectOption("RESOLVED");
  const dialog = page.getByRole("dialog", { name: "Resolved Ticket", exact: true });
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await trap(page, dialog); await page.keyboard.press("Escape");
  await expect(select).toBeFocused(); await expect(page.locator("[inert]")).toHaveCount(0);
  await select.selectOption("RESOLVED");
  await dialog.getByLabel("Reason (optional)", { exact: true }).fill("Verify unfinished work prevents resolution.");
  const response = page.waitForResponse(r => new URL(r.url()).pathname === `/api/staff/tickets/${f.ticket.id}/status` && r.request().method() === "PATCH");
  await dialog.getByRole("button", { name: "Confirm resolved", exact: true }).click();
  const rejected = await response; expect(rejected.status()).toBe(409);
  expect((await rejected.json()).error.code).toBe("ACTIONS_OUTSTANDING");
  await expect(dialog.getByRole("alert")).toHaveCount(1); await expect(dialog).toContainText("1 unfinished Actions");
  await expect(dialog.getByRole("alert")).toBeFocused(); await trap(page, dialog);
  await capture(page, "staff-real-workflow-blocker", "IT_STAFF", "Ticket and Action IN_PROGRESS; real 409 ACTIONS_OUTSTANDING; no successful resolution");
  const link = dialog.getByRole("link", { name: "View Actions Taken", exact: true });
  await keyboardFocus(page, link); await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0); await expect(page.locator("[inert]")).toHaveCount(0);
  const region = page.getByRole("region", { name: "Actions Taken", exact: true });
  await expect(region.getByRole("heading", { name: "Actions Taken", exact: true })).toBeFocused();
  await capture(page, "staff-actions-focus-handoff", "IT_STAFF", "Keyboard View Actions Taken closes dialog, removes inertness and focuses Actions heading");
  expect(await digest(f)).toBe(before); expect(f.pageErrors).toEqual([]);
});

test("T-37/T-38 real Microsoft Edge Admin navigation and History at genuine 200% tab zoom", async ({ fixture: f }) => {
  const action = await syntheticAction(f, { description: "Representative Admin History literal <script>inert</script> content with readable review context.", status: "IN_PROGRESS" });
  const temp = realpathSync(tmpdir()), profile = mkdtempSync(join(temp, "issue49-edge-closeout-"));
  const extension = join(process.cwd(), "e2e/fixtures/tab-zoom-extension");
  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
  let page: Page | undefined;
  let zoom: ((factor?: number) => Promise<number>) | undefined;
  try {
    context = await chromium.launchPersistentContext(profile, { channel: "msedge", headless: false,
      baseURL: "http://127.0.0.1:4173", viewport: null,
      args: ["--window-size=1440,900", `--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    page = await context.newPage(); const current = page;
    page.on("pageerror", () => f.pageErrors.push("Edge page error"));
    zoom = factor => worker.evaluate(async ({ url, factor }) => {
      const controller = (globalThis as unknown as { toktickitTabZoom: { get(url: string): Promise<number>; set(url: string, value: number): Promise<number> } }).toktickitTabZoom;
      return factor === undefined ? controller.get(url) : controller.set(url, factor);
    }, { url: current.url(), factor });
    await login(page, f.owner);
    await expect(page).toHaveURL(/\/staff\/dashboard$/);
    const width = await page.evaluate(() => innerWidth);
    expect(await zoom()).toBe(1); expect(await zoom(2)).toBe(2);
    await expect.poll(() => page!.evaluate(() => innerWidth)).toBeLessThan(width);
    expect(await page.evaluate(() => visualViewport?.scale)).toBe(1);
    for (const [name, destination] of [["User Management", "/admin/users"], ["Ticket Queue", "/staff/tickets"], ["My assigned Actions", "/staff/actions"], ["Dashboard", "/staff/dashboard"]] as const) {
      const toggle = page.getByRole("button", { name: "Toggle primary navigation", exact: true });
      if (await toggle.isVisible() && await toggle.getAttribute("aria-expanded") !== "true") { await keyboardFocus(page, toggle); await page.keyboard.press("Enter"); }
      const nav = page.getByRole("navigation", { name: "Primary navigation", exact: true });
      const link = nav.getByRole("link", { name, exact: true });
      await keyboardFocus(page, link); await page.keyboard.press("Enter");
      await expect(page).toHaveURL(new RegExp(destination + "$"));
      if (await toggle.isVisible() && await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
      await expect(nav.getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
      expect(await zoom()).toBe(2);
    }
    await geometry(page);
    await capture(page, "edge-admin-navigation-200", "ADMINISTRATOR", "All four Admin destinations activated by keyboard; correct active state at real tab zoom 2", 2, { initialCSSWidth: width, verifiedTabZoom: await zoom() });
    await openTicket(page, f);
    const before = await digest(f);
    const trigger = page.locator(`#action-${action.id}`).getByRole("button", { name: "View history", exact: true });
    await keyboardFocus(page, trigger); await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Action history", exact: true });
    await expect(dialog).toBeFocused(); await expect(dialog.getByRole("list", { name: "Action history events" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Started", exact: true })).toBeVisible();
    await trap(page, dialog); await geometry(page, dialog);
    await dialog.getByRole("heading", { name: "Started", exact: true }).scrollIntoViewIfNeeded();
    await capture(page, "edge-admin-history-200", "ADMINISTRATOR", "Real safe History; keyboard containment and readable reflow at genuine tab zoom 2", 2, { verifiedTabZoom: await zoom() });
    const close = dialog.getByRole("button", { name: "Close history", exact: true });
    await reachable(close); await keyboardFocus(page, close); await page.keyboard.press("Enter");
    await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
    await expect(page.locator("[inert]")).toHaveCount(0);
    await trigger.click(); await expect(dialog.getByRole("list", { name: "Action history events" })).toBeVisible();
    await page.keyboard.press("Escape"); await expect(trigger).toBeFocused();
    expect(await digest(f)).toBe(before); expect(f.pageErrors).toEqual([]);
    expect(await zoom(1)).toBe(1); await expect.poll(() => page!.evaluate(() => innerWidth)).toBe(width);
    writeFileSync(join(output, "edge-zoom.json"), JSON.stringify({ sourceHead: head, browser: context.browser()?.version(), factors: [1, 2, 1], initialCSSWidth: width, restoredCSSWidth: await page.evaluate(() => innerWidth), pinchScale: await page.evaluate(() => visualViewport?.scale) }, null, 2) + "\n");
  } finally {
    if (page && zoom && page.url().startsWith("http://127.0.0.1:4173")) await zoom(1);
    await context?.close();
    const owned = relative(temp, profile);
    if (!owned.startsWith("issue49-edge-closeout-") || owned.includes("..")) throw new Error("Refusing unowned Edge profile cleanup");
    rmSync(profile, { recursive: true, force: true });
    console.info("Owned Edge context closed, zoom restored and profile removed.");
  }
});
