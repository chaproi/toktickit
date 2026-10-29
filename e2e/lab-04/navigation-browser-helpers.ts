import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";

// Only observations/owned evidence. Authentication and all successful responses
// remain real; no session material is written to the evidence directory.
export type NavigationRole = "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR";
export const destination = (role: NavigationRole) => role === "REQUESTER" ? "/dashboard" : "/staff/dashboard";
export const dashboardEndpoint = (role: NavigationRole) => `/api/dashboard/${role === "REQUESTER" ? "requester" : "staff"}`;
export const dashboardHeading = (role: NavigationRole) => role === "REQUESTER" ? "Requester Dashboard" : "Staff Dashboard";

export async function observeDashboard(page: Page, role: NavigationRole, action: () => Promise<unknown>) {
  const [response] = await Promise.all([
    page.waitForResponse(value => new URL(value.url()).pathname === dashboardEndpoint(role) && value.request().method() === "GET"), action(),
  ]);
  expect(response.status()).toBe(200);
  const data = await response.json();
  await expect(page.getByRole("heading", { name: dashboardHeading(role), exact: true })).toBeVisible();
  await expect(page.getByText(/As of/)).toBeVisible();
  return data;
}

export async function observedLogin(page: Page, actor: { email: string; password: string }, role: NavigationRole) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(actor.email);
  await page.getByLabel("Password", { exact: true }).fill(actor.password);
  // Observe the real automatic landing, before any subsequent navigation.
  const body = await observeDashboard(page, role, async () => {
    const [response] = await Promise.all([
      page.waitForResponse(value => new URL(value.url()).pathname === "/api/auth/login" && value.request().method() === "POST"),
      page.getByRole("button", { name: "Sign in", exact: true }).click(),
    ]);
    expect(response.status()).toBe(200);
  });
  await expect(page).toHaveURL(new RegExp(`${destination(role)}$`));
  return body;
}

export async function activeNavigation(page: Page, name: string) {
  const nav = page.getByRole("navigation", { name: "Primary navigation", exact: true });
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(nav.getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name, exact: true })).toHaveClass(/active/);
}

export async function captureNavigation(page: Page, name: string, role: NavigationRole, state: string, zoom = 1, extra: Record<string, unknown> = {}) {
  const directory = join(process.cwd(), "artifacts/lab-04/screenshots/dashboard-navigation");
  mkdirSync(directory, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  try {
    const version = await cdp.send("Browser.getVersion");
    const image = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    writeFileSync(join(directory, `${name}.png`), Buffer.from(image.data, "base64"));
    writeFileSync(join(directory, `${name}.json`), JSON.stringify({
      screenshot: `${name}.png`, date: new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "medium" }).format(new Date()),
      timezone: "Asia/Bangkok", executionHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      pendingPaths: execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean),
      pendingUntrackedPaths: execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean),
      pendingProductionPaths: execFileSync("git", ["diff", "--name-only", "--", "client/src", "server/src"], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean),
      browser: version.product, role, state, zoomFactor: zoom,
      zoomMethod: zoom === 2 ? "chrome.tabs.setZoom/getZoom; native compositor capture" : "unmodified tab zoom",
      viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight, pinchScale: visualViewport?.scale })),
      syntheticDataOnly: true, visualInspection: "Pending inspection", ...extra,
    }, null, 2) + "\n");
  } finally { await cdp.detach(); }
}
