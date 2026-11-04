import { randomBytes, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { expect, test as base } from "@playwright/test";
import type { Action, Ticket, TicketStatus, UserRole } from "../../server/node_modules/@prisma/client/index.js";
import { hashPassword } from "../../server/src/auth/password.js";
import { getPrisma } from "../../server/src/prisma.js";
import { configureTestDatabaseEnvironment } from "../../server/src/testing/test-database.js";
import { historySnapshot } from "./action-browser-fixtures.js";
export { loginDashboardActor as login } from "./requester-dashboard-browser-fixtures.js";

type Actor = { id: number; name: string; email: string; password: string };
export type StaffBrowserFixture = {
  prisma: ReturnType<typeof getPrisma>; a: Actor; b: Actor; c: Actor; requester: Actor;
  category: { id: number; name: string }; emptyCategory: { id: number; name: string }; system: { id: number; name: string };
  tickets: Map<string, Ticket>; actions: Map<string, Action>; pageErrors: string[];
};
function safeError(stage: string, error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" && /^(P\d{4}|[A-Z0-9]{5})$/.test(error.code) ? error.code : "UNCLASSIFIED";
  return new Error(`Staff browser fixture ${stage} failed (${code}); sensitive details withheld.`);
}

// Independent read cohorts. These historical edges are constructed directly;
// no claim that workflow endpoints created them or that a browser read is a race.
export const test = base.extend<{ staffFixture: StaffBrowserFixture }>({
  staffFixture: async ({ page }, use) => {
    const identity = configureTestDatabaseEnvironment(), operational = process.env.TOKTICKIT_DEVELOPMENT_DATABASE_URL;
    if (!operational || decodeURIComponent(new URL(operational).pathname.slice(1)) === identity.databaseName ||
        identity.schema !== process.env.TOKTICKIT_ISSUE27_TEST_SCHEMA || !/^issue27_suite_[a-f0-9]{32}$/.test(identity.schema)) throw new Error("Refusing fixtures outside the guarded owned test schema.");
    const prisma = getPrisma(), users: number[] = [], parents: number[] = [], categories: number[] = [], systems: number[] = [];
    const tickets = new Map<string, Ticket>(), actions = new Map<string, Action>(), marker = `E48-${randomUUID().slice(0, 8)}`;
    const pageErrors: string[] = [], onError = () => pageErrors.push("Browser page error");
    page.on("pageerror", onError);
    let verified = false;
    const domain = () => Promise.all([
      prisma.ticket.findMany({ where: { id: { in: parents } }, orderBy: { id: "asc" } }),
      prisma.ticketStatusHistory.findMany({ where: { ticketId: { in: parents } }, orderBy: { id: "asc" } }),
      prisma.action.findMany({ where: { ticketId: { in: parents } }, orderBy: { id: "asc" } }),
      prisma.actionHistory.findMany({ where: { action: { ticketId: { in: parents } } }, orderBy: { id: "asc" } }),
      prisma.mutationReceipt.findMany({ where: { ticketId: { in: parents } }, orderBy: { id: "asc" } }),
      prisma.internalNote.findMany({ where: { ticketId: { in: parents } }, orderBy: { id: "asc" } }),
    ]);
    try {
      let f: StaffBrowserFixture;
      try {
        const [live] = await prisma.$queryRaw<Array<{ database: string; schema: string }>>`SELECT current_database() AS database,current_schema() AS schema`;
        if (live?.database !== identity.databaseName || live?.schema !== identity.schema) throw new Error("Live target mismatch");
        verified = true;
        const user = async (role: UserRole, label: string): Promise<Actor> => {
          const password = `Aa1!${randomBytes(18).toString("base64url")}`;
          const person = await prisma.user.create({ data: { name: `${marker} ${label}`, email: `e48-${randomUUID()}@example.test`, role,
            passwordHash: await hashPassword(password), mustChangePassword: false, isActive: true }, select: { id: true, name: true, email: true } });
          users.push(person.id); return { ...person, password };
        };
        const a = await user("IT_STAFF", "Worker A with a long multilingual name ภาษาไทย"), b = await user("ADMINISTRATOR", "Administrator B"),
          c = await user("IT_STAFF", "Creator and performer C"), requester = await user("REQUESTER", "Requester");
        const category = await prisma.category.create({ data: { name: `${marker} Network` } }); categories.push(category.id);
        const emptyCategory = await prisma.category.create({ data: { name: `${marker} Empty` } }); categories.push(emptyCategory.id);
        const system = await prisma.relatedSystem.create({ data: { name: `${marker} VPN` } }); systems.push(system.id);
        const [clock] = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT CURRENT_TIMESTAMP AS now`;
        const ago = (hours: number) => new Date(clock!.now.getTime() - hours * 3_600_000);
        const add = async (key: string, status: TicketStatus, owner: Actor | null, age: number, priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT") => {
          const record = await prisma.ticket.create({ data: { ticketNumber: `${marker}-${parents.length + 1}`, clientSubmissionId: randomUUID(), requesterId: requester.id,
            ownerId: owner?.id ?? null, categoryId: category.id, relatedSystemId: system.id, requestedPriority: "HIGH", itPriority: priority,
            currentStatus: status, summary: `VPN%_ ${key} <script>literal</script> ` + "DiagnosticReference".repeat(4), description: `${marker} detail ${key}`,
            createdAt: ago(720), ticketDate: ago(720), updatedAt: ago(age) } });
          parents.push(record.id); tickets.set(key, record);
          if (status === "NEW" || key === "legacy") return;
          const edges: Array<[TicketStatus, TicketStatus, number]> = status === "CANCELLED" ? [["NEW", "CANCELLED", age]] : [["NEW", "OPEN", 480]];
          if (status === "IN_PROGRESS" || status === "WAITING_FOR_REQUESTER") edges.push(["OPEN", status, age]);
          if (status === "REOPENED") edges.push(["OPEN", "RESOLVED", 240], ["RESOLVED", "REOPENED", age]);
          if (status === "RESOLVED" || status === "CLOSED") edges.push(["OPEN", "RESOLVED", age + 1]);
          if (status === "CLOSED") edges.push(["RESOLVED", "CLOSED", age]);
          await prisma.ticketStatusHistory.createMany({ data: edges.map(([fromStatus, toStatus, hours]) => ({ ticketId: record.id, actorId: b.id,
            fromStatus, toStatus, reason: toStatus === "CANCELLED" ? "Constructed read fixture cancellation" : null, createdAt: ago(hours) })) });
        };
        for (let n = 1; n <= 12; n++) await add(`open-${n}`, "OPEN", n === 12 ? b : a, 1, "MEDIUM");
        await add("new", "NEW", null, 6, "LOW"); await add("progress", "IN_PROGRESS", b, 2, "URGENT");
        await add("waiting", "WAITING_FOR_REQUESTER", null, 3, "HIGH"); await add("reopened", "REOPENED", a, 4, "HIGH");
        await add("resolved", "RESOLVED", b, 5, "MEDIUM"); await add("closed", "CLOSED", b, 240, "URGENT");
        await add("cancelled", "CANCELLED", null, 240, "HIGH"); await add("legacy", "RESOLVED", null, 240, "LOW");
        const action = async (key: string, assignee: Actor, status: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED", age: number, parent: string) => {
          const at = ago(age), start = new Date(at.getTime() + 1), end = new Date(at.getTime() + 2);
          let row = await prisma.action.create({ data: { ticketId: tickets.get(parent)!.id, createdById: c.id, assigneeId: assignee.id,
            description: `${key} literal <script>Action</script> ` + "AssignedDiagnostic".repeat(5), actionAt: at, createdAt: at, updatedAt: at,
            followUpRequired: true, followUpNote: "Informative follow-up retained", attachmentNotes: "<script>inert notes</script>" } });
          await prisma.actionHistory.create({ data: { actionId: row.id, actorId: c.id, event: "ACTION_CREATED", actionVersion: 1, after: historySnapshot(row), createdAt: at } });
          if (status === "IN_PROGRESS" || status === "COMPLETED") {
            const before = row;
            row = await prisma.action.update({ where: { id: row.id }, data: { status: "IN_PROGRESS", version: 2, updatedAt: start } });
            await prisma.actionHistory.create({ data: { actionId: row.id, actorId: c.id, event: "ACTION_STARTED", actionVersion: 2, before: historySnapshot(before), after: historySnapshot(row), createdAt: start } });
          }
          if (status === "COMPLETED" || status === "CANCELLED") {
            const before = row;
            row = await prisma.action.update({ where: { id: row.id }, data: { status, version: before.version + 1, updatedAt: end,
              ...(status === "COMPLETED" ? { performedById: c.id, completedAt: end, result: "Actual historical performer is C" } : { cancelledAt: end, cancellationReason: "Constructed terminal read fixture" }) } });
            await prisma.actionHistory.create({ data: { actionId: row.id, actorId: c.id, event: status === "COMPLETED" ? "ACTION_COMPLETED" : "ACTION_CANCELLED",
              actionVersion: row.version, before: historySnapshot(before), after: historySnapshot(row), createdAt: end } });
          }
          actions.set(key, row);
        };
        for (let n = 1; n <= 6; n++) await action(`A-${n}`, a, n === 2 || n === 5 ? "IN_PROGRESS" : "PLANNED", n < 3 ? 72 : 72 - n, "open-12");
        await action("A-completed", a, "COMPLETED", 80, "closed"); await action("A-cancelled", a, "CANCELLED", 80, "open-12");
        await action("B-planned", b, "PLANNED", 60, "open-1"); await action("B-completed", b, "COMPLETED", 80, "closed");
        await prisma.internalNote.create({ data: { ticketId: tickets.get("open-12")!.id, authorId: c.id, content: `${marker} private Internal Note` } });
        f = { prisma, a, b, c, requester, category, emptyCategory, system, tickets, actions, pageErrors };
      } catch (error) { throw safeError("setup", error); }
      const before = await domain();
      try { await use(f); }
      finally { expect(isDeepStrictEqual(await domain(), before), "Browser reads preserve exact owned domain rows; values withheld").toBe(true); }
    } finally {
      page.off("pageerror", onError);
      try {
        if (verified) {
          await prisma.$transaction([
            prisma.mutationReceipt.deleteMany({ where: { ticketId: { in: parents } } }),
            prisma.actionHistory.deleteMany({ where: { action: { ticketId: { in: parents } } } }), prisma.action.deleteMany({ where: { ticketId: { in: parents } } }),
            prisma.ticketStatusHistory.deleteMany({ where: { ticketId: { in: parents } } }), prisma.internalNote.deleteMany({ where: { ticketId: { in: parents } } }),
            prisma.publicComment.deleteMany({ where: { ticketId: { in: parents } } }), prisma.attachment.deleteMany({ where: { ticketId: { in: parents } } }),
            prisma.ticket.deleteMany({ where: { id: { in: parents } } }), prisma.authSession.deleteMany({ where: { userId: { in: users } } }),
            prisma.user.deleteMany({ where: { id: { in: users } } }), prisma.category.deleteMany({ where: { id: { in: categories } } }), prisma.relatedSystem.deleteMany({ where: { id: { in: systems } } }),
          ]);
          const remaining = await Promise.all([
            prisma.user.count({ where: { id: { in: users } } }), prisma.authSession.count({ where: { userId: { in: users } } }),
            prisma.ticket.count({ where: { id: { in: parents } } }), prisma.action.count({ where: { ticketId: { in: parents } } }),
            prisma.actionHistory.count({ where: { actorId: { in: users } } }), prisma.mutationReceipt.count({ where: { actorId: { in: users } } }),
            prisma.category.count({ where: { id: { in: categories } } }), prisma.relatedSystem.count({ where: { id: { in: systems } } }),
          ]);
          expect(remaining).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
          console.info("Issue48 guarded live schema, exact read preservation, zero owned fixtures/sessions and client disconnection verified.");
        }
      } catch (error) { throw safeError("cleanup", error); }
      finally { await prisma.$disconnect(); }
    }
  },
});
