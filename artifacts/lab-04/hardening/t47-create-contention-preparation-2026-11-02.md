# T-47 concurrent CREATE diagnosis preparation - 2026-11-02

**Prepared, not database-executed. T-47 remains FAILED. No application correction,
semantic RED, concurrency pass, benchmark rerun or performance GREEN is claimed.**

Base: `10dc6e6773a297b744dbdc43950f2643ef391bc4`, repository
`chaproi/toktickit`, branch `feat/49-final-hardening`. The connected GitHub branch
and cloned local/upstream HEAD matched that revision; the checkout was clean.
No repository AGENTS.md was found. The user authorized proceeding with the
CREATE diagnosis/correction; this preparation does not change accepted contracts.

## Corrected starting hypothesis

The [original diagnosis](t47-diagnosis-2026-11-01.md), the unchanged
[workload](../../../server/tests/lab-04/performance-smoke.integration.test.ts)
and the [failed confirmation](t47-confirmation-2026-11-02.md) already establish
distinct self-assigned worker identities and independent write Tickets. A shared
assignee is therefore **not** established as the T-47 cause. Existing controlled
observations include shared relation-level predicate locks on MutationReceipt,
User and AuthSession. A lock snapshot alone does not identify the dangerous
read/write structure responsible for a particular abort.

The cooperating gate can explicitly raise SQLSTATE 40001 after waiting. Thus
structured 40001 alone does not distinguish that deliberate restart from a
naturally occurring PostgreSQL SSI abort. Historical samples are unchanged and
cannot be retrospectively attributed per attempt.

## Prepared observation

[New bounded integration diagnostic](../../../server/tests/lab-04/action-create-contention.integration.test.ts):

- Eight real authenticated IT_STAFF actors, each self-assigned, with separate
  Ticket targets and UUID mutation keys; no shared actor/assignee gate.
- Eight concurrent CREATE commands, then eight sequential controls on new
  Tickets/keys. Provisioning logins are additional, not business measurements.
- A first-attempt barrier after each actual missing-receipt read; real pool,
  callbacks, authorization, locks, writes and PostgreSQL errors. No added SQL
  dependency, injected error, changed result or HTTP retry.
- Request-local AsyncLocalStorage attribution of every SERIALIZABLE attempt,
  backend, transaction ID, isolation, actual try-lock outcomes, execution of the
  known gate-restart statement and whether the business callback returned.
- Independent rollback inspection after the real transaction promise rejects;
  exact successful Action/history/receipt/parent checks and zero domain writes
  after exhaustion. The original three-attempt ceiling remains unchanged.
- A safe pg_locks snapshot restricted to those eight backends and the guarded
  test schema, while all first attempts are held at the receipt boundary.
- Finally releases the barrier, drains requests, restores the observer, removes
  exact fixture-owned rows, disconnects clients and checks idle transactions.
  Each execution writes a new UUID-suffixed safe JSON artifact; none exists yet.

The diagnostic may pass while recording 409 exhaustions: a pass means the
observation/domain-consistency checks completed, **not** all commands succeeded
or T-47 passed. A coordination/fixture/transport failure is not semantic RED.
The additional identity SELECT before gates and the barrier affect scheduling;
these are not replacement latency samples. A completion-boundary rejection with
40001 and no executed gate restart is better attribution, not proof of an exact
conflicting relation. Query plans or a controlled intervention still need to
support any proposed application correction. Do not infer that a new index,
global gate, weakened isolation or additional retry is warranted.

[Safe evidence projection](../../../server/tests/lab-04/create-contention-evidence.ts)
is test-only and does not decide retry eligibility. It traverses only structured
code/meta/cause, exports no error message, SQL, binds, credentials or stack and
separates explicit gate restart/callback query/transaction completion boundaries.
The five [unit cases](../../../server/tests/lab-04/create-contention-evidence.unit.test.ts)
exercise source attribution, opaque P2034/message-only negatives, raw-query
metadata, non-serialization codes, cyclic causes, privacy and concurrent isolation.

## Actual local checks and failures

This is a new Linux workspace with Node 24.22.1, not the Windows/PostgreSQL host
of the previous measurements. It has no supplied dedicated PostgreSQL test URL
or database service. No production database or guessed credential was used.
The candidate's default Windows physical-core mapping was not replaced for Linux.

| Command from server/ | Actual outcome |
| --- | --- |
| `npx prisma generate` | Exit 0; generated client 6.19.3 |
| `npx tsc --noEmit`, first attempt | Exit 2; new diagnostic sources array lacked an explicit type (TS7034/TS7005). No database execution |
| `npm test -- tests/lab-04/create-contention-evidence.unit.test.ts`, first attempt | Exit 1; 4 passed, 1 failed. New observer initially mislabeled PostgreSQL P0001 as a Prisma code; corrected the observer, preserved the assertion |
| `npx tsc --noEmit`, corrected attempt | Exit 0 |
| `npm test -- tests/lab-04/create-contention-evidence.unit.test.ts`, corrected attempt | Exit 0; 1 file, 5 passed, 0 failed/skipped; case total 4ms, framework 367ms |
| `npx tsc --noEmit`, final check after strengthening exact creation fields | Exit 0; final source |
| `npm test -- tests/lab-04/action-create-contention.integration.test.ts` | Exit 1 in existing global setup: `TEST_DATABASE_URL is required for database integration and E2E tests.` No tests collected/executed; collect/tests 0ms. No requests, owned fixtures, diagnostic artifact or semantic RED |

Dependency preparation: the initial ordinary npm-ci tool execution ended with
`network approval was cancelled before a decision was returned`; a subsequent
`npm ci --ignore-scripts --no-audit --no-fund` completed with 278 packages, without
changing manifests/locks. Engine/client generation then succeeded. PostgreSQL
tooling discovery found no installed server. An apt index refresh first failed
credential switching; a root-mode index refresh completed with a cache-cleanup
warning. A non-root subprocess capability probe returned OSError 22. No database
server, cluster or account was created, and no credential/security workaround was
attempted. These are environment preparation failures, not application failures.

## Resume on the existing guarded database host

Use the existing Windows host and its already configured, distinct dedicated
test database. Keep the pool/options/budgets unchanged and ensure no competing
test/build/seed workload. After fast-forwarding this branch, from server/:

```text
npm.cmd test -- tests/lab-04/action-create-contention.integration.test.ts
```

Do not run T-47 again yet. Inspect the new artifact's request-local attempts,
explicit gate restarts versus completion/query failures, barrier predicate locks,
exact persistence and cleanup before choosing a narrow RED/GREEN intervention.
If all eight concurrent commands recover, report that honestly; it does not
reproduce 50-user exhaustion or justify changing a business expectation.

Production/client/dependencies/DDL, existing tests, benchmark/helper/plan and all
historical artifacts are unchanged. No comprehensive server regression/build,
version evaluation, retention proof, PR/Issue change or acceptance promotion.
The accepted Lab-only metadata-retention limitation and 15 untriaged dependency
findings remain. Application correction, real causal evidence and T-47 acceptance
are still pending.
