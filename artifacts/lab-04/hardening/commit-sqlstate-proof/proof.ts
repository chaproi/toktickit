// Copied ONLY into the owned experiment directory by run.mjs.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma as ApplicationPrisma } from "@prisma/client";
import { lockCurrentActor } from "./appsrc/auth/eligibility-transaction.js";
import { observedAdapter, type Scope } from "./adapter.js";

const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Proof coordination deadline.")), 2000);
  })]); } finally { if (timer) clearTimeout(timer); }
}
function classify(error: unknown) {
  const value = error as { code?: string; cause?: { code?: string } } | undefined;
  return { prismaCode: /^P\d{4}$/.test(value?.code ?? "") ? value!.code : null,
    sqlState: /^[0-9A-Z]{5}$/.test(value?.cause?.code ?? "") ? value!.cause!.code : null };
}
const schema = process.env.PROOF_SCHEMA!;
assert.match(schema, /^issue49_commit_[a-f0-9]{32}$/);
const report: { pairs: unknown[]; cleanup?: unknown; failed?: unknown } = { pairs: [] };
const pool = new pg.Pool({ connectionString: process.env.PROOF_DATABASE_URL,
  options: `-c search_path=${schema} -c timezone=UTC`, application_name: "issue49-commit-proof", max: 4 });
const independent = new pg.Client({ connectionString: process.env.PROOF_DATABASE_URL,
  options: `-c search_path=${schema} -c timezone=UTC`, application_name: "issue49-commit-proof-observer" });
const acquired = new Set<pg.PoolClient>();
pool.on("acquire", client => acquired.add(client));
pool.on("release", (_error, client) => acquired.delete(client));
const scopes: Scope[] = [];
let prisma: PrismaClient | undefined;
let phase = "connect";

async function pair(label: string, preserve: boolean, winner: 0 | 1) {
  phase = `${label}:setup`;
  prisma = new PrismaClient({ adapter: observedAdapter(new PrismaPg(pool, { schema }), preserve, scopes), errorFormat: "minimal" });
  const actors = await Promise.all([0, 1].map(index => prisma!.user.create({ data: {
    name: `Synthetic commit actor ${label} ${index}`, email: `${label}-${index}@commit-proof.invalid`,
    role: "IT_STAFF", passwordHash: "not-a-login-credential", mustChangePassword: true,
  } })));
  const categories = await Promise.all([0, 1].map(index => prisma!.category.create({ data: { name: `${label}-${index}` } })));
  const ready = [deferred(), deferred()], release = [deferred(), deferred()];
  const attempts: Array<{ backend: number; xid: string; callbackComplete: boolean }> = [];
  const beforeScopes = scopes.length;
  const pending = [0, 1].map(index => {
    // Assignment and call check the SAME application TransactionClient shape,
    // including an inherited actual business lock helper, without casting it.
    const callback = async (tx: ApplicationPrisma.TransactionClient) => {
      phase = `${label}:callback`;
      const [identity] = await tx.$queryRaw<Array<{ proofBackend: number; proofXid: string }>>`
        SELECT pg_backend_pid()::int AS "proofBackend", txid_current()::text AS "proofXid"`;
      const actor = await lockCurrentActor(tx, actors[index].id, "IT_STAFF");
      assert.equal(actor?.id, actors[index].id, "real inherited actor lock must use this transaction");
      assert.equal((await tx.category.findMany({ where: { id: { in: categories.map(row => row.id) }, isActive: true } })).length, 2);
      await tx.category.update({ where: { id: categories[index].id }, data: { isActive: false } });
      await tx.relatedSystem.create({ data: { name: `staged-${label}-${index}` } });
      const [after] = await tx.$queryRaw<Array<{ backend: number; xid: string; isolation: string; staged: number }>>`
        SELECT pg_backend_pid()::int AS backend, txid_current()::text AS xid,
          current_setting('transaction_isolation') AS isolation,
          (SELECT count(*)::int FROM "RelatedSystem" WHERE name=${`staged-${label}-${index}`}) AS staged`;
      assert.equal(after.backend, identity.proofBackend);
      assert.equal(after.xid, identity.proofXid);
      assert.equal(after.isolation, "serializable"); assert.equal(after.staged, 1);
      attempts[index] = { backend: after.backend, xid: after.xid, callbackComplete: true };
      ready[index].resolve();
      await bounded(release[index].promise);
      return index;
    };
    return prisma!.$transaction(callback, { isolationLevel: "Serializable" }).then(
      value => ({ ok: true as const, value }), error => ({ ok: false as const, error }));
  });
  let outcomes: Awaited<(typeof pending)[number]>[] = [];
  try {
    await bounded(Promise.all(ready.map(item => item.promise)));
    assert.notEqual(attempts[0].backend, attempts[1].backend, "distinct real backends overlap");
    assert.notEqual(attempts[0].xid, attempts[1].xid);
    phase = `${label}:winner-commit`;
    release[winner].resolve(); const first = await bounded(pending[winner]);
    assert.equal(first.ok, true, "first released COMMIT succeeds");
    phase = `${label}:loser-commit`;
    release[1 - winner].resolve(); const second = await bounded(pending[1 - winner]);
    assert.equal(second.ok, false, "second COMMIT must fail, after callback writes succeeded");
    outcomes = await Promise.all(pending);
    const local = scopes.slice(beforeScopes);
    const loserScope = local.find(scope => scope.backend === attempts[1 - winner].backend)!;
    const winnerScope = local.find(scope => scope.backend === attempts[winner].backend)!;
    assert.equal(local.length, 2); assert.ok(loserScope); assert.ok(winnerScope);
    assert.equal(loserScope.xid, attempts[1 - winner].xid);
    assert.equal(loserScope.commitCalls, 1); assert.deepEqual(loserScope.nativeCodes, ["40001"]);
    assert.deepEqual(winnerScope.nativeCodes, []); assert.equal(winnerScope.commitCalls, 1);
    const failed = outcomes[1 - winner]; assert.equal(failed.ok, false);
    if (failed.ok) throw new Error("Unexpected successful loser.");
    const classification = classify(failed.error);
    if (preserve) {
      assert.equal(classification.sqlState, "40001");
      assert.equal(failed.error, loserScope.thrown, "exact transaction-local thrown error reaches same attempt");
    } else { assert.equal(classification.prismaCode, "P2034"); assert.equal(classification.sqlState, null); }
    phase = `${label}:independent-rollback-verification`;
    const persisted = await independent.query<{ id: number; isActive: boolean }>(
      'SELECT id,"isActive" FROM "Category" WHERE id=ANY($1::int[]) ORDER BY id', [categories.map(row => row.id)]);
    assert.equal(persisted.rows.find(row => row.id === categories[winner].id)?.isActive, false);
    assert.equal(persisted.rows.find(row => row.id === categories[1 - winner].id)?.isActive, true);
    const staged = await independent.query<{ name: string }>('SELECT name FROM "RelatedSystem" WHERE name=ANY($1::text[])',
      [[`staged-${label}-0`, `staged-${label}-1`]]);
    assert.deepEqual(staged.rows, [{ name: `staged-${label}-${winner}` }]);
    const locks = await independent.query<{ n: number }>("SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid=ANY($1::int[]) AND state='idle in transaction'", [attempts.map(item => item.backend)]);
    assert.equal(locks.rows[0].n, 0); assert.equal(acquired.size, 0);
    report.pairs.push({ label, preserve, winner, callbacksCompleted: attempts.map(item => item.callbackComplete),
      distinctBackendsAndTransactions: true, sameCallbackConnectionAndTransaction: true,
      nativeFailureAtCommit: loserScope.nativeCodes[0], applicationError: classification,
      exactThrownObjectAttributed: preserve ? failed.error === loserScope.thrown : null,
      scopeReleaseCalls: local.map(scope => scope.releases), independentRollbackAndWinnerState: true,
      checkedOutConnections: acquired.size, idleTransactions: locks.rows[0].n });
  } finally {
    release.forEach(item => item.resolve()); await Promise.all(pending);
    await prisma.$disconnect(); prisma = undefined;
  }
}

try {
  await independent.connect();
  await pair("official-control", false, 0);
  await pair("composed-first", true, 0);
  await pair("composed-reversed", true, 1);
} catch (error) {
  report.failed = { phase, ...classify(error), assertion: error instanceof assert.AssertionError ? error.message : null };
  process.exitCode = 1;
} finally {
  await prisma?.$disconnect();
  const leaked = acquired.size;
  // Only after draining callbacks: public pg release destroys any owned leak.
  for (const client of acquired) client.release(true);
  await pool.end(); await independent.end();
  report.cleanup = { leakedBeforeForcedCleanup: leaked, poolEnded: true, observerEnded: true };
  await writeFile(process.env.PROOF_RESULT!, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ proofCases: report.pairs.length, failed: Boolean(report.failed), leakedBeforeCleanup: leaked }));
}
