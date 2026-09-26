import { randomBytes, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { getPrisma } from "../../server/src/prisma.js";

function seededPassword(email: string): string {
  const raw = process.env.LAB3_SEED_INITIAL_CREDENTIALS;
  if (!raw) throw new Error("Issue 33 E2E credentials are unavailable.");
  const value = (JSON.parse(raw) as Record<string, unknown>)[email];
  if (typeof value !== "string") throw new Error("Issue 33 E2E credential mapping is incomplete.");
  return value;
}

test("E2E-03 completes the Staff operational Ticket workflow", async ({ page }) => {
  const prisma = getPrisma();
  const marker = `${process.env.TOKTICKIT_E2E_RUN_MARKER}-Issue33`;
  const requester = await prisma.user.findFirstOrThrow({ where: { role: "REQUESTER", isActive: true } });
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  const system = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `E33-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
      clientSubmissionId: randomUUID(),
      requesterId: requester.id,
      categoryId: category.id,
      relatedSystemId: system.id,
      requestedPriority: "HIGH",
      itPriority: "HIGH",
      currentStatus: "OPEN",
      ownerId: null,
      summary: `${marker} migrated unassigned workflow`,
      description: "Synthetic Issue 33 operational workflow Ticket.",
    },
  });

  const email = "mina.patel@example.com";
  const initialPassword = seededPassword(email);
  const replacement = `Aa1!${randomBytes(18).toString("base64url")}`;
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(initialPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("Current Password").waitFor();
  await page.getByLabel("Current Password").fill(initialPassword);
  await page.getByLabel("New Password", { exact: true }).fill(replacement);
  await page.getByLabel("Confirm New Password").fill(replacement);
  await page.getByRole("button", { name: "Save Password" }).click();

  await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
  await page.getByLabel("Search Queue").fill(marker);
  await page.getByRole("button", { name: "Apply Filters" }).click();
  await page.getByRole("link", { name: ticket.ticketNumber }).first().click();
  await expect(page.getByRole("heading", { name: ticket.ticketNumber })).toBeVisible();
  await page.getByRole("button", { name: "Claim Ticket" }).click();
  await expect(page.getByText(/Owner.*Mina Patel/u)).toBeVisible();
  await page.getByLabel("IT Priority").selectOption("URGENT");
  await page.getByRole("button", { name: "Save IT Priority" }).click();
  await page.getByLabel("Add a public comment").fill("Public Staff E2E update.");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByText("Public Staff E2E update.")).toBeVisible();
  await page.getByLabel("Add an internal note").fill("Private Staff E2E diagnosis.");
  await page.getByRole("button", { name: "Post internal note" }).click();
  await expect(page.getByText("Private Staff E2E diagnosis.")).toBeVisible();
  await page.getByLabel("Next status").selectOption("IN_PROGRESS");
  await page.getByRole("button", { name: "Update Status" }).click();
  await expect(page.getByText("Open to In Progress")).toBeVisible();
  await expect(page.getByText("Internal — not visible to Requester")).toBeVisible();
});
