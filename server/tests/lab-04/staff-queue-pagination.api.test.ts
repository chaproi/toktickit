import { randomUUID } from "node:crypto";
import type { Prisma, RequestedPriority, TicketStatus } from "@prisma/client";
import { Client } from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { cookieHeader, createAuthUser, loginRequest } from "../lab-03/auth-test-helpers.js";
import { verifiedTestTarget } from "./migration-test-fixtures.js";

// Ordinary OP-19 semantics; T-47 diagnosis regression, not a latency benchmark.
const marker = `queue49-${randomUUID().slice(0, 8)}`;
const db = getPrisma();
const users: number[] = [], tickets: number[] = [], categories: number[] = [], systems: number[] = [];
let staff: number, administrator: number, inactive: number, demoted: number, cookie: string;
const ids: number[] = [];
let originalTickets: unknown;
type Row = { id: number; owner: { id: number; name: string; role: string } | null; summary: string };
type Body = { items: Row[]; counts: { matching: number; mine: number; unassigned: number };
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number;
    hasPreviousPage: boolean; hasNextPage: boolean } };
type Retrieval = { kind: string; ids: number[]; transaction: boolean };
let capture: Retrieval[] | null = null;
const snapshots: Array<{ isolation: string; readOnly: string }> = [];
const aggregates: Array<{ rows: number; transaction: boolean }> = [];

// Pass-through middleware observes actual returned Ticket projections/page IDs.
// No successful result, query argument, authorization or transaction is replaced.
db.$use(async (params, next) => {
  const result: unknown = await next(params);
  if (capture && params.action === "queryRaw" && Array.isArray(result) && result.length === 1 &&
      result[0] !== null && typeof result[0] === "object" && "matching" in result[0]) {
    aggregates.push({ rows: result.length, transaction: params.runInTransaction });
  }
  if (capture && Array.isArray(result) &&
      ((params.model === "Ticket" && params.action === "findMany") ||
       (params.action === "queryRaw" && result.length > 0 && result.every(row =>
         row !== null && typeof row === "object" && "id" in row && typeof row.id === "number")))) {
    capture.push({ kind: params.model === "Ticket" ? "projection" : "page IDs",
      ids: result.map(row => row.id as number), transaction: params.runInTransaction });
  }
  return result;
});

beforeAll(async () => {
  const target = verifiedTestTarget();
  const probe = new Client({ connectionString: target.databaseUrl });
  try {
    await probe.connect();
    const live = await probe.query("SELECT current_database() AS database, current_schema() AS schema");
    expect(live.rows[0]).toEqual({ database: target.identity.databaseName, schema: target.identity.schema });
  } finally { await probe.end(); }

  // IDs are tracked immediately, before login or any subsequent fixture step.
  const actor = await createAuthUser({ role: "IT_STAFF" }); users.push(actor.user.id); staff = actor.user.id;
  const login = await loginRequest(actor.user.email, actor.password).expect(200);
  cookie = cookieHeader(login.headers["set-cookie"]);
  const admin = await createAuthUser({ role: "ADMINISTRATOR" }); users.push(admin.user.id); administrator = admin.user.id;
  const requester = await createAuthUser(); users.push(requester.user.id);
  const oldWorker = await createAuthUser({ role: "IT_STAFF", isActive: false }); users.push(oldWorker.user.id); inactive = oldWorker.user.id;
  const oldOwner = await createAuthUser(); users.push(oldOwner.user.id); demoted = oldOwner.user.id;
  for (const suffix of ["main", "decoy"]) {
    const category = await db.category.create({ data: { name: `${marker}-${suffix}` } }); categories.push(category.id);
    const system = await db.relatedSystem.create({ data: { name: `${marker}-${suffix}` } }); systems.push(system.id);
  }
  const states: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED", "RESOLVED", "CLOSED", "CANCELLED"];
  const priorities: RequestedPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
  for (let index = 0; index < 63; index++) {
    // Historical ineligible owners occur only on terminal parents. These are
    // directly constructed read fixtures, not workflow-endpoint evidence.
    const owner = [null, staff, administrator, inactive, demoted][index % 5];
    const historical = index % 5 >= 3;
    const ticket = await db.ticket.create({ data: {
      ticketNumber: `Q49-${marker.slice(-8)}-${String(index).padStart(3, "0")}`,
      clientSubmissionId: randomUUID(), requesterId: requester.user.id,
      categoryId: categories[index === 60 ? 1 : 0]!, relatedSystemId: systems[index === 61 ? 1 : 0]!,
      summary: `${index === 62 ? "outside" : marker} ${index < 30 ? "literal %_\\" : "ordinary"} ${index}`,
      description: "Synthetic ordinary Queue pagination fixture.",
      currentStatus: historical ? (index % 5 === 3 ? "CLOSED" : "CANCELLED") : states[index % 8]!,
      requestedPriority: priorities[index % 4]!, itPriority: priorities[3 - index % 4]!, ownerId: owner,
      ticketDate: new Date("2026-01-01T00:00:00.000Z"), updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    } });
    tickets.push(ticket.id); if (index < 60) ids.push(ticket.id);
  }
  originalTickets = await db.ticket.findMany({ where: { id: { in: tickets } }, orderBy: { id: "asc" } });
});

afterAll(async () => {
  capture = null; vi.restoreAllMocks();
  try {
    const finalTickets = await db.ticket.findMany({ where: { id: { in: tickets } }, orderBy: { id: "asc" } });
    await db.ticket.deleteMany({ where: { id: { in: tickets } } });
    await db.authSession.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.category.deleteMany({ where: { id: { in: categories } } });
    await db.relatedSystem.deleteMany({ where: { id: { in: systems } } });
    expect(await db.ticket.count({ where: { id: { in: tickets } } })).toBe(0);
    expect(await db.authSession.count({ where: { userId: { in: users } } })).toBe(0);
    expect(await db.user.count({ where: { id: { in: users } } })).toBe(0);
    expect(await db.category.count({ where: { id: { in: categories } } })).toBe(0);
    expect(await db.relatedSystem.count({ where: { id: { in: systems } } })).toBe(0);
    if (originalTickets) expect(finalTickets).toEqual(originalTickets);
    console.info("Queue pagination cleanup: owned Tickets/users/sessions/reference rows=0; observers restored.");
  } finally { await db.$disconnect(); }
});

const ascending = Array.from({ length: 60 }, (_, index) => index);
const unassigned = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const mine = [1, 6, 11, 16, 21, 26, 31, 36, 41, 46, 51, 56];
const other = [2, 7, 12, 17, 22, 27, 32, 37, 42, 47, 52, 57];

async function read(extra: Record<string, string | number> = {}) {
  const response = await request(app).get("/api/staff/tickets").set("Cookie", cookie).query({
    categoryId: categories[0], relatedSystemId: systems[0], search: marker, pageSize: 10, ...extra,
  }).expect(200);
  expect(response.headers["cache-control"]).toBe("private, no-store");
  for (const row of response.body.items as Row[]) {
    expect(row.summary).toContain(marker);
    if (row.owner) expect(Object.keys(row.owner).sort()).toEqual(["id", "name", "role"]);
    expect(row).not.toHaveProperty("description");
    expect(row).not.toHaveProperty("passwordHash");
  }
  return response.body as Body;
}

function page(body: Body, indices: number[], number = 1, size = 10, counts = { mine: 12, unassigned: 12 }) {
  expect(body.items.map(row => row.id)).toEqual(indices.slice((number - 1) * size, number * size).map(index => ids[index]));
  expect(body.counts).toEqual({ matching: indices.length, ...counts });
  expect(body.pagination).toEqual({ page: number, pageSize: size, totalItems: indices.length,
    totalPages: Math.ceil(indices.length / size), hasPreviousPage: indices.length > 0 && number > 1,
    hasNextPage: indices.length > 0 && number < Math.ceil(indices.length / size) });
}

describe("ordinary Staff Queue database pagination", () => {
  it.each(["all", "unassigned", "me", "explicit", "inactive", "demoted"])("%s owner scope, exact pages and replacement counters", async scope => {
    const owner = scope === "all" ? "" : scope === "explicit" ? administrator : scope === "inactive" ? inactive : scope === "demoted" ? demoted : scope;
    const expected = (scope === "all" ? ascending : scope === "unassigned" ? unassigned : scope === "me" ? mine : scope === "explicit" ? other : []).slice().reverse();
    for (let number = 1; number <= Math.max(1, Math.ceil(expected.length / 10)); number++) {
      page(await read({ owner, page: number }), expected, number);
    }
  });

  it("retains every intersecting base predicate when replacing the selected owner", async () => {
    // Literal wildcard characters are ordinary search text. Matching indices
    // 2,10,26 have IN_PROGRESS/HIGH/MEDIUM; 18 is historical CLOSED.
    const filters = { search: `${marker} literal %_\\`, requestedPriority: "HIGH", itPriority: "MEDIUM", currentStatus: "IN_PROGRESS" };
    page(await read({ ...filters, owner: "me" }), [26], 1, 10, { mine: 1, unassigned: 1 });
    page(await read({ ...filters, owner: administrator }), [2], 1, 10, { mine: 1, unassigned: 1 });
    page(await read({ ...filters, owner: "unassigned" }), [10], 1, 10, { mine: 1, unassigned: 1 });
  });

  it("all includes inactive/demoted historical owners and terminal unassigned Tickets", async () => {
    const found: Row[] = [];
    for (let number = 1; number <= 6; number++) found.push(...(await read({ page: number })).items);
    expect(found.find(row => row.id === ids[3])?.owner?.id).toBe(inactive);
    expect(found.find(row => row.id === ids[4])?.owner?.id).toBe(demoted);
    expect(found.find(row => row.id === ids[15])?.owner).toBeNull(); // CANCELLED
    expect(found.find(row => row.id === ids[30])?.owner).toBeNull(); // CLOSED
  });

  it.each([10, 25, 50])("page size %i and beyond-final metadata", async size => {
    const expected = ascending.slice().reverse();
    for (let number = 1; number <= Math.ceil(60 / size) + 1; number++) {
      page(await read({ page: number, pageSize: size }), expected, number, size);
    }
  });

  it("empty results and a safe-integer page avoid unsafe offsets", async () => {
    page(await read({ search: `${marker}-absent` }), [], 1, 10, { mine: 0, unassigned: 0 });
    page(await read({ page: Number.MAX_SAFE_INTEGER }), ascending.slice().reverse(), Number.MAX_SAFE_INTEGER);
  });

  it.each(["ticketNumber", "ticketDate", "updatedAt"])("%s ascending/descending pages retain same-direction ID ties", async sortBy => {
    for (const direction of ["asc", "desc"]) {
      const expected = direction === "asc" ? ascending : ascending.slice().reverse();
      for (const number of [1, 2, 6]) page(await read({ sortBy, sortOrder: direction, page: number }), expected, number);
    }
  });

  it.each(["requestedPriority", "itPriority", "currentStatus"])("%s uses independent business ranks across all pages", async sortBy => {
    const priorityBuckets = [
      [0,4,8,12,16,20,24,28,32,36,40,44,48,52,56],
      [1,5,9,13,17,21,25,29,33,37,41,45,49,53,57],
      [2,6,10,14,18,22,26,30,34,38,42,46,50,54,58],
      [3,7,11,15,19,23,27,31,35,39,43,47,51,55,59],
    ];
    // Terminal historical owners override their source index's normal state.
    const statusBuckets = [[0,16,32,40,56],[1,17,25,41,57],[2,10,26,42,50],
      [11,27,35,51],[12,20,36,52],[5,21,37,45],[3,6,8,13,18,22,23,28,30,33,38,43,46,48,53,58],
      [4,7,9,14,15,19,24,29,31,34,39,44,47,49,54,55,59]];
    const buckets = sortBy === "currentStatus" ? statusBuckets : sortBy === "itPriority" ? priorityBuckets.slice().reverse() : priorityBuckets;
    const ordered = buckets.flat();
    expect(new Set(ordered).size).toBe(60);
    for (const direction of ["asc", "desc"]) {
      const expected = direction === "asc" ? ordered : ordered.slice().reverse();
      for (let number = 1; number <= 6; number++) page(await read({ sortBy, sortOrder: direction, page: number }), expected, number);
    }
  });

  it("retrieves only the actual page IDs/projections inside one read-only REPEATABLE READ snapshot", async () => {
    const original = db.$transaction.bind(db);
    const spy = vi.spyOn(db, "$transaction").mockImplementation((...args: unknown[]) => {
      if (typeof args[0] !== "function") return Reflect.apply(original, db, args);
      const callback = args[0] as (tx: Prisma.TransactionClient) => Promise<unknown>;
      return Reflect.apply(original, db, [async (tx: Prisma.TransactionClient) => {
        const result = await callback(tx);
        const [state] = await tx.$queryRaw<Array<{ isolation: string; readOnly: string }>>`
          SELECT current_setting('transaction_isolation') AS isolation, current_setting('transaction_read_only') AS "readOnly"`;
        snapshots.push(state);
        return result;
      }, ...args.slice(1)]);
    });
    try {
      const requests: Array<Record<string, string | number> & { page: number }> =
        [{ page: 1 }, { page: 2 }, { page: 6 }, { page: 7 }, { owner: "me", page: 2 },
          { page: 2, pageSize: 25 }, { page: 2, pageSize: 50 }];
      for (const options of requests) {
        capture = []; snapshots.length = 0; aggregates.length = 0;
        const body = await read(options);
        const observed = capture;
        capture = null;
        const size = Number(options.pageSize ?? 10);
        page(body, "owner" in options ? mine.slice().reverse() : ascending.slice().reverse(), options.page, size);
        console.info(JSON.stringify({ queueRetrieval: options, returned: body.items.length,
          observed: observed.map(row => ({ kind: row.kind, rows: row.ids.length, transaction: row.transaction })), aggregates, snapshots }));
        // This assertion measures resolved result cardinality, not supplied take.
        expect(observed.every(row => row.ids.length <= size), "actual Ticket/page-ID retrieval exceeds pageSize").toBe(true);
        expect(observed.every(row => row.ids.every(id => body.items.some(item => item.id === id)))).toBe(true);
        expect(observed.every(row => row.transaction)).toBe(true);
        expect(snapshots).toEqual([{ isolation: "repeatable read", readOnly: "on" }]);
        expect(aggregates).toEqual([{ rows: 1, transaction: true }]);
        if (body.items.length) expect(observed.some(row => row.kind === "projection" && row.ids.length === body.items.length)).toBe(true);
      }
    } finally { capture = null; spy.mockRestore(); }
  });
});
