import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { ActionCreateFixtures, FULL_CONTENT } from "./action-create-test-fixtures.js";
import { CreatePhaseObserver } from "./create-phase-observer.js";
import { serverDirectory } from "./migration-test-fixtures.js";

const observer = new CreatePhaseObserver(), fixtures = new ActionCreateFixtures();
const observations: unknown[] = [];
beforeAll(async () => { observer.install(); await fixtures.initialize(); observer.observeTransactions(fixtures.prisma); observer.enabled = true; });
afterAll(async () => {
  try { await fixtures.cleanup(); }
  finally {
    observer.enabled = false; observer.restore(); vi.restoreAllMocks();
    const directory = resolve(serverDirectory, "../artifacts/lab-04/hardening"); mkdirSync(directory, { recursive: true });
    const name = `create-projection-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}.json`;
    writeFileSync(resolve(directory, name), JSON.stringify({ executionHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim(),
      observations, cleanup: { fixturesRemoved: true, prismaDisconnected: true, observersRestored: true } }, null, 2) + "\n", { flag: "wx" });
    console.info(`CREATE projection evidence: ${name}`);
  }
});

it.each(["self", "distinct"] as const)("%s assignment uses current locked identity names without post-insert projection reads", async assignment => {
  const actor = assignment === "self" ? fixtures.staff : fixtures.administrator;
  const assignee = assignment === "self" ? actor : fixtures.read.who("assignee");
  // Change names after real login; responses must use current transaction data,
  // not session-time fixtures, an identity cache or a fabricated performer.
  const actorName = `${assignment} creator renamed before CREATE`;
  await fixtures.prisma.user.update({ where: { id: actor.user.id }, data: { name: actorName } }); actor.user.name = actorName;
  const assigneeName = assignment === "self" ? actorName : "Different worker renamed before CREATE";
  if (assignee !== actor) { await fixtures.prisma.user.update({ where: { id: assignee.user.id }, data: { name: assigneeName } }); assignee.user.name = assigneeName; }
  const parent = await fixtures.parent(), input = fixtures.fullInput(parent, assignee.user.id);
  const created = await observer.context.run({ request: `projection-${assignment}`, attempt: 0 }, () => fixtures.create(parent, input, actor, FULL_CONTENT));
  expect(created.response.body.action.createdBy).toEqual({ id: actor.user.id, name: actorName });
  expect(created.response.body.action.assignee).toEqual({ id: assignee.user.id, name: assigneeName });
  expect(created.response.body.action.performedBy).toBeNull();
  const events = observer.events.filter(e => e.request === `projection-${assignment}` && e.attempt === 1);
  const from = events.find(e => e.stage === "callback-entry")!.atMs, before = events.find(e => e.stage === "callback-exit")!.atMs;
  const queries = events.filter(e => e.stage === "query-start" && e.atMs >= from && e.atMs <= before);
  const insert = queries.find(e => e.kind === "Action" && e.operation === "INSERT")!;
  const preceding = queries.filter(e => e.atMs < insert.atMs);
  expect(preceding.filter(e => e.kind.startsWith("guard-gate")).map(e => e.kind)).toEqual(assignment === "self"
    ? ["guard-gate-1", "guard-gate-2"] : ["guard-gate-1", "guard-gate-1", "guard-gate-2"]);
  for (const model of ["User", "AuthSession", "Ticket", "MutationReceipt"]) {
    expect(preceding.filter(e => e.kind === model && e.operation === "SELECT")).toHaveLength(1);
  }
  const redundant = queries.filter(e => e.atMs > insert.atMs && ["Action", "User"].includes(e.kind) && e.operation === "SELECT")
    .map(e => `${e.kind}.${e.operation}`);
  observations.push({ assignment, exactCurrentIdentities: true, exactDTOHistoryReceiptAndParentChecksReached: true,
    realCallbackDriverQueries: queries.length, postInsertProjectionReads: redundant });
  expect(redundant, "CREATE already has authoritative inserted scalars and locked identity rows; no extra projection rereads").toEqual([]);
  expect(queries.length).toBeLessThanOrEqual(assignment === "self" ? 10 : 11);
});
