import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Prisma } from "@prisma/client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../../src/app.js";
import { IDLE_SESSION_MILLISECONDS, LAST_SEEN_REFRESH_MILLISECONDS } from "../../src/auth/session.js";
import { getPrisma } from "../../src/prisma.js";
import { configureTestDatabaseEnvironment } from "../../src/testing/test-database.js";
import {
  APPROVED_ORIGIN, cookieHeader, cookieValue, createAuthUser, loginRequest,
} from "../lab-03/auth-test-helpers.js";

// Partial AC-01/T-01, AC-23/T-23 and AC-34/T-34: inherited live-session
// enforcement and safe Dashboard/drill-down failures. These 16 cases do not
// repeat the basic missing-session/operational-role or aggregate/date suites.
const prisma = getPrisma();
const marker = `issue47-security-${randomUUID()}`;
const privateNote = `${marker} private Internal Note`;
const foreignSummary = `${marker} foreign content`;
const faultDetail = `${marker} internal query, connection and stack details must never escape`;
const users: number[] = [], tickets: number[] = [];
const caseUsers: number[] = [], caseTickets: number[] = [];
const secrets: string[] = [];
const previousEnvironment = {
  AUTH_ALLOWED_ORIGINS: process.env.AUTH_ALLOWED_ORIGINS,
  LOGIN_THROTTLE_HMAC_SECRET: process.env.LOGIN_THROTTLE_HMAC_SECRET,
};
let guarded = false;
let categoryId: number | undefined, systemId: number | undefined, staffId: number;

const surfaces = [
  { label: "Dashboard", path: "/api/dashboard/requester", log: "Database error while fetching Requester Dashboard." },
  { label: "drill-down", path: "/api/tickets?dashboardWidget=attention&currentStatus=WAITING_FOR_REQUESTER&page=1&pageSize=10&sortBy=updatedAt&sortOrder=desc",
    log: "Database error while listing Tickets." },
] as const;
type Surface = typeof surfaces[number];

function safeEqual(actual: unknown, expected: unknown, label: string) {
  expect(isDeepStrictEqual(actual, expected), `${label}; sensitive comparison values withheld`).toBe(true);
}

function fixtureError(stage: string, error: unknown) {
  const candidate = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  const code = typeof candidate === "string" && /^(P\d{4}|[0-9A-Z]{5})$/u.test(candidate) ? candidate : "unclassified";
  return new Error(`Dashboard security fixture ${stage} failed (${code}); details withheld.`);
}

async function addUser(label: string, role: "REQUESTER" | "IT_STAFF", ownedByCase = false) {
  const value = await createAuthUser({ email: `${marker}-${label}-${randomUUID()}@example.test`, role });
  users.push(value.user.id); // Track immediately, before dependent setup/login.
  if (ownedByCase) caseUsers.push(value.user.id);
  secrets.push(value.password, value.user.passwordHash, value.user.email);
  return value;
}

async function addTicket(requesterId: number, summary: string, ownedByCase = false) {
  const value = await prisma.ticket.create({ data: {
    ticketNumber: `S47-${randomUUID().replaceAll("-", "").slice(0, 12)}`,
    clientSubmissionId: randomUUID(), requesterId, categoryId: categoryId!, relatedSystemId: systemId!,
    ownerId: staffId, currentStatus: "WAITING_FOR_REQUESTER", requestedPriority: "HIGH", itPriority: "MEDIUM",
    summary, description: `${marker} private Ticket description`,
  } });
  tickets.push(value.id);
  if (ownedByCase) caseTickets.push(value.id);
  await prisma.ticketStatusHistory.createMany({ data: [
    { ticketId: value.id, actorId: staffId, fromStatus: "NEW", toStatus: "OPEN", reason: null },
    { ticketId: value.id, actorId: staffId, fromStatus: "OPEN", toStatus: "WAITING_FOR_REQUESTER", reason: null },
  ] });
  await prisma.internalNote.create({ data: { ticketId: value.id, authorId: staffId, content: privateNote } });
  return value;
}

beforeAll(async () => {
  try {
    const identity = configureTestDatabaseEnvironment();
    const operational = process.env.TOKTICKIT_DEVELOPMENT_DATABASE_URL;
    expect(Boolean(operational) && decodeURIComponent(new URL(operational!).pathname.slice(1)) !== identity.databaseName,
      "Dedicated target differs from operational; values withheld").toBe(true);
    const [live] = await prisma.$queryRaw<Array<{ database: string; schema: string }>>`
      SELECT current_database() AS database, current_schema() AS schema`;
    expect(live?.database === identity.databaseName && live?.schema === identity.schema,
      "Actual guard matches the live database/schema; values withheld").toBe(true);
    guarded = true;
    process.env.AUTH_ALLOWED_ORIGINS = APPROVED_ORIGIN;
    process.env.LOGIN_THROTTLE_HMAC_SECRET = randomUUID();
    staffId = (await addUser("note-author", "IT_STAFF")).user.id;
    const foreign = await addUser("foreign", "REQUESTER");
    categoryId = (await prisma.category.create({ data: { name: `${marker} category` } })).id;
    systemId = (await prisma.relatedSystem.create({ data: { name: `${marker} system` } })).id;
    await addTicket(foreign.user.id, foreignSummary);
  } catch (error) { throw fixtureError("setup", error); }
});

async function authenticatedFixture() {
  try {
    const { user, password } = await addUser("requester", "REQUESTER", true);
    const login = await loginRequest(user.email, password);
    expect(login.status, "Real inherited login succeeds; response withheld").toBe(200);
    const cookie = cookieHeader(login.headers["set-cookie"]);
    const csrf = cookieValue(login.headers["set-cookie"], "toktickit_csrf");
    secrets.push(csrf, cookieValue(login.headers["set-cookie"], "toktickit_session"));
    expect((await request(app).get("/api/auth/me").set("Cookie", cookie)).status).toBe(200);
    const session = await prisma.authSession.findFirstOrThrow({ where: { userId: user.id } });
    secrets.push(session.tokenHash, session.csrfTokenHash);
    const ticket = await addTicket(user.id, `${marker} owned literal <script>text</script>`, true);
    return { user, cookie, csrf, session, ticket };
  } catch (error) { throw fixtureError("authenticated case setup", error); }
}

async function domainDigest() {
  const owned = { ticketId: { in: tickets } };
  const data = await Promise.all([
    prisma.user.findMany({ where: { id: { in: users } }, orderBy: { id: "asc" } }),
    prisma.ticket.findMany({ where: { id: { in: tickets } }, orderBy: { id: "asc" } }),
    prisma.ticketStatusHistory.findMany({ where: owned, orderBy: { id: "asc" } }),
    prisma.action.findMany({ where: owned, orderBy: { id: "asc" } }),
    prisma.actionHistory.findMany({ where: { action: owned }, orderBy: { id: "asc" } }),
    prisma.mutationReceipt.findMany({ where: owned, orderBy: { id: "asc" } }),
    prisma.internalNote.findMany({ where: owned, orderBy: { id: "asc" } }),
    prisma.publicComment.findMany({ where: owned, orderBy: { id: "asc" } }),
    prisma.attachment.findMany({ where: owned, orderBy: { id: "asc" } }),
    prisma.category.findMany({ where: { id: categoryId }, orderBy: { id: "asc" } }),
    prisma.relatedSystem.findMany({ where: { id: systemId }, orderBy: { id: "asc" } }),
    prisma.ticketNumberSequence.findMany({ orderBy: { year: "asc" } }),
  ]);
  // Deliberately exclude real auth-session refresh/expiry/revocation and throttle
  // bookkeeping; include complete User credential state without printing it.
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

async function preservedRead(surface: Surface, cookie: string) {
  const before = await domainDigest();
  try { return await request(app).get(surface.path).set("Cookie", cookie); }
  finally {
    expect(await domainDigest() === before,
      "Read/denial/failure preserves owned domain rows, timestamps, histories, receipts and numbering; digests withheld").toBe(true);
  }
}

function assertSafeError(response: request.Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers["content-type"]).toMatch(/^application\/json\b/u);
  expect(response.headers["cache-control"]).toBe("private, no-store");
  expect(Object.keys(response.body)).toEqual(["error"]);
  expect(Object.keys(response.body.error).sort()).toEqual(["code", "message"]);
  expect(response.body.error.code).toBe(code);
  expect(typeof response.body.error.message === "string" && response.body.error.message.length > 0).toBe(true);
  const body = JSON.stringify(response.body);
  expect(/passwordHash|tokenHash|csrfTokenHash|internalNotes|inputFingerprint|safeResponse|postgres(?:ql)?:|SELECT\s|stack|Prisma/iu.test(body),
    "Error has no private fields, SQL, stack or connection details; body withheld").toBe(false);
  expect([privateNote, foreignSummary, faultDetail, ...secrets].some((value) => body.includes(value)),
    "Error contains no fixture secrets or foreign/private content; values withheld").toBe(false);
}

async function removeOwned(ticketIds: number[], userIds: number[]) {
  const scope = { ticketId: { in: ticketIds } };
  await prisma.mutationReceipt.deleteMany({ where: scope });
  await prisma.actionHistory.deleteMany({ where: { action: scope } });
  await prisma.seedFixture.deleteMany({ where: { OR: [
    { ticketId: { in: ticketIds } }, { userId: { in: userIds } }, { action: scope },
  ] } });
  await prisma.action.deleteMany({ where: scope });
  await prisma.attachment.deleteMany({ where: scope });
  await prisma.internalNote.deleteMany({ where: scope });
  await prisma.publicComment.deleteMany({ where: scope });
  await prisma.ticketStatusHistory.deleteMany({ where: scope });
  await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  safeEqual(await Promise.all([
    prisma.ticket.count({ where: { id: { in: ticketIds } } }),
    prisma.user.count({ where: { id: { in: userIds } } }),
    prisma.authSession.count({ where: { userId: { in: userIds } } }),
    prisma.ticketStatusHistory.count({ where: scope }),
    prisma.internalNote.count({ where: scope }),
  ]), [0, 0, 0, 0, 0], "Only owned fixtures/sessions removed in FK-safe order");
}

afterEach(async () => {
  vi.restoreAllMocks();
  if (guarded) {
    try { await removeOwned(caseTickets, caseUsers); }
    catch (error) { throw fixtureError("case cleanup", error); }
    finally { caseTickets.length = 0; caseUsers.length = 0; }
  }
});

afterAll(async () => {
  try {
    if (guarded) {
      await removeOwned(tickets, users);
      if (categoryId !== undefined) await prisma.category.deleteMany({ where: { id: categoryId } });
      if (systemId !== undefined) await prisma.relatedSystem.deleteMany({ where: { id: systemId } });
      safeEqual(await Promise.all([
        prisma.category.count({ where: { name: { startsWith: marker } } }),
        prisma.relatedSystem.count({ where: { name: { startsWith: marker } } }),
      ]), [0, 0], "Owned reference fixtures removed");
      console.info("Issue47 security: guarded live target, 16 owned-case cleanups, sessions/domain fixtures removed; no fault resources created.");
    }
  } catch (error) { throw fixtureError("final cleanup", error); }
  finally {
    vi.restoreAllMocks();
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
      expect(process.env[key] === value, "Test-local authentication environment restored; values withheld").toBe(true);
    }
    await prisma.$disconnect();
  }
});

describe.each(surfaces)("Requester $label session security", (surface) => {
  it.each([
    { condition: "idle-expired", status: 401, code: "AUTHENTICATION_REQUIRED", removed: true },
    { condition: "absolute-expired", status: 401, code: "AUTHENTICATION_REQUIRED", removed: true },
    { condition: "real logout revocation", status: 401, code: "AUTHENTICATION_REQUIRED", removed: true },
    { condition: "now inactive", status: 401, code: "AUTHENTICATION_REQUIRED", removed: true },
    { condition: "now another role", status: 403, code: "ROLE_FORBIDDEN", removed: false },
    { condition: "now password-change required", status: 403, code: "PASSWORD_CHANGE_REQUIRED", removed: false },
  ])("$condition returns $status $code", async ({ condition, status, code, removed }) => {
    const fixture = await authenticatedFixture();
    const now = Date.now();
    switch (condition) {
      case "idle-expired":
        await prisma.authSession.update({ where: { id: fixture.session.id }, data: {
          createdAt: new Date(now - IDLE_SESSION_MILLISECONDS - 120_000),
          lastSeenAt: new Date(now - IDLE_SESSION_MILLISECONDS - 60_000),
        } });
        break;
      case "absolute-expired":
        await prisma.authSession.update({ where: { id: fixture.session.id }, data: {
          createdAt: new Date(now - 9 * 60 * 60 * 1_000), lastSeenAt: new Date(now),
          expiresAt: new Date(now - 60_000),
        } });
        break;
      case "real logout revocation": {
        const logout = await request(app).post("/api/auth/logout").set("Cookie", fixture.cookie)
          .set("Origin", APPROVED_ORIGIN).set("X-CSRF-Token", fixture.csrf);
        expect(logout.status).toBe(204);
        expect(await prisma.authSession.count({ where: { id: fixture.session.id } })).toBe(0);
        break;
      }
      case "now inactive":
        await prisma.user.update({ where: { id: fixture.user.id }, data: { isActive: false } });
        break;
      case "now another role":
        await prisma.user.update({ where: { id: fixture.user.id }, data: { role: "IT_STAFF" } });
        break;
      case "now password-change required":
        // Both restrictions apply: inherited password-change check precedes role denial.
        await prisma.user.update({ where: { id: fixture.user.id }, data: { mustChangePassword: true, role: "IT_STAFF" } });
        break;
    }
    const sessionBefore = await prisma.authSession.findUnique({ where: { id: fixture.session.id } });
    const business = vi.spyOn(prisma, "$transaction");
    try {
      assertSafeError(await preservedRead(surface, fixture.cookie), status, code);
      expect(business).not.toHaveBeenCalled(); // Denial precedes business/snapshot reads.
      const sessionAfter = await prisma.authSession.findUnique({ where: { id: fixture.session.id } });
      if (removed) expect(sessionAfter === null, "Expired/revoked/inactive session cannot remain live").toBe(true);
      else safeEqual(sessionAfter, sessionBefore, "Role/password denial preserves the otherwise fresh session");
    } finally { business.mockRestore(); }
  });
});

describe.each(surfaces)("Requester $label safe business failures", (surface) => {
  it.each([
    { kind: "known unavailable dependency", status: 503, code: "SERVICE_UNAVAILABLE" },
    { kind: "unexpected business read", status: 500, code: "INTERNAL_ERROR" },
  ])("$kind returns $status $code, then recovers", async ({ kind, status, code }) => {
    const fixture = await authenticatedFixture();
    await prisma.authSession.update({ where: { id: fixture.session.id }, data: {
      createdAt: new Date(Date.now() - LAST_SEEN_REFRESH_MILLISECONDS - 120_000),
      lastSeenAt: new Date(Date.now() - LAST_SEEN_REFRESH_MILLISECONDS - 60_000),
    } });
    const evidence = { transactions: 0, realCounts: 0, faults: 0, rejected: false };
    type Operation = (tx: Prisma.TransactionClient) => Promise<unknown>;
    type Options = { isolationLevel?: Prisma.TransactionIsolationLevel };
    const original = prisma.$transaction.bind(prisma) as (operation: Operation, options?: Options) => Promise<unknown>;
    // Controlled classification faults, NOT an actual outage. Authentication,
    // real RR/read-only transaction setup and the first business count execute.
    const fault = kind === "known unavailable dependency"
      ? new Prisma.PrismaClientKnownRequestError(faultDetail, { code: "P1001", clientVersion: Prisma.prismaVersion.client })
      : new Error(faultDetail);
    if (kind === "known unavailable dependency") {
      expect(fault instanceof Prisma.PrismaClientKnownRequestError && fault.code === "P1001").toBe(true);
    }
    const logging = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const spy = vi.spyOn(prisma, "$transaction").mockImplementation((async (operation: Operation, options?: Options) => {
      evidence.transactions += 1;
      try {
        return await original(async (tx) => {
          const observed = new Proxy(tx, { get(target, property) {
            const value = Reflect.get(target, property);
            if (property !== "ticket") return typeof value === "function" ? value.bind(target) : value;
            return new Proxy(value, { get(delegate, method) {
              const call = Reflect.get(delegate, method);
              if (method !== "count") return typeof call === "function" ? call.bind(delegate) : call;
              return async (...args: unknown[]) => {
                await Reflect.apply(call, delegate, args); // The actual SQL completed.
                evidence.realCounts += 1;
                const [settings] = await tx.$queryRaw<Array<{ isolation: string; readOnly: string }>>`
                  SELECT current_setting('transaction_isolation') AS isolation,
                    current_setting('transaction_read_only') AS "readOnly"`;
                safeEqual(settings, { isolation: "repeatable read", readOnly: "on" }, "Real business transaction controls");
                evidence.faults += 1;
                throw fault;
              };
            } });
          } });
          return operation(observed);
        }, options);
      } catch (error) { evidence.rejected = true; throw error; }
    }) as typeof prisma.$transaction);
    try {
      assertSafeError(await preservedRead(surface, fixture.cookie), status, code);
      safeEqual(evidence, { transactions: 1, realCounts: 1, faults: 1, rejected: true },
        "Single authenticated real transaction rejects; no hidden retry/partial response");
      safeEqual(logging.mock.calls, [[surface.log]], "Only the inherited sanitized operation-stage log is emitted");
      const session = await prisma.authSession.findUniqueOrThrow({ where: { id: fixture.session.id } });
      expect(session.lastSeenAt.getTime()).toBeGreaterThan(Date.now() - LAST_SEEN_REFRESH_MILLISECONDS);
    } finally {
      spy.mockRestore();
      // Unexpected logging is retained in the assertion above, never silently ignored.
      logging.mockRestore();
    }
    const recovered = await preservedRead(surface, fixture.cookie);
    expect(recovered.status).toBe(200);
    expect(recovered.headers["cache-control"]).toBe("private, no-store");
    if (surface.label === "Dashboard") {
      expect(recovered.body.metrics).toEqual({ outstanding: 1, needsAttention: 1, recentUpdated: 1, recentResolved: 0 });
      expect(recovered.body.lists.recentUpdated.map((row: { id: number }) => row.id)).toEqual([fixture.ticket.id]);
      expect(recovered.body.lists.recentUpdated[0].summary).toBe(fixture.ticket.summary);
    } else {
      expect(recovered.body.items.map((row: { id: number }) => row.id)).toEqual([fixture.ticket.id]);
      expect(recovered.body.items[0].summary).toBe(fixture.ticket.summary);
      expect(recovered.body.pagination.totalItems).toBe(1);
    }
    expect(JSON.stringify(recovered.body).includes(foreignSummary) || JSON.stringify(recovered.body).includes(privateNote),
      "Fault-free authoritative response still excludes foreign/private content").toBe(false);
  });
});
