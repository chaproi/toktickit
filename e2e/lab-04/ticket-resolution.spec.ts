import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { expect, type Page } from "@playwright/test";
import { test, login, historySnapshot, type Fixture } from "./action-browser-fixtures.js";

// Partial T-17/18/19/20/21/48/53/55, AC-17/18/19/20/21/40/43/45.
// Real UI/API/database workflows; constructed setup cohorts are labelled below.
// Stale browser contexts are NOT PostgreSQL overlap/T-16/T-44 evidence.
const api = "http://127.0.0.1:3100";
const baseURL = "http://127.0.0.1:4173";
const reason = "Workflow reason <script>window.__ticketTextExecuted=true</script> & literal text";
const followUp = "Informative follow-up remains valid after completed work.";
const consoleWarnings: string[] = [];

function equal(actual: unknown, expected: unknown, label: string) {
  expect(isDeepStrictEqual(actual, expected), `${label}; comparison contents withheld`).toBe(true);
}

async function state(f: Fixture) {
  const ticketId = f.ticket.id;
  const [ticket, actions, history, ticketHistory, receipts, notes] = await Promise.all([
    f.prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } }),
    f.prisma.action.findMany({ where: { ticketId }, orderBy: { id: "asc" } }),
    f.prisma.actionHistory.findMany({ where: { action: { ticketId } }, orderBy: { id: "asc" } }),
    f.prisma.ticketStatusHistory.findMany({ where: { ticketId }, orderBy: { id: "asc" } }),
    f.prisma.mutationReceipt.findMany({ where: { ticketId }, orderBy: { id: "asc" } }),
    f.prisma.internalNote.findMany({ where: { ticketId }, orderBy: { id: "asc" } }),
  ]);
  return { ticket, actions, history, ticketHistory, receipts, notes };
}
type State = Awaited<ReturnType<typeof state>>;

async function fixtureHistory(f: Fixture) {
  // The shared fixture constructs an OPEN Ticket; this prior null-reason event
  // is setup history, not a claimed user-driven NEW -> OPEN workflow.
  await f.prisma.ticketStatusHistory.create({ data: { ticketId: f.ticket.id, actorId: f.owner.id,
    fromStatus: "NEW", toStatus: "OPEN", reason: null } });
}

async function signIn(page: Page, user: Fixture["operator"]) {
  try { await login(page, user); }
  catch { throw new Error("Workflow browser login failed; sensitive details withheld."); }
}

async function unsafe(page: Page, method: "POST" | "PATCH", path: string, data: object, status = 200) {
  const csrf = (await page.context().cookies(api)).find((cookie) => cookie.name === "toktickit_csrf")?.value;
  expect(Boolean(csrf), "Real login provides CSRF; cookie contents withheld").toBe(true);
  let response;
  try { response = await page.request.fetch(`${api}${path}`, { method, data,
    headers: { Origin: baseURL, "X-CSRF-Token": csrf! } }); }
  catch { throw new Error("Workflow fixture API transport failed; sensitive details withheld."); }
  expect(response.status()).toBe(status);
  return response.json();
}

async function fixtureAction(page: Page, f: Fixture, status: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED") {
  // Fixture creation through real APIs, not evidence of the UI flow being tested.
  const parent = await f.prisma.ticket.findUniqueOrThrow({ where: { id: f.ticket.id } });
  const created = await unsafe(page, "POST", `/api/tickets/${f.ticket.id}/actions`, {
    description: `${f.marker} ${status} setup cohort`, result: "Retained draft diagnostic result",
    assigneeId: f.assignee.id, followUpRequired: true, followUpNote: followUp,
    attachmentNotes: "Literal <script>fixture note</script>", expectedTicketUpdatedAt: parent.updatedAt.toISOString(), clientMutationId: randomUUID(),
  }, 201) as { action: { id: number } };
  const advance = async (targetStatus: "IN_PROGRESS" | "COMPLETED" | "CANCELLED") => {
    const current = await state(f), action = current.actions.find((row) => row.id === created.action.id)!;
    await unsafe(page, "PATCH", `/api/tickets/${f.ticket.id}/actions/${action.id}/status`, {
      targetStatus, expectedVersion: action.version, expectedTicketUpdatedAt: current.ticket.updatedAt.toISOString(), clientMutationId: randomUUID(),
      ...(targetStatus === "COMPLETED" ? { confirm: true, result: "Completed fixture diagnostics" } : {}),
      ...(targetStatus === "CANCELLED" ? { confirm: true, reason: "Independently cancelled fixture task" } : {}),
    });
  };
  if (status === "IN_PROGRESS" || status === "COMPLETED") await advance("IN_PROGRESS");
  if (status === "COMPLETED" || status === "CANCELLED") await advance(status);
  return f.prisma.action.findUniqueOrThrow({ where: { id: created.action.id } });
}

async function openTicket(page: Page, f: Fixture, requester = false) {
  await page.goto(`/${requester ? "tickets" : "staff/tickets"}/${f.ticket.id}`);
  await expect(page.getByRole("heading", { name: requester ? "Ticket Detail" : f.ticket.ticketNumber, exact: true })).toBeVisible();
  const actions = page.getByRole("region", { name: "Actions Taken", exact: true });
  await expect(actions).toHaveAttribute("aria-busy", "false");
  return actions;
}

async function statusDraft(page: Page, target: "RESOLVED" | "CLOSED" | "CANCELLED", value: string) {
  await page.getByLabel("Next status", { exact: true }).selectOption(target);
  const dialog = page.getByRole("dialog", { name: target === "CANCELLED" ? "Cancel Ticket" : target === "RESOLVED" ? "Resolved Ticket" : "Closed Ticket", exact: true });
  await dialog.getByRole("textbox", { name: /reason/i }).fill(value);
  return dialog;
}

async function submitStatus(page: Page, f: Fixture, target: "RESOLVED" | "CLOSED" | "CANCELLED", status = 200) {
  const [response] = await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname === `/api/staff/tickets/${f.ticket.id}/status` && r.request().method() === "PATCH"),
    page.getByRole("dialog").getByRole("button", { name: target === "CANCELLED" ? "Confirm cancellation" : target === "RESOLVED" ? "Confirm resolved" : "Confirm closed", exact: true }).click(),
  ]);
  expect(response.status()).toBe(status);
  const input = response.request().postDataJSON() as Record<string, unknown>;
  expect(Object.keys(input).sort()).toEqual(["confirm", "expectedUpdatedAt", "reason", "targetStatus"]);
  expect(input.confirm).toBe(true); expect(input.targetStatus).toBe(target);
  if (status === 200) await saved(page);
  return { response, input };
}

async function saved(page: Page) {
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Status updated successfully.", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Actions Taken", exact: true })).toHaveAttribute("aria-busy", "false");
}

function transition(before: State, after: State, actorId: number, target: State["ticket"]["currentStatus"], value: string) {
  expect(after.ticket.currentStatus).toBe(target);
  expect(after.ticket.updatedAt.getTime()).toBeGreaterThan(before.ticket.updatedAt.getTime());
  equal(after.ticketHistory.slice(0, before.ticketHistory.length), before.ticketHistory, "Prior Ticket history unchanged");
  expect(after.ticketHistory).toHaveLength(before.ticketHistory.length + 1);
  const event = after.ticketHistory.at(-1)!;
  equal(event, { id: event.id, ticketId: before.ticket.id, actorId, fromStatus: before.ticket.currentStatus,
    toStatus: target, reason: value, createdAt: event.createdAt }, "Exactly one correct attributed transition and literal reason");
  equal(after.notes, before.notes, "Internal Notes remain unchanged");
  return event;
}

function unchangedActions(before: State, after: State) {
  equal(after.actions, before.actions, "Action rows unchanged");
  equal(after.history, before.history, "Action history unchanged");
  equal(after.receipts, before.receipts, "Original operation-time receipts unchanged");
}

test.beforeEach(async ({ browser, browserName, page }) => {
  consoleWarnings.length = 0;
  page.on("console", (message) => {
    if (message.type() === "warning") consoleWarnings.push(/React Router/.test(message.text()) ? "Router warning" : "Browser warning");
  });
  await page.addInitScript(() => { Reflect.set(window, "__ticketTextExecuted", false); });
  console.info(`Workflow46 environment: browser=${browserName}; version=${browser.version()}; node=${process.version}; platform=${process.platform}; real React/Express/PostgreSQL; no business-endpoint mocks.`);
});
test.afterEach(async ({ fixture: f }) => {
  expect(f.pageErrors).toEqual([]);
  console.info(`Workflow46 browser diagnostics: pageErrors=${f.pageErrors.length}; warningMessages=${consoleWarnings.length}; no warning text/credentials recorded.`);
});

test("T-18/19/20/48/53: unfinished work, non-assignee completion, resolution and paired reopening", async ({ page, browser, fixture: f }) => {
  await fixtureHistory(f); await signIn(page, f.operator);
  const target = await fixtureAction(page, f, "IN_PROGRESS");
  await fixtureAction(page, f, "COMPLETED");
  const requesterContext = await browser.newContext({ baseURL });
  try {
    const requester = await requesterContext.newPage(); requester.on("pageerror", () => f.pageErrors.push("Requester context page error"));
    await signIn(requester, f.requester); await openTicket(requester, f, true);
    await requester.getByRole("button", { name: "Problem Appears Resolved", exact: true }).click();
    const [indicated] = await Promise.all([
      requester.waitForResponse((r) => new URL(r.url()).pathname.endsWith("/resolution-indication") && r.request().method() === "POST"),
      requester.getByRole("button", { name: "Yes, it appears resolved", exact: true }).click(),
    ]);
    expect(indicated.status()).toBe(200);
  } finally { await requesterContext.close(); }
  const before = await state(f);
  expect(before.ticket.requesterResolutionIndicatedAt).not.toBeNull();
  expect(before.ticket.requesterResolutionIndicatedById).toBe(f.requester.id);
  await openTicket(page, f);
  const dialog = await statusDraft(page, "RESOLVED", `  ${reason}  `);
  const blocked = await submitStatus(page, f, "RESOLVED", 409);
  expect((await blocked.response.json()).error.code).toBe("ACTIONS_OUTSTANDING");
  await expect(dialog.getByRole("textbox", { name: /reason/i })).toHaveValue(`  ${reason}  `);
  await expect(dialog).toContainText("1 unfinished Actions");
  equal(await state(f), before, "Real gate rejection preserves every observed domain row/history/receipt");
  await dialog.getByRole("link", { name: "View Actions Taken", exact: true }).click();
  const actions = page.getByRole("region", { name: "Actions Taken", exact: true });
  await expect(actions.getByRole("heading", { name: "Actions Taken", exact: true })).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0); await expect(actions.locator("xpath=ancestor::*[@inert]")).toHaveCount(0);
  await page.locator(`#action-${target.id}`).getByRole("button", { name: "Complete", exact: true }).click();
  const complete = page.getByRole("dialog", { name: "Complete Action", exact: true });
  await expect(complete.getByText("Loading Action…", { exact: true })).toHaveCount(0);
  const result = "Completed as a non-assignee <script>literal result</script>";
  await complete.getByLabel("Result", { exact: true }).fill(result);
  const [completedResponse] = await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname === `/api/tickets/${f.ticket.id}/actions/${target.id}/status` && r.request().method() === "PATCH"),
    complete.getByRole("button", { name: "Confirm completion", exact: true }).click(),
  ]);
  expect(completedResponse.status()).toBe(200);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Refreshing Actions and Ticket…", { exact: true })).toHaveCount(0);
  const completed = await state(f), row = completed.actions.find((a) => a.id === target.id)!;
  expect(f.operator.id).not.toBe(f.assignee.id); expect(f.operator.id).not.toBe(f.owner.id);
  equal(row, { ...target, status: "COMPLETED", result, performedById: f.operator.id, completedAt: row.updatedAt,
    updatedAt: row.updatedAt, version: target.version + 1 }, "Exact completed state and actual actor, no follow-up clearing");
  expect(row.followUpRequired).toBe(true); expect(row.followUpNote).toBe(followUp);
  await expect(page.locator(`#action-${target.id}`).getByText("Performed by", { exact: true }).locator("..").locator("dd")).toHaveText(f.operator.name);
  const completionEvent = completed.history.at(-1)!;
  expect(completionEvent.event).toBe("ACTION_COMPLETED"); expect(completionEvent.actorId).toBe(f.operator.id);
  equal(completionEvent.before, historySnapshot(target), "Full completion before"); equal(completionEvent.after, historySnapshot(row), "Full completion after");
  await statusDraft(page, "RESOLVED", `  ${reason}  `);
  const resolvedResponse = await submitStatus(page, f, "RESOLVED");
  expect(resolvedResponse.input.reason).toBe(reason);
  const resolved = await state(f); transition(completed, resolved, f.operator.id, "RESOLVED", reason); unchangedActions(completed, resolved);
  const history = page.getByRole("region", { name: "Status History", exact: true });
  await expect(history).toContainText(reason); await expect(history.locator("script")).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, "__ticketTextExecuted"))).toBe(false);
  await expect(actions.getByRole("button", { name: "Create Action", exact: true })).toHaveCount(0);
  await page.getByLabel("Next status", { exact: true }).selectOption("REOPENED");
  await page.getByRole("region", { name: "Operations", exact: true }).getByRole("textbox", { name: /reason/i }).fill("Continue the retained follow-up");
  const [reopenedResponse] = await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname.endsWith(`/${f.ticket.id}/status`) && r.request().method() === "PATCH"),
    page.getByRole("button", { name: "Update Status", exact: true }).click(),
  ]);
  expect(reopenedResponse.status()).toBe(200); await saved(page);
  const reopened = await state(f); transition(resolved, reopened, f.operator.id, "REOPENED", "Continue the retained follow-up");
  expect(reopened.ticket.requesterResolutionIndicatedAt).toBeNull(); expect(reopened.ticket.requesterResolutionIndicatedById).toBeNull();
  unchangedActions(resolved, reopened);
  await expect(actions.getByRole("button", { name: "Create Action", exact: true })).toBeVisible();
});

test("T-19/48/53: Administrator resolves and closes zero Actions with empty and whitespace optional reasons", async ({ page, fixture: f }) => {
  await fixtureHistory(f); await signIn(page, f.owner); const actions = await openTicket(page, f);
  const before = await state(f); expect(before.actions).toHaveLength(0);
  await expect(page.getByRole("region", { name: "Status History", exact: true }).getByText(/No reason provided/)).toHaveCount(1);
  await statusDraft(page, "RESOLVED", ""); const resolvedResponse = await submitStatus(page, f, "RESOLVED");
  expect(resolvedResponse.input.reason).toBe("");
  const resolved = await state(f); transition(before, resolved, f.owner.id, "RESOLVED", ""); unchangedActions(before, resolved);
  await statusDraft(page, "CLOSED", "   "); const closedResponse = await submitStatus(page, f, "CLOSED");
  expect(closedResponse.input.reason).toBe("");
  const closed = await state(f); transition(resolved, closed, f.owner.id, "CLOSED", ""); unchangedActions(resolved, closed);
  expect(closed.ticketHistory.map((entry) => entry.reason)).toEqual([null, "", ""]);
  await expect(page.getByRole("region", { name: "Status History", exact: true }).getByText(/No reason provided/)).toHaveCount(3);
  await expect(page.getByLabel("Next status", { exact: true })).toBeDisabled();
  await expect(page.getByText("No further status changes are available.", { exact: true })).toBeVisible();
  await expect(actions.getByRole("button", { name: /^(Create Action|Edit|Reassign|Start|Complete|Cancel)$/ })).toHaveCount(0);
});

test("T-21/48/53/55: real mixed-cohort cancellation, immutable terminal work and safe owned Requester history", async ({ page, fixture: f }) => {
  await fixtureHistory(f); await signIn(page, f.operator);
  for (const status of ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const) await fixtureAction(page, f, status);
  const before = await state(f); expect(before.actions.map((a) => a.status)).toEqual(["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);
  expect(before.receipts).toHaveLength(8); await openTicket(page, f);
  const dialog = await statusDraft(page, "CANCELLED", `  ${reason}  `);
  await expect(dialog).toContainText("Unfinished Actions will also be cancelled with the same reason.");
  const cancelledResponse = await submitStatus(page, f, "CANCELLED"); expect(cancelledResponse.input.reason).toBe(reason);
  const after = await state(f), event = transition(before, after, f.operator.id, "CANCELLED", reason);
  equal(after.ticket, { ...before.ticket, currentStatus: "CANCELLED", updatedAt: after.ticket.updatedAt }, "Exact parent cancellation changes");
  equal(after.receipts, before.receipts, "All original receipts retained exactly; no Ticket receipts");
  equal(after.history.filter((h) => before.history.some((old) => old.id === h.id)), before.history, "All earlier Action history unchanged");
  expect(after.history).toHaveLength(before.history.length + 2);
  expect(event.createdAt.toISOString()).toBe(after.ticket.updatedAt.toISOString());
  for (const old of before.actions) {
    const row = after.actions.find((a) => a.id === old.id)!;
    if (old.status === "COMPLETED" || old.status === "CANCELLED") { equal(row, old, "Terminal fields/attribution/times unchanged"); continue; }
    equal(row, { ...old, status: "CANCELLED", cancellationReason: reason, cancelledAt: after.ticket.updatedAt,
      updatedAt: after.ticket.updatedAt, version: old.version + 1, completedAt: null, performedById: null }, "Exact unfinished child cancellation retaining all content and identities");
    expect(row.updatedAt.getTime()).toBeGreaterThan(old.updatedAt.getTime());
    const events = after.history.filter((h) => h.actionId === row.id && h.actionVersion === row.version);
    expect(events).toHaveLength(1);
    equal(events[0], { id: events[0]!.id, actionId: row.id, actorId: f.operator.id, event: "ACTION_CANCELLED_BY_TICKET",
      createdAt: row.updatedAt, actionVersion: row.version, sourceTicketStatusHistoryId: event.id,
      before: historySnapshot(old), after: historySnapshot(row) }, "Full same-Ticket cancellation source event and before/after snapshots");
    const record = page.locator(`#action-${row.id}`);
    await expect(record.getByText(reason, { exact: true })).toBeVisible();
  }
  const terminal = before.actions.find((a) => a.status === "COMPLETED")!;
  await expect(page.locator(`#action-${terminal.id}`).getByText(f.operator.name, { exact: true })).toHaveCount(2); // creator and actual performer
  await page.getByRole("button", { name: "Logout", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
  await signIn(page, f.requester);
  const privateRequests: string[] = [];
  page.on("request", (r) => { if (/^\/api\/(staff|admin)\//.test(new URL(r.url()).pathname)) privateRequests.push("privileged request"); });
  const actions = await openTicket(page, f, true);
  await expect(actions.getByRole("button", { name: /^(Create Action|Edit|Reassign|Start|Complete|Cancel)$/ })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Internal Notes", exact: true })).toHaveCount(0);
  await expect(page.getByText(`${f.marker} private Internal Note`, { exact: true })).toHaveCount(0);
  const child = after.actions.find((a) => a.id === before.actions[0]!.id)!;
  await page.locator(`#action-${child.id}`).getByRole("button", { name: "View history", exact: true }).click();
  const history = page.getByRole("dialog", { name: "Action history", exact: true });
  const cascade = history.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Cancelled with Ticket", exact: true }) });
  await expect(cascade).toContainText(reason); await expect(cascade).toContainText(f.operator.name);
  await expect(cascade).toContainText(String(event.id)); await expect(history.locator("script, a")).toHaveCount(0);
  const read = await page.request.get(`${api}/api/tickets/${f.ticket.id}/actions/${child.id}/history`); expect(read.status()).toBe(200);
  const payload = await read.json();
  const safe = payload.items.find((entry: { event: string }) => entry.event === "ACTION_CANCELLED_BY_TICKET");
  expect(Object.keys(safe).sort()).toEqual(["id", "actionId", "actor", "event", "createdAt", "actionVersion", "sourceTicketStatusHistoryId", "before", "after"].sort());
  expect(safe.actor).toEqual({ id: f.operator.id, name: f.operator.name }); expect(safe.sourceTicketStatusHistoryId).toBe(event.id);
  equal(safe.before, historySnapshot(before.actions[0]!), "Requester-safe complete scalar-ID before snapshot");
  equal(safe.after, historySnapshot(child), "Requester-safe complete scalar-ID after snapshot");
  expect(/inputFingerprint|safeResponse|passwordHash|internalNotes/.test(JSON.stringify(payload))).toBe(false);
  expect(privateRequests).toEqual([]); equal(await state(f), after, "Requester reads preserve all observed domain state");
});

test("T-19/48/53: all independently cancelled Actions permit resolution and closure without fabricated completion", async ({ page, fixture: f }) => {
  await fixtureHistory(f); await signIn(page, f.operator);
  await fixtureAction(page, f, "CANCELLED"); await fixtureAction(page, f, "CANCELLED");
  const before = await state(f); expect(before.actions.every((a) => a.status === "CANCELLED" && a.followUpRequired && a.followUpNote === followUp)).toBe(true);
  expect(before.receipts).toHaveLength(4); await openTicket(page, f);
  await statusDraft(page, "RESOLVED", "Resolve with no completed Action"); await submitStatus(page, f, "RESOLVED");
  const resolved = await state(f); transition(before, resolved, f.operator.id, "RESOLVED", "Resolve with no completed Action"); unchangedActions(before, resolved);
  await statusDraft(page, "CLOSED", "Close the cancelled-only cohort"); await submitStatus(page, f, "CLOSED");
  const closed = await state(f); transition(resolved, closed, f.operator.id, "CLOSED", "Close the cancelled-only cohort"); unchangedActions(resolved, closed);
  expect(closed.actions.some((a) => a.status === "COMPLETED")).toBe(false);
});

test("T-17/48/53: two real actor contexts preserve stale draft until explicit refresh and deliberate retry", async ({ page, browser, fixture: f }) => {
  await fixtureHistory(f); await signIn(page, f.operator); await openTicket(page, f);
  const original = await state(f), draft = `  ${reason}  `;
  const dialog = await statusDraft(page, "CANCELLED", draft);
  const otherContext = await browser.newContext({ baseURL });
  try {
    const other = await otherContext.newPage(); other.on("pageerror", () => f.pageErrors.push("Second actor context page error"));
    await signIn(other, f.owner); await openTicket(other, f);
    await other.getByLabel("IT Priority", { exact: true }).selectOption("URGENT");
    const [priority] = await Promise.all([
      other.waitForResponse((r) => new URL(r.url()).pathname === `/api/staff/tickets/${f.ticket.id}/it-priority` && r.request().method() === "PATCH"),
      other.getByRole("button", { name: "Save IT Priority", exact: true }).click(),
    ]);
    expect(priority.status()).toBe(200);
    await expect(other.getByRole("region", { name: "Operations", exact: true }).getByText("IT Urgent", { exact: true })).toBeVisible();
    const advanced = await state(f);
    expect(advanced.ticket.updatedAt.getTime()).toBeGreaterThan(original.ticket.updatedAt.getTime());
    equal(advanced.ticketHistory, original.ticketHistory, "Second actor priority change creates no status event"); unchangedActions(original, advanced);
    const stale = await submitStatus(page, f, "CANCELLED", 409);
    expect((await stale.response.json()).error.code).toBe("STALE_WRITE"); expect(stale.input.expectedUpdatedAt).toBe(original.ticket.updatedAt.toISOString());
    await expect(dialog.getByRole("textbox", { name: /reason/i })).toHaveValue(draft);
    await expect(dialog.getByRole("button", { name: "Confirm cancellation", exact: true })).toBeDisabled();
    equal(await state(f), advanced, "Stale original request has no domain writes or status-history event");
    let extraWrites = 0;
    const observe = (r: import("@playwright/test").Request) => { if (r.method() === "PATCH" && new URL(r.url()).pathname.endsWith(`/${f.ticket.id}/status`)) extraWrites++; };
    page.on("request", observe);
    try {
      await dialog.getByRole("button", { name: "Refresh Ticket", exact: true }).click();
      const context = dialog.getByRole("region", { name: "Latest Ticket context", exact: true });
      await expect(context.locator(`time[datetime="${advanced.ticket.updatedAt.toISOString()}"]`)).toBeVisible();
      await expect(context).toContainText(f.owner.name);
      await expect(page.getByLabel("IT Priority", { exact: true })).toHaveValue("URGENT");
      await expect(dialog.getByRole("textbox", { name: /reason/i })).toHaveValue(draft);
      await expect(dialog.getByRole("button", { name: "Confirm cancellation", exact: true })).toBeEnabled();
      expect(extraWrites).toBe(0); equal(await state(f), advanced, "Explicit refresh is read-only");
      const committed = await submitStatus(page, f, "CANCELLED");
      expect(committed.input.expectedUpdatedAt).toBe(advanced.ticket.updatedAt.toISOString()); expect(committed.input.reason).toBe(reason);
      expect(extraWrites).toBe(1);
    } finally { page.off("request", observe); }
    const after = await state(f); transition(advanced, after, f.operator.id, "CANCELLED", reason);
    expect(after.ticketHistory.filter((entry) => entry.toStatus === "CANCELLED")).toHaveLength(1); unchangedActions(advanced, after);
  } finally { await otherContext.close(); }
});
