# T-47 unchanged candidate confirmation - 2026-11-02

**Current verdict: FAILED.** Exactly one full specified workload ran, at clean published HEAD [36f86b8c7aba1f120e6e713c8def3e74e1b2e89e](https://github.com/chaproi/toktickit/commit/36f86b8c7aba1f120e6e713c8def3e74e1b2e89e). No source correction, tuning, HTTP retry, favourable repeat, comprehensive regression or compatibility proof ran in this batch. This ledger/evidence publication is not a later application execution or hosted CI.

## Preflight, unchanged workload and command

Repository chaproi/toktickit; branch feat/49-final-hardening. Local/upstream/live origin SHA all matched36f86b8, ahead/behind0/0, clean tree/index. Fetch succeeded; no applicable AGENTS.md was found in the repository/ancestor scope. The exact benchmark, workload helper and prospective plan match original measurement [8053570](https://github.com/chaproi/toktickit/commit/8053570a835a9b9c04f01a72cf9a5085f2b6e3b8) byte-for-byte in Git; their SHA-256 values are in the [independent analysis](t47-confirmation-analysis-2026-11-02.json). All571 existing tracked working files matched saved byte hashes before the evidence edit.

The actual configureTestDatabaseEnvironment guard and read-only PostgreSQL probe established the live dedicated database/schema identity and a distinct operational database, with zero owned schemas, idle transactions or competing active test connections. Names/connection values are withheld. The first process inventory was denied by the filesystem sandbox and did not prove absence; an authorized read-only CIM check then verified no competing test/build/seed/storage process before execution. No database write began before those checks. A later local document lookup used the wrong cwd and failed read-only; it was corrected without any workload rerun.

Installed CLI/client/adapter/driver-adapter-utils and generated client all6.19.3; pg8.23.0. The accepted candidate's public release/deadline/configuration/error compositions are unchanged. Validation-only mode was absent initially, explicitly unset for this command, and restored to absent in finally. All other pool/timeouts/retry/workload settings were preserved.

From server/, once, alone:

```text
npm.cmd test -- tests/lab-04/performance-smoke.integration.test.ts
```

Command UTC:2026-11-02T15:55:41.4724850Z through15:56:45.7945925Z; **Asia/Bangkok22:55:41.472 to22:56:45.795**. Vitest start22:55:42; actual case/report start22:55:47.377 (15:55:47.377Z). Exit **1**; **1 file,1 collected/executed,0 passed,1 failed,0 skipped**. Framework63.31s; test case58.300s; monotonic artifact case58.283740s; command wall64.317992s. These are different timing scopes, not interchangeable numbers.

The [complete unchanged-harness redacted artifact](t47-performance-2026-11-02-measurement-acdc02c8.json) is published byte-for-byte, retaining every5500 status/response-metadata/latency sample and1654 transaction rejection observations. No raw credential/body/connection/SQL content is added. The generated filename's date is2026-11-02 and matches this execution; the original2026-11-01 artifact remains unchanged and is not renamed. Private console output is retained; command metadata and hashes are in the analysis record.

## Exact workload and host conditions

50 distinct active authenticated users:20 Requesters,20 IT_STAFF,10 Administrators. Each issues100 sequential warm-ups, then10 sequential measured requests. All50 VUs run concurrently using their own keep-alive Agent/maxSockets1; the source awaits the full warm-up allSettled barrier before starting measurement. The raw sample start clocks reset per phase and cannot independently establish an absolute cross-phase barrier timestamp; the awaited source flow supplies that observation.50 real logins and50 auth/me checks are outside the workload, not login-performance evidence.

Original role/endpoint mix is unchanged: measured360 reads/140 writes, including real comment creation and Action CREATE/EDIT/START/COMPLETE/CANCEL, with fresh keys/current acknowledged server tokens. No uploads, fabricated writes, receipt replays, extra recovery calls or sleeps; no HTTP retries or budget/concurrency changes.20-minute original finite case budget/15-second transport deadline and at most3 confirmed40001 mutation attempts remain unchanged. Failure chains deliberately retain their subsequent original scheduled requests, rather than repairing targets mid-run.

Windows10.0.26200 x64, Node24.14.0, TypeScript5.9.3, tsx4.23.12, Vitest2.1.9, PostgreSQL18.6; Intel Core i5-13420H/12 logical processors,34049220608 RAM bytes. Available RAM before/after:18618757120/18209591296 bytes; worker RSS107315200/472875008 bytes. These host snapshots are not measured CPU utilization, a heap-growth bound or proof of a leak. Source-mode Vitest/Vite Express on local loopback without TLS; app/database share a host; not an optimized production deployment/capacity guarantee.

All URL pool options remain unset. The unchanged harness labels this `unset; inherited engine default`; that literal field describes absence of URL overrides, not measured pool capacity. The adopted factory explicitly maps currentWindows8 physical cores to17, with connect5s/pool-wait10s, transaction maxWait2s/execution5s and normal URL/per-call overrides unchanged.18 dedicated-database connections were observed after warm-up (includes the fixture connection; not an independent pool-capacity measurement). PostgreSQL max_connections100, shared_buffers128MB, work_mem4MB, effective_cache_size4GB, jit on, track_io_timing off. No pool/index/transaction tuning occurred.

Initial fixtures:2050 Tickets;8000 Actions (1250 PLANNED,1250 IN_PROGRESS,2750 COMPLETED,2750 CANCELLED);24000 Action history snapshots;3800 Ticket status events;50 users/sessions;zero receipts/comments. Four categories/systems, all eight Ticket states, four requested/IT priorities, null/worker ownership,14-day timestamp spread and distinct per-VU mutation Tickets remain as planned. Frozen parents contain only terminal children. Query plans were collected outside latency measurement: requester list0.050ms, Ticket Actions0.026ms, Action history0.568ms, assignee unfinished0.229ms and representative resolution aggregation4.144ms execution. Full safe trees are retained; these unchanged predicate probes do not explain whole-route latency or prove every production query plan.

## Phase results and every operation

| Phase | Requests | Errors / rate | p50 ms | p95 ms | Elapsed ms | Requests/sec | Peak / time-weighted HTTP concurrency | Final in flight |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Warm-up | 5000 | 794 /15.88% | 277.441 | 643.934 | 32792.329 | 152.475 | 50 /46.569 | 0 |
| Measured | 500 | 71 /14.20% | 235.370 | 590.303 | 3018.918 | 165.622 | 50 /44.781 | 0 |

All durations include failures. Nearest-rank p50/p95 use sorted[ceil(p*n)-1]; no success-only filtering/outlier removal. Error includes unexpected status, transport or semantic failure. Both transport and semantic failure counts are0; all865 errors are retained HTTP400/409 outcomes. Warm-up statuses:3825x200,381x201,245x400,549x409. Measured:394x200,35x201,71x409; no500. Rounded table values do not replace raw numeric samples.

| Operation | Warm n / errors | Warm p50 ms | Warm p95 ms | Measured n / errors | Measured p50 ms | Measured p95 ms | Measured p95 <500 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| action.cancel | 150 / 95 | 358.475 | 687.074 | 15 / 9 | 254.794 | 486.596 | Pass |
| action.complete | 150 / 111 | 351.427 | 714.414 | 15 / 12 | 235.452 | 536.944 | Fail |
| action.create | 300 / 119 | 516.243 | 773.936 | 30 / 15 | 557.160 | 710.952 | Fail |
| action.detail | 300 / 49 | 208.728 | 266.772 | 30 / 0 | 220.369 | 290.599 | Pass |
| action.edit | 300 / 181 | 373.180 | 701.264 | 30 / 14 | 339.925 | 665.297 | Fail |
| action.history | 300 / 49 | 197.232 | 265.712 | 30 / 0 | 65.025 | 148.769 | Pass |
| action.start | 300 / 190 | 430.467 | 754.244 | 30 / 21 | 374.359 | 684.433 | Fail |
| comments.create | 200 / 0 | 237.559 | 306.340 | 20 / 0 | 222.722 | 252.850 | Pass |
| comments.list | 400 / 0 | 252.719 | 346.093 | 40 / 0 | 198.865 | 251.134 | Pass |
| requester.dashboard | 400 / 0 | 278.590 | 360.130 | 40 / 0 | 255.406 | 290.771 | Pass |
| requester.ticket.detail | 400 / 0 | 290.172 | 407.952 | 40 / 0 | 146.832 | 388.450 | Pass |
| requester.tickets.filtered-list | 200 / 0 | 311.497 | 366.194 | 20 / 0 | 281.007 | 293.312 | Pass |
| requester.tickets.list | 200 / 0 | 316.084 | 421.117 | 20 / 0 | 427.097 | 464.477 | Pass |
| staff.actions.list | 300 / 0 | 245.213 | 318.956 | 30 / 0 | 175.695 | 202.710 | Pass |
| staff.dashboard | 300 / 0 | 333.835 | 445.100 | 30 / 0 | 419.427 | 490.615 | Pass |
| staff.ticket.detail | 300 / 0 | 292.539 | 360.842 | 30 / 0 | 128.296 | 135.063 | Pass |
| staff.tickets.list | 300 / 0 | 251.717 | 408.353 | 30 / 0 | 230.115 | 289.900 | Pass |
| ticket.actions.list | 200 / 0 | 223.042 | 276.570 | 20 / 0 | 204.211 | 258.158 | Pass |

Measured p95 passes14 of18 buckets but fails CREATE, EDIT, START and COMPLETE. Passing latency alone does not make an operation successful: CANCEL p95<500 still has9/15 errors. Warm-up p95 is recorded diagnostically; the formal inline latency acceptance is evaluated for the measured phase. Warm-up zero errors is independently required and fails.

## Persisted counts, first failure and assertions reached

| Domain count | Before | Exact all-success expectation | Actual after |
| --- | --- | --- | --- |
| Tickets | 2050 | 2050 | 2050 |
| Actions | 8000 | 8330 | 8196 |
| Action history | 24000 | 25320 | 24553 |
| Receipts | 0 | 1320 | 553 |
| Public comments | 0 | 220 | 220 |
| Ticket status history | 3800 | 3800 | 3800 |
| Users / sessions | 50 /50 | 50 /50 | 50 /50 |

Expected real writes across11 cycles:330 CREATE,330 EDIT,330 START,165 COMPLETE,165 CANCEL =1320 Action/history/receipt operations, plus220 comments. Actual acknowledged successful operations:196 CREATE,135 EDIT,119 START,42 COMPLETE,61 CANCEL =553 Action/history/receipt writes, plus220 comments. Independent aggregation of successful HTTP samples exactly reconciles the persisted counts (196 added Actions,553 added histories/receipts). Deficits:134 Actions and767 histories/receipts. No replay. Successful response token/version/strict parent-advance readiness checks inside runActor executed without semanticError; the raw redacted samples do not retain per-Ticket timestamps or re-prove exact parent-row rollback for each failed request. Do not infer those deeper domain assertions from aggregate totals.

The first unexpected scheduled request by warm-up start is **VU31, sequence4, action.create, expected201, actual409 CONCURRENT_UPDATE**, start1380.6684ms/duration651.8783ms within warm-up. This is the first unsupported all-success command prerequisite. It is not an invalid-ID setup/collection error. The first failing **inline assertion** is independent persisted-count equality at [test line376](https://github.com/chaproi/toktickit/blob/36f86b8c7aba1f120e6e713c8def3e74e1b2e89e/server/tests/lab-04/performance-smoke.integration.test.ts#L376).

| Assertion group | Execution / result |
| --- | --- |
| Live isolation,50 session identities, initial counts/distributions/frozen-child preconditions | Executed and passed before workload |
| report.primaryFailure null; cleanupFailure null; all cleanup flags true | Executed and passed after workload |
| Persisted count equality | Executed and failed; test exit1 |
| Receipt replay zero; warm-up/measured counts; per-user counts; peak50; exact mix | Inline assertions **unreached** after line376; separately recomputed from complete artifact and pass |
| Warm-up/measured zero errors; measured aggregate p95<500; all operation p95<500 | Inline assertions **unreached**; separately calculated, all four target flags **false** |

The artifact's `primaryFailure:null` means the harness body completed without a caught setup/transport exception; it does not mean the test passed. No later threshold assertion is described as executed. Independent Python checks used explicit role/ten-step schedules, expected mix and literal final counts; did not import production summary/calculation helpers or issue HTTP. They verified5500 samples, unique per-VU/phase sequence ranges, sequential requests within each VU, exact role/method/status expectations, phase/per-operation counts, nearest-rank percentiles, all errors, peak concurrency via start/end event sweep, throughput and time-weighted concurrency via duration sums/elapsed. All summaries match the raw artifact. [Derived checks, per-user first failures, exact counts and source hashes](t47-confirmation-analysis-2026-11-02.json) are artifact analysis, not replacement inline passes.

## Failure classification, original comparison and next action

The unchanged transaction observer retains1654 real rejections with confirmedSqlStates=[40001]. Its separate `code` field only records Pxxxx values and is therefore `unclassified` for the sanitized native40001 bridge; this does not discard the structured SQLSTATE. No40P01/23505/23514 or P2034 is observed in that collection. It has no per-request/VU attempt attribution. Do not divide1654 into asserted exact attempt counts per command or claim an identified read/write-conflict relation.

Whole-workload error codes:417 CONCURRENT_UPDATE,245 INVALID_ACTION_ID,126 ACTION_TERMINAL,61 INVALID_ACTION_TRANSITION,16 ACTION_STATUS_UNCHANGED. The CREATE endpoint maps its unchanged max3 confirmed40001 exhaustion to409 CONCURRENT_UPDATE; its first failing create is evidence that successful recovery under a coordinated pair does not guarantee all50-VU commands recover within that bound. PATCH also has an inherited concurrent-result branch, so this report does not equate every409 with observed three-attempt exhaustion. The unmodified schedule retains the last acknowledged Action after failed CREATE; later invalid-ID/terminal/unchanged/transition outcomes are dependent symptoms, not evidence to repair or exclude samples. Exact conflicting database relation and request-attributed attempts remain unmeasured here.

| Measurement | Original failed8053570 /2026-11-01 | Confirmation36f86b8 /2026-11-02 |
| --- | --- | --- |
| Warm-up errors; p50 /p95 ms | 1245 /24.90%;254.493 /516.323 | 794 /15.88%;277.441 /643.934 |
| Measured errors; p50 /p95 ms | 112 /22.40%;224.886 /749.008 | 71 /14.20%;235.370 /590.303 |
| Measured requests/sec | 177.866 | 165.622 |
| Action / history /receipt totals | 8083 /24209 /209 | 8196 /24553 /553 |
| Current acceptance | Failed | Failed |

The [original artifact](t47-performance-2026-11-01-measurement-1f0f9c94.json), samples and [failed result ledger](t47-performance-results-2026-11-01.md) are byte-identical and remain failed. Current Prisma/client5.22 to6.19.3 and public client-engine/adapter composition, plus prior ordinary Queue DB pagination, are real intervening changes. Added adapter/driver utilities6.19.3 and dotenv16.6.1; pg8.23.0, TypeScript5.9.3, tsx4.23.12, Vitest2.1.9 and Node24.14.0 unchanged. Both fixture scales and URL options match; live recent-window dates/data and host free RAM differ (original5725335552 bytes available before, current18618757120). No measured CPU utilization/background OS-load, full route wait decomposition or controlled A/B isolation exists. Descriptive numeric differences do not prove which change caused them or a production-capacity improvement. Original opaque P2034s are not retrospectively classified by this new structured evidence.

**Smallest evidence-supported next batch:** bounded, request/attempt-attributed diagnosis of an authorized concurrent CREATE cohort that reproduces409 exhaustion. Start with the first-failure operation, keep independent Ticket/actor targets and all gates/tokens/security/retry<=3 unchanged, correlate actual transaction SQLSTATE and database dependency/lock observations. Determine which shared read/write dependency prevents recovery before proposing a narrow RED/GREEN correction. Do not tune pool/indexes, add a fourth attempt, classify generic P2034 or rerun the complete workload to search for a pass. Four measured write latency buckets also remain over500; the current artifact does not establish whether their time is retry/connection/auth/query/lock/CPU dominated. No new contract decision is justified from these aggregates alone.

## Cleanup, preservation and remaining limits

Traffic phases ended at0 in-flight; every VU promise drained before cleanup. All Agents destroyed, listener closed, Prisma disconnected, transaction observer restored and owned schema removed. Independent guarded probes verify0 owned index schemas,0 leaked benchmark users/Tickets,0 idle transactions,0 other active or remaining dedicated connections,0 candidate connections and0 competing test/build/storage workers. Schema removal eliminates its owned fixtures/sessions/indexes; no shared/operational rows were deleted. Scoped validation mode returned to its prior absent state; child environment changes were restored. Private logs/metadata are retained without publishing sensitive local paths. No temporary profile/storage process or binary was needed.

Only this new raw report, derived analysis, ledger and hardening-audit update are published. Every pre-existing tracked byte except the explicitly updated audit remains unchanged. UTF-8/JSON/local links/tables/whitespace are checked before commit. No application/test/helper/plan/dependency/configuration edit, unrelated suite, T-31 rerun, PR or Issue metadata change.

Warnings preserved: inherited create-only seed/reference/eligibility warnings and pg single-client query-queue deprecation; PowerShell stderr wrapping is not the verdict (actual npm exit1 and Vitest failed assertion are authoritative). The candidate's accepted failed-start metadata accumulation until disconnect/no public per-record cleanup/no memory-growth bound remains a Lab4-only student decision, not fixed or waived. The15 untriaged npm audit findings (5moderate/7high/3critical) remain carried from adoption; no npm-audit refresh or remediation occurred here. Performance failure does not reopen completed compatibility proofs. T-47 stays **F current+I**. Broader visual/accessibility and final integrated acceptance/#49 implementation peer review/#50 release remain separate, with no scenario/Product DoD promotion.
