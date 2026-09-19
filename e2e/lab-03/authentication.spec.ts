import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";

function seededPassword(email: string): string {
  const migratedRaw = process.env.TOKTICKIT_E2E_MIGRATED_REQUESTER_CREDENTIALS;
  const migrated = migratedRaw
    ? (JSON.parse(migratedRaw) as Record<string, unknown>)[email]
    : undefined;
  if (typeof migrated === "string") return migrated;
  const raw = process.env.LAB3_SEED_INITIAL_CREDENTIALS;
  if (!raw) throw new Error("Issue 29 E2E credentials are unavailable.");
  const value = (JSON.parse(raw) as Record<string, unknown>)[email];
  if (typeof value !== "string") throw new Error("Issue 29 E2E credential mapping is incomplete.");
  return value;
}

test("E2E-01 authenticates, forces rotation, preserves reload, and logs out", async ({ page, request }) => {
  const email = "jennifer.anderson@example.com";
  const initialPassword = seededPassword(email);
  const replacement = `Aa1!${randomBytes(18).toString("base64url")}`;

  const forbiddenOrigin = await request.post("http://127.0.0.1:3100/api/auth/login", {
    headers: { Origin: "https://unapproved.example.test" },
    data: { email, password: initialPassword },
  });
  expect(forbiddenOrigin.status()).toBe(403);
  expect((await forbiddenOrigin.json()).error.code).toBe("ORIGIN_FORBIDDEN");

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Email").fill("inactive.support@example.com");
  await page.getByLabel("Password", { exact: true }).fill(
    seededPassword("inactive.support@example.com"),
  );
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("This account is inactive. Contact an Administrator.")).toBeVisible();

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(initialPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Create a new password" })).toBeVisible();

  await page.getByLabel("Current Password").fill(initialPassword);
  await page.getByLabel("New Password", { exact: true }).fill(replacement);
  await page.getByLabel("Confirm New Password").fill(replacement);
  await page.getByRole("button", { name: "Save Password" }).click();
  await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
  const sessionCookie = (await page.context().cookies())
    .find((cookie) => cookie.name === "toktickit_session");
  expect(sessionCookie).toBeDefined();
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  const blockedReuse = await request.get("http://127.0.0.1:3100/api/auth/me", {
    headers: { Cookie: `toktickit_session=${sessionCookie?.value ?? ""}` },
  });
  expect(blockedReuse.status()).toBe(401);
  expect((await blockedReuse.json()).error.code).toBe("AUTHENTICATION_REQUIRED");

  await page.getByLabel("Email").fill("unknown@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Incorrect1!Password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");

  await page.getByLabel("Email").fill(`throttle-${randomBytes(8).toString("hex")}@example.test`);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await page.getByLabel("Password", { exact: true }).fill("Incorrect1!Password");
    await page.getByRole("button", { name: "Sign in" }).click();
  }
  await expect(page.getByText(/Too many login attempts\./u)).toBeVisible();

  await page.route("**/api/auth/login", async (route) => {
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "ORIGIN_FORBIDDEN", message: "Sensitive detail" } }),
    });
  });
  await page.getByLabel("Email").fill("requester@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Synthetic1!Password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("The sign-in request could not be verified. Reload this page and try again.")).toBeVisible();
  await expect(page.getByText("Sensitive detail")).toHaveCount(0);
});
