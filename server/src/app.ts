import multer from "multer";
import {
  MAX_ATTACHMENT_SIZE_BYTES,
} from "./attachments/attachment-validation.js";
import {
  uploadAttachmentForRequester,
} from "./attachments/attachment-service.js";
import {
  StorageUnavailableError,
} from "./attachments/attachment-storage.js";
import express, { Request, Response } from "express";
import cors from "cors";
import { Prisma } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { createTicketForRequester } from "./tickets/ticket-service.js";
import { validateCreateTicketInput } from "./tickets/ticket-validation.js";

export const app = express();

app.use(cors());
app.use(express.json());

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_ATTACHMENT_SIZE_BYTES,
    files: 1,
  },
}).single("file");

function isDatabaseUnavailableError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return ["P1001", "P1002", "P1008", "P1017"].includes(error.code);
  }

  return false;
}

function sendDatabaseError(
  res: Response,
  error: unknown,
  operation: string,
): void {
  console.error(`Database error while ${operation}:`, error);

  if (isDatabaseUnavailableError(error)) {
    res.status(503).json({
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Service is temporarily unavailable. Please try again.",
      },
    });
    return;
  }

  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong. Please try again.",
    },
  });
}

app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    service: "TokTickIT API",
  });
});

app.get("/api/categories", async (_req: Request, res: Response) => {
  try {
    const categories = await getPrisma().category.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        id: "asc",
      },
    });

    res.status(200).json(categories);
  } catch (error) {
    sendDatabaseError(res, error, "fetching categories");
  }
});

app.get("/api/related-systems", async (_req: Request, res: Response) => {
  try {
    const relatedSystems = await getPrisma().relatedSystem.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    res.status(200).json(relatedSystems);
  } catch (error) {
    sendDatabaseError(res, error, "fetching related systems");
  }
});

app.get(
  "/api/development-requesters",
  async (_req: Request, res: Response) => {
    try {
      const requesters = await getPrisma().developmentRequester.findMany({
        where: {
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          email: true,
        },
        orderBy: {
          name: "asc",
        },
      });

      res.status(200).json(requesters);
    } catch (error) {
      sendDatabaseError(res, error, "fetching development requesters");
    }
  },
);

app.post("/api/tickets", async (req: Request, res: Response) => {
  const requesterHeader = req.header(
    "X-Development-Requester-Id",
  );
  const requesterId = Number(requesterHeader);

  if (
    !requesterHeader ||
    !Number.isInteger(requesterId) ||
    requesterId <= 0
  ) {
    res.status(400).json({
      error: {
        code: "REQUESTER_REQUIRED",
        message:
          "A valid Development Requester is required.",
      },
    });
    return;
  }

  const validation = validateCreateTicketInput(req.body);

  if (!validation.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message:
          "Please correct the highlighted fields.",
        fields: validation.fields,
      },
    });
    return;
  }

  try {
    const result = await createTicketForRequester(
      requesterId,
      validation.data,
    );

    if (result.kind === "invalid-requester") {
      res.status(400).json({
        error: {
          code: "INVALID_REQUESTER",
          message:
            "The selected Development Requester is invalid.",
        },
      });
      return;
    }

    if (result.kind === "invalid-reference") {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Please correct the highlighted fields.",
          fields: result.fields,
        },
      });
      return;
    }

    if (result.kind === "idempotency-conflict") {
      res.status(409).json({
        error: {
          code: "IDEMPOTENCY_CONFLICT",
          message:
            "This submission identifier has already been used with different Ticket data.",
        },
      });
      return;
    }

    const { ticket } = result;

    const responseTicket = {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      ticketDate: ticket.ticketDate,
      requester: ticket.requester,
      category: ticket.category,
      relatedSystem: ticket.relatedSystem,
      requestedPriority: ticket.requestedPriority,
      currentStatus: ticket.currentStatus,
      summary: ticket.summary,
      description: ticket.description,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    };

    res
      .status(result.kind === "created" ? 201 : 200)
      .json({
        ticket: responseTicket,
        replayed: result.kind === "replayed",
      });
  } catch (error) {
    sendDatabaseError(res, error, "creating a Ticket");
  }
});
app.post(
  "/api/tickets/:ticketId/attachments",
  (req: Request, res: Response) => {
    const requesterHeader = req.header(
      "X-Development-Requester-Id",
    );
    const requesterId = Number(requesterHeader);
    const ticketId = Number(req.params.ticketId);

    if (
      !requesterHeader ||
      !Number.isInteger(requesterId) ||
      requesterId <= 0
    ) {
      res.status(400).json({
        error: {
          code: "REQUESTER_REQUIRED",
          message:
            "A valid Development Requester is required.",
        },
      });
      return;
    }

    if (
      !Number.isInteger(ticketId) ||
      ticketId <= 0
    ) {
      res.status(400).json({
        error: {
          code: "INVALID_TICKET_ID",
          message:
            "Ticket identifier must be a positive integer.",
        },
      });
      return;
    }

    attachmentUpload(
      req,
      res,
      async (uploadError: unknown) => {
        if (uploadError) {
          if (
            uploadError instanceof multer.MulterError &&
            uploadError.code === "LIMIT_FILE_SIZE"
          ) {
            res.status(413).json({
              error: {
                code: "ATTACHMENT_TOO_LARGE",
                message:
                  "Each attachment must be 5 MB or smaller.",
              },
            });
            return;
          }

          res.status(400).json({
            error: {
              code: "INVALID_MULTIPART_REQUEST",
              message:
                "Upload one file using the file field.",
            },
          });
          return;
        }

        if (!req.file) {
          res.status(400).json({
            error: {
              code: "FILE_REQUIRED",
              message: "Please select a file.",
            },
          });
          return;
        }

        try {
          const result =
            await uploadAttachmentForRequester(
              requesterId,
              ticketId,
              {
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
                buffer: req.file.buffer,
              },
            );
          if (result.kind === "invalid-requester") {
            res.status(400).json({
              error: {
                code: "INVALID_REQUESTER",
                message:
                  "The selected Development Requester is invalid.",
              },
            });
            return;
          }
          if (result.kind === "not-found") {
            res.status(404).json({
              error: {
                code: "TICKET_NOT_FOUND",
                message: "Ticket not found.",
              },
            });
            return;
          }

          if (result.kind === "invalid-file") {
            const statusByCode = {
              FILE_REQUIRED: 400,
              ATTACHMENT_LIMIT_REACHED: 409,
              ATTACHMENT_TOO_LARGE: 413,
              UNSUPPORTED_ATTACHMENT_TYPE: 415,
            } as const;

            res
              .status(
                statusByCode[result.validation.code],
              )
              .json({
                error: {
                  code: result.validation.code,
                  message:
                    result.validation.message,
                },
              });
            return;
          }

          res.status(201).json(
            result.attachment,
          );
        } catch (error) {
          if (
            error instanceof StorageUnavailableError
          ) {
            console.error(
              "Attachment storage unavailable:",
              error,
            );

            res.status(503).json({
              error: {
                code: "STORAGE_UNAVAILABLE",
                message:
                  "Attachment storage is temporarily unavailable. Please try again.",
              },
            });
            return;
          }

          sendDatabaseError(
            res,
            error,
            "uploading an Attachment",
          );
        }
      },
    );
  },
);
export default app;