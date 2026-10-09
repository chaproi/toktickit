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
