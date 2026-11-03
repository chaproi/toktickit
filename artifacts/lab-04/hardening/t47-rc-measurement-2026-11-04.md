# T-47 unchanged RC candidate measurement - 2026-11-04

## Disposition and provenance

**FAIL: measured per-operation p95.** The aggregate measured p95 and all zero-error/persistence assertions pass; three read operations exceed the unchanged per-operation 500 ms target. This is one measurement of a materially changed proposed RC candidate, not acceptance of D-12, human peer approval, release authorization, Issue #49 completion or scenario/Product DoD promotion. There is no rerun or tuning in this batch.

Clean execution HEAD: `8e0ba3e3b2bc8736b8d77bcd1111e305cfb1a78f`, `feat/49-d12-rc-candidate` in `.worktrees/d12-rc`. Local HEAD/upstream/live remote agree before execution. The evidence publication is later and changes no application, test or configuration bytes. Historical correctness evidence (96 files/2101 passes excluding T-47 at 8b877b6) is carried with its original provenance, not rerun here.

The student's prospective measurement instruction supersedes the prior ledger's decision not to execute based on instrumented first-wave latency. That diagnostic is not equivalent to this warmed workload. The earlier observations, all failed benchmark attempts and normative accepted contract remain intact.

## Preflight and unchanged workload

Repository identity and clean tree/index verified; no applicable AGENTS.md found. `performance-smoke.integration.test.ts` and `performance-test-helpers.ts` match original branch `535a2e5426ffe263630e44b763779050a95ab436` exactly (Git blobs `8b36d3393787b9f9cf645b285275855e8994642a` and `b6c121ff6a9c17d39b0392c31e228d0266f5e04f`). A SHA-256 snapshot of all 775 tracked files, including 452 historical artifacts, proves every existing tracked byte unchanged immediately after execution and before evidence preparation. The original branch and its uncommitted proposal are untouched.

The actual isolation guard and native live database/schema probe confirm the dedicated target matches configuration and differs from operational. Values are withheld. Before measurement, owned schemas, connections, idle transactions, advisory locks, sessions and fault resources are zero; competing owned repository workloads are zero. The benchmark additionally checks its exact owned schema through the application client.

Exactly 50 active authenticated users: 20 Requesters, 20 Staff, 10 Administrators. Sessions are provisioned with real login outside the latency phase. Exactly 100 sequential requests/user warm up (5000 total), then a complete phase barrier, then 10 sequential requests/user measure (500 total), 50 concurrent VUs. The unchanged role/endpoint schedule includes real reads, comments and Action CREATE/EDIT/START/COMPLETE/CANCEL; no uploads, HTTP retries, receipt replay substitution, exclusions, extra warm-up or added observer. Its existing pass-through transaction rejection observer is unchanged.

Windows x64 10.0.26200, Intel i5-13420H,8 physical/12 logical processors,34,049,220,608 bytes RAM; Node v24.14.0, PostgreSQL 18.6, matching Prisma/CLI/adapter/generated client 6.19.3 with public client engine. Real loopback HTTP/Express/Vitest-transformed TypeScript, NODE_ENV=test; not a production build, hosted CI, TLS benchmark or login benchmark. RAM free at start14,291,853,312 bytes. No CPU utilization, network deployment or capacity claim is inferred from host inventory.

All production settings remain unchanged. URL pool options are unset; the unchanged mapping yields max 17 connections (2 * physical cores + 1), connect5s/pool10s, transaction startup maxWait2s/execution5s. There are 18 database connections after warm-up including the fixture connection; this is not a new checkout timing measurement. Existing case budget 1,200,000 ms and HTTP request deadline 15,000 ms remain. Each VU uses its original keep-alive Agent with maxSockets1/maxFreeSockets1. Validation-only mode is absent for the command and its previous absent setting is restored.

## The single execution

From candidate `server/`:

```text
npm.cmd test -- tests/lab-04/performance-smoke.integration.test.ts
```

Command UTC 2026-11-03T17:12:51.345Z to 17:14:14.823Z; Asia/Bangkok **2026-11-04 00:12:51 to 00:14:14**. Case starts2026-11-03T17:13:17.484Z (00:13:17 Bangkok). Artifact filename correctly retains its generated local date2026-11-04. Exit1;1 file/1 case collected/executed,0passed/1failed/0skipped. Framework 78.60 s; reported case 57.229 s; monotonic case body57.203s; outer command wall83.476s. These are different boundaries, not additive phases.

| Phase | Requests | Errors/rate | p50 ms | p95 ms | Elapsed s | Requests/s | Peak / time-weighted / final HTTP concurrency |
|---|---:|---:|---:|---:|---:|---:|---|
| Warm-up |5000|0 /0%|282.108|500.153|31.6973|157.742|50 /47.674 /0|
| Measured |500|0 /0%|263.284|494.755|2.9770|167.957|50 /47.227 /0|

Warm-up statuses: 4500 responses with HTTP 200 and 500 with HTTP 201; measured: 450 with HTTP 200 and 50 with HTTP 201. Every one of 5500 samples is retained, including slow responses. Zero transport errors, semantic-shape errors, unexpected statuses or replayed responses. The warm-up p95 is recorded above 500 ms; the existing inline latency thresholds apply to measured results, while both phases require zero errors.

### Per operation

All latency values below use nearest rank, sorted[ceil(p * n) - 1], including every sample. The last column evaluates **measured** p95 strictly below 500 ms. No endpoint is excluded.

| Operation | Warm-up n | Warm-up p50 /p95 ms | Measured n | Measured p50 /p95 ms | Warm-up/measured errors | Measured target |
|---|---:|---:|---:|---:|---:|---|
| action.cancel | 150 | 395.362 / 513.963 | 15 | 339.323 / 397.103 | 0 / 0 | Pass |
| action.complete | 150 | 475.666 / 608.969 | 15 | 417.600 / 466.259 | 0 / 0 | Pass |
| action.create | 300 | 348.515 / 459.354 | 30 | 373.844 / 459.732 | 0 / 0 | Pass |
| action.detail | 300 | 200.820 / 288.209 | 30 | 185.217 / 314.566 | 0 / 0 | Pass |
| action.edit | 300 | 374.310 / 527.817 | 30 | 408.675 / 470.358 | 0 / 0 | Pass |
| action.history | 300 | 208.336 / 285.264 | 30 | 121.482 / 190.571 | 0 / 0 | Pass |
| action.start | 300 | 431.710 / 732.627 | 30 | 403.604 / 459.603 | 0 / 0 | Pass |
| comments.create | 200 | 286.669 / 517.001 | 20 | 251.605 / 330.877 | 0 / 0 | Pass |
| comments.list | 400 | 239.237 / 360.176 | 40 | 218.849 / 268.594 | 0 / 0 | Pass |
| requester.dashboard | 400 | 269.848 / 449.836 | 40 | 214.703 / 546.596 | 0 / 0 | Fail |
| requester.ticket.detail | 400 | 265.229 / 372.624 | 40 | 149.277 / 384.422 | 0 / 0 | Pass |
| requester.tickets.filtered-list | 200 | 306.252 / 490.716 | 20 | 354.783 / 382.567 | 0 / 0 | Pass |
| requester.tickets.list | 200 | 306.503 / 362.321 | 20 | 500.312 / 533.311 | 0 / 0 | Fail |
| staff.actions.list | 300 | 236.842 / 334.333 | 30 | 204.292 / 237.317 | 0 / 0 | Pass |
| staff.dashboard | 300 | 343.435 / 575.944 | 30 | 445.224 / 551.129 | 0 / 0 | Fail |
| staff.ticket.detail | 300 | 285.101 / 399.024 | 30 | 126.338 / 137.470 | 0 / 0 | Pass |
| staff.tickets.list | 300 | 254.608 / 448.673 | 30 | 255.134 / 382.069 | 0 / 0 | Pass |
| ticket.actions.list | 200 | 217.464 / 283.088 | 20 | 183.377 / 302.606 | 0 / 0 | Pass |

Thus 15/18 operation p95 targets pass. Requester Dashboard 546.596 ms, Requester Ticket list 533.311 ms and Staff Dashboard 551.129 ms fail. All measured mutation operations meet the latency threshold and all writes succeed. This aggregate evidence does not locate the internal cause of the three read latencies.

## Exact persistence and inline reachability

| Domain total | Before | Independently expected after | Observed after |
|---|---:|---:|---:|
| Tickets |2050|2050|2050|
| Actions |8000|8330|8330|
| ActionHistory |24000|25320|25320|
| TicketStatusHistory |3800|3800|3800|
| MutationReceipt |0|1320|1320|
| PublicComment |0|220|220|
| Users |50|50|50|
| Sessions |50|50|50|

30 workers x 11 cycles create 330 Actions and perform 1320 real Action mutations/history events/receipts;20 Requesters x 11 cycles create 220 comments. No receipt replay. The fixture covers all eight Ticket statuses, all four Action statuses and priorities; frozen parents have no unfinished children. Original seeded data and actual projections are unchanged in design. The benchmark's response checks acknowledge actual server Action IDs/versions and strictly advanced parent tokens, never fabricated values. Its retained artifact verifies totals, not a new independent per-row payload audit or proof of every business scenario.

**All preceding inline assertions execute and pass:** guard/live identity; real login/session identity; fixture/distribution/frozen consistency; no primary/cleanup failure; cleanup booleans; exact persisted counts; zero replays;5000/500 counts; each of50 per-user100/10 sequences; peak measured concurrency50; exact operation mix; zero warm-up errors; zero measured errors; aggregate measured p95<500. The **final** assertion at `server/tests/lab-04/performance-smoke.integration.test.ts:392` executes and fails: `Per-operation p95 target evaluated separately; no slow endpoint excluded: expected false to be true`. There is no later assertion left unreached on this measurement branch. The separate validation-only branch is intentionally not selected.

## Independent artifact checks and retained errors

[Raw redacted 5500-sample artifact](t47-performance-2026-11-04-measurement-45614b96.json),[independent calculations](t47-rc-independent-analysis-2026-11-04.json),[reproducer](analyze-t47-rc-measurement-2026-11-04.py),[execution/preflight/cleanup manifest](t47-rc-execution-2026-11-04.json).

```text
python artifacts/lab-04/hardening/analyze-t47-rc-measurement-2026-11-04.py
```

Offline Python independently recomputes both aggregate and all 36 phase-operation percentile/count/error values, all 5500 samples, 50 distinct role-correct users, per-user sequential/no-overlap 100/10 chains, exact operation multiplicities, interval-sweep peak 50/final 0, sum-duration time-weighted concurrency, elapsed/throughput, independent literal persisted totals and zero replays. It matches the original summaries. This is artifact-derived validation, not extra HTTP execution or replacement of the failed inline verdict. The artifact uses phase-relative clocks; the inter-phase barrier is established by the unchanged source/await order, not invented cross-phase absolute sample timestamps.

The existing transaction failure array is empty; no P2028 or other transaction failure is retained in this run. Therefore no new engine subtype or internal phase classification is claimed. Historical unknown P2028 subtypes remain unknown. `primaryFailure:null` means no harness/body exception, **not** that the final performance assertion passed (assertions run after artifact writing). Expected warnings are Prisma package.json configuration deprecation and pg queued-query deprecation. There is no Vitest unhandled-error summary.

Preflight tooling mistakes are separate: an inline Node version probe lost shell quotes; a file-based replacement tried an unexported adapter package.json subpath. Read-only filesystem package versions/generator inspection then succeeded before execution. A post-run log parser initially selected UTF-8 for PowerShell's UTF-16 log; explicit UTF-16 corrected the read. One non-elevated CPU inventory was denied; the authorized read-only inventory succeeded. None invoked benchmark traffic or changed source/configuration; there is still exactly one benchmark execution. A displayed ad-hoc elapsed subtraction mixed DateTime kinds; that diagnostic display is discarded in favor of the runner's monotonic Stopwatch/result and artifact clocks.

## History and interpretation

| Retained measurement | Runtime/protocol | Warm-up errors | Measured errors | Measured p95 ms |
|---|---|---:|---:|---:|
| [Original1f0f9c94](t47-performance-2026-11-01-measurement-1f0f9c94.json),8053570 |Prisma 5.22 native/SERIALIZABLE|1245|112|749.008|
| [Candidate adapter acdc02c8](t47-performance-2026-11-02-measurement-acdc02c8.json),36f86b8 |Prisma 6.19.3/SERIALIZABLE|794|71|590.303|
| [Global-admission7bc549d5](t47-performance-2026-11-03-measurement-7bc549d5.json),b31c67b |Prisma 6.19.3/global admission|2|0|973.907|
| [Front-queue e9510798](t47-performance-2026-11-03-measurement-e9510798.json),3683daa |Prisma 6.19.3/global admission+front queue|632|0|1089.992|
| This45614b96,8e0ba3e |Prisma 6.19.3/proposed resource-coordinated RC commands|0|0|494.755|

These are descriptive historical measurements with distinct revisions/times/host conditions, not a controlled causal experiment proving isolation alone accounts for any improvement. Workload/helper bytes and original thresholds match. Earlier failures and the accepted Lab-only failed-start bookkeeping retention limitation are preserved. No public per-record cleanup or memory-growth bound is established; 15 previously recorded dependency-audit findings remain untriaged. This short run does not establish memory safety or production capacity.

## Cleanup, scope and next gate

Owned requests drain before listener close/client disconnect and schema removal. Artifact cleanup booleans are all true and cleanupFailure is null. Independent native guard/live probes at 2026-11-03T17:14:37.746Z and 17:15:45.536Z confirm zero owned schemas,other connections,idle transactions,advisory locks,sessions,owned relations/functions/triggers and fixture Users. A privileged process inventory at17:14:38.292Z finds zero owned application/workload processes. Per-VU Agents/listener/client are shut down; scoped validation/environment values and transaction observer are restored. No blanket deletion,shared restore,application setting change or historical artifact overwrite occurs.

This publication adds only raw/derived redacted evidence,offline analysis,execution manifest,this ledger and an audit append. Original branch535a2e5 and its uncommitted proposal remain intact. No new TypeScript/build,correctness suite,compatibility proof,client/E2E or full benchmark repetition is run. Existing source/test/configuration bytes remain unchanged.

**Next action:** student/peer review the proposed D-12 candidate and this failed performance result; if further diagnosis is authorized, bound it to the three failing read operations using the retained sample timing distribution and actual route queries. Do not infer a root cause,retune budgets or repeat the benchmark from this result alone. T-47 remains failed on the candidate; D-12 remains proposed and all Issue/scenario/Product DoD and deployment gates remain unchanged.

Publication checks: 113 local links and10 Markdown tables validate; all5500 sample objects are inspected for the safe schema and all3 manifest artifact digests match. A staged-byte check caught Windows CRLF normalization in newly generated evidence before any commit. Only the five new files are canonicalized to UTF-8/LF; the existing audit prefix and all historical/source bytes remain unchanged. This is publication formatting,not another application execution.
