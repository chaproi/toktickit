import { pathToFileURL } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import {
  Prisma, type PrismaClient,
  type RequestedPriority,
  type TicketStatus,
  type UserRole,
} from "@prisma/client";
import { parseCredentialMapping } from "../src/auth/credential-map.js";
import { hashPassword } from "../src/auth/password.js";
import { formatTicketNumber } from "../src/tickets/ticket-number.js";
import { ACTION_FIXTURES, actionKey, createSeedAction, mutationKey, nextSeedInstant } from "./seed-action-fixtures.js";

export const LAB3_SEEDED_USERS = [
  { name: "Jennifer Anderson", email: "jennifer.anderson@example.com", role: "REQUESTER", isActive: true },
  { name: "Alex Morgan", email: "alex.morgan@example.com", role: "REQUESTER", isActive: true },
  { name: "Priya Shah", email: "priya.shah@example.com", role: "REQUESTER", isActive: true },
  { name: "Daniel Kim", email: "daniel.kim@example.com", role: "REQUESTER", isActive: true },
  { name: "Emily Carter", email: "emily.carter@example.com", role: "REQUESTER", isActive: false },
  { name: "Mina Patel", email: "mina.patel@example.com", role: "IT_STAFF", isActive: true },
  { name: "Noah Williams", email: "noah.williams@example.com", role: "IT_STAFF", isActive: true },
  { name: "Sofia Garcia", email: "sofia.garcia@example.com", role: "IT_STAFF", isActive: true },
  { name: "Inactive Support", email: "inactive.support@example.com", role: "IT_STAFF", isActive: false },
  { name: "Avery Chen", email: "avery.chen@example.com", role: "ADMINISTRATOR", isActive: true },
] as const satisfies ReadonlyArray<{
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
}>;

const SEEDED_TICKETS = [
  { key: "00000000-0000-4000-8000-000000000101", requester: "jennifer.anderson@example.com", status: "NEW", priority: "LOW", owner: null, summary: "Shared printer is unavailable" },
  { key: "00000000-0000-4000-8000-000000000102", requester: "alex.morgan@example.com", status: "OPEN", priority: "MEDIUM", owner: "mina.patel@example.com", summary: "Laptop battery drains quickly" },
  { key: "00000000-0000-4000-8000-000000000103", requester: "priya.shah@example.com", status: "IN_PROGRESS", priority: "HIGH", owner: "noah.williams@example.com", summary: "VPN disconnects during classes" },
  { key: "00000000-0000-4000-8000-000000000104", requester: "daniel.kim@example.com", status: "WAITING_FOR_REQUESTER", priority: "URGENT", owner: "sofia.garcia@example.com", summary: "Grade submission access is blocked" },
  { key: "00000000-0000-4000-8000-000000000105", requester: "jennifer.anderson@example.com", status: "RESOLVED", priority: "MEDIUM", owner: "mina.patel@example.com", summary: "Email profile required repair" },
  { key: "00000000-0000-4000-8000-000000000106", requester: "alex.morgan@example.com", status: "CLOSED", priority: "LOW", owner: "noah.williams@example.com", summary: "Archived software install request" },
  { key: "00000000-0000-4000-8000-000000000107", requester: "priya.shah@example.com", status: "REOPENED", priority: "HIGH", owner: "noah.williams@example.com", summary: "Campus Wi-Fi issue returned" },
  { key: "00000000-0000-4000-8000-000000000108", requester: "daniel.kim@example.com", status: "CANCELLED", priority: "URGENT", owner: null, summary: "Duplicate account access request" },
] as const satisfies ReadonlyArray<{
  key: string;
  requester: string;
  status: TicketStatus;
  priority: RequestedPriority;
  owner: string | null;
  summary: string;
}>;

type Transaction = Prisma.TransactionClient;
type RegistryTarget = "userId" | "categoryId" | "relatedSystemId" | "ticketId" | "actionId";
type SeedUser = { id: number; name: string; email: string; role: UserRole; isActive: boolean };

export class FixtureSeedError extends Error {
  readonly diagnostic: Readonly<{ errorClass: string; code: string | null; stage: "seed.transaction"; elapsedMs: number }>;

  constructor(error: unknown, elapsedMs: number) {
    const classes = new Set(["Error", "PrismaClientKnownRequestError", "PrismaClientUnknownRequestError",
      "PrismaClientInitializationError", "PrismaClientValidationError", "PasswordHashingUnavailableError"]);
    const errorClass = error instanceof Error && classes.has(error.name) ? error.name : "UnknownError";
    const candidate = typeof error === "object" && error !== null && "code" in error ? error.code : null;
    const code = typeof candidate === "string" && /^(?:P\d{4}|[0-9A-Z]{5})$/u.test(candidate) ? candidate : null;
    const diagnostic = Object.freeze({ errorClass, code, stage: "seed.transaction" as const,
      elapsedMs: Number.isFinite(elapsedMs) ? Math.max(0, Math.round(elapsedMs)) : 0 });
    super(`Fixture seeding failed; transaction rolled back; details redacted. ` +
      `[${diagnostic.stage}; ${errorClass}; ${code ?? "unavailable"}; ${diagnostic.elapsedMs}ms]`);
    this.name = "FixtureSeedError";
    this.diagnostic = diagnostic;
    // Never retain the original error/cause, message, metadata or query input.
  }
}

export const seedUserFixtureKey = (email: string) => `lab3:user:${email}`;
export const seedReferenceFixtureKey = (field: "categoryId" | "relatedSystemId", name: string) => `lab3:${field}:${name}`;
const ticketKey = (key: string) => `lab3:ticket:${key}`;
const publicContent = "Fictional requester update for the seeded support scenario.";
const noteContent = "Fictional internal diagnostic note for the seeded support scenario.";
const emptyRequester = {
  name: "Empty Dashboard Requester", email: "empty.dashboard.requester@example.com",
  role: "REQUESTER" as const, isActive: true,
};
const actionFrozen = new Set<TicketStatus>(["RESOLVED", "CLOSED", "CANCELLED"]);

async function registered(transaction: Transaction, key: string, field: RegistryTarget): Promise<number | null> {
  const fixture = await transaction.seedFixture.findUnique({ where: { fixtureKey: key } });
  if (!fixture) return null;
  const id = fixture[field];
  if (id === null) throw new Error("Seed registry target mismatch; manual review required.");
  return id;
}
async function bind(transaction: Transaction, key: string, field: RegistryTarget, id: number) {
  await transaction.seedFixture.create({ data: { fixtureKey: key, [field]: id } });
}

async function nextTicketNumber(transaction: Transaction): Promise<string> {
  const [clock] = await transaction.$queryRaw<Array<{ year: number }>>`
    SELECT extract(year FROM timezone('UTC',clock_timestamp()))::int AS year
  `;
  if (!clock) throw new Error("Seed numbering clock unavailable.");
  const year = clock.year;
  const prefix = `TKT-${year}-`;
  const existing = await transaction.ticket.findMany({ where: { ticketNumber: { startsWith: prefix } }, select: { ticketNumber: true } });
  const minimumNext = Math.max(0, ...existing.map(({ ticketNumber }) => Number(ticketNumber.slice(prefix.length)))) + 1;
  const [sequence] = await transaction.$queryRaw<Array<{ lastValue: number }>>`
    INSERT INTO "TicketNumberSequence" ("year", "lastValue", "updatedAt")
    VALUES (${year}, ${minimumNext}, timezone('UTC',clock_timestamp()))
    ON CONFLICT ("year") DO UPDATE SET "lastValue" = GREATEST(
      "TicketNumberSequence"."lastValue" + 1, EXCLUDED."lastValue"
    ), "updatedAt" = timezone('UTC',clock_timestamp()) RETURNING "lastValue"
  `;
  if (!sequence) throw new Error("Seed Ticket number allocation unavailable.");
  return formatTicketNumber(year, sequence.lastValue);
}

export async function seedDatabase(prisma: PrismaClient): Promise<void> {
  // Keep the inherited ten-key interface; reject invalid mappings before ANY
  // writes. Extra empty-dashboard credentials are random, never published, and
  // require an administrator reset before use. Hash only newly created users.
  const credentials = parseCredentialMapping(process.env.LAB3_SEED_INITIAL_CREDENTIALS,
    LAB3_SEEDED_USERS.map((user) => user.email), "LAB3_SEED_INITIAL_CREDENTIALS");
  let reports: string[];
  const transactionStarted = performance.now();
  try {
    reports = await prisma.$transaction(async (transaction) => {
      const report = new Set<string>();
      const skip = (fixture: string, reason: string) => report.add(`Seed skipped ${fixture}: ${reason}; review required.`);
      // Schema-scoped seed mutex, acquired before reads. READ COMMITTED gives a
      // waiting seed fresh reads after the winner commits; no speculative retry
      // of uniqueness/deadlock errors or change to Lab 3's 40001-only policy.
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(44,hashtext(current_database()||'.'||current_schema()))::text`;
      // Share admin-user email gates before taking ANY User row locks. This
      // prevents concurrent creates/reuse racing missing fixture identities.
      const gates = [...new Set([...LAB3_SEEDED_USERS, emptyRequester].map(({ email }) =>
        createHash("sha256").update(email).digest().readInt32BE(0)))].sort((a, b) => a - b);
      for (const gate of gates) await transaction.$queryRaw`SELECT pg_advisory_xact_lock(3,${gate}::integer)::text`;
      const lockedUsers = await transaction.$queryRaw<SeedUser[]>`
        SELECT id,name,email,role,"isActive" FROM "User" ORDER BY id FOR UPDATE
      `;
      const registry = await transaction.seedFixture.findMany();
      const canCreateUsers = lockedUsers.every((user) => registry.some((entry) => entry.userId === user.id));
      const usersById = new Map(lockedUsers.map((user) => [user.id, user]));
      const users = new Map<string, SeedUser>();
      const legacyTickets = await transaction.ticket.findMany({
        where: { clientSubmissionId: { in: SEEDED_TICKETS.map((fixture) => fixture.key) } },
      });
      const legacyNotes = await transaction.internalNote.findMany({
        where: { content: noteContent, ticket: { clientSubmissionId: SEEDED_TICKETS[1].key } }, select: { authorId: true },
      });
      const legacyReceipts = await transaction.mutationReceipt.findMany({ where: {
        clientMutationId: { in: ACTION_FIXTURES.flatMap((fixture) => ([1, 2, 3, 4] as const).map((operation) => mutationKey(fixture, operation))) },
      }, select: { actorId: true, clientMutationId: true, operation: true, ticketId: true } });
      for (const fixture of [...LAB3_SEEDED_USERS, emptyRequester]) {
        const key = seedUserFixtureKey(fixture.email);
        const knownId = await registered(transaction, key, "userId");
        if (knownId !== null) {
          const user = usersById.get(knownId);
          if (!user) throw new Error("Registered seed User unavailable.");
          users.set(fixture.email, user);
          continue;
        }
        // Immutable requester identity on permanent submission UUIDs and
        // append-only authorship/receipts are evidence. Names/emails/roles,
        // current ownership and assignment alone NEVER select a legacy User.
        const evidence = new Set(legacyTickets.filter((ticket) => SEEDED_TICKETS.some((definition) =>
          definition.key === ticket.clientSubmissionId && definition.requester === fixture.email)).map((ticket) => ticket.requesterId));
        if (fixture.email === "mina.patel@example.com") for (const note of legacyNotes) evidence.add(note.authorId);
        for (const action of ACTION_FIXTURES) for (const receipt of legacyReceipts) {
          if (!legacyTickets.some((ticket) => ticket.id === receipt.ticketId &&
            ticket.clientSubmissionId === SEEDED_TICKETS[action.ticketIndex]!.key)) continue;
          if (action.creator === fixture.email && receipt.operation === "CREATE_ACTION" && receipt.clientMutationId === mutationKey(action, 1)) evidence.add(receipt.actorId);
          if (action.assignee === fixture.email && ([ ["START_ACTION", 2], ["COMPLETE_ACTION", 3], ["CANCEL_ACTION", 4] ] as const)
            .some(([operation, ordinal]) => receipt.operation === operation && receipt.clientMutationId === mutationKey(action, ordinal))) evidence.add(receipt.actorId);
        }
        const verified = evidence.size === 1 ? usersById.get([...evidence][0]!) : undefined;
        if (verified) {
          await bind(transaction, key, "userId", verified.id);
          users.set(fixture.email, verified);
        } else if (!canCreateUsers || evidence.size > 0 || lockedUsers.some((user) =>
          user.email.toLowerCase() === fixture.email.toLowerCase() || user.name === fixture.name)) {
          skip(fixture.name, "legacy identity is ambiguous or lacks durable evidence; no original-email account guessed");
        } else {
          const user = await transaction.user.create({ data: {
            ...fixture, mustChangePassword: true,
            passwordHash: await hashPassword(credentials.get(fixture.email) ?? `Aa1!${randomBytes(32).toString("base64url")}`),
          }, select: { id: true, name: true, email: true, role: true, isActive: true } });
          await bind(transaction, key, "userId", user.id);
          users.set(fixture.email, user);
          usersById.set(user.id, user);
        }
      }
      // All User locks/creates precede references and Ticket locks. Lock
      // reference rows as well so activation cannot change during dependency creation.
      const lockedCategories = await transaction.$queryRaw<Array<{ id: number }>>`SELECT id FROM "Category" ORDER BY id FOR UPDATE`;
      const lockedSystems = await transaction.$queryRaw<Array<{ id: number }>>`SELECT id FROM "RelatedSystem" ORDER BY id FOR UPDATE`;
      const categories = new Map<string, { id: number; isActive: boolean }>();
      const systems = new Map<string, { id: number; isActive: boolean }>();
      for (const [field, names] of [
        ["categoryId", ["Account and Access", "Hardware", "Software", "Network"]],
        ["relatedSystemId", ["Email", "Campus Wi-Fi", "VPN", "LEB2 App", "Grade Submission App", "Printer", "Corporate Laptop"]],
      ] as const) for (const name of names) {
        const key = seedReferenceFixtureKey(field, name);
        let id = await registered(transaction, key, field);
        if (id === null) {
          const evidence = new Set((name === "Hardware" || name === "Corporate Laptop")
            ? legacyTickets.map((ticket) => ticket[field]) : []);
          const existing = field === "categoryId" ? await transaction.category.findUnique({ where: { name } })
            : await transaction.relatedSystem.findUnique({ where: { name } });
          if (evidence.size === 1) id = [...evidence][0]!;
          else if (!(field === "categoryId" ? lockedCategories : lockedSystems)
            .every((row) => registry.some((entry) => entry[field] === row.id)) || existing !== null || evidence.size > 0) {
            skip(key, "legacy reference requires verified identity mapping");
            continue;
          } else id = field === "categoryId" ? (await transaction.category.create({ data: { name } })).id
            : (await transaction.relatedSystem.create({ data: { name } })).id;
          await bind(transaction, key, field, id);
        }
        const row = field === "categoryId" ? await transaction.category.findUniqueOrThrow({ where: { id } })
          : await transaction.relatedSystem.findUniqueOrThrow({ where: { id } });
        (field === "categoryId" ? categories : systems).set(name, row);
      }
      await transaction.$queryRaw`SELECT id FROM "Ticket" ORDER BY id FOR UPDATE`;
      const worker = (email: string) => {
        const user = users.get(email);
        return user?.isActive && ["IT_STAFF", "ADMINISTRATOR"].includes(user.role) ? user : undefined;
      };
      const created = new Set<number>();
      const parents = new Map<number, number>();
      const paths: Record<TicketStatus, TicketStatus[]> = {
        NEW: [], OPEN: ["OPEN"], IN_PROGRESS: ["OPEN", "IN_PROGRESS"],
        WAITING_FOR_REQUESTER: ["OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER"],
        RESOLVED: ["OPEN", "IN_PROGRESS", "RESOLVED"], CLOSED: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
        REOPENED: ["OPEN", "IN_PROGRESS", "RESOLVED", "REOPENED"], CANCELLED: ["CANCELLED"],
      };
      const transition = async (ticketId: number, status: TicketStatus, actorId: number) => {
        const before = await transaction.ticket.findUniqueOrThrow({ where: { id: ticketId } });
        if ((status === "RESOLVED" || status === "CLOSED") && await transaction.action.count({
          where: { ticketId, status: { in: ["PLANNED", "IN_PROGRESS"] } },
        })) throw new Error("New seed Ticket cannot resolve with unfinished Actions.");
        const instant = await nextSeedInstant(transaction, before.updatedAt);
        await transaction.ticket.update({ where: { id: ticketId }, data: { currentStatus: status, updatedAt: instant } });
        await transaction.ticketStatusHistory.create({ data: {
          ticketId, actorId, fromStatus: before.currentStatus, toStatus: status,
          reason: status === "CANCELLED" ? "Fictional duplicate request cancelled" : null, createdAt: instant,
        } });
      };
      for (const [index, fixture] of SEEDED_TICKETS.entries()) {
        const key = ticketKey(fixture.key);
        let id = await registered(transaction, key, "ticketId");
        if (id === null) {
          const existing = await transaction.ticket.findMany({ where: { clientSubmissionId: fixture.key } });
          if (existing.length > 1) { skip(key, "ambiguous legacy submission identity"); continue; }
          if (existing.length === 1) id = existing[0]!.id;
          else {
            const requester = users.get(fixture.requester);
            const owner = fixture.owner ? worker(fixture.owner) : undefined;
            const actor = fixture.owner ? owner : worker("mina.patel@example.com");
            const category = categories.get("Hardware");
            const system = systems.get("Corporate Laptop");
            if (!requester?.isActive || requester.role !== "REQUESTER" || (fixture.owner !== null && !owner) ||
              (fixture.status !== "NEW" && !actor) ||
              !category?.isActive || !system?.isActive) {
              skip(key, `ineligible/missing requester, owner (${fixture.owner ?? "unassigned"}) or reference`);
              continue;
            }
            const instant = await nextSeedInstant(transaction);
            const ticket = await transaction.ticket.create({ data: {
              ticketNumber: await nextTicketNumber(transaction), clientSubmissionId: fixture.key,
              requesterId: requester.id, ownerId: owner?.id ?? null, categoryId: category.id, relatedSystemId: system.id,
              summary: fixture.summary, description: `Fictional seeded scenario: ${fixture.summary}.`,
              requestedPriority: fixture.priority, itPriority: fixture.priority,
              currentStatus: "NEW", ticketDate: instant, createdAt: instant, updatedAt: instant,
            } });
            id = ticket.id;
            created.add(id);
          }
          await bind(transaction, key, "ticketId", id);
        }
        parents.set(index, id);
        if (created.has(id)) for (const status of paths[fixture.status]) {
          if (actionFrozen.has(status) && fixture.status !== "REOPENED") break;
          await transition(id, status, worker(fixture.owner ?? "mina.patel@example.com")!.id);
        }
      }
      for (const fixture of ACTION_FIXTURES) {
        const key = actionKey(fixture);
        if (await registered(transaction, key, "actionId") !== null) continue;
        const ticketId = parents.get(fixture.ticketIndex);
        if (ticketId === undefined) { skip(key, "missing parent fixture"); continue; }
        const parent = await transaction.ticket.findUniqueOrThrow({ where: { id: ticketId } });
        const creator = worker(fixture.creator);
        const assignee = worker(fixture.assignee);
        // A committed creation receipt is durable bootstrap evidence, even if
        // the Action has since changed or become terminal. Never match content.
        const historicalCreator = users.get(fixture.creator);
        const receipt = historicalCreator ? await transaction.mutationReceipt.findUnique({ where: {
          actorId_clientMutationId: { actorId: historicalCreator.id, clientMutationId: mutationKey(fixture, 1) },
        } }) : null;
        if (receipt && receipt.operation === "CREATE_ACTION" && receipt.ticketId === ticketId) {
          await bind(transaction, key, "actionId", receipt.actionId);
          continue;
        }
        if (actionFrozen.has(parent.currentStatus) || !creator || !assignee) {
          skip(`${key} on ${parent.ticketNumber}`, `frozen parent or ineligible worker (${fixture.creator}, ${fixture.assignee})`);
          continue;
        }
        if (!created.has(ticketId)) {
          // D-17 forbids advancing existing domain timestamps. Ordinary Action
          // creation necessarily advances its parent token (BR-13); therefore
          // only a new seed parent gets new synthetic work. Receipt-backed
          // bootstrap above restores metadata without rewriting that parent.
          skip(`${key} on ${parent.ticketNumber}`, "new work would change an existing parent timestamp; preserve operational state");
          continue;
        }
        const action = await createSeedAction(transaction, fixture, ticketId, creator.id, assignee.id, parent.updatedAt);
        await bind(transaction, key, "actionId", action.id);
      }
      // Only brand-new Tickets get synthetic workflow histories. Actions finish
      // before resolution/closure/cancellation. Legacy states/times stay intact.
      for (const [index, id] of parents) if (created.has(id) && actionFrozen.has(SEEDED_TICKETS[index]!.status)) {
        for (const status of paths[SEEDED_TICKETS[index]!.status].filter((status) => actionFrozen.has(status))) {
          await transition(id, status, worker(SEEDED_TICKETS[index]!.owner ?? "mina.patel@example.com")!.id);
        }
      }
      const communicationTicketId = parents.get(1);
      if (communicationTicketId !== undefined) {
        const parent = await transaction.ticket.findUniqueOrThrow({ where: { id: communicationTicketId } });
        const requester = users.get("alex.morgan@example.com");
        const historicalAuthor = users.get("mina.patel@example.com");
        const author = worker("mina.patel@example.com");
        const writable = parent.currentStatus !== "CLOSED" && parent.currentStatus !== "CANCELLED";
        // Author identity comes from registry/evidence, never their current
        // name/email. Preserve any existing communication by that author, with
        // no content rewrite and no new registry target type.
        const comment = requester ? await transaction.publicComment.findFirst({ where: { ticketId: parent.id, authorId: requester.id } }) : null;
        const note = historicalAuthor ? await transaction.internalNote.findFirst({ where: { ticketId: parent.id, authorId: historicalAuthor.id } }) : null;
        if (!comment) {
          if (requester?.isActive && requester.role === "REQUESTER" && requester.id === parent.requesterId && writable) {
            await transaction.publicComment.create({ data: { ticketId: parent.id, authorId: requester.id, content: publicContent } });
          } else skip(`public communication on ${parent.ticketNumber}`, "ineligible author, ambiguous identity or frozen parent");
        }
        if (!note) {
          if (author && writable) {
            await transaction.internalNote.create({ data: { ticketId: parent.id, authorId: author.id, content: noteContent } });
          } else skip(`internal communication on ${parent.ticketNumber}`, "ineligible author, ambiguous identity or frozen parent");
        }
      }
      return [...report];
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  } catch (error) {
    // Preserve mapping validation errors (outside this catch), but never expose
    // Prisma query arguments, credential material or database error details.
    throw new FixtureSeedError(error, performance.now() - transactionStarted);
  }
  for (const report of reports) console.warn(report);
  console.log("Seeded create-only registered Lab 3/4 fixtures; operational records preserved.");
}

async function main(): Promise<void> {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    await seedDatabase(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (executedPath === import.meta.url) {
  void main().catch((error: unknown) => {
    const safeKeys =
      error && typeof error === "object" && "safeKeys" in error
        ? (error as { safeKeys?: string[] }).safeKeys
        : undefined;
    console.error(
      safeKeys && safeKeys.length > 0
        ? `${(error as Error).message} User email keys: ${safeKeys.join(", ")}`
        : error instanceof Error
          ? error.message
          : "Seed failed safely.",
    );
    process.exitCode = 1;
  });
}
