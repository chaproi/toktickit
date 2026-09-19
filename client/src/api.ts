const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface Category { id: number; name: string }
export interface RelatedSystem { id: number; name: string }
export type UserRole = "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR";
export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  mustChangePassword: boolean;
}
export interface AuthenticationResponse {
  user: AuthUser;
  session: { expiresAt: string };
}
export interface HealthStatus { status: string; service: string }
export interface SystemStatus { online: boolean; categories: Category[] }

interface ErrorResponse {
  error?: {
    code?: string;
    message?: string;
    fields?: Record<string, string>;
    retryAfterSeconds?: number;
  };
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly fields?: Record<string, string>,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

function csrfToken(): string | undefined {
  for (const segment of document.cookie.split(";")) {
    const [name, ...value] = segment.trim().split("=");
    if (name === "toktickit_csrf") return decodeURIComponent(value.join("="));
  }
  return undefined;
}

async function apiFetch(
  path: string,
  init: RequestInit = {},
  unsafe = false,
  notifyOnUnauthorized = true,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (unsafe) {
    const token = csrfToken();
    if (token) headers.set("X-CSRF-Token", token);
  }
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (response.status === 401 && notifyOnUnauthorized && path !== "/api/auth/login") {
    window.dispatchEvent(new Event("toktickit:auth-expired"));
  }
  return response;
}

async function requestError(response: Response, fallback: string): Promise<ApiRequestError> {
  const body = await response.json().catch(() => null) as ErrorResponse | null;
  return new ApiRequestError(
    body?.error?.message ?? fallback,
    response.status,
    body?.error?.code,
    body?.error?.fields,
    body?.error?.retryAfterSeconds,
  );
}

async function jsonRequest<T>(
  path: string,
  init: RequestInit = {},
  unsafe = false,
  fallback = "Something went wrong. Please try again.",
): Promise<T> {
  const response = await apiFetch(path, init, unsafe);
  if (!response.ok) throw await requestError(response, fallback);
  return await response.json() as T;
}

export async function checkHealth(): Promise<HealthStatus> {
  return jsonRequest<HealthStatus>("/api/health", {}, false, "Backend is unavailable");
}
export async function getCategories(): Promise<Category[]> {
  const categories = await jsonRequest<unknown>("/api/categories", {}, false, "Unable to load categories");
  if (!Array.isArray(categories)) throw new ApiRequestError("Unable to load categories", 500, "SAFE_FAILURE");
  return categories as Category[];
}
export async function getRelatedSystems(): Promise<RelatedSystem[]> {
  const systems = await jsonRequest<unknown>(
    "/api/related-systems",
    {},
    false,
    "Unable to load Related Systems",
  );
  if (!Array.isArray(systems)) throw new ApiRequestError("Unable to load Related Systems", 500, "SAFE_FAILURE");
  return systems as RelatedSystem[];
}
export async function checkSystem(): Promise<SystemStatus> {
  await checkHealth();
  return { online: true, categories: await getCategories() };
}

export async function getCurrentUser(): Promise<AuthenticationResponse> {
  const response = await apiFetch("/api/auth/me", {}, false, false);
  if (!response.ok) {
    throw await requestError(response, "Unable to load the current User.");
  }
  return await response.json() as AuthenticationResponse;
}
export async function login(email: string, password: string): Promise<AuthenticationResponse> {
  return jsonRequest<AuthenticationResponse>(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    },
    false,
    "Unable to sign in. Please try again.",
  );
}
export async function logout(): Promise<void> {
  const response = await apiFetch("/api/auth/logout", { method: "POST" }, true);
  if (!response.ok) throw await requestError(response, "Unable to complete logout safely.");
}
export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<AuthenticationResponse> {
  return jsonRequest<AuthenticationResponse>(
    "/api/auth/change-password",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    true,
    "Unable to change the password. Please try again.",
  );
}

export type RequestedPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TicketStatus =
  | "NEW" | "OPEN" | "IN_PROGRESS" | "WAITING_FOR_REQUESTER"
  | "RESOLVED" | "CLOSED" | "REOPENED" | "CANCELLED";
export type TicketSortField =
  | "ticketNumber" | "ticketDate" | "updatedAt" | "summary" | "requestedPriority";
export type TicketSortOrder = "asc" | "desc";
export type TicketPageSize = 10 | 25 | 50;
export interface OwnerSummary { id: number; name: string; role: "IT_STAFF" | "ADMINISTRATOR" }
export interface TicketListQuery {
  search?: string;
  categoryId?: number;
  relatedSystemId?: number;
  requestedPriority?: RequestedPriority;
  currentStatus?: TicketStatus;
  sortBy: TicketSortField;
  sortOrder: TicketSortOrder;
  page: number;
  pageSize: TicketPageSize;
}
export interface TicketListItem {
  id: number;
  ticketNumber: string;
  ticketDate: string;
  requester: { id: number; name: string };
  category: Category;
  relatedSystem: RelatedSystem;
  requestedPriority: RequestedPriority;
  itPriority: RequestedPriority;
  currentStatus: TicketStatus;
  owner: OwnerSummary | null;
  summary: string;
  createdAt: string;
  updatedAt: string;
}
export interface TicketListPagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}
export interface TicketListResponse {
  items: TicketListItem[];
  pagination: TicketListPagination;
}
export interface CreateTicketInput {
  clientSubmissionId: string;
  categoryId: number;
  relatedSystemId: number;
  requestedPriority: RequestedPriority;
  summary: string;
  description: string;
}
export interface TicketDetail extends TicketListItem {
  description: string;
  requesterResolutionIndicatedAt: string | null;
}
export type CreatedTicket = TicketDetail;
export interface CreateTicketResponse { ticket: CreatedTicket; replayed: boolean }

export async function createTicket(input: CreateTicketInput): Promise<CreateTicketResponse> {
  return jsonRequest<CreateTicketResponse>(
    "/api/tickets",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    true,
    "Unable to create the Ticket. Please try again.",
  );
}

export async function getTickets(
  query: TicketListQuery,
  signal?: AbortSignal,
): Promise<TicketListResponse> {
  const parameters = new URLSearchParams();
  const search = query.search?.trim();
  if (search) parameters.set("search", search);
  if (query.categoryId !== undefined) parameters.set("categoryId", String(query.categoryId));
  if (query.relatedSystemId !== undefined) parameters.set("relatedSystemId", String(query.relatedSystemId));
  if (query.requestedPriority !== undefined) parameters.set("requestedPriority", query.requestedPriority);
  if (query.currentStatus !== undefined) parameters.set("currentStatus", query.currentStatus);
  parameters.set("sortBy", query.sortBy);
  parameters.set("sortOrder", query.sortOrder);
  parameters.set("page", String(query.page));
  parameters.set("pageSize", String(query.pageSize));
  return jsonRequest<TicketListResponse>(`/api/tickets?${parameters}`, { signal });
}

export type StaffQueueSortField =
  | "ticketNumber" | "ticketDate" | "updatedAt"
  | "requestedPriority" | "itPriority" | "currentStatus";
export interface StaffQueueQuery {
  search?: string;
  categoryId?: number;
  relatedSystemId?: number;
  requestedPriority?: RequestedPriority;
  itPriority?: RequestedPriority;
  currentStatus?: TicketStatus;
  owner?: "unassigned" | "me" | number;
  sortBy: StaffQueueSortField;
  sortOrder: TicketSortOrder;
  page: number;
  pageSize: TicketPageSize;
}
export interface StaffQueueItem {
  id: number;
  ticketNumber: string;
  ticketDate: string;
  summary: string;
  requester: { id: number; name: string; email: string };
  category: Category;
  relatedSystem: RelatedSystem;
  requestedPriority: RequestedPriority;
  itPriority: RequestedPriority;
  currentStatus: TicketStatus;
  owner: OwnerSummary | null;
  requesterResolutionIndicatedAt: string | null;
  updatedAt: string;
}
export interface StaffQueueResponse {
  items: StaffQueueItem[];
  counts: { matching: number; unassigned: number; mine: number };
  pagination: TicketListPagination;
}
export interface EligibleAssignee extends OwnerSummary {}

export async function getStaffTickets(
  query: StaffQueueQuery,
  signal?: AbortSignal,
): Promise<StaffQueueResponse> {
  const parameters = new URLSearchParams();
  const search = query.search?.trim();
  if (search) parameters.set("search", search);
  if (query.categoryId !== undefined) parameters.set("categoryId", String(query.categoryId));
  if (query.relatedSystemId !== undefined) parameters.set("relatedSystemId", String(query.relatedSystemId));
  if (query.requestedPriority !== undefined) parameters.set("requestedPriority", query.requestedPriority);
  if (query.itPriority !== undefined) parameters.set("itPriority", query.itPriority);
  if (query.currentStatus !== undefined) parameters.set("currentStatus", query.currentStatus);
  if (query.owner !== undefined) parameters.set("owner", String(query.owner));
  parameters.set("sortBy", query.sortBy);
  parameters.set("sortOrder", query.sortOrder);
  parameters.set("page", String(query.page));
  parameters.set("pageSize", String(query.pageSize));
  return jsonRequest<StaffQueueResponse>(`/api/staff/tickets?${parameters}`, { signal });
}

export async function getStaffAssignees(signal?: AbortSignal): Promise<EligibleAssignee[]> {
  const response = await jsonRequest<{ items?: unknown }>(
    "/api/staff/assignees",
    { signal },
  );
  if (!Array.isArray(response.items)) {
    throw new ApiRequestError("Unable to load eligible assignees", 500, "SAFE_FAILURE");
  }
  return response.items as EligibleAssignee[];
}

export async function getTicketDetail(ticketId: number, signal?: AbortSignal): Promise<TicketDetail> {
  return jsonRequest<TicketDetail>(`/api/tickets/${ticketId}`, { signal });
}

export interface Attachment {
  id: number;
  ticketId: number;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByRequesterId: number;
  isRemoved: boolean;
  createdAt: string;
  removedAt: string | null;
  removedByRequesterId: number | null;
  removalReason: string | null;
}
export interface AttachmentListResponse { items: Attachment[] }

export async function uploadAttachment(ticketId: number, file: File): Promise<Attachment> {
  const body = new FormData();
  body.append("file", file);
  return jsonRequest<Attachment>(
    `/api/tickets/${ticketId}/attachments`,
    { method: "POST", body },
    true,
  );
}
export async function getAttachments(
  ticketId: number,
  signal?: AbortSignal,
): Promise<AttachmentListResponse> {
  return jsonRequest<AttachmentListResponse>(
    `/api/tickets/${ticketId}/attachments`,
    { signal },
  );
}
export async function getAttachmentContent(
  ticketId: number,
  attachmentId: number,
  disposition: "inline" | "attachment",
): Promise<Blob> {
  const response = await apiFetch(
    `/api/tickets/${ticketId}/attachments/${attachmentId}/content?disposition=${disposition}`,
  );
  if (!response.ok) throw await requestError(response, "Something went wrong. Please try again.");
  return response.blob();
}
export async function removeAttachment(
  ticketId: number,
  attachmentId: number,
  removalReason: string,
): Promise<Attachment> {
  return jsonRequest<Attachment>(
    `/api/tickets/${ticketId}/attachments/${attachmentId}`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ removalReason }),
    },
    true,
  );
}

export interface PublicComment {
  id: number;
  ticketId: number;
  author: { id: number; name: string; role: UserRole };
  content: string;
  createdAt: string;
}
export interface PublicCommentResponse {
  items: PublicComment[];
  pagination: TicketListPagination;
}
export async function getPublicComments(
  ticketId: number,
  page = 1,
  pageSize: 20 | 50 | 100 = 20,
  signal?: AbortSignal,
): Promise<PublicCommentResponse> {
  return jsonRequest<PublicCommentResponse>(
    `/api/tickets/${ticketId}/comments?page=${page}&pageSize=${pageSize}`,
    { signal },
  );
}
export async function addPublicComment(ticketId: number, content: string): Promise<PublicComment> {
  return jsonRequest<PublicComment>(
    `/api/tickets/${ticketId}/comments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    },
    true,
  );
}
export async function indicateResolution(ticketId: number): Promise<{
  ticketId: number;
  currentStatus: TicketStatus;
  requesterResolutionIndicatedAt: string;
}> {
  return jsonRequest(
    `/api/tickets/${ticketId}/resolution-indication`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    },
    true,
  );
}
