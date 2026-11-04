# Read-path round-trip correction - 2026-11-04

## Established facts and limits

The prior unchanged T-47 at54967c3's parent source8e0ba3e has0/5500 errors,exact persistence and aggregate measured p95494.755ms,with three operation misses. Retained measured samples show RequesterDashboard5/40 responses>=500ms (starts102.464-1837.390ms),MyTickets11/20 (starts237.822-707.521ms),StaffDashboard8/30 (starts113.811-138.615ms). Those are end-to-end timings,not authentication/pool/SQL attribution. [Original measurement](t47-performance-2026-11-04-measurement-45614b96.json) and [original ledger](t47-rc-measurement-2026-11-04.md) are unchanged.

Source inspection confirms multiple sequential compatible reads on one connection. No Promise.all claim or SQL-only explanation is used. A bounded new real-HTTP/Prisma/pg observation executes exactly two requests per route on two real authenticated identities and24 owned Tickets (8 legitimate resolutions),unique reference scope. No business result,token,clock or HTTP success is mocked. Public pool checkout,transaction callback boundaries and driver completion are observed with monotonic time. Actual captured SELECT plans are collected outside request latency through EXPLAIN(ANALYZE,BUFFERS);SQL/parameters remain private and only allowlisted plan nodes/timings are exported.

Corrected baseline observation03 demonstrates9/6/17 business SELECTs per request (RequesterDashboard/MyTickets/StaffDashboard),with5/1/8 separate aggregate statements. All six HTTP status,ownership/count/order/privacy assertions pass before the query-budget RED assertions. Baseline repeated-request end-to-end times are19.766/9.960/28.809ms;pre-transaction4.563/4.886/4.130ms;startup0.566/0.351/0.446ms;callback13.443/3.689/23.179ms;completion0.292/0.165/0.220ms;remaining client/response envelope0.902/0.868/0.834ms. These are small-fixture observations,not loaded p95.

Public checkout totals for those repeated requests are0.075/0.080/0.070ms. Authentication/eligibility driver time is0.897/0.881/0.729ms;all business driver round trips (including transaction control/clock) total6.009/2.732/10.596ms. Driver time includes protocol/network/result handling;it is not pure PostgreSQL execution. Checkout and driver intervals overlap the wall-clock transaction phases and must not be added as independent costs. Pre-transaction and response envelopes also contain unmeasured framework/HTTP/serialization work. Native actual-query plans in this24-row fixture have maximum execution0.083ms. This does not establish that SQL execution,authentication or pool waiting caused the prior benchmark tail. The supported defect is avoidable sequential database/ORM round trips and corresponding connection occupancy;the effect on T-47 remains to be measured once.

[Meaningful baseline artifact03](read-batching-2026-11-03-03c7a775.json) and[first observer-error artifact01](read-batching-2026-11-03-9d64dd58.json) preserve every attempt. Generated diagnostic filenames use UTC2026-11-03;the human ledger date is2026-11-04 Asia/Bangkok. No historical name/timestamp is rewritten.

## Correction and preserved contracts

Tests-only RED commit `03b84a7c74dbaf5b2a37397394b37f68c158e56e`;candidate GREEN `56092ce94d0c400c4dcd465e5c01c4f2729bb6ca`.

- `server/src/dashboards/dashboard-read-sql.ts`:one parameterized PostgreSQL statement shares a filtered parent CTE across compatible counts/bins and bounded recent lists. Resolution history is grouped once per currently RESOLVED/CLOSED parent,latest qualifying time only,half-open bounds with inclusive server-asOf cap. Only five explicitly safe Ticket rows per list leave PostgreSQL,with time/id ordering and UTC millisecond text. Actor-scoped Action status counts intersect the identical parent scope.
- `requester-dashboard-service.ts` and `staff-dashboard-service.ts`:retain their existing read-only REPEATABLE READ transaction,one server clock,Bangkok calendar calculation,normalized filters/descriptors and external DTOs. Staff's nonempty unfinished Action projection remains the existing safe ORM/API-07 projection,oldest-first and bounded5. When the same-snapshot unfinished count is0,it skips unnecessary empty relation hydration;no successful/empty response is fabricated.
- `server/src/tickets/requester-ticket-page.ts` and the narrow delegation in `ticket-service.ts`:ordinary owned lists combine final filtered count,page and safe reference projection into one statement. Date/widget/resolution extensions keep their prior path. Static whitelist ordering retains enum/text semantics,same-direction ID ties,valid large-page/zero/beyond-final metadata and inherited search. Page references are joined after LIMIT/OFFSET. Eligibility,authentication,HTTP envelopes/no-store behavior and all write methods remain unchanged.

No RC writer protocol,admission,transaction settings,dependency,index,migration,cache,queue or retry change. No isolation downgrade of read snapshots. Requester ownership and Staff owner eligibility/intersection semantics are preserved. Terminal/historical identities remain safe and are not excluded merely because current worker eligibility changed.

The six observation requests now demonstrate1/1/1 business SELECTs in this empty-assignment fixture;nonempty Staff Action hydration is deliberately retained (an earlier candidate observation records6 total SELECTs). This is not a universal one-query Staff endpoint claim. [Corrected round-trip confirmation](read-batching-2026-11-03-d7ca1d23.json) and the comprehensive run's separately generated read-batching artifact preserve actual timing/plan details;no small-cohort latency is substituted for T-47.

## Test compatibility and every execution

The first new TypeScript attempt fails on two untyped HTTP parameters and a duplicate label field;no production behavior is classified from it. Attempt01 sends six valid reads but the record's sample label overwrites its route label,so the test selects an empty observation array. This observer mistake is corrected;02type-checks and03produces meaningful round-trip RED (three cases failed). A private runner invocation was denied execution policy before npm;the authorized invocation succeeds without changing persistent policy.

Attempt05:80executed,73passed/7failed. Four Requester boundary failures are old delegate-only read observations;two Staff snapshot barriers still expect removed count/groupBy delegates;the new Staff SELECT bound catches unnecessary empty Action hydration. That last measured cost is corrected by skipping hydration only when the same-snapshot count is zero. The probes are adapted to actual completed raw aggregate/page statements,while retaining the exact clock overrides,real writer coordination,RR/read-only/backend assertions and every business result assertion. Attempt06:237executed,235passed/2failed;only two expected observation-name strings remain obsolete. They are changed from ticket.count/action.groupBy to the truthful combined Dashboard aggregates name;no domain assertion is removed. Attempt07passes all237.

Calendar unit mocks now supply an explicit empty raw-summary result after the clock;all12 independent literal date expectations remain unchanged. Controlled security fault injection now occurs after the actual combined business read rather than after a removed ORM count. Real authentication,transaction controls,safe status/envelope/logging,domain preservation and subsequent fault-free recovery assertions remain. These are still controlled classification injections,not natural database outages. Snapshot observations explicitly include real clock/final transaction-state SQL where counts/lists are now combined,not fictional multiple aggregate calls.

Exact arguments,UTC timestamps,exit codes and source manifests are in [command ledger](read-path-commands-2026-11-04.json). All database/test/build commands are sequential. A download/extraction of the same pinned recovery prerequisite overlaps early comprehensive preparation;it is not a competing repository test/build and no performance conclusion uses comprehensive wall time.

| Attempt | Command / scope | Files;executed result;exit | Framework /command seconds |
|---|---|---|---:|
|01|new bounded read file|1;0passed/3failed;1|7.44 /8.460|
|02|npm.cmd exec -- tsc --noEmit|passed;0|not applicable /7.131|
|03|new bounded read file,corrected observer|1;0passed/3failed;1|7.15 /8.371|
|04|npm.cmd exec -- tsc --noEmit|passed;0|not applicable /7.610|
|05|5affected files|5;73passed/7failed;1|33.94 /35.142|
|06|10affected files|10;235passed/2failed;1|64.65 /65.677|
|07|10affected files after concrete observation correction|10;237passed/0failed/0skipped;0|65.16 /66.206|
|08|npm.cmd exec -- tsc --noEmit|passed;0|not applicable /7.089|
|09|npm.cmd run build|passed;0|not applicable /6.506|
|10|npm.cmd test -- --exclude tests/lab-04/performance-smoke.integration.test.ts|97;2104passed/0failed/0skipped;0|728.62 /729.528|

Comprehensive execution is2026-11-03T17:37:11.802Z-17:49:21.384Z (Bangkok2026-11-04 00:37:11-00:49:21),at HEAD03b84a7 with the pending source/observer bytes subsequently committed unchanged as56092ce. A327-file source/document digest manifest and actual97-file/2104-case output independently verify provenance/discovery. Exactly unchanged T-47 is excluded from98discovered files;this is not an unfiltered full-suite or hosted CI pass. No new application execution is attributed to GREEN or later evidence commits.

## Cleanup and prospective measurement gate

Independent guarded native live-target probe after comprehensive execution at2026-11-03T17:49:37.248Z reports0owned schemas,other connections,idle transactions,advisory locks,sessions and fault resources. Process inventory0owned workloads. Existing tests verify owned row/bucket/archive/profile/listener removal and restored spies;current scoped storage executable setting is restored. Only the verified owned temporary prerequisite directory is removed after processes drain. Pinned SeaweedFS4.51 archive digest08866a53e1bdd5378ee9880f8ee30d981d1bbb6ae22ee1897deb17ff87f8d2fb;no shared installation/configuration change. Prisma/pg deprecation and inherited seed-preservation/controlled-fault warnings remain;no Vitest unhandled-error summary.

The clean candidate source and these redacted correctness observations will be normally published before **one** unchanged T-47. Its existing5000warm-up/500measured requests,50VUs,thresholds,observer,pools and budgets remain intact. No benchmark has executed yet in this correction batch. Prior failed verdicts remain authoritative historical evidence. D-12 remains proposed;failed-start retention and15untriaged dependency findings remain accepted/unresolved limitations respectively. No peer approval,merge,deployment or Issue/scenario/Product DoD promotion.


## Single clean published-source T-47 result

**FAIL remains the overall benchmark verdict. All three scoped read-operation targets pass in this measurement.** No second execution or further tuning occurs. The next artifact is additive;no prior failed result is overwritten.

Execution HEAD `69164d1dc57aeeee28447bd445df657e12354d77` is clean,upstream/live-aligned and normally published before execution. It contains GREEN56092ce unchanged plus evidence only. The benchmark and performance helper still match original535a2e5 exactly. The native guard verifies the actual dedicated target,0connections/resources and no competing owned workload immediately before execution. Matching6.19.3 candidate dependencies,Windows/Node24.14.0/PostgreSQL18.6,50users/50VUs,5000warm-up/500measured requests,original role/operation mix,pool/budgets/thresholds and the existing pass-through observer remain unchanged. No diagnostic observer,cache,extra warm-up,HTTP retry or exclusion is added. Validation-only mode is absent for the command and its prior absent setting is restored.

Exactly once from candidate server/:

```text
npm.cmd test -- tests/lab-04/performance-smoke.integration.test.ts
```

Command2026-11-03T17:52:20.963Z-17:53:17.652Z (Bangkok2026-11-04 00:52:20-00:53:17);case starts17:52:26.895Z. Exit1;1file/1case collected/executed,0passed/1failed/0skipped. Framework55.58s,reported case50.632s,monotonic body50.612s,outer command56.688s. No application execution is attributed to the later result-publication commit.

| Phase | Requests | Errors/rate | p50 /p95 ms | Elapsed s | Requests/s | Peak /time-weighted/final HTTP concurrency |
|---|---:|---:|---:|---:|---:|---|
|Warm-up|5000|0 /0%|226.245 /431.041|26.6546|187.585|50 /47.026 /0|
|Measured|500|0 /0%|203.549 /500.6755|2.4567|203.523|50 /46.059 /0|

All statuses are expected:4500HTTP200+500HTTP201 warm-up;450HTTP200+50HTTP201 measured. All5500 responses/samples remain,including every slow response. No replay,transport/semantic error or transaction failure is retained. No P2028 observed;historical unknown subtypes remain unknown. The stricter aggregate threshold is genuinely missed by0.6755ms;it is not rounded down or waived.

### Per-operation sample calculations

The table's count is measured;warm-up count is ten times that number. Every error count is0in both phases. Nearest-rank percentiles include all samples. The last column is **artifact-derived measured evaluation**,not individually executed inline assertions.

| Operation | Measured n | Warm-up p50 /p95 ms | Measured p50 /p95 ms | Warm-up/measured errors | Measured target |
|---|---:|---:|---:|---:|---|
| action.cancel | 15 | 370.014 / 467.601 | 264.477 / 328.116 | 0 / 0 | Pass |
| action.complete | 15 | 425.337 / 515.862 | 310.806 / 357.037 | 0 / 0 | Pass |
| action.create | 30 | 309.624 / 502.012 | 274.155 / 325.708 | 0 / 0 | Pass |
| action.detail | 30 | 178.499 / 266.004 | 166.116 / 199.955 | 0 / 0 | Pass |
| action.edit | 30 | 346.645 / 439.608 | 291.198 / 459.855 | 0 / 0 | Pass |
| action.history | 30 | 177.617 / 245.008 | 97.639 / 135.700 | 0 / 0 | Pass |
| action.start | 30 | 407.276 / 505.363 | 520.362 / 648.602 | 0 / 0 | Fail |
| comments.create | 20 | 243.311 / 301.378 | 347.341 / 408.395 | 0 / 0 | Pass |
| comments.list | 40 | 218.975 / 298.382 | 216.517 / 330.242 | 0 / 0 | Pass |
| requester.dashboard | 40 | 178.826 / 276.837 | 131.668 / 164.632 | 0 / 0 | Pass |
| requester.ticket.detail | 40 | 248.584 / 388.818 | 140.319 / 265.043 | 0 / 0 | Pass |
| requester.tickets.filtered-list | 20 | 227.629 / 328.525 | 228.079 / 375.539 | 0 / 0 | Pass |
| requester.tickets.list | 20 | 224.081 / 383.796 | 209.984 / 238.345 | 0 / 0 | Pass |
| staff.actions.list | 30 | 200.245 / 294.042 | 184.666 / 215.726 | 0 / 0 | Pass |
| staff.dashboard | 30 | 212.411 / 306.535 | 159.993 / 213.279 | 0 / 0 | Pass |
| staff.ticket.detail | 30 | 213.439 / 393.296 | 119.285 / 126.205 | 0 / 0 | Pass |
| staff.tickets.list | 30 | 206.578 / 307.943 | 211.182 / 237.243 | 0 / 0 | Pass |
| ticket.actions.list | 20 | 196.523 / 265.715 | 174.052 / 181.524 | 0 / 0 | Pass |

The original three targeted read p95 values change from546.596/533.311/551.129ms to164.632/238.345/213.279ms (RequesterDashboard/MyTickets/StaffDashboard). These are two specific historical executions,not a controlled causal estimate or production capacity guarantee. All17other measured operations pass their per-operation target;action.start is the sole miss at648.6022ms (p50520.3615ms). No internal cause of that write tail is established or investigated in this read-only correction batch. The writer protocol is unchanged.

### Persistence and assertion reachability

Exact expected and observed final totals remain2050Tickets,8330Actions,25320ActionHistory,3800TicketStatusHistory,1320receipts,220PublicComments,50Users/50sessions. This is330new Actions,1320real Action mutations/history/receipt operations and220comments across11cycles;zero replays. These are the benchmark's persisted totals/response-token checks,not a replacement for the comprehensive per-row business/race suites.

All inline assertions before line391 pass:guard/real login/fixture invariants,no harness/cleanup failure,cleanup flags,exact persistence,zero replays,5000/500total and100/10per-user samples,50peak concurrency,exact operation mix,zero errors in both phases. Line391 **executes and fails** aggregate measured p95<500. Line392's combined per-operation assertion is **unreached**;its false result/action.start failure is retained in the artifact and independently recalculated. `primaryFailure:null` is the pre-assertion body classification,not a passing test verdict.

[Raw5500-sample artifact](t47-performance-2026-11-04-measurement-2e8762bf.json),[independent calculations](t47-read-batched-analysis-2026-11-04.json),[offline reproducer](analyze-t47-read-batched-2026-11-04.py),[exact execution and cleanup](t47-read-batched-execution-2026-11-04.json).

```text
python artifacts/lab-04/hardening/analyze-t47-read-batched-2026-11-04.py
```

Independent Python reproduces all5500 samples,role/mix/per-user sequences,aggregate and each phase-operation p50/p95/error counts,interval-sweep peak50/final0,time-weighted concurrency,elapsed/throughput and literal persistence totals. These are offline checks,not new HTTP traffic or substitutes for the failed inline verdict. The historical analyzer/raw artifacts remain unchanged. All480pre-run tracked artifact SHA-256 values match after execution. The normal5000-request warm-up barrier is established by unchanged source/await ordering;phase-relative sample clocks do not invent a cross-phase absolute timeline.

### Independent cleanup and disposition

Artifact cleanup flags are all true;cleanupFailure null. Independent native guard/live probe2026-11-03T17:54:05.494Z finds0owned schemas,other connections,idle transactions,advisory locks,sessions and fault resources;process inventory0at17:54:06.255Z. Requests drain,Agents/listener/client close,owned schema disappears,environment/transaction spy restore. Owned recovery tooling had already been removed before measurement. Expected Prisma/pg deprecation warnings remain;no Vitest unhandled-error summary.

The supported read-path correction is correctness-verified and all three scoped read targets pass **this** measurement. **T-47 as a whole remains failed.** No additional attempt,tuning,write-protocol change or unsupported inference follows. A separate authorization would be needed to investigate the residual action.start tail from its retained samples. D-12 remains proposed;student/human peer review,retention/dependency limitations,Issue/scenario/Product DoD and deployment gates remain unchanged. The original branch/proposal and every historical failed verdict remain intact.

Final publication checks:122 local links and9 Markdown tables validate;the independent analysis reproduces exactly,all480historical artifact digests match,and every tested protected server byte remains unchanged. A further native guard probe at2026-11-03T17:57:03.865Z independently confirms0new read/benchmark Users as well as0schemas,connections,idle transactions,locks,sessions and fault resources. The original535a2e5branch and uncommitted proposal retain exact state/bytes.
