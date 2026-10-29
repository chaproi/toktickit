import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Prisma, type Action, type ActionStatus, type Ticket, type TicketStatus, type User } from "@prisma/client";
import request from "supertest";
import { expect } from "vitest";
import { vi } from "vitest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { configureTestDatabaseEnvironment } from "../../src/testing/test-database.js";
import { cookieHeader, createAuthUser, loginRequest } from "../lab-03/auth-test-helpers.js";
import { actionSnapshot } from "./action-read-test-fixtures.js";

export type VerificationActor = "A" | "B";
export type VerificationDescriptor = { path: string; query: Record<string, string | number> };
export const historyClock = {
  asOf: "2026-06-15T16:59:59.999Z", from: "2026-06-08T17:00:00.000Z", before: "2026-06-15T17:00:00.000Z",
} as const;
export const anchorResolutions = [
  ["R01", "2026-06-10T05:00:00.000Z"], ["R02", "2026-06-14T05:00:00.000Z"],
  ["R03", "2026-06-12T05:00:00.000Z"], ["R04", "2026-06-14T05:00:00.000Z"],
  ["R05", "2026-06-13T05:00:00.000Z"], ["R06", "2026-06-11T05:00:00.000Z"],
  ["R07", "2026-06-12T05:00:00.000Z"], ["R08", "2026-06-14T05:00:00.000Z"],
  ["R09", "2026-06-13T05:00:00.000Z"], ["R10", "2026-06-11T05:00:00.000Z"],
  ["R11", "2026-06-10T05:00:00.000Z"], ["R12", "2026-06-12T05:00:00.000Z"],
] as const;
export const anchorOrder = ["R08", "R04", "R02", "R09", "R05", "R12", "R07", "R03", "R10", "R06", "R11", "R01"];

function safeEqual(actual: unknown, expected: unknown, label: string) {
  expect(isDeepStrictEqual(actual, expected), `${label}; sensitive comparison withheld`).toBe(true);
}
function fixtureError(stage: string, error: unknown) {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  const safeCode = typeof code === "string" && /^(P\d{4}|[0-9A-Z]{5})$/u.test(code) ? code : "unclassified";
  return new Error(`Owned Staff verification ${stage} failed (${safeCode}); sensitive details withheld.`);
}

// New, scoped read-fixture builder. Expected membership/order lives explicitly
// in the tests; no production query/filter/projection generates expectations.
export function staffVerificationFixture(label: "actions" | "history") {
  const prisma = getPrisma(), marker = `issue48-verify-${label}-${randomUUID()}`;
  const users = new Map<string, User>(), cookies = new Map<VerificationActor, string>();
  const rows = new Map<string, Ticket>(), actions = new Map<string, Action>();
  const userIds: number[] = [], ticketIds: number[] = [], categories: Array<{ id: number; name: string }> = [];
  let system!: { id: number; name: string }, guarded = false, clock = 0;
  const worker = (name: string) => users.get(name)!;
  const ticket = (name: string) => rows.get(name)!;
  const ago = (hours: number) => new Date(clock - hours * 3_600_000);
  async function setup() {
    try {
      const identity = configureTestDatabaseEnvironment(), operational = process.env.TOKTICKIT_DEVELOPMENT_DATABASE_URL;
      expect(Boolean(operational) && decodeURIComponent(new URL(operational!).pathname.slice(1)) !== identity.databaseName,
        "Dedicated database distinct from operational; identities withheld").toBe(true);
      const [live] = await prisma.$queryRaw<Array<{ database: string; schema: string; now: Date }>>`
        SELECT current_database() AS database,current_schema() AS schema,CURRENT_TIMESTAMP AS now`;
      expect(live.database === identity.databaseName && live.schema === identity.schema, "Actual guard matches live fixture target; identities withheld").toBe(true);
      guarded = true; clock = live.now.getTime();
      for (const [name, role] of [["A", "IT_STAFF"], ["B", "ADMINISTRATOR"], ["historical", "IT_STAFF"], ["requester", "REQUESTER"]] as const) {
        const value = await createAuthUser({ email: `${marker}-${name}@example.test`, role });
        userIds.push(value.user.id); users.set(name, value.user);
        if (name === "A" || name === "B") {
          const response = await loginRequest(value.user.email, value.password);
          expect(response.status, "Real inherited actor login succeeds; response withheld").toBe(200);
          cookies.set(name, cookieHeader(response.headers["set-cookie"]));
        }
      }
      system = await prisma.relatedSystem.create({ data: { name: marker }, select: { id: true, name: true } });
    } catch (error) { throw fixtureError("setup", error); }
  }
  async function category(name: string) {
    try {
      // Keep generated reference names within the existing VARCHAR(100); test
      // titles are descriptive labels, not required Category content.
      const value = await prisma.category.create({ data: { name: `${marker}-${name.slice(0, 16)}-${categories.length}` }, select: { id: true, name: true } });
      categories.push(value); return value.id;
    } catch (error) { throw fixtureError("Category creation", error); }
  }
  async function addTicket(name: string, categoryId: number, status: TicketStatus, owner: string | null, updatedAt: Date,
    history: Array<[TicketStatus, TicketStatus, string]> = []) {
    const value = await prisma.ticket.create({ data: {
      ticketNumber: `D48V-${randomUUID().replaceAll("-", "").slice(0, 12)}`, clientSubmissionId: randomUUID(),
      requesterId: worker("requester").id, categoryId, relatedSystemId: system.id, ownerId: owner === null ? null : worker(owner).id,
      currentStatus: status, requestedPriority: "HIGH", itPriority: "MEDIUM",
      summary: `${name} <script>literal Staff verification</script>`, description: `${marker} private body`,
      createdAt: new Date("2026-05-01T00:00:00.000Z"), ticketDate: new Date("2026-05-01T00:00:00.000Z"), updatedAt,
    } });
    ticketIds.push(value.id); rows.set(name, value);
    if (history.length) await prisma.ticketStatusHistory.createMany({ data: history.map(([fromStatus, toStatus, instant]) => ({
      ticketId: value.id, actorId: worker("B").id, fromStatus, toStatus, reason: null, createdAt: new Date(instant),
    })) });
    return value;
  }
  function expectedAction(value: Action) {
    const identity = (id: number) => { const found = [...users.values()].find((user) => user.id === id)!; return { id, name: found.name }; };
    return {
      id: value.id, ticketId: value.ticketId, actionAt: value.actionAt.toISOString(), description: value.description, result: value.result,
      createdBy: identity(value.createdById), assignee: identity(value.assigneeId), performedBy: value.performedById === null ? null : identity(value.performedById),
      status: value.status, followUpRequired: value.followUpRequired, followUpNote: value.followUpNote, attachmentNotes: value.attachmentNotes,
      cancellationReason: value.cancellationReason, createdAt: value.createdAt.toISOString(), updatedAt: value.updatedAt.toISOString(),
      completedAt: value.completedAt?.toISOString() ?? null, cancelledAt: value.cancelledAt?.toISOString() ?? null, version: value.version,
    };
  }
  async function addAction(name: string, parent: Ticket, assignee: string, status: ActionStatus, createdAt: Date) {
    let value = await prisma.action.create({ data: { ticketId: parent.id, createdById: worker("historical").id,
      assigneeId: worker(assignee).id, description: `${name} literal <script>Action</script>`, followUpRequired: true,
      followUpNote: "Retained valid historical follow-up", attachmentNotes: "<script>inert notes</script>", actionAt: createdAt, createdAt, updatedAt: createdAt } });
    actions.set(name, value);
    await prisma.actionHistory.create({ data: { actionId: value.id, actorId: value.createdById, event: "ACTION_CREATED", actionVersion: 1,
      before: Prisma.DbNull, after: actionSnapshot(value), createdAt } });
    const initial = value;
    if (status === "IN_PROGRESS" || status === "COMPLETED") {
      const before = value, instant = new Date(createdAt.getTime() + 1);
      value = await prisma.action.update({ where: { id: value.id }, data: { status: "IN_PROGRESS", version: 2, updatedAt: instant } });
      await prisma.actionHistory.create({ data: { actionId: value.id, actorId: value.assigneeId, event: "ACTION_STARTED", actionVersion: 2,
        before: actionSnapshot(before), after: actionSnapshot(value), createdAt: instant } });
    }
    if (status === "COMPLETED" || status === "CANCELLED") {
      const before = value, instant = new Date(createdAt.getTime() + value.version);
      // The other live actor performed it. Performer/creator/parent owner must
      // never make another actor's assignment enter assignee=me results.
      const performer = worker(assignee === "A" ? "B" : "A");
      value = await prisma.action.update({ where: { id: value.id }, data: { status, version: before.version + 1, updatedAt: instant,
        ...(status === "COMPLETED" ? { performedById: performer.id, completedAt: instant, result: "Literal completed result" }
          : { cancelledAt: instant, cancellationReason: "Synthetic cancelled read fixture", result: "Retained draft result" }) } });
      await prisma.actionHistory.create({ data: { actionId: value.id, actorId: performer.id,
        event: status === "COMPLETED" ? "ACTION_COMPLETED" : "ACTION_CANCELLED", actionVersion: value.version,
        before: actionSnapshot(before), after: actionSnapshot(value), createdAt: instant } });
    }
    actions.set(name, value);
    if (name === "A-P01") await prisma.mutationReceipt.create({ data: { actorId: initial.createdById, ticketId: initial.ticketId, actionId: initial.id,
      clientMutationId: randomUUID(), operation: "CREATE_ACTION", inputFingerprint: createHash("sha256").update(randomUUID()).digest("hex"),
      safeResponse: { action: expectedAction(initial), ticketUpdatedAt: parent.updatedAt.toISOString() } } });
  }
  async function actionCohort() {
    try {
      const matching = await category("matching"), other = await category("other");
      for (const actor of ["A", "B"] as const) {
        const owner = actor === "A" ? "B" : "A";
        const editable = await addTicket(`${actor}-editable`, matching, actor === "A" ? "OPEN" : "IN_PROGRESS", owner, ago(1));
        const terminal = await addTicket(`${actor}-terminal`, matching, "CLOSED", owner, ago(1));
        for (const [index, suffix] of ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11"].entries()) {
          await addAction(`${actor}-P${suffix}`, editable, actor, "PLANNED", ago(100 - Math.floor(index / 2)));
        }
        await addAction(`${actor}-S01`, editable, actor, "IN_PROGRESS", ago(94));
        await addAction(`${actor}-S02`, editable, actor, "IN_PROGRESS", ago(94));
        await addAction(`${actor}-C01`, terminal, actor, "COMPLETED", ago(120));
        await addAction(`${actor}-C02`, terminal, actor, "COMPLETED", ago(120));
        await addAction(`${actor}-X01`, terminal, actor, "CANCELLED", ago(110));
        const decoy = await addTicket(`${actor}-other-category`, other, "OPEN", owner, ago(1));
        await addAction(`${actor}-decoy`, decoy, actor, "PLANNED", ago(200));
      }
      await addAction("historical-decoy", ticket("A-editable"), "historical", "COMPLETED", ago(130));
      users.set("historical", await prisma.user.update({ where: { id: worker("historical").id }, data: { isActive: false } }));
      await prisma.internalNote.create({ data: { ticketId: ticket("A-editable").id, authorId: worker("B").id, content: `${marker} private Internal Note` } });
      return new URLSearchParams({ categoryId: String(matching), relatedSystemId: String(system.id), requestedPriority: "HIGH", itPriority: "MEDIUM" });
    } catch (error) { throw fixtureError("Action cohort", error); }
  }
  async function digest() {
    const owned = { ticketId: { in: ticketIds } }, categoryIds = categories.map(({ id }) => id);
    const values = await Promise.all([
      prisma.user.findMany({ where: { id: { in: userIds } }, orderBy: { id: "asc" } }),
      prisma.category.findMany({ where: { id: { in: categoryIds } }, orderBy: { id: "asc" } }),
      prisma.relatedSystem.findMany({ where: { id: system.id }, orderBy: { id: "asc" } }),
      prisma.ticket.findMany({ where: { id: { in: ticketIds } }, orderBy: { id: "asc" } }),
      prisma.ticketStatusHistory.findMany({ where: owned, orderBy: { id: "asc" } }),
      prisma.action.findMany({ where: owned, orderBy: { id: "asc" } }), prisma.actionHistory.findMany({ where: { action: owned }, orderBy: { id: "asc" } }),
      prisma.mutationReceipt.findMany({ where: owned, orderBy: { id: "asc" } }), prisma.internalNote.findMany({ where: owned, orderBy: { id: "asc" } }),
      prisma.publicComment.findMany({ where: owned, orderBy: { id: "asc" } }), prisma.attachment.findMany({ where: owned, orderBy: { id: "asc" } }),
      prisma.ticketNumberSequence.findMany({ orderBy: { year: "asc" } }),
    ]);
    return createHash("sha256").update(JSON.stringify(values)).digest("hex");
  }
  async function read(actor: VerificationActor, path: string, params: URLSearchParams) {
    expect(["/api/dashboard/staff", "/api/staff/actions", "/api/staff/tickets"]).toContain(path);
    const before = await digest();
    try { return await request(app).get(`${path}?${params.toString()}`).set("Cookie", cookies.get(actor)!); }
    finally { expect(await digest() === before, "Every read preserves exact domain state, excluding session bookkeeping; digests withheld").toBe(true); }
  }
  function descriptorParams(descriptor: VerificationDescriptor, path: string, base: URLSearchParams) {
    expect(descriptor.path).toBe(path);
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(descriptor.query)) {
      expect(["string", "number"]).toContain(typeof value); params.append(key, String(value));
    }
    for (const [key, value] of base) expect(params.get(key), `Actual returned descriptor preserves ${key}`).toBe(value);
    return params;
  }
  function assertActionRows(items: Array<{ ticket: unknown; action: unknown }>, labels: string[]) {
    for (const [index, row] of items.entries()) {
      const value = actions.get(labels[index]!)!, parent = [...rows.values()].find(({ id }) => id === value.ticketId)!;
      safeEqual(row, { ticket: { id: parent.id, ticketNumber: parent.ticketNumber, summary: parent.summary, currentStatus: parent.currentStatus },
        action: expectedAction(value) }, "Exact API-07 row, literal text, retained safe historical identities and attribution");
    }
    expect(/passwordHash|tokenHash|csrfTokenHash|inputFingerprint|safeResponse|internalNotes|storageKey|"email"/u.test(JSON.stringify(items))).toBe(false);
  }
  function assertResolutionRows(items: Array<Record<string, any>>, names: string[], times: Map<string, string>, dashboard: boolean) {
    expect(items.map((row) => row.id)).toEqual(names.map((name) => ticket(name).id));
    for (const [index, item] of items.entries()) {
      const source = ticket(names[index]!)!, owner = source.ownerId === null ? null : [...users.values()].find(({ id }) => id === source.ownerId)!;
      const common = { id: source.id, ticketNumber: source.ticketNumber, summary: source.summary, currentStatus: source.currentStatus,
        requestedPriority: source.requestedPriority, itPriority: source.itPriority, updatedAt: source.updatedAt.toISOString(),
        owner: owner === null ? null : { id: owner.id, name: owner.name, role: owner.role }, resolvedAt: times.get(names[index]!) };
      safeEqual(item, dashboard ? common : { ...common, ticketDate: source.ticketDate.toISOString(),
        requester: { id: worker("requester").id, name: worker("requester").name, email: worker("requester").email },
        category: categories.find(({ id }) => id === source.categoryId), relatedSystem: system, requesterResolutionIndicatedAt: null },
      "Exact authorized resolution projection, safe identity fields and history time rather than updatedAt");
    }
    expect(/passwordHash|tokenHash|csrfTokenHash|inputFingerprint|safeResponse|internalNotes|storageKey|"description"/u.test(JSON.stringify(items))).toBe(false);
  }
  async function cleanup() {
    try {
      if (!guarded) return;
      const owned = { ticketId: { in: ticketIds } }, categoryIds = categories.map(({ id }) => id);
      const registry = { OR: [{ ticketId: { in: ticketIds } }, { userId: { in: userIds } }, { categoryId: { in: categoryIds } },
        { relatedSystemId: system?.id ?? -1 }] };
      await prisma.$transaction([
        prisma.seedFixture.deleteMany({ where: registry }), prisma.mutationReceipt.deleteMany({ where: owned }),
        prisma.actionHistory.deleteMany({ where: { action: owned } }), prisma.action.deleteMany({ where: owned }),
        prisma.ticketStatusHistory.deleteMany({ where: owned }), prisma.internalNote.deleteMany({ where: owned }),
        prisma.publicComment.deleteMany({ where: owned }), prisma.attachment.deleteMany({ where: owned }),
        prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } }), prisma.authSession.deleteMany({ where: { userId: { in: userIds } } }),
        prisma.user.deleteMany({ where: { id: { in: userIds } } }), prisma.category.deleteMany({ where: { id: { in: categoryIds } } }),
        prisma.relatedSystem.deleteMany({ where: { id: system?.id ?? -1 } }),
      ]);
      const remaining = await Promise.all([
        prisma.user.count({ where: { id: { in: userIds } } }), prisma.authSession.count({ where: { userId: { in: userIds } } }),
        prisma.category.count({ where: { id: { in: categoryIds } } }), prisma.relatedSystem.count({ where: { id: system?.id ?? -1 } }),
        prisma.ticket.count({ where: { id: { in: ticketIds } } }), prisma.ticketStatusHistory.count({ where: owned }), prisma.action.count({ where: owned }),
        prisma.actionHistory.count({ where: { action: owned } }), prisma.mutationReceipt.count({ where: owned }),
        prisma.internalNote.count({ where: owned }), prisma.publicComment.count({ where: owned }), prisma.attachment.count({ where: owned }),
        prisma.seedFixture.count({ where: registry }),
      ]);
      safeEqual(remaining, Array(13).fill(0), "Zero owned verification fixtures/sessions/domain/reference records after FK-safe cleanup");
      console.info(`Issue48 ${label} verification cleanup: zero owned records; client disconnects; no fault/schema resources or credential environment changes.`);
    } catch (error) { throw fixtureError("cleanup", error); }
    finally { await prisma.$disconnect(); }
  }
  return { setup, cleanup, category, addTicket, actionCohort, read, descriptorParams, assertActionRows, assertResolutionRows,
    ticketId: (name: string) => ticket(name).id, actionId: (name: string) => actions.get(name)!.id,
    actorId: (actor: VerificationActor) => worker(actor).id };
}

type StaffDateRead = { pid: number; timezone: string; isolation: string; readOnly: string; operation: string };
type StaffDateEvidence = {
  transactions: number; clockReads: number; clockOverrides: number; reads: StaffDateRead[];
  settings: Array<{ pid: number; original: string; applied: string; restored: boolean }>;
};

// Extends the existing service-clock probe convention without changing that
// shared helper: execute real transactions/business SQL, substitute only the
// exact clock SELECT result, and optionally control the SAME transaction's zone.
// No writer coordination, global clock, connection/role default or timeout change.
export async function withStaffDateReadProbe<T>(
  input: { clock: Date; timezone?: "UTC" | "Asia/Bangkok" },
  work: (probe: { evidence: StaffDateEvidence; track<R>(request: Promise<R>): Promise<R> }) => Promise<T>,
): Promise<T> {
  const application = getPrisma();
  type Operation = (transaction: Prisma.TransactionClient) => Promise<unknown>;
  type Options = { isolationLevel?: Prisma.TransactionIsolationLevel };
  const original = application.$transaction.bind(application) as (operation: Operation, options?: Options) => Promise<unknown>;
  const evidence: StaffDateEvidence = { transactions: 0, clockReads: 0, clockOverrides: 0, reads: [], settings: [] };
  const pending: Promise<unknown>[] = [];
  const spy = vi.spyOn(application, "$transaction").mockImplementation((async (operation: unknown, options?: Options) => {
    if (typeof operation !== "function") return original(operation as Operation, options);
    evidence.transactions += 1;
    return original(async (tx) => {
      let setting: StaffDateEvidence["settings"][number] | undefined, failed = false;
      const observe = async (operationName: string) => {
        const [actual] = await tx.$queryRaw<Array<Omit<StaffDateRead, "operation">>>`
          SELECT pg_backend_pid() AS pid,current_setting('TimeZone') AS timezone,
            current_setting('transaction_isolation') AS isolation,current_setting('transaction_read_only') AS "readOnly"`;
        evidence.reads.push({ ...actual, operation: operationName });
        return actual;
      };
      const observed = new Proxy(tx, { get(target, property) {
        const value = Reflect.get(target, property);
        if (property === "$executeRaw") return async (...args: unknown[]) => {
          const result = await Reflect.apply(value, target, args);
          const fragments = Array.isArray(args[0]) ? args[0] : [];
          if (args.length === 1 && fragments.length === 1 && String(fragments[0]).trim() === "SET TRANSACTION READ ONLY") {
            const initial = await observe("read-only established");
            expect(setting).toBeUndefined();
            setting = { pid: initial.pid, original: initial.timezone, applied: input.timezone ?? initial.timezone, restored: false };
            evidence.settings.push(setting);
            if (input.timezone !== undefined) {
              // Static allowlisted SQL; SET LOCAL affects this business backend
              // only and PostgreSQL also unwinds it on transaction completion.
              await tx.$executeRaw(input.timezone === "UTC" ? Prisma.sql`SET LOCAL TIME ZONE 'UTC'` : Prisma.sql`SET LOCAL TIME ZONE 'Asia/Bangkok'`);
            }
          }
          return result;
        };
        if (property === "$queryRaw") return async (...args: unknown[]) => {
          await observe("raw business read");
          const result: unknown = await Reflect.apply(value, target, args);
          const fragments = Array.isArray(args[0]) ? args[0] : [];
          const clock = args.length === 1 && fragments.length === 1 &&
            String(fragments[0]).trim().replace(/\s+/gu, " ") === 'SELECT CURRENT_TIMESTAMP AS "asOf"';
          if (!clock) return result;
          evidence.clockReads += 1;
          if (!Array.isArray(result) || result.length !== 1 || !(result[0].asOf instanceof Date)) throw new Error("Actual service clock result was not observed.");
          evidence.clockOverrides += 1;
          return [{ ...result[0], asOf: new Date(input.clock.getTime()) }];
        };
        if (property === "ticket" || property === "ticketStatusHistory" || property === "action") return new Proxy(value, { get(delegate, method) {
          const call = Reflect.get(delegate, method);
          if (typeof call !== "function") return call;
          return async (...args: unknown[]) => { await observe(`${String(property)}.${String(method)}`); return Reflect.apply(call, delegate, args); };
        } });
        return typeof value === "function" ? value.bind(target) : value;
      } });
      try { return await (operation as Operation)(observed); }
      catch (error) { failed = true; throw error; }
      finally {
        if (setting !== undefined) {
          try {
            await tx.$queryRaw`SELECT set_config('TimeZone', ${setting.original}, true)`;
            const restored = await observe("timezone restored");
            expect(restored.pid).toBe(setting.pid); expect(restored.timezone).toBe(setting.original);
            setting.restored = true;
          } catch (error) { if (!failed) throw error; } // Preserve original failure; rollback also unwinds SET LOCAL.
        }
      }
    }, options);
  }) as typeof application.$transaction);
  try { return await work({ evidence, track<R>(request: Promise<R>) {
    pending.push(request.then(() => undefined, () => undefined)); return request;
  } }); }
  finally { await Promise.all(pending); spy.mockRestore(); }
}
// Coordinated cases need a read that permits ONLY the explicitly acknowledged
// concurrent writer, rather than weakening the existing read()/digest helper.
// This independent, small fixture owns both live actors and all parent rows.
export function staffSnapshotFixture() {
  const db = getPrisma(), marker = `issue48-snapshot-${randomUUID()}`;
  const users: User[] = [], parents: number[] = [], categories: number[] = [];
  let system!: { id: number; name: string }, guarded = false;
  let readerCookie = "", writerCookie = "", writerCsrf = "";
  async function setup() {
    const identity = configureTestDatabaseEnvironment(), operational = process.env.TOKTICKIT_DEVELOPMENT_DATABASE_URL;
    expect(Boolean(operational) && decodeURIComponent(new URL(operational!).pathname.slice(1)) !== identity.databaseName,
      "Snapshot fixture target differs from operational; identities withheld").toBe(true);
    const [live] = await db.$queryRaw<Array<{ database: string; schema: string }>>`
      SELECT current_database() AS database,current_schema() AS schema`;
    expect(live.database === identity.databaseName && live.schema === identity.schema,
      "Actual isolation guard matches live snapshot database/schema; values withheld").toBe(true);
    guarded = true;
    for (const [label, role] of [["reader", "IT_STAFF"], ["writer", "ADMINISTRATOR"], ["requester", "REQUESTER"]] as const) {
      const value = await createAuthUser({ email: `${marker}-${label}@example.test`, role });
      users.push(value.user); // Immediately own it, including partial setup.
      if (label === "requester") continue;
      const login = await loginRequest(value.user.email, value.password);
      expect(login.status, "Real snapshot actor login; response withheld").toBe(200);
      if (label === "reader") readerCookie = cookieHeader(login.headers["set-cookie"]);
      else {
        writerCookie = cookieHeader(login.headers["set-cookie"]);
        writerCsrf = cookieValue(login.headers["set-cookie"], "toktickit_csrf");
      }
    }
    system = await db.relatedSystem.create({ data: { name: marker }, select: { id: true, name: true } });
  }
  async function cohort(status: "OPEN" | "RESOLVED", unassigned = false) {
    const category = await db.category.create({ data: { name: `${marker}-${categories.length}` }, select: { id: true, name: true } });
    categories.push(category.id);
    const [clock] = await db.$queryRaw<Array<{ now: Date }>>`SELECT CURRENT_TIMESTAMP AS now`;
    const old = new Date(clock.now.getTime() - 3_600_000), created = new Date(old.getTime() - 86_400_000);
    const rows: Ticket[] = [];
    for (const label of ["subject", "sibling"]) {
      const parent = await db.ticket.create({ data: {
        ticketNumber: `D48S-${randomUUID().replaceAll("-", "").slice(0, 12)}`, clientSubmissionId: randomUUID(),
        requesterId: users[2]!.id, ownerId: unassigned && label === "subject" ? null : users[0]!.id,
        categoryId: category.id, relatedSystemId: system.id, requestedPriority: "HIGH", itPriority: "MEDIUM",
        summary: `${label} <script>literal snapshot</script>`, description: `${marker} private body`,
        currentStatus: status, createdAt: created, ticketDate: created, updatedAt: old,
      } });
      parents.push(parent.id); rows.push(parent);
      await db.ticketStatusHistory.create({ data: { ticketId: parent.id, actorId: users[1]!.id,
        fromStatus: "NEW", toStatus: "OPEN", reason: null, createdAt: created } });
      if (status === "RESOLVED") {
        await db.ticketStatusHistory.createMany({ data: [
          { ticketId: parent.id, actorId: users[1]!.id, fromStatus: "OPEN", toStatus: "RESOLVED", reason: "First resolution", createdAt: new Date(old.getTime() - 3_000) },
          { ticketId: parent.id, actorId: users[1]!.id, fromStatus: "RESOLVED", toStatus: "REOPENED", reason: "Reviewed again", createdAt: new Date(old.getTime() - 2_000) },
          { ticketId: parent.id, actorId: users[1]!.id, fromStatus: "REOPENED", toStatus: "RESOLVED", reason: "Latest literal <script>reason</script>", createdAt: old },
        ] });
      }
    }
    return { subject: rows[0]!, sibling: rows[1]!, params: new URLSearchParams({ categoryId: String(category.id) }),
      expectedRow(value: Ticket, resolved = false) {
        const owner = value.ownerId === null ? null : users.find(({ id }) => id === value.ownerId)!;
        return { id: value.id, ticketNumber: value.ticketNumber, summary: value.summary, currentStatus: value.currentStatus,
          requestedPriority: "HIGH", itPriority: "MEDIUM", updatedAt: value.updatedAt.toISOString(),
          owner: owner === null ? null : { id: owner.id, name: owner.name, role: owner.role },
          ticketDate: value.ticketDate.toISOString(), requester: { id: users[2]!.id, name: users[2]!.name, email: users[2]!.email },
          category, relatedSystem: system, requesterResolutionIndicatedAt: null,
          ...(resolved ? { resolvedAt: old.toISOString() } : {}) };
      } };
  }
  async function state() {
    const owned = { ticketId: { in: parents } };
    return {
      users: await db.user.findMany({ where: { id: { in: users.map(({ id }) => id) } }, orderBy: { id: "asc" } }),
      tickets: await db.ticket.findMany({ where: { id: { in: parents } }, orderBy: { id: "asc" } }),
      history: await db.ticketStatusHistory.findMany({ where: owned, orderBy: { id: "asc" } }),
      actions: await db.action.findMany({ where: owned, orderBy: { id: "asc" } }),
      actionHistory: await db.actionHistory.findMany({ where: { action: owned }, orderBy: { id: "asc" } }),
      receipts: await db.mutationReceipt.findMany({ where: owned, orderBy: { id: "asc" } }),
      notes: await db.internalNote.findMany({ where: owned, orderBy: { id: "asc" } }),
      comments: await db.publicComment.findMany({ where: owned, orderBy: { id: "asc" } }),
      attachments: await db.attachment.findMany({ where: owned, orderBy: { id: "asc" } }),
      categories: await db.category.findMany({ where: { id: { in: categories } }, orderBy: { id: "asc" } }),
      system: await db.relatedSystem.findUnique({ where: { id: system.id } }),
    };
  }
  async function cleanup() {
    try {
      if (!guarded) return;
      const owned = { ticketId: { in: parents } }, userIds = users.map(({ id }) => id);
      await db.$transaction([
        db.mutationReceipt.deleteMany({ where: owned }), db.actionHistory.deleteMany({ where: { action: owned } }),
        db.action.deleteMany({ where: owned }), db.ticketStatusHistory.deleteMany({ where: owned }),
        db.internalNote.deleteMany({ where: owned }), db.publicComment.deleteMany({ where: owned }), db.attachment.deleteMany({ where: owned }),
        db.ticket.deleteMany({ where: { id: { in: parents } } }), db.authSession.deleteMany({ where: { userId: { in: userIds } } }),
        db.user.deleteMany({ where: { id: { in: userIds } } }), db.category.deleteMany({ where: { id: { in: categories } } }),
        db.relatedSystem.deleteMany({ where: { id: system?.id ?? -1 } }),
      ]);
      const remaining = await Promise.all([
        db.user.count({ where: { id: { in: userIds } } }), db.authSession.count({ where: { userId: { in: userIds } } }),
        db.ticket.count({ where: { id: { in: parents } } }), db.ticketStatusHistory.count({ where: owned }),
        db.action.count({ where: owned }), db.actionHistory.count({ where: { action: owned } }), db.mutationReceipt.count({ where: owned }),
        db.category.count({ where: { id: { in: categories } } }), db.relatedSystem.count({ where: { id: system?.id ?? -1 } }),
      ]);
      safeEqual(remaining, Array(9).fill(0), "Zero owned snapshot records/sessions/references after cleanup");
      console.info("Staff snapshot cleanup: zero owned records; no fault/schema resources or credential environment changes; client disconnects.");
    } finally { await db.$disconnect(); }
  }
  return { setup, cleanup, cohort, state,
    readerId: () => users[0]!.id, writerId: () => users[1]!.id,
    read: (path: string, params: URLSearchParams) => request(app).get(`${path}?${params.toString()}`).set("Cookie", readerCookie),
    write: (method: "post" | "patch", path: string, body: Record<string, unknown>) => request(app)[method](path)
      .set("Cookie", writerCookie).set("Origin", APPROVED_ORIGIN).set("X-CSRF-Token", writerCsrf).send(body),
  };
}

import { APPROVED_ORIGIN, cookieValue } from "../lab-03/auth-test-helpers.js";
