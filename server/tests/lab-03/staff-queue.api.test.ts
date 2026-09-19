import { randomUUID } from "node:crypto";
import type { RequestedPriority, TicketStatus } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../../src/app.js";
import { hashPassword } from "../../src/auth/password.js";
import { getPrisma } from "../../src/prisma.js";
import {
  authenticatedFixture,
  cleanupIssue29Fixtures,
  type AuthenticatedFixture,
} from "./issue29-test-helpers.js";
import { syntheticPassword } from "./auth-test-helpers.js";

const marker = `issue31-${randomUUID().slice(0, 8)}`;
const statusOrder: TicketStatus[] = [
  "NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER",
  "REOPENED", "RESOLVED", "CLOSED", "CANCELLED",
];
const priorityOrder: RequestedPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

let staff: AuthenticatedFixture;
let administrator: AuthenticatedFixture;
let requesterA: AuthenticatedFixture;
let requesterB: AuthenticatedFixture;
let inactiveStaffId: number;
let categoryIds: number[];
let systemIds: number[];
let ticketIds: number[] = [];

function authenticatedGet(path: string, fixture: AuthenticatedFixture) {
  return request(app).get(path).set("Cookie", fixture.cookie);
}

beforeAll(async () => {
  staff = await authenticatedFixture({ role: "IT_STAFF", label: `${marker}-staff` });
  administrator = await authenticatedFixture({ role: "ADMINISTRATOR", label: `${marker}-admin` });
  requesterA = await authenticatedFixture({ label: `${marker}-requester-alpha` });
  requesterB = await authenticatedFixture({ label: `${marker}-requester-beta` });
  const prisma = getPrisma();
  const inactive = await prisma.user.create({
    data: {
      name: `${marker} Inactive Support`,
      email: `issue29-${marker}-inactive@example.test`,
      role: "IT_STAFF",
      isActive: false,
      mustChangePassword: false,
      passwordHash: await hashPassword(syntheticPassword()),
    },
  });
  inactiveStaffId = inactive.id;
  categoryIds = (await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { id: "asc" },
    take: 2,
    select: { id: true },
  })).map(({ id }) => id);
  systemIds = (await prisma.relatedSystem.findMany({
    where: { isActive: true },
    orderBy: { id: "asc" },
    take: 2,
    select: { id: true },
  })).map(({ id }) => id);
  if (categoryIds.length < 2 || systemIds.length < 2) {
    throw new Error("Issue #31 Queue tests require two active Categories and Related Systems.");
  }

  for (let index = 0; index < 12; index += 1) {
    const status = statusOrder[index % statusOrder.length]!;
    const requestedPriority = priorityOrder[index % priorityOrder.length]!;
    const itPriority = priorityOrder[priorityOrder.length - 1 - (index % priorityOrder.length)]!;
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `Q31-${index.toString().padStart(2, "0")}-${marker.slice(-8)}`,
        ticketDate: new Date(Date.UTC(2026, 0, 1 + (index % 4))),
        clientSubmissionId: randomUUID(),
        requesterId: index % 2 === 0 ? requesterA.user.id : requesterB.user.id,
        categoryId: categoryIds[index % 2]!,
        relatedSystemId: systemIds[(index + 1) % 2]!,
        requestedPriority,
        itPriority,
        currentStatus: status,
        ownerId: index % 3 === 0 ? null : index % 3 === 1 ? staff.user.id : administrator.user.id,
        summary: `${marker} Queue summary ${index}`,
        description: "Synthetic secure Queue fixture.",
        requesterResolutionIndicatedAt: index === 5 ? new Date("2026-02-01T00:00:00.000Z") : null,
        requesterResolutionIndicatedById: index === 5 ? requesterA.user.id : null,
        createdAt: new Date(Date.UTC(2026, 1, 1, 0, index)),
        updatedAt: new Date(Date.UTC(2026, 2, 1, 0, Math.floor(index / 2))),
      },
    });
    ticketIds.push(ticket.id);
  }
});

afterAll(async () => {
  const prisma = getPrisma();
  await prisma.authSession.deleteMany({ where: { userId: inactiveStaffId } });
  await prisma.user.deleteMany({ where: { id: inactiveStaffId } });
  await cleanupIssue29Fixtures();
  ticketIds = [];
});

describe("API-09 Staff Ticket Queue and OP-21 assignees", () => {
  it("authorizes only live IT Staff and Administrators without returning Ticket data on denial", async () => {
    const unauthenticated = await request(app).get(`/api/staff/tickets?search=${marker}`);
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body).toEqual({
      error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication is required." },
    });
    expect(JSON.stringify(unauthenticated.body)).not.toContain(marker);

    const forbidden = await authenticatedGet(`/api/staff/tickets?search=${marker}`, requesterA);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual({
      error: { code: "ROLE_FORBIDDEN", message: "You do not have permission to perform this action." },
    });
    expect(JSON.stringify(forbidden.body)).not.toContain(marker);

    for (const actor of [staff, administrator]) {
      const response = await authenticatedGet(`/api/staff/tickets?search=${marker}&pageSize=50`, actor);
      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(12);
    }
  });

  it("returns the exact safe Queue DTO, default ordering, counts, and pagination", async () => {
    const response = await authenticatedGet(`/api/staff/tickets?search=${marker}`, staff);
    expect(response.status).toBe(200);
    expect(response.body.pagination).toEqual({
      page: 1,
      pageSize: 10,
      totalItems: 12,
      totalPages: 2,
      hasPreviousPage: false,
      hasNextPage: true,
    });
    expect(response.body.counts).toEqual({ matching: 12, unassigned: 4, mine: 4 });
    expect(response.body.items).toHaveLength(10);
    const ids = response.body.items.map((item: { id: number }) => item.id);
    const expected = [...ticketIds].sort((a, b) => b - a).slice(0, 10);
    expect(ids).toEqual(expected);

    const item = response.body.items[0];
    expect(Object.keys(item).sort()).toEqual([
      "category", "currentStatus", "id", "itPriority", "owner",
      "relatedSystem", "requestedPriority", "requester",
      "requesterResolutionIndicatedAt", "summary", "ticketDate",
      "ticketNumber", "updatedAt",
    ].sort());
    expect(Object.keys(item.requester).sort()).toEqual(["email", "id", "name"]);
    if (item.owner) expect(Object.keys(item.owner).sort()).toEqual(["id", "name", "role"]);
    expect(item).not.toHaveProperty("description");
    expect(JSON.stringify(item)).not.toMatch(/password|hash|session|cookie|token|internalNote|storageKey/i);
  });

  it("searches Ticket Number, Summary, Requester name, and Requester email case-insensitively", async () => {
    const prisma = getPrisma();
    const first = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticketIds[0] },
      include: { requester: true },
    });
    for (const search of [
      first.ticketNumber.toLowerCase(),
      "QUEUE SUMMARY 0",
      first.requester.name.toUpperCase(),
      first.requester.email.toUpperCase(),
    ]) {
      const response = await authenticatedGet(
        `/api/staff/tickets?search=${encodeURIComponent(search)}&pageSize=50`,
        staff,
      );
      expect(response.status).toBe(200);
      expect(response.body.items.map((item: { id: number }) => item.id)).toContain(first.id);
    }
  });

  it("applies every Queue filter and owner form with meaningful replacement counts", async () => {
    const cases: Array<[string, (item: Record<string, any>) => boolean]> = [
      [`categoryId=${categoryIds[0]}`, (item) => item.category.id === categoryIds[0]],
      [`relatedSystemId=${systemIds[0]}`, (item) => item.relatedSystem.id === systemIds[0]],
      ["requestedPriority=HIGH", (item) => item.requestedPriority === "HIGH"],
      ["itPriority=HIGH", (item) => item.itPriority === "HIGH"],
      ["currentStatus=REOPENED", (item) => item.currentStatus === "REOPENED"],
      ["owner=unassigned", (item) => item.owner === null],
      ["owner=me", (item) => item.owner?.id === staff.user.id],
      [`owner=${administrator.user.id}`, (item) => item.owner?.id === administrator.user.id],
    ];
    for (const [parameter, predicate] of cases) {
      const response = await authenticatedGet(
        `/api/staff/tickets?search=${marker}&${parameter}&pageSize=50`,
        staff,
      );
      expect(response.status).toBe(200);
      expect(response.body.items.length).toBeGreaterThan(0);
      expect(response.body.items.every(predicate)).toBe(true);
      expect(response.body.counts.matching).toBe(response.body.items.length);
    }

    const ownerFiltered = await authenticatedGet(
      `/api/staff/tickets?search=${marker}&owner=unassigned&pageSize=50`,
      staff,
    );
    expect(ownerFiltered.body.counts).toEqual({ matching: 4, unassigned: 4, mine: 4 });
  });

  it("uses every approved business sort with the same-direction id tie-breaker", async () => {
    const prisma = getPrisma();
    const records = await prisma.ticket.findMany({ where: { id: { in: ticketIds } } });
    const rank = (value: string, order: string[]) => order.indexOf(value);
    const value = (ticket: typeof records[number], sortBy: string): string | number => {
      if (sortBy === "requestedPriority" || sortBy === "itPriority") return rank(ticket[sortBy], priorityOrder);
      if (sortBy === "currentStatus") return rank(ticket.currentStatus, statusOrder);
      if (sortBy === "ticketDate" || sortBy === "updatedAt") return ticket[sortBy].getTime();
      return ticket.ticketNumber;
    };
    for (const sortBy of [
      "ticketNumber", "ticketDate", "updatedAt",
      "requestedPriority", "itPriority", "currentStatus",
    ]) {
      for (const sortOrder of ["asc", "desc"]) {
        const direction = sortOrder === "asc" ? 1 : -1;
        const expected = [...records].sort((left, right) => {
          const first = value(left, sortBy);
          const second = value(right, sortBy);
          const primary = typeof first === "string"
            ? first.localeCompare(String(second))
            : first - Number(second);
          return primary === 0 ? (left.id - right.id) * direction : primary * direction;
        }).map(({ id }) => id);
        const response = await authenticatedGet(
          `/api/staff/tickets?search=${marker}&sortBy=${sortBy}&sortOrder=${sortOrder}&pageSize=50`,
          staff,
        );
        expect(response.status).toBe(200);
        expect(response.body.items.map((item: { id: number }) => item.id)).toEqual(expected);
      }
    }
  });

  it("returns exact pagination including an empty out-of-range page and valid unmatched references", async () => {
    const secondPage = await authenticatedGet(
      `/api/staff/tickets?search=${marker}&page=2&pageSize=10`, staff,
    );
    expect(secondPage.status).toBe(200);
    expect(secondPage.body.items).toHaveLength(2);
    expect(secondPage.body.pagination).toEqual({
      page: 2, pageSize: 10, totalItems: 12, totalPages: 2,
      hasPreviousPage: true, hasNextPage: false,
    });

    const beyond = await authenticatedGet(
      `/api/staff/tickets?search=${marker}&page=9&pageSize=10`, staff,
    );
    expect(beyond.status).toBe(200);
    expect(beyond.body.items).toEqual([]);
    expect(beyond.body.pagination).toMatchObject({ page: 9, totalItems: 12, totalPages: 2 });

    const unmatched = await authenticatedGet(
      `/api/staff/tickets?categoryId=2147483647`, staff,
    );
    expect(unmatched.status).toBe(200);
    expect(unmatched.body).toMatchObject({
      items: [], counts: { matching: 0, unassigned: 0, mine: 0 },
      pagination: { page: 1, totalItems: 0, totalPages: 0 },
    });
  });

  it.each([
    "unknown=value",
    "page=1&page=2",
    "search=" + "x".repeat(101),
    "categoryId=0",
    "relatedSystemId=1.5",
    "requestedPriority=CRITICAL",
    "itPriority=CRITICAL",
    "currentStatus=ASSIGNED",
    "owner=requester",
    "sortBy=summary",
    "sortOrder=sideways",
    "page=0",
    "pageSize=20",
  ])("returns exact 400 INVALID_QUERY for %s", async (query) => {
    const response = await authenticatedGet(`/api/staff/tickets?${query}`, staff);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_QUERY");
    expect(response.body).not.toHaveProperty("items");
  });

  it("returns only active Staff/Admin assignee summaries in stable order and permits an empty result", async () => {
    const response = await authenticatedGet("/api/staff/assignees", staff);
    expect(response.status).toBe(200);
    const items = response.body.items as Array<Record<string, unknown>>;
    expect(items.some(({ id }) => id === staff.user.id)).toBe(true);
    expect(items.some(({ id }) => id === administrator.user.id)).toBe(true);
    expect(items.some(({ id }) => id === requesterA.user.id || id === inactiveStaffId)).toBe(false);
    expect(items.every((item) => Object.keys(item).sort().join(",") === "id,name,role")).toBe(true);
    expect(items.every(({ role }) => role === "IT_STAFF" || role === "ADMINISTRATOR")).toBe(true);
    expect(items).toEqual([...items].sort((left, right) =>
      String(left.name).localeCompare(String(right.name)) || Number(left.id) - Number(right.id)));

    const prisma = getPrisma();
    const findMany = vi.spyOn(prisma.user, "findMany").mockResolvedValueOnce([] as never);
    const empty = await authenticatedGet("/api/staff/assignees", staff);
    findMany.mockRestore();
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({ items: [] });

    const requesterDenied = await authenticatedGet("/api/staff/assignees", requesterA);
    expect(requesterDenied.status).toBe(403);
    expect(JSON.stringify(requesterDenied.body)).not.toContain(staff.user.email);
    expect((await request(app).get("/api/staff/assignees")).status).toBe(401);
  });

  it("performs no Ticket mutation while loading, searching, filtering, sorting, or paging", async () => {
    const prisma = getPrisma();
    const before = await prisma.ticket.findMany({
      where: { id: { in: ticketIds } },
      orderBy: { id: "asc" },
    });
    for (const path of [
      `/api/staff/tickets?search=${marker}`,
      `/api/staff/tickets?search=${marker}&owner=me`,
      `/api/staff/tickets?search=${marker}&sortBy=currentStatus&sortOrder=asc`,
      `/api/staff/tickets?search=${marker}&page=2&pageSize=10`,
    ]) {
      expect((await authenticatedGet(path, staff)).status).toBe(200);
    }
    const after = await prisma.ticket.findMany({
      where: { id: { in: ticketIds } },
      orderBy: { id: "asc" },
    });
    expect(after).toEqual(before);
  });
});
