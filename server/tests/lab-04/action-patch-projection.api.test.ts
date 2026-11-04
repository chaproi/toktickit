import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ActionPatchFixtures, type PatchOperation } from "./action-patch-test-fixtures.js";
import { CreatePhaseObserver } from "./create-phase-observer.js";
import { serverDirectory } from "./migration-test-fixtures.js";

const observer = new CreatePhaseObserver(), fixtures = new ActionPatchFixtures(), observations: unknown[] = [];
beforeAll(async () => { observer.install(); await fixtures.initialize(); observer.observeTransactions(fixtures.prisma); observer.enabled = true; });
afterAll(async () => {
  let removed = false;
  try { await fixtures.cleanup(); removed = true; }
  finally {
    observer.enabled = false; observer.restore();
    const directory = resolve(serverDirectory, "../artifacts/lab-04/hardening"); mkdirSync(directory, { recursive: true });
    const name = `patch-projection-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}.json`;
    writeFileSync(resolve(directory, name), JSON.stringify({ executionHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim(),
      observations, cleanup: { ownedRecordsRemoved: removed, disconnected: removed, observerRestored: true } }, null, 2) + "\n", { flag: "wx" });
    console.info(`PATCH projection evidence: ${name}`);
  }
});

it.each(["edit", "reassign", "start", "complete", "cancel"] as const)("%s preserves current historical identities with one post-update identity read", async label => {
  const operation: PatchOperation = label === "reassign" ? "edit" : label;
  const source = await fixtures.setup(operation === "complete" ? "IN_PROGRESS" : "PLANNED");
  const creator = fixtures.read.who("creator");
  creator.user.name = `Renamed historical creator <literal> ${label}`;
  await fixtures.prisma.user.update({ where: { id: creator.user.id }, data: { name: creator.user.name, isActive: false } });
  source.action = await fixtures.prisma.action.update({ where: { id: source.action.id }, data: { createdById: creator.user.id } });
  // Direct historical-attribution fixture. It is neither an eligibility bypass
  // nor evidence of a workflow path; this User is outside mutable lock coverage.
  const input = label === "reassign" ? fixtures.editInput(source, { assigneeId: fixtures.staff.user.id }) : fixtures.input(source, operation);
  const changed = label === "reassign" ? { assigneeId: fixtures.staff.user.id } : undefined;
  const result = await observer.context.run({ request: label, attempt: 0 }, () => fixtures.successful(source, operation, input,
    fixtures.administrator, changed, label === "reassign" ? "ACTION_REASSIGNED" : undefined));
  expect(result.response.body.action.createdBy).toEqual({ id: creator.user.id, name: creator.user.name });
  expect(result.response.body.action.performedBy).toEqual(operation === "complete"
    ? { id: fixtures.administrator.user.id, name: fixtures.administrator.user.name } : null);
  const events = observer.events.filter(event => event.request === label && event.attempt === 1);
  const updated = events.find(event => event.stage === "query-end" && event.kind === "Action" && event.operation === "UPDATE")!;
  const receipt = events.find(event => event.stage === "query-start" && event.kind === "MutationReceipt" && event.operation === "INSERT")!;
  expect(updated).toBeDefined(); expect(receipt).toBeDefined();
  const reads = events.filter(event => event.stage === "query-start" && event.operation === "SELECT" && event.atMs > updated.atMs && event.atMs < receipt.atMs);
  observations.push({ label, currentHistoricalCreator: true, nullableOrActualPerformer: true,
    exactDTOHistoryReceiptParentChecksPassed: true, projectionSelects: reads.map(read => read.kind) });
  expect(reads.map(read => read.kind), "Authoritative UPDATE scalars need one current safe identity read, no Action reread").toEqual(["User"]);
});
