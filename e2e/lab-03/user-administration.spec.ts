import { randomBytes, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

function seededPassword(email: string): string {
  const raw = process.env.LAB3_SEED_INITIAL_CREDENTIALS;
  if (!raw) throw new Error("Issue 35 E2E credentials are unavailable.");
  const value = (JSON.parse(raw) as Record<string, unknown>)[email];
  if (typeof value !== "string") throw new Error("Issue 35 E2E credential mapping is incomplete.");
  return value;
}

test("E2E-04 completes minimal Administrator User Management", async ({ page }) => {
  const adminEmail = "avery.chen@example.com";
  const initial = seededPassword(adminEmail);
  const replacement = `Aa1!${randomBytes(18).toString("base64url")}`;
  const marker = `${process.env.TOKTICKIT_E2E_RUN_MARKER}-Issue35-${randomUUID().slice(0, 8)}`;
  const email = `issue35-${randomUUID()}@example.test`;
  const userPassword = `Aa1!${randomBytes(18).toString("base64url")}`;
  const resetPassword = `Bb2!${randomBytes(18).toString("base64url")}`;

  await page.goto("/login");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password", { exact: true }).fill(initial);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("Current Password").fill(initial);
  await page.getByLabel("New Password", { exact: true }).fill(replacement);
  await page.getByLabel("Confirm New Password").fill(replacement);
  await page.getByRole("button", { name: "Save Password" }).click();

  await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
  await page.getByRole("button", { name: "Create User" }).click();
  const create = page.getByRole("dialog", { name: "Create User" });
  await create.getByLabel("Name").fill(marker);
  await create.getByLabel("Email").fill(email);
  await create.getByLabel("Role").selectOption("IT_STAFF");
  await create.getByLabel("Initial Password").fill(userPassword);
  await create.getByLabel("Confirm Initial Password").fill(userPassword);
  await create.getByRole("button", { name: "Create User" }).click();
  await expect(page.getByText(`${marker} was created.`)).toBeVisible();

  await page.getByLabel("Search users").fill(email);
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: `Edit ${marker}` }).click();
  const edit = page.getByRole("dialog", { name: `Edit ${marker}` });
  await edit.getByLabel("Name").fill(`${marker} Updated`);
  await edit.getByLabel("Role").selectOption("ADMINISTRATOR");
  await edit.getByRole("button", { name: "Save User" }).click();
  await expect(page.getByText(`${marker} Updated was saved.`)).toBeVisible();

  await page.getByRole("button", { name: `Edit ${marker} Updated` }).click();
  await page.getByRole("button", { name: "Set New Initial Password" }).click();
  const reset = page.getByRole("dialog", { name: "Set New Initial Password" });
  await reset.getByLabel("Initial Password").fill(resetPassword);
  await reset.getByLabel("Confirm Initial Password").fill(resetPassword);
  await reset.getByRole("button", { name: "Set Initial Password" }).click();
  await expect(page.getByText("A new initial password was set. The user must change it at next login.")).toBeVisible();
  await expect(page.getByText("Password change required: Yes")).toBeVisible();
});
