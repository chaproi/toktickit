import { PrismaClient } from "@prisma/client";
import { configureTestDatabaseEnvironment } from "./testing/test-database.js";

// Lazy singleton: the client is created on first use, not at import time.
// This keeps route modules and tests that don't touch the DB (e.g. /api/health)
// free of database side effects.
let client: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!client) {
    if (process.env.NODE_ENV === "test") {
      configureTestDatabaseEnvironment();
    }
    client = new PrismaClient();
  }
  return client;
}
