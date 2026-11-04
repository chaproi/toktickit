import { PrismaPg } from "@prisma/adapter-pg";
import type { Prisma } from "@prisma/client";
import type { Pool } from "pg";
import { connectionConfiguration } from "../../src/database/connection-configuration.js";
import { withUtcParameters } from "../../src/database/utc-parameters.js";
import { withReleaseRemedy } from "../../src/database/transaction-release.js";
import { transactionError } from "../../src/database/driver-errors.js";
import { configureTestDatabaseEnvironment, resolveTestDatabaseUrl } from "../../src/testing/test-database.js";
import { admissionFactory } from "./write-admission-proof-support.js";
import { deadlineClient } from "./write-admission-client-proof.js";

export function makeAdmissionProofClient(url: string, options: Prisma.PrismaClientOptions = {}) {
  configureTestDatabaseEnvironment();
  resolveTestDatabaseUrl({ testDatabaseUrl: url, developmentDatabaseUrl: process.env.TOKTICKIT_DEVELOPMENT_DATABASE_URL });
  const configured = connectionConfiguration(url), pools: Pool[] = [];
  const events = { acquired: 0, released: 0, removed: 0 };
  const raw = new PrismaPg(configured.pool, { schema: configured.schema });
  const connect = raw.connect.bind(raw);
  raw.connect = async () => {
    const adapter = await connect(), pool = adapter.underlyingDriver(); pools.push(pool);
    pool.on("acquire", () => { events.acquired++; }); pool.on("release", () => { events.released++; }); pool.on("remove", () => { events.removed++; });
    return adapter;
  };
  const factory = withReleaseRemedy(withUtcParameters(admissionFactory(raw, configured.schema)));
  return { ...deadlineClient({ ...options, adapter: factory }, transactionError), pools, events };
}
