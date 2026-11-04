import { randomBytes, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { expect, test as base, type Page } from "@playwright/test";
import type { Ticket, TicketStatus, UserRole } from "../../server/node_modules/@prisma/client/index.js";
import { hashPassword } from "../../server/src/auth/password.js";
import { getPrisma } from "../../server/src/prisma.js";
import { configureTestDatabaseEnvironment } from "../../server/src/testing/test-database.js";

export type DashboardActor = { id: number; name: string; email: string; password: string };
export type DashboardBrowserFixture = {
  prisma: ReturnType<typeof getPrisma>; marker: string;
  a: DashboardActor; b: DashboardActor; empty: DashboardActor; archived: DashboardActor;
  staff: DashboardActor; admin: DashboardActor;
  category: { id: number; name: string }; system: { id: number; name: string };
  tickets: Map<string, Ticket>; pageErrors: string[];
};

function safeError(stage: string, error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error &&
    typeof error.code === "string" && /^(P\d{4}|[A-Z0-9]{5})$/.test(error.code) ? error.code : "UNCLASSIFIED";
  return new Error(`Requester Dashboard browser fixture ${stage} failed (${code}); sensitive details withheld.`);
}

export const test = base.extend<{ dashboardFixture: DashboardBrowserFixture }>({
  dashboardFixture: async ({ page }, use) => {
    const identity = configureTestDatabaseEnvironment();
    const operational = process.env.TOKTICKIT_DEVELOPMENT_DATABASE_URL;
    if (!operational || decodeURIComponent(new URL(operational).pathname.slice(1)) === identity.databaseName ||
      identity.schema !== process.env.TOKTICKIT_ISSUE27_TEST_SCHEMA || !/^issue27_suite_[a-f0-9]{32}$/.test(identity.schema)) {
      throw new Error("Refusing Dashboard fixtures outside the guarded dedicated database and exact owned schema.");
    }
    const prisma = getPrisma();
    const userIds: number[] = [], ticketIds: number[] = [], categoryIds: number[] = [], systemIds: number[] = [];
    const marker = `E47-${randomUUID().slice(0, 8)}`;
    const tickets = new Map<string, Ticket>();
    const pageErrors: string[] = [];
    const onError = () => pageErrors.push("Browser page error");
    page.on("pageerror", onError);
    let verified = false;
    const domain = () => Promise.all([
      prisma.ticket.findMany({ where: { id: { in: ticketIds } }, orderBy: { id: "asc" } }),
      prisma.ticketStatusHistory.findMany({ where: { ticketId: { in: ticketIds } }, orderBy: { id: "asc" } }),
      prisma.internalNote.findMany({ where: { ticketId: { in: ticketIds } }, orderBy: { id: "asc" } }),
      prisma.action.findMany({ where: { ticketId: { in: ticketIds } }, orderBy: { id: "asc" } }),
      prisma.actionHistory.findMany({ where: { action: { ticketId: { in: ticketIds } } }, orderBy: { id: "asc" } }),
      prisma.mutationReceipt.findMany({ where: { ticketId: { in: ticketIds } }, orderBy: { id: "asc" } }),
    ]);
    try {
      let fixture: DashboardBrowserFixture;
      try {
        const [live] = await prisma.$queryRaw<Array<{ database: string; schema: string }>>`SELECT current_database() AS database, current_schema() AS schema`;
        if (live?.database !== identity.databaseName || live?.schema !== identity.schema) throw new Error("Live guarded target mismatch.");
        verified = true;
        const user = async (role: UserRole, name: string): Promise<DashboardActor> => {
          const password = `Aa1!${randomBytes(18).toString("base64url")}`;
          const record = await prisma.user.create({ data: {
            name: `${marker} ${name}`, email: `e47-${randomUUID()}@example.test`, role,
            isActive: true, mustChangePassword: false, passwordHash: await hashPassword(password),
          }, select: { id: true, name: true, email: true } });
          userIds.push(record.id);
          return { ...record, password };
        };
        const a = await user("REQUESTER", "Requester A"), b = await user("REQUESTER", "Requester B");
        const archived = await user("REQUESTER", "Archived Tickets");
        const empty = await user("REQUESTER", "No Tickets"), staff = await user("IT_STAFF", "Support"), admin = await user("ADMINISTRATOR", "Administrator");
        const category = await prisma.category.create({ data: { name: `${marker} Network` } }); categoryIds.push(category.id);
        const otherCategory = await prisma.category.create({ data: { name: `${marker} Hardware` } }); categoryIds.push(otherCategory.id);
        const system = await prisma.relatedSystem.create({ data: { name: `${marker} VPN` } }); systemIds.push(system.id);
        const otherSystem = await prisma.relatedSystem.create({ data: { name: `${marker} Email` } }); systemIds.push(otherSystem.id);
        const [clock] = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT CURRENT_TIMESTAMP AS now`;
        const ago = (hours: number) => new Date(clock!.now.getTime() - hours * 3_600_000);
        const add = async (key: string, requester: DashboardActor, status: TicketStatus, age: number,
          variation: "category" | "system" | "requested" | "it" | "search" | undefined = undefined) => {
          const ticket = await prisma.ticket.create({ data: {
            ticketNumber: `E47-${randomUUID().replaceAll("-", "").slice(0, 12)}`,
            clientSubmissionId: randomUUID(), requesterId: requester.id, ownerId: status === "NEW" ? null : staff.id,
            categoryId: variation === "category" ? otherCategory.id : category.id,
            relatedSystemId: variation === "system" ? otherSystem.id : system.id,
            requestedPriority: variation === "requested" ? "LOW" : "HIGH", itPriority: variation === "it" ? "URGENT" : "MEDIUM",
            currentStatus: status,
            // Requester search retains its inherited contains semantics. This
            // decoy has no VPN term; do not impose Staff's literal-LIKE policy.
            summary: `${marker} ${variation === "search" ? "Unrelated-network" : "VPN%_"} ${key} <script>literal</script>`,
            description: `${marker} owned detail ${key}; not a Dashboard summary`,
            ticketDate: ago(30 * 24), createdAt: ago(30 * 24), updatedAt: ago(age),
          } });
          ticketIds.push(ticket.id); tickets.set(key, ticket);
          // Direct read cohorts with valid historical edges, not user-driven workflow evidence.
          const events: Array<{ fromStatus: TicketStatus; toStatus: TicketStatus; createdAt: Date; reason: string | null }> = [];
          const event = (fromStatus: TicketStatus, toStatus: TicketStatus, at: Date, reason: string | null = null) => events.push({ fromStatus, toStatus, createdAt: at, reason });
          if (status === "CANCELLED") event("NEW", "CANCELLED", ticket.updatedAt, "Synthetic read fixture cancellation");
          else if (status !== "NEW") {
            event("NEW", "OPEN", ago(20 * 24));
            if (status === "IN_PROGRESS" || status === "WAITING_FOR_REQUESTER") event("OPEN", status, ticket.updatedAt);
            if (status === "REOPENED") { event("OPEN", "RESOLVED", ago(72)); event("RESOLVED", "REOPENED", ticket.updatedAt); }
            if (status === "RESOLVED" || status === "CLOSED") {
              event("OPEN", "RESOLVED", ago(age > 24 ? 11 * 24 : 8));
              if (status === "CLOSED") event("RESOLVED", "CLOSED", ago(age > 24 ? age : 7));
            }
          }
          if (events.length) await prisma.ticketStatusHistory.createMany({ data: events.map((entry) => ({ ...entry, ticketId: ticket.id, actorId: staff.id })) });
          return ticket;
        };
        for (let n = 1; n <= 12; n++) await add(`A-open-${n}`, a, "OPEN", 1);
        for (const variation of ["category", "system", "requested", "it", "search"] as const) await add(`A-decoy-${variation}`, a, "OPEN", 2, variation);
        await add("A-waiting-1", a, "WAITING_FOR_REQUESTER", 3);
        await add("A-waiting-2", a, "WAITING_FOR_REQUESTER", 3);
        await add("A-progress", a, "IN_PROGRESS", 4);
        await add("A-reopened", a, "REOPENED", 5);
        await add("A-new", a, "NEW", 6);
        for (let n = 1; n <= 6; n++) await add(`A-resolved-${n}`, a, n % 2 === 0 ? "CLOSED" : "RESOLVED", 6);
        await add("A-cancelled", a, "CANCELLED", 10 * 24);
        await add("A-old-resolution", a, "RESOLVED", 10 * 24);
        await add("Archived-old-closed", archived, "CLOSED", 10 * 24);
        await add("B-open", b, "OPEN", 1);
        await add("B-waiting", b, "WAITING_FOR_REQUESTER", 3);
        await add("B-resolved", b, "RESOLVED", 6);
        await add("B-cancelled", b, "CANCELLED", 10 * 24);
        await prisma.internalNote.create({ data: { ticketId: tickets.get("A-open-1")!.id, authorId: staff.id, content: `${marker} private Internal Note` } });
        expect(await prisma.ticket.count({ where: { requesterId: a.id } })).toBe(30);
        expect(await prisma.ticket.count({ where: { requesterId: b.id } })).toBe(4);
        expect(await prisma.ticket.count({ where: { requesterId: empty.id } })).toBe(0);
        expect(await prisma.ticket.count({ where: { requesterId: archived.id } })).toBe(1);
        fixture = { prisma, marker, a, b, empty, archived, staff, admin, category, system, tickets, pageErrors };
      } catch (error) { throw safeError("setup", error); }
      const before = await domain();
      try { await use(fixture); }
      finally {
        expect(isDeepStrictEqual(await domain(), before), "Dashboard browser reads preserve exact owned domain rows; values withheld").toBe(true);
      }
    } finally {
      page.off("pageerror", onError);
      try {
        if (verified) {
          await prisma.$transaction([
            prisma.seedFixture.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { ticketId: { in: ticketIds } }, { categoryId: { in: categoryIds } }, { relatedSystemId: { in: systemIds } }] } }),
            prisma.mutationReceipt.deleteMany({ where: { ticketId: { in: ticketIds } } }),
            prisma.actionHistory.deleteMany({ where: { action: { ticketId: { in: ticketIds } } } }),
            prisma.action.deleteMany({ where: { ticketId: { in: ticketIds } } }),
            prisma.ticketStatusHistory.deleteMany({ where: { ticketId: { in: ticketIds } } }),
            prisma.internalNote.deleteMany({ where: { ticketId: { in: ticketIds } } }),
            prisma.publicComment.deleteMany({ where: { ticketId: { in: ticketIds } } }),
            prisma.attachment.deleteMany({ where: { ticketId: { in: ticketIds } } }),
            prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } }),
            prisma.authSession.deleteMany({ where: { userId: { in: userIds } } }),
            prisma.user.deleteMany({ where: { id: { in: userIds } } }),
            prisma.category.deleteMany({ where: { id: { in: categoryIds } } }),
            prisma.relatedSystem.deleteMany({ where: { id: { in: systemIds } } }),
          ]);
          expect(await Promise.all([
            prisma.ticket.count({ where: { id: { in: ticketIds } } }), prisma.user.count({ where: { id: { in: userIds } } }),
            prisma.authSession.count({ where: { userId: { in: userIds } } }), prisma.ticketStatusHistory.count({ where: { ticketId: { in: ticketIds } } }),
            prisma.internalNote.count({ where: { ticketId: { in: ticketIds } } }), prisma.category.count({ where: { id: { in: categoryIds } } }),
            prisma.relatedSystem.count({ where: { id: { in: systemIds } } }),
          ]), "Only owned Dashboard fixtures and sessions were removed").toEqual([0, 0, 0, 0, 0, 0, 0]);
          console.info("Issue47 dedicated live target, read-only domain preservation and owned fixture/session cleanup verified.");
        }
      } catch (error) { throw safeError("cleanup", error); }
      finally { await prisma.$disconnect(); }
    }
  },
});

export async function loginDashboardActor(page: Page, actor: DashboardActor) {
  try {
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(actor.email);
    await page.getByLabel("Password", { exact: true }).fill(actor.password);
    const [response] = await Promise.all([
      page.waitForResponse((value) => new URL(value.url()).pathname === "/api/auth/login" && value.request().method() === "POST"),
      page.getByRole("button", { name: "Sign in", exact: true }).click(),
    ]);
    expect(response.status()).toBe(200);
    await page.waitForURL((url) => url.pathname !== "/login");
    await expect(page.getByRole("button", { name: "Logout", exact: true })).toBeVisible();
    const authentication = await response.json() as { user: { role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR"; mustChangePassword: boolean } };
    if (!authentication.user.mustChangePassword) {
      // The new role landing itself reads a Dashboard. Finish rendering that
      // document before callers register a response wait and navigate again;
      // otherwise they can capture its now-unavailable response body.
      const requester = authentication.user.role === "REQUESTER";
      await expect(page).toHaveURL(new RegExp(`${requester ? "/dashboard" : "/staff/dashboard"}$`));
      await expect(page.getByRole("heading", { name: requester ? "Requester Dashboard" : "Staff Dashboard", exact: true })).toBeVisible();
      await expect(page.getByText(/As of/)).toBeVisible();
    }
  } catch { throw new Error("Real Dashboard browser login failed; credentials and diagnostics withheld."); }
}
