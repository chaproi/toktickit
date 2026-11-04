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

## One unchanged post-correction T-47 - failed latency target

Clean source/evidence HEAD `84ef0ad91502a0c660998ddc13d0c7a163f1a169` is committed, pushed and verified equal to live origin before execution. It contains production0abd40d and no additional source changes. Benchmark/helper remain byte-identical to535a2e5. From candidate server/, exactly once:

```text
npm.cmd test -- tests/lab-04/performance-smoke.integration.test.ts
```

Command2026-11-03T20:31:13.378Z-20:32:30.812Z (Bangkok4November03:31:13-03:32:30); case starts20:31:21.085Z. Exit1;1file/1case collected/executed,0passed/1failed/0skipped. Framework75.88s,reported case69.563s,monotonic body69.540s,outer77.385s. There is no repeat. The later evidence commit is not an application execution revision.

| Phase | Samples | Errors | p50 /p95 ms | Elapsed seconds | Throughput requests/s | Peak /weighted/final concurrency |
|---|---:|---:|---|---:|---:|---|
|Warm-up|5000|0 (0%)|317.555 /648.369|37.6639|132.753|50 /47.160 /0|
|Measured|500|0 (0%)|339.695 /653.955|3.8996|128.218|50 /46.103 /0|

Status counts4500HTTP200+500HTTP201 during warm-up;450HTTP200+50HTTP201 measured. No sample is excluded or retried; normal5000-request warm-up completes before measurement. Actual role mix20Requester/20Staff/10Administrator,50sequential-within-VU concurrent users, indexed fixture and expected endpoint mix remain unchanged. No extra observer, pool override or competing repository workload runs alongside the benchmark; validation-only mode is unset for this invocation and restored afterward.

### Per-operation artifact calculations

All error counts are0in both phases. Warm-up sample count is10times measured n. Strict<500ms target evaluation below is **independently artifact-derived**, not an executed per-operation assertion after aggregate failure. Warm-up latency is reported without inventing another acceptance threshold.

| Operation | Measured n | Warm-up p50 /p95 ms | Measured p50 /p95 ms | Measured p95 target |
|---|---:|---|---|---|
|action.cancel|15|520.262 /773.149|531.377 /604.799|Fail|
|action.complete|15|561.625 /745.026|579.180 /736.972|Fail|
|action.create|30|462.890 /644.973|461.020 /656.850|Fail|
|action.detail|30|265.016 /433.848|287.009 /373.012|Pass|
|action.edit|30|493.576 /802.034|481.139 /650.711|Fail|
|action.history|30|245.790 /340.264|143.385 /270.077|Pass|
|action.start|30|590.037 /875.004|718.777 /781.963|Fail|
|comments.create|20|368.584 /539.064|446.555 /502.969|Fail|
|comments.list|40|314.581 /486.539|325.428 /411.532|Pass|
|requester.dashboard|40|253.018 /379.844|224.993 /347.746|Pass|
|requester.ticket.detail|40|335.758 /558.759|238.491 /456.853|Pass|
|requester.tickets.filtered-list|20|319.535 /420.003|382.634 /449.076|Pass|
|requester.tickets.list|20|330.870 /496.291|352.669 /465.164|Pass|
|staff.actions.list|30|275.544 /411.284|338.718 /418.067|Pass|
|staff.dashboard|30|286.876 /447.702|267.677 /366.815|Pass|
|staff.ticket.detail|30|309.607 /481.045|189.078 /200.291|Pass|
|staff.tickets.list|30|285.149 /417.341|310.436 /414.574|Pass|
|ticket.actions.list|20|284.866 /394.738|281.940 /398.470|Pass|

All exact persistence assertions pass:2050Tickets,8330Actions,25320ActionHistory,3800TicketStatusHistory,1320receipts,220comments,50Users/50sessions. This represents330newActions,1320real Action mutations/history/receipts and220comments across warm-up/measured cycles;zero replay. This does not replace per-row correctness/race evidence. Cleanup flags alltrue,cleanupFailure null. `primaryFailure:null` means the pre-assertion workload body completed, not that the test passed. `transactionFailures:[]` retains no P2028; historical unknown subtypes remain unknown.

All inline assertions before line391 execute and pass: guard/authentication/setup,cleanup,exact persistence,5000/500and100/10per-user counts,role/operation mix,peak50,zero errors and zero replays. Line391 aggregate p95<500 executes/fails at653.9553ms. Line392 combined per-operation target is **unreached**. Independent calculations show12/18operations pass;comments.create plus all five Action writes fail. All three previously corrected read operations remain below500ms (RequesterDashboard347.746,MyTickets465.164,StaffDashboard366.815). START781.963ms is worse numerically than the retained prior648.602ms; no benefit is manufactured from fewer queries or the diagnostic confirmation.

[Raw5500samples](t47-performance-2026-11-04-measurement-b4c6eade.json), [independent calculations](t47-patch-analysis-2026-11-04.json), [offline reproducer](analyze-t47-patch-2026-11-04.py), [exact execution/source/cleanup manifest](t47-patch-execution-2026-11-04.json).

```text
python artifacts/lab-04/hardening/analyze-t47-patch-2026-11-04.py
```

Offline checks independently reproduce all5500samples, each user's exact sequence/role/count, expected operation/status mix, nearest-rank percentiles, interval-sweep concurrency and throughput and literal persistence totals. They introduce no new requests and do not replace failed inline evidence. The original raw sample/analyzer/evidence remain unchanged. All215tracked server files retain their premeasurement saved bytes;all486saved historical artifacts and21new premeasurement JSON artifacts match saved SHA-256 values. Original worktree/proposal remain unchanged.

Runtime remains local Windows10.0.26200 x64, Intel i5-13420H/12logical CPUs,34.049GB totalRAM,Node24.14,PostgreSQL18.6,Prisma6.19.3 client engine,Vitest-transformed TypeScript Express under NODE_ENV=test,loopbackHTTP withoutTLS. AvailableRAM before this run10.613GB versus14.448GB in the prior retained run is an observation, not an explanation of latency. PostgreSQL settings remain max_connections100/shared_buffers128MB/work_mem4MB/effective_cache_size4GB/JITon/track_io_timingoff. The unchanged benchmark's textual pool metadata still says inherited engine default; actual candidate mapping remains17pool connections,connect5s,pool10s and separate effective maxWait2s/execution5s. No setting is silently replaced by that historical metadata string.

The bounded traces establish redundant shared PATCH projection round trips and significant pretransaction/checkout/User-resource waiting; they do not attribute the warmed benchmark's new broad write tail. Query reduction is verified, but **T-47 remains failed**. No CPU-pressure, missing-index, pool-exhaustion or SQL-only causal claim follows. The next action is a bounded review of the retained pretransaction/checkout/resource critical path and auth/discovery round trips under representative warmed mixed traffic before proposing any further correction; not another unchanged benchmark or speculative tuning.

Independent native guard/live probe2026-11-03T20:33:00.408Z reports0owned schemas,other connections,idle transactions,advisory locks,sessions,fixture identities and fault objects. Process inventory0owned node/weed workloads;validation/recovery settings restored. Requests,Agents,listeners,clients and coordination resources are drained;owned recovery tooling was marker/path-verified and removed before measurement. Expected seed-preservation and Prisma/pg warnings remain, no unhandled-error summary. Only evidence publication follows. D-12 is still proposed;student/peer review,retention/dependency risks,deployment and Issue/scenario/Product DoD gates remain separate and unchanged.

Final publication validation:132local links and9Markdown tables pass;UTF-8/JSON/whitespace and complete staged scope pass. A final independent probe20:34:41.682Z again finds0owned database resources;the original535a2e5branch retains only its original uncommitted proposal with the saved digest. Read-only inspection under the sandbox initially hit Git ownership protection;the same check under the authorized host identity succeeded without changing Git configuration. No further application execution follows measurement.
