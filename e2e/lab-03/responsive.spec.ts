import { randomBytes, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
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

type RequiredElement = {
  name: string;
  locator: Locator;
  action?: boolean;
  enabled?: boolean;
};

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

async function assertRequiredElement(page: Page, required: RequiredElement) {
  const target = required.locator.first();
  await target.evaluate((element) => {
    const previous = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "auto";
    element.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
    document.documentElement.style.scrollBehavior = previous;
  });
  await expect(target, `${required.name} must remain visible`).toBeVisible();
  if (required.action && required.enabled !== false) {
    await expect(target, `${required.name} must remain enabled`).toBeEnabled();
  }
  const geometry = await target.evaluate((element, checkHitTarget) => {
    const targetElement = element as HTMLElement;
    const rectangle = targetElement.getBoundingClientRect();
    const clippingAncestors: string[] = [];
    let ancestor = targetElement.parentElement;
    while (ancestor) {
      const style = getComputedStyle(ancestor);
      const ancestorRectangle = ancestor.getBoundingClientRect();
      const clipsX = /^(auto|clip|hidden|scroll)$/u.test(style.overflowX);
      const clipsY = /^(auto|clip|hidden|scroll)$/u.test(style.overflowY);
      if ((clipsX && (rectangle.left < ancestorRectangle.left - 1 || rectangle.right > ancestorRectangle.right + 1)) ||
          (clipsY && (rectangle.top < ancestorRectangle.top - 1 || rectangle.bottom > ancestorRectangle.bottom + 1))) {
        clippingAncestors.push(`${ancestor.tagName.toLowerCase()}#${ancestor.id}.${ancestor.className}`);
      }
      ancestor = ancestor.parentElement;
    }
    const viewportRectangle = {
      left: 0,
      top: 0,
      right: innerWidth,
      bottom: innerHeight,
    };
    const centerX = Math.max(viewportRectangle.left + 1, Math.min(viewportRectangle.right - 1,
      rectangle.left + rectangle.width / 2));
    const centerY = Math.max(viewportRectangle.top + 1, Math.min(viewportRectangle.bottom - 1,
      rectangle.top + rectangle.height / 2));
    const hit = document.elementFromPoint(centerX, centerY);
    return {
      hasArea: rectangle.width > 0 && rectangle.height > 0,
      rectangle: { left: rectangle.left, top: rectangle.top, right: rectangle.right, bottom: rectangle.bottom },
      viewportRectangle,
      inViewport: rectangle.left >= viewportRectangle.left - 1 &&
        rectangle.right <= viewportRectangle.right + 1 &&
        rectangle.top >= viewportRectangle.top - 1 &&
        rectangle.bottom <= viewportRectangle.bottom + 1,
      clippingAncestors,
      unobscured: !checkHitTarget || Boolean(hit && (targetElement === hit || targetElement.contains(hit))),
    };
  }, Boolean(required.action));
  expect(geometry.hasArea, `${required.name} must have rendered geometry`).toBe(true);
  expect(geometry.inViewport,
    `${required.name} must be scrollable fully into the visible viewport: ${JSON.stringify(geometry)}`).toBe(true);
  expect(geometry.clippingAncestors, `${required.name} must not be clipped by an overflow ancestor`).toEqual([]);
  expect(geometry.unobscured, `${required.name} must be hit-testable and unobscured`).toBe(true);
}

async function assertNoMaterialOverlap(elements: RequiredElement[]) {
  const resolved = [];
  for (const required of elements) {
    const locator = required.locator.first();
    await expect(locator).toBeVisible();
    resolved.push({ required, handle: await locator.elementHandle() });
  }
  for (let leftIndex = 0; leftIndex < resolved.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < resolved.length; rightIndex += 1) {
      const left = resolved[leftIndex]!;
      const right = resolved[rightIndex]!;
      expect(left.handle).not.toBeNull();
      expect(right.handle).not.toBeNull();
      const overlap = await left.required.locator.first().evaluate((leftElement, rightElement) => {
        if (!(rightElement instanceof Element) || leftElement.contains(rightElement) || rightElement.contains(leftElement)) {
          return { width: 0, height: 0 };
        }
        const leftRectangle = leftElement.getBoundingClientRect();
        const rightRectangle = rightElement.getBoundingClientRect();
        return {
          width: Math.max(0, Math.min(leftRectangle.right, rightRectangle.right) -
            Math.max(leftRectangle.left, rightRectangle.left)),
          height: Math.max(0, Math.min(leftRectangle.bottom, rightRectangle.bottom) -
            Math.max(leftRectangle.top, rightRectangle.top)),
        };
      }, right.handle);
      expect(
        overlap.width > 2 && overlap.height > 2,
        `${left.required.name} must not materially overlap ${right.required.name}`,
      ).toBe(false);
    }
  }
  await Promise.all(resolved.map(({ handle }) => handle?.dispose()));
}

async function assertScreenLayout(page: Page, elements: RequiredElement[]) {
  await assertResponsiveGeometry(page);
  for (const required of elements) await assertRequiredElement(page, required);
  await assertNoMaterialOverlap(elements);
}

async function reachByKeyboard(page: Page, target: Locator, reverse = false) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await page.keyboard.press(reverse ? "Shift+Tab" : "Tab");
    if (await target.first().evaluate((element) => document.activeElement === element)) return;
  }
  throw new Error(`Keyboard navigation did not reach ${await target.first().getAttribute("aria-label") ??
    await target.first().textContent() ?? "the required control"}.`);
}

async function assertVisibleKeyboardFocus(page: Page, target: Locator) {
  await expect(target).toBeFocused();
  await target.evaluate((element) => {
    const previous = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "auto";
    element.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
    document.documentElement.style.scrollBehavior = previous;
  });
  const focus = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    const rectangle = element.getBoundingClientRect();
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    const right = left + (viewport?.width ?? innerWidth);
    const bottom = top + (viewport?.height ?? innerHeight);
    const intersectionLeft = Math.max(rectangle.left, left);
    const intersectionTop = Math.max(rectangle.top, top);
    const intersectionRight = Math.min(rectangle.right, right);
    const intersectionBottom = Math.min(rectangle.bottom, bottom);
    const hitX = intersectionLeft + Math.max(1, (intersectionRight - intersectionLeft) / 2);
    const hitY = intersectionTop + Math.max(1, (intersectionBottom - intersectionTop) / 2);
    const hit = document.elementFromPoint(hitX, hitY);
    return {
      styled: (style.outlineStyle !== "none" && style.outlineWidth !== "0px") || style.boxShadow !== "none",
      visible: intersectionRight - intersectionLeft > 2 && intersectionBottom - intersectionTop > 2,
      unobscured: Boolean(hit && (element === hit || element.contains(hit))),
    };
  });
  expect(focus.styled).toBe(true);
  expect(focus.visible).toBe(true);
  expect(focus.unobscured).toBe(true);
}

async function withBrowserZoom(page: Page, callback: () => Promise<void>) {
  const session = await page.context().newCDPSession(page);
  try {
    const before = await page.evaluate(() => ({
      scale: visualViewport?.scale ?? 1,
      width: visualViewport?.width ?? innerWidth,
      innerWidth,
    }));
    expect(before.scale).toBe(1);
    await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
    await expect.poll(() => page.evaluate(() => visualViewport?.scale ?? 1)).toBe(2);
    const zoomed = await page.evaluate(() => ({
      scale: visualViewport?.scale ?? 1,
      width: visualViewport?.width ?? innerWidth,
      innerWidth,
    }));
    expect(zoomed.scale).toBe(2);
    expect(zoomed.width).toBeCloseTo(before.width / 2, 0);
    expect(zoomed.innerWidth).toBe(before.innerWidth);
    await callback();
  } finally {
    await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
    await expect.poll(() => page.evaluate(() => visualViewport?.scale ?? 1)).toBe(1);
    await session.detach();
  }
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

function loginElements(page: Page): RequiredElement[] {
  return [
    { name: "Login heading", locator: page.getByRole("heading", { name: "Sign in" }) },
    { name: "Email control", locator: page.getByLabel("Email"), action: true },
    { name: "Password control", locator: page.getByLabel("Password", { exact: true }), action: true },
    { name: "Show password control", locator: page.getByLabel("Show password"), action: true },
    { name: "Sign in action", locator: page.getByRole("button", { name: "Sign in" }), action: true },
  ];
}

function changePasswordElements(page: Page): RequiredElement[] {
  return [
    { name: "Change Password heading", locator: page.getByRole("heading", { name: "Create a new password" }) },
    { name: "Mandatory password status", locator: page.getByRole("status") },
    { name: "Current Password control", locator: page.getByLabel("Current Password"), action: true },
    { name: "New Password control", locator: page.getByLabel("New Password", { exact: true }), action: true },
    { name: "Confirm New Password control", locator: page.getByLabel("Confirm New Password"), action: true },
    { name: "Save Password action", locator: page.getByRole("button", { name: "Save Password" }), action: true },
    { name: "Logout action", locator: page.getByRole("button", { name: "Logout" }), action: true },
  ];
}

function requesterDetailElements(page: Page, ticketNumber: string): RequiredElement[] {
  return [
    { name: "Requester Ticket Detail heading", locator: page.getByRole("heading", { name: "Ticket Detail" }) },
    { name: "Requester Ticket number", locator: page.getByText(ticketNumber).first() },
    { name: "Requester read-only information", locator: page.locator(".read-only-field").first() },
    { name: "Back to My Tickets action", locator: page.getByRole("link", { name: "Back to My Tickets" }), action: true },
    { name: "Resolution indication action", locator: page.getByRole("button", { name: "Problem Appears Resolved" }), action: true },
    { name: "Public comment control", locator: page.getByLabel("Add a public comment"), action: true },
    { name: "Post public comment action", locator: page.getByRole("button", { name: "Post comment" }), action: true },
  ];
}

function staffQueueElements(page: Page, ticketNumber: string): RequiredElement[] {
  return [
    { name: "Staff Queue heading", locator: page.getByRole("heading", { name: "Ticket Queue" }) },
    { name: "Queue search control", locator: page.getByLabel("Search Queue"), action: true },
    { name: "Queue Category control", locator: page.getByLabel("Category"), action: true },
    { name: "Queue Status control", locator: page.getByLabel("Status"), action: true },
    { name: "Queue Owner control", locator: page.getByLabel("Owner"), action: true },
    { name: "Apply Filters action", locator: page.getByRole("button", { name: "Apply Filters" }), action: true },
    { name: "Clear Filters action", locator: page.getByRole("button", { name: "Clear Filters" }), action: true },
    { name: "Matching Ticket link", locator: page.getByRole("link", { name: ticketNumber }).first(), action: true },
    { name: "Open Ticket action", locator: page.getByRole("link", { name: "Open Ticket" }).first(), action: true },
  ];
}

function staffDetailElements(page: Page, ticketNumber: string): RequiredElement[] {
  return [
    { name: "Staff Ticket heading", locator: page.getByRole("heading", { name: ticketNumber }) },
    { name: "Requester-reported heading", locator: page.getByRole("heading", { name: "Requester-reported information" }) },
    { name: "Staff read-only information", locator: page.locator(".read-only-field").first() },
    { name: "Back to Queue action", locator: page.getByRole("link", { name: "Back to Queue" }), action: true },
    { name: "Assign Ticket action", locator: page.getByRole("button", { name: "Assign Ticket" }), action: true },
    { name: "IT Priority control", locator: page.getByLabel("IT Priority"), action: true },
    { name: "Public Comments heading", locator: page.getByRole("heading", { name: "Public Comments" }) },
    { name: "Internal Notes heading", locator: page.getByRole("heading", { name: "Internal Notes" }) },
    { name: "Staff public comment control", locator: page.getByLabel("Add a public comment"), action: true },
    { name: "Internal note control", locator: page.getByLabel("Add an internal note"), action: true },
  ];
}

function administratorElements(page: Page): RequiredElement[] {
  return [
    { name: "User Management heading", locator: page.getByRole("heading", { name: "User Management" }) },
    { name: "User search control", locator: page.getByLabel("Search users"), action: true },
    { name: "User role filter", locator: page.getByLabel("Role", { exact: true }), action: true },
    { name: "Search users action", locator: page.getByRole("button", { name: "Search" }), action: true },
    { name: "Clear Search action", locator: page.getByRole("button", { name: "Clear Search" }), action: true },
    { name: "Create User action", locator: page.getByRole("button", { name: "Create User" }).first(), action: true },
    { name: "Edit User action", locator: page.getByRole("button", { name: "Edit" }).first(), action: true },
  ];
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
      await assertScreenLayout(page, loginElements(page));
      await capture(page, viewport, "login");
    });
    await withPage(browser, viewport, async (page) => {
      await login(page, fixture.forced.user.email, fixture.forced.password);
      await expect(page.getByRole("heading", { name: "Create a new password" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Save Password" })).toBeVisible();
      await assertScreenLayout(page, changePasswordElements(page));
      await capture(page, viewport, "change-password");
    });
    await withPage(browser, viewport, async (page) => {
      await login(page, fixture.requester.user.email, fixture.requester.password);
      await page.goto(`/tickets/${fixture.ticket.id}`);
      await expect(page.getByRole("heading", { name: "Ticket Detail" })).toBeVisible();
      await expect(page.getByText(fixture.ticket.ticketNumber).first()).toBeVisible();
      await expect(page.getByLabel("Add a public comment")).toBeVisible();
      await assertScreenLayout(page, requesterDetailElements(page, fixture.ticket.ticketNumber));
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
      await assertScreenLayout(page, staffQueueElements(page, fixture.ticket.ticketNumber));
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
      await assertScreenLayout(page, staffDetailElements(page, fixture.ticket.ticketNumber));
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
      await assertScreenLayout(page, administratorElements(page));
      await capture(page, viewport, "admin-user-management");
    });
  });
}

test("RESP-02 keeps all six screens operable with keyboard and accessibility semantics at genuine 200% browser zoom", async ({ browser }) => {
  const fixture = await createOperationalFixture("zoom-200");
  const viewport = { width: 1440, height: 900 };

  await withPage(browser, viewport, async (page) => {
    await page.goto("/login");
    await withBrowserZoom(page, async () => {
      await expect(page.getByRole("main")).toBeVisible();
      const email = page.getByLabel("Email");
      const password = page.getByLabel("Password", { exact: true });
      const reveal = page.getByLabel("Show password");
      const submit = page.getByRole("button", { name: "Sign in" });
      await reachByKeyboard(page, email);
      await assertVisibleKeyboardFocus(page, email);
      await reachByKeyboard(page, reveal);
      await assertVisibleKeyboardFocus(page, reveal);
      await page.keyboard.press("Space");
      await expect(password).toHaveAttribute("type", "text");
      await page.keyboard.press("Shift+Tab");
      await expect(password).toBeFocused();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await expect(submit).toBeFocused();
      await page.keyboard.press("Enter");
      const alert = page.getByRole("alert");
      await expect(alert).toBeVisible();
      await expect(email).toHaveAttribute("aria-invalid", "true");
      await expect(email).toHaveAttribute("aria-describedby", "login-email-error");
      await expect(password).toHaveAttribute("aria-invalid", "true");
      await expect(password).toHaveAttribute("aria-describedby", "login-password-error");
      await assertScreenLayout(page, [...loginElements(page), { name: "Login validation alert", locator: alert }]);
    });
  });

  await withPage(browser, viewport, async (page) => {
    await login(page, fixture.forced.user.email, fixture.forced.password);
    await withBrowserZoom(page, async () => {
      const save = page.getByRole("button", { name: "Save Password" });
      await reachByKeyboard(page, save);
      await assertVisibleKeyboardFocus(page, save);
      await page.keyboard.press("Enter");
      const alert = page.getByRole("alert");
      await expect(alert).toBeVisible();
      for (const [label, description] of [
        ["Current Password", "current-password-error"],
        ["New Password", "new-password-error"],
        ["Confirm New Password", "confirm-password-error"],
      ] as const) {
        const control = page.getByLabel(label, { exact: true });
        await expect(control).toHaveAttribute("aria-invalid", "true");
        await expect(control).toHaveAttribute("aria-describedby", new RegExp(description));
      }
      await assertScreenLayout(page, [...changePasswordElements(page), { name: "Password validation alert", locator: alert }]);
    });
  });

  await withPage(browser, viewport, async (page) => {
    await login(page, fixture.requester.user.email, fixture.requester.password);
    await page.goto(`/tickets/${fixture.ticket.id}`);
    await withBrowserZoom(page, async () => {
      await expect(page.getByRole("main")).toBeVisible();
      await expect(page.locator(".read-only-field").first()).toBeVisible();
      await expect(page.getByLabel("Add a public comment")).toBeEditable();
      const resolution = page.getByRole("button", { name: "Problem Appears Resolved" });
      await reachByKeyboard(page, resolution);
      await assertVisibleKeyboardFocus(page, resolution);
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Does the problem appear resolved?" });
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAttribute("aria-describedby", "resolution-description");
      const cancel = dialog.getByRole("button", { name: "Cancel" });
      const confirm = dialog.getByRole("button", { name: "Yes, it appears resolved" });
      await expect(cancel).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(confirm).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(cancel).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(resolution).toBeFocused();
      const comment = page.getByLabel("Add a public comment");
      const post = page.getByRole("button", { name: "Post comment" });
      await reachByKeyboard(page, comment);
      await assertVisibleKeyboardFocus(page, comment);
      await reachByKeyboard(page, post);
      await page.keyboard.press("Enter");
      await expect(page.getByRole("alert")).toContainText("Comment must contain between 1 and 2000 characters.");
      await assertScreenLayout(page, requesterDetailElements(page, fixture.ticket.ticketNumber));
    });
  });

  await withPage(browser, viewport, async (page) => {
    await login(page, fixture.staff.user.email, fixture.staff.password);
    await withBrowserZoom(page, async () => {
      const search = page.getByLabel("Search Queue");
      await reachByKeyboard(page, search);
      await assertVisibleKeyboardFocus(page, search);
      await page.keyboard.type(`Issue 37 responsive zoom-200`);
      const apply = page.getByRole("button", { name: "Apply Filters" });
      await reachByKeyboard(page, apply);
      await page.keyboard.press("Enter");
      await expect(page.getByRole("link", { name: fixture.ticket.ticketNumber }).first()).toBeVisible();
      await assertScreenLayout(page, staffQueueElements(page, fixture.ticket.ticketNumber));
    });
  });

  await withPage(browser, viewport, async (page) => {
    await login(page, fixture.staff.user.email, fixture.staff.password);
    await page.goto(`/staff/tickets/${fixture.ticket.id}`);
    let releaseFailure = () => {};
    const holdFailure = new Promise<void>((resolve) => { releaseFailure = resolve; });
    await page.route("**/api/staff/tickets/*/owner", async (route) => {
      await holdFailure;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } }),
      });
    });
    await withBrowserZoom(page, async () => {
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
      const assign = page.getByRole("button", { name: "Assign Ticket" });
      await reachByKeyboard(page, assign);
      await assertVisibleKeyboardFocus(page, assign);
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Assign Ticket" });
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAttribute("aria-describedby");
      const owner = dialog.getByLabel("Ticket Owner");
      const save = dialog.getByRole("button", { name: "Save Owner" });
      await expect(owner).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(save).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(owner).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Enter");
      await expect(save).toBeDisabled();
      await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeVisible();
      releaseFailure();
      const alert = dialog.getByRole("alert");
      await expect(alert).toContainText("Something went wrong. Please try again.");
      await expect(dialog.getByRole("button", { name: "Cancel" })).toBeEnabled();
      await expect(page.locator("[inert]")).not.toHaveCount(0);
      await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(assign).toBeFocused();
      await assertScreenLayout(page, staffDetailElements(page, fixture.ticket.ticketNumber));
    });
    await page.unroute("**/api/staff/tickets/*/owner");
  });

  await withPage(browser, viewport, async (page) => {
    await login(page, fixture.administrator.user.email, fixture.administrator.password);
    await withBrowserZoom(page, async () => {
      const create = page.getByRole("button", { name: "Create User" }).first();
      await reachByKeyboard(page, create);
      await assertVisibleKeyboardFocus(page, create);
      await page.keyboard.press("Space");
      const dialog = page.getByRole("dialog", { name: "Create User" });
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAttribute("aria-describedby");
      const name = dialog.getByLabel("Name");
      const cancel = dialog.getByRole("button", { name: "Cancel" });
      await expect(name).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(cancel).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(name).toBeFocused();
      const submit = dialog.getByRole("button", { name: "Create User" });
      await reachByKeyboard(page, submit);
      await page.keyboard.press("Enter");
      const alert = dialog.getByRole("alert");
      await expect(alert).toBeVisible();
      await expect(name).toHaveAttribute("aria-invalid", "true");
      await expect(name).toHaveAttribute("aria-describedby", "admin-user-name-error");
      await expect(dialog.getByLabel("Email")).toHaveAttribute("aria-describedby", "admin-user-email-error");
      await expect(dialog.getByLabel("Initial Password", { exact: true }))
        .toHaveAttribute("aria-describedby", /admin-initial-password-error/u);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(create).toBeFocused();
      await assertScreenLayout(page, administratorElements(page));
    });
  });
});
