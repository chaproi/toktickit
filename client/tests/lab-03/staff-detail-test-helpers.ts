import { vi } from "vitest";
import type {
  Attachment,
  EligibleAssignee,
  PublicCommentResponse,
  StaffTicketDetail,
} from "../../src/api.js";
import { authResponse, jsonResponse, requestUrl } from "./test-helpers.js";

export const staffUser = {
  id: 91,
  name: "Workflow Staff",
  email: "workflow.staff@example.test",
  role: "IT_STAFF" as const,
  mustChangePassword: false,
};

export const detail: StaffTicketDetail = {
  id: 501,
  ticketNumber: "TKT-2026-00501",
  ticketDate: "2026-09-21T08:00:00.000Z",
  requester: { id: 81, name: "Rina Requester", email: "rina@example.test" },
  category: { id: 1, name: "Network" },
  relatedSystem: { id: 2, name: "VPN" },
  requestedPriority: "MEDIUM",
  itPriority: "HIGH",
  currentStatus: "IN_PROGRESS",
  owner: null,
  summary: "VPN connection drops",
  description: "The VPN disconnects during long calls.",
  requesterResolutionIndicatedAt: "2026-09-21T09:00:00.000Z",
  createdAt: "2026-09-21T08:00:00.000Z",
  updatedAt: "2026-09-21T10:00:00.000Z",
  allowedStatusTransitions: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  statusHistory: [{
    id: 1,
    fromStatus: "OPEN",
    toStatus: "IN_PROGRESS",
    reason: null,
    actor: { id: 91, name: "Workflow Staff", role: "IT_STAFF" },
    createdAt: "2026-09-21T09:30:00.000Z",
  }],
};

export function installStaffDetailFetch(options: {
  ticket?: StaffTicketDetail;
  detailResponse?: (ticketId: number) => Promise<Response>;
  mutation?: (url: URL, init?: RequestInit) => Promise<Response>;
  attachments?: Attachment[];
  assignees?: EligibleAssignee[];
  commentsResponse?: (page: number) => Promise<Response>;
  notesResponse?: (page: number) => Promise<Response>;
} = {}) {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const ticket = options.ticket ?? detail;
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    calls.push({ url, init });
    if (url.pathname === "/api/auth/me") return jsonResponse(authResponse(staffUser));
    if (init?.method && init.method !== "GET") {
      return options.mutation?.(url, init) ?? jsonResponse({ ticket });
    }
    const detailMatch = /^\/api\/staff\/tickets\/(\d+)$/u.exec(url.pathname);
    if (detailMatch) {
      return options.detailResponse?.(Number(detailMatch[1])) ?? jsonResponse(ticket);
    }
    if (url.pathname === "/api/staff/assignees") return jsonResponse({
      items: options.assignees ?? [
        { id: 91, name: "Workflow Staff", role: "IT_STAFF" },
        { id: 92, name: "Workflow Administrator", role: "ADMINISTRATOR" },
      ],
    });
    if (url.pathname.endsWith("/attachments")) return jsonResponse({ items: options.attachments ?? [{
      id: 41, ticketId: ticket.id, originalFilename: "evidence.pdf",
      mimeType: "application/pdf", sizeBytes: 1000, isRemoved: false,
      createdAt: "2026-09-21T08:30:00.000Z", removedAt: null, removalReason: null,
    }] });
    if (url.pathname.endsWith("/comments")) return options.commentsResponse?.(
      Number(url.searchParams.get("page") ?? "1"),
    ) ?? jsonResponse({
      items: [{ id: 51, ticketId: ticket.id, author: ticket.requester, content: "Public update", createdAt: "2026-09-21T09:10:00.000Z" }],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, hasPreviousPage: false, hasNextPage: false },
    });
    if (url.pathname.endsWith("/notes")) return options.notesResponse?.(
      Number(url.searchParams.get("page") ?? "1"),
    ) ?? jsonResponse({
      items: [{ id: 61, ticketId: ticket.id, author: { id: 91, name: "Workflow Staff", role: "IT_STAFF" }, content: "Private diagnosis", createdAt: "2026-09-21T09:20:00.000Z" }],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, hasPreviousPage: false, hasNextPage: false },
    });
    if (url.pathname.includes("/attachments/") && url.pathname.endsWith("/content")) {
      return new Response(new Blob(["file"]), { status: 200 });
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  vi.stubGlobal("fetch", mock);
  return { calls, mock };
}
