import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import { reachable } from "./action-layout-helpers.js";

const phase = process.env.TOKTICKIT_STAFF_A11Y_CAPTURE_PHASE ?? "initial";
if (!["initial", "final"].includes(phase)) throw new Error("Invalid Staff accessibility capture phase");
export const accessibilityDirectory = join(process.cwd(), "artifacts/lab-04/screenshots/staff-dashboard/accessibility-2026-10-28", phase);
const executionHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const pendingSourcePaths = execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" }).trim().split(/\r?\n/).filter(path => path.startsWith("client/src/"));

export async function reach(control: Locator) {
  await control.evaluate(element => element.scrollIntoView({ block: "center", inline: "nearest" }));
  // The existing helper waits for browser layout/scroll stability before
  // hit-testing, including native tab zoom; immediate DOM reads do not.
  await reachable(control);
}

// Compute underlying rendered sRGB styles, compositing translucent foreground
// and ancestor backgrounds. Reject image/opacity environments we do not model.
// No screenshot-pixel/anti-aliasing guess and no retry-until-ratio-passes loop.
export async function contrastSample(page: Page, target: Locator, kind: "text" | "boundary" | "focus" = "text") {
  await page.mouse.move(0, 0);
  await target.evaluate(async element => {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => undefined)));
  });
  return target.evaluate((element, kind) => {
    type RGBA = [number, number, number, number];
    const rgba = (text: string): RGBA => {
      const parts = (text.match(/[\d.]+/g) ?? []).map(Number);
      if (!/^rgba?\(/.test(text) || parts.length < 3) throw new Error("Unsupported contrast color representation");
      return [parts[0]!, parts[1]!, parts[2]!, parts[3] ?? 1];
    };
    const over = (front: RGBA, back: RGBA): RGBA => [0, 1, 2].map(i => front[i]! * front[3] + back[i]! * (1 - front[3])).concat(1) as RGBA;
    const background = (node: Element | null): RGBA => {
      const chain: Element[] = [];
      for (let current = node; current; current = current.parentElement) chain.unshift(current);
      return chain.reduce<RGBA>((back, current) => {
        const style = getComputedStyle(current);
        if (style.backgroundImage !== "none" && current.tagName !== "SELECT" || Number(style.opacity) !== 1) throw new Error("Unsupported image/opacity contrast environment");
        return over(rgba(style.backgroundColor), back);
      }, [255, 255, 255, 1]);
    };
    const luminance = (color: RGBA) => color.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
      .reduce((sum, v, i) => sum + v * [ .2126, .7152, .0722 ][i]!, 0);
    const ratio = (a: RGBA, b: RGBA) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
    const style = getComputedStyle(element), inner = background(element), outer = background(element.parentElement);
    let source = style.color, indicator = "text";
    if (kind === "boundary") { source = style.borderTopColor; indicator = "border"; }
    if (kind === "focus") {
      if (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) { source = style.outlineColor; indicator = "outline"; }
      else { source = style.borderTopColor; indicator = "focused border"; }
    }
    const raw = rgba(source), fontSize = parseFloat(style.fontSize), weight = Number(style.fontWeight);
    const large = fontSize >= 24 || fontSize >= 18.6667 && weight >= 700;
    const pairs = kind === "text" ? [inner] : kind === "focus" ? [outer] : [inner, outer];
    return { kind, indicator, sourceColor: source, effectiveBackgrounds: pairs.map(color => color.slice(0, 3)),
      ratios: pairs.map(back => ratio(over(raw, back), back)), threshold: kind === "text" && !large ? 4.5 : 3,
      fontSize, fontWeight: style.fontWeight, enabled: !(element as HTMLInputElement).disabled,
      selectArrowExcludedFromSolidTextAndBorderSample: element.tagName === "SELECT", outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, borderStyle: style.borderTopStyle, borderWidth: style.borderTopWidth };
  }, kind);
}
export type ContrastSample = Awaited<ReturnType<typeof contrastSample>>;
export function assertContrast(samples: Record<string, ContrastSample>) {
  for (const [label, sample] of Object.entries(samples)) {
    expect(sample.enabled, `${label} is an active control/text sample`).toBe(true);
    for (const ratio of sample.ratios) expect(ratio, `${label}: ${sample.indicator} contrast against actual effective background`).toBeGreaterThanOrEqual(sample.threshold);
  }
}
export function recordMeasurements(name: string, values: unknown) {
  mkdirSync(accessibilityDirectory, { recursive: true });
  writeFileSync(join(accessibilityDirectory, `${name}.json`), JSON.stringify({ executionHead, pendingSourcePaths, ...values as object }, null, 2) + "\n");
}
export async function captureAccessibility(page: Page, name: string, state: string, zoom = 1, extra: object = {}) {
  mkdirSync(accessibilityDirectory, { recursive: true });
  const session = await page.context().newCDPSession(page);
  let browser: string;
  try {
    browser = (await session.send("Browser.getVersion")).product;
    if (zoom === 2) {
      const capture = await session.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      writeFileSync(join(accessibilityDirectory, `${name}.png`), Buffer.from(capture.data, "base64"));
    } else await page.screenshot({ path: join(accessibilityDirectory, `${name}.png`), animations: "disabled" });
  } finally { await session.detach(); }
  const cssViewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, pinchScale: visualViewport?.scale ?? 1, devicePixelRatio }));
  recordMeasurements(name, { screenshot: `${name}.png`, browser, date: new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "medium" }).format(new Date()),
    timezone: "Asia/Bangkok", state, role: "IT_STAFF", configuredViewport: page.viewportSize(),
    nativeWindow: page.viewportSize() === null ? { width: 1440, height: 900 } : null, cssViewport,
    zoomFactor: zoom, zoomMethod: zoom === 2 ? "chrome.tabs.setZoom/getZoom; unchanged genuineZoom extension helper; native CDP capture" : "Unmodified browser tab zoom",
    visualInspection: "Pending", syntheticDataOnly: true, ...extra });
}
