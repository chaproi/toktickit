import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { Prisma, type UserRole } from "@prisma/client";
import { parseActionListQuery, parseActionHistoryQuery, validateActionDetailQuery } from "./actions/action-query.js";
import { listTicketActions, getTicketAction, listTicketActionHistory } from "./actions/action-read-service.js";
import { createTicketAction } from "./actions/action-create-service.js";
import { parseStaffActionQuery } from "./actions/staff-action-query.js";
import { listStaffActions } from "./actions/staff-action-service.js";
import { patchTicketAction, type ActionPatchCommand } from "./actions/action-patch-service.js";
import { validateCreateActionInput, validateEditActionInput, validateActionStatusInput } from "./actions/action-validation.js";
import {
  getAttachmentContentForRequester,
  getAttachmentForRequester,
  listAttachmentsForRequester,
  removeAttachmentForRequester,
  uploadAttachmentForRequester,
} from "./attachments/attachment-service.js";
import { StorageUnavailableError } from "./attachments/attachment-storage.js";
import { MAX_ATTACHMENT_SIZE_BYTES } from "./attachments/attachment-validation.js";
import {
  authRouter,
  authorizeRequest,
  type LiveSession,
} from "./auth/auth-router.js";
import { ConcurrentUpdateError } from "./auth/eligibility-transaction.js";
import { PasswordHashingUnavailableError } from "./auth/password.js";
import { parseAllowedOrigins, validateOriginHeader } from "./auth/origin.js";
import { parseCommentPageQuery } from "./comments/comment-query.js";
import {
  addPublicComment,
  addInternalNote,
  listInternalNotes,
  listPublicComments,
  validateCommentBody,
  validateInternalNoteBody,
} from "./comments/comment-service.js";
import { getPrisma } from "./prisma.js";
import { indicateRequesterResolution } from "./tickets/resolution-indication-service.js";
import { parseStaffQueueQuery, parseTicketListQuery } from "./tickets/ticket-query.js";
import {
  listEligibleAssignees,
  listStaffQueue,
} from "./tickets/staff-queue-service.js";
import {
  changeStaffTicketOwner,
  changeStaffTicketPriority,
  changeStaffTicketStatus,
  claimStaffTicket,
  getStaffTicketDetail,
} from "./tickets/staff-ticket-service.js";
import {
  createTicketForRequester,
  getTicketDetailForRequester,
  listTicketsForRequester,
} from "./tickets/ticket-service.js";
import {
  validateCreateTicketInput,
  validateStaffClaimMutation,
  validateStaffOwnerMutation,
  validateStaffPriorityMutation,
  validateStaffStatusMutation,
} from "./tickets/ticket-validation.js";
import {
  createAdminUser,
  editAdminUser,
  listAdminUsers,
  resetAdminInitialPassword,
} from "./users/admin-user-service.js";
import {
  parseAdminUserQuery,
  validateCreateAdminUser,
  validateEditAdminUser,
  validateInitialPassword,
} from "./users/admin-user-validation.js";

export const app = express();

app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin) return callback(null, false);
    try {
      return callback(
        null,
        validateOriginHeader([origin], parseAllowedOrigins(process.env.AUTH_ALLOWED_ORIGINS)).success,
      );
    } catch {
      return callback(null, false);
    }
  },
}));
app.use(express.json());
app.use(authRouter);

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES, files: 1 },
}).single("file");

function errorBody(code: string, message: string, fields?: Record<string, string>) {
  return { error: { code, message, ...(fields ? { fields } : {}) } };
}

function isDatabaseUnavailableError(error: unknown): boolean {
  if (error instanceof PasswordHashingUnavailableError) return true;
  if (error instanceof Prisma.PrismaClientInitializationError) return true;
  return error instanceof Prisma.PrismaClientKnownRequestError &&
    ["P1001", "P1002", "P1008", "P1017"].includes(error.code);
}

function sendDatabaseError(res: Response, error: unknown, operation: string): void {
  console.error(`Database error while ${operation}.`);
  if (isDatabaseUnavailableError(error)) {
    res.status(503).json(errorBody(
      "SERVICE_UNAVAILABLE",
      "Service is temporarily unavailable. Please try again.",
    ));
    return;
  }
  res.status(500).json(errorBody(
    "INTERNAL_ERROR",
    "Something went wrong. Please try again.",
  ));
}

async function authenticated(
  req: Request,
  res: Response,
  roles: readonly UserRole[],
  unsafe = false,
): Promise<LiveSession | null> {
  try {
    return await authorizeRequest(req, res, { roles, unsafe });
  } catch (error) {
    sendDatabaseError(res, error, "authorizing a request");
    return null;
  }
}

function parsePositiveIdentifier(value: string | undefined): number | null {
  if (!value || !/^[1-9]\d*$/u.test(value)) return null;
  const identifier = Number(value);
  return Number.isSafeInteger(identifier) && identifier <= 2_147_483_647
    ? identifier
    : null;
}

function sendTicketNotFound(res: Response): void {
  res.status(404).json(errorBody("TICKET_NOT_FOUND", "Ticket not found."));
}

function sendAttachmentNotFound(res: Response): void {
  res.status(404).json(errorBody("ATTACHMENT_NOT_FOUND", "Attachment not found."));
}

function sendEligibilityConflict(res: Response): void {
  res.status(409).json(errorBody(
    "CONCURRENT_UPDATE",
    "Your account eligibility changed. Reload and try again.",
  ));
}

function sendConflict(res: Response, code: string, message: string): void {
  res.status(409).json(errorBody(code, message));
}

function sendStaffMutationResult(
  res: Response,
  result: { kind: string; ticket?: unknown },
): void {
  if (result.kind === "success") {
    res.status(200).json({ ticket: result.ticket });
    return;
  }
  if (result.kind === "not-found") {
    sendTicketNotFound(res);
    return;
  }
  if (result.kind === "owner-not-found") {
    res.status(404).json(errorBody("OWNER_NOT_FOUND", "Ticket Owner not found."));
    return;
  }
  const conflicts: Record<string, [string, string]> = {
    "actor-conflict": ["OWNER_ELIGIBILITY_CONFLICT", "Ownership eligibility changed. Reload and try again."],
    "owner-eligibility": ["OWNER_ELIGIBILITY_CONFLICT", "Ownership eligibility changed. Reload and try again."],
    "owner-conflict": ["OWNER_CONFLICT", "This Ticket is already owned by another User."],
    terminal: ["TERMINAL_TICKET", "Terminal Tickets cannot be changed."],
    stale: ["STALE_WRITE", "This Ticket changed. Reload and try again."],
    "owner-not-allowed": ["OWNER_CHANGE_NOT_ALLOWED", "This owner change is not allowed."],
    "status-not-allowed": ["STATUS_TRANSITION_NOT_ALLOWED", "This status transition is not allowed."],
    unchanged: ["STATUS_UNCHANGED", "The Ticket already has that status."],
    confirmation: ["STATUS_CONFIRMATION_REQUIRED", "Confirmation is required for this status."],
    "owner-required": ["STATUS_OWNER_REQUIRED", "Assign an active Ticket Owner first."],
  };
  const [code, message] = conflicts[result.kind] ?? ["STATUS_TRANSITION_NOT_ALLOWED", "This status transition is not allowed."];
  sendConflict(res, code, message);
}

function sendMutationError(res: Response, error: unknown, operation: string): void {
  if (error instanceof ConcurrentUpdateError) {
    sendEligibilityConflict(res);
    return;
  }
  sendDatabaseError(res, error, operation);
}

function sendAdminMutationError(res: Response, error: unknown, operation: string): void {
  if (error instanceof ConcurrentUpdateError) {
    sendConflict(res, "CONCURRENT_UPDATE", "This User changed concurrently. Reload and try again.");
    return;
  }
  sendDatabaseError(res, error, operation);
}

function buildContentDisposition(
  disposition: "inline" | "attachment",
  filename: string,
): string {
  const safeUnicodeName = filename.replace(/[\u0000-\u001f\u007f"\\/]/gu, "_").trim() || "attachment";
  const fallbackName = safeUnicodeName.replace(/[^\x20-\x7e]/gu, "_").trim() || "attachment";
  const encodedName = encodeURIComponent(safeUnicodeName).replace(
    /[!'()*]/gu,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${disposition}; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`;
}

function requesterTicketDto(ticket: {
  id: number;
  ticketNumber: string;
  ticketDate: Date;
  requester: { id: number; name: string };
  category: { id: number; name: string };
  relatedSystem: { id: number; name: string };
  requestedPriority: string;
  itPriority: string;
  currentStatus: string;
  owner: { id: number; name: string; role: UserRole } | null;
  summary: string;
  description: string;
  requesterResolutionIndicatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    ticketDate: ticket.ticketDate,
    requester: ticket.requester,
    category: ticket.category,
    relatedSystem: ticket.relatedSystem,
    requestedPriority: ticket.requestedPriority,
    itPriority: ticket.itPriority,
    currentStatus: ticket.currentStatus,
    owner: ticket.owner,
    summary: ticket.summary,
    description: ticket.description,
    requesterResolutionIndicatedAt: ticket.requesterResolutionIndicatedAt,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}

app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "TokTickIT API" });
});

app.get("/api/categories", async (_req, res) => {
  try {
    const categories = await getPrisma().category.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });
    res.status(200).json(categories);
  } catch (error) {
    sendDatabaseError(res, error, "fetching categories");
  }
});

app.get("/api/related-systems", async (_req, res) => {
  try {
    const systems = await getPrisma().relatedSystem.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    res.status(200).json(systems);
  } catch (error) {
    sendDatabaseError(res, error, "fetching related systems");
  }
});

app.get("/api/admin/users", async (req, res) => {
  const live = await authenticated(req, res, ["ADMINISTRATOR"]);
  if (!live) return;
  const validation = parseAdminUserQuery(req.query as Record<string, unknown>);
  if (!validation.success) {
    res.status(400).json(errorBody(
      "INVALID_QUERY",
      "One or more query parameters are invalid.",
      validation.fields,
    ));
    return;
  }
  try {
    res.status(200).json({ items: await listAdminUsers(validation.data) });
  } catch (error) {
    sendDatabaseError(res, error, "listing Users");
  }
});

app.post("/api/admin/users", async (req, res) => {
  const live = await authenticated(req, res, ["ADMINISTRATOR"], true);
  if (!live) return;
  const validation = validateCreateAdminUser(req.body);
  if (!validation.success) {
    res.status(400).json(errorBody(
      "VALIDATION_ERROR",
      "Please correct the highlighted fields.",
      validation.fields,
    ));
    return;
  }
  try {
    const result = await createAdminUser(live.user.id, validation.data);
    if (result.kind === "success") {
      res.status(201).json({ user: result.user });
      return;
    }
    if (result.kind === "duplicate-email") {
      sendConflict(res, "EMAIL_ALREADY_EXISTS", "A User with this email already exists.");
      return;
    }
    sendConflict(res, "CONCURRENT_UPDATE", "This User changed concurrently. Reload and try again.");
  } catch (error) {
    sendAdminMutationError(res, error, "creating a User");
  }
});

app.patch("/api/admin/users/:userId", async (req, res) => {
  const live = await authenticated(req, res, ["ADMINISTRATOR"], true);
  if (!live) return;
  const userId = parsePositiveIdentifier(req.params.userId);
  if (userId === null) {
    res.status(400).json(errorBody("INVALID_USER_ID", "User identifier must be a positive integer."));
    return;
  }
  const validation = validateEditAdminUser(req.body);
  if (!validation.success) {
    res.status(400).json(errorBody(
      "VALIDATION_ERROR",
      "Please correct the highlighted fields.",
      validation.fields,
    ));
    return;
  }
  try {
    const result = await editAdminUser(live.user.id, userId, validation.data);
    if (result.kind === "success") {
      res.status(200).json({ user: result.user });
      return;
    }
    if (result.kind === "not-found") {
      res.status(404).json(errorBody("USER_NOT_FOUND", "User not found."));
      return;
    }
    const conflicts: Record<string, [string, string]> = {
      "duplicate-email": ["EMAIL_ALREADY_EXISTS", "A User with this email already exists."],
      "self-change": ["SELF_ADMIN_CHANGE_FORBIDDEN", "You cannot deactivate your own account or change your own role."],
      "last-administrator": ["LAST_ACTIVE_ADMIN_REQUIRED", "At least one active Administrator is required."],
      "non-terminal-owner": ["USER_HAS_NON_TERMINAL_TICKETS", "Reassign or unassign this User's non-terminal Tickets first."],
      stale: ["STALE_WRITE", "This User changed. Reload and try again."],
      "actor-conflict": ["CONCURRENT_UPDATE", "This User changed concurrently. Reload and try again."],
    };
    const [code, message] = conflicts[result.kind] ?? conflicts["actor-conflict"]!;
    sendConflict(res, code, message);
  } catch (error) {
    sendAdminMutationError(res, error, "editing a User");
  }
});

app.post("/api/admin/users/:userId/initial-password", async (req, res) => {
  const live = await authenticated(req, res, ["ADMINISTRATOR"], true);
  if (!live) return;
  const userId = parsePositiveIdentifier(req.params.userId);
  if (userId === null) {
    res.status(400).json(errorBody("INVALID_USER_ID", "User identifier must be a positive integer."));
    return;
  }
  const validation = validateInitialPassword(req.body);
  if (!validation.success) {
    res.status(400).json(errorBody(
      "VALIDATION_ERROR",
      "Please correct the highlighted fields.",
      validation.fields,
    ));
    return;
  }
  try {
    const result = await resetAdminInitialPassword(live.user.id, userId, validation.data);
    if (result.kind === "success") {
      res.status(200).json({ user: result.user });
      return;
    }
    if (result.kind === "not-found") {
      res.status(404).json(errorBody("USER_NOT_FOUND", "User not found."));
      return;
    }
    if (result.kind === "self-reset") {
      sendConflict(res, "SELF_INITIAL_PASSWORD_RESET_FORBIDDEN", "Use Change Password to update your own password.");
      return;
    }
    sendConflict(res, "CONCURRENT_UPDATE", "This User changed concurrently. Reload and try again.");
  } catch (error) {
    sendAdminMutationError(res, error, "setting an initial password");
  }
});

app.get("/api/staff/tickets", async (req, res) => {
  const live = await authenticated(req, res, ["IT_STAFF", "ADMINISTRATOR"]);
  if (!live) return;
  const validation = parseStaffQueueQuery(req.query as Record<string, unknown>);
  if (!validation.success) {
    res.status(400).json(errorBody(
      "INVALID_QUERY",
      "One or more query parameters are invalid.",
      validation.fields,
    ));
    return;
  }
  try {
    res.status(200).json(await listStaffQueue(live.user.id, validation.data));
  } catch (error) {
    sendDatabaseError(res, error, "listing the Staff Ticket Queue");
  }
});

app.get("/api/staff/assignees", async (req, res) => {
  const live = await authenticated(req, res, ["IT_STAFF", "ADMINISTRATOR"]);
  if (!live) return;
  const queryNames = Object.keys(req.query);
  if (queryNames.length > 0) {
    res.status(400).json(errorBody(
      "INVALID_QUERY",
      "One or more query parameters are invalid.",
      Object.fromEntries(queryNames.map((name) => [
        name,
        "This query parameter is not supported.",
      ])),
    ));
    return;
  }
  try {
    res.status(200).json({ items: await listEligibleAssignees() });
  } catch (error) {
    sendDatabaseError(res, error, "listing eligible assignees");
  }
});

app.get("/api/staff/tickets/:ticketId", async (req, res) => {
  const live = await authenticated(req, res, ["IT_STAFF", "ADMINISTRATOR"]);
  if (!live) return;
  const ticketId = parsePositiveIdentifier(req.params.ticketId);
  if (ticketId === null) {
    res.status(400).json(errorBody("INVALID_TICKET_ID", "Ticket identifier must be a positive integer."));
    return;
  }
  try {
    const ticket = await getStaffTicketDetail(ticketId);
    if (!ticket) {
      sendTicketNotFound(res);
      return;
    }
    res.status(200).json(ticket);
  } catch (error) {
    sendDatabaseError(res, error, "retrieving Staff Ticket Detail");
  }
});

app.post("/api/staff/tickets/:ticketId/claim", async (req, res) => {
  const live = await authenticated(req, res, ["IT_STAFF", "ADMINISTRATOR"], true);
  if (!live) return;
  const ticketId = parsePositiveIdentifier(req.params.ticketId);
  if (ticketId === null) {
    res.status(400).json(errorBody("INVALID_TICKET_ID", "Ticket identifier must be a positive integer."));
    return;
  }
  const validation = validateStaffClaimMutation(req.body);
  if (!validation.success) {
    res.status(400).json(errorBody("VALIDATION_ERROR", "Please correct the highlighted fields.", validation.fields));
    return;
  }
  try {
    sendStaffMutationResult(res, await claimStaffTicket(live.user.id, ticketId, validation.data.expectedUpdatedAt));
  } catch (error) {
    sendMutationError(res, error, "claiming a Ticket");
  }
});

app.patch("/api/staff/tickets/:ticketId/owner", async (req, res) => {
  const live = await authenticated(req, res, ["IT_STAFF", "ADMINISTRATOR"], true);
  if (!live) return;
  const ticketId = parsePositiveIdentifier(req.params.ticketId);
  if (ticketId === null) {
    res.status(400).json(errorBody("INVALID_TICKET_ID", "Ticket identifier must be a positive integer."));
    return;
  }
  const validation = validateStaffOwnerMutation(req.body);
  if (!validation.success) {
    res.status(400).json(errorBody("VALIDATION_ERROR", "Please correct the highlighted fields.", validation.fields));
    return;
  }
  try {
    sendStaffMutationResult(res, await changeStaffTicketOwner(
      live.user.id,
      ticketId,
      validation.data.ownerId,
      validation.data.expectedUpdatedAt,
    ));
  } catch (error) {
    sendMutationError(res, error, "changing Ticket ownership");
  }
});

app.patch("/api/staff/tickets/:ticketId/it-priority", async (req, res) => {
  const live = await authenticated(req, res, ["IT_STAFF", "ADMINISTRATOR"], true);
  if (!live) return;
  const ticketId = parsePositiveIdentifier(req.params.ticketId);
  if (ticketId === null) {
    res.status(400).json(errorBody("INVALID_TICKET_ID", "Ticket identifier must be a positive integer."));
    return;
  }
  const validation = validateStaffPriorityMutation(req.body);
  if (!validation.success) {
    res.status(400).json(errorBody("VALIDATION_ERROR", "Please correct the highlighted fields.", validation.fields));
    return;
  }
  try {
    sendStaffMutationResult(res, await changeStaffTicketPriority(
      live.user.id,
      ticketId,
      validation.data.itPriority,
      validation.data.expectedUpdatedAt,
    ));
  } catch (error) {
    sendMutationError(res, error, "changing Ticket priority");
  }
});

app.patch("/api/staff/tickets/:ticketId/status", async (req, res) => {
  const live = await authenticated(req, res, ["IT_STAFF", "ADMINISTRATOR"], true);
  if (!live) return;
  const ticketId = parsePositiveIdentifier(req.params.ticketId);
  if (ticketId === null) {
    res.status(400).json(errorBody("INVALID_TICKET_ID", "Ticket identifier must be a positive integer."));
    return;
  }
  const validation = validateStaffStatusMutation(req.body);
  if (!validation.success) {
    res.status(400).json(errorBody("VALIDATION_ERROR", "Please correct the highlighted fields.", validation.fields));
    return;
  }
  try {
    sendStaffMutationResult(res, await changeStaffTicketStatus(
      live.user.id,
      ticketId,
      validation.data.targetStatus,
      validation.data.confirm,
      validation.data.reason,
      validation.data.expectedUpdatedAt,
    ));
  } catch (error) {
    sendMutationError(res, error, "changing Ticket status");
  }
});

app.get("/api/staff/tickets/:ticketId/notes", async (req, res) => {
  const live = await authenticated(req, res, ["IT_STAFF", "ADMINISTRATOR"]);
  if (!live) return;
  const ticketId = parsePositiveIdentifier(req.params.ticketId);
  if (ticketId === null) {
    res.status(400).json(errorBody("INVALID_TICKET_ID", "Ticket identifier must be a positive integer."));
    return;
  }
  const validation = parseCommentPageQuery(req.query as Record<string, unknown>);
  if (!validation.success) {
    res.status(400).json(errorBody("INVALID_QUERY", "One or more query parameters are invalid.", validation.fields));
    return;
  }
  try {
    const result = await listInternalNotes(ticketId, validation.data);
    if (result.kind === "not-found") {
      sendTicketNotFound(res);
      return;
    }
    res.status(200).json({ items: result.items, pagination: result.pagination });
  } catch (error) {
    sendDatabaseError(res, error, "listing Internal Notes");
  }
});

app.post("/api/staff/tickets/:ticketId/notes", async (req, res) => {
  const live = await authenticated(req, res, ["IT_STAFF", "ADMINISTRATOR"], true);
  if (!live) return;
  const ticketId = parsePositiveIdentifier(req.params.ticketId);
  if (ticketId === null) {
    res.status(400).json(errorBody("INVALID_TICKET_ID", "Ticket identifier must be a positive integer."));
    return;
  }
  const validation = validateInternalNoteBody(req.body);
  if (!validation.success) {
    res.status(400).json(errorBody("VALIDATION_ERROR", "Please correct the highlighted fields.", validation.fields));
    return;
  }
  try {
    const result = await addInternalNote(live.user.id, live.user.role as "IT_STAFF" | "ADMINISTRATOR", ticketId, validation.content);
    if (result.kind === "not-found") {
      sendTicketNotFound(res);
      return;
    }
    if (result.kind === "eligibility-conflict") {
      sendEligibilityConflict(res);
      return;
    }
    res.status(201).json(result.note);
  } catch (error) {
    sendMutationError(res, error, "adding an Internal Note");
  }
});

app.get("/api/tickets", async (req, res) => {
  const live = await authenticated(req, res, ["REQUESTER"]);
  if (!live) return;
  const validation = parseTicketListQuery(req.query as Record<string, unknown>);
  if (!validation.success) {
    res.status(400).json(errorBody(
      "INVALID_QUERY",
      "One or more query parameters are invalid.",
      validation.fields,
    ));
    return;
  }
  try {
    const result = await listTicketsForRequester(live.user.id, validation.data);
    if (result.kind === "invalid-requester") {
      res.status(401).json(errorBody("AUTHENTICATION_REQUIRED", "Authentication is required."));
      return;
    }
    res.status(200).json({ items: result.items, pagination: result.pagination });
  } catch (error) {
    sendDatabaseError(res, error, "listing Tickets");
  }
});

app.get("/api/tickets/:ticketId", async (req, res) => {
  const live = await authenticated(req, res, ["REQUESTER"]);
  if (!live) return;
  const ticketId = parsePositiveIdentifier(req.params.ticketId);
  if (ticketId === null) {
    res.status(400).json(errorBody(
      "INVALID_TICKET_ID",
      "Ticket identifier must be a positive integer.",
    ));
    return;
  }
  try {
    const result = await getTicketDetailForRequester(live.user.id, ticketId);
    if (result.kind !== "success") {
      sendTicketNotFound(res);
      return;
    }
    res.status(200).json(result.ticket);
  } catch (error) {
    sendDatabaseError(res, error, "retrieving Ticket Detail");
  }
});

app.post("/api/tickets", async (req, res) => {
  const live = await authenticated(req, res, ["REQUESTER"], true);
  if (!live) return;
  const validation = validateCreateTicketInput(req.body);
  if (!validation.success) {
    res.status(400).json(errorBody(
      "VALIDATION_ERROR",
      "Please correct the highlighted fields.",
      validation.fields,
    ));
    return;
  }
  try {
    const result = await createTicketForRequester(live.user.id, validation.data);
    if (result.kind === "eligibility-conflict") {
      sendEligibilityConflict(res);
      return;
    }
    if (result.kind === "invalid-requester") {
      res.status(401).json(errorBody("AUTHENTICATION_REQUIRED", "Authentication is required."));
      return;
    }
    if (result.kind === "invalid-reference") {
      res.status(400).json(errorBody(
        "VALIDATION_ERROR",
        "Please correct the highlighted fields.",
        result.fields,
      ));
      return;
    }
    if (result.kind === "idempotency-conflict") {
      res.status(409).json(errorBody(
        "IDEMPOTENCY_CONFLICT",
        "This submission identifier has already been used with different Ticket data.",
      ));
      return;
    }
    res.status(result.kind === "created" ? 201 : 200).json({
      ticket: requesterTicketDto(result.ticket),
      replayed: result.kind === "replayed",
    });
  } catch (error) {
    sendMutationError(res, error, "creating a Ticket");
  }
});

app.get("/api/tickets/:ticketId/attachments", async (req, res) => {
  const live = await authenticated(req, res, ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"]);
  if (!live) return;
  const ticketId = parsePositiveIdentifier(req.params.ticketId);
  if (ticketId === null) {
    res.status(400).json(errorBody("INVALID_TICKET_ID", "Ticket identifier must be a positive integer."));
    return;
  }
  try {
    const result = await listAttachmentsForRequester(live.user.id, ticketId, live.user.role);
    if (result.kind !== "success") {
      sendTicketNotFound(res);
      return;
    }
    res.status(200).json({ items: result.attachments });
  } catch (error) {
    sendDatabaseError(res, error, "listing Attachment metadata");
  }
});

app.get("/api/tickets/:ticketId/attachments/:attachmentId", async (req, res) => {
  const live = await authenticated(req, res, ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"]);
  if (!live) return;
  const ticketId = parsePositiveIdentifier(req.params.ticketId);
  const attachmentId = parsePositiveIdentifier(req.params.attachmentId);
  if (ticketId === null || attachmentId === null) {
    res.status(400).json(errorBody(
      ticketId === null ? "INVALID_TICKET_ID" : "INVALID_ATTACHMENT_ID",
      ticketId === null
        ? "Ticket identifier must be a positive integer."
        : "Attachment identifier must be a positive integer.",
    ));
    return;
  }
  try {
    const result = await getAttachmentForRequester(
      live.user.id,
      ticketId,
      attachmentId,
      live.user.role,
    );
    if (result.kind !== "success") {
      sendAttachmentNotFound(res);
      return;
    }
    res.status(200).json(result.attachment);
  } catch (error) {
    sendDatabaseError(res, error, "retrieving Attachment metadata");
  }
});

app.get("/api/tickets/:ticketId/attachments/:attachmentId/content", async (req, res) => {
  const live = await authenticated(req, res, ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"]);
  if (!live) return;
  const ticketId = parsePositiveIdentifier(req.params.ticketId);
  const attachmentId = parsePositiveIdentifier(req.params.attachmentId);
  if (ticketId === null || attachmentId === null) {
    res.status(400).json(errorBody(
      ticketId === null ? "INVALID_TICKET_ID" : "INVALID_ATTACHMENT_ID",
      ticketId === null
        ? "Ticket identifier must be a positive integer."
        : "Attachment identifier must be a positive integer.",
    ));
    return;
  }
  const keys = Object.keys(req.query);
  const value = req.query.disposition;
  const disposition = value === undefined ? "attachment" : value;
  if (keys.some((key) => key !== "disposition") ||
      (disposition !== "inline" && disposition !== "attachment")) {
    res.status(400).json(errorBody(
      "INVALID_DISPOSITION",
      "Disposition must be inline or attachment.",
    ));
    return;
  }
  try {
    const result = await getAttachmentContentForRequester(
      live.user.id,
      ticketId,
      attachmentId,
      live.user.role,
    );
    if (result.kind === "not-found" || result.kind === "invalid-requester") {
      sendAttachmentNotFound(res);
      return;
    }
    if (result.kind === "removed") {
      res.status(410).json(errorBody(
        "ATTACHMENT_REMOVED",
        "This attachment is no longer available.",
      ));
      return;
    }
    res.set({
      "Content-Type": result.attachment.mimeType,
      "Content-Length": String(result.content.length),
      "Content-Disposition": buildContentDisposition(disposition, result.attachment.originalFilename),
      "X-Content-Type-Options": "nosniff",
    });
    res.status(200).send(result.content);
  } catch (error) {
    if (error instanceof StorageUnavailableError) {
      res.status(503).json(errorBody(
        "STORAGE_UNAVAILABLE",
        "Attachment storage is temporarily unavailable. Please try again.",
      ));
      return;
    }
    sendDatabaseError(res, error, "retrieving Attachment content");
  }
});

app.delete("/api/tickets/:ticketId/attachments/:attachmentId", async (req, res) => {
  const live = await authenticated(req, res, ["REQUESTER"], true);
  if (!live) return;
  const ticketId = parsePositiveIdentifier(req.params.ticketId);
  const attachmentId = parsePositiveIdentifier(req.params.attachmentId);
  if (ticketId === null || attachmentId === null) {
    res.status(400).json(errorBody(
      ticketId === null ? "INVALID_TICKET_ID" : "INVALID_ATTACHMENT_ID",
      ticketId === null
        ? "Ticket identifier must be a positive integer."
        : "Attachment identifier must be a positive integer.",
    ));
    return;
  }
  const body = req.body;
  const validObject = body !== null && typeof body === "object" && !Array.isArray(body);
  const removalReason = validObject && typeof body.removalReason === "string"
    ? body.removalReason.trim()
    : "";
  if (!validObject || Object.keys(body).some((key) => key !== "removalReason") ||
      removalReason.length < 5 || removalReason.length > 200) {
    res.status(400).json(errorBody(
      "VALIDATION_ERROR",
      "Please correct the highlighted fields.",
      { removalReason: "Removal reason must contain between 5 and 200 characters." },
    ));
    return;
  }
  try {
    const result = await removeAttachmentForRequester(
      live.user.id,
      ticketId,
      attachmentId,
      removalReason,
    );
    if (result.kind === "eligibility-conflict") {
      sendEligibilityConflict(res);
      return;
    }
    if (result.kind === "not-found" || result.kind === "invalid-requester") {
      sendAttachmentNotFound(res);
      return;
    }
    if (result.kind === "already-removed") {
      res.status(409).json(errorBody(
        "ATTACHMENT_ALREADY_REMOVED",
        "This attachment has already been removed.",
      ));
      return;
    }
    res.status(200).json(result.attachment);
  } catch (error) {
    sendMutationError(res, error, "soft-removing an Attachment");
  }
});

app.post("/api/tickets/:ticketId/attachments", async (req, res) => {
  const live = await authenticated(req, res, ["REQUESTER"], true);
  if (!live) return;
  const ticketId = parsePositiveIdentifier(req.params.ticketId);
  if (ticketId === null) {
    res.status(400).json(errorBody("INVALID_TICKET_ID", "Ticket identifier must be a positive integer."));
    return;
  }
  attachmentUpload(req, res, async (uploadError: unknown) => {
    if (uploadError) {
      if (uploadError instanceof multer.MulterError && uploadError.code === "LIMIT_FILE_SIZE") {
        res.status(413).json(errorBody(
          "ATTACHMENT_TOO_LARGE",
          "Each attachment must be 5 MB or smaller.",
        ));
        return;
      }
      res.status(400).json(errorBody(
        "INVALID_MULTIPART_REQUEST",
        "Upload one file using the file field.",
      ));
      return;
    }
    if (!req.file) {
      res.status(400).json(errorBody("FILE_REQUIRED", "Please select a file."));
      return;
    }
    try {
      const result = await uploadAttachmentForRequester(live.user.id, ticketId, {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        buffer: req.file.buffer,
      });
      if (result.kind === "eligibility-conflict") {
        sendEligibilityConflict(res);
        return;
      }
      if (result.kind === "not-found" || result.kind === "invalid-requester") {
        sendTicketNotFound(res);
        return;
      }
      if (result.kind === "invalid-file") {
        const statusByCode = {
          FILE_REQUIRED: 400,
          ATTACHMENT_LIMIT_REACHED: 409,
          ATTACHMENT_TOO_LARGE: 413,
          UNSUPPORTED_ATTACHMENT_TYPE: 415,
        } as const;
        res.status(statusByCode[result.validation.code]).json(errorBody(
          result.validation.code,
          result.validation.message,
        ));
        return;
      }
      res.status(201).json(result.attachment);
    } catch (error) {
      if (error instanceof StorageUnavailableError) {
        res.status(503).json(errorBody(
          "STORAGE_UNAVAILABLE",
          "Attachment storage is temporarily unavailable. Please try again.",
        ));
        return;
      }
      sendMutationError(res, error, "uploading an Attachment");
    }
  });
});

app.post("/api/tickets/:ticketId/actions", async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  const live = await authenticated(req, res, ["IT_STAFF", "ADMINISTRATOR"], true);
  if (!live) return;
  const ticketId = parsePositiveIdentifier(req.params.ticketId);
  if (ticketId === null) {
    res.status(400).json(errorBody("INVALID_TICKET_ID", "Ticket identifier must be a positive integer."));
    return;
  }
  const validation = validateCreateActionInput(req.body);
  if (!validation.success) {
    res.status(400).json(errorBody("VALIDATION_ERROR", "Please correct the highlighted fields.", validation.fields));
    return;
  }
  try {
    const result = await createTicketAction({ actorId: live.user.id, sessionId: live.session.id,
      tokenHash: live.session.tokenHash, csrfTokenHash: live.session.csrfTokenHash }, ticketId, validation.data);
    if (result.kind === "created") { res.status(201).json(result.response); return; }
    if (result.kind === "replayed") { res.status(200).json({ ...result.response, replayed: true }); return; }
    if (result.kind === "ticket-not-found") { sendTicketNotFound(res); return; }
    if (result.kind === "invalid-assignee") {
      res.status(400).json(errorBody("INVALID_ASSIGNEE", "Please select an active eligible assignee.",
        { assigneeId: "Select an active IT Staff member or Administrator." }));
      return;
    }
    const denials: Record<string, [number, string, string]> = {
      "authentication-required": [401, "AUTHENTICATION_REQUIRED", "Authentication is required."],
      "password-change-required": [403, "PASSWORD_CHANGE_REQUIRED", "Change your initial password before continuing."],
      "role-forbidden": [403, "ROLE_FORBIDDEN", "You do not have permission to perform this action."],
      "csrf-invalid": [403, "CSRF_INVALID", "CSRF validation failed."],
      "assignee-ineligible": [409, "ASSIGNEE_INELIGIBLE", "Assignee eligibility changed. Reload and try again."],
      "duplicate-conflict": [409, "DUPLICATE_REQUEST_CONFLICT", "This mutation identifier was already used for another request."],
      frozen: [409, "TICKET_ACTIONS_LOCKED", "Actions cannot be added to this Ticket in its current status."],
      stale: [409, "STALE_WRITE", "This Ticket changed. Reload and try again."],
    };
    const [status, code, message] = denials[result.kind];
    res.status(status).json(errorBody(code, message));
  } catch (error) {
    if (error instanceof ConcurrentUpdateError) {
      sendConflict(res, "CONCURRENT_UPDATE", "This Ticket changed concurrently. Reload and try again.");
    } else sendDatabaseError(res, error, "creating an Action");
  }
});

for (const operation of ["edit", "status"] as const) {
  const path = `/api/tickets/:ticketId/actions/:actionId${operation === "status" ? "/status" : ""}`;
  app.patch(path, async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const live = await authenticated(req, res, ["IT_STAFF", "ADMINISTRATOR"], true);
    if (!live) return;
    const ticketId = parsePositiveIdentifier(req.params.ticketId);
    const actionId = parsePositiveIdentifier(req.params.actionId);
    if (ticketId === null || actionId === null) {
      res.status(400).json(errorBody(ticketId === null ? "INVALID_TICKET_ID" : "INVALID_ACTION_ID",
        "Ticket and Action identifiers must be positive integers."));
      return;
    }
    let command: ActionPatchCommand;
    if (operation === "edit") {
      const validation = validateEditActionInput(req.body);
      if (!validation.success) {
        res.status(400).json(errorBody("VALIDATION_ERROR", "Please correct the highlighted fields.", validation.fields));
        return;
      }
      command = { kind: "edit", input: validation.data };
    } else {
      const validation = validateActionStatusInput(req.body);
      if (!validation.success) {
        res.status(400).json(errorBody("VALIDATION_ERROR", "Please correct the highlighted fields.", validation.fields));
        return;
      }
      command = { kind: "status", input: validation.data };
    }
    try {
      const result = await patchTicketAction({ actorId: live.user.id, sessionId: live.session.id,
        tokenHash: live.session.tokenHash, csrfTokenHash: live.session.csrfTokenHash }, ticketId, actionId, command);
      if (result.kind === "updated") { res.status(200).json(result.response); return; }
      if (result.kind === "replayed") { res.status(200).json({ ...result.response, replayed: true }); return; }
      if (result.kind === "ticket-not-found") { sendTicketNotFound(res); return; }
      if (result.kind === "action-not-found") {
        res.status(404).json(errorBody("ACTION_NOT_FOUND", "Action not found.")); return;
      }
      if (result.kind === "validation-error") {
        res.status(400).json(errorBody("VALIDATION_ERROR", "Please correct the highlighted fields.", result.fields)); return;
      }
      if (result.kind === "invalid-assignee") {
        res.status(400).json(errorBody("INVALID_ASSIGNEE", "Please select an active eligible assignee.",
          { assigneeId: "Select an active IT Staff member or Administrator." })); return;
      }
      const denials: Record<string, [number, string, string]> = {
        "authentication-required": [401, "AUTHENTICATION_REQUIRED", "Authentication is required."],
        "password-change-required": [403, "PASSWORD_CHANGE_REQUIRED", "Change your initial password before continuing."],
        "role-forbidden": [403, "ROLE_FORBIDDEN", "You do not have permission to perform this action."],
        "csrf-invalid": [403, "CSRF_INVALID", "CSRF validation failed."],
        "assignee-ineligible": [409, "ASSIGNEE_INELIGIBLE", "Assignee eligibility changed. Reload and try again."],
        "duplicate-conflict": [409, "DUPLICATE_REQUEST_CONFLICT", "This mutation identifier was already used for another request."],
        frozen: [409, "TICKET_ACTIONS_LOCKED", "Actions cannot be changed on this Ticket in its current status."],
        stale: [409, "STALE_WRITE", "This Action or Ticket changed. Reload and try again."],
        terminal: [409, "ACTION_TERMINAL", "Terminal Actions cannot be changed."],
        unchanged: [409, "ACTION_UNCHANGED", "The Action has no changes."],
        "status-unchanged": [409, "ACTION_STATUS_UNCHANGED", "The Action already has this status."],
        "invalid-transition": [409, "INVALID_ACTION_TRANSITION", "This Action status transition is not permitted."],
        concurrent: [409, "CONCURRENT_UPDATE", "This Action changed concurrently. Reload and try again."],
      };
      const [status, code, message] = denials[result.kind];
      res.status(status).json(errorBody(code, message));
    } catch (error) {
      if (error instanceof ConcurrentUpdateError) {
        sendConflict(res, "CONCURRENT_UPDATE", "This Action changed concurrently. Reload and try again.");
      } else sendDatabaseError(res, error, "changing an Action");
    }
  });
}

app.get("/api/staff/actions", async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  const live = await authenticated(req, res, ["IT_STAFF", "ADMINISTRATOR"]);
  if (!live) return;
  const validation = parseStaffActionQuery(req.query as Record<string, unknown>);
  if (!validation.success) {
    res.status(400).json(errorBody("INVALID_QUERY", "One or more query parameters are invalid.", validation.fields));
    return;
  }
  try {
    const result = await listStaffActions(live.user.id, validation.data);
    if (result.kind === "invalid-query") {
      res.status(400).json(errorBody("INVALID_QUERY", "One or more query parameters are invalid.", result.fields));
      return;
    }
    res.status(200).json({ items: result.items, pagination: result.pagination });
  } catch (error) { sendDatabaseError(res, error, "listing current-user Actions"); }
});

app.get("/api/tickets/:ticketId/actions", async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  const live = await authenticated(req, res, ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"]);
  if (!live) return;
  const ticketId = parsePositiveIdentifier(req.params.ticketId);
  if (ticketId === null) {
    res.status(400).json(errorBody("INVALID_TICKET_ID", "Ticket identifier must be a positive integer."));
    return;
  }
  const validation = parseActionListQuery(req.query as Record<string, unknown>);
  if (!validation.success) {
    res.status(400).json(errorBody("INVALID_QUERY", "One or more query parameters are invalid.", validation.fields));
    return;
  }
  try {
    const result = await listTicketActions(live.user.id, live.user.role, ticketId, validation.data);
    if (result.kind === "ticket-not-found") { sendTicketNotFound(res); return; }
    res.status(200).json({ items: result.items, pagination: result.pagination });
  } catch (error) { sendDatabaseError(res, error, "listing Actions"); }
});

app.get("/api/tickets/:ticketId/actions/:actionId", async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  const live = await authenticated(req, res, ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"]);
  if (!live) return;
  const ticketId = parsePositiveIdentifier(req.params.ticketId);
  const actionId = parsePositiveIdentifier(req.params.actionId);
  if (ticketId === null || actionId === null) {
    res.status(400).json(errorBody(ticketId === null ? "INVALID_TICKET_ID" : "INVALID_ACTION_ID",
      "Ticket and Action identifiers must be positive integers."));
    return;
  }
  const validation = validateActionDetailQuery(req.query as Record<string, unknown>);
  if (!validation.success) {
    res.status(400).json(errorBody("INVALID_QUERY", "One or more query parameters are invalid.", validation.fields));
    return;
  }
  try {
    const result = await getTicketAction(live.user.id, live.user.role, ticketId, actionId);
    if (result.kind === "ticket-not-found") { sendTicketNotFound(res); return; }
    if (result.kind === "action-not-found") {
      res.status(404).json(errorBody("ACTION_NOT_FOUND", "Action not found."));
      return;
    }
    res.status(200).json({ action: result.action, ticketUpdatedAt: result.ticketUpdatedAt });
  } catch (error) { sendDatabaseError(res, error, "reading an Action"); }
});

app.get("/api/tickets/:ticketId/actions/:actionId/history", async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  const live = await authenticated(req, res, ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"]);
  if (!live) return;
  const ticketId = parsePositiveIdentifier(req.params.ticketId);
  const actionId = parsePositiveIdentifier(req.params.actionId);
  if (ticketId === null || actionId === null) {
    res.status(400).json(errorBody(ticketId === null ? "INVALID_TICKET_ID" : "INVALID_ACTION_ID",
      "Ticket and Action identifiers must be positive integers."));
    return;
  }
  const validation = parseActionHistoryQuery(req.query as Record<string, unknown>);
  if (!validation.success) {
    res.status(400).json(errorBody("INVALID_QUERY", "One or more query parameters are invalid.", validation.fields));
    return;
  }
  try {
    const result = await listTicketActionHistory(live.user.id, live.user.role, ticketId, actionId, validation.data);
    if (result.kind === "ticket-not-found") { sendTicketNotFound(res); return; }
    if (result.kind === "action-not-found") {
      res.status(404).json(errorBody("ACTION_NOT_FOUND", "Action not found."));
      return;
    }
    res.status(200).json({ items: result.items, pagination: result.pagination });
  } catch (error) { sendDatabaseError(res, error, "listing Action history"); }
});

app.get("/api/tickets/:ticketId/comments", async (req, res) => {
  const live = await authenticated(req, res, ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"]);
  if (!live) return;
  const ticketId = parsePositiveIdentifier(req.params.ticketId);
  if (ticketId === null) {
    res.status(400).json(errorBody("INVALID_TICKET_ID", "Ticket identifier must be a positive integer."));
    return;
  }
  const validation = parseCommentPageQuery(req.query as Record<string, unknown>);
  if (!validation.success) {
    res.status(400).json(errorBody(
      "INVALID_QUERY",
      "One or more query parameters are invalid.",
      validation.fields,
    ));
    return;
  }
  try {
    const result = await listPublicComments(
      live.user.id,
      live.user.role,
      ticketId,
      validation.data,
    );
    if (result.kind === "not-found") {
      sendTicketNotFound(res);
      return;
    }
    res.status(200).json({ items: result.items, pagination: result.pagination });
  } catch (error) {
    sendDatabaseError(res, error, "listing Public Comments");
  }
});

app.post("/api/tickets/:ticketId/comments", async (req, res) => {
  const live = await authenticated(
    req,
    res,
    ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"],
    true,
  );
  if (!live) return;
  const ticketId = parsePositiveIdentifier(req.params.ticketId);
  if (ticketId === null) {
    res.status(400).json(errorBody("INVALID_TICKET_ID", "Ticket identifier must be a positive integer."));
    return;
  }
  const validation = validateCommentBody(req.body);
  if (!validation.success) {
    res.status(400).json(errorBody(
      "VALIDATION_ERROR",
      "Please correct the highlighted fields.",
      validation.fields,
    ));
    return;
  }
  try {
    const result = await addPublicComment(
      live.user.id,
      live.user.role,
      ticketId,
      validation.content,
    );
    if (result.kind === "eligibility-conflict") {
      sendEligibilityConflict(res);
      return;
    }
    if (result.kind === "not-found") {
      sendTicketNotFound(res);
      return;
    }
    res.status(201).json(result.comment);
  } catch (error) {
    sendMutationError(res, error, "adding a Public Comment");
  }
});

app.post("/api/tickets/:ticketId/resolution-indication", async (req, res) => {
  const live = await authenticated(req, res, ["REQUESTER"], true);
  if (!live) return;
  const ticketId = parsePositiveIdentifier(req.params.ticketId);
  if (ticketId === null) {
    res.status(400).json(errorBody("INVALID_TICKET_ID", "Ticket identifier must be a positive integer."));
    return;
  }
  const body = req.body;
  if (body === null || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 1 || body.confirm !== true) {
    res.status(400).json(errorBody(
      "VALIDATION_ERROR",
      "Confirmation is required.",
      { confirm: "Confirm must be true." },
    ));
    return;
  }
  try {
    const result = await indicateRequesterResolution(live.user.id, ticketId);
    if (result.kind === "eligibility-conflict") {
      sendEligibilityConflict(res);
      return;
    }
    if (result.kind === "not-found") {
      sendTicketNotFound(res);
      return;
    }
    if (result.kind === "not-allowed") {
      res.status(409).json(errorBody(
        "RESOLUTION_INDICATION_NOT_ALLOWED",
        "This Ticket cannot be marked as appearing resolved in its current state.",
      ));
      return;
    }
    res.status(200).json({
      ticketId: result.ticketId,
      currentStatus: result.currentStatus,
      requesterResolutionIndicatedAt: result.requesterResolutionIndicatedAt,
    });
  } catch (error) {
    sendMutationError(res, error, "recording a resolution indication");
  }
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof SyntaxError && "status" in error &&
      (error as SyntaxError & { status?: number }).status === 400) {
    res.status(400).json(errorBody("VALIDATION_ERROR", "Request body must be valid JSON."));
    return;
  }
  console.error("Unexpected request processing error.");
  res.status(500).json(errorBody(
    "INTERNAL_ERROR",
    "Something went wrong. Please try again.",
  ));
});

export default app;
