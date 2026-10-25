import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Prisma, type Action, type ActionStatus, type Ticket, type TicketStatus, type User } from "@prisma/client";
import request from "supertest";
import { expect } from "vitest";
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
