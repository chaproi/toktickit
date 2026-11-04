# Per-pool admission front queue candidate - 2026-11-03

## Decision, starting source and unchanged boundaries

The student authorizes the evidence-supported local front queue on `feat/49-final-hardening`,starting clean local/upstream/live **92256c1a2fb83705527a249a588de13856638e37**. That earlier [COMPLETE evidence](complete-admission-diagnosis-2026-11-03.md#corrected-cohort-explicitly-authorized-once---2026-11-03) already demonstrates16 waiting writers plus1 owner occupying17 pool slots and delaying a real read. No unchanged starvation baseline,adapter-version or retention investigation is repeated. No applicable AGENTS.md is found. Guard/live probes verify the dedicated database differs from operational and starts without owned schemas,other connections or idle transactions.

The candidate adds one deadline-bounded FIFO competitor per actual lazy adapter pool,**before checkout**. Waiting uses the same existing public startup timer and effective constructor/per-call maxWait. Promotion and the pre-checkout continuation check that same monotonic deadline. Expiry removes the queued entry and its abort listener;it cannot later acquire or execute. The permit lasts through the existing awaited callback/transaction cleanup and physical release,including execution-timeout draining and primary-error handling. Reads and unselected calls bypass it. The same-connection PostgreSQL advisory lock remains authoritative across pools/processes;the local FIFO is not a replacement lock or global in-process business mutex.

Only `server/src/database/write-admission.ts` changes production. SERIALIZABLE isolation,User/Ticket/Action order,fresh authorization/eligibility/token checks,replay-before-stale/frozen,defensive receipt recovery and maximum3 positively confirmed40001 attempts are unchanged. No generic P2034 retry,added HTTP retry,DDL,index,package,pool configuration,execution/startup budget,timeout,seed or business-rule change. Queue waiting is deadline-bounded,not a new fixed-capacity/memory guarantee. The Lab-only failed-start metadata-retention decision and15 untriaged dependency findings remain;no private cleanup/client rotation is introduced.

## Tests-first RED and correction

RED commit **9f8523e97072ae827e0cbf55d95bedae7ee7e3b1** adds only `server/tests/lab-04/write-admission-front-queue.integration.test.ts`,executed first against unchanged production. It uses a deliberately two-connection test pool,an owned disposable empty schema,real PostgreSQL admission holder and public pool acquire/release counters. That fixture sizing is not a production setting.

Attempt01 exits1: **5 executed,1 passed,4 failed**,9.90s framework/11.1476976s wall. The real read takes2082.625ms and runs only after all3 selected commands settle from startup expiry. Queued deadline,undrained-callback and shutdown tests each observe an unwanted extra checkout. FIFO survivor order already passes;it is verification,not invented RED. The [RED artifact](front-queue-resource-2026-11-03-1116b91c.json) retains actual outcomes and owned cleanup. Collection,authentication or malformed-response errors do not account for these four failures.

Initial focused GREEN attempt02 passes5/5,exit0,6.56s framework/7.8255803s wall. The read runs while all writers remain blocked;exactly one checkout/advisory competitor exists. Queue expiry causes zero extra checkouts and no later callbacks. An additional sixth case subsequently verifies queue time plus later database admission share a single400ms allowance;the first case also explicitly verifies all survivors succeed after release. These are post-RED verification/strengthening additions,not retroactively claimed RED coverage.

Inherited coordination corrections are necessary because local queued callers intentionally lack database backends. Public `$transaction` observation now proves overlapping HTTP calls have reached the pre-callback boundary;first-writer real row/gate blockers remain. All domain/status/receipt/history/rollback assertions are retained. Final gate cleanup queries cover the relevant User/Ticket/Action resources directly rather than assuming every caller has a separate simultaneous PID. Genuine COMMIT40001 still uses a separate native noncooperating participant;both application attempts must differ from that participant,while the pool may safely reuse an application connection after release. No error is fabricated to establish genuine COMMIT coverage.

The adjusted test/helper paths are `issue33-test-helpers.ts`, `actions-concurrency-test-helpers.ts`, `workflow-race-test-helpers.ts`, `write-admission-test-helpers.ts`, `independent-action-create.api.test.ts`, `action-commit-recovery.api.test.ts`, `action-create-contention.integration.test.ts` and `t47-diagnosis.integration.test.ts`. The original corrected COMPLETE test and instrumentation remain byte-for-byte unchanged.

## Recorded intermediate attempts

All commands are sequential from server/,with complete native logs retained privately and redacted artifacts published. Exact command arguments/timestamps are retained in the machine-readable command ledger. No isolated pass replaces a failed whole-command verdict.

| Attempt | Command scope | Exit; actual file/case outcome | Framework /wall |
| --- | --- | --- | --- |
| 01 | new front-queue RED | 1;1 file;5 executed,1 passed,4 failed,0 skipped | 9.90s /11.148s |
| 02 | focused candidate GREEN | 0;1 file;5/5 passed | 6.56s /7.826s |
| 03 | resource/cross-process/deadline/lifecycle,genuine COMMIT CREATE/EDIT,receipt/retry | 0;8 files;81/81 passed | 83.47s /84.644s |
| 04 | Action/Ticket workflow,eligibility/authorization,ownership/Admin/requester races | 0;9 files;465/465 passed | 358.25s /359.527s |
| 05 | auth/security/password/admin,Attachments/Notes,persistent recovery,snapshots | 0;10 files;49/49 passed | 111.50s /112.819s |
| 06 | new cumulative resource case plus three bounded diagnostics | 1;4 files;9 executed,4 passed,5 failed;2 unhandled errors | 124.62s /125.941s |
| 07 | corrected resource fixture confirmation | 0;1 file;6/6 passed | 6.65s /7.929s |

TypeScript initially passes for the five-case RED and first production queue. The new public coordination observer then has one compile failure (`work` inferred unknown);a Promise type annotation fixes only that type. Subsequent checks,including the final fixture correction,pass. No runtime assertion or accepted outcome changes to satisfy the compiler.

**Attempt06 is preserved as failed.** The added cumulative-budget fixture requests a blocking advisory lock and observes it on the same native client. Its observation queues behind its own lock request;the real head callback cannot drain until the fixture releases it. The case hits its unchanged10s budget;subsequent cases sharing that blocked client cascade into4 more timeouts,with2 unhandled startup-rejection observations and a teardown failure. This is a demonstrated new-fixture coordination defect,not a candidate business/queue failure. The three separate diagnostic files pass within this failed command,including the COMPLETE cohort;that does not turn the command GREEN.

One guarded cancellation probe refuses to act because its expected single owned waiter is no longer present;it cancels no backend. The run subsequently drains/exits. The exact leftover `issue49_front_710b3ae403724c428d4df66ea057fe36` schema is independently proven empty with no matching admission locks before a non-CASCADE DROP of only that schema. A read-only post-cleanup probe confirms zero owned schemas,other connections and idle transactions. This cleanup is not a production remedy.

The minimal test correction gives the external holder its own native connection,leaving the observer free,and ensures all owned promises/clients drain. Attempt07 is one justified confirmation,not an unchanged favourable repeat. It preserves the400ms target and all zero-checkout/no-late-callback/FIFO/shutdown assertions. Observed cumulative startup expiry is410.624ms including diagnostic overhead,with no fresh database-wait allowance. No production timeout changes.

## COMPLETE cohort comparison and limits

Attempt06's unchanged-instrumentation COMPLETE case passes at RED HEAD9f8523e with pending candidate bytes. [Candidate raw cohort](complete-phases-2026-11-03-7dd92bd7.json),[offline comparison](front-queue-cohort-analysis-2026-11-03.json) and [reproducer](analyze-front-queue-2026-11-03.py) preserve every response and monotonic phase observation. The comparison is local diagnostic evidence,not a controlled capacity A/B. Sixty post-response validation reads use the same pool in each cohort and differ from the unchanged T-47 workload. Raw client-frame fallback labels after physical release are excluded only from phase pairing;raw events remain intact. Pool/lock samples are non-atomic. Pre-checkout time includes queue plus other startup overhead,not a separately measured pure queue timer.

| Metric | Before candidate | Front-queue cohort |
| --- | --- | --- |
| COMPLETE /baseline /overlap HTTP success | 30 /4 /20 | 30 /4 /20 |
| COMPLETE attempts | 30 first attempts | 30 first attempts |
| Maximum actual admission waiters /owners | 16 /1 | 0 /1 |
| Maximum pool total /waiting | 17 /51 | 17 /50 |
| COMPLETE checkout p50 /p95 ms | 128.908 /406.087 | 0.286 /0.966 |
| COMPLETE database admission p50 /p95 ms | 441.068 /630.363 | 0.373 /0.895 |
| COMPLETE callback p50 /p95 ms | 19.201 /49.140 | 18.338 /35.325 |
| Admission hold p50 /p95 ms | 25.337 /62.119 | 20.622 /37.962 |
| Summed client-observed admission hold ms | 1019.195 | 737.875 |
| COMPLETE HTTP p50 /p95 ms | 1136.368 /1418.911 | 902.692 /1216.245 |
| Overlap read HTTP p50 /p95 ms | 468.364 /555.545 | 436.269 /486.308 |

Candidate public-start/pre-checkout p50/p95 is543.866/753.358ms:waiting has moved outside the physical pool,not disappeared. Ordinary simultaneous authentication/reads still fill the pool. Both cohorts retain exact counts2050 Tickets,8030 Actions,3800 Ticket status events,0 Comments,50 Users/30 sessions;Action history24060→24090 andreceipts60→90. Persisted state/version/actual performer/authoritative strictly advanced parent checks pass for each COMPLETE. No natural-cohort P2028 is observed;historical benchmark P2028s remain unclassified. New resource deadline tests deliberately produce phase-attributed startup P2028,which must not retroactively classify historical errors.

The serialized-write tradeoff remains:serial business work andguard/receipt/cleanup time still impose a hold-time floor. Reduced pool occupation does not establish p95<500ms,production capacity,peer acceptance or memory safety. Further checks and the one unchanged T-47 result are recorded below when actually executed.

## Comprehensive candidate verification and pre-measurement publication

Attempt08: `npm.cmd test -- --exclude tests/lab-04/performance-smoke.integration.test.ts`,once,exit0,**90 files/2080 collected/executed/passed,0 failed/skipped**,842.81s framework/843.9248907s wall. Actual command2026-11-03T05:09:28.4744242Z–05:23:32.3973178Z (12:09:28.474–12:23:32.397 Bangkok). Static discovery has91 files;only the one unchanged benchmark is excluded. This is **not an unfiltered full-suite pass**. It includes six front-queue resource cases and normally discovered bounded diagnostics,whose additional raw artifacts remain retained;the selected before/after comparison does not discard these runs. Attempt09: `npm.cmd run build`,exit0,10.0184785s wall,05:23:43.9577956Z–05:23:53.9727674Z. No repeated comprehensive command or hidden test exclusion.

The final pending source/coordination bytes execute at RED HEAD9f8523e and are then committed unchanged as candidate GREEN **9534b86826dc3c959b989d27f91439f49338eda9**. [Command/source ledger](front-queue-commands-2026-11-03.json) retains exact arguments,case counts,all attempts and source SHA-256 values. This is not claimed as post-GREEN-commit execution or hosted CI. Only the existing admission module changes production;the ten-file correction commit also contains authorized coordination/fixture corrections. RED history is neither amended nor squashed.

After regression/build,an independent guarded probe confirms zero owned disposable schemas,other connections,idle transactions,advisory locks,sessions and cascade fault functions. All prior artifacts and benchmark/helper bytes are preserved. The benchmark and workload helper equal original8053570,including SHA-256 `c9165e7e181562c5380f8d877d2bada26b82807bd99e860a2d567bffe3df77c4` and `ff2f4fdf3c9a0cd7f28a8fe77338b88155ebe39927fbf889cf77cb7c738d35f0` respectively. The existing persistent-recovery prerequisite uses only an owned official SeaweedFS4.51 executable with pinned archive SHA-256 `08866a53e1bdd5378ee9880f8ee30d981d1bbb6ae22ee1897deb17ff87f8d2fb`;its environment setting is child-scoped. No shared service changes.

Existing create-only seed review warnings,pg concurrent-client-query deprecation,Prisma configuration deprecation and sanitized deliberate-fault logs remain. Attempt06 also retains its explicit fixture timeouts/unhandled errors and failed teardown,followed by ownership-proven cleanup and the justified fixture correction. Passing later checks do not erase any failed verdict.

**At this pre-measurement publication,T-47 has not rerun.** The next authorized action is one unchanged workload,alone,at the clean evidence-publication revision,with validation-only mode unset/restored and no competing repository processes. Its50 users/5000 warm-up/500 measured requests,original concurrency/operations/fixtures,all samples and strict thresholds remain. The candidate correctness result does not waive the failed performance gate,accepted metadata limitation,untriaged dependency findings or implementation peer review.

## One unchanged T-47 confirmation - FAILED

The preceding paragraph describes the pre-measurement state and is preserved. The single authorized measurement subsequently executes at **clean published3683daa5d28587e1d205246571619f8817288030**. Local/upstream/live alignment and guarded database identity are verified;no competing repository/test/build/seed/storage process exists. Installed Prisma CLI/client/adapter and generated client are all6.19.3;actual mapped pool size remains17. The first read-only version probe uses an unexported package.json subpath and fails before workload execution;reading the installed metadata file directly corrects that probe without changing any package. Validation-only is initially absent,explicitly unset for the command and restored afterward. No other pool,budget,retry or workload setting changes.

Attempt10,from server/: `npm.cmd test -- tests/lab-04/performance-smoke.integration.test.ts`,**exactly once,alone**. **Exit1;1 file/1 collected/executed,0 passed,1 failed,0 skipped**. Actual command2026-11-03T05:25:59.8429526Z–05:27:16.3828984Z (12:25:59.843–12:27:16.383 Bangkok),76.5429459s wall;75.47s framework;70.41s reported tests,artifact case counter70,392.717ms. The artifact starts05:26:05.818Z. The filename date is the unchanged harness's2026-11-03 label;actual execution timestamps are retained independently. No result is attributed to later evidence publication or hosted CI.

[All5500 raw samples and plans](t47-performance-2026-11-03-measurement-e9510798.json),[independent validation](front-queue-t47-analysis-2026-11-03.json) and [offline reproducer](analyze-front-queue-t47-2026-11-03.py) retain the failure without filtering slow/error responses or retrying HTTP calls. Offline validation independently confirms50 users with sequences0–99 warm-up and0–9 measured,sequential within each user,exact18-operation measured mix,all aggregate/operation nearest-rank percentiles,throughput and peak/final concurrency50/0. The source's awaited warm-up barrier is unchanged. These artifact-derived checks are not the later inline assertions that remained unreached.

| Phase | Requests | Errors | Error rate | p50 ms | p95 ms | Elapsed s | Throughput req/s | Peak HTTP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Warm-up | 5000 | 632 | 12.64% | 208.384 | 1141.887 | 42.230 | 118.399 | 50 |
| Measured | 500 | 0 | 0% | 305.555 | 1089.992 | 4.444 | 112.508 | 50 |

| Measured operation | Count | Errors | p50 ms | p95 ms | Strict p95 <500ms |
| --- | --- | --- | --- | --- | --- |
| action.cancel | 15 | 0 | 485.056 | 518.964 | Fail |
| action.complete | 15 | 0 | 488.759 | 529.419 | Fail |
| action.create | 30 | 0 | 1112.341 | 1160.460 | Fail |
| action.detail | 30 | 0 | 5.906 | 123.917 | Pass |
| action.edit | 30 | 0 | 441.959 | 632.647 | Fail |
| action.history | 30 | 0 | 6.788 | 12.446 | Pass |
| action.start | 30 | 0 | 516.352 | 543.361 | Fail |
| comments.create | 20 | 0 | 132.050 | 150.368 | Pass |
| comments.list | 40 | 0 | 88.470 | 342.199 | Pass |
| requester.dashboard | 40 | 0 | 261.186 | 840.679 | Fail |
| requester.ticket.detail | 40 | 0 | 135.327 | 244.091 | Pass |
| requester.tickets.filtered-list | 20 | 0 | 165.906 | 186.374 | Pass |
| requester.tickets.list | 20 | 0 | 561.177 | 742.395 | Fail |
| staff.actions.list | 30 | 0 | 334.207 | 366.974 | Pass |
| staff.dashboard | 30 | 0 | 677.104 | 919.311 | Fail |
| staff.ticket.detail | 30 | 0 | 164.659 | 260.428 | Pass |
| staff.tickets.list | 30 | 0 | 471.523 | 602.273 | Fail |
| ticket.actions.list | 20 | 0 | 156.741 | 218.786 | Pass |

All unexpected responses occur in warm-up:138 HTTP500 INTERNAL_ERROR,480 HTTP400 INVALID_ACTION_ID,11 ACTION_TERMINAL,2 INVALID_ACTION_TRANSITION and1 ACTION_STATUS_UNCHANGED409. No transport/semantic/replay error is recorded. All30 worker chains first encounter an HTTP500 (25 CREATE,2 EDIT,3 START). The earliest unexpected sample is user44,sequence4,CREATE,2245.666ms. Across all warm-up500s,the operation counts areCREATE108,EDIT10,START12,COMPLETE2,CANCEL6. Later invalid-ID and terminal/status symptoms follow failed chains under the unchanged acknowledged-token/Action-ID policy;do not describe all632 as independent primary faults or excuse failed writes.

The unchanged observer retains138 SERIALIZABLE **P2028** failures with no confirmed SQLSTATE/model. It records workload phase `warmup`,**not transaction subtype or meta.phase**. Therefore these new failures remain unclassified as startup/local-queue/database admission/execution expiry. Their durations are not a positive classification;historical P2028s also remain unclassified. No generic retry,larger budget or retrospective relabelling follows.

| Persisted count | Expected | Observed |
| --- | --- | --- |
| Tickets | 2050 | 2050 |
| Actions | 8330 | 8222 |
| Action history | 25320 | 24880 |
| Mutation receipts | 1320 | 880 |
| Ticket status history | 3800 | 3800 |
| Comments | 220 | 220 |
| Users /sessions | 50 /50 | 50 /50 |

Observed Actions are short108,matching failed CREATE sample count;history/receipts are short440. Independent analysis finds880 successful mutation samples,agreeing with880 new history/receipt rows. This aggregate reconciliation is not proof of each command's atomic rollback. Inline primary/cleanup checks execute and pass;the first unsupported invariant is the expected persisted-count assertion atline376. Receipt replay,phase/user counts,concurrency/mix,zero-error and p95 inline assertions remain **unreached**. Their artifact-derived values are explicit:receiptReplays0,zero measured errors true,zero warm-up errors false,aggregate p95 false,and9/18 measured operation p95 targets fail. T-47 is **FAILED**,despite candidate correctness checks and the small COMPLETE cohort passing.

Compared descriptively with the previous admitted candidate measurement7bc549d5:that run has2 warm-up errors,0 measured errors,p95973.907ms and89.032 measured req/s;this front-queue run has632 warm-up errors,0 measured errors,p951089.992ms and112.508req/s. This is not a controlled causal A/B or a claim of target improvement. The small COMPLETE cohort shows improved pool occupation,but cannot establish the mixed-workload queue/hold-time behaviour. Both failures and original samples remain unchanged.

Host:Windows10.0.26200/x64,Node24.14.0,PostgreSQL18.6,Intel i5-13420H/12 logical CPUs,34,049,220,608 RAM bytes,16,789,008,384 available before the run. Runtime is Vitest-transformed TypeScript Express,NODE_ENV=test,loopback HTTP without TLS,not a production build. The unchanged raw pool-label text says inherited defaults;the separate actual configuration probe confirms the candidate maps17 connections. No new representative-plan traffic is run;the workload's existing out-of-measurement plans are retained as originally implemented. No CPU,pool-exhaustion,index or long-term capacity claim is inferred from this measurement.

Final cleanup/guard probes confirm zero disposable schemas,other connections,idle transactions,advisory locks,sessions and fault functions. Harness flags show listener closed,Prisma disconnected,schema removed,transaction observer restored and environment restored. No test/application/storage process remains. Only the resolved owned tools directory (pinned executable/archive) is removed;private failed/successful command logs are retained. No broad reset/clean,operational database change or shared service teardown.

**Next bounded gate:**attribute a small valid independent CREATE wave,with representative mixed reads and the same pool/budgets,to local FIFO wait,checkout,database admission,callback,COMMIT and drain/release. Retain trusted safe P2028 phase/subtype per attempt before proposing any remedy. The first unsupported operation is CREATE;the shared serial hold-time floor and possible load/queue interaction need measurement,not assumptions. This batch stops after publishing the actual failure:there is **no second benchmark,speculative tuning or additional production edit**. Accepted metadata retention,15 untriaged dependency findings,peer review and remaining #49/#50 obligations are not waived;no Issue/scenario/Product DoD status is promoted.
