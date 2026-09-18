import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";

function seededPassword(email: string): string {
  const raw = process.env.LAB3_SEED_INITIAL_CREDENTIALS;
  if (!raw) throw new Error("Issue 29 E2E credentials are unavailable.");
  const value = (JSON.parse(raw) as Record<string, unknown>)[email];
  if (typeof value !== "string") throw new Error("Issue 29 E2E credential mapping is incomplete.");
  return value;
}

test("E2E-01 authenticates, forces rotation, preserves reload, and logs out", async ({ page }) => {
  const email = "jennifer.anderson@example.com";
  const initialPassword = seededPassword(email);
  const replacement = `Aa1!${randomBytes(18).toString("base64url")}`;

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(initialPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Create a new password" })).toBeVisible();

  await page.getByLabel("Current Password").fill(initialPassword);
  await page.getByLabel("New Password").fill(replacement);
  await page.getByLabel("Confirm New Password").fill(replacement);
  await page.getByRole("button", { name: "Save Password" }).click();
  await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.getByLabel("Email").fill("unknown@example.test");
  await page.getByLabel("Password").fill("Incorrect1!Password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
  await expect(page.getByLabel("Password")).toHaveValue("");
});
