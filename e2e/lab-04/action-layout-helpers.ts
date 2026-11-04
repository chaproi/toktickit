import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { chromium, expect, type BrowserContext, type Locator, type Page, type Worker } from "@playwright/test";
import { syntheticAction, type Fixture } from "./action-browser-fixtures.js";

export const viewports = [{ width: 390, height: 844 }, { width: 834, height: 1112 }, { width: 1440, height: 900 }] as const;
export const artifactDirectory = join(process.cwd(), "artifacts", "lab-04", "screenshots", "actions-taken");
const testedCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
export const longDescription = "Investigate the intermittent connection 😀 and retain literal <script>diagnostic text</script>. ".repeat(3) + "DiagnosticReferenceWithoutSpaces".repeat(7);
export const longNote = "Coordinate the follow-up with the requester ภาษาไทย 😀 and retain this detailed diagnosis. ".repeat(4).trim();
export const longAttachmentNotes = "Literal notes only <a href='/private-file'>not an attachment link</a> 😀 ".repeat(3).trim();

export async function layoutData(f: Fixture) {
  const assigneeName = "Assigned worker with a long multilingual name ภาษาไทย " + "DiagnosticCoordinator".repeat(3);
  const ownerName = "Ticket Owner with historical coordinating responsibility " + "Operations".repeat(5);
  await f.prisma.user.update({ where: { id: f.assignee.id }, data: { name: assigneeName } });
  await f.prisma.user.update({ where: { id: f.owner.id }, data: { name: ownerName } });
  const action = await syntheticAction(f, { description: longDescription, status: "IN_PROGRESS", followUpNote: longNote, attachmentNotes: longAttachmentNotes });
  await syntheticAction(f, { description: "Current operator assignment: " + longDescription, assigneeId: f.operator.id, attachmentNotes: longAttachmentNotes });
  return action;
}

export async function capture(page: Page, name: string, role: string, state: string, zoom = 1, extra: Record<string, unknown> = {}) {
  mkdirSync(artifactDirectory, { recursive: true });
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "medium" }).format(new Date());
  const session = await page.context().newCDPSession(page);
  let browserVersion: string;
  try {
    browserVersion = (await session.send("Browser.getVersion")).product;
    if (zoom === 2) {
      // Native compositor capture preserves tab zoom; Playwright viewport emulation must not reset it.
      const result = await session.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      writeFileSync(join(artifactDirectory, `${name}.png`), Buffer.from(result.data, "base64"));
    } else await page.screenshot({ path: join(artifactDirectory, `${name}.png`), animations: "disabled", fullPage: false });
  } finally { await session.detach(); }
  writeFileSync(join(artifactDirectory, `${name}.json`), JSON.stringify({
    screenshot: `${name}.png`, date, timezone: "Asia/Bangkok", testedCommit,
    browser: "Chromium", browserVersion,
    viewport: page.viewportSize() ?? await page.evaluate(() => ({ width: innerWidth, height: innerHeight })),
    viewportMeaning: zoom === 2 ? "Native CSS viewport after real browser tab zoom; no emulated viewport" : "Configured CSS viewport at 100% zoom",
    role, screenState: state, zoomFactor: zoom,
    zoomMethod: zoom === 2 ? "chrome.tabs.setZoom/getZoom via existing tab-zoom extension" : "unmodified browser zoom",
    syntheticDataOnly: true, visualInspection: "Pending manual inspection", ...extra,
  }, null, 2) + "\n");
}

export async function geometry(page: Page, scope?: Locator) {
  const root = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  const pageOverflow = await page.locator("main *").evaluateAll(nodes => nodes.filter(element => {
    const r = element.getBoundingClientRect(); return r.width > 0 && r.right > document.documentElement.clientWidth + 1;
  }).slice(0, 12).map(element => `${element.tagName}.${element.className}`));
  expect(root.scroll, `No unintended horizontal page overflow; offending elements: ${pageOverflow.join(", ")}`).toBeLessThanOrEqual(root.width + 1);
  const elements = (scope ?? page.getByRole("main")).locator("h1,h2,h3,h4,dt,dd,form,fieldset,select,input,textarea,button,nav");
  const overflow = await elements.evaluateAll((nodes) => nodes.filter((element) => {
    const box = element.getBoundingClientRect(), style = getComputedStyle(element);
    return box.width > 0 && box.height > 0 && style.visibility !== "hidden" &&
      (box.left < -1 || box.right > document.documentElement.clientWidth + 1 ||
       !["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) && element.scrollWidth > element.clientWidth + 1);
  }).map((element) => `${element.tagName} ${element.id}`));
  expect(overflow, "Visible text and controls wrap within their containers").toEqual([]);
}

export async function reachable(control: Locator) {
  await control.scrollIntoViewIfNeeded(); await expect(control).toBeVisible();
  const result = await control.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    let parent = element.parentElement;
    const clips: string[] = [];
    while (parent) {
      const style = getComputedStyle(parent), outer = parent.getBoundingClientRect();
      if (/^(auto|scroll|hidden|clip)$/.test(style.overflowY) && (box.top < outer.top - 1 || box.bottom > outer.bottom + 1)) clips.push(parent.tagName);
      parent = parent.parentElement;
    }
    return { visible: box.left >= -1 && box.right <= innerWidth + 1 && box.top >= -1 && box.bottom <= innerHeight + 1,
      unobscured: Boolean(hit && (element === hit || element.contains(hit))), clips,
      debug: { target: element.tagName, hit: hit?.tagName ?? null, width: innerWidth, height: innerHeight,
        box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
        scale: visualViewport?.scale, offsetLeft: visualViewport?.offsetLeft, offsetTop: visualViewport?.offsetTop } };
  });
  if (!result.visible || !result.unobscured || result.clips.length) console.info(`Safe control geometry: ${JSON.stringify(result)}`);
  expect(result, "Control is reachable and unobscured").toMatchObject({ visible: true, unobscured: true, clips: [] });
}

export async function keyboardFocus(page: Page, target: Locator) {
  // Programmatically choose the starting point, then verify real keyboard arrival.
  await target.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
  await expect(target).toBeFocused(); await reachable(target);
  const styled = await target.evaluate((element) => { const s = getComputedStyle(element);
    return s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0 || s.boxShadow !== "none"; });
  expect(styled, "Focused control has a visible computed focus treatment").toBe(true);
}

export async function trap(page: Page, dialog: Locator) {
  await expect(dialog).toHaveAttribute("aria-modal", "true"); await expect(dialog).toHaveAttribute("aria-labelledby");
  await expect(dialog).toHaveAttribute("aria-describedby");
  const controls = dialog.locator("button:enabled,input:enabled,textarea:enabled,select:enabled");
  const first = controls.first(), last = controls.last();
  await first.focus(); await page.keyboard.press("Shift+Tab"); await expect(last).toBeFocused();
  await page.keyboard.press("Tab"); await expect(first).toBeFocused();
  await last.focus(); await page.keyboard.press("Tab"); await expect(first).toBeFocused();
  await expect(page.locator("[inert]")).not.toHaveCount(0);
  const background = page.getByRole("button", { name: "Logout", includeHidden: true });
  await background.evaluate((element) => (element as HTMLElement).focus());
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await keyboardFocus(page, first);
}

export async function fieldError(field: Locator) {
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(field).toHaveAccessibleDescription(/.+/);
  expect(await field.evaluate((element) => (element.getAttribute("aria-describedby") ?? "").split(/\s+/).every((id) => Boolean(document.getElementById(id)?.textContent?.trim())))).toBe(true);
}

export async function contrast(target: Locator) {
  const ratio = await target.evaluate((element) => {
    const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
    const foreground = rgb(getComputedStyle(element).color);
    let background = [255, 255, 255], node: Element | null = element;
    while (node) { const candidate = rgb(getComputedStyle(node).backgroundColor);
      if (candidate.length === 3 || candidate[3] === 1) { background = candidate; break; }
      node = node.parentElement;
    }
    const luminance = (colors: number[]) => colors.slice(0, 3).map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0);
    const a = luminance(foreground), b = luminance(background);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  expect(ratio, "Sampled normal text contrast").toBeGreaterThanOrEqual(4.5);
  return Number(ratio.toFixed(2));
}

async function tabZoom(worker: Worker, page: Page, factor?: number) {
  return worker.evaluate(async ({ url, factor }) => {
    const controller = (globalThis as unknown as { toktickitTabZoom: { get(url: string): Promise<number>; set(url: string, factor: number): Promise<number> } }).toktickitTabZoom;
    if (!controller) throw new Error("ZOOM_BLOCKED: existing extension controller unavailable");
    return factor === undefined ? controller.get(url) : controller.set(url, factor);
  }, { url: page.url(), factor });
}

export async function genuineZoom(callback: (page: Page, worker: Worker, zoom: (factor?: number) => Promise<number>) => Promise<void>) {
  const root = realpathSync(tmpdir()), profile = mkdtempSync(join(root, "issue45-tab-zoom-"));
  const extension = join(process.cwd(), "e2e", "fixtures", "tab-zoom-extension");
  let context: BrowserContext | undefined;
  try {
    context = await chromium.launchPersistentContext(profile, { channel: "chromium", headless: true,
      baseURL: "http://127.0.0.1:4173", viewport: null,
      // Use a native window: device-metrics viewport emulation interferes with genuine tab zoom.
      args: ["--window-size=1440,900", `--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const page = await context.newPage();
    await page.bringToFront();
    try { await callback(page, worker, (factor) => tabZoom(worker, page, factor)); }
    finally {
      if (page.url().startsWith("http://127.0.0.1:4173")) { expect(await tabZoom(worker, page, 1)).toBe(1); }
      await page.close();
    }
  } finally {
    await context?.close();
    const relativeProfile = relative(root, resolve(profile));
    if (!relativeProfile || relativeProfile.startsWith(`..${sep}`) || relativeProfile === ".." || !relativeProfile.startsWith("issue45-tab-zoom-")) throw new Error("Refusing unowned profile cleanup");
    rmSync(profile, { recursive: true, force: true });
    console.info("Issue45 owned zoom context closed, tab zoom restored and temporary profile removed.");
  }
}
