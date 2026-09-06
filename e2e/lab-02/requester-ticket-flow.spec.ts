import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  expect,
  request as createRequestContext,
  test,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from "@playwright/test";

const API_URL = "http://127.0.0.1:3100";
const SCREENSHOT_DIRECTORY = join(
  process.cwd(),
  "artifacts",
  "lab-02",
  "screenshots",
);
const RUN_MARKER = process.env.TOKTICKIT_E2E_RUN_MARKER;

if (!RUN_MARKER?.startsWith("Issue21-")) {
  throw new Error("TOKTICKIT_E2E_RUN_MARKER is required for isolated E2E data.");
}
const PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nFQAAAAASUVORK5CYII=",
  "base64",
);

type ReferenceItem = {
  id: number;
  name: string;
  email?: string;
};

type CreatedTicket = {
  ticket: {
    id: number;
    ticketNumber: string;
    summary: string;
  };
};

type AttachmentMetadata = {
  id: number;
  originalFilename: string;
};

let api: APIRequestContext;
let primaryRequester: ReferenceItem;
let otherRequester: ReferenceItem;
let hardwareCategory: ReferenceItem;
let networkCategory: ReferenceItem;
let corporateLaptop: ReferenceItem;
let emailSystem: ReferenceItem;
let responsiveTicket: CreatedTicket["ticket"];
let responsiveActiveFilename: string;

async function readJson<T>(response: APIResponse): Promise<T> {
  if (!response.ok()) {
    throw new Error(
      `Expected a successful API response, received ${response.status()}: ${await response.text()}`,
    );
  }

  return (await response.json()) as T;
}

async function getNamedReference(
  endpoint: string,
  name: string,
): Promise<ReferenceItem> {
  const response = await api.get(endpoint);
  const items = await readJson<ReferenceItem[]>(response);
  const item = items.find((candidate) => candidate.name === name);

  expect(item, `${name} must exist in required seed data`).toBeDefined();
  return item!;
}

async function createTicketThroughApi(
  index: number,
): Promise<CreatedTicket["ticket"]> {
  const even = index % 2 === 0;
  const response = await api.post("/api/tickets", {
    headers: {
      "X-Development-Requester-Id": String(primaryRequester.id),
    },
    data: {
      clientSubmissionId: randomUUID(),
      categoryId: even ? hardwareCategory.id : networkCategory.id,
      relatedSystemId: even
        ? corporateLaptop.id
        : emailSystem.id,
      requestedPriority: even ? "MEDIUM" : "HIGH",
      summary: `${RUN_MARKER} fixture ${String(index).padStart(2, "0")}`,
      description:
        "Deterministic end-to-end Ticket data for final Lab 2 verification.",
    },
  });
  const body = await readJson<CreatedTicket>(response);
  return body.ticket;
}

async function uploadThroughApi(
  ticketId: number,
  filename: string,
): Promise<AttachmentMetadata> {
  const response = await api.post(
    `/api/tickets/${ticketId}/attachments`,
    {
      headers: {
        "X-Development-Requester-Id": String(primaryRequester.id),
      },
      multipart: {
        file: {
          name: filename,
          mimeType: "image/png",
          buffer: PNG_BUFFER,
        },
      },
    },
  );

  return readJson<AttachmentMetadata>(response);
}

async function selectRequester(
  page: Page,
  requesterName: string,
): Promise<void> {
  await page.goto("/select-requester");
  const requesterSelect = page.getByLabel("Development Requester");
  await expect(requesterSelect).toBeEnabled();
  await requesterSelect.selectOption({ label: requesterName });
  const continueButton = page.getByRole("button", {
    name: "Continue",
  });
  await continueButton.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/tickets$/u);
  await expect(
    page.getByText(`Current Requester: ${requesterName}`),
  ).toBeVisible();
}

async function applyTicketSearch(
  page: Page,
  search: string,
): Promise<void> {
  await page
    .getByLabel("Search by Ticket Number or Summary")
    .fill(search);
  await page.getByRole("button", { name: "Apply Filters" }).click();
}

async function expectNoHorizontalOverflow(
  page: Page,
  screenDescription: string,
): Promise<void> {
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));

  expect.soft(
    overflow.document,
    `${screenDescription}: document horizontal overflow`,
  ).toBeLessThanOrEqual(0);
  expect.soft(
    overflow.body,
    `${screenDescription}: body horizontal overflow`,
  ).toBeLessThanOrEqual(0);
}

test.beforeAll(async () => {
  mkdirSync(SCREENSHOT_DIRECTORY, { recursive: true });
  api = await createRequestContext.newContext({ baseURL: API_URL });

  [
    primaryRequester,
    otherRequester,
    hardwareCategory,
    networkCategory,
    corporateLaptop,
    emailSystem,
  ] = await Promise.all([
    getNamedReference("/api/development-requesters", "Alex Morgan"),
    getNamedReference("/api/development-requesters", "Daniel Kim"),
    getNamedReference("/api/categories", "Hardware"),
    getNamedReference("/api/categories", "Network"),
    getNamedReference("/api/related-systems", "Corporate Laptop"),
    getNamedReference("/api/related-systems", "Email"),
  ]);

  const fixtures: CreatedTicket["ticket"][] = [];
  for (let index = 1; index <= 12; index += 1) {
    fixtures.push(await createTicketThroughApi(index));
  }
  responsiveTicket = fixtures[0];

  responsiveActiveFilename = `${RUN_MARKER}-active.png`;
  await uploadThroughApi(
    responsiveTicket.id,
    responsiveActiveFilename,
  );
  const removedAttachment = await uploadThroughApi(
    responsiveTicket.id,
    `${RUN_MARKER}-removed.png`,
  );
  const removalResponse = await api.delete(
    `/api/tickets/${responsiveTicket.id}/attachments/${removedAttachment.id}`,
    {
      headers: {
        "X-Development-Requester-Id": String(primaryRequester.id),
      },
      data: {
        removalReason: "Prepared removed evidence for responsive verification.",
      },
    },
  );
  expect(removalResponse.ok(), await removalResponse.text()).toBe(true);
});

test.afterAll(async () => {
  await api?.dispose();
});

test("E2E-01 selects and restores a Requester, creates an owned Ticket, and opens its read-only Detail", async ({
  page,
}) => {
  await page.goto("/select-requester");
  await expect(
    page.getByRole("heading", {
      name: "Select Development Requester",
    }),
  ).toBeVisible();
  await page.screenshot({
    path: join(SCREENSHOT_DIRECTORY, "requester-selection-desktop.png"),
    fullPage: true,
  });

  await selectRequester(page, primaryRequester.name);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("developmentRequesterId"),
    ),
  ).toBe(String(primaryRequester.id));

  await page.reload();
  await expect(
    page.getByText(`Current Requester: ${primaryRequester.name}`),
  ).toBeVisible();

  await page.getByRole("link", { name: "Create Ticket" }).click();
  await expect(
    page.getByRole("heading", { name: "Create Ticket" }),
  ).toBeVisible();
  await expect(page.getByText(primaryRequester.email!)).toBeVisible();
  await page.screenshot({
    path: join(SCREENSHOT_DIRECTORY, "create-ticket-desktop.png"),
    fullPage: true,
  });

  const browserSummary = `${RUN_MARKER} browser-created Ticket`;
  const createdAttachmentFilename = `${RUN_MARKER}-created.png`;
  await page.getByLabel(/^Category/u).selectOption({ label: "Hardware" });
  await page
    .getByLabel(/^Related System/u)
    .selectOption({ label: "Corporate Laptop" });
  await page.getByLabel(/^Priority/u).selectOption("MEDIUM");
  await page.getByLabel(/^Summary/u).fill(browserSummary);
  await page
    .getByLabel(/^Description/u)
    .fill(
      "This Ticket was created through the complete real-browser requester workflow.",
    );
  await page.getByLabel("Attachments").setInputFiles({
    name: createdAttachmentFilename,
    mimeType: "image/png",
    buffer: PNG_BUFFER,
  });

  await page.getByRole("button", { name: "Create Ticket" }).focus();
  await page.keyboard.press("Enter");
  const successRegion = page.getByRole("status");
  await expect(
    successRegion.getByRole("heading", {
      name: "Ticket Created Successfully",
    }),
  ).toBeVisible();
  const ticketNumber = await successRegion
    .getByText(/^TKT-\d{4}-\d{5}$/u)
    .textContent();
  expect(ticketNumber).not.toBeNull();
  const openTicketLink = successRegion.getByRole("link", {
    name: "Open Ticket",
  });
  const ticketHref = await openTicketLink.getAttribute("href");
  expect(ticketHref).toMatch(/^\/tickets\/\d+$/u);
  const browserTicketId = Number(ticketHref!.split("/").at(-1));

  const ownedResponse = await api.get(`/api/tickets/${browserTicketId}`, {
    headers: {
      "X-Development-Requester-Id": String(primaryRequester.id),
    },
  });
  const ownedTicket = await readJson<{
    ticketNumber: string;
    requester: { id: number };
  }>(ownedResponse);
  expect(ownedTicket.ticketNumber).toBe(ticketNumber);
  expect(ownedTicket.requester.id).toBe(primaryRequester.id);
  await page.screenshot({
    path: join(SCREENSHOT_DIRECTORY, "create-ticket-success.png"),
    fullPage: true,
  });

  await successRegion.getByRole("link", { name: "My Tickets" }).click();
  await applyTicketSearch(page, ticketNumber!);
  await expect(
    page.getByRole("link", { name: ticketNumber! }),
  ).toBeVisible();
  await page.screenshot({
    path: join(SCREENSHOT_DIRECTORY, "my-tickets-desktop.png"),
    fullPage: true,
  });

  await page.getByRole("link", { name: ticketNumber! }).click();
  await expect(
    page.getByRole("heading", { name: "Ticket Detail" }),
  ).toBeVisible();
  await expect(page.getByText(browserSummary)).toBeVisible();
  await expect(
    page.locator("dl").getByText(primaryRequester.name, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Hardware", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Corporate Laptop", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(createdAttachmentFilename)).toBeVisible();
  for (const prohibitedControl of [
    "Public Comments",
    "Internal Notes",
    "Actions Taken",
    "Claim Ticket",
    "Assign Ticket",
  ]) {
    await expect(page.getByText(prohibitedControl)).toHaveCount(0);
  }
  await page.screenshot({
    path: join(SCREENSHOT_DIRECTORY, "ticket-detail-desktop.png"),
    fullPage: true,
  });
});

test("E2E-01 shows required-field and approved invalid-file feedback", async ({
  page,
}) => {
  await selectRequester(page, primaryRequester.name);
  await page.getByRole("link", { name: "Create Ticket" }).click();
  await page.getByRole("button", { name: "Create Ticket" }).click();

  const validationSummary = page.getByRole("alert").filter({
    hasText:
      "Please correct the highlighted fields before creating the Ticket.",
  });
  await expect(validationSummary).toBeFocused();
  await expect(page.getByText("Category is required")).toBeVisible();
  await expect(page.getByText("Related System is required")).toBeVisible();
  await expect(page.getByText("Priority is required")).toBeVisible();
  await expect(page.getByText("Summary is required")).toBeVisible();
  await expect(page.getByText("Description is required")).toBeVisible();
  await page.screenshot({
    path: join(SCREENSHOT_DIRECTORY, "create-ticket-validation.png"),
    fullPage: true,
  });

  const invalidFilename = `${RUN_MARKER}-invalid.txt`;
  await page.getByLabel("Attachments").setInputFiles({
    name: invalidFilename,
    mimeType: "text/plain",
    buffer: Buffer.from("not an approved attachment", "utf8"),
  });
  const invalidFileAlert = page.getByRole("alert").filter({
    hasText: invalidFilename,
  });
  await expect(invalidFileAlert).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Selected attachments" }),
  ).toHaveCount(0);
});

test("E2E-01 exercises applied search, filters, sorting, pagination, and reset behavior", async ({
  page,
}) => {
  await selectRequester(page, primaryRequester.name);
  await applyTicketSearch(page, `${RUN_MARKER} fixture`);

  const table = page.getByRole("table", { name: "My Tickets" });
  await expect(table.locator("tbody tr")).toHaveCount(10);
  await expect(page.getByText("Page 1 of 2")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  await expect(table.locator("tbody tr")).toHaveCount(2);

  await page.getByLabel("Sort Field").selectOption("ticketNumber");
  await page.getByLabel("Sort Direction").selectOption("asc");
  await expect(page.getByText("Page 1 of 2")).toBeVisible();
  const ascendingNumbers = await table
    .locator("tbody tr td:first-child a")
    .allTextContents();
  expect(ascendingNumbers).toEqual(
    [...ascendingNumbers].sort((left, right) => left.localeCompare(right)),
  );

  await page.getByLabel("Sort Direction").selectOption("desc");
  const descendingNumbers = await table
    .locator("tbody tr td:first-child a")
    .allTextContents();
  expect(descendingNumbers).toEqual(
    [...descendingNumbers].sort((left, right) => right.localeCompare(left)),
  );

  await page.getByLabel("Category").selectOption({ label: "Hardware" });
  await page
    .getByLabel("Related System")
    .selectOption({ label: "Corporate Laptop" });
  await page.getByLabel("Requested Priority").selectOption("MEDIUM");
  await page.getByLabel("Current Status").selectOption("NEW");
  await page.getByRole("button", { name: "Apply Filters" }).click();
  await expect(table.locator("tbody tr")).toHaveCount(6);
  for (const row of await table.locator("tbody tr").all()) {
    await expect(row).toContainText("Hardware");
    await expect(row).toContainText("Corporate Laptop");
    await expect(row).toContainText("MEDIUM");
    await expect(row).toContainText("NEW");
  }
  await page.screenshot({
    path: join(SCREENSHOT_DIRECTORY, "my-tickets-filtered-desktop.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Clear Filters" }).click();
  await expect(
    page.getByLabel("Search by Ticket Number or Summary"),
  ).toHaveValue("");
  await expect(page.getByLabel("Category")).toHaveValue("");
  await expect(page.getByLabel("Related System")).toHaveValue("");
  await expect(page.getByLabel("Requested Priority")).toHaveValue("");
  await expect(page.getByLabel("Current Status")).toHaveValue("");
  await expect(page.getByText(/^Page 1 of /u)).toBeVisible();
});

test("E2E-02 and E2E-03 complete the owned Attachment lifecycle and enforce ownership isolation", async ({
  page,
}) => {
  await selectRequester(page, primaryRequester.name);
  await page.goto(`/tickets/${responsiveTicket.id}`);
  await expect(
    page.getByRole("heading", { name: "Ticket Detail" }),
  ).toBeVisible();

  const preparedRemovedFilename = `${RUN_MARKER}-removed.png`;
  await expect(page.getByText(responsiveActiveFilename)).toBeVisible();
  const preparedRemovedItem = page
    .getByRole("listitem")
    .filter({ hasText: preparedRemovedFilename });
  await expect(
    preparedRemovedItem.getByText("Removed", { exact: true }),
  ).toBeVisible();
  await expect(preparedRemovedItem).toContainText(
    "Prepared removed evidence for responsive verification.",
  );
  await expect(preparedRemovedItem.getByRole("button")).toHaveCount(0);
  await page.screenshot({
    path: join(SCREENSHOT_DIRECTORY, "attachment-active-and-removed.png"),
    fullPage: true,
  });

  const detailFilename = `${RUN_MARKER}-detail.png`;
  await page.getByLabel("Add Attachment").setInputFiles({
    name: detailFilename,
    mimeType: "image/png",
    buffer: PNG_BUFFER,
  });
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Attachment uploaded successfully.",
  );
  await expect(page.getByRole("status")).toContainText(detailFilename);

  const detailItem = page
    .getByRole("listitem")
    .filter({ hasText: detailFilename });
  await expect(detailItem.getByText("Active")).toBeVisible();

  const popupPromise = page.waitForEvent("popup");
  await detailItem
    .getByRole("button", { name: `Preview ${detailFilename}` })
    .click();
  const previewPage = await popupPromise;
  await expect(previewPage).toHaveURL(/^blob:/u);
  await previewPage.close();

  const downloadPromise = page.waitForEvent("download");
  await detailItem
    .getByRole("button", { name: `Download ${detailFilename}` })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(detailFilename);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  expect(Buffer.concat(chunks)).toEqual(PNG_BUFFER);

  await detailItem
    .getByRole("button", { name: `Remove ${detailFilename}` })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Remove Attachment",
  });
  const reason = dialog.getByLabel("Removal reason");
  await expect(reason).toBeFocused();
  await reason.fill("No longer needed after verification.");
  await dialog.getByRole("button", { name: "Remove Attachment" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText(
    "Attachment removed successfully.",
  );
  await expect(page.getByRole("status")).toContainText(detailFilename);
  await expect(
    detailItem.getByText("Removed", { exact: true }),
  ).toBeVisible();
  await expect(detailItem).toContainText(
    "Removal reason: No longer needed after verification.",
  );
  await expect(detailItem.getByText(/^Removed /u)).toBeVisible();
  await expect(detailItem.getByRole("button")).toHaveCount(0);
  await page.screenshot({
    path: join(SCREENSHOT_DIRECTORY, "attachment-removed.png"),
    fullPage: true,
  });

  const metadataResponse = await api.get(
    `/api/tickets/${responsiveTicket.id}/attachments`,
    {
      headers: {
        "X-Development-Requester-Id": String(primaryRequester.id),
      },
    },
  );
  const metadata = await readJson<{
    items: Array<AttachmentMetadata & { isRemoved: boolean }>;
  }>(metadataResponse);
  const removed = metadata.items.find(
    (attachment) => attachment.originalFilename === detailFilename,
  );
  expect(removed?.isRemoved).toBe(true);
  const removedContentResponse = await api.get(
    `/api/tickets/${responsiveTicket.id}/attachments/${removed!.id}/content?disposition=inline`,
    {
      headers: {
        "X-Development-Requester-Id": String(primaryRequester.id),
      },
    },
  );
  expect(removedContentResponse.status()).toBe(410);
  expect(await removedContentResponse.json()).toEqual({
    error: {
      code: "ATTACHMENT_REMOVED",
      message: "This attachment is no longer available.",
    },
  });

  await page.getByRole("button", { name: "Change Requester" }).click();
  const requesterSelect = page.getByLabel("Development Requester");
  const continueButton = page.getByRole("button", { name: "Continue" });
  await expect(async () => {
    await requesterSelect.selectOption({ label: otherRequester.name });
    await expect(requesterSelect).toHaveValue(String(otherRequester.id));
    await expect(continueButton).toBeEnabled();
  }).toPass();
  await continueButton.click();
  await applyTicketSearch(page, RUN_MARKER);
  await expect(
    page.getByText("No Tickets match the current search and filters."),
  ).toBeVisible();

  await page.goto(`/tickets/${responsiveTicket.id}`);
  await expect(page.getByRole("alert")).toContainText("Ticket not found.");
  await expect(page.getByText(responsiveTicket.summary)).toHaveCount(0);
  await page.screenshot({
    path: join(SCREENSHOT_DIRECTORY, "ownership-safe-not-found.png"),
    fullPage: true,
  });

  await page.goto("/tickets/2147483647");
  await expect(page.getByRole("alert")).toContainText("Ticket not found.");
});

test("E2E-01 shows a safe API failure and retries without stale data", async ({
  page,
}) => {
  let failTicketList = true;
  await page.route(
    /\/api\/tickets(?:\?|$)/u,
    async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }

      if (failTicketList) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "INTERNAL_ERROR",
              message: "Something went wrong. Please try again.",
            },
          }),
        });
        return;
      }

      await route.continue();
    },
  );

  await selectRequester(page, primaryRequester.name);
  const alert = page.getByRole("alert").filter({
    hasText: "Something went wrong. Please try again.",
  });
  await expect(alert).toBeVisible();
  await expect(alert).not.toContainText(/Prisma|SQL|stack|DATABASE_URL/u);
  await page.screenshot({
    path: join(SCREENSHOT_DIRECTORY, "safe-api-error.png"),
    fullPage: true,
  });
  failTicketList = false;
  await alert.getByRole("button", { name: "Try Again" }).click();
  await expect(page.getByRole("table", { name: "My Tickets" })).toBeVisible();
});

test("E2E-04 keeps every Lab 2 screen usable at desktop, tablet, and mobile sizes", async ({
  page,
}) => {
  await selectRequester(page, primaryRequester.name);

  const viewports = [
    { name: "desktop", width: 1440, height: 900 },
    { name: "tablet-large", width: 1024, height: 900 },
    { name: "tablet", width: 820, height: 900 },
    { name: "tablet-boundary", width: 768, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ] as const;
  const routes = [
    { name: "requester-selection", path: "/select-requester" },
    { name: "create-ticket", path: "/tickets/new" },
    { name: "my-tickets", path: "/tickets" },
    {
      name: "ticket-detail",
      path: `/tickets/${responsiveTicket.id}`,
    },
  ] as const;

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);

    for (const route of routes) {
      await page.goto(route.path);
      await expect(page.locator("main")).toBeVisible();
      if (route.name === "requester-selection") {
        await expect(
          page.getByRole("heading", {
            name: "Select Development Requester",
          }),
        ).toBeVisible();
      } else if (route.name === "create-ticket") {
        await expect(
          page.getByRole("heading", { name: "Create Ticket" }),
        ).toBeVisible();
      } else if (route.name === "my-tickets") {
        await expect(
          page.getByRole("table", { name: "My Tickets" }),
        ).toBeVisible();
      } else {
        await expect(
          page.getByRole("heading", { name: "Ticket Detail" }),
        ).toBeVisible();
      }
      await expectNoHorizontalOverflow(
        page,
        `${viewport.name} ${route.name}`,
      );
    }

    await page.goto(`/tickets/${responsiveTicket.id}`);
    await expect(page.getByText(responsiveActiveFilename)).toBeVisible();
    await page.screenshot({
      path: join(
        SCREENSHOT_DIRECTORY,
        `ticket-detail-${viewport.name}.png`,
      ),
      fullPage: true,
    });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tickets/new");
  const invalidFilename = `${RUN_MARKER}-contract-invalid.txt`;
  await page.getByLabel("Attachments").setInputFiles({
    name: invalidFilename,
    mimeType: "text/plain",
    buffer: Buffer.from("not an approved attachment", "utf8"),
  });
  await expect
    .soft(page.getByRole("alert").filter({ hasText: invalidFilename }))
    .toContainText("This file type is not allowed.");

  await page.goto("/tickets");
  await expect
    .soft(page.getByRole("navigation", { name: "Primary navigation" }))
    .toBeHidden();
  const mobileMenuControl = page.getByRole("button", {
    name: /menu|navigation/u,
  });
  await expect.soft(mobileMenuControl).toBeVisible();
});
