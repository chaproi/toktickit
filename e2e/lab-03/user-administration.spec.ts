import { randomBytes, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { hashPassword } from "../../server/src/auth/password.js";
import { getPrisma } from "../../server/src/prisma.js";

function seededPassword(email: string): string {
  const raw = process.env.LAB3_SEED_INITIAL_CREDENTIALS;
  if (!raw) throw new Error("Issue 35 E2E credentials are unavailable.");
  const value = (JSON.parse(raw) as Record<string, unknown>)[email];
  if (typeof value !== "string") throw new Error("Issue 35 E2E credential mapping is incomplete.");
  return value;
}

test("E2E-04 manages Users, safety conflicts, and historical ownership", async ({ page }) => {
  const adminEmail = "avery.chen@example.com";
  const initial = seededPassword(adminEmail);
  const replacement = `Aa1!${randomBytes(18).toString("base64url")}`;
  const marker = `${process.env.TOKTICKIT_E2E_RUN_MARKER}-Issue35-${randomUUID().slice(0, 8)}`;
  const email = `issue35-${randomUUID()}@example.test`;
  const userPassword = `Aa1!${randomBytes(18).toString("base64url")}`;

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
  await create.getByLabel("Initial Password", { exact: true }).fill(userPassword);
  await create.getByLabel("Confirm Initial Password").fill(userPassword);
  await create.getByRole("button", { name: "Create User" }).click();
  await expect(page.getByText(`${marker} was created.`)).toBeVisible();

  await page.getByRole("button", { name: "Create User" }).click();
  const duplicate = page.getByRole("dialog", { name: "Create User" });
  await duplicate.getByLabel("Name").fill("Duplicate User");
  await duplicate.getByLabel("Email").fill(email.toUpperCase());
  await duplicate.getByLabel("Initial Password", { exact: true }).fill(userPassword);
  await duplicate.getByLabel("Confirm Initial Password").fill(userPassword);
  await duplicate.getByRole("button", { name: "Create User" }).click();
  await expect(duplicate.getByRole("alert")).toContainText("already exists");
  await expect(duplicate.getByLabel("Email")).toHaveValue(email.toUpperCase());
  await duplicate.getByRole("button", { name: "Cancel" }).click();

  const prisma = getPrisma();
  const [createdUser, requester, category, relatedSystem] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { email } }),
    prisma.user.findFirstOrThrow({ where: { role: "REQUESTER", isActive: true }, orderBy: { id: "asc" } }),
    prisma.category.findFirstOrThrow({ where: { isActive: true }, orderBy: { id: "asc" } }),
    prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true }, orderBy: { id: "asc" } }),
  ]);
  const ownedTicket = await prisma.ticket.create({
    data: {
      ticketNumber: `I35-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
      clientSubmissionId: randomUUID(),
      requesterId: requester.id,
      ownerId: createdUser.id,
      categoryId: category.id,
      relatedSystemId: relatedSystem.id,
      requestedPriority: "HIGH",
      itPriority: "MEDIUM",
      currentStatus: "OPEN",
      summary: `${marker} owned Ticket`,
      description: "This Ticket was created through the complete real-browser requester workflow.",
    },
  });

  await page.getByLabel("Search users").fill(email);
  await page.getByLabel("Role").selectOption("IT_STAFF");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: `Edit ${marker}` }).click();
  const edit = page.getByRole("dialog", { name: `Edit ${marker}` });
  const authoritativeName = `${marker} Authoritative`;
  await prisma.user.update({ where: { id: createdUser.id }, data: { name: authoritativeName } });
  await edit.getByLabel("Name").fill(`${marker} Stale Edit`);
  await edit.getByRole("button", { name: "Save User" }).click();
  await expect(edit.getByRole("alert")).toContainText("changed since you opened");
  await expect(edit.getByLabel("Name")).toHaveValue(`${marker} Stale Edit`);
  await edit.getByRole("button", { name: "Reload User" }).click();
  await expect(edit.getByLabel("Name")).toHaveValue(authoritativeName);
  await expect(page.getByText("Latest User details loaded.")).toBeVisible();

  await edit.getByLabel("Role").selectOption("REQUESTER");
  await edit.getByRole("button", { name: "Save User" }).click();
  await expect(edit.getByRole("alert")).toContainText("Reassign or unassign");
  await expect(edit.getByLabel("Role")).toHaveValue("REQUESTER");
  await edit.getByRole("button", { name: "Cancel" }).click();

  await prisma.ticket.update({ where: { id: ownedTicket.id }, data: { currentStatus: "CLOSED" } });
  await page.getByRole("button", { name: `Edit ${authoritativeName}` }).click();
  const historicalEdit = page.getByRole("dialog", { name: `Edit ${authoritativeName}` });
  await historicalEdit.getByLabel("Name").fill(`${marker} Updated`);
  await historicalEdit.getByLabel("Role").selectOption("ADMINISTRATOR");
  await historicalEdit.getByRole("button", { name: "Save User" }).click();
  expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ownedTicket.id } })).ownerId).toBe(createdUser.id);
  await expect(page.getByText(`${marker} Updated was saved.`)).toBeVisible();

  await page.getByRole("button", { name: "Clear Search" }).click();
  await page.getByRole("button", { name: "Edit Avery Chen" }).click();
  const selfEdit = page.getByRole("dialog", { name: "Edit Avery Chen" });
  await expect(selfEdit.getByLabel("Role")).toBeDisabled();
  await expect(selfEdit.getByLabel("Status")).toBeDisabled();
  await expect(selfEdit.getByRole("button", { name: "Set New Initial Password" })).toHaveCount(0);
  await selfEdit.getByRole("button", { name: "Cancel" }).click();
});

test("E2E-04 resets another User and enforces mandatory password change", async ({ page }) => {
  const prisma = getPrisma();
  const suffix = randomUUID();
  const actorEmail = `issue35-e2e-admin-${suffix}@example.test`;
  const targetEmail = `issue35-e2e-target-${suffix}@example.test`;
  const actorPassword = `Aa1!${randomBytes(18).toString("base64url")}`;
  const targetPassword = `Dd4!${randomBytes(18).toString("base64url")}`;
  const resetPassword = `Bb2!${randomBytes(18).toString("base64url")}`;
  const finalPassword = `Cc3!${randomBytes(18).toString("base64url")}`;
  const targetName = `Issue 35 Reset ${suffix.slice(0, 8)}`;
  await prisma.user.createMany({
    data: [
      {
        name: `Issue 35 Admin ${suffix.slice(0, 8)}`,
        email: actorEmail,
        role: "ADMINISTRATOR",
        passwordHash: await hashPassword(actorPassword),
        mustChangePassword: false,
      },
      {
        name: targetName,
        email: targetEmail,
        role: "IT_STAFF",
        passwordHash: await hashPassword(targetPassword),
        mustChangePassword: false,
      },
    ],
  });

  await page.goto("/login");
  await page.getByLabel("Email").fill(actorEmail);
  await page.getByLabel("Password", { exact: true }).fill(actorPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();

  await page.getByLabel("Search users").fill(targetEmail);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: `Edit ${targetName}` }).click();
  await page.getByRole("button", { name: "Set New Initial Password" }).click();
  const reset = page.getByRole("dialog", { name: "Set New Initial Password" });
  await reset.getByLabel("Initial Password", { exact: true }).fill(resetPassword);
  await reset.getByLabel("Confirm Initial Password").fill(resetPassword);
  await reset.getByRole("button", { name: "Set Initial Password" }).click();
  await expect(page.getByText("A new initial password was set. The user must change it at next login.")).toBeVisible();
  const refreshedEdit = page.getByRole("dialog", { name: `Edit ${targetName}` });
  await expect(refreshedEdit.getByText("Password change required: Yes")).toBeVisible();
  await refreshedEdit.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Logout" }).click();
  await page.getByLabel("Email").fill(targetEmail);
  await page.getByLabel("Password", { exact: true }).fill(resetPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Create a new password" })).toBeVisible();
  await page.getByLabel("Current Password").fill(resetPassword);
  await page.getByLabel("New Password", { exact: true }).fill(finalPassword);
  await page.getByLabel("Confirm New Password").fill(finalPassword);
  await page.getByRole("button", { name: "Save Password" }).click();
  await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
});
