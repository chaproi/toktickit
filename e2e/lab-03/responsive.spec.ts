import { randomBytes, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { hashPassword } from "../../server/src/auth/password.js";
import { getPrisma } from "../../server/src/prisma.js";

type Role = "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR";
type ScreenName =
  | "login"
  | "change-password"
  | "requester-ticket-detail"
  | "staff-ticket-queue"
  | "staff-ticket-detail"
  | "admin-user-management";

const VIEWPORTS = [
  { label: "mobile-390x844", width: 390, height: 844 },
  { label: "tablet-834x1112", width: 834, height: 1112 },
  { label: "desktop-1440x900", width: 1440, height: 900 },
] as const;

async function createUser(role: Role, label: string, mustChangePassword = false) {
  const password = `Aa1!${randomBytes(18).toString("base64url")}`;
  const suffix = randomUUID();
  const user = await getPrisma().user.create({
    data: {
      name: `Issue 37 ${label} ${suffix.slice(0, 6)}`,
      email: `issue37-${label}-${suffix}@example.test`,
      role,
      passwordHash: await hashPassword(password),
      mustChangePassword,
    },
  });
  return { user, password };
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  const [response] = await Promise.all([
    page.waitForResponse((candidate) => new URL(candidate.url()).pathname === "/api/auth/login"),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
  expect(response.ok()).toBe(true);
  await page.waitForURL((url) => url.pathname !== "/login");
}

async function assertResponsiveGeometry(page: Page) {
  const geometry = await page.evaluate(() => {
    const root = document.documentElement;
    const visible = [...document.querySelectorAll<HTMLElement>("main, section, form, table, button, input, select, textarea")]
      .filter((element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
      });
    return {
      pageWidth: root.scrollWidth,
      viewportWidth: root.clientWidth,
      horizontallyClipped: visible
        .filter((element) => {
          const box = element.getBoundingClientRect();
          let ancestor = element.parentElement;
          let boundedScroller = false;
          while (ancestor) {
            const overflow = getComputedStyle(ancestor).overflowX;
            if (overflow === "auto" || overflow === "scroll") {
              boundedScroller = true;
              break;
            }
            ancestor = ancestor.parentElement;
          }
          return !boundedScroller && (box.left < -1 || box.right > root.clientWidth + 1);
        })
        .map((element) => `${element.tagName.toLowerCase()}#${element.id}.${element.className}`),
    };
  });
  expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.horizontallyClipped).toEqual([]);
}

async function capture(page: Page, viewport: typeof VIEWPORTS[number], screen: ScreenName) {
  await assertResponsiveGeometry(page);
  const path = join(process.cwd(), "artifacts", "lab-03", "screenshots", viewport.label, `${screen}.png`);
  mkdirSync(dirname(path), { recursive: true });
  await page.screenshot({ path, fullPage: false, animations: "disabled" });
}

async function createOperationalFixture(label: string) {
  const requester = await createUser("REQUESTER", `${label}-requester`);
  const staff = await createUser("IT_STAFF", `${label}-staff`);
  const administrator = await createUser("ADMINISTRATOR", `${label}-admin`);
  const forced = await createUser("REQUESTER", `${label}-forced`, true);
  const prisma = getPrisma();
  const [category, relatedSystem] = await Promise.all([
    prisma.category.findFirstOrThrow({ where: { isActive: true } }),
    prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } }),
  ]);
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `I37-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
      clientSubmissionId: randomUUID(),
      requesterId: requester.user.id,
      ownerId: staff.user.id,
      categoryId: category.id,
      relatedSystemId: relatedSystem.id,
      requestedPriority: "HIGH",
      itPriority: "URGENT",
      currentStatus: "IN_PROGRESS",
      summary: `Issue 37 responsive ${label} long content without clipping`,
      description: "Responsive evidence verifies readable essential content and required actions.",
    },
  });
  await prisma.publicComment.create({
    data: { ticketId: ticket.id, authorId: requester.user.id, content: "Public responsive evidence." },
  });
  await prisma.internalNote.create({
    data: { ticketId: ticket.id, authorId: staff.user.id, content: "Private responsive evidence." },
  });
  return { requester, staff, administrator, forced, ticket };
}

async function withPage(
  browser: Browser,
  viewport: { width: number; height: number },
  callback: (page: Page) => Promise<void>,
) {
  const context = await browser.newContext({ viewport });
  try {
    await callback(await context.newPage());
  } finally {
    await context.close();
  }
}

for (const viewport of VIEWPORTS) {
  test(`RESP-01 captures all six major screens at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const fixture = await createOperationalFixture(viewport.label);

    await withPage(browser, viewport, async (page) => {
      await page.goto("/login");
      await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
      await capture(page, viewport, "login");
    });
    await withPage(browser, viewport, async (page) => {
      await login(page, fixture.forced.user.email, fixture.forced.password);
      await expect(page.getByRole("heading", { name: "Create a new password" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Save Password" })).toBeVisible();
      await capture(page, viewport, "change-password");
    });
    await withPage(browser, viewport, async (page) => {
      await login(page, fixture.requester.user.email, fixture.requester.password);
      await page.goto(`/tickets/${fixture.ticket.id}`);
      await expect(page.getByRole("heading", { name: "Ticket Detail" })).toBeVisible();
      await expect(page.getByText(fixture.ticket.ticketNumber).first()).toBeVisible();
      await expect(page.getByLabel("Add a public comment")).toBeVisible();
      await capture(page, viewport, "requester-ticket-detail");
    });
    await withPage(browser, viewport, async (page) => {
      await login(page, fixture.staff.user.email, fixture.staff.password);
      await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
      await page.getByLabel("Search Queue").fill(`Issue 37 responsive ${viewport.label}`);
      await page.getByRole("button", { name: "Apply Filters" }).click();
      await expect(page.getByRole("link", { name: fixture.ticket.ticketNumber }).first()).toBeVisible();
      if (viewport.width < 768) {
        await expect(page.locator(".staff-queue-cards")).toBeVisible();
        await expect(page.locator(".staff-queue-table-wrap")).toBeHidden();
      }
      await capture(page, viewport, "staff-ticket-queue");
    });
    await withPage(browser, viewport, async (page) => {
      await login(page, fixture.staff.user.email, fixture.staff.password);
      await page.goto(`/staff/tickets/${fixture.ticket.id}`);
      await expect(page.getByRole("heading", { name: fixture.ticket.ticketNumber })).toBeVisible();
      const publicRegion = page.getByRole("region", { name: "Public Comments" });
      const internalRegion = page.getByRole("region", { name: "Internal Notes" });
      await expect(publicRegion).toBeVisible();
      await expect(internalRegion).toBeVisible();
      await expect(internalRegion.getByText("Internal — not visible to Requester")).toBeVisible();
      await capture(page, viewport, "staff-ticket-detail");
    });
    await withPage(browser, viewport, async (page) => {
      await login(page, fixture.administrator.user.email, fixture.administrator.password);
      await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Create User" })).toBeVisible();
      if (viewport.width < 768) {
        await expect(page.locator(".admin-user-cards")).toBeVisible();
        await expect(page.locator(".admin-user-table-wrap")).toBeHidden();
      }
      await capture(page, viewport, "admin-user-management");
    });
  });
}

test("RESP-02 keeps all six screens operable and non-color distinctions intact at 200% zoom", async ({ browser }) => {
  const fixture = await createOperationalFixture("zoom-200");
  const viewport = { width: 1440, height: 900 };

  async function zoomed(callback: (page: Page) => Promise<void>) {
    await withPage(browser, viewport, async (page) => {
      await callback(page);
      await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
      await assertResponsiveGeometry(page);
      const focusTarget = page.locator("button:visible, input:visible, select:visible, textarea:visible, a:visible").first();
      await focusTarget.focus();
      await expect(focusTarget).toBeFocused();
      const focusStyle = await focusTarget.evaluate((element) => {
        const style = getComputedStyle(element);
        return `${style.outlineStyle}|${style.boxShadow}|${style.borderColor}`;
      });
      expect(focusStyle).not.toBe("none|none|rgb(0, 0, 0)");
    });
  }

  await zoomed(async (page) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
  });
  await zoomed(async (page) => {
    await login(page, fixture.forced.user.email, fixture.forced.password);
    await page.getByRole("button", { name: "Save Password" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
  });
  await zoomed(async (page) => {
    await login(page, fixture.requester.user.email, fixture.requester.password);
    await page.goto(`/tickets/${fixture.ticket.id}`);
    await expect(page.getByLabel("Add a public comment")).toBeEditable();
    await expect(page.locator(".read-only-field").first()).toBeVisible();
  });
  await zoomed(async (page) => {
    await login(page, fixture.staff.user.email, fixture.staff.password);
    await expect(page.getByLabel("Search Queue")).toBeEditable();
  });
  await zoomed(async (page) => {
    await login(page, fixture.staff.user.email, fixture.staff.password);
    await page.goto(`/staff/tickets/${fixture.ticket.id}`);
    const publicRegion = page.getByRole("region", { name: "Public Comments" });
    const internalRegion = page.getByRole("region", { name: "Internal Notes" });
    const styles = await Promise.all([publicRegion, internalRegion].map((region) =>
      region.evaluate((element) => {
        const style = getComputedStyle(element);
        return `${style.borderLeftColor}|${style.backgroundColor}`;
      })));
    expect(styles[0]).not.toBe(styles[1]);
    await expect(page.getByLabel("IT Priority")).toBeEditable();
    await expect(page.locator(".read-only-field").first()).toBeVisible();
  });
  await zoomed(async (page) => {
    await login(page, fixture.administrator.user.email, fixture.administrator.password);
    await expect(page.getByLabel("Search users")).toBeEditable();
    await expect(page.getByRole("button", { name: "Create User" })).toBeVisible();
  });
});
