import { expect } from "@playwright/test";
import { test, login } from "./action-browser-fixtures.js";
import { capture, contrast, fieldError, genuineZoom, geometry, keyboardFocus, layoutData, reachable, trap, longDescription } from "./action-layout-helpers.js";

// Partial T-38/AC-38 and T-36/50/55; no certified WCAG or comprehensive #49 claim.
test("T-38 labelled Action forms, validation, keyboard traps, clearing confirmation and focus return", async ({ page, fixture: f }) => {
  const action = await layoutData(f);
  await login(page, f.operator); await page.goto(`/staff/tickets/${f.ticket.id}`);
  const record = page.locator(`#action-${action.id}`);
  await expect(record).toBeVisible();
  const createTrigger = page.getByRole("region", { name: "Actions Taken", exact: true }).getByRole("button", { name: "Create Action", exact: true });
  await keyboardFocus(page, createTrigger); await page.keyboard.press("Enter");
  let dialog = page.getByRole("dialog", { name: "Create Action", exact: true });
  await expect(dialog.getByLabel("Assigned to")).toHaveValue(String(f.operator.id));
  await trap(page, dialog);
  for (const label of ["Description", "Assigned to"] as const) await expect(dialog.getByLabel(label, { exact: true })).toHaveAttribute("required", "");
  await dialog.getByLabel("Description", { exact: true }).fill("😀😀a");
  await dialog.getByLabel("Follow-up required").check();
  await dialog.getByRole("button", { name: "Create action", exact: true }).click();
  await fieldError(dialog.getByLabel("Description", { exact: true })); await fieldError(dialog.getByLabel("Follow-up note", { exact: true }));
  await expect(dialog.getByRole("alert")).toHaveCount(1); await expect(dialog.getByLabel("Description", { exact: true })).toBeFocused();
  const sampledContrast = { fieldError: await contrast(dialog.locator('[id$="description-error"]')), primaryButton: await contrast(dialog.getByRole("button", { name: "Create action", exact: true })) };
  await capture(page, "accessibility-create-errors", "IT_STAFF", "Required/invalid description and follow-up feedback; keyboard focus", 1, { sampledContrast });
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(createTrigger).toBeFocused();

  for (const [button, title, field, validValue] of [
    ["Edit", "Edit Action", "Description", "Valid edited description 😀"],
    ["Reassign", "Reassign Action", "Assigned to", String(f.operator.id)],
    ["Complete", "Complete Action", "Result", "Valid completion result 😀"],
    ["Cancel", "Cancel Action", "Cancellation reason", "Valid cancellation reason 😀"],
  ] as const) {
    const trigger = record.getByRole("button", { name: button, exact: true });
    await keyboardFocus(page, trigger); await page.keyboard.press("Enter");
    dialog = page.getByRole("dialog", { name: title, exact: true });
    await expect(dialog.getByLabel(field, { exact: true })).toBeVisible();
    if (button === "Reassign") await dialog.getByLabel(field).selectOption(validValue);
    else {
      const input = dialog.getByLabel(field, { exact: true }); await expect(input).toHaveAttribute("required", "");
      await input.fill(button === "Edit" ? "😀😀a" : ""); await page.keyboard.press("Tab");
      await fieldError(input); await expect(dialog.locator('button[type="submit"]')).toBeDisabled();
      await input.fill(validValue);
    }
    await trap(page, dialog);
    if (button === "Edit") {
      const checkbox = dialog.getByLabel("Follow-up required", { exact: true });
      await checkbox.focus(); await page.keyboard.press("Space");
      const confirmation = page.getByRole("dialog", { name: "Clear follow-up note?", exact: true });
      await expect(confirmation.getByRole("button", { name: "Keep note" })).toBeFocused();
      await trap(page, confirmation); await page.keyboard.press("Escape");
      await expect(checkbox).toBeChecked(); await expect(checkbox).toBeFocused();
      await expect(dialog.getByLabel("Follow-up note", { exact: true })).not.toHaveValue("");
    }
    await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0); await expect(trigger).toBeFocused();
  }
  expect(await f.prisma.mutationReceipt.count({ where: { ticketId: f.ticket.id } })).toBe(0);
  expect(f.pageErrors).toEqual([]);
});

test("T-38 read-only history, real-read loading and transport error announcements, filter labels and sampled contrast", async ({ page, fixture: f }) => {
  const action = await layoutData(f); await login(page, f.requester); await page.goto(`/tickets/${f.ticket.id}`);
  const record = page.locator(`#action-${action.id}`); await expect(record).toBeVisible();
  await expect(record.getByText("In Progress", { exact: true })).toBeVisible();
  for (const name of ["Created by", "Assigned to", "Performed by"] as const) await expect(record.getByText(name, { exact: true })).toBeVisible();
  const trigger = record.getByRole("button", { name: "View history" });
  let release = () => {}; let intercepted = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  const reached = new Promise<void>(resolve => { intercepted = resolve; });
  const pattern = `**/api/tickets/${f.ticket.id}/actions/${action.id}/history?*`;
  await page.route(pattern, async route => { intercepted(); await held; await route.continue(); });
  try {
    await keyboardFocus(page, trigger); await page.keyboard.press("Enter"); await reached;
    const dialog = page.getByRole("dialog", { name: "Action history", exact: true });
    await expect(dialog.getByRole("status")).toHaveText("Loading Action history…"); await expect(dialog.getByRole("alert")).toHaveCount(0);
    release(); await expect(dialog.getByRole("list", { name: "Action history events" })).toBeVisible();
    await trap(page, dialog); await expect(dialog.getByLabel("History events per page")).toHaveAccessibleName("History events per page");
    await expect(dialog.getByText("No previous record", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape"); await expect(trigger).toBeFocused();
  } finally { release(); await page.unroute(pattern); }

  // Controlled browser transport failure only; no fake application or database response.
  let transportFailure = true;
  await page.route(pattern, route => transportFailure ? route.abort("failed") : route.continue());
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Action history", exact: true });
  await expect(dialog.getByRole("alert")).toHaveCount(1); await expect(dialog.getByRole("status")).toHaveCount(0);
  const retry = dialog.getByRole("button", { name: "Retry", exact: true }); await keyboardFocus(page, retry);
  await capture(page, "accessibility-history-error", "REQUESTER", "One honest alert after injected browser transport failure; Retry focused");
  transportFailure = false;
  await page.keyboard.press("Enter"); await expect(dialog.getByRole("list", { name: "Action history events" })).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveCount(0); await page.keyboard.press("Escape"); await expect(trigger).toBeFocused();
  await page.unroute(pattern); await page.getByRole("button", { name: "Logout" }).click(); await login(page, f.operator);
  await page.goto(`/staff/actions?search=${f.marker}`); await expect(page.getByRole("list", { name: "My assigned Actions records" })).toBeVisible();
  for (const label of ["Search", "Action status", "Action status group", "Ticket current status", "Category", "Ticket Owner", "Actions per page"] as const) {
    await expect(page.getByLabel(label, { exact: true })).toHaveAccessibleName(label);
  }
  await keyboardFocus(page, page.getByLabel("Action status", { exact: true }));
  // Exercise the native select through the keyboard, not a UI mock.
  await page.keyboard.press("p"); await page.keyboard.press("Enter");
  const apply = page.getByRole("button", { name: "Apply filters" }); await keyboardFocus(page, apply);
  const ratios = { bodyText: await contrast(page.getByRole("list", { name: "My assigned Actions records" }).getByText("Assigned to", { exact: true })), applyButton: await contrast(apply) };
  await capture(page, "accessibility-my-actions-focus", "IT_STAFF", "Labelled filters, keyboard focus and textual identities/status", 1, { sampledContrast: ratios });
  expect(f.pageErrors).toEqual([]);
});

test("T-38 genuine 200% tab zoom reflows Actions, dialogs, history and My Actions; zoom/profile restored", async ({ fixture: f }) => {
  const action = await layoutData(f);
  await genuineZoom(async (page, _worker, zoom) => {
    await login(page, f.operator); await page.goto(`/staff/tickets/${f.ticket.id}`);
    const region = page.getByRole("region", { name: "Actions Taken", exact: true });
    const record = page.locator(`#action-${action.id}`); await expect(record).toBeVisible();
    const unzoomedWidth = await page.evaluate(() => innerWidth);
    expect(await zoom()).toBe(1); expect(await zoom(2)).toBe(2); await expect.poll(() => zoom()).toBe(2);
    await expect.poll(() => page.evaluate(() => innerWidth)).toBeLessThan(unzoomedWidth);
    expect(await page.evaluate(() => visualViewport?.scale ?? 1)).toBe(1);
    await region.scrollIntoViewIfNeeded();
    await capture(page, "zoom200-staff-actions", "IT_STAFF", "Genuine 2.0 tab zoom: long Actions reflow", 2, { verifiedTabZoom: await zoom(), pinchScale: await page.evaluate(() => visualViewport?.scale) });
    await geometry(page, region); await reachable(region.getByLabel("Actions per page"));
    await region.getByRole("button", { name: "Create Action", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "Create Action", exact: true });
    await expect(dialog.getByLabel("Assigned to")).toHaveValue(String(f.operator.id));
    await dialog.getByLabel("Description", { exact: true }).fill(longDescription);
    await capture(page, "zoom200-create", "IT_STAFF", "Genuine 2.0 tab zoom: Create fields and scrollable controls", 2, { verifiedTabZoom: await zoom() });
    await geometry(page, dialog); await reachable(dialog.getByRole("button", { name: "Create action", exact: true })); await trap(page, dialog); await page.keyboard.press("Escape");
    for (const [button, title] of [["Edit", "Edit Action"], ["Reassign", "Reassign Action"], ["Complete", "Complete Action"], ["Cancel", "Cancel Action"], ["View history", "Action history"]] as const) {
      const trigger = record.getByRole("button", { name: button, exact: true }); await trigger.click();
      dialog = page.getByRole("dialog", { name: title, exact: true }); await expect(dialog).toBeVisible();
      if (button === "View history") await expect(dialog.getByRole("list", { name: "Action history events" })).toBeVisible();
      else {
        await expect(dialog.locator("textarea,select").first()).toBeVisible();
        if (button === "Reassign") await dialog.getByLabel("Assigned to").selectOption(String(f.operator.id));
        if (button === "Complete") await dialog.getByLabel("Result", { exact: true }).fill("Verified zoomed completion draft 😀");
        if (button === "Cancel") await dialog.getByLabel("Cancellation reason", { exact: true }).fill("Verified zoomed cancellation draft 😀");
      }
      await geometry(page, dialog); await reachable(dialog.getByRole("button").last()); await trap(page, dialog);
      if (button === "View history") await capture(page, "zoom200-history", "IT_STAFF", "Genuine 2.0 tab zoom: full safe history", 2, { verifiedTabZoom: await zoom() });
      await page.keyboard.press("Escape"); await expect(trigger).toBeFocused();
    }
    await page.goto(`/staff/actions?search=${f.marker}`); await expect(page.getByRole("list", { name: "My assigned Actions records" })).toBeVisible();
    expect(await zoom()).toBe(2);
    await capture(page, "zoom200-my-actions", "IT_STAFF", "Genuine 2.0 tab zoom: My Actions filters and records", 2, { verifiedTabZoom: await zoom() });
    await geometry(page); await reachable(page.getByRole("button", { name: "Apply filters" })); await reachable(page.getByLabel("Actions per page"));
  });
});
