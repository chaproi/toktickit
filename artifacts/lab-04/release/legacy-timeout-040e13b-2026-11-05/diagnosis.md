# Earliest legacy timeout: phase diagnosis and narrow harness correction

**5November2026 Asia/Bangkok. Verdict: legacy harness correction confirmed; full server remains NOT GREEN.** No production change or further full-run attempt. This record preserves the original final-main failures, the instrumented representative failure, the corrected confirmation and exactly one authorized comprehensive diagnostic result.

## Selection and source state

The first chronological failure in the requested legacy/ownership subset is `server/tests/lab-04/legacy-actions.integration.test.ts` → **“resolves a migrated active zero-Action Ticket with its eligible historical owner”**. It precedes the ownership failures in the retained original server log. [Prospective plan](prospective-plan.json) records the choice before execution.

HEAD remains detached final-main **`040e13b78893ab8155bac89758334adf1a045b01`**. Every production byte remains unchanged, with `server/src` Git tree **`1b7b2fa48d68704407fd5e33b9d2aaebcef4ffa5`**. The executed source includes a **pending test-only delta**: the modified legacy test and new `legacy-phase-diagnostic.ts`. Results are not presented as a clean/exact-main test execution. No commit, push, PR, merge, deployment or acceptance update occurred.

- [Source/delta state](source-state.json).
- [Instrumentation-only delta](instrumentation-only.patch): original test→phase-observed test.
- [Specific harness correction](harness-correction.patch): phase-observed→corrected file lifecycle.
- [Complete tracked delta used by full run](full-source-delta.patch), [dedicated test-only helper](legacy-phase-diagnostic.ts).
- [Assertion preservation](assertion-preservation.json): all38original `expect` lines and all4test declarations retained; no assertion/expected result weakened. Existing `same` comparisons/labels remain, with timing wrappers around producers only.

The earlier [final-main verification](../final-main-040e13b-2026-11-04/evidence.md) and [two-file bounded diagnosis](../server-diagnosis-040e13b-2026-11-05/diagnosis.md) remain untouched. Their failures are not relabelled as passing.

## Instrumentation and unchanged limits

The test-only observer records monotonic phase start/end, active phase at the original5-second boundary, environment queue entry/grant, actual real login and HTTP statuses, public coordination calls, pool checkout, advisory acquisition, BEGIN, Prisma callback body, completion, drain/disconnect and schema cleanup. It reuses the existing public Prisma/pg pass-through observer. No business result is mocked and no raw SQL/parameter/session/credential contents are logged.

Safe errors retain allowlisted name/code/phase and source stack frames only. A Vitest timeout occurs outside the continuing test Promise, so its stack comes from the JSON reporter; a separate observation timer records active phase without rejecting, extending or replacing Vitest's timer. [Safe representative timeout stacks](representative-safe-failures.json).

**Unchanged:**5,000ms per case; existing default10,000ms hook budget; transaction maxWait/execution budgets; pool settings; retries; thresholds; assertions. The installed Vitest source resolves non-browser `hookTimeout` to `1e4` when unspecified. No custom timeout argument/configuration was added.

Phase wrappers introduce diagnostic overhead. The observer exports its journal write counts/time. Inclusive parent/child spans overlap and are **not summed**. Public coordination call-return is not the end of admission waiting; actual admission/start/body events supply those stages. Observer transaction ordinals reuse HTTP-method labels and are not proof of retry counts. Retained [phase analysis](phase-analysis.json) and [transaction stage summary](transaction-stage-summary.json) document these limits.

## Representative execution: meaningful failure and established chain

The unchanged5-second case budget produced **3failed /1passed**, exit1. The first case's phase boundary fired at5,002.923ms while its active phase was **`setup.app-import`**. That import took **6,396.788ms**, independently longer than the entire case allowance. Authentication, admission and transaction callback had not begun at that boundary.

The timed-out Promise was not cancelled by Vitest. The existing test-harness queue correctly preserved environment isolation by waiting for it to drain; that wait was charged to subsequent cases. Case2 waited **4,851.286ms** in that queue, then needed2,966.494ms of actual application/fixture work; case3 waited2,809.978ms before its3,841.853ms active work. They therefore also crossed their unchanged5-second budgets. The fourth case completed within budget. The original timeouts are retained as failures even though their pending real business operations later completed and drained.

This establishes the **test fixture lifecycle/cascading timeout mechanism in the instrumented reproduction**. It does not establish why the first import took that long or retrospectively prove every original timeout had the same cause. No CPU, machine-speed, pool-starvation or production latency explanation is inferred.

For the first failed case after its import eventually finished, real login took301.518ms and the business body98.620ms. Its actual Ticket PATCH transaction took5.218ms from transaction call to callback,16.273ms in the body and3.719ms from callback exit to result; physical release was observed. These positive observations exclude admission/body as the active phase at this reproduction's original deadline. An unwrapped synchronous initial client-construction interval is not fully attributed; it is not needed to explain an import already exceeding5seconds.

## Smallest correction applied

Load the actual App/module graph once in the file's **existing default setup-hook lifecycle**, retaining that hook's finite10-second limit. Do not reset and re-import it within each5-second case. For each case:

1. Keep disposable schema creation, historical migrations, real password hashes, seed, preservation snapshots and forward migrations inside the original case.
2. Construct a **fresh real guarded Prisma client** for that case's migrated schema and supply it through the existing public `getPrisma` test seam.
3. Exercise real App middleware, real password/session authentication and real business endpoints against PostgreSQL. No endpoint/service/database result is fabricated.
4. Preserve the serialized environment queue, pending-work drain, all assertions, client disconnection, seam restoration, environment restoration and FK-safe owned-schema cleanup.

This is an **explicit setup-allocation correction**, not a claim that production/import latency improved and not a larger test timeout. App loading now has its own unchanged default hook boundary. Fixture writes, authentication and business work were not prewarmed or moved outside their cases. It also removes repeated module-registry resets used solely to select a different singleton target.

One justified confirmation after this concrete change passed **4/4**, exit0; all case totals were0.961–2.572seconds with no5-second boundary observation. App file setup took682.841ms on that run. Its different import duration means this is not a controlled timing experiment proving how much of the speed difference comes from lifecycle versus run variability.

## Observed phase table

Milliseconds; nested spans are inclusive and must not be added. `case total` includes queue time. Schema cleanup is observed from the callback's finally marker through owned-schema helper return. Full transaction/admission details are in the linked machine records.

| Run | Case | Queue wait | Seed fixture | In-case App import | Fresh client | Real auth | Business body | Schema cleanup | Case total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| legacy | 1 | 0.635 | 392.498 | 6396.788 | — | 301.518 | 98.620 | 152.031 | 9863.259 |
| legacy | 2 | 4851.286 | 350.599 | 186.626 | — | 307.208 | 144.539 | 88.748 | 7819.684 |
| legacy | 3 | 2809.978 | 447.508 | 217.452 | — | 250.581 | 753.024 | 120.156 | 6654.103 |
| legacy | 4 | 1191.253 | 336.803 | 130.243 | — | 223.543 | 94.898 | 94.947 | 3913.359 |
| legacy-confirm | 1 | 1.652 | 241.945 | — | 1448.331 | 196.033 | 103.650 | 57.364 | 2571.550 |
| legacy-confirm | 2 | 0.160 | 253.466 | — | 2.077 | 149.002 | 59.488 | 56.070 | 1057.827 |
| legacy-confirm | 3 | 0.312 | 301.471 | — | 0.932 | 192.226 | 432.179 | 60.288 | 1433.821 |
| legacy-confirm | 4 | 0.234 | 298.578 | — | 0.960 | 181.082 | 71.771 | 56.888 | 960.717 |
| full | 1 | 0.395 | 239.945 | — | 1423.799 | 192.833 | 71.696 | 67.171 | 2379.106 |
| full | 2 | 0.816 | 293.905 | — | 1.068 | 147.108 | 76.849 | 58.272 | 881.000 |
| full | 3 | 0.167 | 249.879 | — | 2.709 | 166.855 | 526.376 | 64.398 | 1374.931 |
| full | 4 | 0.319 | 315.470 | — | 1.736 | 157.709 | 73.591 | 60.861 | 920.337 |

Case order is resolve,close,reopen/later real work,null-owner rejection. Before correction, the initial `getPrisma` construction was not isolated into its own span; no invented value is filled in. Corrected and full runs explicitly measure fresh-client construction. Both initial and corrected runs retain actual cleanup and safe error/status observations under `phase-records/`.

## One comprehensive diagnostic: why it was necessary and actual result

After the positive phase reproduction and focused correction, the remaining original failures plus missing overall completion required seeing a complete normal-discovery sequence without chasing the other files one at a time. [Prospective justification](full-run-justification.json) was recorded and explained **before** starting. Exactly **one** full server command ran, excluding only the unchangedT47benchmark; no repeat after failure.

The runner uses direct binary-file stdout/stderr, durable start/PID/5-second monotonic heartbeat, spawn/exception records, supported signal handlers, child exit and finally records. A3600-second outer safety cap is explicit and separate from all application/case limits; it did not trigger. Both the earlier representative and corrected confirmation used300-second outer caps that likewise did not trigger. Untrappable external process kills cannot run a handler; the journal would retain the last heartbeat rather than fabricate a termination reason. [Runner source](runner.py), [full journal](full-journal.json), [full result](full-result.json).

| Command from server/ | Exit | Files | Collected / executed / passed / failed / skipped | Vitest / outer seconds |
| --- | --- | --- | --- | --- |
| `npm.cmd test -- tests/lab-04/legacy-actions.integration.test.ts --reporter=default --reporter=json --outputFile=<private>/legacy-vitest.json` |1|1|4 /4 /1 /3 /0|36.44 /45.040|
| Same affected file after specific lifecycle correction, separate output |0|1|4 /4 /4 /0 /0|11.29 /15.014|
| `npm.cmd test -- --exclude tests/lab-04/performance-smoke.integration.test.ts --reporter=default --reporter=json --outputFile=<private>/full-vitest.json` |**1**|**99**|**2110 /2110 /2109 /1 /0**|**1208.25 /1211.236**|

`npm.cmd exec -- tsc --noEmit` passed before execution and after the lifecycle correction (durable outer15.023s and10.018s). An earlier preliminary type-check also exited0. No build,client,E2E or performance workload was executed. [All commands/timestamps](commands.json). The initial new runner had a syntax error before any test process launched; that bootstrap failure and a read-only path mistake were retained in [preparation errors](preparation-errors.json), with the original runner source/compile output. Neither is semantic RED.

The comprehensive command ran2026-11-04T18:31:20.890Z–18:51:32.125Z, **5November01:31–01:51 Asia/Bangkok**. OnlyT47was excluded. Existing bounded diagnostic integration files are included by normal discovery; they are not the5000/500benchmark. The JSON reporter counts256nested suites, while its `testResults` contains99files; do not report256files. Normal sequencing/cache was not forced, and [actual completion order](full-observed-file-order.json) may differ from the original failed run.

The full command has a complete summary, native exit1, no runner exception, no observed signal and no outer-safety termination. It passed the earlier COMPLETE preparation point and finished. This confirms current runner observability, **not** the historical interruption's cause.

### Sole remaining full-run failure

`action-patch-projection.integration.test.ts:120:37` expected200, actual500 inside `Promise.all(index19)`, then line139 and `migration-test-fixtures.ts:91:5`. Full safe stack is in [full failure analysis](full-failure-analysis.json) and [JSON report](full-vitest.json).

Its retained artifact contains **5failed EDIT responses inside1failed test**, all safe `INTERNAL_ERROR`; internal pass-through errors are `TransactionStartDeadlineError /P2028 /meta.phase=transaction-start /maxWait2000`, with4observed resource-acquisition deadlines and1post-admission deadline. Engine subtype remainsnull. Listener closed and checked-out0 are retained. Post-success identity/projection assertions remained unreached where the response assertion failed. Exact blocking-holder/critical-path cost is still unknown. This does not justify a pool/budget/retry change or a machine-slowness explanation.

The full run **passed** all4corrected legacy cases, ownership22/22, recovery1/1, admission14/14 and authorization96/96. These are actual current executions, not explanations of why the older versions failed/skipped. No source/settings correction was made for those other files. Historical failures remain preserved. The repeated PATCH failure is the current release-verification blocker.

## Isolation, cleanup and preservation

Actual guard plus live dedicated database identity was checked before writes, after the representative, before full run and after completion. Operational data was never connected to/reset. The same checksum-pinned SeaweedFS4.51 was restored only as the persistent-test prerequisite, child-scoped; no readiness prewarming or version change. [Prerequisite digest](seaweed-prerequisite.json).

Independent final probes show **0** other database connections,idle transactions,advisory locks,new schemas,owned test/storage/dump processes or3100/4173listeners. Both pre-existing schemas and row checksums remain unchanged. Fixture Users/sessions and cascade fault triggers/functions/sequences are absent. [Final isolation](after-e2e-isolation-cleanup.json), [fault/fixture absence](final-fixture-resource-check.json), [cleanup](cleanup.json).

Eighteen newly generated suite artifacts were archived under `full-generated/` and removed only from their proven new owned paths. Embedded historical filenames remain unchanged; actual execution timestamps above take precedence. Prior artifact and evidence bytes remain intact; no historical reset/clean. Only the authorized legacy test differs among tracked files, plus the new untracked diagnostic helper and local evidence directory. The original branch/worktree/proposal remains intact. [Preservation record](artifact-preservation.json).

Expected pg concurrent-query deprecation/controlled-fault logs remain in redacted output; [warning counts](warnings.json). No credentials,cookies,tokens,connection values,private Notes,SQL parameters or raw error objects are published. Phase records contain safe event classifications only. Diagnostic output overhead and phase overlap are documented, not treated as application performance measurements.

## Conclusion and next action

**Proven:** in the instrumented legacy reproduction, App import alone exceeded its case budget and continued work queued subsequent cases; the focused lifecycle correction preserves all business outcomes and passes locally and within the complete run. Production remains unchanged. The new durable runner retained a complete exit/summary.

**Unknown:** cause of the earlier missing exit, why the import took6.397seconds, historical recovery/ownership timeout antecedents, and the exact holding path that exhausted PATCH startup. No production defect is declared fixed.

**Next bounded action:** diagnose the reproduced PATCH User-resource holding/critical path from the retained request-local artifact, adding only missing blocker attribution if needed. Do not repeat the full suite unchanged or increase any budget. Any demonstrated production correction must be tests-first on a feature branch, not directly on main.

The pending harness delta and evidence are local/uncommitted in the isolated verification worktree. No PR or release/Issue/DoD promotion. Final-main server verification remains **NOT GREEN:2109passed/1failed** on production040e13b plus the explicitly documented test-only delta.
