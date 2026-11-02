import { type PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { connectionConfiguration } from "./database/connection-configuration.js";
import { deadlineClient } from "./database/transaction-deadline.js";
import { withReleaseRemedy } from "./database/transaction-release.js";
import { transactionError } from "./database/driver-errors.js";
import { withUtcParameters } from "./database/utc-parameters.js";
import { loadClientEnvironment } from "./database/environment.js";
import { configureTestDatabaseEnvironment, resolveTestDatabaseUrl } from "./testing/test-database.js";

// The public client/adapter owns its lazy pool and supports disconnect/reconnect.
// Lab4-only accepted limitation: failed-start waiting metadata may accumulate
// until disconnect; no private cleanup, rotation or memory bound is implied.
export function createPrismaClient<const T extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions>(options?: T): PrismaClient<T> {
  loadClientEnvironment();
  if (process.env.NODE_ENV === "test") configureTestDatabaseEnvironment();
  const { datasources, datasourceUrl, adapter, ...remaining } = options ?? {};
  if (adapter || (datasources?.db?.url && datasourceUrl)) throw new Error("Unsupported candidate client configuration.");
  const url = datasources?.db?.url ?? datasourceUrl ?? process.env.DATABASE_URL;
  if (!url) throw new Error("A PostgreSQL connection configuration is required.");
  if (process.env.NODE_ENV === "test") resolveTestDatabaseUrl({ testDatabaseUrl: url,
    developmentDatabaseUrl: process.env.TOKTICKIT_DEVELOPMENT_DATABASE_URL });
  const configured = connectionConfiguration(url);
  const factory = withReleaseRemedy(withUtcParameters(new PrismaPg(configured.pool, { schema: configured.schema })),
    stage => console.error("Transaction cleanup encountered a secondary failure.", { stage }));
  const { client } = deadlineClient({ ...remaining, adapter: factory }, transactionError);
  // Only datasource/adapter construction changes; options/log event types and
  // the generated models remain those of the same public PrismaClient<T>.
  return client as unknown as PrismaClient<T>;
}
