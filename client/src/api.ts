const API_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface Category {
  id: number;
  name: string;
}

export interface RelatedSystem {
  id: number;
  name: string;
}

export interface DevelopmentRequester {
  id: number;
  name: string;
  email: string;
}

export interface SystemStatus {
  online: boolean;
  categories: Category[];
}

export interface HealthStatus {
  status: string;
  service: string;
}

export async function checkHealth(): Promise<HealthStatus> {
  const response = await fetch(`${API_URL}/api/health`);

  if (!response.ok) {
    throw new Error("Backend is unavailable");
  }

  return (await response.json()) as HealthStatus;
}

export async function getCategories(): Promise<Category[]> {
  const response = await fetch(`${API_URL}/api/categories`);

  if (!response.ok) {
    throw new Error("Unable to load categories");
  }

  return (await response.json()) as Category[];
}

export async function getRelatedSystems(): Promise<
  RelatedSystem[]
> {
  const response = await fetch(
    `${API_URL}/api/related-systems`,
  );

  if (!response.ok) {
    throw new Error("Unable to load Related Systems");
  }

  return (await response.json()) as RelatedSystem[];
}

export async function getDevelopmentRequesters(): Promise<
  DevelopmentRequester[]
> {
  const response = await fetch(
    `${API_URL}/api/development-requesters`,
  );

  if (!response.ok) {
    throw new Error(
      "Failed to fetch Development Requesters",
    );
  }

  return (await response.json()) as DevelopmentRequester[];
}

// Preserve the Lab 1 system-check behavior.
export async function checkSystem(): Promise<SystemStatus> {
  await checkHealth();

  const categories = await getCategories();

  return {
    online: true,
    categories,
  };
}

export type RequestedPriority =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "URGENT";

export type TicketStatus =
  | "NEW"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "PENDING_REQUESTER"
  | "RESOLVED"
  | "CLOSED"
  | "CANCELLED";

export type TicketSortField =
  | "ticketNumber"
  | "ticketDate"
  | "updatedAt"
  | "summary"
  | "requestedPriority";

export type TicketSortOrder = "asc" | "desc";
export type TicketPageSize = 10 | 25 | 50;

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
  category: Category;
  relatedSystem: RelatedSystem;
  requestedPriority: RequestedPriority;
  currentStatus: TicketStatus;
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

export interface CreatedTicket {
  id: number;
  ticketNumber: string;
  ticketDate: string;
  requester: {
    id: number;
    name: string;
  };
  category: {
    id: number;
    name: string;
  };
  relatedSystem: {
    id: number;
    name: string;
  };
  requestedPriority: RequestedPriority;
  currentStatus: "NEW";
  summary: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTicketResponse {
  ticket: CreatedTicket;
  replayed: boolean;
}

interface ErrorResponse {
  error?: {
    code?: string;
    message?: string;
  };
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export async function createTicket(
  requesterId: number,
  input: CreateTicketInput,
): Promise<CreateTicketResponse> {
  const response = await fetch(`${API_URL}/api/tickets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Development-Requester-Id":
        String(requesterId),
    },
    body: JSON.stringify(input),
  });

  const responseBody = (await response
    .json()
    .catch(() => null)) as
    | CreateTicketResponse
    | ErrorResponse
    | null;

  if (!response.ok) {
    const errorResponse =
      responseBody as ErrorResponse | null;

    throw new ApiRequestError(
      errorResponse?.error?.message ??
      "Unable to create the Ticket. Please try again.",
      response.status,
      errorResponse?.error?.code,
    );
  }

  return responseBody as CreateTicketResponse;
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

export async function uploadAttachment(
  requesterId: number,
  ticketId: number,
  file: File,
): Promise<Attachment> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(
    `${API_URL}/api/tickets/${ticketId}/attachments`,
    {
      method: "POST",
      headers: {
        "X-Development-Requester-Id": String(requesterId),
      },
      body: formData,
    },
  );

  if (!response.ok) {
    throw new Error(`Unable to upload ${file.name}`);
  }

  return (await response.json()) as Attachment;
}

export async function getTickets(
  requesterId: number,
  query: TicketListQuery,
  signal?: AbortSignal,
): Promise<TicketListResponse> {
  const parameters = new URLSearchParams();

  const search = query.search?.trim();
  if (search) {
    parameters.set("search", search);
  }

  if (query.categoryId !== undefined) {
    parameters.set("categoryId", String(query.categoryId));
  }

  if (query.relatedSystemId !== undefined) {
    parameters.set(
      "relatedSystemId",
      String(query.relatedSystemId),
    );
  }

  if (query.requestedPriority !== undefined) {
    parameters.set(
      "requestedPriority",
      query.requestedPriority,
    );
  }

  if (query.currentStatus !== undefined) {
    parameters.set("currentStatus", query.currentStatus);
  }

  parameters.set("sortBy", query.sortBy);
  parameters.set("sortOrder", query.sortOrder);
  parameters.set("page", String(query.page));
  parameters.set("pageSize", String(query.pageSize));

  const response = await fetch(
    `${API_URL}/api/tickets?${parameters.toString()}`,
    {
      headers: {
        "X-Development-Requester-Id": String(requesterId),
      },
      signal,
    },
  );

  const responseBody = (await response
    .json()
    .catch(() => null)) as
    | TicketListResponse
    | ErrorResponse
    | null;

  if (!response.ok) {
    const errorResponse = responseBody as ErrorResponse | null;

    throw new ApiRequestError(
      errorResponse?.error?.message ??
        "Something went wrong. Please try again.",
      response.status,
      errorResponse?.error?.code,
    );
  }

  return responseBody as TicketListResponse;
}
