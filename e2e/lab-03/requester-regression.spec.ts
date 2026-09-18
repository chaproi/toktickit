import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { getPrisma } from "../../server/src/prisma.js";

const PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nFQAAAAASUVORK5CYII=",
  "base64",
);

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

test("E2E-02 retains the complete Requester workflow under session identity", async ({ page, browser }) => {
  const email = "alex.morgan@example.com";
  const initialPassword = seededPassword(email);
  const replacement = `Aa1!${randomBytes(18).toString("base64url")}`;
  const marker = `${process.env.TOKTICKIT_E2E_RUN_MARKER}-Issue29`;

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(initialPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("Current Password").fill(initialPassword);
  await page.getByLabel("New Password", { exact: true }).fill(replacement);
  await page.getByLabel("Confirm New Password").fill(replacement);
  await page.getByRole("button", { name: "Save Password" }).click();

  await page.getByRole("link", { name: "Create Ticket" }).click();
  await expect(page.getByText("Alex Morgan")).toBeVisible();
  await page.getByLabel("Category").selectOption({ label: "Hardware" });
  await page.getByLabel("Related System").selectOption({ label: "Corporate Laptop" });
  await page.getByLabel(/^Priority/u).selectOption("HIGH");
  await page.getByLabel("Summary").fill(`${marker} authenticated requester`);
  await page.getByLabel("Description").fill("This Ticket was created by the Issue 29 authenticated browser workflow.");
  await page.getByRole("button", { name: "Create Ticket" }).click();
  await expect(page.getByRole("heading", { name: "Ticket Created Successfully" })).toBeVisible();

  await page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "My Tickets" })
    .click();
  await page.getByLabel("Search Tickets").fill(marker);
  await page.getByRole("button", { name: "Apply Filters" }).click();
  await page.getByRole("link", { name: /TKT-/ }).click();
  await expect(page.getByText("Unassigned")).toBeVisible();
  await expect(page.getByText("High", { exact: true })).toHaveCount(2);

  const attachmentName = `${marker}-evidence.png`;
  await page.getByLabel("Add Attachment").setInputFiles({
    name: attachmentName,
    mimeType: "image/png",
    buffer: PNG_BUFFER,
  });
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText(/Attachment uploaded successfully\./u)).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: attachmentName })).toBeVisible();

  const ticketNumber = await page.locator(".ticket-detail-number").textContent();
  const ticket = await getPrisma().ticket.findUniqueOrThrow({
    where: { ticketNumber: ticketNumber?.trim() ?? "" },
  });
  await getPrisma().ticket.update({
    where: { id: ticket.id },
    data: { currentStatus: "IN_PROGRESS" },
  });
  await page.reload();

  await page.getByLabel("Add a public comment").fill("Requester E2E public update.");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByText("Requester E2E public update.")).toBeVisible();
  await page.getByRole("button", { name: "Problem Appears Resolved" }).click();
  await page.getByRole("button", { name: "Yes, it appears resolved" }).click();
  await expect(page.getByText("Waiting for the support team to formally resolve this Ticket.")).toBeVisible();
  await expect(page.getByText("In Progress")).toBeVisible();
  await expect(page.getByText("Internal Notes")).toHaveCount(0);

  const otherEmail = "priya.shah@example.com";
  const otherInitialPassword = seededPassword(otherEmail);
  const otherReplacement = `Aa1!${randomBytes(18).toString("base64url")}`;
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  try {
    await otherPage.goto("/login");
    await otherPage.getByLabel("Email").fill(otherEmail);
    await otherPage.getByLabel("Password", { exact: true }).fill(otherInitialPassword);
    await otherPage.getByRole("button", { name: "Sign in" }).click();
    await otherPage.getByLabel("Current Password").fill(otherInitialPassword);
    await otherPage.getByLabel("New Password", { exact: true }).fill(otherReplacement);
    await otherPage.getByLabel("Confirm New Password").fill(otherReplacement);
    await otherPage.getByRole("button", { name: "Save Password" }).click();
    await expect(otherPage.getByRole("heading", { name: "My Tickets" })).toBeVisible();
    await otherPage.goto(`/tickets/${ticket.id}`);
    await expect(otherPage.getByText("Ticket not found.")).toBeVisible();
    await expect(otherPage.getByText(marker)).toHaveCount(0);
  } finally {
    await otherContext.close();
  }
});
