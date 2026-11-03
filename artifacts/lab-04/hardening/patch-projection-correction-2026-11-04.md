# Shared PATCH projection correction - 4 November 2026

## Scope and provenance

Isolated `feat/49-d12-rc-candidate`, starting clean at `169811dfde4a22f0ff7a9acf8e45f755e062597b`, matching upstream and live remote. Original worktree/branch and uncommitted D-12 proposal remain preserved. D-12 is proposed; this increment does not accept the amendment, deploy it, or promote T-47/Issue/Product DoD. The Lab-only failed-start bookkeeping retention and untriaged dependency-audit limitations remain.

The prior unchanged 5,500-sample artifact is preserved. Offline inspection confirms all 26 measured durations >=500 ms are START; all 30 START responses succeed. Each follows its worker's EDIT and precedes COMPLETE/CANCEL. This phase-relative clustering does not attribute internal latency.

## Declared bounded observation

A separately labelled, un-warmed diagnostic reuses the indexed 2,050-Ticket/8,000-Action/24,000-history cohort. Real login is outside observation. Thirty Staff/Admin actors prepare one real CREATE apiece, then each issues EDIT (reassignment), START and COMPLETE/CANCEL sequentially, using acknowledged authoritative tokens and fresh UUIDs. Nineteen active Requesters issue Dashboard, owned-list and owned-detail reads sequentially (57 reads). The twentieth Requester is a deliberately inactive historical creator, outside actor/assignee lock coverage; no request is authenticated as that inactive identity. Direct attribution setup is a read fixture, not a workflow-path claim. All settings and existing budgets remain unchanged.

Transparent existing public pg/adapter/transaction observations retain request/attempt-local monotonic times, actual wire query labels/counts, checkout/resource waits, callback, COMMIT/drain/release and HTTP dispatch/entry/result. SQL and parameters are inspected only in memory, never published. The event-loop histogram is process-wide, not per-request attribution. Observed query durations include driver, network and runtime scheduling; overlapping intervals must not be added or labelled SQL execution alone. This instrumented, differently phased cohort is not T-47.

### First observation and failed assumption

Command `02-bounded-red` ran against unchanged production at `169811d`: 1 file/1 executed case, 0 passed/1 failed, 0 skipped; exit 1; framework 53.14 s, case 46.769 s, outer 54.293 s. Of 90 planned PATCHes, 82 execute: 78 succeed, four EDITs return safe 500 INTERNAL_ERROR and stop those four chains (eight subsequent commands unissued). All 57 Requester reads succeed. The case first fails its 200 assertion; aggregate persistence/projection assertions remain unreached. This is retained contention evidence, not the deterministic query-count RED.

Each of the four failures retains `TransactionStartDeadlineError`, code P2028, public meta.phase transaction-start and effective maxWait 2000. The independent observed active stage is database-resource, awaiting resource-1 (User) before callback entry. No engine-provided subtype is retained. This classifies only these new observations; historical benchmark P2028s remain unclassified. Listener closes, checked-out count is zero, owned schema is removed; an independent guarded probe also confirms no residual resources. The first failed case did not persist its event-loop histogram; its absence is explicit, not inferred away.

Successful attempts demonstrate four actual post-update SELECTs: Action, User, User, User. Some relation requests overlap at the Prisma layer but serialize on the transaction connection; no parallel speedup is claimed.

[First raw observation](patch-chain-phases-2026-11-03-6579db69.json).

## Tests-first resource RED

Five independent real API cases cover EDIT, reassignment, START, COMPLETE and CANCEL. They reuse the inherited exact scalar/DTO, immutable fields, full before/after history, receipt-last rollback semantics, parent advancement and unrelated-row comparisons. An inactive/demoted historical creator is renamed after login and placed outside the mutable lock set. Responses must retain its current literal name and null/actual performer semantics.

Command `03-projection-red`, unchanged production: 1 file/5 collected/executed, 0 passed/5 failed, 0 skipped; exit 1; framework 10.64 s, outer 11.609 s. Every case reaches and passes inherited domain checks, then fails the actual driver query assertion: `[Action, User, User, User]` versus `[User]`. No collection/authentication/fixture failure is presented as semantic RED. [Raw RED](patch-projection-2026-11-03-f289dd2e.json). Tests and both initial raw records are committed separately as `8e80cd458517baf0c270cafec0bd91edddd623c7`.

## Smallest shared-path correction

Only `server/src/actions/action-patch-service.ts` changes in production. Keep authoritative scalars returned by UPDATE and perform one bounded `User.findMany`, selecting only id/name for distinct creator, assignee and non-null performer IDs. Reuse the existing safe DTO serializer. Historical identities are read currently, not assumed to belong to locked Users and not copied from session/discovery. Missing required identity fails atomically, safely. Nullable performer remains null. Receipt remains the final domain write.

No endpoint-specific START shortcut, new lock, pool/budget/retry/dependency change, cache, new queue, business guard change or read-path alteration occurs. Receipt-before-drift/stale/frozen and safe replay behavior are untouched. This removes three demonstrated redundant round trips; it does not establish the sole cause of the historical START cohort.

### Focused confirmation

Command `04-focused-green` ran at RED HEAD with pending production bytes: 2 files/6 cases collected/executed/passed, 0 failed/skipped; exit 0; framework 46.85 s, outer 48.518 s. The same bounded cohort now reaches all checks: 90/90 PATCH and 57/57 Requester reads succeed, exactly 90 new histories/receipts, no extra Action or Ticket-status history, final Action version 4, correct terminal statuses and authoritative parent timestamps. Every PATCH has one post-update User SELECT. Five deterministic cases pass full inherited comparisons and current historical-identity checks. This is a confirmation after a concrete production change, not a favourable repeat of unchanged code.

[Focused raw cohort](patch-chain-phases-2026-11-03-e49fcf60.json), [five-case GREEN](patch-projection-2026-11-03-bb02f20e.json), [offline phase analysis](patch-chain-analysis-2026-11-04.json), [reproducer](analyze-patch-chain-2026-11-04.py).

For START, observed projection p50/p95 changes 25.827/41.623 ms to 2.957/6.999 ms; callback 123.400/142.722 to 31.500/53.380 ms. These are two instrumented observations, not controlled causal benchmark estimates. Confirmation START pre-transaction HTTP-entry-to-transaction p50/p95 is 293.512/489.392 ms; startup is 114.085/769.824 ms and callback-exit-to-result 17.038/32.689 ms. Resource waiting and pre-transaction work remain; no phase totals are summed. Confirmation process event-loop delay p95 13.001 ms/max54.591 ms and utilization ~0.9977 include observer overhead, without proving CPU or SQL causation.

## Validation and measurement

Further command results, clean-source publication, independent cleanup and one unchanged T-47 verdict are appended below after execution. No later publication SHA is described as an earlier execution HEAD. Host is local Windows/PowerShell, Node24.14, PostgreSQL18.6, pinned Prisma6.19.3 client engine; no hosted CI or capacity guarantee is claimed. UTC execution dates may be 3 November while local Bangkok date is 4 November; generated filenames retain their actual unmodified date conventions.

### Required validation completed

| Label | Command from server/ | Exit | Files/cases collected/executed/passed/failed/skipped | Framework / outer seconds |
|---|---|---:|---|---|
|01|`npm.cmd exec -- tsc --noEmit`|0|Type check, no test cases|14.856 outer|
|02|`npm.cmd test -- tests/lab-04/action-patch-projection.integration.test.ts`|1|1 file; 1/1/0/1/0|53.14 /54.293|
|03|`npm.cmd test -- tests/lab-04/action-patch-projection.api.test.ts`|1|1 file; 5/5/0/5/0|10.64 /11.609|
|04|Both new PATCH projection files|0|2 files; 6/6/6/0/0|46.85 /48.518|
|05|Eleven unchanged affected API/integration files|0|11 files; 724/724/724/0/0|269.52 /270.647|
|06|`npm.cmd exec -- tsc --noEmit`|0|Type check, no test cases|8.694 outer|
|07|`npm.cmd run build`|0|Build, no test cases|8.131 outer|
|08|`npm.cmd test -- --exclude tests/lab-04/performance-smoke.integration.test.ts`|0|99 files; 2110/2110/2110/0/0|994.45 /997.004|

[Exact arguments, UTC dates/durations and source/artifact hashes](patch-projection-commands-2026-11-04.json) retain all attempts. Before01, invoking the private runner without escalation was blocked by local PowerShell script policy; no application check executed in that invocation. Read-only shell path/encoding mistakes during inspection likewise did not execute a test and are not semantic failures. No expected outcome is weakened.

05 includes `actions-taken.api.test.ts`, `action-history.api.test.ts`, `action-idempotency.api.test.ts`, `action-idempotency-recovery.integration.test.ts`, `actions-concurrency.api.test.ts`, `action-commit-recovery.api.test.ts`, `action-eligibility.api.test.ts`, `actions-authorization.api.test.ts`, `command-session.api.test.ts`, `ticket-workflow.api.test.ts` and `dashboard-snapshot.integration.test.ts`. Genuine independently coordinated CREATE/EDIT COMMIT40001 recovery remains distinct from controlled late faults. T-42 exhaustion/negative classifications, T-51/T-52 replay/recovery, revocation, eligibility, frozen parents, cascade rollback and snapshot assertions pass unchanged.

The single comprehensive command runs2026-11-03T20:12:26.017Z-20:29:03.071Z (Bangkok4November03:12-03:29). There are100 discovered test files; only T-47 is excluded, so this is not an unfiltered suite pass. All tests execute at8e80cd4 with pending one-file production bytes subsequently committed unchanged as `0abd40d`. The original benchmark/helper, read correction, protocol/settings/dependencies and all inherited tests/helpers remain byte-identical. No hosted CI or exact later-publication-HEAD execution is claimed.

The same checksum-pinned SeaweedFS4.51 prerequisite is provisioned in an owned temporary directory only for existing persistent tests, with its environment setting restored. Download/extraction overlaps05 outside timing measurement; no repository test/build runs overlap. Expected seed-preservation, sanitized controlled-fault and Prisma/pg deprecation warnings remain; no unhandled-error summary occurs. No application timeout, retry or concurrency change.

Independent native guard/live probe at2026-11-03T20:29:32.980Z confirms0owned schemas,other connections,idle transactions,advisory locks,sessions,fixture Users and fault objects. Process inventory finds0owned node/weed workloads. The runner restores scoped settings; existing tests verify owned directory/bucket/object/archive removal. Every486pre-validation tracked artifact retains its exact saved byte hash; original proposal SHA-256 remains `e3bd394edae0c677a301e43f02b04ec6363907bf27972b302fa19647aee7790d`. The original branch stays535a2e5. Clean-source publication and the sole unchanged measurement follow these correctness gates; their outcome is appended separately.
