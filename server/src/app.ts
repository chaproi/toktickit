import express, { Request, Response } from "express";
import cors from "cors";
import { Prisma } from "@prisma/client";
import { getPrisma } from "./prisma.js";

export const app = express();

app.use(cors());
app.use(express.json());

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

export default app;