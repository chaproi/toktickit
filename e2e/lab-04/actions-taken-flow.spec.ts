import { expect, type Locator, type Page } from "@playwright/test";
import { test, login, historySnapshot, syntheticAction, type ActionDTO } from "./action-browser-fixtures.js";

// Partial T-48/AC-40, with T-02/03/06/08/09/10/13/39/50/54/55.
// Real browser workflows only: not Dashboard, cascade, responsive or 200% zoom evidence.
const actionFields = ["id", "ticketId", "actionAt", "description", "result", "createdBy", "assignee", "performedBy",
  "status", "followUpRequired", "followUpNote", "attachmentNotes", "cancellationReason", "createdAt", "updatedAt", "completedAt", "cancelledAt", "version"];
const snapshotFields = ["id", "ticketId", "actionAt", "description", "result", "createdById", "assigneeId", "performedById",
  "status", "followUpRequired", "followUpNote", "attachmentNotes", "cancellationReason", "createdAt", "updatedAt", "completedAt", "cancelledAt", "version"];
const literalNotes = '<script>window.__actionTextExecuted = true</script> <a href="/private-file">notes 😀</a>';
const utc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function field(record: Locator, label: string) { return record.getByText(label, { exact: true }).locator("..").locator("dd"); }
function actionRecord(page: Page, id: number) { return page.locator(`#action-${id}`); }
async function ticketRegion(page: Page, ticketId: number, requester = false) {
  await page.goto(`/${requester ? "tickets" : "staff/tickets"}/${ticketId}`);
  const region = page.getByRole("region", { name: "Actions Taken", exact: true });
  await expect(region).toHaveAttribute("aria-busy", "false");
  return region;
}
function assertActionDto(action: ActionDTO) {
  expect(Object.keys(action).sort()).toEqual([...actionFields].sort());
  for (const identity of [action.createdBy, action.assignee, action.performedBy]) {
    if (identity) expect(Object.keys(identity).sort()).toEqual(["id", "name"]);
  }
  for (const instant of [action.actionAt, action.createdAt, action.updatedAt]) expect(instant).toMatch(utc);
}
async function mutation(page: Page, button: Locator, method: "POST" | "PATCH", path: string, status = 200) {
  const [response] = await Promise.all([
    page.waitForResponse((value) => new URL(value.url()).pathname === path && value.request().method() === method), button.click(),
  ]);
  expect(response.status()).toBe(status);
  const body = await response.json() as { action: ActionDTO; ticketUpdatedAt: string; replayed?: boolean };
  // Fresh API-04/05/06 responses need not include the receipt replay marker.
  assertActionDto(body.action); expect(body.ticketUpdatedAt).toMatch(utc); expect(body.replayed).not.toBe(true);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Refreshing Actions and Ticket…", { exact: true })).toHaveCount(0);
  return { ...body, input: response.request().postDataJSON() as Record<string, unknown> };
}
async function openOperation(page: Page, id: number, button: string, title: string) {
  await actionRecord(page, id).getByRole("button", { name: button, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: title, exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Loading Action…", { exact: true })).toHaveCount(0);
  return dialog;
}
async function history(page: Page, id: number) {
  await actionRecord(page, id).getByRole("button", { name: "View history" }).click();
  const dialog = page.getByRole("dialog", { name: "Action history", exact: true });
  await expect(dialog.getByRole("list", { name: "Action history events" })).toBeVisible();
  return dialog;
}

test("T-48 AC-03/06/08/09/10/13/45: non-assignee Staff creates, edits, starts and completes a delegated Action", async ({ page, fixture: f, browserName }) => {
  console.info(`Issue45 browser=${browserName}; real authentication/React/Express/PostgreSQL; no endpoint mocks.`);
  await page.addInitScript(() => { Reflect.set(window, "__actionTextExecuted", false); });
  await login(page, f.operator);
  const region = await ticketRegion(page, f.ticket.id);
  const parentBefore = await f.prisma.ticket.findUniqueOrThrow({ where: { id: f.ticket.id }, select: { updatedAt: true } });
  await region.getByRole("button", { name: "Create Action", exact: true }).click();
  const create = page.getByRole("dialog", { name: "Create Action", exact: true });
  await expect(create.getByLabel("Assigned to")).toHaveValue(String(f.operator.id));
  await create.getByLabel("Description", { exact: true }).fill("  Investigate delegated connection 😀 <script>literal</script>  ");
  await create.getByLabel("Assigned to").selectOption(String(f.assignee.id));
  await create.getByLabel("Attachment Notes", { exact: true }).fill(literalNotes);
  const created = await mutation(page, create.getByRole("button", { name: "Create action", exact: true }), "POST", `/api/tickets/${f.ticket.id}/actions`, 201);
  expect(created.action.description).toBe("Investigate delegated connection 😀 <script>literal</script>");
  expect(created.action.createdBy).toEqual({ id: f.operator.id, name: f.operator.name });
  expect(created.action.assignee).toEqual({ id: f.assignee.id, name: f.assignee.name });
  expect(created.action.performedBy).toBeNull(); expect(created.action.status).toBe("PLANNED"); expect(created.action.version).toBe(1);
  expect(created.action.actionAt).toBe(created.action.createdAt); expect(created.action.updatedAt).toBe(created.action.createdAt);
  expect(Date.parse(created.ticketUpdatedAt)).toBeGreaterThan(parentBefore.updatedAt.getTime());
  const record = actionRecord(page, created.action.id);
  await expect(record.getByRole("heading", { name: created.action.description, exact: true })).toBeVisible();
  await expect(field(record, "Attachment Notes")).toHaveText(literalNotes);
  await expect(field(record, "Attachment Notes").locator("script, a")).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, "__actionTextExecuted"))).toBe(false);

  const edit = await openOperation(page, created.action.id, "Edit", "Edit Action");
  const editedText = "Edited delegated diagnostic 😀 <b>literal content</b>";
  await edit.getByLabel("Description", { exact: true }).fill(editedText);
  const edited = await mutation(page, edit.getByRole("button", { name: "Save changes" }), "PATCH", `/api/tickets/${f.ticket.id}/actions/${created.action.id}`);
  expect(edited.action.description).toBe(editedText); expect(edited.action.version).toBe(2);
  expect(edited.action.actionAt).toBe(created.action.actionAt); expect(edited.action.createdBy).toEqual(created.action.createdBy);
  expect(Date.parse(edited.action.updatedAt)).toBeGreaterThan(Date.parse(created.action.updatedAt));
  expect(Date.parse(edited.ticketUpdatedAt)).toBeGreaterThan(Date.parse(created.ticketUpdatedAt));
  const start = await openOperation(page, created.action.id, "Start", "Start Action");
  const started = await mutation(page, start.getByRole("button", { name: "Start action" }), "PATCH", `/api/tickets/${f.ticket.id}/actions/${created.action.id}/status`);
  expect(started.action.status).toBe("IN_PROGRESS"); expect(started.action.version).toBe(3); expect(started.action.performedBy).toBeNull();
  expect(Date.parse(started.action.updatedAt)).toBeGreaterThan(Date.parse(edited.action.updatedAt));
  expect(Date.parse(started.ticketUpdatedAt)).toBeGreaterThan(Date.parse(edited.ticketUpdatedAt));
  const complete = await openOperation(page, created.action.id, "Complete", "Complete Action");
  const result = "Verified the repaired connection 😀 <script>inert result</script>";
  await complete.getByLabel("Result", { exact: true }).fill(result);
  const completed = await mutation(page, complete.getByRole("button", { name: "Confirm completion" }), "PATCH", `/api/tickets/${f.ticket.id}/actions/${created.action.id}/status`);
  expect(f.operator.id).not.toBe(f.assignee.id); expect(f.operator.id).not.toBe(f.owner.id);
  expect(completed.action.status).toBe("COMPLETED"); expect(completed.action.version).toBe(4); expect(completed.action.result).toBe(result);
  expect(completed.action.assignee).toEqual(created.action.assignee); expect(completed.action.performedBy).toEqual({ id: f.operator.id, name: f.operator.name });
  expect(completed.action.completedAt).toBe(completed.action.updatedAt);
  expect(Date.parse(completed.action.updatedAt)).toBeGreaterThan(Date.parse(started.action.updatedAt));
  expect(Date.parse(completed.ticketUpdatedAt)).toBeGreaterThan(Date.parse(started.ticketUpdatedAt));
  await expect(field(record, "Performed by")).toHaveText(f.operator.name);
  await expect(record.getByRole("button", { name: /^(Edit|Reassign|Start|Complete|Cancel)$/ })).toHaveCount(0);
  const persisted = await f.prisma.action.findUniqueOrThrow({ where: { id: created.action.id } });
  expect(historySnapshot(persisted)).toEqual({ ...Object.fromEntries(Object.entries(completed.action).filter(([key]) => !["createdBy", "assignee", "performedBy"].includes(key))),
    createdById: f.operator.id, assigneeId: f.assignee.id, performedById: f.operator.id });
  const parentAfter = await f.prisma.ticket.findUniqueOrThrow({ where: { id: f.ticket.id }, select: { ownerId: true, updatedAt: true } });
  expect(parentAfter.ownerId).toBe(f.owner.id); expect(parentAfter.updatedAt.toISOString()).toBe(completed.ticketUpdatedAt);
  const receipts = await f.prisma.mutationReceipt.count({ where: { actionId: persisted.id } }); expect(receipts).toBe(4);
  const dialog = await history(page, persisted.id);
  const labels = await dialog.getByRole("list", { name: "Action history events" }).getByRole("heading", { level: 3 }).allTextContents();
  expect(labels).toEqual(["Created", "Edited", "Started", "Completed"]);
  await expect(dialog.getByText("No previous record", { exact: true })).toBeVisible();
  const events = await f.prisma.actionHistory.findMany({ where: { actionId: persisted.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  expect(events.map((event) => event.actionVersion)).toEqual([1, 2, 3, 4]);
  expect(events[0]!.before).toBeNull(); expect(events[3]!.after).toEqual(historySnapshot(persisted));
  for (const event of events) expect(Object.keys(event.after as object).sort()).toEqual([...snapshotFields].sort());
  await dialog.getByRole("button", { name: "Close history" }).click();
  expect(f.pageErrors).toEqual([]);
});

test("T-48 AC-02/03/39/45: owned Requester reads inert Actions/history and logout prevents foreign data retention", async ({ page, fixture: f }) => {
  await page.addInitScript(() => { Reflect.set(window, "__actionTextExecuted", false); });
  const action = await syntheticAction(f, { description: `${f.marker} protected completed Action 😀`, status: "COMPLETED", attachmentNotes: literalNotes });
  const before = historySnapshot(action);
  const parentBefore = await f.prisma.ticket.findUniqueOrThrow({ where: { id: f.ticket.id }, select: { updatedAt: true } });
  await login(page, f.requester);
  const protectedRequests: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/staff/") || path.startsWith("/api/admin/")) protectedRequests.push(path);
  });
  await ticketRegion(page, f.ticket.id, true);
  const record = actionRecord(page, action.id);
  await expect(record.getByRole("heading", { name: action.description })).toBeVisible();
  await expect(field(record, "Created by")).toHaveText(f.owner.name);
  await expect(field(record, "Assigned to")).toHaveText(f.assignee.name);
  await expect(field(record, "Performed by")).toHaveText(f.operator.name);
  await expect(page.getByRole("button", { name: /^(Create Action|Edit|Reassign|Start|Complete|Cancel)$/ })).toHaveCount(0);
  await expect(page.getByText(`${f.marker} private Internal Note`, { exact: true })).toHaveCount(0);
  await expect(field(record, "Attachment Notes")).toHaveText(literalNotes); await expect(record.locator("script, a")).toHaveCount(0);
  const dialog = await history(page, action.id);
  await expect(dialog.getByRole("heading", { name: "Completed", exact: true })).toBeVisible();
  await expect(dialog.getByText(literalNotes, { exact: true })).toHaveCount(5);
  await expect(dialog.locator("script, a")).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, "__actionTextExecuted"))).toBe(false);
  const read = await page.request.get(`http://127.0.0.1:3100/api/tickets/${f.ticket.id}/actions/${action.id}/history`);
  expect(read.status()).toBe(200);
  const payload = await read.json() as { items: Array<Record<string, unknown>> };
  for (const event of payload.items) {
    expect(Object.keys(event).sort()).toEqual(["id", "actionId", "actor", "event", "createdAt", "actionVersion", "sourceTicketStatusHistoryId", "before", "after"].sort());
    expect(Object.keys(event.actor as object).sort()).toEqual(["id", "name"]);
    for (const snapshot of [event.before, event.after]) if (snapshot) expect(Object.keys(snapshot as object).sort()).toEqual([...snapshotFields].sort());
  }
  expect(JSON.stringify(payload)).not.toContain("private Internal Note"); expect(protectedRequests).toEqual([]);
  await dialog.getByRole("button", { name: "Close history" }).click();
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByText(action.description, { exact: true })).toHaveCount(0);
  await login(page, f.foreign); await page.goto(`/tickets/${f.ticket.id}`);
  await expect(page.getByText("Ticket not found.", { exact: true })).toBeVisible();
  await expect(page.getByText(action.description, { exact: true })).toHaveCount(0); await expect(page.getByText(literalNotes, { exact: true })).toHaveCount(0);
  const forbidden = await page.request.get(`http://127.0.0.1:3100/api/tickets/${f.ticket.id}/actions`);
  const missing = await page.request.get("http://127.0.0.1:3100/api/tickets/2147483000/actions");
  expect(forbidden.status()).toBe(404); expect(missing.status()).toBe(404);
  expect(await forbidden.json()).toEqual(await missing.json());
  expect((await forbidden.json()).error.code).toBe("TICKET_NOT_FOUND"); expect(protectedRequests).toEqual([]);
  expect(historySnapshot(await f.prisma.action.findUniqueOrThrow({ where: { id: action.id } }))).toEqual(before);
  expect(await f.prisma.actionHistory.count({ where: { actionId: action.id } })).toBe(3);
  expect(await f.prisma.mutationReceipt.count({ where: { actionId: action.id } })).toBe(0);
  expect((await f.prisma.ticket.findUniqueOrThrow({ where: { id: f.ticket.id }, select: { updatedAt: true } })).updatedAt.getTime()).toBe(parentBefore.updatedAt.getTime());
  expect(f.pageErrors).toEqual([]);
});

test("T-48/T-50 AC-08/41/45: cancelling follow-up clear preserves state; confirmed clear sends null and retains history", async ({ page, fixture: f }) => {
  const note = "Retain the original follow-up 😀 <script>literal note</script>";
  const action = await syntheticAction(f, { description: `${f.marker} follow-up clearing`, followUpNote: note });
  await login(page, f.operator); await ticketRegion(page, f.ticket.id);
  const before = await f.prisma.action.findUniqueOrThrow({ where: { id: action.id } });
  const parent = await f.prisma.ticket.findUniqueOrThrow({ where: { id: f.ticket.id }, select: { updatedAt: true } });
  const writes: Array<Record<string, unknown>> = [];
  page.on("request", (request) => { if (request.method() === "PATCH" && new URL(request.url()).pathname === `/api/tickets/${f.ticket.id}/actions/${action.id}`) writes.push(request.postDataJSON()); });
  let edit = await openOperation(page, action.id, "Edit", "Edit Action");
  await expect(edit.getByLabel("Follow-up note", { exact: true })).toHaveValue(note);
  // A click opens confirmation; uncheck() would incorrectly wait for an immediate state change.
  await edit.getByLabel("Follow-up required", { exact: true }).click();
  let confirmation = page.getByRole("dialog", { name: "Clear follow-up note?", exact: true });
  await confirmation.getByRole("button", { name: "Keep note" }).click();
  edit = page.getByRole("dialog", { name: "Edit Action", exact: true });
  await expect(edit.getByLabel("Follow-up required", { exact: true })).toBeChecked();
  await expect(edit.getByLabel("Follow-up note", { exact: true })).toHaveValue(note);
  expect(writes).toHaveLength(0);
  expect(historySnapshot(await f.prisma.action.findUniqueOrThrow({ where: { id: action.id } }))).toEqual(historySnapshot(before));
  expect(await f.prisma.actionHistory.count({ where: { actionId: action.id } })).toBe(1);
  expect(await f.prisma.mutationReceipt.count({ where: { actionId: action.id } })).toBe(0);
  expect((await f.prisma.ticket.findUniqueOrThrow({ where: { id: f.ticket.id }, select: { updatedAt: true } })).updatedAt.getTime()).toBe(parent.updatedAt.getTime());
  await edit.getByLabel("Follow-up required", { exact: true }).click();
  confirmation = page.getByRole("dialog", { name: "Clear follow-up note?", exact: true });
  await confirmation.getByRole("button", { name: "Clear note" }).click();
  edit = page.getByRole("dialog", { name: "Edit Action", exact: true });
  await expect(edit.getByLabel("Follow-up required", { exact: true })).not.toBeChecked();
  const saved = await mutation(page, edit.getByRole("button", { name: "Save changes" }), "PATCH", `/api/tickets/${f.ticket.id}/actions/${action.id}`);
  expect(writes).toHaveLength(1);
  expect(Object.keys(writes[0]!).sort()).toEqual(["followUpRequired", "followUpNote", "expectedVersion", "expectedTicketUpdatedAt", "clientMutationId"].sort());
  expect(writes[0]!.followUpRequired).toBe(false); expect(writes[0]!.followUpNote).toBeNull();
  expect(saved.action.followUpRequired).toBe(false); expect(saved.action.followUpNote).toBeNull(); expect(saved.action.version).toBe(2);
  const persisted = await f.prisma.action.findUniqueOrThrow({ where: { id: action.id } });
  expect(persisted.followUpNote).toBeNull(); expect(persisted.updatedAt.toISOString()).toBe(saved.action.updatedAt);
  const events = await f.prisma.actionHistory.findMany({ where: { actionId: action.id }, orderBy: { actionVersion: "asc" } });
  expect(events).toHaveLength(2); expect(events[1]!.event).toBe("ACTION_EDITED");
  expect((events[1]!.before as { followUpNote: string }).followUpNote).toBe(note); expect((events[1]!.after as { followUpNote: null }).followUpNote).toBeNull();
  const dialog = await history(page, action.id);
  const editedEvent = dialog.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Edited", exact: true }) });
  await expect(field(editedEvent.getByRole("region", { name: "Before", exact: true }), "Follow-up note")).toHaveText(note);
  await expect(field(editedEvent.getByRole("region", { name: "After", exact: true }), "Follow-up note")).toHaveText("Not recorded");
  expect(f.pageErrors).toEqual([]);
});

test("T-48/T-54 AC-03/44: My assigned Actions uses real actor filtering/pagination, selected detail and safe Dashboard handoff", async ({ page, fixture: f }) => {
  const at = new Date(Date.now() - 60_000);
  for (let index = 0; index < 10; index++) await syntheticAction(f, { description: `${f.marker} other-worker ${index}`, createdAt: at });
  const mine = [];
  for (let index = 0; index < 12; index++) mine.push(await syntheticAction(f, { description: `${f.marker} mine ${String(index).padStart(2, "0")}`, assigneeId: f.operator.id,
    status: index === 0 ? "COMPLETED" : index === 1 ? "IN_PROGRESS" : "PLANNED", attachmentNotes: literalNotes, createdAt: at }));
  await login(page, f.operator);
  const query = new URLSearchParams({ search: f.marker, categoryId: String(f.categoryId), relatedSystemId: String(f.relatedSystemId),
    requestedPriority: "HIGH", itPriority: "MEDIUM", currentStatus: "OPEN", owner: String(f.owner.id) });
  const firstResponse = page.waitForResponse((value) => new URL(value.url()).pathname === "/api/staff/actions");
  await page.goto(`/staff/actions?${query}`);
  const first = await firstResponse; expect(first.status()).toBe(200);
  const firstQuery = new URL(first.url()).searchParams;
  expect(firstQuery.get("assignee")).toBe("me"); expect(firstQuery.get("page")).toBe("1"); expect(firstQuery.get("pageSize")).toBe("10");
  const firstBody = await first.json(); expect(firstBody.items.map((row: { action: ActionDTO }) => row.action.id)).toEqual(mine.slice(0, 10).map((action) => action.id));
  expect(firstBody.pagination.totalItems).toBe(12);
  const records = page.getByRole("list", { name: "My assigned Actions records" });
  await expect(records.getByRole("listitem")).toHaveCount(10);
  await expect(records.getByText(/other-worker/)).toHaveCount(0);
  expect(firstBody.items.every((row: { action: ActionDTO }) => row.action.assignee.id === f.operator.id)).toBe(true);
  for (const row of firstBody.items) { expect(Object.keys(row.ticket).sort()).toEqual(["id", "ticketNumber", "summary", "currentStatus"].sort()); assertActionDto(row.action); }
  const paging = page.getByRole("navigation", { name: "My Actions pagination" });
  await expect(paging.getByLabel("Actions per page").locator("option")).toHaveText(["10", "25", "50"]);
  await expect(paging).toContainText("Page 1 of 2; 12 Actions");
  const secondResponse = page.waitForResponse((value) => new URL(value.url()).pathname === "/api/staff/actions" && new URL(value.url()).searchParams.get("page") === "2");
  await paging.getByRole("button", { name: "Next", exact: true }).click(); expect((await secondResponse).status()).toBe(200);
  await expect(paging).toContainText("Page 2 of 2; 12 Actions"); await expect(records.getByRole("listitem")).toHaveCount(2);
  const filters = page.getByRole("form", { name: "Assigned Actions filters" });
  await filters.getByLabel("Action status", { exact: true }).selectOption("PLANNED");
  await filters.getByLabel("Action status group", { exact: true }).selectOption("unfinished");
  const filteredResponse = page.waitForResponse((value) => { const url = new URL(value.url()); return url.pathname === "/api/staff/actions" && url.searchParams.get("status") === "PLANNED"; });
  await filters.getByRole("button", { name: "Apply filters" }).click(); const filtered = await filteredResponse; expect(filtered.status()).toBe(200);
  const filteredQuery = new URL(filtered.url()).searchParams;
  expect(filteredQuery.get("page")).toBe("1"); expect(filteredQuery.get("actionStatusGroup")).toBe("unfinished"); expect(filteredQuery.get("currentStatus")).toBe("OPEN");
  for (const [name, value] of query) expect(filteredQuery.get(name)).toBe(value);
  await expect(paging).toContainText("Page 1 of 1; 10 Actions");
  await expect(records.getByRole("heading", { level: 2 })).toHaveText(mine.slice(2).map((action) => action.description));
  await expect(records.locator("script, a[href='/private-file']")).toHaveCount(0);
  const sizeResponse = page.waitForResponse((value) => new URL(value.url()).pathname === "/api/staff/actions" && new URL(value.url()).searchParams.get("pageSize") === "25");
  await paging.getByLabel("Actions per page").selectOption("25"); expect((await sizeResponse).status()).toBe(200); await expect(records.getByRole("listitem")).toHaveCount(10);
  const back = await page.getByRole("link", { name: "Back to Dashboard" }).getAttribute("href");
  const destination = new URL(back!, "http://127.0.0.1:4173"); expect(destination.pathname).toBe("/staff/dashboard");
  expect([...destination.searchParams.keys()].sort()).toEqual([...query.keys()].sort());
  for (const [name, value] of query) expect(destination.searchParams.get(name)).toBe(value);
  // Only verify the known URL; Dashboard rendering is #47/#48, not a placeholder route.
  const selected = mine[11]!;
  const row = records.getByRole("listitem").filter({ has: page.getByRole("heading", { name: selected.description, exact: true }) });
  const detail = row.getByRole("link", { name: f.ticket.ticketNumber, exact: true });
  await expect(detail).toHaveAttribute("href", `/staff/tickets/${f.ticket.id}#action-${selected.id}`);
  const detailResponse = page.waitForResponse((value) => new URL(value.url()).pathname === `/api/tickets/${f.ticket.id}/actions/${selected.id}`);
  await detail.click(); expect((await detailResponse).status()).toBe(200);
  await expect(page).toHaveURL(new RegExp(`/staff/tickets/${f.ticket.id}#action-${selected.id}$`));
  await expect(actionRecord(page, selected.id)).toBeFocused(); await expect(actionRecord(page, selected.id)).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Selected Action (outside this page)", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Actions pagination" })).toContainText("Page 1 of 2; 22 Actions");
  await page.getByRole("button", { name: "Logout" }).click(); await login(page, f.requester);
  const privileged: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/staff/actions") privileged.push("staff-actions"); });
  await page.goto("/staff/actions"); await expect(page.getByRole("heading", { name: "Forbidden", exact: true })).toBeVisible();
  expect(privileged).toEqual([]); await expect(page.getByText(selected.description, { exact: true })).toHaveCount(0); expect(f.pageErrors).toEqual([]);
});
