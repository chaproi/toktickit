import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { Prisma } from "@prisma/client";
import { HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import request from "supertest";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { applyLab3Baseline, applyLaterMigrations, oldTables, query, snapshot,
  verifiedTestTarget, withDisposableSchema } from "./migration-test-fixtures.js";
import { ownedSeaweed, productionStorage } from "./persistent-recovery-test-helpers.js";

// Existing upload compensation contract: Lab2 API section Upload Compensation.
// Natural cold observation is distinct from the controlled database-expiry case.
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nFQAAAAASUVORK5CYII=", "base64");
const tables = Object.fromEntries(Object.entries({ ...oldTables, Action: "id", ActionHistory: "id", MutationReceipt: "id", SeedFixture: "id" })
  .filter(([name]) => !["AuthSession", "LoginThrottle"].includes(name)));
const envKeys = ["DATABASE_URL", "TEST_DATABASE_URL", "TOKTICKIT_DEVELOPMENT_DATABASE_URL", "NODE_ENV",
  "SEAWEEDFS_S3_ENDPOINT", "SEAWEEDFS_BUCKET", "SEAWEEDFS_ACCESS_KEY", "SEAWEEDFS_SECRET_KEY"];
const prior = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
let root: string;
let weed: Awaited<ReturnType<typeof ownedSeaweed>> | undefined;
let adapter: ReturnType<typeof productionStorage> | undefined;
let release!: () => void;
let lifetime: Promise<void> | undefined;
type Context = {
  prisma: ReturnType<typeof getPrisma>; observer: Parameters<Parameters<typeof withDisposableSchema>[1]>[0]; schema: string;
  app: typeof import("../../src/app.js").app; cookie: string; csrf: string; origin: string;
  requesterId: number; categoryId: number; systemId: number; bucket: string;
};
let ctx: Context;
function equal(actual: unknown, expected: unknown, label: string) {
  expect(isDeepStrictEqual(actual, expected), `${label}; domain/object identifiers withheld`).toBe(true);
}

async function initialize() {
  const target = verifiedTestTarget();
  root = mkdtempSync(join(tmpdir(), "toktickit-cold-upload-"));
  const token = randomUUID().replaceAll("-", "");
  const bucket = `toktickit-t31-source-${token}`;
  // Only this new suite opts out: no prewarming before the natural cold request.
  weed = await ownedSeaweed(join(root, "seaweed"), [bucket], { writeReady: false });
  const finished = new Promise<void>(resolve => { release = resolve; });
  let ready!: () => void, failed!: (error: unknown) => void;
  const initialized = new Promise<void>((resolve, reject) => { ready = resolve; failed = reject; });
  lifetime = withDisposableSchema("recovery", async (observer, schema) => {
    await applyLab3Baseline(observer); await applyLaterMigrations(observer);
    const url = new URL(target.databaseUrl); url.searchParams.set("schema", schema);
    process.env.DATABASE_URL = url.toString(); process.env.TEST_DATABASE_URL = url.toString(); process.env.NODE_ENV = "test";
    process.env.SEAWEEDFS_S3_ENDPOINT = weed!.endpoint; process.env.SEAWEEDFS_BUCKET = bucket;
    process.env.SEAWEEDFS_ACCESS_KEY = weed!.credentials.accessKeyId; process.env.SEAWEEDFS_SECRET_KEY = weed!.credentials.secretAccessKey;
    adapter = productionStorage(bucket);
    const prisma = getPrisma();
    const [live] = await prisma.$queryRaw<Array<{ database: string; schema: string }>>`SELECT current_database() AS database,current_schema() AS schema`;
    expect(live.database === target.identity.databaseName && live.schema === schema, "Actual app connection matches exact dedicated owned schema").toBe(true);
    const { app } = await import("../../src/app.js");
    const { createAuthUser, loginRequest, cookieHeader, cookieValue, APPROVED_ORIGIN } = await import("../lab-03/auth-test-helpers.js");
    const owner = await createAuthUser({ email: `cold-upload-${token}@example.test`, role: "REQUESTER" });
    const login = await loginRequest(owner.user.email, owner.password);
    expect(login.status, "Real authentication; response withheld").toBe(200);
    const category = await prisma.category.create({ data: { name: `Cold ${token}` } });
    const system = await prisma.relatedSystem.create({ data: { name: `Cold ${token}` } });
    ctx = { prisma, observer, schema, app, cookie: cookieHeader(login.headers["set-cookie"]), csrf: cookieValue(login.headers["set-cookie"], "toktickit_csrf"),
      origin: APPROVED_ORIGIN, requesterId: owner.user.id, categoryId: category.id, systemId: system.id, bucket };
    ready(); await finished;
  });
  // Attach immediately so partial setup cannot leave an unhandled rejection.
  void lifetime.catch(failed);
  await initialized;
}
let initialization: Promise<void> | undefined;
async function initialized() { await (initialization ??= initialize()); }

afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  vi.restoreAllMocks();
  try { adapter?.close(); await getPrisma().$disconnect(); release?.(); await lifetime; }
  finally {
    try { await weed?.close(); }
    finally {
      for (const key of envKeys) { if (prior[key] === undefined) delete process.env[key]; else process.env[key] = prior[key]; }
      expect(envKeys.every(key => process.env[key] === prior[key]), "Scoped settings restored").toBe(true);
      if (root) {
        expect(resolve(root).startsWith(resolve(tmpdir()) + sep) && basename(root).startsWith("toktickit-cold-upload-")).toBe(true);
        rmSync(root, { recursive: true, force: true }); expect(existsSync(root)).toBe(false);
      }
      console.info("Cold upload cleanup: owned schema/bucket/objects/process/directory removed; clients/settings restored.");
    }
  }
});

async function ticket(label: string) {
  return ctx.prisma.ticket.create({ data: { ticketNumber: `CU-${randomUUID().replaceAll("-", "").slice(0, 12)}`, clientSubmissionId: randomUUID(),
    requesterId: ctx.requesterId, categoryId: ctx.categoryId, relatedSystemId: ctx.systemId,
    summary: `Owned ${label} fixture`, description: "Synthetic private upload context", requestedPriority: "LOW", itPriority: "LOW" } });
}
async function objects() {
  const result = await weed!.client.send(new ListObjectsV2Command({ Bucket: ctx.bucket }));
  expect(result.IsTruncated).not.toBe(true);
  return (result.Contents ?? []).map(value => value.Key!).sort();
}
async function gatesAvailable(ticketId: number) {
  await query(ctx.observer, "BEGIN");
  try {
    return (await query<{ actor: boolean; ticket: boolean }>(ctx.observer,
      "SELECT pg_try_advisory_xact_lock(1,$1::int) AS actor,pg_try_advisory_xact_lock(2,$2::int) AS ticket", [ctx.requesterId, ticketId])).rows[0]!;
  } finally { await query(ctx.observer, "ROLLBACK"); }
}
type ClassifiedFailure = { code: string; expired: boolean; timeoutMs: number | null; engineElapsedMs: number | null; elapsedMs: number };
function classify(error: unknown, elapsedMs: number): ClassifiedFailure {
  const value = error as { code?: unknown; meta?: { error?: unknown; operation?: unknown; timeout?: unknown; timeTaken?: unknown } };
  const code = typeof value?.code === "string" && /^P\d{4}$/.test(value.code) ? value.code : "unclassified";
  // Inspect ONLY the specific engine detail transiently. Never retain or log it.
  // Bare P2028, message-only matches and other transaction causes are not expiry.
  const detail = typeof value?.meta?.error === "string" ? value.meta.error : "";
  // Prisma6's public execution-timeout subtype supplies structured fields;
  // acquisition/closed/unknown P2028 variants do not have this combination.
  const boundedNumber = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n > 0 && n < 120_000;
  const structuredExpiry = code === "P2028" && ["query", "commit", "rollback"].includes(String(value.meta?.operation)) &&
    boundedNumber(value.meta?.timeout) && boundedNumber(value.meta?.timeTaken) && value.meta.timeTaken >= value.meta.timeout;
  const expired = code === "P2028" && (/\bexpired transaction\b/i.test(detail) || structuredExpiry);
  const number = (pattern: RegExp) => { const n = Number(detail.match(pattern)?.[1]); return Number.isSafeInteger(n) && n > 0 && n < 120_000 ? n : null; };
  return { code, expired, timeoutMs: structuredExpiry ? value.meta!.timeout as number : expired ? number(/timeout.{0,100}?(\d+)\s*ms/i) : null,
    engineElapsedMs: structuredExpiry ? value.meta!.timeTaken as number : expired ? number(/however\s+(\d+)\s*ms/i) : null, elapsedMs };
}
function observeUpload(ticketId: number, controlledExpiry: boolean) {
  const evidence = { attempts: 0, failure: null as ClassifiedFailure | null, storeMs: 0, putSucceeded: false,
    storageFailed: false, removals: 0, expiryObservedInDatabase: false, gatesHeld: false, key: "" };
  let backend = 0;
  const realTransaction = ctx.prisma.$transaction.bind(ctx.prisma);
  vi.spyOn(ctx.prisma, "$transaction").mockImplementation((...args: unknown[]) => {
    if (typeof args[0] !== "function" || (args[1] as { isolationLevel?: string })?.isolationLevel !== "Serializable") return Reflect.apply(realTransaction, ctx.prisma, args);
    const callback = args[0] as (tx: Prisma.TransactionClient) => Promise<unknown>;
    const started = Date.now(); evidence.attempts++;
    return Reflect.apply(realTransaction, ctx.prisma, [async (tx: Prisma.TransactionClient) => {
      const [identity] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      backend = identity.pid;
      return callback(tx);
    }, ...args.slice(1)]).catch((error: unknown) => { evidence.failure = classify(error, Date.now() - started); throw error; });
  });
  const realStore = adapter!.storage.store.bind(adapter!.storage), realRemove = adapter!.storage.remove.bind(adapter!.storage);
  vi.spyOn(adapter!.storage, "store").mockImplementation(async input => {
    evidence.key = input.storageKey;
    const gates = await gatesAvailable(ticketId); evidence.gatesHeld = !gates.actor && !gates.ticket;
    const started = Date.now();
    try { await realStore(input); evidence.putSucceeded = true; }
    catch (error) { evidence.storageFailed = true; throw error; }
    finally { evidence.storeMs = Date.now() - started; }
    if (controlledExpiry) {
      // A controlled slow-return boundary AFTER a real successful persistent PUT.
      // Release on observed PostgreSQL rollback, not an arbitrary sleep/delay.
      await expect.poll(async () => {
        const result = await query<{ active: number }>(ctx.observer,
          "SELECT count(*)::int AS active FROM pg_stat_activity WHERE pid=$1 AND xact_start IS NOT NULL", [backend]);
        return result.rows[0]!.active;
      }, { timeout: 7_000, interval: 50 }).toBe(0);
      evidence.expiryObservedInDatabase = true;
    }
  });
  vi.spyOn(adapter!.storage, "remove").mockImplementation(async key => {
    expect(key === evidence.key, "Compensation addresses exactly the successful attempt's object").toBe(true);
    await realRemove(key); evidence.removals++;
  });
  return evidence;
}
function upload(id: number, name: string) {
  return request(ctx.app).post(`/api/tickets/${id}/attachments`).set("Cookie", ctx.cookie)
    .set("Origin", ctx.origin).set("X-CSRF-Token", ctx.csrf).attach("file", png, { filename: name, contentType: "image/png" });
}
async function failedUploadPreserves(id: number, before: Awaited<ReturnType<typeof snapshot>>, objectKeys: string[], evidence: ReturnType<typeof observeUpload>) {
  expect(evidence.attempts).toBe(1); expect(evidence.gatesHeld).toBe(true);
  expect(evidence.putSucceeded).toBe(true); expect(evidence.storageFailed).toBe(false); expect(evidence.removals).toBe(1);
  expect(evidence.failure?.code).toBe("P2028"); expect(evidence.failure?.expired).toBe(true);
  equal(await snapshot(ctx.observer, ctx.schema, before, tables), before, "Metadata rollback preserves exact domain, parent time, histories and receipts");
  equal(await objects(), objectKeys, "Compensation leaves no orphan and preserves unrelated committed objects");
  let absent = false;
  try { await weed!.client.send(new HeadObjectCommand({ Bucket: ctx.bucket, Key: evidence.key })); }
  catch (error) { absent = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404; }
  expect(absent, "Independent persistent-store HEAD confirms failed upload object absent").toBe(true);
  equal(await gatesAvailable(id), { actor: true, ticket: true }, "User/Ticket mutation gates released after transaction rollback and compensation");
  expect(await ctx.prisma.attachment.count({ where: { ticketId: id } })).toBe(0);
}

it("classifies one natural cold upload and verifies the observed contract outcome without requiring unconditional success", async () => {
  await initialized();
  const parent = await ticket("natural cold");
  const before = await snapshot(ctx.observer, ctx.schema, undefined, tables), objectKeys = await objects();
  expect(objectKeys).toEqual([]);
  const evidence = observeUpload(parent.id, false);
  const response = await upload(parent.id, "cold.png");
  expect(evidence.attempts).toBe(1); expect(evidence.gatesHeld).toBe(true);
  if (response.status === 201) {
    expect(evidence.failure).toBeNull(); expect(evidence.putSucceeded).toBe(true); expect(evidence.removals).toBe(0);
    expect(await ctx.prisma.attachment.count({ where: { ticketId: parent.id } })).toBe(1);
    expect(await objects()).toHaveLength(1);
  } else {
    // The historical finding is metadata/transaction failure AFTER PUT, not S3 unavailability.
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } });
    await failedUploadPreserves(parent.id, before, objectKeys, evidence);
    // No failed-command replay or automatic whole-upload retry. Once the cold
    // PUT has allocated a healthy volume, explicitly issue one new upload.
    vi.restoreAllMocks();
    const ready = await upload(parent.id, "write-ready.png");
    expect(ready.status).toBe(201); expect(ready.body).not.toHaveProperty("storageKey");
    const rows = await ctx.prisma.attachment.findMany({ where: { ticketId: parent.id } });
    expect(rows).toHaveLength(1); expect(rows[0]!.storageKey === evidence.key).toBe(false);
    expect(await objects()).toHaveLength(1);
    const after = await snapshot(ctx.observer, ctx.schema, undefined, tables);
    for (const name of Object.keys(tables).filter(name => name !== "Attachment")) equal(after[name], before[name], `${name} unchanged after deliberate write-ready upload`);
  }
  const { key: _private, ...safe } = evidence;
  console.info("Natural cold upload classification", JSON.stringify({ status: response.status, ...safe }));
}, 30_000);

it("controlled expiry after real persistent PUT returns the inherited safe error with rollback, compensation and released gates", async () => {
  await initialized();
  const parent = await ticket("controlled expiry");
  const before = await snapshot(ctx.observer, ctx.schema, undefined, tables), objectKeys = await objects();
  const evidence = observeUpload(parent.id, true);
  const response = await upload(parent.id, "controlled-expiry.png");
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } });
  expect(evidence.expiryObservedInDatabase).toBe(true);
  await failedUploadPreserves(parent.id, before, objectKeys, evidence);
  const { key: _private, ...safe } = evidence;
  console.info("Controlled expiry classification (not a natural cold race)", JSON.stringify({ status: response.status, ...safe }));
}, 30_000);
