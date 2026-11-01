import assert from "node:assert/strict";
import type { Transaction } from "@prisma/driver-adapter-utils";
import { releaseOnce } from "./remedy.js";

export async function componentChecks() {
  const records: unknown[] = [];
  function fake(primary?: unknown, failCleanupQuery = false, failRelease = false) {
    let releases = 0, rollbackQueries = 0, commits = 0;
    const tx: Transaction = { provider: "postgres", adapterName: "synthetic-component-only", options: { usePhantomQuery: false },
      queryRaw: async () => ({ columnNames: [], columnTypes: [], rows: [] }),
      executeRaw: async query => {
        if (query.sql === "COMMIT") { commits++; if (primary) throw primary; }
        if (query.sql === "ROLLBACK") { rollbackQueries++; if (failCleanupQuery) throw new Error("Synthetic cleanup query failure."); }
        return 0;
      }, commit: async () => { releases++; if (failRelease) throw new Error("Synthetic cleanup release failure.", { cause: { code: "40001" } }); },
      rollback: async () => { releases++; if (failRelease) throw new Error("Synthetic cleanup release failure.", { cause: { code: "40001" } }); } };
    const stages: string[] = [];
    return { wrapped: releaseOnce(tx, stage => stages.push(stage)), stages,
      counts: () => ({ releases, rollbackQueries, commits }) };
  }
  const success = fake();
  await success.wrapped.executeRaw({ sql: "COMMIT", args: [], argTypes: [] });
  await Promise.all([success.wrapped.commit(), success.wrapped.rollback(), success.wrapped.commit()]);
  assert.equal(success.counts().releases, 1);
  await assert.rejects(success.wrapped.queryRaw({ sql: "SELECT 1", args: [], argTypes: [] }));
  records.push({ label: "success and repeated/concurrent completion", ...success.counts() });

  const ordinaryRollback = fake();
  await ordinaryRollback.wrapped.executeRaw({ sql: "ROLLBACK", args: [], argTypes: [] });
  await Promise.all([ordinaryRollback.wrapped.rollback(), ordinaryRollback.wrapped.rollback()]);
  assert.equal(ordinaryRollback.counts().releases, 1);
  records.push({ label: "engine callback/query rollback completion", ...ordinaryRollback.counts() });

  const errors = [
    { label: "confirmed 40001", error: new Error("Synthetic typed classification.", { cause: { code: "40001" } }) },
    { label: "deadlock 40P01", error: new Error("Synthetic typed classification.", { cause: { code: "40P01" } }) },
    { label: "uniqueness 23505", error: new Error("Synthetic typed classification.", { cause: { code: "23505" } }) },
    { label: "unknown P2034", error: Object.assign(new Error("Synthetic unknown."), { code: "P2034" }) },
    { label: "P2002", error: Object.assign(new Error("Synthetic uniqueness."), { code: "P2002" }) },
    { label: "message-only 40001", error: new Error("Synthetic message-only 40001.") },
    { label: "unexpected", error: new Error("Synthetic unexpected.") },
  ];
  for (const item of errors) {
    const resource = fake(item.error);
    let seen: unknown;
    try { await resource.wrapped.executeRaw({ sql: "COMMIT", args: [], argTypes: [] }); } catch (error) { seen = error; }
    assert.equal(seen, item.error);
    await Promise.all([resource.wrapped.rollback(), resource.wrapped.commit(), resource.wrapped.rollback()]);
    assert.deepEqual(resource.counts(), { releases: 1, rollbackQueries: 1, commits: 1 });
    records.push({ label: item.label, exactPrimaryIdentity: true, ...resource.counts() });
  }
  for (const failRelease of [false, true]) {
    const primary = new Error("Synthetic unknown primary.");
    const resource = fake(primary, true, failRelease);
    let seen: unknown;
    try { await resource.wrapped.executeRaw({ sql: "COMMIT", args: [], argTypes: [] }); } catch (error) { seen = error; }
    assert.equal(seen, primary); assert.equal(primary.cause, undefined);
    assert.deepEqual(resource.stages, failRelease ? ["rollback-query", "transaction-release"] : ["rollback-query"]);
    assert.equal(resource.counts().releases, 1);
    records.push({ label: `secondary cleanup${failRelease ? " and release" : ""} failure`, exactPrimaryIdentity: true,
      primaryCauseUnchanged: true, stageOnlyReports: resource.stages, ...resource.counts() });
  }
  const concurrent = await Promise.all(Array.from({ length: 20 }, async (_, index) => {
    const primary = new Error(`Synthetic concurrent primary ${index}.`);
    const resource = fake(primary);
    let seen: unknown;
    try { await resource.wrapped.executeRaw({ sql: "COMMIT", args: [], argTypes: [] }); } catch (error) { seen = error; }
    await resource.wrapped.rollback();
    assert.equal(seen, primary); assert.equal(resource.counts().releases, 1);
    return true;
  }));
  records.push({ label: "20 concurrent independent synthetic completions", passed: concurrent.length });
  return { syntheticOnly: true, independentlyReportedRecords: records.length, records };
}
