import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import { test, login, type Fixture } from "./action-browser-fixtures.js";
import { fieldError, genuineZoom, geometry, keyboardFocus, reachable, trap, viewports } from "./action-layout-helpers.js";

// Issue #46 contribution to AC-37/T-37, AC-38/T-38, AC-18/T-18,
// AC-36/T-36 and AC-43/T-53. Real business endpoints; no route mocks/faults.
const api = "http://127.0.0.1:3100";
const longReason = "Workflow review: " + "ReferenceWithoutSpaces".repeat(12) +
  " <script>window.__workflowTextExecuted=true</script> & literal reason.";
const root = join(process.cwd(), "artifacts/lab-04/screenshots/ticket-workflow");
const phase = process.env.TOKTICKIT_WORKFLOW_CAPTURE_PHASE ?? "initial";
if (!["initial", "final"].includes(phase)) throw new Error("Invalid owned capture phase");
const executionHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const warnings: string[] = [];

async function captureWorkflow(page: Page, name: string, state: string, zoom = 1, extra: object = {}) {
  const directory = join(root, phase);
  mkdirSync(directory, { recursive: true });
  const session = await page.context().newCDPSession(page);
  let version: string;
  try {
    version = (await session.send("Browser.getVersion")).product;
    if (zoom === 2) {
      const result = await session.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      writeFileSync(join(directory, `${name}.png`), Buffer.from(result.data, "base64"));
    } else await page.screenshot({ path: join(directory, `${name}.png`), animations: "disabled", fullPage: false });
  } finally { await session.detach(); }
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, pinchScale: visualViewport?.scale ?? 1 }));
  writeFileSync(join(directory, `${name}.json`), JSON.stringify({
    screenshot: `${name}.png`, capturedAt: new Date().toISOString(), timezone: "Asia/Bangkok",
    executionHead, pendingProductionFiles: execFileSync("git", ["diff", "--name-only", "--", "client/src"], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean),
    browser: version, configuredViewport: page.viewportSize(), actualCSSViewport: viewport,
    role: "IT_STAFF", state, zoomFactor: zoom,
    zoomMethod: zoom === 2 ? "chrome.tabs.setZoom/getZoom via unchanged genuineZoom extension helper" : "unmodified tab zoom",
    syntheticDataOnly: true, visualInspection: "Pending visual inspection", ...extra,
  }, null, 2) + "\n");
}

async function openTicket(page: Page, f: Fixture) {
  await page.goto(`/staff/tickets/${f.ticket.id}`);
  await expect(page.getByRole("heading", { name: f.ticket.ticketNumber, exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Actions Taken", exact: true })).toHaveAttribute("aria-busy", "false");
  await expect(page.getByLabel("Next status", { exact: true })).toBeEnabled();
}

async function reach(control: Locator) {
  // A focused textarea can sit ~1.7 CSS px below the viewport after native
  // caret scrolling. Center it by ordinary document/container scrolling before
  // using the unchanged strict reachability assertion; never resize/hide it.
  await control.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await reachable(control);
}

async function cancellation(page: Page) {
  await page.getByLabel("Next status", { exact: true }).selectOption("CANCELLED");
  const dialog = page.getByRole("dialog", { name: "Cancel Ticket", exact: true });
  await expect(dialog).toContainText("Unfinished Actions will also be cancelled with the same reason.");
  const reason = dialog.getByLabel("Cancellation reason", { exact: true });
  await expect(reason).toHaveAttribute("required", "");
  return { dialog, reason };
}

async function optionalDraft(page: Page) {
  await page.getByLabel("Next status", { exact: true }).selectOption("IN_PROGRESS");
  const input = page.getByLabel("Reason (optional)", { exact: true });
  await expect(input).not.toHaveAttribute("required", "");
  await input.fill(longReason);
  await expect(input).toHaveValue(longReason);
  await expect(input).toHaveAttribute("aria-invalid", "false");
  return input;
}

async function saveOrdinaryReason(page: Page, f: Fixture) {
  await optionalDraft(page);
  const [response] = await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname === `/api/staff/tickets/${f.ticket.id}/status` && r.request().method() === "PATCH"),
    page.getByRole("button", { name: "Update Status", exact: true }).click(),
  ]);
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON()).toMatchObject({ targetStatus: "IN_PROGRESS", reason: longReason, confirm: false });
  await expect(page.getByText("Status updated successfully.", { exact: true })).toBeVisible();
  const persisted = await f.prisma.ticketStatusHistory.findMany({ where: { ticketId: f.ticket.id } });
  expect(persisted).toHaveLength(1);
  expect(persisted[0]!.reason).toBe(longReason);
  const history = page.getByRole("region", { name: "Status History", exact: true });
  await expect(history.getByRole("listitem")).toContainText(longReason);
  await expect(history.locator("script,a")).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, "__workflowTextExecuted") ?? false)).toBe(false);
  return history;
}

async function historyWrap(page: Page, history: Locator) {
  await geometry(page, history);
  const sizes = await history.getByRole("listitem").evaluateAll((items) => items.map((item) => {
    const range = document.createRange(); range.selectNodeContents(item);
    const box = item.getBoundingClientRect();
    return { overflows: item.scrollWidth > item.clientWidth + 1,
      clipped: [...range.getClientRects()].some((r) => r.left < box.left - 1 || r.right > box.right + 1),
      hidden: ["hidden", "clip"].includes(getComputedStyle(item).overflowX) };
  }));
  expect(sizes, "Complete literal history reason wraps; no clipping/hiding to pass geometry").toEqual([{ overflows: false, clipped: false, hidden: false }]);
}

async function unfinishedAction(page: Page, f: Fixture) {
  const parent = await f.prisma.ticket.findUniqueOrThrow({ where: { id: f.ticket.id } });
  const csrf = (await page.context().cookies(api)).find((cookie) => cookie.name === "toktickit_csrf")?.value;
  expect(Boolean(csrf), "Real authentication supplies CSRF; values withheld").toBe(true);
  const response = await page.request.post(`${api}/api/tickets/${f.ticket.id}/actions`, {
    headers: { Origin: "http://127.0.0.1:4173", "X-CSRF-Token": csrf! },
    data: { description: "Real unfinished workflow-layout task; no fabricated business response.",
      result: null, assigneeId: f.assignee.id, followUpRequired: false, followUpNote: null, attachmentNotes: null,
      expectedTicketUpdatedAt: parent.updatedAt.toISOString(), clientMutationId: randomUUID() },
  });
  expect(response.status()).toBe(201);
  await openTicket(page, f); // Authoritative parent token after real creation.
}

async function blockedResolution(page: Page, f: Fixture) {
  await page.getByLabel("Next status", { exact: true }).selectOption("RESOLVED");
  const dialog = page.getByRole("dialog", { name: "Resolved Ticket", exact: true });
  await dialog.getByLabel("Reason (optional)", { exact: true }).fill(longReason);
  const before = await f.prisma.ticket.findUniqueOrThrow({ where: { id: f.ticket.id } });
  const [response] = await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname === `/api/staff/tickets/${f.ticket.id}/status` && r.request().method() === "PATCH"),
    dialog.getByRole("button", { name: "Confirm resolved", exact: true }).click(),
  ]);
  expect(response.status()).toBe(409);
  expect((await response.json()).error.code).toBe("ACTIONS_OUTSTANDING");
  await expect(dialog).toContainText("1 unfinished Actions");
  await expect(dialog.getByRole("alert")).toHaveCount(1);
  expect((await f.prisma.ticket.findUniqueOrThrow({ where: { id: f.ticket.id } })).updatedAt).toEqual(before.updatedAt);
  expect(await f.prisma.ticketStatusHistory.count({ where: { ticketId: f.ticket.id } })).toBe(0);
  return dialog;
}

async function actionsLink(page: Page, dialog: Locator) {
  const link = dialog.getByRole("link", { name: "View Actions Taken", exact: true });
  await keyboardFocus(page, link);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("[inert]")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Actions Taken", exact: true }).getByRole("heading", { name: "Actions Taken", exact: true })).toBeFocused();
}

test.beforeEach(async ({ page }) => {
  warnings.length = 0;
  expect(longReason.length).toBeLessThanOrEqual(500);
  expect(longReason.length).toBeGreaterThanOrEqual(5);
  await page.addInitScript(() => Reflect.set(window, "__workflowTextExecuted", false));
  page.on("console", (message) => { if (message.type() === "warning") warnings.push("Browser warning; text withheld"); });
});
test.afterEach(async ({ fixture: f }) => {
  expect(f.pageErrors).toEqual([]);
  console.info(`Workflow layout diagnostics: pageErrors=${f.pageErrors.length}; browserWarnings=${warnings.length}; real endpoints; no transport faults.`);
});

for (const viewport of viewports) {
  test(`T-37 workflow forms, confirmations and literal history at ${viewport.width}x${viewport.height}`, async ({ page, fixture: f }) => {
    await page.setViewportSize(viewport);
    await login(page, f.operator); await openTicket(page, f);
    const input = await optionalDraft(page);
    await geometry(page); await reach(input); await reach(page.getByRole("button", { name: "Update Status", exact: true }));
    const prefix = `${viewport.width}x${viewport.height}`;
    await page.getByLabel("Next status", { exact: true }).selectOption("RESOLVED");
    let dialog = page.getByRole("dialog", { name: "Resolved Ticket", exact: true });
    await expect(dialog.getByLabel("Reason (optional)", { exact: true })).toHaveValue(longReason);
    await captureWorkflow(page, `${prefix}-resolution`, "Optional resolution reason and confirmation");
    await geometry(page, dialog); await reach(dialog.getByRole("button", { name: "Confirm resolved", exact: true }));
    await page.keyboard.press("Escape"); await expect(page.getByLabel("Next status", { exact: true })).toBeFocused();
    const cancel = await cancellation(page); dialog = cancel.dialog;
    await cancel.reason.fill(longReason);
    await captureWorkflow(page, `${prefix}-cancellation`, "Cancellation explanation, required long reason and idle controls");
    await geometry(page, dialog); await reach(dialog.getByRole("button", { name: "Confirm cancellation", exact: true }));
    await reach(dialog.getByRole("button", { name: "Cancel", exact: true }));
    await page.keyboard.press("Escape");
    const history = await saveOrdinaryReason(page, f);
    await history.scrollIntoViewIfNeeded();
    await captureWorkflow(page, `${prefix}-history`, "Real stored long literal transition reason; complete history");
    await historyWrap(page, history);
  });
}

test("T-38 labelled reasons, invalid feedback, dialog trapping and real blocker keyboard handoff", async ({ page, fixture: f }) => {
  await login(page, f.operator); await openTicket(page, f);
  const optional = await optionalDraft(page); await keyboardFocus(page, optional);
  await unfinishedAction(page, f);
  let { dialog, reason } = await cancellation(page);
  await reason.fill("bad"); await page.keyboard.press("Tab");
  await fieldError(reason); await expect(reason).toHaveValue("bad");
  await expect(dialog.getByRole("button", { name: "Confirm cancellation", exact: true })).toBeDisabled();
  await captureWorkflow(page, "keyboard-invalid-reason", "Required/invalid reason association; retained draft");
  await trap(page, dialog);
  await reason.fill(longReason); await trap(page, dialog);
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Next status", { exact: true })).toBeFocused();
  await expect(page.locator("[inert]")).toHaveCount(0);
  ({ dialog, reason } = await cancellation(page));
  await reason.fill(longReason);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Next status", { exact: true })).toBeFocused();
  dialog = await blockedResolution(page, f);
  await trap(page, dialog); await geometry(page, dialog);
  await captureWorkflow(page, "keyboard-blocker", "Actual ACTIONS_OUTSTANDING, accurate count and keyboard Actions link");
  await actionsLink(page, dialog);
});

test("T-38 genuine 200% tab zoom preserves workflow controls, blockers, history and focus", async ({ fixture: f }) => {
  await genuineZoom(async (page, _worker, zoom) => {
    page.on("pageerror", () => f.pageErrors.push("Zoom context page error"));
    page.on("console", (message) => { if (message.type() === "warning") warnings.push("Zoom browser warning; text withheld"); });
    await login(page, f.operator); await openTicket(page, f); await unfinishedAction(page, f);
    const initialWidth = await page.evaluate(() => innerWidth);
    expect(await zoom()).toBe(1); expect(await zoom(2)).toBe(2); await expect.poll(() => zoom()).toBe(2);
    await expect.poll(() => page.evaluate(() => innerWidth)).toBeLessThan(initialWidth);
    expect(await page.evaluate(() => visualViewport?.scale ?? 1)).toBe(1);
    await optionalDraft(page); await geometry(page); await reach(page.getByLabel("Reason (optional)", { exact: true }));
    const { dialog, reason } = await cancellation(page);
    await reason.fill(longReason); await trap(page, dialog); await geometry(page, dialog);
    await reach(dialog.getByRole("button", { name: "Confirm cancellation", exact: true }));
    await captureWorkflow(page, "zoom200-cancellation", "Genuine 2.0 tab zoom: reason, explanation, reachable controls", 2, { verifiedTabZoom: await zoom(), initialCSSWidth: initialWidth });
    await page.keyboard.press("Escape"); await expect(page.getByLabel("Next status", { exact: true })).toBeFocused();
    const blocked = await blockedResolution(page, f);
    await trap(page, blocked); await geometry(page, blocked);
    await captureWorkflow(page, "zoom200-blocker", "Genuine 2.0 tab zoom: real blocker and keyboard handoff", 2, { verifiedTabZoom: await zoom() });
    await actionsLink(page, blocked);
    const history = await saveOrdinaryReason(page, f);
    await history.scrollIntoViewIfNeeded();
    await captureWorkflow(page, "zoom200-history", "Genuine 2.0 tab zoom: real long history reason", 2, { verifiedTabZoom: await zoom() });
    await historyWrap(page, history);
    expect(await zoom(1)).toBe(1); await expect.poll(() => page.evaluate(() => innerWidth)).toBe(initialWidth);
    console.info("Workflow tab zoom verified 1.0 -> 2.0 -> 1.0; CSS viewport changed; pinch scale stayed 1; helper closes/removes the owned profile.");
  });
});
