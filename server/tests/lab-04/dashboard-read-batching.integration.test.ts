import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import request from "supertest";
import { afterAll, beforeAll, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { configureTestDatabaseEnvironment } from "../../src/testing/test-database.js";
import { cookieHeader, createAuthUser, loginRequest } from "../lab-03/auth-test-helpers.js";
import { observeDashboardReads } from "./dashboard-read-observation-test-helper.js";

const marker = randomUUID(), users: number[] = [], tickets: number[] = [];
let observer: ReturnType<typeof observeDashboardReads>, requester: number, worker: number, category: number, system: number;
let requesterCookie: string, staffCookie: string;
const records: unknown[] = [];

beforeAll(async () => {
  const identity = configureTestDatabaseEnvironment();
  observer = observeDashboardReads();
  const db = observer.db;
  const [live] = await db.$queryRaw<Array<{ database: string; schema: string }>>`SELECT current_database() AS database,current_schema() AS schema`;
  expect(live.database === identity.databaseName && live.schema === identity.schema, "Guard matches exact dedicated live target; values withheld").toBe(true);
  expect(new URL(process.env.TOKTICKIT_DEVELOPMENT_DATABASE_URL!).pathname !== new URL(process.env.TEST_DATABASE_URL!).pathname).toBe(true);
  for (const role of ["REQUESTER", "IT_STAFF"] as const) {
    const value = await createAuthUser({ email: `issue49-read-${marker}-${role}@example.test`, role }); users.push(value.user.id);
    const login = await loginRequest(value.user.email, value.password); expect(login.status).toBe(200);
    if (role === "REQUESTER") { requester = value.user.id; requesterCookie = cookieHeader(login.headers["set-cookie"]); }
    else { worker = value.user.id; staffCookie = cookieHeader(login.headers["set-cookie"]); }
  }
  category = (await db.category.create({ data: { name: `read-${marker}` } })).id;
  system = (await db.relatedSystem.create({ data: { name: `read-${marker}` } })).id;
  const [clock] = await db.$queryRaw<Array<{ now: Date }>>`SELECT CURRENT_TIMESTAMP AS now`;
  for (let index = 0; index < 24; index++) {
    const status = index < 8 ? "RESOLVED" : index < 12 ? "WAITING_FOR_REQUESTER" : "OPEN";
    const row = await db.ticket.create({ data: { ticketNumber: `RB-${marker.slice(0, 8)}-${String(index).padStart(2, "0")}`,
      clientSubmissionId: randomUUID(), requesterId: requester, ownerId: worker, categoryId: category, relatedSystemId: system,
      summary: `Literal read <script>summary</script> ${index}`, description: "Private context omitted from lists",
      requestedPriority: "HIGH", itPriority: "MEDIUM", currentStatus: status,
      updatedAt: new Date(clock.now.getTime() - 3_600_000), ticketDate: new Date(clock.now.getTime() - 30 * 86_400_000) } });
    tickets.push(row.id);
    if (status === "RESOLVED") await db.ticketStatusHistory.create({ data: { ticketId: row.id, actorId: worker,
      fromStatus: "OPEN", toStatus: "RESOLVED", reason: null, createdAt: new Date(clock.now.getTime() - 3_600_000) } });
  }
});

it.each([
  { label: "requester.dashboard", path: "/api/dashboard/requester", staff: false, maximumSelects: 3 },
  { label: "requester.tickets.list", path: "/api/tickets", staff: false, maximumSelects: 1 },
  { label: "staff.dashboard", path: "/api/dashboard/staff", staff: true, maximumSelects: 4 },
])("$label combines compatible aggregate/page reads without changing safe results", async ({ label, path, staff, maximumSelects }) => {
  for (let sample = 0; sample < 2; sample++) {
    const measured = await observer.request(`${label}-${sample}`, () => request((req: IncomingMessage, res: ServerResponse) =>
      observer.scope(`${label}-${sample}`, () => app(req, res))).get(path)
      .query({ categoryId: category, ...(path === "/api/tickets" ? { page: 2, pageSize: 10, sortBy: "updatedAt", sortOrder: "desc" } : {}) })
      .set("Cookie", staff ? staffCookie : requesterCookie));
    const response = measured.result;
    expect(response.status).toBe(200);
    if (path === "/api/tickets") {
      expect(response.body.pagination).toMatchObject({ page: 2, pageSize: 10, totalItems: 24, totalPages: 3 });
      expect(response.body.items.map((row: { id: number }) => row.id)).toEqual([...tickets].reverse().slice(10, 20));
    } else {
      expect(response.headers["cache-control"]).toBe("private, no-store");
      expect(response.body.metrics).toMatchObject(staff ? { unassigned: 0, mine: 24, recentUpdated: 24, recentResolved: 8,
        byStatus: { OPEN: 12, WAITING_FOR_REQUESTER: 4, RESOLVED: 8 }, myUnfinishedActions: 0 }
        : { outstanding: 16, needsAttention: 4, recentUpdated: 24, recentResolved: 8 });
      expect(response.body.lists.recentUpdated.map((row: { id: number }) => row.id)).toEqual([...tickets].reverse().slice(0, 5));
      expect(response.body.lists.recentResolved.map((row: { id: number }) => row.id)).toEqual(tickets.slice(0, 8).reverse().slice(0, 5));
    }
    expect(JSON.stringify(response.body)).not.toContain("Private context omitted");
    const business = measured.frame.queries.filter(q => q.business && !["control", "clock"].includes(q.category));
    records.push({ ...measured.frame, label, sample, elapsedMs: measured.elapsedMs, started: undefined,
      businessSelects: business.length, aggregateSelects: business.filter(q => q.aggregate).length });
  }
  const selected = records.filter((r: any) => r.label === label) as Array<{ businessSelects: number; aggregateSelects: number }>;
  // Actual completed driver queries, not mocked call arguments or a latency assertion.
  expect(selected.map(r => r.aggregateSelects), "One combined aggregate/page statement per request").toEqual([1, 1]);
  expect(selected.every(r => r.businessSelects <= maximumSelects), "Bound actual business round trips including safe identity projections").toBe(true);
});

afterAll(async () => {
  if (!observer) return;
  let plans: unknown[] = [];
  try {
    plans = await observer.plans();
    const db = observer.db;
    await db.ticketStatusHistory.deleteMany({ where: { ticketId: { in: tickets } } });
    await db.ticket.deleteMany({ where: { id: { in: tickets } } });
    await db.authSession.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    if (category) await db.category.delete({ where: { id: category } });
    if (system) await db.relatedSystem.delete({ where: { id: system } });
    expect(await db.ticket.count({ where: { id: { in: tickets } } })).toBe(0);
    expect(await db.user.count({ where: { id: { in: users } } })).toBe(0);
  } finally {
    await observer.close();
    const output = resolve("../artifacts/lab-04/hardening", `read-batching-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}.json`);
    mkdirSync(resolve(output, ".."), { recursive: true });
    writeFileSync(output, JSON.stringify({ mode: "six-real-read-requests-not-T47", at: new Date().toISOString(),
      head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim(), records, plans,
      cleanup: { ownedRowsRemoved: true, disconnectedAndSpiesRestored: true } }) + "\n", { flag: "wx" });
  }
});
