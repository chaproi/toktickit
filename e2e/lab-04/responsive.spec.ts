import { expect } from "@playwright/test";
import { test, login } from "./action-browser-fixtures.js";
import { capture, geometry, layoutData, reachable, viewports, longDescription, longNote, longAttachmentNotes } from "./action-layout-helpers.js";

// Issue #45's domain contribution to T-37/AC-37; comprehensive earlier screens remain #49.
for (const viewport of viewports) {
  test(`T-37 Actions screens and all dialogs reflow at ${viewport.width}x${viewport.height}`, async ({ page, fixture: f }) => {
    await page.setViewportSize(viewport);
    const action = await layoutData(f);
    const prefix = `${viewport.width}x${viewport.height}`;
    await login(page, f.operator); await page.goto(`/staff/tickets/${f.ticket.id}`);
    const region = page.getByRole("region", { name: "Actions Taken", exact: true });
    const record = page.locator(`#action-${action.id}`);
    await expect(record.getByRole("heading", { name: longDescription, exact: true })).toBeVisible();
    await region.scrollIntoViewIfNeeded();
    await capture(page, `${prefix}-staff-actions`, "IT_STAFF", "Ticket Actions long content and distinct identities");
    await geometry(page, region);
    await reachable(region.getByLabel("Actions per page"));
    await expect(region.getByLabel("Actions per page").locator("option")).toHaveText(["20", "50", "100"]);

    await region.getByRole("button", { name: "Create Action", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "Create Action", exact: true });
    await expect(dialog.getByLabel("Assigned to")).toHaveValue(String(f.operator.id));
    await dialog.getByLabel("Description", { exact: true }).fill(longDescription);
    await dialog.getByLabel("Follow-up required").check(); await dialog.getByLabel("Follow-up note", { exact: true }).fill(longNote);
    await dialog.getByLabel("Attachment Notes", { exact: true }).fill(longAttachmentNotes);
    await dialog.getByLabel("Assigned to").selectOption(String(f.assignee.id));
    await capture(page, `${prefix}-create`, "IT_STAFF", "Create draft with long text and eligible worker name");
    await geometry(page, dialog); await reachable(dialog.getByRole("button", { name: "Create action", exact: true }));
    await reachable(dialog.getByRole("button", { name: "Cancel", exact: true }));
    await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);

    for (const [button, title, control, value] of [
      ["Edit", "Edit Action", "Description", longDescription],
      ["Reassign", "Reassign Action", "Assigned to", String(f.operator.id)],
      ["Complete", "Complete Action", "Result", longNote],
      ["Cancel", "Cancel Action", "Cancellation reason", longNote],
    ] as const) {
      await record.getByRole("button", { name: button, exact: true }).click();
      dialog = page.getByRole("dialog", { name: title, exact: true });
      await expect(dialog.getByLabel(control, { exact: true })).toBeVisible();
      if (button === "Reassign") await dialog.getByLabel(control).selectOption(value);
      else await dialog.getByLabel(control, { exact: true }).fill(value);
      if (viewport.width === 1440) await capture(page, `${prefix}-${button.toLowerCase()}`, "IT_STAFF", `${title} long content`);
      await geometry(page, dialog);
      for (const target of await dialog.getByRole("button").all()) await reachable(target);
      if (button === "Edit") {
        await dialog.getByLabel("Follow-up required").click();
        const confirmation = page.getByRole("dialog", { name: "Clear follow-up note?", exact: true });
        if (viewport.width === 390) await capture(page, `${prefix}-clear-confirmation`, "IT_STAFF", "Follow-up clear confirmation");
        await geometry(page, confirmation); await reachable(confirmation.getByRole("button", { name: "Keep note" }));
        await reachable(confirmation.getByRole("button", { name: "Clear note" }));
        await page.keyboard.press("Escape"); await expect(page.getByRole("dialog", { name: "Edit Action", exact: true })).toBeVisible();
        await expect(page.getByLabel("Follow-up required")).toBeChecked();
      }
      await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0);
    }

    await record.getByRole("button", { name: "View history" }).click();
    dialog = page.getByRole("dialog", { name: "Action history", exact: true });
    await expect(dialog.getByRole("list", { name: "Action history events" })).toBeVisible();
    await capture(page, `${prefix}-history`, "IT_STAFF", "Full safe before/after history and long text");
    await geometry(page, dialog); await reachable(dialog.getByLabel("History events per page"));
    await reachable(dialog.getByRole("button", { name: "Close history" })); await page.keyboard.press("Escape");

    await page.goto(`/staff/actions?search=${f.marker}`);
    await expect(page.getByRole("list", { name: "My assigned Actions records" })).toBeVisible();
    await capture(page, `${prefix}-my-actions`, "IT_STAFF", "My assigned Actions filters, literal content and pagination");
    await geometry(page); await reachable(page.getByRole("button", { name: "Apply filters" }));
    await reachable(page.getByLabel("Actions per page"));
    await page.getByRole("button", { name: "Logout" }).click(); await login(page, f.requester);
    await page.goto(`/tickets/${f.ticket.id}`);
    await expect(page.locator(`#action-${action.id}`)).toBeVisible(); await region.scrollIntoViewIfNeeded();
    await capture(page, `${prefix}-requester-actions`, "REQUESTER", "Owned Requester read-only Actions");
    await geometry(page, region); await reachable(page.locator(`#action-${action.id}`).getByRole("button", { name: "View history" }));
    await expect(region.getByRole("button", { name: /^(Create Action|Edit|Reassign|Complete|Cancel)$/ })).toHaveCount(0);
    expect(f.pageErrors).toEqual([]);
  });
}
