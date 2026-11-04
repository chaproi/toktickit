import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActionDTO, StaffTicketDetail, TicketStatus } from "../../src/api.js";
import { detail, staffUser } from "../lab-03/staff-detail-test-helpers.js";
import { authResponse, jsonResponse, renderAt, requestUrl } from "../lab-03/test-helpers.js";

// HTTP simulations only: partial AC-17/18/21/34/36/38/43 and
// T-17/18/21/34/36/38/53. No database cascade, race or full scenario claim.
const token = "2026-10-22T08:00:00.000Z";
const nextToken = "2026-10-22T08:01:00.000Z";
const literalReason = "<script>window.workflowExecuted=true</script> & literal reason";
const owner = { id: 194, name: "Independent Ticket Owner", role: "IT_STAFF" as const };
const pending = new Set<() => void>();
const unexpected: string[] = [];

type Call = { url: URL; init?: RequestInit };
type Body = { targetStatus: TicketStatus; expectedUpdatedAt: string; confirm: boolean; reason: string | null };
type Harness = {
  ticket: StaffTicketDetail; actions: ActionDTO[]; calls: Call[]; writes: Body[];
  commit: (body: Body) => Response;
};

function baseTicket(): StaffTicketDetail {
  return { ...structuredClone(detail), owner, currentStatus: "OPEN", updatedAt: token,
    requesterResolutionIndicatedAt: null,
    allowedStatusTransitions: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
    statusHistory: [{ id: 700, fromStatus: "NEW", toStatus: "OPEN", reason: null,
      actor: owner, createdAt: "2026-10-22T07:30:00.000Z" }] };
}

function action(id: number, status: ActionDTO["status"] = "IN_PROGRESS"): ActionDTO {
  const at = new Date(Date.UTC(2026, 9, 22, 7, 40, id - 800)).toISOString();
  return { id, ticketId: detail.id, actionAt: at, createdAt: at, updatedAt: at,
    description: `Workflow action ${id}: literal <script>text</script>`,
    result: status === "COMPLETED" ? "Completed diagnostics" : "Retained draft result",
    createdBy: { id: 195, name: "Action Creator" }, assignee: { id: 196, name: "Assigned Worker" },
    performedBy: status === "COMPLETED" ? { id: 197, name: "Actual Completer" } : null,
    status, followUpRequired: true, followUpNote: "A valid informative follow-up note.",
    attachmentNotes: "Literal Attachment Notes", cancellationReason: status === "CANCELLED" ? "Earlier independent cancellation" : null,
    completedAt: status === "COMPLETED" ? at : null, cancelledAt: status === "CANCELLED" ? at : null,
    version: status === "COMPLETED" ? 3 : 2 };
}

function page<T>(items: T[], number = 1, size = 20) {
  const totalPages = Math.ceil(items.length / size);
  return { items: items.slice((number - 1) * size, number * size), pagination: {
    page: number, pageSize: size, totalItems: items.length, totalPages,
    hasPreviousPage: items.length > 0 && number > 1, hasNextPage: number < totalPages,
  } };
}

function safeError(code: string, message: string, status: number, fields?: Record<string, string>) {
  return jsonResponse({ error: { code, message, ...(fields ? { fields } : {}) } }, status);
}

function deferredResponse() {
  let settle!: (response: Response) => void;
  const promise = new Promise<Response>((resolve) => { settle = resolve; });
  const release = () => resolve(safeError("DEPENDENCY_UNAVAILABLE", "Resource temporarily unavailable.", 503));
  function resolve(response: Response) { pending.delete(release); settle(response); }
  pending.add(release);
  return { promise, resolve };
}

function install(options: {
  role?: "IT_STAFF" | "ADMINISTRATOR";
  ticket?: StaffTicketDetail; actions?: ActionDTO[];
  mutation?: (body: Body, harness: Harness) => Response | Promise<Response>;
  ticketRead?: (harness: Harness) => Response | Promise<Response>;
  actionsRead?: (harness: Harness, url: URL) => Response | Promise<Response>;
} = {}): Harness {
  const user = options.role === "ADMINISTRATOR"
    ? { ...staffUser, id: 92, name: "Workflow Administrator", role: "ADMINISTRATOR" as const } : staffUser;
  const harness: Harness = {
    ticket: options.ticket ?? baseTicket(), actions: options.actions ?? [action(801), action(802, "COMPLETED")],
    calls: [], writes: [],
    commit(body) {
      // Simulated server authority, never a local UI update. Subsequent GETs
      // serialize these new DTOs; the write response has the inherited shape.
      const previous = harness.ticket;
      const committedAt = previous.updatedAt === token ? nextToken : "2026-10-22T08:02:00.000Z";
      harness.ticket = { ...previous, currentStatus: body.targetStatus, updatedAt: committedAt,
        allowedStatusTransitions: body.targetStatus === "CANCELLED" || body.targetStatus === "CLOSED" ? []
          : body.targetStatus === "RESOLVED" ? ["CLOSED", "REOPENED"] : ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
        statusHistory: [...previous.statusHistory, { id: 701, fromStatus: previous.currentStatus,
          toStatus: body.targetStatus, actor: { id: user.id, name: user.name, role: user.role },
          reason: body.reason, createdAt: committedAt }] };
      if (body.targetStatus === "CANCELLED") harness.actions = harness.actions.map((row) =>
        row.status === "PLANNED" || row.status === "IN_PROGRESS" ? { ...row, status: "CANCELLED",
          cancellationReason: body.reason, cancelledAt: committedAt, updatedAt: committedAt,
          completedAt: null, performedBy: null, version: row.version + 1 } : row);
      const current = harness.ticket;
      return jsonResponse({ ticket: { id: current.id, owner: current.owner, requestedPriority: current.requestedPriority,
        itPriority: current.itPriority, currentStatus: current.currentStatus, updatedAt: current.updatedAt,
        requesterResolutionIndicatedAt: current.requesterResolutionIndicatedAt } });
    },
  };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input), method = (init?.method ?? "GET").toUpperCase();
    harness.calls.push({ url, init });
    if (method === "PATCH" && url.pathname === `/api/staff/tickets/${detail.id}/status`) {
      const body = JSON.parse(String(init?.body)) as Body;
      harness.writes.push(body);
      return options.mutation?.(body, harness) ?? harness.commit(body);
    }
    if (method !== "GET") {
      unexpected.push(`${method} ${url.pathname}`);
      return safeError("INVALID_REQUEST", "Unexpected write.", 400);
    }
    if (url.pathname === "/api/auth/me") return jsonResponse(authResponse(user));
    if (url.pathname === `/api/staff/tickets/${detail.id}`) return options.ticketRead?.(harness) ?? jsonResponse(harness.ticket);
    if (url.pathname === "/api/staff/assignees") return jsonResponse({ items: [owner, { id: 196, name: "Assigned Worker", role: "IT_STAFF" }] });
    if (url.pathname === `/api/tickets/${detail.id}/attachments`) return jsonResponse({ items: [] });
    if (url.pathname === `/api/tickets/${detail.id}/comments` || url.pathname === `/api/staff/tickets/${detail.id}/notes`) return jsonResponse(page([]));
    if (url.pathname === `/api/tickets/${detail.id}/actions`) {
      // API-01 accepts one status, not an invented unfinished/count field.
      const allowed = new Set(["page", "pageSize", "status"]);
      if ([...url.searchParams.keys()].some((key) => !allowed.has(key) || url.searchParams.getAll(key).length !== 1)) {
        unexpected.push(`Invalid Action query: ${url.search}`);
        return safeError("INVALID_QUERY", "Invalid query.", 400, { query: "Unsupported filter." });
      }
      const number = Number(url.searchParams.get("page") ?? 1), size = Number(url.searchParams.get("pageSize") ?? 20);
      const status = url.searchParams.get("status");
      if (!Number.isSafeInteger(number) || number < 1 || ![20, 50, 100].includes(size)
        || status !== null && !["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(status)) {
        unexpected.push(`Invalid Action paging/status: ${url.search}`);
        return safeError("INVALID_QUERY", "Invalid query.", 400);
      }
      return options.actionsRead?.(harness, url) ?? jsonResponse(page(harness.actions.filter((row) => !status || row.status === status), number, size));
    }
    unexpected.push(`${method} ${url.pathname}`);
    return safeError("SAFE_FAILURE", "Unknown fixture resource.", 500);
  }));
  document.cookie = "toktickit_csrf=workflow-ui-csrf; Path=/";
  return harness;
}

async function ready() {
  renderAt(`/staff/tickets/${detail.id}`);
  await screen.findByRole("heading", { name: detail.ticketNumber });
  const section = await screen.findByRole("region", { name: "Actions Taken" });
  await within(section).findByRole("heading", { name: /Workflow action 801/ });
}

async function choose(target: TicketStatus) {
  await userEvent.selectOptions(screen.getByLabelText("Next status"), target);
}

function confirmation(target: "RESOLVED" | "CLOSED" | "CANCELLED") {
  return screen.getByRole("dialog", { name: target === "CANCELLED" ? "Cancel Ticket" : target === "RESOLVED" ? "Resolved Ticket" : "Closed Ticket" });
}

function assertWrite(harness: Harness, target: TicketStatus, reason: string, expectedUpdatedAt = token) {
  expect(harness.writes).toHaveLength(1);
  expect(harness.writes[0]).toEqual({ targetStatus: target, reason, expectedUpdatedAt,
    confirm: ["RESOLVED", "CLOSED", "CANCELLED"].includes(target) });
  const call = harness.calls.find(({ init }) => init?.method === "PATCH")!;
  expect(call.url.pathname).toBe(`/api/staff/tickets/${detail.id}/status`);
  expect(call.init?.credentials).toBe("include");
  expect(new Headers(call.init?.headers).get("X-CSRF-Token")).toBe("workflow-ui-csrf");
  expect(Object.keys(harness.writes[0]).sort()).toEqual(["confirm", "expectedUpdatedAt", "reason", "targetStatus"]);
}

afterEach(async () => {
  await act(async () => { for (const release of [...pending]) release(); });
  cleanup();
  vi.unstubAllGlobals();
  document.cookie = "toktickit_csrf=; Max-Age=0; Path=/";
  expect(pending.size, "Every controlled response is settled").toBe(0);
  expect(unexpected.splice(0), "All HTTP fixtures were explicit and contract-valid").toEqual([]);
});

describe("Ticket Workflow UI: D-20, blockers and safe recovery", () => {
  it.each((["IT_STAFF", "ADMINISTRATOR"] as const).flatMap((role) =>
    (["WAITING_FOR_REQUESTER", "RESOLVED"] as const).map((target) => ({ role, target }))))(
    "$role submits an optional trimmed literal reason for $target with inherited tokens/confirmation", async ({ role, target }) => {
      // No unfinished Actions: completed follow-up information is not a gate.
      const harness = install({ role, actions: [action(801, "COMPLETED")] });
      await ready();
      await choose(target);
      const context = screen.queryByRole("dialog") ?? screen.getByRole("region", { name: "Operations" });
      const reason = within(context).getByRole("textbox", { name: /reason/i });
      expect(reason).not.toBeRequired();
      await userEvent.type(reason, `  ${literalReason}  `);
      expect(harness.writes).toHaveLength(0);
      if (target === "RESOLVED") await userEvent.click(within(confirmation(target)).getByRole("button", { name: "Confirm resolved" }));
      else await userEvent.click(screen.getByRole("button", { name: "Update Status" }));
      await waitFor(() => expect(harness.writes).toHaveLength(1));
      assertWrite(harness, target, literalReason);
      const history = screen.getByRole("region", { name: "Status History" });
      await waitFor(() => expect(history).toHaveTextContent(literalReason));
      expect(history.querySelector("script")).toBeNull();
    },
  );

  it.each([
    { label: "literal", value: literalReason }, { label: "null", value: null }, { label: "empty", value: "" },
  ])("renders $label stored history reasons safely with the approved absent-reason label", async ({ value }) => {
    const ticket = baseTicket(); ticket.statusHistory = [{ ...ticket.statusHistory[0], reason: value }];
    install({ ticket }); await ready();
    const history = screen.getByRole("region", { name: "Status History" });
    expect(history).toHaveTextContent(value || "No reason provided");
    expect(history.querySelector("script")).toBeNull();
  });

  it("explains cancellation cascade and renders only authoritative refreshed Ticket/history/Action state", async () => {
    const harness = install(); await ready();
    const initialActionReads = harness.calls.filter(({ url }) => url.pathname.endsWith("/actions")).length;
    await choose("CANCELLED");
    const dialog = confirmation("CANCELLED");
    expect.soft(dialog).toHaveTextContent(/unfinished actions.*(?:cancelled|canceled).*same reason/i);
    await userEvent.type(within(dialog).getByRole("textbox", { name: /cancellation reason/i }), `  ${literalReason}  `);
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirm cancellation" }));
    await waitFor(() => expect(harness.writes).toHaveLength(1));
    assertWrite(harness, "CANCELLED", literalReason);
    await waitFor(() => expect(harness.calls.filter(({ url }) => url.pathname.endsWith("/actions")).length).toBeGreaterThan(initialActionReads));
    const actions = screen.getByRole("region", { name: "Actions Taken" });
    await waitFor(() => expect(actions).toHaveTextContent("Cancelled"));
    expect(actions).toHaveTextContent(literalReason);
    expect(screen.getByRole("region", { name: "Status History" })).toHaveTextContent(literalReason);
    expect(harness.calls.some(({ init, url }) => init?.method && init.method !== "GET" && url.pathname.includes("/actions"))).toBe(false);
    expect(harness.actions[1].status).toBe("COMPLETED");
    expect(actions).toHaveTextContent("Actual Completer");
  });

  it.each([
    { label: "trimmed four characters", text: "  abcd  " },
    { label: "501 characters without silent truncation", text: "x".repeat(501) },
  ])("rejects cancellation reason with $label using accessible field feedback and no write", async ({ text }) => {
    const harness = install(); await ready(); await choose("CANCELLED");
    const dialog = confirmation("CANCELLED"), reason = within(dialog).getByRole("textbox", { name: /cancellation reason/i });
    const user = userEvent.setup(); await user.click(reason); await user.paste(text); await user.tab();
    expect(reason).toHaveValue(text);
    expect(reason).toHaveAttribute("aria-invalid", "true");
    expect(reason).toHaveAccessibleDescription(/\S/u);
    expect(within(dialog).getByRole("button", { name: "Confirm cancellation" })).toBeDisabled();
    expect(harness.writes).toHaveLength(0);
  });

  it.each(["RESOLVED", "CLOSED"] as const)("retains %s draft after ACTIONS_OUTSTANDING and links the exact server-derived unfinished total", async (target) => {
    const ticket = baseTicket();
    if (target === "CLOSED") {
      // Defensive UI fixture, not a claim the real workflow resolved unfinished work.
      ticket.currentStatus = "RESOLVED"; ticket.allowedStatusTransitions = ["CLOSED", "REOPENED"];
    }
    // 44 records: 27 PLANNED + 14 IN_PROGRESS + 3 terminal. Initial page has
    // only 20 cards; neither card count nor totalItems=44 is unfinished=41.
    const actions = Array.from({ length: 44 }, (_, index) => action(801 + index,
      index < 27 ? "PLANNED" : index < 41 ? "IN_PROGRESS" : index === 43 ? "CANCELLED" : "COMPLETED"));
    const harness = install({ ticket, actions, mutation: () => safeError("ACTIONS_OUTSTANDING", "Unfinished Actions block this transition.", 409) });
    await ready();
    expect(within(screen.getByRole("region", { name: "Actions Taken" })).getAllByRole("heading", { level: 3 })).toHaveLength(20);
    await choose(target); const dialog = confirmation(target);
    // Optional reasons are independently mandatory UI coverage above. Reach
    // the actual 409/count assertions even before that input is implemented;
    // retain the same nonempty draft assertion when it is available.
    const reason = within(dialog).queryByRole("textbox", { name: /reason/i });
    if (reason) await userEvent.type(reason, "Retained resolution explanation");
    await userEvent.click(within(dialog).getByRole("button", { name: target === "CLOSED" ? "Confirm closed" : "Confirm resolved" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Unfinished Actions block this transition.");
    expect(screen.getByLabelText("Next status")).toHaveValue(target);
    await waitFor(() => expect(dialog).toHaveTextContent(/(?:\b41\b.*unfinished|unfinished.*\b41\b)/i));
    expect(within(dialog).getByRole("textbox", { name: /reason/i })).toHaveValue("Retained resolution explanation");
    const link = screen.getByRole("link", { name: /(?:view|review|go to).*actions|actions taken/i });
    const destination = new URL(link.getAttribute("href")!, window.location.href);
    expect(destination.pathname).toBe(`/staff/tickets/${detail.id}`);
    expect(destination.hash).not.toBe("");
    const anchor = document.getElementById(decodeURIComponent(destination.hash.slice(1)))!;
    expect(anchor).not.toBeNull();
    expect(anchor).toHaveTextContent("Actions Taken");
    await userEvent.click(link);
    const section = screen.getByRole("region", { name: "Actions Taken" });
    await waitFor(() => expect(section === document.activeElement || section.contains(document.activeElement)).toBe(true));
    expect(section.closest("[inert]")).toBeNull();
    expect(harness.writes).toHaveLength(1);
  });

  it("preserves cancellation draft and associates server-400 reason feedback with its field", async () => {
    const harness = install({ mutation: () => safeError("VALIDATION_ERROR", "Review the supplied reason.", 400,
      { reason: "This reason was rejected by the server." }) });
    await ready(); await choose("CANCELLED");
    const dialog = confirmation("CANCELLED"), reason = within(dialog).getByRole("textbox", { name: /cancellation reason/i });
    await userEvent.type(reason, "Retained cancellation draft");
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirm cancellation" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/reason/i);
    expect(reason).toHaveValue("Retained cancellation draft");
    expect(reason).toHaveAttribute("aria-invalid", "true");
    expect(reason).toHaveAccessibleDescription("This reason was rejected by the server.");
    expect(harness.writes).toHaveLength(1);
    expect(screen.queryByText(/status updated successfully/i)).not.toBeInTheDocument();
  });

  it("retains stale cancellation draft and uses a refreshed Ticket token only on deliberate retry", async () => {
    const harness = install({ mutation: (body, h) => {
      if (h.writes.length === 1) {
        h.ticket = { ...h.ticket, summary: "Latest authoritative Ticket summary", itPriority: "URGENT", updatedAt: nextToken };
        return safeError("STALE_WRITE", "Ticket changed. Review the latest Ticket before retrying.", 409);
      }
      return h.commit(body);
    } });
    await ready(); await choose("CANCELLED");
    const draft = "Retained draft despite stale parent";
    await userEvent.type(within(confirmation("CANCELLED")).getByRole("textbox", { name: /cancellation reason/i }), draft);
    await userEvent.click(within(confirmation("CANCELLED")).getByRole("button", { name: "Confirm cancellation" }));
    await waitFor(() => expect(harness.writes).toHaveLength(1));
    const dialog = await screen.findByRole("dialog", { name: "Cancel Ticket" });
    expect(within(dialog).getByRole("textbox", { name: /cancellation reason/i })).toHaveValue(draft);
    expect(within(dialog).getByRole("button", { name: "Confirm cancellation" })).toBeDisabled();
    await userEvent.click(within(dialog).getByRole("button", { name: /(?:refresh|reload).*ticket|(?:refresh|reload).*latest/i }));
    await screen.findByText("Latest authoritative Ticket summary");
    expect(harness.writes).toHaveLength(1);
    expect(within(dialog).getByRole("textbox", { name: /cancellation reason/i })).toHaveValue(draft);
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Confirm cancellation" })).toBeEnabled());
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirm cancellation" }));
    await waitFor(() => expect(harness.writes).toHaveLength(2));
    expect(harness.writes).toEqual([
      { targetStatus: "CANCELLED", expectedUpdatedAt: token, confirm: true, reason: draft },
      { targetStatus: "CANCELLED", expectedUpdatedAt: nextToken, confirm: true, reason: draft },
    ]);
  });

  it("blocks duplicate confirmation and dismissal while pending, keeps focus and announces no premature success", async () => {
    const held = deferredResponse();
    const harness = install({ actions: [action(801, "COMPLETED")], mutation: () => held.promise });
    await ready(); await choose("RESOLVED");
    const dialog = confirmation("RESOLVED"), confirm = within(dialog).getByRole("button", { name: "Confirm resolved" });
    await userEvent.dblClick(confirm);
    await waitFor(() => expect(harness.writes).toHaveLength(1));
    expect(confirm).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(confirmation("RESOLVED")).toBeInTheDocument();
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(screen.queryByText(/status updated successfully/i)).not.toBeInTheDocument();
    await act(async () => { held.resolve(harness.commit(harness.writes[0])); });
    await screen.findByText(/status updated successfully/i);
    expect(harness.writes).toHaveLength(1);
  });

  it("reports confirmed save with failed refresh and recovers through reads without offering another mutation", async () => {
    let failRefresh = false;
    const harness = install({ mutation: (body, h) => { const response = h.commit(body); failRefresh = true; return response; },
      ticketRead: (h) => failRefresh ? safeError("DEPENDENCY_UNAVAILABLE", "Ticket temporarily unavailable.", 503) : jsonResponse(h.ticket) });
    await ready(); await choose("CANCELLED");
    const dialog = confirmation("CANCELLED");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /cancellation reason/i }), "Confirmed cancellation saved once");
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirm cancellation" }));
    const warning = await screen.findByText(/(?:saved|updated|succeeded).*?(?:refresh|reload).*?(?:fail|could not)|(?:saved|updated|succeeded).*?could not.*?(?:refresh|reload)/i);
    expect(warning.closest('[role="alert"], [role="status"]')).not.toBeNull();
    expect(harness.writes).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Confirm cancellation" })).not.toBeInTheDocument();
    failRefresh = false;
    await userEvent.click(screen.getByRole("button", { name: /(?:refresh|reload).*ticket|try again/i }));
    await screen.findByRole("heading", { name: detail.ticketNumber });
    expect(screen.getByRole("region", { name: "Status History" })).toHaveTextContent("Confirmed cancellation saved once");
    await waitFor(() => expect(screen.getByRole("region", { name: "Actions Taken" })).toHaveTextContent("Cancelled"));
    expect(harness.writes).toHaveLength(1);
  });
});
