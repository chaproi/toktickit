import { act, cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StaffTicketDetail, TicketDetail } from "../../src/api.js";
import {
  authResponse, jsonResponse, renderAt, requesterUser, requestUrl, type SafeUser,
} from "../lab-03/test-helpers.js";

// API-01/02 use safe identity objects; API-03 snapshots use scalar identity IDs.
// These fixture shapes are independent of production Action projections.
type ActionFixture = {
  id: number;
  ticketId: number;
  actionAt: string;
  description: string;
  result: string | null;
  createdBy: { id: number; name: string };
  assignee: { id: number; name: string };
  performedBy: { id: number; name: string } | null;
  status: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  version: number;
};

const owner = { id: 72, name: "Ticket Coordinator", role: "IT_STAFF" as const };
const creator = { id: 73, name: "Action Creator" };
const assignee = { id: 74, name: "Assigned Worker" };
const performer = { id: 75, name: "Actual Completing Worker" };
const requesterTicket: TicketDetail = {
  id: 501,
  ticketNumber: "TKT-2026-00501",
  ticketDate: "2026-10-09T08:00:00.000Z",
  requester: { id: requesterUser.id, name: requesterUser.name },
  category: { id: 1, name: "Network" },
  relatedSystem: { id: 2, name: "VPN" },
  requestedPriority: "MEDIUM",
  itPriority: "HIGH",
  currentStatus: "IN_PROGRESS",
  owner,
  summary: "VPN connection requires follow-up",
  description: "The VPN disconnects during support calls.",
  requesterResolutionIndicatedAt: null,
  createdAt: "2026-10-09T08:00:00.000Z",
  updatedAt: "2026-10-09T09:10:00.000Z",
};
const staffTicket: StaffTicketDetail = {
  ...requesterTicket,
  requester: { ...requesterTicket.requester, email: requesterUser.email },
  allowedStatusTransitions: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  statusHistory: [],
};
const literalAttachmentNotes = '<script>window.actionNoteExecuted=true</script> <a href="/api/tickets/999/attachments/777/content">removed-file.pdf</a>';
const unfinished: ActionFixture = {
  id: 801,
  ticketId: requesterTicket.id,
  actionAt: "2026-10-09T09:00:00.000Z",
  description: "Investigate the remaining VPN disconnects",
  result: null,
  createdBy: creator,
  assignee,
  performedBy: null,
  status: "IN_PROGRESS",
  followUpRequired: true,
  followUpNote: "Arrange another diagnostic session",
  attachmentNotes: literalAttachmentNotes,
  cancellationReason: null,
  createdAt: "2026-10-09T09:00:00.000Z",
  updatedAt: "2026-10-09T09:05:00.000Z",
  completedAt: null,
  cancelledAt: null,
  version: 2,
};
const completed: ActionFixture = {
  id: 802,
  ticketId: requesterTicket.id,
  actionAt: "2026-10-09T09:01:00.000Z",
  description: "Verify the VPN client configuration",
  result: "The client configuration has been verified",
  createdBy: creator,
  assignee,
  performedBy: performer,
  status: "COMPLETED",
  followUpRequired: false,
  followUpNote: null,
  attachmentNotes: null,
  cancellationReason: null,
  createdAt: "2026-10-09T09:01:00.000Z",
  updatedAt: "2026-10-09T09:08:00.000Z",
  completedAt: "2026-10-09T09:08:00.000Z",
  cancelledAt: null,
  version: 3,
};

function page<T>(items: T[], number = 1, pageSize = 20) {
  return {
    items,
    pagination: {
      page: number, pageSize, totalItems: items.length,
      totalPages: items.length === 0 ? 0 : 1,
      hasPreviousPage: false, hasNextPage: false,
    },
  };
}

function history(action: ActionFixture) {
  const initial = {
    id: action.id, ticketId: action.ticketId, createdById: creator.id,
    assigneeId: assignee.id, performedById: null as number | null,
    status: "PLANNED", description: action.description, result: null as string | null,
    followUpRequired: action.followUpRequired, followUpNote: action.followUpNote,
    attachmentNotes: action.attachmentNotes, actionAt: action.actionAt,
    createdAt: action.createdAt, updatedAt: action.createdAt,
    completedAt: null as string | null, cancelledAt: null, cancellationReason: null,
    version: 1,
  };
  const started = {
    ...initial, status: "IN_PROGRESS", version: 2,
    updatedAt: action.id === unfinished.id ? unfinished.updatedAt : "2026-10-09T09:06:00.000Z",
  };
  const events = [
    {
      id: action.id * 10, actionId: action.id, actor: creator, event: "ACTION_CREATED",
      createdAt: initial.updatedAt, actionVersion: 1, sourceTicketStatusHistoryId: null,
      before: null, after: initial,
    },
    {
      id: action.id * 10 + 1, actionId: action.id, actor: creator, event: "ACTION_STARTED",
      createdAt: started.updatedAt, actionVersion: 2, sourceTicketStatusHistoryId: null,
      before: initial, after: started,
    },
  ];
  if (action.status !== "COMPLETED") return events;
  return [...events, {
    id: action.id * 10 + 2, actionId: action.id, actor: performer, event: "ACTION_COMPLETED",
    createdAt: action.updatedAt, actionVersion: 3, sourceTicketStatusHistoryId: null,
    before: started,
    after: {
      ...started, status: "COMPLETED", result: action.result,
      performedById: performer.id, completedAt: action.completedAt,
      updatedAt: action.updatedAt, version: 3,
    },
  }];
}

const pending: Array<{ finish: () => void; settled: Promise<Response> }> = [];
const unexpectedRequests: string[] = [];

function deferredActions() {
  let resolve!: (response: Response) => void;
  const settled = new Promise<Response>((complete) => { resolve = complete; });
  const finish = () => resolve(jsonResponse(page([unfinished])));
  pending.push({ finish, settled });
  return { settled, finish };
}

function installFetch(options: {
  user?: SafeUser;
  actions?: ActionFixture[];
  actionsResponse?: (attempt: number) => Promise<Response>;
} = {}) {
  const user = options.user ?? requesterUser;
  const actions = options.actions ?? [unfinished, completed];
  const calls: Array<{ url: URL; method: string }> = [];
  let actionAttempts = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    if (method !== "GET") {
      unexpectedRequests.push(`${method} ${url.pathname}`);
      return jsonResponse({ error: { code: "ROLE_FORBIDDEN", message: "Operation not permitted." } }, 403);
    }
    if (url.pathname === "/api/auth/me") return jsonResponse(authResponse(user));
    if (user.role === "REQUESTER" && url.pathname.startsWith("/api/staff/")) {
      return jsonResponse({ error: { code: "ROLE_FORBIDDEN", message: "Operation not permitted." } }, 403);
    }
    if (url.pathname === `/api/tickets/${requesterTicket.id}`) return jsonResponse(requesterTicket);
    if (url.pathname === `/api/staff/tickets/${staffTicket.id}`) return jsonResponse(staffTicket);
    if (url.pathname === "/api/staff/assignees") return jsonResponse({ items: [
      { ...creator, role: "IT_STAFF" }, { ...assignee, role: "IT_STAFF" },
      { id: user.id, name: user.name, role: user.role },
    ] });
    if (url.pathname === `/api/tickets/${requesterTicket.id}/attachments`) return jsonResponse({ items: [] });
    if (url.pathname === `/api/tickets/${requesterTicket.id}/comments`) return jsonResponse(page([]));
    if (url.pathname === `/api/staff/tickets/${staffTicket.id}/notes`) return jsonResponse(page([]));
    if (url.pathname === `/api/tickets/${requesterTicket.id}/actions`) {
      actionAttempts += 1;
      return options.actionsResponse?.(actionAttempts) ?? jsonResponse(page(actions));
    }
    const match = /^\/api\/tickets\/501\/actions\/(801|802)(\/history)?$/u.exec(url.pathname);
    if (match) {
      const action = Number(match[1]) === unfinished.id ? unfinished : completed;
      return jsonResponse(match[2] ? page(history(action)) : {
        action, ticketUpdatedAt: requesterTicket.updatedAt,
      });
    }
    unexpectedRequests.push(`${method} ${url.pathname}`);
    return jsonResponse({ error: { code: "SAFE_FAILURE", message: "Unable to load this resource." } }, 500);
  }));
  return { calls, actionAttempts: () => actionAttempts };
}

async function readyTicket(user: SafeUser = requesterUser) {
  renderAt(user.role === "REQUESTER" ? "/tickets/501" : "/staff/tickets/501");
  await screen.findByRole("heading", {
    name: user.role === "REQUESTER" ? "Ticket Detail" : staffTicket.ticketNumber,
  });
  expect(screen.getByText(requesterTicket.summary)).toBeInTheDocument();
}

function actionRecord(section: HTMLElement, action: ActionFixture): HTMLElement {
  // Accept semantic table rows or list/card records without coupling to CSS classes.
  const description = within(section).getByText(action.description);
  const record = description.closest("tr, li, article, [role=row], [role=listitem], [role=group]");
  expect(record).not.toBeNull();
  return record as HTMLElement;
}

afterEach(async () => {
  cleanup();
  try {
    await act(async () => {
      for (const request of pending) request.finish();
      await Promise.all(pending.map((request) => request.settled));
    });
    expect(unexpectedRequests).toEqual([]);
  } finally {
    pending.length = 0;
    unexpectedRequests.length = 0;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/");
  }
});

describe("Issue 45 Actions Taken — first partial UI RED batch", () => {
  it("AC-02/03/06/39 T-02/03/06/39: shows owned Requester Actions, distinct identities and inert Attachment Notes read-only", async () => {
    const { calls } = installFetch();
    await readyTicket();
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText(owner.name)).toBeInTheDocument();
    const actions = await screen.findByRole("region", { name: "Actions Taken" });
    await within(actions).findByText(unfinished.description);
    const unfinishedRecord = actionRecord(actions, unfinished);
    const completedRecord = actionRecord(actions, completed);
    for (const label of ["Created by", "Assigned to", "Performed by"]) {
      expect(within(actions).getAllByText(label).length).toBeGreaterThan(0);
    }
    for (const record of [unfinishedRecord, completedRecord]) {
      expect(within(record).getByText(creator.name)).toBeInTheDocument();
      expect(within(record).getByText(assignee.name)).toBeInTheDocument();
    }
    expect(within(unfinishedRecord).getByText("Not completed")).toBeInTheDocument();
    expect(within(completedRecord).getByText(performer.name)).toBeInTheDocument();
    expect(within(completedRecord).getByText(completed.result!)).toBeInTheDocument();
    expect(within(unfinishedRecord).getByText(literalAttachmentNotes)).toBeInTheDocument();
    expect(unfinishedRecord.querySelector("script, [onclick], [onerror]")).toBeNull();
    expect(unfinishedRecord.querySelector('a[href="/api/tickets/999/attachments/777/content"]')).toBeNull();
    expect(within(unfinishedRecord).queryByRole("link", { name: "removed-file.pdf" })).not.toBeInTheDocument();
    expect(within(actions).queryByRole("button", {
      name: /^(?:create|edit|assign|reassign|start|complete|cancel)\b/i,
    })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Internal Notes" })).not.toBeInTheDocument();
    expect(calls.filter(({ url }) => url.pathname.startsWith("/api/staff/") ||
      url.pathname.startsWith("/api/admin/") || url.pathname.includes("/notes"))).toEqual([]);
    expect(calls.every(({ method }) => method === "GET")).toBe(true);
  });

  it("AC-36 T-36: shows accessible Actions loading without flashing empty, then renders the resolved record", async () => {
    const request = deferredActions();
    installFetch({ actionsResponse: () => request.settled });
    await readyTicket();
    const actions = await screen.findByRole("region", { name: "Actions Taken" });
    expect(within(actions).getByRole("status")).toHaveTextContent(/loading/i);
    expect(within(actions).queryByText(/no actions/i)).not.toBeInTheDocument();
    expect(within(actions).queryByText(unfinished.description)).not.toBeInTheDocument();
    await act(async () => { request.finish(); await request.settled; });
    expect(await within(actions).findByText(unfinished.description)).toBeInTheDocument();
    expect(within(actions).queryByText(/loading/i)).not.toBeInTheDocument();
  });

  it("AC-36 T-36: renders a genuine successful empty Actions state without loading or failure", async () => {
    installFetch({ actions: [] });
    await readyTicket();
    const actions = await screen.findByRole("region", { name: "Actions Taken" });
    expect(await within(actions).findByText(/no actions/i)).toBeInTheDocument();
    expect(within(actions).queryByText(/loading/i)).not.toBeInTheDocument();
    expect(within(actions).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(actions).queryByText(unfinished.description)).not.toBeInTheDocument();
    expect(within(actions).queryByText(completed.description)).not.toBeInTheDocument();
  });

  it("AC-36 T-36: renders a safe dependency error and retries to authoritative Actions", async () => {
    const failed = deferredActions();
    const { actionAttempts } = installFetch({ actionsResponse: async (attempt) => attempt === 1
      ? jsonResponse({ error: { code: "SERVICE_UNAVAILABLE", message: "Service is temporarily unavailable. Please try again." } }, 503)
      : failed.settled });
    await readyTicket();
    const actions = await screen.findByRole("region", { name: "Actions Taken" });
    const error = await within(actions).findByRole("alert");
    expect(error).not.toHaveTextContent(/^\s*$/);
    expect(within(actions).queryByText(/no actions/i)).not.toBeInTheDocument();
    expect(within(actions).queryByText(unfinished.description)).not.toBeInTheDocument();
    expect(actionAttempts()).toBe(1);
    await userEvent.click(within(actions).getByRole("button", { name: /^(?:retry|try again)$/i }));
    expect(actionAttempts()).toBe(2);
    await act(async () => { failed.finish(); await failed.settled; });
    expect(await within(actions).findByText(unfinished.description)).toBeInTheDocument();
    expect(within(actions).queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each(["IT_STAFF", "ADMINISTRATOR"] as const)(
    "AC-03 T-03 D-04: %s sees IN_PROGRESS Edit/Reassign/Complete/Cancel despite distinct owner and assignee",
    async (role) => {
      const user: SafeUser = {
        id: role === "IT_STAFF" ? 91 : 92, name: `Current ${role}`,
        email: `${role.toLowerCase()}@example.test`, role, mustChangePassword: false,
      };
      const { calls } = installFetch({ user, actions: [unfinished] });
      await readyTicket(user);
      const actions = await screen.findByRole("region", { name: "Actions Taken" });
      const record = actionRecord(actions, unfinished);
      expect(new Set([owner.id, creator.id, assignee.id, user.id]).size).toBe(4);
      for (const name of [/^edit\b/i, /^(?:reassign|assign(?:\/reassign)?)\b/i, /^complete\b/i, /^cancel\b/i]) {
        expect(within(record).getByRole("button", { name })).toBeEnabled();
      }
      expect(calls.every(({ method }) => method === "GET")).toBe(true);
    },
  );
});


function installOperationFetch(options: { action?: ActionFixture; parentStatus?: StaffTicketDetail["currentStatus"]; next?: ActionFixture; response?: () => Promise<Response> } = {}) {
  const user: SafeUser = { id: 91, name: "Current Operator", email: "operator@example.test", role: "IT_STAFF", mustChangePassword: false };
  installFetch({ user, actions: [options.action ?? unfinished] });
  const inheritedFetch = globalThis.fetch;
  let action = options.action ?? unfinished;
  let ticketUpdatedAt = staffTicket.updatedAt;
  const writes: Array<{ url: URL; init: RequestInit; body: Record<string, unknown> }> = [];
  document.cookie = "toktickit_csrf=action-ui-csrf; path=/";
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    if (url.pathname === "/api/staff/tickets/501") return jsonResponse({ ...staffTicket, currentStatus: options.parentStatus ?? staffTicket.currentStatus, updatedAt: ticketUpdatedAt });
    if (url.pathname === "/api/tickets/501/actions" && (!init?.method || init.method === "GET")) return jsonResponse(page([action]));
    if (url.pathname === `/api/tickets/501/actions/${action.id}` && (!init?.method || init.method === "GET")) return jsonResponse({ action, ticketUpdatedAt });
    if (/^\/api\/tickets\/501\/actions\/801(?:\/status)?$/u.test(url.pathname) && init?.method === "PATCH") {
      writes.push({ url, init, body: JSON.parse(String(init.body)) as Record<string, unknown> });
      const response = await (options.response?.() ?? Promise.resolve(jsonResponse({ action: options.next ?? action, ticketUpdatedAt: "2026-10-09T09:11:00.000Z", replayed: false })));
      if (response.ok) { const data = await response.clone().json() as { action: ActionFixture; ticketUpdatedAt: string }; action = data.action; ticketUpdatedAt = data.ticketUpdatedAt; }
      return response;
    }
    return inheritedFetch(input, init);
  }));
  return { user, writes };
}

function assertMutationTokens(write: { init: RequestInit; body: Record<string, unknown> }, version = 2) {
  expect(write.init.credentials).toBe("include");
  expect(new Headers(write.init.headers).get("X-CSRF-Token")).toBe("action-ui-csrf");
  expect(write.body.expectedVersion).toBe(version);
  expect(write.body.expectedTicketUpdatedAt).toBe("2026-10-09T09:10:00.000Z");
  expect(write.body.clientMutationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
}

afterEach(() => { document.cookie = "toktickit_csrf=; path=/; max-age=0"; });

describe("Issue 45 bounded operation UI — additional RED", () => {
  it("AC-08/36 T-08/36: Edit preserves omitted follow-up, blocks busy dismissal and refreshes authoritative data", async () => {
    const next = { ...unfinished, description: "Authoritative edited description", version: 3, updatedAt: "2026-10-09T09:11:00.000Z" };
    let finish!: () => void;
    const settled = new Promise<Response>((resolve) => { finish = () => resolve(jsonResponse({ action: next, ticketUpdatedAt: next.updatedAt, replayed: false })); });
    pending.push({ finish, settled });
    const { user, writes } = installOperationFetch({ next, response: () => settled });
    await readyTicket(user);
    const actions = await screen.findByRole("region", { name: "Actions Taken" });
    await userEvent.click(within(actionRecord(actions, unfinished)).getByRole("button", { name: /^edit\b/i }));
    const dialog = await screen.findByRole("dialog", { name: "Edit Action" });
    const description = await within(dialog).findByRole("textbox", { name: "Description" });
    expect(description).toHaveValue(unfinished.description);
    await userEvent.clear(description); await userEvent.type(description, next.description);
    await userEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(writes).toHaveLength(1); assertMutationTokens(writes[0]!);
    expect(writes[0]!.url.pathname).toBe("/api/tickets/501/actions/801");
    expect(Object.keys(writes[0]!.body).sort()).toEqual(["clientMutationId", "description", "expectedTicketUpdatedAt", "expectedVersion"]);
    expect(writes[0]!.body.description).toBe(next.description);
    expect(within(dialog).getByRole("button", { name: /saving/i })).toBeDisabled();
    await userEvent.keyboard("{Escape}"); expect(screen.getByRole("dialog", { name: "Edit Action" })).toBeInTheDocument();
    expect(within(actions).queryByText(next.description)).not.toBeInTheDocument();
    await act(async () => { finish(); await settled; });
    expect(await within(actions).findByText(next.description)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(within(actionRecord(actions, next)).getByText(unfinished.followUpNote!)).toBeInTheDocument();
  });

  it("AC-07/08 T-07/08: Reassign cancels with focus return or changes only assignment, preserving Ticket Owner", async () => {
    const next = { ...unfinished, assignee: { id: 91, name: "Current Operator" }, version: 3, updatedAt: "2026-10-09T09:11:00.000Z" };
    const { user, writes } = installOperationFetch({ next }); await readyTicket(user);
    const actions = await screen.findByRole("region", { name: "Actions Taken" });
    const trigger = within(actionRecord(actions, unfinished)).getByRole("button", { name: /^reassign\b/i });
    await userEvent.click(trigger); let dialog = await screen.findByRole("dialog", { name: "Reassign Action" });
    expect(within(dialog).getByRole("combobox", { name: "Assigned to" })).toHaveValue("74");
    await userEvent.keyboard("{Escape}"); expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(trigger).toHaveFocus(); expect(writes).toHaveLength(0);
    await userEvent.click(trigger); dialog = await screen.findByRole("dialog", { name: "Reassign Action" });
    await userEvent.selectOptions(within(dialog).getByRole("combobox", { name: "Assigned to" }), "91");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save assignment" }));
    expect(await within(actions).findByText(next.assignee.name)).toBeInTheDocument();
    expect(writes).toHaveLength(1); assertMutationTokens(writes[0]!);
    expect(Object.keys(writes[0]!.body).sort()).toEqual(["assigneeId", "clientMutationId", "expectedTicketUpdatedAt", "expectedVersion"]);
    expect(writes[0]!.body.assigneeId).toBe(91); expect(screen.getByText(`Owner: ${owner.name}`)).toBeInTheDocument();
  });

  it("AC-10 T-10 D-04/06: non-assignee completion requires result/confirmation and retains informative follow-up", async () => {
    const next = { ...unfinished, status: "COMPLETED" as const, result: "ตรวจสอบ 😀 เรียบร้อย", performedBy: { id: 91, name: "Current Operator" }, completedAt: "2026-10-09T09:11:00.000Z", updatedAt: "2026-10-09T09:11:00.000Z", version: 3 };
    const { user, writes } = installOperationFetch({ next }); await readyTicket(user);
    const actions = await screen.findByRole("region", { name: "Actions Taken" });
    await userEvent.click(within(actionRecord(actions, unfinished)).getByRole("button", { name: /^complete\b/i }));
    const dialog = await screen.findByRole("dialog", { name: "Complete Action" }); expect(writes).toHaveLength(0);
    expect(within(dialog).getByRole("button", { name: "Confirm completion" })).toBeDisabled();
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Result" }), next.result);
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirm completion" }));
    expect(await within(actions).findByText(next.result)).toBeInTheDocument();
    expect(writes).toHaveLength(1); assertMutationTokens(writes[0]!);
    expect(writes[0]!.url.pathname).toBe("/api/tickets/501/actions/801/status");
    expect(Object.keys(writes[0]!.body).sort()).toEqual(["clientMutationId", "confirm", "expectedTicketUpdatedAt", "expectedVersion", "result", "targetStatus"]);
    expect(writes[0]!.body).toMatchObject({ targetStatus: "COMPLETED", confirm: true, result: next.result });
    const record = actionRecord(actions, next); expect(within(record).getByText(next.performedBy.name)).toBeInTheDocument(); expect(within(record).getByText(unfinished.followUpNote!)).toBeInTheDocument();
    expect(within(record).queryByRole("button", { name: /^complete\b/i })).not.toBeInTheDocument();
  });

  it("AC-11 T-11: Cancel requires a reason, sends confirmed status and retains attribution", async () => {
    const reason = "Investigation no longer needed";
    const next = { ...unfinished, status: "CANCELLED" as const, cancellationReason: reason, cancelledAt: "2026-10-09T09:11:00.000Z", updatedAt: "2026-10-09T09:11:00.000Z", version: 3 };
    const { user, writes } = installOperationFetch({ next }); await readyTicket(user);
    const actions = await screen.findByRole("region", { name: "Actions Taken" });
    await userEvent.click(within(actionRecord(actions, unfinished)).getByRole("button", { name: /^cancel\b/i }));
    const dialog = await screen.findByRole("dialog", { name: "Cancel Action" });
    expect(within(dialog).getByRole("button", { name: "Confirm cancellation" })).toBeDisabled();
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Cancellation reason" }), reason);
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirm cancellation" }));
    expect(await within(actions).findByText(reason)).toBeInTheDocument();
    expect(writes).toHaveLength(1); assertMutationTokens(writes[0]!);
    expect(Object.keys(writes[0]!.body).sort()).toEqual(["clientMutationId", "confirm", "expectedTicketUpdatedAt", "expectedVersion", "reason", "targetStatus"]);
    expect(writes[0]!.body).toMatchObject({ targetStatus: "CANCELLED", confirm: true, reason });
    expect(within(actionRecord(actions, next)).getByText("Not completed")).toBeInTheDocument();
  });

  it("AC-41 T-50: cancelled clearing keeps checkbox/text and sends nothing; confirmed clearing sends explicit null", async () => {
    const next = { ...unfinished, followUpRequired: false, followUpNote: null, updatedAt: "2026-10-09T09:11:00.000Z", version: 3 };
    const { user, writes } = installOperationFetch({ next }); await readyTicket(user);
    const actions = await screen.findByRole("region", { name: "Actions Taken" });
    await userEvent.click(within(actionRecord(actions, unfinished)).getByRole("button", { name: /^edit\b/i }));
    let dialog = await screen.findByRole("dialog", { name: "Edit Action" });
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Follow-up required" }));
    let confirmation = await screen.findByRole("dialog", { name: "Clear follow-up note?" }); expect(writes).toHaveLength(0);
    await userEvent.click(within(confirmation).getByRole("button", { name: "Keep note" }));
    dialog = await screen.findByRole("dialog", { name: "Edit Action" });
    expect(within(dialog).getByRole("checkbox", { name: "Follow-up required" })).toBeChecked();
    expect(within(dialog).getByRole("textbox", { name: "Follow-up note" })).toHaveValue(unfinished.followUpNote); expect(writes).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Follow-up required" }));
    confirmation = await screen.findByRole("dialog", { name: "Clear follow-up note?" });
    await userEvent.click(within(confirmation).getByRole("button", { name: "Clear note" }));
    dialog = await screen.findByRole("dialog", { name: "Edit Action" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(await within(actions).findByText("No follow-up required")).toBeInTheDocument();
    expect(writes).toHaveLength(1); assertMutationTokens(writes[0]!);
    expect(Object.keys(writes[0]!.body).sort()).toEqual(["clientMutationId", "expectedTicketUpdatedAt", "expectedVersion", "followUpNote", "followUpRequired"]);
    expect(writes[0]!.body).toMatchObject({ followUpRequired: false, followUpNote: null });
  });

  it("AC-09 T-09: Start sends only target and optimistic tokens and displays authoritative state", async () => {
    const planned = { ...unfinished, status: "PLANNED" as const, version: 1, updatedAt: unfinished.createdAt };
    const next = { ...unfinished, version: 2, updatedAt: "2026-10-09T09:11:00.000Z" };
    const { user, writes } = installOperationFetch({ action: planned, next }); await readyTicket(user);
    const actions = await screen.findByRole("region", { name: "Actions Taken" });
    await userEvent.click(within(actionRecord(actions, planned)).getByRole("button", { name: /^start\b/i }));
    const dialog = await screen.findByRole("dialog", { name: "Start Action" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Start action" }));
    expect(await within(actions).findByText("In Progress")).toBeInTheDocument();
    expect(writes).toHaveLength(1); assertMutationTokens(writes[0]!, 1);
    expect(Object.keys(writes[0]!.body).sort()).toEqual(["clientMutationId", "expectedTicketUpdatedAt", "expectedVersion", "targetStatus"]);
    expect(writes[0]!.body.targetStatus).toBe("IN_PROGRESS");
  });

  it.each([
    { parentStatus: "RESOLVED" as const, action: unfinished },
    { parentStatus: "CLOSED" as const, action: unfinished },
    { parentStatus: "CANCELLED" as const, action: unfinished },
    { parentStatus: "IN_PROGRESS" as const, action: completed },
    { parentStatus: "IN_PROGRESS" as const, action: { ...unfinished, status: "CANCELLED" as const, cancellationReason: "Earlier cancellation", cancelledAt: "2026-10-09T09:05:00.000Z" } },
  ])("AC-12 T-12: $parentStatus parent / $action.status Action is readable without mutation controls", async ({ parentStatus, action }) => {
    const { user, writes } = installOperationFetch({ parentStatus, action }); await readyTicket(user);
    const actions = await screen.findByRole("region", { name: "Actions Taken" });
    expect(await within(actions).findByText(action.description)).toBeInTheDocument();
    expect(within(actions).queryByRole("button", { name: /^(?:edit|reassign|start|complete|cancel)\b/i })).not.toBeInTheDocument(); expect(writes).toHaveLength(0);
  });
});


// Issue #45 Create UI: partial AC-03/05/06/07/12/14/36/41,
// T-03/05/06/07/12/14/36/49. These HTTP fixtures do not prove backend atomicity.
import { waitFor } from "@testing-library/react";

const createOperator: SafeUser = {
  id: 91, name: "Current Create Operator", email: "create-operator@example.test",
  role: "IT_STAFF", mustChangePassword: false,
};
const createParentToken = "2026-10-09T09:12:00.000Z";

// Explicit server fixture, not generated by a production projection or from the submitted body.
function createdActionFixture(overrides: Partial<ActionFixture> = {}): ActionFixture {
  return {
    id: 803, ticketId: 501, actionAt: "2026-10-09T09:12:00.000Z",
    description: "Inspect <script>literal action text</script>", result: null,
    createdBy: { id: 91, name: "Current Create Operator" }, assignee: { id: 74, name: "Assigned Worker" },
    performedBy: null, status: "PLANNED", followUpRequired: false, followUpNote: null,
    attachmentNotes: null, cancellationReason: null,
    createdAt: "2026-10-09T09:12:00.000Z", updatedAt: "2026-10-09T09:12:00.000Z",
    completedAt: null, cancelledAt: null, version: 1, ...overrides,
  };
}

function installCreateFetch(options: {
  user?: SafeUser;
  parentStatus?: StaffTicketDetail["currentStatus"];
  created?: ActionFixture;
  response?: () => Promise<Response>;
  unavailableAfterLoad?: boolean;
} = {}) {
  const user = options.user ?? createOperator;
  const inherited = installFetch({ user });
  const inheritedFetch = globalThis.fetch;
  const calls: Array<{ url: URL; method: string }> = [];
  const writes: Array<{ url: URL; init: RequestInit; body: Record<string, unknown> }> = [];
  const created = options.created ?? createdActionFixture();
  let actions = [unfinished, completed];
  let ticketUpdatedAt = staffTicket.updatedAt;
  let pickerRequests = 0;
  let rejectedCreate = false;
  document.cookie = "toktickit_csrf=create-action-csrf; path=/";
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    if (method === "GET" && url.pathname === "/api/staff/assignees" && user.role !== "REQUESTER") {
      pickerRequests += 1;
      return jsonResponse({ items: [
        { id: user.id, name: user.name, role: user.role },
        ...(!options.unavailableAfterLoad || !rejectedCreate ? [{ ...assignee, role: "IT_STAFF" }] : []),
      ] });
    }
    if (method === "GET" && url.pathname === "/api/staff/tickets/501" && user.role !== "REQUESTER") {
      const currentStatus = options.parentStatus ?? staffTicket.currentStatus;
      const allowedStatusTransitions = currentStatus === "RESOLVED" ? ["CLOSED", "REOPENED"] :
        currentStatus === "CLOSED" || currentStatus === "CANCELLED" ? [] : staffTicket.allowedStatusTransitions;
      return jsonResponse({ ...staffTicket, currentStatus, allowedStatusTransitions, updatedAt: ticketUpdatedAt });
    }
    if (method === "GET" && url.pathname === "/api/tickets/501") {
      return jsonResponse({ ...requesterTicket, currentStatus: options.parentStatus ?? requesterTicket.currentStatus, updatedAt: ticketUpdatedAt });
    }
    if (method === "GET" && url.pathname === "/api/tickets/501/actions") return jsonResponse(page(actions));
    if (method === "GET" && url.pathname === `/api/tickets/501/actions/${created.id}`) {
      return jsonResponse({ action: created, ticketUpdatedAt });
    }
    if (method === "POST" && url.pathname === "/api/tickets/501/actions") {
      writes.push({ url, init: init!, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      const response = await (options.response?.() ?? Promise.resolve(jsonResponse({ action: created, ticketUpdatedAt: createParentToken, replayed: false }, 201)));
      if (response.ok) {
        const data = await response.clone().json() as { action: ActionFixture; ticketUpdatedAt: string };
        actions = [unfinished, completed, data.action];
        ticketUpdatedAt = data.ticketUpdatedAt;
      } else rejectedCreate = true;
      return response;
    }
    return inheritedFetch(input, init);
  }));
  return { user, calls, inheritedCalls: inherited.calls, writes, pickerRequests: () => pickerRequests };
}

async function readyCreateRegion(user: SafeUser) {
  await readyTicket(user);
  const region = await screen.findByRole("region", { name: "Actions Taken" });
  await within(region).findByText(unfinished.description);
  return region;
}

async function openCreateDialog(region: HTMLElement, user: SafeUser) {
  await userEvent.click(within(region).getByRole("button", { name: /^create action$/i }));
  const dialog = await screen.findByRole("dialog", { name: /^create action$/i });
  await within(dialog).findByRole("textbox", { name: /^description$/i });
  await within(dialog).findByRole("option", { name: user.name });
  expect(within(dialog).getByRole("combobox", { name: /^assigned to$/i })).toHaveValue(String(user.id));
  return dialog;
}

function createSubmit(dialog: HTMLElement) {
  return within(dialog).getByRole("button", { name: /^(?:create action|create)$/i });
}

async function fillCreateDescription(dialog: HTMLElement, text: string) {
  const field = within(dialog).getByRole("textbox", { name: /^description$/i });
  await userEvent.clear(field);
  await userEvent.type(field, text);
}

async function expectAccessibleFieldError(field: HTMLElement) {
  await waitFor(() => expect(field).toHaveAttribute("aria-invalid", "true"));
  const ids = field.getAttribute("aria-describedby")?.split(/\s+/u) ?? [];
  expect(ids.length).toBeGreaterThan(0);
  expect(ids.some((id) => {
    const feedback = document.getElementById(id);
    return feedback !== null && (feedback.textContent?.trim().length ?? 0) > 0;
  })).toBe(true);
  expect(field).toHaveAccessibleDescription();
}

function assertCreateRequest(write: { url: URL; init: RequestInit; body: Record<string, unknown> }) {
  expect(write.url.pathname).toBe("/api/tickets/501/actions");
  expect(write.init.method).toBe("POST");
  expect(write.init.credentials).toBe("include");
  expect(new Headers(write.init.headers).get("X-CSRF-Token")).toBe("create-action-csrf");
  expect(new Headers(write.init.headers).get("Content-Type")).toMatch(/^application\/json\b/i);
  expect(Object.keys(write.body).sort()).toEqual([
    "assigneeId", "attachmentNotes", "clientMutationId", "description",
    "expectedTicketUpdatedAt", "followUpNote", "followUpRequired", "result",
  ]);
  expect(write.body.expectedTicketUpdatedAt).toBe("2026-10-09T09:10:00.000Z");
  expect(write.body.clientMutationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
}

async function expectAuthoritativeCreate(region: HTMLElement, created: ActionFixture) {
  expect(await within(region).findByText(created.description)).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("dialog", { name: /^create action$/i })).not.toBeInTheDocument());
  const record = actionRecord(region, created);
  expect(within(record).getByText(created.createdBy.name)).toBeInTheDocument();
  expect(within(record).getByText(created.assignee.name)).toBeInTheDocument();
  expect(within(record).getByText("Not completed")).toBeInTheDocument();
  expect(within(record).getByText("Planned")).toBeInTheDocument();
  expect(record.querySelector(`time[datetime="${created.actionAt}"]`)).not.toBeNull();
  expect(screen.getByText(`Owner: ${owner.name}`)).toBeInTheDocument();
  // The existing Ticket status/Updated paragraph is in the heading's own container,
  // separate from Action timestamps; do not mistake the new Action's time for the parent token.
  const ticketHeading = screen.getByRole("heading", { name: staffTicket.ticketNumber });
  expect(ticketHeading.parentElement?.querySelector(`time[datetime="${createParentToken}"]`)).toBeInTheDocument();
  return record;
}

describe("Issue 45 Create Action UI — bounded 12-case RED", () => {
  it.each(["IT_STAFF", "ADMINISTRATOR"] as const)(
    "AC-03/07 T-03/07 D-04: active %s can create as a non-owner, defaulting to self and choosing another eligible worker",
    async (role) => {
      const user: SafeUser = { ...createOperator, id: role === "IT_STAFF" ? 91 : 92, name: `Create ${role}`, role };
      const harness = installCreateFetch({ user });
      const region = await readyCreateRegion(user);
      expect(new Set([owner.id, creator.id, assignee.id, user.id]).size).toBe(4);
      const dialog = await openCreateDialog(region, user);
      const picker = within(dialog).getByRole("combobox", { name: /^assigned to$/i });
      expect(within(picker).getAllByRole("option").map((option) => option.getAttribute("value"))).toEqual(expect.arrayContaining([String(user.id), "74"]));
      await userEvent.selectOptions(picker, "74");
      expect(picker).toHaveValue("74");
      expect(harness.pickerRequests()).toBeGreaterThan(0);
      expect(harness.writes).toHaveLength(0);
    },
  );

  it("AC-03 T-03: owned Requester has no Create control or privileged assignee lookup", async () => {
    const harness = installCreateFetch({ user: requesterUser });
    const region = await readyCreateRegion(requesterUser);
    expect(within(region).queryByRole("button", { name: /^create action$/i })).not.toBeInTheDocument();
    expect([...harness.calls, ...harness.inheritedCalls].filter(({ url }) => url.pathname === "/api/staff/assignees")).toEqual([]);
    expect(harness.writes).toHaveLength(0);
  });

  it.each(["RESOLVED", "CLOSED", "CANCELLED"] as const)(
    "AC-12 T-12: %s parent hides Create and performs no Action write",
    async (parentStatus) => {
      const harness = installCreateFetch({ parentStatus });
      const region = await readyCreateRegion(harness.user);
      expect(within(region).queryByRole("button", { name: /^create action$/i })).not.toBeInTheDocument();
      expect(harness.writes).toHaveLength(0);
    },
  );

  it("AC-03/05/06/07/36 T-03/05/06/07/36: creates false-follow-up through API-04 and renders authoritative distinct identities and parent token", async () => {
    const created = createdActionFixture();
    const harness = installCreateFetch({ created });
    const region = await readyCreateRegion(harness.user);
    const dialog = await openCreateDialog(region, harness.user);
    await fillCreateDescription(dialog, "  Inspect <script>literal action text</script>  ");
    const followUp = within(dialog).getByRole("checkbox", { name: /^follow-up required$/i });
    if ((followUp as HTMLInputElement).checked) await userEvent.click(followUp);
    await userEvent.selectOptions(within(dialog).getByRole("combobox", { name: /^assigned to$/i }), "74");
    await userEvent.click(createSubmit(dialog));
    const record = await expectAuthoritativeCreate(region, created);
    expect(harness.writes).toHaveLength(1);
    assertCreateRequest(harness.writes[0]!);
    expect(harness.writes[0]!.body).toMatchObject({
      description: "Inspect <script>literal action text</script>", result: null, assigneeId: 74,
      followUpRequired: false, followUpNote: null, attachmentNotes: null,
    });
    expect(record.querySelector("script")).toBeNull();
    const post = harness.calls.findIndex(({ method }) => method === "POST");
    expect(harness.calls.slice(post + 1).some(({ url, method }) => method === "GET" && url.pathname === "/api/staff/tickets/501")).toBe(true);
    expect(harness.calls.slice(post + 1).some(({ url, method }) => method === "GET" && url.pathname === "/api/tickets/501/actions")).toBe(true);
  });

  it("AC-05/06/41 T-05/06/49: creates true-follow-up with trimmed supplementary text and inert Attachment Notes", async () => {
    const created = createdActionFixture({ description: "ตรวจสอบ VPN 😀", followUpRequired: true, followUpNote: "ติดตาม 😀 e\u0301", attachmentNotes: literalAttachmentNotes });
    const harness = installCreateFetch({ created });
    const region = await readyCreateRegion(harness.user);
    const dialog = await openCreateDialog(region, harness.user);
    await fillCreateDescription(dialog, "  ตรวจสอบ VPN 😀  ");
    const followUp = within(dialog).getByRole("checkbox", { name: /^follow-up required$/i });
    if (!(followUp as HTMLInputElement).checked) await userEvent.click(followUp);
    await userEvent.type(within(dialog).getByRole("textbox", { name: /^follow-up note$/i }), "  ติดตาม 😀 e\u0301  ");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /^attachment notes$/i }), `  ${literalAttachmentNotes}  `);
    await userEvent.selectOptions(within(dialog).getByRole("combobox", { name: /^assigned to$/i }), "74");
    await userEvent.click(createSubmit(dialog));
    const record = await expectAuthoritativeCreate(region, created);
    expect(harness.writes).toHaveLength(1);
    assertCreateRequest(harness.writes[0]!);
    expect(harness.writes[0]!.body).toMatchObject({ description: "ตรวจสอบ VPN 😀", followUpRequired: true, followUpNote: "ติดตาม 😀 e\u0301", attachmentNotes: literalAttachmentNotes });
    expect(within(record).getByText("ติดตาม 😀 e\u0301")).toBeInTheDocument();
    expect(within(record).getByText(literalAttachmentNotes)).toBeInTheDocument();
    expect(record.querySelector("script, [onclick], [onerror]")).toBeNull();
    expect(record.querySelector('a[href="/api/tickets/999/attachments/777/content"]')).toBeNull();
  });

  it("AC-05/41 T-05/49: three-code-point description and missing required follow-up note block POST with accessible field feedback", async () => {
    const harness = installCreateFetch();
    const region = await readyCreateRegion(harness.user);
    const dialog = await openCreateDialog(region, harness.user);
    // 😀😀a is three Unicode code points, although JavaScript UTF-16 length is five.
    await fillCreateDescription(dialog, "😀😀a");
    await userEvent.click(createSubmit(dialog));
    const description = within(dialog).getByRole("textbox", { name: /^description$/i });
    await expectAccessibleFieldError(description);
    expect(description).toHaveValue("😀😀a");
    expect(harness.writes).toHaveLength(0);
    await fillCreateDescription(dialog, "Valid replacement description");
    const followUp = within(dialog).getByRole("checkbox", { name: /^follow-up required$/i });
    if (!(followUp as HTMLInputElement).checked) await userEvent.click(followUp);
    const note = within(dialog).getByRole("textbox", { name: /^follow-up note$/i });
    await userEvent.clear(note);
    await userEvent.click(createSubmit(dialog));
    await expectAccessibleFieldError(note);
    expect(note).toHaveValue("");
    expect(description).toHaveValue("Valid replacement description");
    expect(harness.writes).toHaveLength(0);
  });

  it("AC-07/36 T-07/36: commit-time ASSIGNEE_INELIGIBLE retains draft and selected worker while offering recovery", async () => {
    // Controlled HTTP response models the documented 409 commit-time eligibility race, not a real database race.
    const harness = installCreateFetch({ unavailableAfterLoad: true, response: async () => jsonResponse({
      error: { code: "ASSIGNEE_INELIGIBLE", message: "Assignee eligibility changed. Reload and try again." },
    }, 409) });
    const region = await readyCreateRegion(harness.user);
    const dialog = await openCreateDialog(region, harness.user);
    await fillCreateDescription(dialog, "Preserve my entered investigation");
    const picker = within(dialog).getByRole("combobox", { name: /^assigned to$/i });
    await userEvent.selectOptions(picker, "74");
    await userEvent.click(createSubmit(dialog));
    const error = await within(dialog).findByRole("alert");
    expect(error).not.toHaveTextContent(/^\s*$/);
    expect(harness.writes).toHaveLength(1);
    expect(harness.writes[0]!.body.assigneeId).toBe(74);
    expect(within(dialog).getByRole("textbox", { name: /^description$/i })).toHaveValue("Preserve my entered investigation");
    expect(picker).toHaveValue("74");
    expect(within(region).queryByText("Preserve my entered investigation")).not.toBeInTheDocument();
    expect(within(region).queryByText(/action (?:created|added|saved) successfully/i)).not.toBeInTheDocument();
    const recovery = within(dialog).getByRole("button", { name: /(?:reload|refresh).*(?:assignees|workers)|(?:assignees|workers).*(?:reload|refresh)/i });
    const beforeRecovery = harness.pickerRequests();
    await userEvent.click(recovery);
    await waitFor(() => expect(harness.pickerRequests()).toBeGreaterThan(beforeRecovery));
    expect(within(dialog).getByRole("combobox", { name: /^assigned to$/i })).toHaveValue("74");
    expect(within(dialog).getByRole("textbox", { name: /^description$/i })).toHaveValue("Preserve my entered investigation");
    expect(harness.writes).toHaveLength(1);
  });

  it("AC-14/36 T-14/36: pending create blocks duplicates and dismissal, then announces one authoritative success", async () => {
    const created = createdActionFixture({ description: "Server-confirmed pending create" });
    let finish!: () => void;
    const settled = new Promise<Response>((resolve) => {
      finish = () => resolve(jsonResponse({ action: created, ticketUpdatedAt: createParentToken, replayed: false }, 201));
    });
    pending.push({ finish, settled });
    const harness = installCreateFetch({ created, response: () => settled });
    const region = await readyCreateRegion(harness.user);
    const dialog = await openCreateDialog(region, harness.user);
    await fillCreateDescription(dialog, "Server-confirmed pending create");
    await userEvent.selectOptions(within(dialog).getByRole("combobox", { name: /^assigned to$/i }), "74");
    const submit = createSubmit(dialog);
    await userEvent.click(submit);
    await waitFor(() => expect(harness.writes).toHaveLength(1));
    expect(submit).toBeDisabled();
    const cancel = within(dialog).getByRole("button", { name: /^cancel$/i });
    expect(cancel).toBeDisabled();
    await userEvent.click(submit);
    await userEvent.click(cancel);
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: /^create action$/i })).toBeInTheDocument();
    expect(harness.writes).toHaveLength(1);
    expect(within(region).queryByText(created.description)).not.toBeInTheDocument();
    await act(async () => { finish(); await settled; });
    await expectAuthoritativeCreate(region, created);
    expect(harness.writes).toHaveLength(1);
    assertCreateRequest(harness.writes[0]!);
    await waitFor(() => expect(within(region).getByRole("status")).toHaveTextContent(/creat|added|saved|success/i));
  });

  it("AC-36 T-36: Cancel and Escape before submission never write and return focus to Create trigger", async () => {
    const harness = installCreateFetch();
    const region = await readyCreateRegion(harness.user);
    const trigger = within(region).getByRole("button", { name: /^create action$/i });
    let dialog = await openCreateDialog(region, harness.user);
    await fillCreateDescription(dialog, "Unsaved cancelled draft");
    await userEvent.click(within(dialog).getByRole("button", { name: /^cancel$/i }));
    expect(screen.queryByRole("dialog", { name: /^create action$/i })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(harness.writes).toHaveLength(0);
    dialog = await openCreateDialog(region, harness.user);
    await fillCreateDescription(dialog, "Unsaved escaped draft");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: /^create action$/i })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(harness.writes).toHaveLength(0);
  });
});


// History rendering only: partial AC-12/13/36/39/41/45 and T-12/13/36/39/50/55.
// Fixtures model separate legal lifecycles; no cascade execution or database atomicity is claimed.
import type { ActionHistoryDTO, ActionSnapshot } from "../../src/api.js";

const historyActor = { id: 191, name: "Historical Editor" };
const historyCompleter = { id: 195, name: "Historical Completing Actor" };
const historyOldNote = "Retained original follow-up 😀 e\u0301";
const historyLiteral = '<script>window.historyNoteExecuted=true</script> <a href="/api/tickets/999/attachments/777/content">history-evidence.pdf</a>';

function historyInitial(actionId = 901): ActionSnapshot {
  return {
    id: actionId, ticketId: 501, createdById: 173, assigneeId: 174, performedById: null,
    status: "PLANNED", description: "Original historical description", result: null,
    followUpRequired: true, followUpNote: historyOldNote, attachmentNotes: historyLiteral,
    actionAt: "2026-10-09T09:00:00.000Z", createdAt: "2026-10-09T09:00:00.000Z",
    updatedAt: "2026-10-09T09:00:00.000Z", completedAt: null, cancelledAt: null,
    cancellationReason: null, version: 1,
  };
}

function historyEventFixture(event: ActionHistoryDTO["event"], before: ActionSnapshot | null, after: ActionSnapshot,
  actor = historyActor, sourceTicketStatusHistoryId: number | null = null): ActionHistoryDTO {
  return { id: after.id * 1000 + after.version, actionId: after.id, actor, event,
    createdAt: after.updatedAt, actionVersion: after.version, sourceTicketStatusHistoryId, before, after };
}

function historyActionFixture(snapshot: ActionSnapshot): ActionFixture {
  // Identity names are the current safe DTO names, deliberately distinct from historical scalar IDs.
  return {
    id: snapshot.id, ticketId: snapshot.ticketId, actionAt: snapshot.actionAt,
    description: snapshot.description, result: snapshot.result,
    createdBy: { id: 173, name: "Creator current display name" },
    assignee: { id: snapshot.assigneeId, name: "Assignee current display name" },
    performedBy: snapshot.performedById === null ? null : { id: snapshot.performedById, name: historyCompleter.name },
    status: snapshot.status, followUpRequired: snapshot.followUpRequired, followUpNote: snapshot.followUpNote,
    attachmentNotes: snapshot.attachmentNotes, cancellationReason: snapshot.cancellationReason,
    createdAt: snapshot.createdAt, updatedAt: snapshot.updatedAt, completedAt: snapshot.completedAt,
    cancelledAt: snapshot.cancelledAt, version: snapshot.version,
  };
}

function completedHistoryFixture() {
  const initial = historyInitial();
  const edited: ActionSnapshot = { ...initial, followUpRequired: false, followUpNote: null, version: 2, updatedAt: "2026-10-09T09:01:00.000Z" };
  const reassigned: ActionSnapshot = { ...edited, assigneeId: 176, description: "Combined content and assignment change", version: 3, updatedAt: "2026-10-09T09:02:00.000Z" };
  const started: ActionSnapshot = { ...reassigned, status: "IN_PROGRESS", version: 4, updatedAt: "2026-10-09T09:03:00.000Z" };
  const done: ActionSnapshot = { ...started, status: "COMPLETED", result: "Verified Thai ไทย 😀 e\u0301 literally", performedById: 195,
    completedAt: "2026-10-09T09:04:00.000Z", updatedAt: "2026-10-09T09:04:00.000Z", version: 5 };
  const events = [
    historyEventFixture("ACTION_CREATED", null, initial, { id: 173, name: "Creator current display name" }),
    historyEventFixture("ACTION_EDITED", initial, edited),
    historyEventFixture("ACTION_REASSIGNED", edited, reassigned),
    historyEventFixture("ACTION_STARTED", reassigned, started),
    historyEventFixture("ACTION_COMPLETED", started, done, historyCompleter),
  ];
  return { action: historyActionFixture(done), events };
}

function cancelledHistoryFixture(cascade: boolean) {
  const initial = historyInitial(cascade ? 903 : 902);
  const draftEdit: ActionSnapshot = { ...initial, result: "Retained draft result", version: 2, updatedAt: "2026-10-09T09:00:30.000Z" };
  const active: ActionSnapshot = { ...draftEdit, status: "IN_PROGRESS", version: 3, updatedAt: "2026-10-09T09:01:00.000Z" };
  const after: ActionSnapshot = { ...active, status: "CANCELLED", cancelledAt: "2026-10-09T09:02:00.000Z",
    cancellationReason: cascade ? "Parent cancelled with literal <b>reason</b>" : "Explicit Action cancellation reason", updatedAt: "2026-10-09T09:02:00.000Z", version: 4 };
  const events = [
    historyEventFixture("ACTION_CREATED", null, initial, { id: 173, name: "Creator current display name" }),
    historyEventFixture("ACTION_EDITED", initial, draftEdit),
    historyEventFixture("ACTION_STARTED", draftEdit, active),
    historyEventFixture(cascade ? "ACTION_CANCELLED_BY_TICKET" : "ACTION_CANCELLED", active, after, historyActor, cascade ? 8801 : null),
  ];
  return { action: historyActionFixture(after), events };
}

function historyPage(events: ActionHistoryDTO[], pageNumber: number, pageSize: 20 | 50 | 100) {
  const totalPages = Math.ceil(events.length / pageSize);
  return {
    items: events.slice((pageNumber - 1) * pageSize, pageNumber * pageSize),
    pagination: { page: pageNumber, pageSize, totalItems: events.length, totalPages,
      hasPreviousPage: pageNumber > 1, hasNextPage: pageNumber < totalPages },
  };
}

function installHistoryFetch(options: {
  user?: SafeUser; fixture?: ReturnType<typeof completedHistoryFixture>;
  parentStatus?: StaffTicketDetail["currentStatus"];
  response?: (attempt: number, pageNumber: number, pageSize: 20 | 50 | 100) => Promise<Response>;
} = {}) {
  const user = options.user ?? requesterUser;
  const fixture = options.fixture ?? completedHistoryFixture();
  const inherited = installFetch({ user, actions: [fixture.action] });
  const inheritedFetch = globalThis.fetch;
  const calls: Array<{ url: URL; method: string; init?: RequestInit }> = [];
  const historyCalls: Array<{ url: URL; init?: RequestInit }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input), method = init?.method ?? "GET";
    calls.push({ url, method, init });
    if (method === "GET" && url.pathname === `/api/tickets/501/actions/${fixture.action.id}/history`) {
      historyCalls.push({ url, init });
      const pageNumber = Number(url.searchParams.get("page") ?? 1);
      const pageSize = Number(url.searchParams.get("pageSize") ?? 20) as 20 | 50 | 100;
      return options.response?.(historyCalls.length, pageNumber, pageSize) ?? jsonResponse(historyPage(fixture.events, pageNumber, pageSize));
    }
    if (method === "GET" && url.pathname === `/api/tickets/501/actions/${fixture.action.id}`) return jsonResponse({ action: fixture.action, ticketUpdatedAt: requesterTicket.updatedAt });
    const currentStatus = options.parentStatus ?? "IN_PROGRESS";
    if (method === "GET" && url.pathname === "/api/tickets/501") return jsonResponse({ ...requesterTicket, currentStatus });
    if (method === "GET" && url.pathname === "/api/staff/tickets/501" && user.role !== "REQUESTER") {
      const cascade = fixture.events.find((event) => event.sourceTicketStatusHistoryId !== null);
      return jsonResponse({ ...staffTicket, currentStatus,
        allowedStatusTransitions: currentStatus === "RESOLVED" ? ["CLOSED", "REOPENED"] : ["CLOSED", "CANCELLED"].includes(currentStatus) ? [] : staffTicket.allowedStatusTransitions,
        statusHistory: cascade ? [{ id: 8801, fromStatus: "IN_PROGRESS", toStatus: "CANCELLED", reason: cascade.after.cancellationReason,
          actor: { ...historyActor, role: "IT_STAFF" }, createdAt: cascade.createdAt }] : [],
      });
    }
    return inheritedFetch(input, init);
  }));
  return { user, fixture, calls, inheritedCalls: inherited.calls, historyCalls };
}

async function openHistory(harness: ReturnType<typeof installHistoryFetch>) {
  await readyTicket(harness.user);
  const actions = await screen.findByRole("region", { name: "Actions Taken" });
  await within(actions).findByText(harness.fixture.action.description);
  const trigger = within(actionRecord(actions, harness.fixture.action)).getByRole("button", { name: /^view history$/i });
  await userEvent.click(trigger);
  let presentation: HTMLElement | null = null;
  await waitFor(() => {
    presentation = screen.queryByRole("dialog", { name: /action history|history for action/i }) ??
      screen.queryByRole("region", { name: /action history|history for action/i });
    expect(presentation).not.toBeNull();
  });
  return { actions, trigger, presentation: presentation! as HTMLElement };
}

function historyEventRecord(presentation: HTMLElement, label: string): HTMLElement {
  const heading = within(presentation).queryByRole("heading", { name: label }) ?? within(presentation).getByText(label, { exact: true });
  const record = heading.closest("li, article, tr, [role=listitem], [role=row], [role=group]") ?? heading.parentElement;
  expect(record).not.toBeNull();
  return record as HTMLElement;
}

function snapshotPresentation(record: HTMLElement, name: "Before" | "After"): HTMLElement {
  const matcher = new RegExp(`^${name}(?: snapshot)?$`, "i");
  const named = within(record).queryByRole("region", { name: matcher }) ?? within(record).queryByRole("group", { name: matcher }) ?? within(record).queryByRole("table", { name: matcher });
  if (named) return named;
  const label = within(record).queryByRole("heading", { name: matcher }) ?? within(record).getByText(matcher);
  expect(label.parentElement).not.toBeNull();
  return label.parentElement!;
}

function historyDisplayedField(container: HTMLElement, name: RegExp): HTMLElement {
  const label = within(container).getByText(name);
  // Accept description lists, table rows or labelled field blocks; do not couple to CSS/components.
  if (label.tagName === "DT") { expect(label.nextElementSibling).not.toBeNull(); return label.nextElementSibling as HTMLElement; }
  const field = label.closest("tr") ?? label.parentElement;
  expect(field).not.toBeNull();
  return field as HTMLElement;
}

function assertHistorySnapshot(presentation: HTMLElement, snapshot: ActionSnapshot) {
  const textFields: Array<[RegExp, string | number | null]> = [
    [/^(?:Action ID|id)$/i, snapshot.id], [/^(?:Ticket ID|ticketId)$/i, snapshot.ticketId],
    [/^(?:Created by ID|createdById)$/i, snapshot.createdById], [/^(?:Assigned to ID|Assignee ID|assigneeId)$/i, snapshot.assigneeId],
    [/^(?:Performed by ID|performedById)$/i, snapshot.performedById], [/^Description$/i, snapshot.description],
    [/^Result$/i, snapshot.result], [/^(?:Follow-up note|followUpNote)$/i, snapshot.followUpNote],
    [/^(?:Attachment Notes|attachmentNotes)$/i, snapshot.attachmentNotes], [/^(?:Cancellation reason|cancellationReason)$/i, snapshot.cancellationReason],
    [/^(?:Version|Action version)$/i, snapshot.version],
  ];
  for (const [name, value] of textFields) {
    const field = historyDisplayedField(presentation, name);
    expect(field).toHaveTextContent(value === null ? name.source.includes("Performed") ? "Not completed" : "Not recorded" : String(value));
  }
  expect(historyDisplayedField(presentation, /^Status$/i)).toHaveTextContent(snapshot.status === "IN_PROGRESS" ? /in progress|IN_PROGRESS/i : new RegExp(snapshot.status, "i"));
  expect(historyDisplayedField(presentation, /^(?:Follow-up required|followUpRequired)$/i)).toHaveTextContent(snapshot.followUpRequired ? /yes|true|required/i : /no|false/i);
  for (const [name, value] of [
    [/^(?:Action Date\/Time|actionAt)$/i, snapshot.actionAt], [/^(?:Created|Created at|createdAt)$/i, snapshot.createdAt],
    [/^(?:Updated|Updated at|updatedAt)$/i, snapshot.updatedAt], [/^(?:Completed|Completed at|completedAt)$/i, snapshot.completedAt],
    [/^(?:Cancelled|Cancelled at|cancelledAt)$/i, snapshot.cancelledAt],
  ] as const) {
    const field = historyDisplayedField(presentation, name);
    if (value === null) expect(field).toHaveTextContent(/not recorded|not completed/i);
    else expect(field.querySelector(`time[datetime="${value}"]`)).toBeInTheDocument();
  }
  for (const currentName of ["Creator current display name", "Assignee current display name"]) expect(within(presentation).queryByText(currentName)).not.toBeInTheDocument();
}

function assertHistoryReadOnly(harness: ReturnType<typeof installHistoryFetch>, presentation: HTMLElement) {
  expect(harness.calls.every(({ method }) => method === "GET")).toBe(true);
  expect(within(presentation).queryByRole("button", { name: /^(?:create|edit|reassign|start|complete|cancel)\b/i })).not.toBeInTheDocument();
  expect(presentation).not.toHaveTextContent(/passwordHash|csrfTokenHash|tokenHash|fingerprint|safeResponse|storageKey|Internal Notes/i);
  if (harness.user.role === "REQUESTER") {
    expect([...harness.calls, ...harness.inheritedCalls].filter(({ url }) => url.pathname.startsWith("/api/staff/") || url.pathname.startsWith("/api/admin/") || url.pathname.includes("/notes"))).toEqual([]);
  }
}

function controlledHistoryResponse(events: ActionHistoryDTO[]) {
  let resolve!: (response: Response) => void;
  const settled = new Promise<Response>((finish) => { resolve = finish; });
  const finish = () => resolve(jsonResponse(historyPage(events, 1, 20)));
  pending.push({ finish, settled });
  return { finish, settled };
}

describe("Issue 45 Action history UI — focused interaction RED", () => {
  it.each(["REQUESTER", "IT_STAFF", "ADMINISTRATOR"] as const)(
    "AC-13/39/45 T-13/39/55: %s reads complete safe history with actor, version, UTC instants and scalar identity snapshots",
    async (role) => {
      const user = role === "REQUESTER" ? requesterUser : { ...createOperator, role };
      const harness = installHistoryFetch({ user });
      const { presentation } = await openHistory(harness);
      await within(presentation).findByText("No previous record");
      for (const [index, label] of ["Created", "Edited", "Reassigned", "Started", "Completed"].entries()) {
        const event = harness.fixture.events[index]!;
        const record = historyEventRecord(presentation, label);
        expect(within(record).getByText(event.actor.name)).toBeInTheDocument();
        expect(historyDisplayedField(record, /^(?:Action version|actionVersion)$/i)).toHaveTextContent(String(event.actionVersion));
        expect(historyDisplayedField(record, /^(?:Event time|Date\/Time|createdAt)$/i).querySelector(`time[datetime="${event.createdAt}"]`)).toBeInTheDocument();
        expect(historyDisplayedField(record, /^(?:Source Ticket status-event ID|Ticket status-event ID|sourceTicketStatusHistoryId)$/i)).toHaveTextContent("Not recorded");
        if (event.before === null) expect(within(record).getByText("No previous record")).toBeInTheDocument();
        else assertHistorySnapshot(snapshotPresentation(record, "Before"), event.before);
        assertHistorySnapshot(snapshotPresentation(record, "After"), event.after);
      }
      expect(harness.historyCalls).toHaveLength(1);
      expect(harness.historyCalls[0]!.url.pathname).toBe("/api/tickets/501/actions/901/history");
      expect(harness.historyCalls[0]!.url.searchParams.get("page")).toBe("1");
      expect(harness.historyCalls[0]!.url.searchParams.get("pageSize")).toBe("20");
      expect(harness.historyCalls[0]!.init?.credentials).toBe("include");
      assertHistoryReadOnly(harness, presentation);
    },
  );

  it("AC-41/45 T-50/55: cleared note survives before; combined content/reassignment renders exactly one Reassigned event", async () => {
    const harness = installHistoryFetch();
    const { presentation } = await openHistory(harness);
    await within(presentation).findByText("No previous record");
    const edited = historyEventRecord(presentation, "Edited");
    expect(historyDisplayedField(snapshotPresentation(edited, "Before"), /^(?:Follow-up note|followUpNote)$/i)).toHaveTextContent(historyOldNote);
    expect(historyDisplayedField(snapshotPresentation(edited, "After"), /^(?:Follow-up note|followUpNote)$/i)).toHaveTextContent("Not recorded");
    const reassigned = historyEventRecord(presentation, "Reassigned");
    const before = snapshotPresentation(reassigned, "Before"), after = snapshotPresentation(reassigned, "After");
    expect(historyDisplayedField(before, /^Description$/i)).toHaveTextContent("Original historical description");
    expect(historyDisplayedField(after, /^Description$/i)).toHaveTextContent("Combined content and assignment change");
    expect(historyDisplayedField(before, /^(?:Assigned to ID|Assignee ID|assigneeId)$/i)).toHaveTextContent("174");
    expect(historyDisplayedField(after, /^(?:Assigned to ID|Assignee ID|assigneeId)$/i)).toHaveTextContent("176");
    expect(within(presentation).getAllByText("Reassigned", { exact: true })).toHaveLength(1);
    expect(within(presentation).getAllByText("Edited", { exact: true })).toHaveLength(1);
    assertHistoryReadOnly(harness, presentation);
  });

  it.each([false, true])("AC-12/45 T-12/55: renders separate cancelled lifecycle (Ticket cascade=%s) with safe source and retained draft", async (cascade) => {
    const fixture = cancelledHistoryFixture(cascade);
    const harness = installHistoryFetch({ fixture, parentStatus: cascade ? "CANCELLED" : "IN_PROGRESS" });
    const { presentation } = await openHistory(harness);
    const label = cascade ? "Cancelled with Ticket" : "Cancelled";
    await within(presentation).findByText("No previous record");
    const record = historyEventRecord(presentation, label);
    const event = fixture.events[3]!;
    expect(within(record).getByText("Historical Editor")).toBeInTheDocument();
    expect(historyDisplayedField(record, /^(?:Source Ticket status-event ID|Ticket status-event ID|sourceTicketStatusHistoryId)$/i)).toHaveTextContent(cascade ? "8801" : "Not recorded");
    assertHistorySnapshot(snapshotPresentation(record, "Before"), event.before!);
    assertHistorySnapshot(snapshotPresentation(record, "After"), event.after);
    expect(historyDisplayedField(snapshotPresentation(record, "After"), /^(?:Cancellation reason|cancellationReason)$/i)).toHaveTextContent(cascade ? "Parent cancelled with literal <b>reason</b>" : "Explicit Action cancellation reason");
    expect(within(record).queryByText("reason", { selector: "b" })).not.toBeInTheDocument();
    assertHistoryReadOnly(harness, presentation);
  });

  it.each(["RESOLVED", "CLOSED", "CANCELLED"] as const)("AC-12 T-12: frozen %s Ticket still opens terminal Action history", async (parentStatus) => {
    const fixture = parentStatus === "CANCELLED" ? cancelledHistoryFixture(true) : completedHistoryFixture();
    const harness = installHistoryFetch({ fixture, parentStatus, user: createOperator });
    const { actions, presentation } = await openHistory(harness);
    expect(await within(presentation).findByText("No previous record")).toBeInTheDocument();
    expect(within(actions).queryByRole("button", { name: /^(?:create|edit|reassign|start|complete|cancel)\b/i })).not.toBeInTheDocument();
    assertHistoryReadOnly(harness, presentation);
  });

  it("AC-39/45 T-39/55: script-like historical Attachment Notes remain literal with no generated content links", async () => {
    const harness = installHistoryFetch();
    const { presentation } = await openHistory(harness);
    expect((await within(presentation).findAllByText(historyLiteral)).length).toBeGreaterThan(0);
    expect(presentation.querySelector("script, [onclick], [onerror]")).toBeNull();
    expect(presentation.querySelector('a[href="/api/tickets/999/attachments/777/content"]')).toBeNull();
    expect(within(presentation).queryByRole("link", { name: "history-evidence.pdf" })).not.toBeInTheDocument();
    assertHistoryReadOnly(harness, presentation);
  });

  it("AC-36 T-36: pending history announces loading without empty flash, then renders server events", async () => {
    const fixture = completedHistoryFixture(), controlled = controlledHistoryResponse(fixture.events);
    const harness = installHistoryFetch({ fixture, response: () => controlled.settled });
    const { presentation } = await openHistory(harness);
    expect(within(presentation).getByRole("status")).toHaveTextContent(/loading/i);
    expect(within(presentation).queryByText(/no (?:action )?history|no history events/i)).not.toBeInTheDocument();
    expect(within(presentation).queryByText("No previous record")).not.toBeInTheDocument();
    await act(async () => { controlled.finish(); await controlled.settled; });
    expect(await within(presentation).findByText("No previous record")).toBeInTheDocument();
    expect(within(presentation).queryByText(/loading/i)).not.toBeInTheDocument();
  });

  it("AC-36 T-36: successful empty history is distinct from loading and failure without fabricated creation", async () => {
    const harness = installHistoryFetch({ response: async () => jsonResponse(historyPage([], 1, 20)) });
    const { presentation } = await openHistory(harness);
    expect(await within(presentation).findByText(/no (?:action )?history|no history events/i)).toBeInTheDocument();
    expect(within(presentation).queryByText(/loading/i)).not.toBeInTheDocument();
    expect(within(presentation).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(presentation).queryByText("No previous record")).not.toBeInTheDocument();
    expect(within(presentation).queryByText("Created", { exact: true })).not.toBeInTheDocument();
    assertHistoryReadOnly(harness, presentation);
  });

  it("AC-36 T-36: safe history dependency failure offers Retry and replaces failure with authoritative events", async () => {
    const harness = installHistoryFetch({ response: async (attempt, pageNumber, pageSize) => attempt === 1 ? jsonResponse({ error: {
      code: "SERVICE_UNAVAILABLE", message: "Service is temporarily unavailable. Please try again.",
    } }, 503) : jsonResponse(historyPage(completedHistoryFixture().events, pageNumber, pageSize)) });
    const { presentation } = await openHistory(harness);
    expect(await within(presentation).findByRole("alert")).not.toHaveTextContent(/^\s*$/);
    expect(within(presentation).queryByText(/no (?:action )?history|no history events/i)).not.toBeInTheDocument();
    await userEvent.click(within(presentation).getByRole("button", { name: /^(?:retry|try again)$/i }));
    expect(await within(presentation).findByText("No previous record")).toBeInTheDocument();
    expect(within(presentation).queryByRole("alert")).not.toBeInTheDocument();
    expect(harness.historyCalls).toHaveLength(2);
    expect(harness.historyCalls.map(({ url }) => url.search)).toEqual(["?page=1&pageSize=20", "?page=1&pageSize=20"]);
  });

  it("AC-36/45 T-36/55: maps 20/50/100 history pages, renders chronological server pages and resets size changes to page one", async () => {
    const initial: ActionSnapshot = { ...historyInitial(904), description: "History content 1", followUpRequired: false, followUpNote: null, attachmentNotes: null };
    const events = [historyEventFixture("ACTION_CREATED", null, initial, { id: 173, name: "Creator current display name" })];
    for (let version = 2; version <= 61; version += 1) {
      const before = events[events.length - 1]!.after;
      const instant = new Date(Date.parse(initial.createdAt) + (version - 1) * 1000).toISOString();
      const after: ActionSnapshot = { ...before, description: `History content ${version}`, version, updatedAt: instant,
        ...(version === 60 ? { status: "IN_PROGRESS" as const } : {}),
        ...(version === 61 ? { status: "COMPLETED" as const, result: "Pagination lifecycle completion", performedById: 195, completedAt: instant } : {}),
      };
      events.push(historyEventFixture(version === 60 ? "ACTION_STARTED" : version === 61 ? "ACTION_COMPLETED" : "ACTION_EDITED", before, after, version === 61 ? historyCompleter : historyActor));
    }
    const harness = installHistoryFetch({ fixture: { action: historyActionFixture(events[60]!.after), events } });
    const { presentation } = await openHistory(harness);
    await within(presentation).findByText("History content 20");
    const first = within(presentation).getAllByText("History content 1")[0]!, last = within(presentation).getByText("History content 20");
    expect(first.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(within(presentation).queryByText("History content 21")).not.toBeInTheDocument();
    const size = within(presentation).getByRole("combobox", { name: /(?:history|events).*per page|page size/i });
    expect(size).toHaveValue("20");
    expect(within(size).getAllByRole("option").map((option) => option.getAttribute("value"))).toEqual(["20", "50", "100"]);
    await userEvent.click(within(presentation).getByRole("button", { name: /^next$/i }));
    await within(presentation).findByText("History content 40");
    expect(within(presentation).queryByText("History content 1", { exact: true })).not.toBeInTheDocument();
    await userEvent.selectOptions(size, "50");
    await within(presentation).findByText("History content 50");
    expect(within(presentation).getAllByText("History content 1").length).toBeGreaterThan(0);
    await userEvent.click(within(presentation).getByRole("button", { name: /^next$/i }));
    await within(presentation).findByText("History content 61");
    expect(within(presentation).getByRole("button", { name: /^next$/i })).toBeDisabled();
    await userEvent.selectOptions(size, "100");
    await within(presentation).findAllByText("History content 1", { exact: true });
    expect(within(presentation).getByRole("button", { name: /^next$/i })).toBeDisabled();
    expect(harness.historyCalls.map(({ url }) => [url.searchParams.get("page"), url.searchParams.get("pageSize")])).toEqual([
      ["1", "20"], ["2", "20"], ["1", "50"], ["2", "50"], ["1", "100"],
    ]);
    assertHistoryReadOnly(harness, presentation);
  });

  it("AC-36 T-36: history is labelled and keyboard-readable; dialog presentation dismisses and restores trigger focus", async () => {
    const harness = installHistoryFetch();
    const { presentation, trigger } = await openHistory(harness);
    expect(presentation).toHaveAccessibleName(/action history|history for action/i);
    await within(presentation).findByText("No previous record");
    if (presentation.getAttribute("role") === "dialog") {
      expect(presentation).toHaveAttribute("aria-modal", "true");
      await userEvent.keyboard("{Tab}");
      expect(presentation.contains(document.activeElement)).toBe(true);
      await userEvent.keyboard("{Escape}");
      expect(presentation).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
      await userEvent.click(trigger);
      const reopened = await screen.findByRole("dialog", { name: /action history|history for action/i });
      await within(reopened).findByText("No previous record");
      await userEvent.click(within(reopened).getByRole("button", { name: /^(?:close|close history)$/i }));
      expect(reopened).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    } else expect(within(presentation).getByRole("heading", { name: /history/i })).toBeInTheDocument();
    assertHistoryReadOnly(harness, presentation);
  });
});
