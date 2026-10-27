import { canonicalUtc, parseRequesterQuery, requesterDrillDown, requesterFilterNames, requesterPriorities, requesterStatuses } from "./requester-query.js";
import { parseStaffQuery, staffDrillDown, staffFilterNames, staffListExtensions, staffTicketStates, type StaffDescriptor } from "./staff-dashboard-query.js";

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
export async function getCategories(signal?: AbortSignal): Promise<Category[]> {
  const categories = await jsonRequest<unknown>("/api/categories", signal ? { signal } : {}, false, "Unable to load categories");
  if (!Array.isArray(categories)) throw new ApiRequestError("Unable to load categories", 500, "SAFE_FAILURE");
  return categories as Category[];
}
export async function getRelatedSystems(signal?: AbortSignal): Promise<RelatedSystem[]> {
  const systems = await jsonRequest<unknown>(
    "/api/related-systems",
    signal ? { signal } : {},
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

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface AdminUserQuery { search?: string; role?: UserRole }
export interface CreateAdminUserInput {
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  initialPassword: string;
  confirmPassword: string;
}
export interface EditAdminUserInput {
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  expectedUpdatedAt: string;
}

export async function getAdminUsers(query: AdminUserQuery = {}, signal?: AbortSignal): Promise<AdminUser[]> {
  const parameters = new URLSearchParams();
  const search = query.search?.trim();
  if (search) parameters.set("search", search);
  if (query.role) parameters.set("role", query.role);
  const suffix = parameters.size > 0 ? `?${parameters}` : "";
  const response = await jsonRequest<{ items?: unknown }>(`/api/admin/users${suffix}`, { signal });
  if (!Array.isArray(response.items)) throw new ApiRequestError("Unable to load Users", 500, "SAFE_FAILURE");
  return response.items as AdminUser[];
}

export function createAdminUser(input: CreateAdminUserInput): Promise<{ user: AdminUser }> {
  return jsonRequest(
    "/api/admin/users",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
    true,
  );
}

export function updateAdminUser(userId: number, input: EditAdminUserInput): Promise<{ user: AdminUser }> {
  return jsonRequest(
    `/api/admin/users/${userId}`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
    true,
  );
}

export function setAdminInitialPassword(
  userId: number,
  initialPassword: string,
  confirmPassword: string,
): Promise<{ user: AdminUser }> {
  return jsonRequest(
    `/api/admin/users/${userId}/initial-password`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initialPassword, confirmPassword }),
    },
    true,
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
export interface OwnerSummary { id: number; name: string; role: UserRole }
export interface TicketListQuery {
  search?: string;
  categoryId?: number;
  relatedSystemId?: number;
  requestedPriority?: RequestedPriority;
  currentStatus?: TicketStatus;
  itPriority?: RequestedPriority;
  statusGroup?: "active" | "outstanding" | "resolved";
  dashboardWidget?: "outstanding" | "attention" | "recentUpdated" | "recentResolved";
  updatedFrom?: string;
  updatedBefore?: string;
  resolvedFrom?: string;
  resolvedBefore?: string;
  sortBy: TicketSortField | "resolvedAt";
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
  resolvedAt?: string;
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
  for (const name of ["itPriority", "statusGroup", "dashboardWidget", "updatedFrom", "updatedBefore", "resolvedFrom", "resolvedBefore"] as const) {
    if (query[name] !== undefined) parameters.set(name, query[name]);
  }
  parameters.set("sortBy", query.sortBy);
  parameters.set("sortOrder", query.sortOrder);
  parameters.set("page", String(query.page));
  parameters.set("pageSize", String(query.pageSize));
  return jsonRequest<TicketListResponse>(`/api/tickets?${parameters}`, { signal });
}

export interface RequesterDashboardRow {
  id: number;
  ticketNumber: string;
  summary: string;
  currentStatus: TicketStatus;
  requestedPriority: RequestedPriority;
  itPriority: RequestedPriority;
  owner: OwnerSummary | null;
  updatedAt: string;
  resolvedAt?: string;
}
export type RequesterDashboardMetric = "outstanding" | "needsAttention" | "recentUpdated" | "recentResolved";
export interface RequesterDashboardResponse {
  asOf: string;
  timezone: "Asia/Bangkok";
  recentWindow: { from: string; before: string };
  filters: Partial<Record<(typeof requesterFilterNames)[number], string | number | null>>;
  metrics: Record<RequesterDashboardMetric, number>;
  lists: { recentUpdated: RequesterDashboardRow[]; recentResolved: RequesterDashboardRow[] };
  drillDown: Record<RequesterDashboardMetric, { path: string; query: Record<string, string> }>;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function hasKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function isRequesterDashboard(value: unknown): value is RequesterDashboardResponse {
  if (!isRecord(value) || !hasKeys(value, ["asOf", "timezone", "recentWindow", "filters", "metrics", "lists", "drillDown"]) || !canonicalUtc(value.asOf) || value.timezone !== "Asia/Bangkok") return false;
  if (!isRecord(value.recentWindow) || !canonicalUtc(value.recentWindow.from) || !canonicalUtc(value.recentWindow.before) || value.recentWindow.from >= value.recentWindow.before) return false;
  if (!isRecord(value.filters)) return false;
  const filters = new URLSearchParams();
  for (const [name, item] of Object.entries(value.filters)) {
    if (!requesterFilterNames.some((field) => field === name) || (item !== null && typeof item !== "string" && typeof item !== "number")) return false;
    if (item !== null) filters.set(name, String(item));
  }
  if (!parseRequesterQuery(filters, "dashboard").success) return false;
  const metrics = ["outstanding", "needsAttention", "recentUpdated", "recentResolved"];
  if (!isRecord(value.metrics) || !hasKeys(value.metrics, metrics) || Object.values(value.metrics).some((count) => typeof count !== "number" || !Number.isSafeInteger(count) || count < 0)) return false;
  if (!isRecord(value.lists) || !hasKeys(value.lists, ["recentUpdated", "recentResolved"])) return false;
  for (const name of ["recentUpdated", "recentResolved"]) {
    const rows = value.lists[name];
    if (!Array.isArray(rows) || rows.length > 5) return false;
    for (const row of rows) {
      if (!isRecord(row) || !Number.isSafeInteger(row.id) || Number(row.id) <= 0 || typeof row.ticketNumber !== "string" || typeof row.summary !== "string" || !requesterStatuses.some((status) => status === row.currentStatus) || !requesterPriorities.some((priority) => priority === row.requestedPriority) || !requesterPriorities.some((priority) => priority === row.itPriority) || !canonicalUtc(row.updatedAt)) return false;
      if (Object.keys(row).some((key) => !["id", "ticketNumber", "summary", "currentStatus", "requestedPriority", "itPriority", "owner", "updatedAt", "resolvedAt"].includes(key))) return false;
      if ((name === "recentResolved" || row.resolvedAt !== undefined) && !canonicalUtc(row.resolvedAt)) return false;
      if (row.owner !== null && (!isRecord(row.owner) || !hasKeys(row.owner, ["id", "name", "role"]) || !Number.isSafeInteger(row.owner.id) || Number(row.owner.id) <= 0 || typeof row.owner.name !== "string" || !["REQUESTER", "IT_STAFF", "ADMINISTRATOR"].includes(String(row.owner.role)))) return false;
    }
  }
  if (!isRecord(value.drillDown) || !hasKeys(value.drillDown, metrics)) return false;
  for (const descriptor of Object.values(value.drillDown)) {
    if (!isRecord(descriptor) || descriptor.path !== "/api/tickets" || !isRecord(descriptor.query) || Object.values(descriptor.query).some((item) => typeof item !== "string")) return false;
    if (!requesterDrillDown({ path: descriptor.path, query: descriptor.query as Record<string, string> })) return false;
  }
  return true;
}
export async function getRequesterDashboard(query: Record<string, string>, signal?: AbortSignal): Promise<RequesterDashboardResponse> {
  const parameters = new URLSearchParams(query);
  const result: unknown = await jsonRequest(`/api/dashboard/requester${parameters.size ? `?${parameters}` : ""}`, { signal });
  if (!isRequesterDashboard(result)) throw new ApiRequestError("Unable to load Dashboard data. Please try again.", 500, "SAFE_FAILURE");
  return result;
}

export type StaffQueueSortField =
  | "ticketNumber" | "ticketDate" | "updatedAt"
  | "requestedPriority" | "itPriority" | "currentStatus" | "resolvedAt";
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
  statusGroup?: "active" | "outstanding" | "resolved";
  dashboardWidget?: "unassigned" | "mine" | "status" | "itPriority" | "recentUpdated" | "recentResolved";
  widgetStatus?: TicketStatus;
  widgetItPriority?: RequestedPriority;
  updatedFrom?: string; updatedBefore?: string;
  resolvedFrom?: string; resolvedBefore?: string;
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
  resolvedAt?: string;
}
export interface StaffQueueResponse {
  items: StaffQueueItem[];
  counts: { matching: number; unassigned: number; mine: number };
  pagination: TicketListPagination;
}
export interface EligibleAssignee {
  id: number;
  name: string;
  role: "IT_STAFF" | "ADMINISTRATOR";
}
export interface TicketStatusHistory {
  id: number;
  fromStatus: TicketStatus;
  toStatus: TicketStatus;
  reason: string | null;
  actor: OwnerSummary;
  createdAt: string;
}
export interface StaffTicketDetail extends StaffQueueItem {
  description: string;
  createdAt: string;
  allowedStatusTransitions: TicketStatus[];
  statusHistory: TicketStatusHistory[];
}

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
  for (const name of staffListExtensions) if (query[name] !== undefined) parameters.set(name, String(query[name]));
  parameters.set("sortBy", query.sortBy);
  parameters.set("sortOrder", query.sortOrder);
  parameters.set("page", String(query.page));
  parameters.set("pageSize", String(query.pageSize));
  return jsonRequest<StaffQueueResponse>(`/api/staff/tickets?${parameters}`, { signal });
}

export interface StaffDashboardResponse {
  asOf: string;
  timezone: "Asia/Bangkok";
  recentWindow: { from: string; before: string };
  filters: Partial<Record<(typeof staffFilterNames)[number], string | number | null>>;
  metrics: { unassigned: number; mine: number; byStatus: Record<TicketStatus, number>; byItPriority: Record<RequestedPriority, number>;
    recentUpdated: number; recentResolved: number; myActionsByStatus: Record<ActionStatus, number>; myUnfinishedActions: number };
  lists: { recentUpdated: RequesterDashboardRow[]; recentResolved: RequesterDashboardRow[]; myUnfinishedActions: StaffActionResponse["items"] };
  drillDown: { unassigned: StaffDescriptor; mine: StaffDescriptor; byStatus: Record<TicketStatus, StaffDescriptor>;
    byItPriority: Record<RequestedPriority, StaffDescriptor>; recentUpdated: StaffDescriptor; recentResolved: StaffDescriptor;
    myActionsByStatus: Record<ActionStatus, StaffDescriptor>; myUnfinishedActions: StaffDescriptor };
}
function isStaffDashboard(value: unknown): value is StaffDashboardResponse {
  if (!isRecord(value) || !hasKeys(value, ["asOf", "timezone", "recentWindow", "filters", "metrics", "lists", "drillDown"]) ||
      !canonicalUtc(value.asOf) || value.timezone !== "Asia/Bangkok" || !isRecord(value.recentWindow) ||
      !hasKeys(value.recentWindow, ["from", "before"]) || !canonicalUtc(value.recentWindow.from) ||
      !canonicalUtc(value.recentWindow.before) || value.recentWindow.from >= value.recentWindow.before || !isRecord(value.filters)) return false;
  const filters = new URLSearchParams();
  for (const [name, item] of Object.entries(value.filters)) {
    if (!staffFilterNames.some((key) => key === name) || (item !== null && typeof item !== "string" && typeof item !== "number")) return false;
    if (item !== null) filters.set(name, String(item));
  }
  if (!parseStaffQuery(filters, "dashboard").success) return false;
  const metricKeys = ["unassigned", "mine", "byStatus", "byItPriority", "recentUpdated", "recentResolved", "myActionsByStatus", "myUnfinishedActions"];
  const count = (item: unknown) => typeof item === "number" && Number.isSafeInteger(item) && item >= 0;
  const id = (item: unknown) => typeof item === "number" && Number.isSafeInteger(item) && item > 0 && item <= 2_147_483_647;
  const ticketStatus = (item: unknown) => staffTicketStates.some((status) => status === item);
  const statuses = ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
  const bins = (item: unknown, keys: readonly string[]) => isRecord(item) && hasKeys(item, keys) && Object.values(item).every(count);
  if (!isRecord(value.metrics) || !hasKeys(value.metrics, metricKeys) || !bins(value.metrics.byStatus, staffTicketStates) ||
      !bins(value.metrics.byItPriority, requesterPriorities) || !bins(value.metrics.myActionsByStatus, statuses) ||
      ![value.metrics.unassigned, value.metrics.mine, value.metrics.recentUpdated, value.metrics.recentResolved, value.metrics.myUnfinishedActions].every(count)) return false;
  if (!isRecord(value.lists) || !hasKeys(value.lists, ["recentUpdated", "recentResolved", "myUnfinishedActions"])) return false;
  for (const name of ["recentUpdated", "recentResolved"]) {
    const rows = value.lists[name];
    if (!Array.isArray(rows) || rows.length > 5) return false;
    for (const row of rows) {
      if (!isRecord(row) || !id(row.id) || typeof row.ticketNumber !== "string" || typeof row.summary !== "string" || !canonicalUtc(row.updatedAt) ||
          !staffTicketStates.some((status) => status === row.currentStatus) || !requesterPriorities.some((priority) => priority === row.requestedPriority) ||
          !requesterPriorities.some((priority) => priority === row.itPriority) ||
          Object.keys(row).some((key) => !["id", "ticketNumber", "summary", "currentStatus", "requestedPriority", "itPriority", "owner", "updatedAt", "resolvedAt"].includes(key))) return false;
      if (name === "recentResolved" && !canonicalUtc(row.resolvedAt)) return false;
      if (row.resolvedAt !== undefined && !canonicalUtc(row.resolvedAt)) return false;
      if (row.owner !== null && (!isRecord(row.owner) || !hasKeys(row.owner, ["id", "name", "role"]) || !id(row.owner.id) ||
          typeof row.owner.name !== "string" || !["REQUESTER", "IT_STAFF", "ADMINISTRATOR"].includes(String(row.owner.role)))) return false;
    }
  }
  const identity = (item: unknown) => isRecord(item) && hasKeys(item, ["id", "name"]) && id(item.id) && typeof item.name === "string";
  const actionKeys = ["id", "ticketId", "actionAt", "description", "result", "createdBy", "assignee", "performedBy", "status", "followUpRequired", "followUpNote", "attachmentNotes", "cancellationReason", "createdAt", "updatedAt", "completedAt", "cancelledAt", "version"];
  if (!Array.isArray(value.lists.myUnfinishedActions) || value.lists.myUnfinishedActions.length > 5) return false;
  for (const row of value.lists.myUnfinishedActions) {
    if (!isRecord(row) || !hasKeys(row, ["ticket", "action"]) || !isRecord(row.ticket) || !hasKeys(row.ticket, ["id", "ticketNumber", "summary", "currentStatus"]) ||
        !id(row.ticket.id) || typeof row.ticket.ticketNumber !== "string" || typeof row.ticket.summary !== "string" || !ticketStatus(row.ticket.currentStatus) ||
        !isRecord(row.action) || !hasKeys(row.action, actionKeys)) return false;
    const action = row.action;
    if (!id(action.id) || action.ticketId !== row.ticket.id || !identity(action.createdBy) || !identity(action.assignee) ||
        action.performedBy !== null || action.completedAt !== null || action.cancelledAt !== null || action.cancellationReason !== null ||
        !["PLANNED", "IN_PROGRESS"].includes(String(action.status)) || !canonicalUtc(action.actionAt) || !canonicalUtc(action.createdAt) || !canonicalUtc(action.updatedAt) ||
        typeof action.description !== "string" || typeof action.followUpRequired !== "boolean" || !Number.isSafeInteger(action.version) || Number(action.version) < 1 ||
        [action.result, action.followUpNote, action.attachmentNotes].some((item) => item !== null && typeof item !== "string")) return false;
  }
  const descriptor = (item: unknown) => isRecord(item) && hasKeys(item, ["path", "query"]) && typeof item.path === "string" && isRecord(item.query) &&
    Object.values(item.query).every((entry) => typeof entry === "string") && staffDrillDown(item as StaffDescriptor) !== null;
  if (!isRecord(value.drillDown) || !hasKeys(value.drillDown, metricKeys)) return false;
  for (const name of ["unassigned", "mine", "recentUpdated", "recentResolved", "myUnfinishedActions"]) if (!descriptor(value.drillDown[name])) return false;
  for (const [name, keys] of [["byStatus", staffTicketStates], ["byItPriority", requesterPriorities], ["myActionsByStatus", statuses]] as const) {
    const mapping = value.drillDown[name];
    if (!isRecord(mapping) || !hasKeys(mapping, keys) || !Object.values(mapping).every(descriptor)) return false;
  }
  return true;
}
export async function getStaffDashboard(query: Record<string, string>, signal?: AbortSignal): Promise<StaffDashboardResponse> {
  const parameters = new URLSearchParams(query);
  const result: unknown = await jsonRequest(`/api/dashboard/staff${parameters.size ? `?${parameters}` : ""}`, { signal });
  if (!isStaffDashboard(result)) throw new ApiRequestError("Unable to load Dashboard data. Please try again.", 500, "SAFE_FAILURE");
  return result;
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

export async function getStaffTicketDetail(ticketId: number, signal?: AbortSignal): Promise<StaffTicketDetail> {
  return jsonRequest<StaffTicketDetail>(`/api/staff/tickets/${ticketId}`, { signal });
}

function staffMutation(
  ticketId: number,
  path: string,
  method: "POST" | "PATCH",
  body: Record<string, unknown>,
): Promise<{ ticket: StaffQueueItem }> {
  return jsonRequest(
    `/api/staff/tickets/${ticketId}/${path}`,
    { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    true,
  );
}

export function claimStaffTicket(ticketId: number, expectedUpdatedAt: string) {
  return staffMutation(ticketId, "claim", "POST", { expectedUpdatedAt });
}
export function setStaffTicketOwner(ticketId: number, ownerId: number | null, expectedUpdatedAt: string) {
  return staffMutation(ticketId, "owner", "PATCH", { ownerId, expectedUpdatedAt });
}
export function setStaffTicketPriority(ticketId: number, itPriority: RequestedPriority, expectedUpdatedAt: string) {
  return staffMutation(ticketId, "it-priority", "PATCH", { itPriority, expectedUpdatedAt });
}
export function setStaffTicketStatus(
  ticketId: number,
  targetStatus: TicketStatus,
  expectedUpdatedAt: string,
  confirm = false,
  reason: string | null = null,
) {
  return staffMutation(ticketId, "status", "PATCH", { targetStatus, expectedUpdatedAt, confirm, reason });
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
export type InternalNote = PublicComment;
export type InternalNoteResponse = PublicCommentResponse;
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
export async function getInternalNotes(
  ticketId: number,
  page = 1,
  pageSize: 20 | 50 | 100 = 20,
  signal?: AbortSignal,
): Promise<InternalNoteResponse> {
  return jsonRequest<InternalNoteResponse>(
    `/api/staff/tickets/${ticketId}/notes?page=${page}&pageSize=${pageSize}`,
    { signal },
  );
}
export async function addInternalNote(ticketId: number, content: string): Promise<InternalNote> {
  return jsonRequest<InternalNote>(
    `/api/staff/tickets/${ticketId}/notes`,
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


export type ActionStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export interface ActionIdentity { id: number; name: string }
export interface ActionDTO {
  id: number; ticketId: number; actionAt: string; description: string; result: string | null;
  createdBy: ActionIdentity; assignee: ActionIdentity; performedBy: ActionIdentity | null;
  status: ActionStatus; followUpRequired: boolean; followUpNote: string | null;
  attachmentNotes: string | null; cancellationReason: string | null;
  createdAt: string; updatedAt: string; completedAt: string | null; cancelledAt: string | null; version: number;
}
export type ActionSnapshot = Omit<ActionDTO, "createdBy" | "assignee" | "performedBy"> & {
  createdById: number; assigneeId: number; performedById: number | null;
};
export interface ActionHistoryDTO {
  id: number; actionId: number; actor: ActionIdentity;
  event: "ACTION_CREATED" | "ACTION_EDITED" | "ACTION_REASSIGNED" | "ACTION_STARTED" | "ACTION_COMPLETED" | "ACTION_CANCELLED" | "ACTION_CANCELLED_BY_TICKET";
  createdAt: string; actionVersion: number; sourceTicketStatusHistoryId: number | null;
  before: ActionSnapshot | null; after: ActionSnapshot;
}
export interface ActionReadQuery { page?: number; pageSize?: 20 | 50 | 100; status?: ActionStatus }
export interface ActionListResponse { items: ActionDTO[]; pagination: TicketListPagination }
export interface ActionDetailResponse { action: ActionDTO; ticketUpdatedAt: string }
export interface StaffActionQuery extends Omit<StaffQueueQuery, "sortBy" | "sortOrder"> {
  assignee: "me";
  status?: ActionStatus;
  actionStatusGroup?: "unfinished";
  statusGroup?: "active" | "outstanding" | "resolved";
  updatedFrom?: string; updatedBefore?: string;
  resolvedFrom?: string; resolvedBefore?: string;
}
export interface StaffActionResponse {
  items: Array<{ ticket: Pick<StaffQueueItem, "id" | "ticketNumber" | "summary" | "currentStatus">; action: ActionDTO }>;
  pagination: TicketListPagination;
}
export async function getStaffActions(query: StaffActionQuery, signal?: AbortSignal): Promise<StaffActionResponse> {
  const parameters = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined) parameters.set(name, String(value));
  }
  const result = await jsonRequest<StaffActionResponse>(`/api/staff/actions?${parameters}`, { signal });
  if (!Array.isArray(result.items) || !result.pagination) throw new Error("Invalid assigned Actions response.");
  return result;
}
export interface ActionMutationResponse extends ActionDetailResponse { replayed: boolean }
export interface ActionTokens { expectedVersion: number; expectedTicketUpdatedAt: string; clientMutationId: string }
export interface ActionEditFields {
  description?: string; result?: string | null; assigneeId?: number;
  followUpRequired?: boolean; followUpNote?: string | null; attachmentNotes?: string | null;
}
export interface ActionCreateInput {
  description: string; result: string | null; assigneeId: number;
  followUpRequired: boolean; followUpNote: string | null; attachmentNotes: string | null;
  expectedTicketUpdatedAt: string; clientMutationId: string;
}
export type ActionStatusInput = ActionTokens & (
  { targetStatus: "PLANNED" | "IN_PROGRESS" } |
  { targetStatus: "COMPLETED"; confirm: true; result: string } |
  { targetStatus: "CANCELLED"; confirm: true; reason: string }
);

export async function getTicketActions(ticketId: number, query: ActionReadQuery = {}, signal?: AbortSignal): Promise<ActionListResponse> {
  const parameters = new URLSearchParams({ page: String(query.page ?? 1), pageSize: String(query.pageSize ?? 20) });
  if (query.status) parameters.set("status", query.status);
  const result = await jsonRequest<ActionListResponse>(`/api/tickets/${ticketId}/actions?${parameters}`, { signal });
  if (!Array.isArray(result.items) || !result.pagination) throw new Error("Invalid Action list response.");
  return result;
}
export function getTicketAction(ticketId: number, actionId: number, signal?: AbortSignal): Promise<ActionDetailResponse> {
  return jsonRequest(`/api/tickets/${ticketId}/actions/${actionId}`, { signal });
}
export function getActionHistory(ticketId: number, actionId: number, query: Pick<ActionReadQuery, "page" | "pageSize"> = {}, signal?: AbortSignal): Promise<{ items: ActionHistoryDTO[]; pagination: TicketListPagination }> {
  const parameters = new URLSearchParams({ page: String(query.page ?? 1), pageSize: String(query.pageSize ?? 20) });
  return jsonRequest(`/api/tickets/${ticketId}/actions/${actionId}/history?${parameters}`, { signal });
}
export function editAction(ticketId: number, actionId: number, input: ActionTokens & ActionEditFields): Promise<ActionMutationResponse> {
  return jsonRequest(`/api/tickets/${ticketId}/actions/${actionId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  }, true);
}
export function createAction(ticketId: number, input: ActionCreateInput): Promise<ActionMutationResponse> {
  return jsonRequest(`/api/tickets/${ticketId}/actions`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  }, true);
}
export function changeActionStatus(ticketId: number, actionId: number, input: ActionStatusInput): Promise<ActionMutationResponse> {
  return jsonRequest(`/api/tickets/${ticketId}/actions/${actionId}/status`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  }, true);
}
