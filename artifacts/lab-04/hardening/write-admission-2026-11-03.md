# Bounded pre-snapshot write admission - 2026-11-03

## Scope, authorization and provenance

Continuation starts at published `fd651079d79b5fbfe18b33f96c5d4a75a3f4bfb4`, `feat/49-final-hardening`; local/upstream/live agree, tree/index clean. No applicable AGENTS.md exists. The student prospectively permits database-scoped admission of affected writers, superseding only the earlier global-gate prohibition. The [committed design and writer inventory](write-admission-plan-2026-11-03.md) records that tradeoff before application adoption. Neither the original failed T-47 results nor the demonstrated Ticket/receipt mechanisms are reinterpreted as passing.

Local Windows, Node v24.14.0, PostgreSQL 18.6, Prisma/client/adapter 6.19.3, pg 8.23.0, Vitest 2.1.9. No dependency, pool, index, DDL, test/transaction budget or retry-classification change. Dedicated guard/live identity and operational separation are checked without publishing settings. This is local execution, not hosted CI or production capacity certification.

Date is 2026-11-03 Asia/Bangkok; UTC is still November 2 for these executions. Preserve generated filenames, including the older literal date in the existing diagnostic filename. File dates alone are not execution provenance.

## Public-interface design and resource observations

The official pinned adapter's declared `underlyingDriver()` supplies its real pool. An explicitly selected transaction owns one actual checkout and a database/schema advisory lock **before BEGIN/snapshot creation**, then hands that same checkout to the official public transaction method. Separate Node processes coordinate through PostgreSQL. Reads, other schemas, Comments/Notes, attachment-only operations and routine session bookkeeping remain outside admission. The selected Ticket/Action/User/password/seed writers are exhaustively listed in the prospective plan; external maintenance writers still require quiescence.

The installed6.19.3 declaration and [version-matched official adapter source](https://github.com/prisma/prisma/blob/6.19.3/packages/adapter-pg/src/pg.ts) expose the driver/transaction methods used here. The existing [public release/deadline evidence](prisma6193-release-remedy-2026-11-02.md) remains applicable. The test query observer must route through the original public client boundary with its extended receiver; borrowing the bare extended transaction method does not preserve that boundary. This is not a claim that arbitrary external client extensions are certified.

Startup retains one effective maxWait allowance across pool checkout, admission waiting and transaction startup. Temporary admission `statement_timeout` is restored before business BEGIN and on failure. Execution timeout stays separate. Deferred physical release holds ownership until both the public transaction result and entered callback drain. Cleanup rolls back, unlocks and releases exactly once; secondary cleanup does not replace the primary error or create retry eligibility. Real connection loss aborts its transaction and cannot report success or persist a late write.

Thirteen focused resource/observer cases cover cross-process waiting before snapshots, default/overridden deadlines, concurrent waits, cumulative pool/admission waiting, late checkout/disconnect/reconnect, execution-timeout callback draining, schema/read independence, ORM/raw connection identity, callback/query/cleanup failures, genuine backend loss, genuine COMMIT40001 against an independent noncooperating PostgreSQL participant, nested read isolation, session-setting restoration and preservation of the public boundary through test query observation. Controlled component faults are labelled separately from genuine PostgreSQL failures. These finite observations are not an unbounded resource or memory guarantee.

The accepted [failed-start metadata-retention limitation](prisma6193-start-deadline-retention-2026-11-02.json) remains Lab-only: records may accumulate until disconnect; no public per-record cleanup or memory-growth bound. No retention re-investigation, version evaluation, client rotation or private patch. Fifteen previously untriaged dependency-audit findings remain unwaived.

## RED history and necessary corrections

The existing eight-command all-success semantic RED remains preserved in predecessor history. Its original domain assertions are retained. Admission intentionally replaces simultaneous cooperating business callbacks with overlapping real HTTP requests and observed pre-snapshot database waiting.

1. Resource proof initially passed 4 then 10 cases. A new nested-read case exposed inherited admission context (`P2028`): clear selection/attempt context per public transaction call. Preserve the executed failure and its separate correction commit.
2. A synthetic acquisition40P01 exposed session-budget contamination: 1,996ms remained instead of the prior 3,200ms. Restore the saved value during cleanup; preserve the original non-retryable error. Its tests-only RED is separate from candidate production.
3. The first affected 406-case run failed 82 cases: old barriers demanded second callbacks reach User/Ticket gates while admission prevented that entry. Replace only coordination with actual admission-wait observations; drain requests even when readiness fails. All 406 then pass, including the unchanged three-attempt assertion that had observed five calls after earlier undrained coordination failures. Do not replace or erase the failed run.
4. A comprehensive attempt was interrupted with no exit/final verdict after four completed files/871 reported passing cases. Its cause is unestablished. Connection/schema checks alone missed a partially initialized Staff Dashboard fixture cohort. A subsequent complete run failed 20 cases (extra reference data/four sessions). Independent source-specific UUID relationships and creation timestamps matching the interrupted log prove ownership: remove only that cohort in FK-safe order. Removed 10 Tickets, 11 Actions, 19 Action history events, 18 Ticket history events, one receipt/Note/comment, four Users/sessions, two Categories and one Related System; zero owned rows remain. No broad deletion/reset or historical evidence removal.
5. The older 35-request diagnostic reported completion despite actual write500s. Its public query-extension helper borrowed the extended client's transaction method, bypassing the candidate's public deadline/admission/error boundary. A new executed RED shows its callback succeeds while native admission is held. Correct instrumentation to call the original public transaction method with the extended receiver, retaining observations. Replace only the diagnostic's obsolete two-callback barrier with first-callback hold plus real second-request admission waiting. Preserve the bypassed artifact; its diagnostic pass is not application GREEN. No production remedy is inferred from those harness-induced failures.

6. Comprehensive15 passes every other case but observes one ungranted admission entry immediately after local drain. Final suite cleanup confirms zero owned locks/connections. The exact transient cause is unestablished. A local socket end is not a database-side lock-view acknowledgement: use the existing finite condition observer to require zero waiting entries while the external holder remains acquired, then execute the original zero-resource assertions. No production change, sleep-based ordering, deadline increase or timeout relaxation. Focused16 passes; its first post-local-drain waiter count is zero, so it is confirmation of the corrected readiness check, not a reproduction or proven fix of the earlier transient. Preserve the failed full verdict.

Static comparison retains all 139 original assertion calls across the independent CREATE, real COMMIT recovery and bounded CREATE diagnostic tests, plus all 30 in the older 35-request diagnostic. New waiting assertions are added; all business expectations remain. In shared race helpers only lock-coordination assertions change: the waiting second request has no business gates until admitted. Main T-42/T-51/T-52, eligibility, workflow and authorization test files remain unchanged.

## Commands and every attempt

All test commands below run sequentially from `server/`, without changing retries/configuration/budgets. The [machine-readable ledger](write-admission-results-2026-11-03.json) records exact command arguments and source-state qualifications. Counts are collected/executed/passed/failed/skipped; framework durations are reported separately from wall durations where retained. Private raw logs remain available locally; sensitive bootstrap output and temporary paths are not published.

| Attempt | Command/scope | Exit; files; collected/executed/passed/failed/skipped | Framework duration / qualification |
| --- | --- | --- | --- |
| 01 | admission feasibility | 0; 1; 4/4/4/0/0 | 11.56s |
| 02 | expanded feasibility | 0; 1; 10/10/10/0/0 | 13.29s |
| 03 | feasibility `-t 'does not inherit'` | 1; 1; 11/1/0/1/10 | 6.01s; semantic nested-read RED |
| 04 | feasibility after context correction | 0; 1; 11/11/11/0/0 | 12.45s |
| 05 | feasibility `-t 'restores the admission session budget'` | 1; 1; 12/1/0/1/11 | 4.46s; session-setting RED |
| 06 | feasibility after cleanup correction | 0; 1; 12/12/12/0/0 | 12.58s |
| 07 | independent CREATE, COMMIT recovery, CREATE diagnosis | 0; 3; 4/4/4/0/0 | 27.86s |
| 08 | retry/receipt/eligibility/workflow/ownership affected set | 1; 8; 406/406/324/82/0 | 443.73s; obsolete coordination and undrained consequences |
| 09 | same set after coordinator/draining corrections | 0; 8; 406/406/406/0/0 | 191.09s |
| 10 | authentication/attachment/snapshot/lifecycle set | 0; 14; 159/159/159/0/0 | 147.56s; persistent recovery 26.692s |
| 11 | comprehensive excluding only T-47 | no exit/verdict | interrupted; four completed files report 871 passes, not whole-run counts |
| 12 | same comprehensive command | 1; 88; 2072/2072/2052/20/0 | 753.94s; 755.142s wall; owned residual fixture contamination |
| 13 | feasibility `-t 'keeps public query observation'` | 1; 1; 13/1/0/1/12 | 6.96s; executed observer-boundary RED |
| 14 | all helper consumers plus four previously contaminated files | 0; 8; 83/83/83/0/0 | 108.99s; no production/budget change |
| 15 | comprehensive after ownership-proven cleanup and instrumentation correction | 1; 88; 2073/2073/2072/1/0 | 730.80s; 732.064s wall; immediate post-local-drain waiter observation |
| 16 | feasibility with database-side teardown readiness | 0; 1; 13/13/13/0/0 | 14.07s; original zero-resource assertions retained |
| 17 | comprehensive with corrected resource observation | 0; 88; 2073/2073/2073/0/0 | 773.98s; 775.153s wall; only T-47 excluded |
| 18 | server build | 0; no tests | 11.036s wall |
| 19 | unchanged T-47, once alone at clean published b31c67b | 1; 1; 1/1/0/1/0 | 94.31s framework;88.337s case;95.668s command |

TypeScript checks are recorded independently: an accidental root-directory compiler command was interrupted (exit1, no compiler verdict); a new unsupported `windowsHide` fork-option type and later implicit row-array type failed locally, then were corrected without changing assertions. Other server checks passed, including post-adoption/coordinator and observer checks. One edit script used a root-relative path from server and failed before writing; the following compiler pass did not verify that unapplied edit, which was then applied at the correct location and type-checked. No tracked manifest/lock change or alternative candidate version resulted from these mistakes.

Proof runs precede publication and use their recorded HEAD with pending prototype/candidate bytes; application runs06-12 use `b8ab0a3` plus pending production/coordination bytes, not exact-post-commit execution. Observer RED13 and corrective14/15 use `6380700` plus pending unchanged production and corrected helper bytes;16/17 add only the database-side teardown-readiness observation. Candidate GREEN is `0d404268a02131a029e8ec32899caea5b8f93d95`; final source digests are recorded in the machine-readable ledger. Comprehensive discovery is89 files with only the one T-47 file excluded:88 files/2073 passes, not an unfiltered full-suite pass. Existing bounded diagnostic/mechanism files execute through ordinary discovery; no new planner/jitter/version investigation is launched. No application checks are attributed to later Markdown publication.

## Application assertions reached

Eight distinct authenticated actors/Tickets/mutation UUIDs all return201 on their first attempt, with one exact Action/history/receipt per command and one authoritative parent advancement. Genuine COMMIT recovery uses an independent native SERIALIZABLE participant, deliberately outside admission. CREATE/EDIT alternate application loser index; actual native40001 arrives at transaction completion, exact failed-attempt rollback is checked before recovery, and attempts remain [1,2]/[2,1]. The two cooperating application HTTP requests overlap but their business callbacks are intentionally admitted sequentially.

Existing controlled late-fault cases separately prove fresh authorization/session/eligibility/token reads, success after confirmed failures, three-attempt exhaustion/no fourth attempt, and no retry for genericP2034,40P01, uniqueness, message-only or unexpected failures. T-51 recovery remains a distinct fresh authorized read after actual receipt-key rollback; T-52 replay-before-stale/frozen, competing keys/targets/actors and workflow atomicity assertions remain. Synthetic classification faults are not genuine COMMIT tests; native independent participants are controlled concurrency evidence, not production race statistics.

## T-47 result and next action

Correctness-regression candidate GREEN is `0d404268a02131a029e8ec32899caea5b8f93d95`; the single measurement executes at clean published **b31c67b39c4eea4fc2d56e4b0ad78060bd13b7d6**, after its evidence-only increment. Guard/live target, zero competing checks,50 sessions provisioned by real login outside measured traffic, original workload/helper/plan equality to8053570 and unchanged pool17/connect5s/pool10s/start2s/execution5s are recorded. Validation-only mode is explicitly unset/restored. No request retry, reduced concurrency, timeout or threshold change.

Command: `npm.cmd test -- tests/lab-04/performance-smoke.integration.test.ts`, once alone from server/. **Exit1;1 file;1 collected/executed;0 passed,1 failed,0 skipped**. Actual command2026-11-02T19:38:36.262Z to19:40:11.935Z, i.e. November3 02:38:36.262-02:40:11.935 Bangkok. Case starts19:38:43.458Z. Framework94.31s,case88.337s,command95.668s; artifact's own case counter88,292.474ms. [Complete unchanged-workload artifact](t47-performance-2026-11-03-measurement-7bc549d5.json) and [independent analysis](write-admission-t47-analysis-2026-11-03.json) retain every sample.

| Phase | Requests | Errors | Error rate | p50 ms | p95 ms | Elapsed s | Throughput req/s | Peak / time-weighted HTTP concurrency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Warm-up | 5000 | 2 | 0.04% | 376.881 | 1179.419 | 56.287 | 88.831 | 50 /43.276 |
| Measured | 500 | 0 | 0% | 440.969 | 973.907 | 5.616 | 89.032 | 50 /43.143 |

All50 users execute100 warm-ups then10 measured requests, sequential per user, with a complete phase barrier. Independent calculations confirm all5500 samples, exact per-user sequences and measured operation mix, both concurrency peaks50/final0 and all aggregate/operation nearest-rank percentiles. These are **artifact-derived checks**, not later inline assertions that the failed test did not reach.

| Measured operation | Count | Errors | p50 ms | p95 ms | Strict p95 <500ms |
| --- | --- | --- | --- | --- | --- |
| action.cancel | 15 | 0 | 555.893 | 620.659 | Fail |
| action.complete | 15 | 0 | 628.673 | 782.502 | Fail |
| action.create | 30 | 0 | 587.259 | 966.402 | Fail |
| action.detail | 30 | 0 | 288.056 | 449.446 | Pass |
| action.edit | 30 | 0 | 866.459 | 1056.739 | Fail |
| action.history | 30 | 0 | 29.072 | 225.579 | Pass |
| action.start | 30 | 0 | 750.190 | 970.665 | Fail |
| comments.create | 20 | 0 | 277.109 | 417.400 | Pass |
| comments.list | 40 | 0 | 348.368 | 458.659 | Pass |
| requester.dashboard | 40 | 0 | 440.990 | 1074.327 | Fail |
| requester.ticket.detail | 40 | 0 | 348.867 | 432.482 | Pass |
| requester.tickets.filtered-list | 20 | 0 | 402.103 | 543.975 | Fail |
| requester.tickets.list | 20 | 0 | 552.367 | 932.763 | Fail |
| staff.actions.list | 30 | 0 | 393.305 | 486.578 | Pass |
| staff.dashboard | 30 | 0 | 818.162 | 1065.067 | Fail |
| staff.ticket.detail | 30 | 0 | 285.077 | 315.144 | Pass |
| staff.tickets.list | 30 | 0 | 506.904 | 739.059 | Fail |
| ticket.actions.list | 20 | 0 | 188.917 | 340.885 | Pass |

The two unexpected responses are **warm-up COMPLETE**, users32 and44, sequence8, HTTP500 INTERNAL_ERROR, durations2302.174/2296.229ms. Exactly two transaction rejections are retained: P2028, SERIALIZABLE,2005.023/2000.428ms, no confirmed SQLSTATE/model. The original observer does not retain subtype or transaction phase; those durations are consistent with, but do not positively classify, startup-deadline expiry. Do not treat allP2028 as equivalent, infer a dangerous dependency, invent a retry or label this confirmed40001. No transport/semantic/replay failures are observed; measured HTTP status expectations all match. No second workload or tuning follows.

| Persisted field | Expected | Observed |
| --- | --- | --- |
| Tickets | 2050 | 2050 |
| Actions | 8330 | 8330 |
| Action history | 25320 | 25318 |
| Ticket status history | 3800 | 3800 |
| Mutation receipts | 1320 | 1318 |
| Public Comments | 220 | 220 |
| Users /sessions in owned fixture | 50 /50 | 50 /50 |

The first unsupported inline invariant is the independent persisted-count comparison: two history/receipt operations are missing, consistent with the two failed completions. Counts alone do not prove per-command rollback. Cleanup/harness-primary checks execute and pass before this assertion fails. Receipt-replay, phase/user count, concurrency/mix, zero-error and p95 inline assertions are **unreached**. Their actual artifact values remain available: no receipt replays; zero measured errors true; zero warm-up errors false; aggregate p95 false; all-operation p95 false (10/18 fail). The required T-47 verdict is **FAILED**, despite zero measured errors and passing correctness regressions.

Comparison, without overwriting or re-executing earlier results: original8053570/native5.22 had1245 warm-up errors,112/500 measured errors,p95749.008ms,177.866 measured req/s; previous36f86b8/candidate6.19.3 had794 warm-up errors,71/500 measured errors,p95590.303ms,165.622req/s. This admission run has2 warm-up errors,0/500 measured errors but p95973.907ms and89.032req/s. These are descriptive local observations, **not a controlled causal A/B**. Candidate/runtime and Queue changes, timestamps/fixtures and host conditions differ. Same host reports Windows10.0.26200/x64,Node24.14.0,Intel i5-13420H,12 logical CPUs,34,049,220,608 total RAM bytes,13,698,768,896 available before/13,549,113,344 after; Vitest-transformed source Express/NODE_ENV=test, loopback HTTP without TLS, not production build. Actual representative plans are retained outside latency measurement in the raw artifact. No CPU-pressure, pool-exhaustion, index or long-term capacity conclusion is established.

**Next bounded action:** attribute these two COMPLETE P2028 failures and successful-operation delay using transaction-local acquisition/admission/start/callback/cleanup timestamps on a small real authenticated cohort, with actual lock/pool-wait observations and one representative read under that load. Preserve all budgets, pool settings, retry policy and business assertions. Confirm the subtype before proposing any correction. This is a performance/resource-phase diagnosis, not a new adapter-version/retention gate or another full benchmark. The admission tradeoff is not accepted for release; physical-layout or another design decision requires evidence rather than speculation. T-47 remains failed; peer review, remaining audit gaps and #50 remain outstanding.

## Cleanup and limitations

Resource proofs verify child exit, callback/request draining, exactly-once checkout release, zero granted/waiting admission locks, tagged connections and owned schemas after disconnect. All fixtures clean only owned IDs in FK-safe order. The interrupted cohort required separate ownership-proven cleanup and is preserved as failed/incomplete evidence. The official Seaweed4.51 archive matches its previously recorded SHA-256; executable/storage setting is scoped to owned test processes and no shared service is changed.

A temporary independent-analysis formatting script emitted Python lexical spacing warnings; spacing was corrected before reuse, without changing samples or test outcomes. Create-only seed review warnings, existing pg queued-query deprecation, Prisma configuration deprecation and expected sanitized controlled-fault/PowerShell stderr remain disclosed. The failed measurement does not support latency-target acceptance, no certified memory bound, deployment/TLS support expansion, cross-browser/accessibility completion, peer acceptance or #50 release approval. The public composition and serialized-write tradeoff require implementation review.
