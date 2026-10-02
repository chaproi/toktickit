import { randomBytes, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { hashPassword } from "../../server/src/auth/password.js";
import { getPrisma } from "../../server/src/prisma.js";

async function user(role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR", label: string) {
  const password = `Aa1!${randomBytes(18).toString("base64url")}`;
  const suffix = randomUUID();
  const record = await getPrisma().user.create({
    data: {
      name: `Issue 37 ${label}`,
      email: `issue37-authz-${label}-${suffix}@example.test`,
      role,
      passwordHash: await hashPassword(password),
      mustChangePassword: false,
    },
  });
  return { record, password };
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

test("E2E-05 enforces direct navigation, API role, ownership, and Internal Note isolation", async ({ browser }) => {
  const requester = await user("REQUESTER", "requester");
  const otherRequester = await user("REQUESTER", "other-requester");
  const staff = await user("IT_STAFF", "staff");
  const administrator = await user("ADMINISTRATOR", "administrator");
  const prisma = getPrisma();
  const [category, relatedSystem] = await Promise.all([
    prisma.category.findFirstOrThrow({ where: { isActive: true } }),
    prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } }),
  ]);
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `I37-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
      clientSubmissionId: randomUUID(),
      requesterId: requester.record.id,
      ownerId: staff.record.id,
      categoryId: category.id,
      relatedSystemId: relatedSystem.id,
      requestedPriority: "HIGH",
      itPriority: "HIGH",
      currentStatus: "OPEN",
      summary: `Issue 37 protected summary ${randomUUID()}`,
      description: "Protected Ticket detail must never cross role or ownership boundaries.",
    },
  });
  const privateContent = `Issue 37 private note ${randomUUID()}`;
  await prisma.internalNote.create({
    data: { ticketId: ticket.id, authorId: staff.record.id, content: privateContent },
  });

  const requesterContext = await browser.newContext();
  const requesterPage = await requesterContext.newPage();
  await login(requesterPage, requester.record.email, requester.password);
  await expect(requesterPage.getByRole("heading", { name: "My Tickets" })).toBeVisible();
  for (const forbiddenPath of ["/staff/tickets", `/staff/tickets/${ticket.id}`, "/admin/users"]) {
    await requesterPage.goto(forbiddenPath);
    await expect(requesterPage.getByRole("heading", { name: "Forbidden" })).toBeVisible();
    await expect(requesterPage.getByText(ticket.summary)).toHaveCount(0);
    await expect(requesterPage.getByText(privateContent)).toHaveCount(0);
    await expect(requesterPage.getByRole("heading", { name: /Ticket Queue|User Management/u })).toHaveCount(0);
  }
  const requesterNote = await requesterPage.request.get(
    `http://127.0.0.1:3100/api/staff/tickets/${ticket.id}/notes`,
  );
  const missingNote = await requesterPage.request.get(
    "http://127.0.0.1:3100/api/staff/tickets/2147483000/notes",
  );
  expect(requesterNote.status()).toBe(403);
  expect(missingNote.status()).toBe(403);
  expect(await requesterNote.json()).toEqual(await missingNote.json());
  expect(JSON.stringify(await requesterNote.json())).not.toContain(privateContent);
  await requesterContext.close();

  const foreignContext = await browser.newContext();
  const foreignPage = await foreignContext.newPage();
  await login(foreignPage, otherRequester.record.email, otherRequester.password);
  await foreignPage.goto(`/tickets/${ticket.id}`);
  await expect(foreignPage.getByText("Ticket not found.")).toBeVisible();
  await expect(foreignPage.getByText(ticket.summary)).toHaveCount(0);
  await expect(foreignPage.getByText(privateContent)).toHaveCount(0);
  await foreignContext.close();

  const staffContext = await browser.newContext();
  const staffPage = await staffContext.newPage();
  await login(staffPage, staff.record.email, staff.password);
  await expect(staffPage.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
  await staffPage.goto(`/staff/tickets/${ticket.id}`);
  await expect(staffPage.getByRole("heading", { name: ticket.ticketNumber })).toBeVisible();
  await expect(staffPage.getByText(privateContent)).toBeVisible();
  for (const forbiddenPath of ["/tickets", `/tickets/${ticket.id}`, "/admin/users"]) {
    await staffPage.goto(forbiddenPath);
    await expect(staffPage.getByRole("heading", { name: "Forbidden" })).toBeVisible();
    await expect(staffPage.getByText(ticket.summary)).toHaveCount(0);
  }
  await staffContext.close();

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await login(adminPage, administrator.record.email, administrator.password);
  await expect(adminPage.getByRole("heading", { name: "User Management" })).toBeVisible();
  await adminPage.goto(`/staff/tickets/${ticket.id}`);
  await expect(adminPage.getByText(privateContent)).toBeVisible();
  await adminPage.goto(`/tickets/${ticket.id}`);
  await expect(adminPage.getByRole("heading", { name: "Forbidden" })).toBeVisible();
  await expect(adminPage.getByText(ticket.summary)).toHaveCount(0);
  await adminContext.close();
});
