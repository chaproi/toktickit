# CREATE critical path and projection correction — 2026-11-03

This is a bounded diagnosis and a narrowly justified resource correction, not a new queue/design, a capacity claim or whole-scenario acceptance. Starting local/upstream/live revision was `87a5a8bfe1ba3c50434d1f209c28e7d2f402eed4` on `feat/49-final-hardening`, with a clean index/tree. No applicable AGENTS.md was found. The existing dedicated-database guard and live identity check passed before writes; operational connection values are withheld. Historical failures, the accepted Lab-only failed-start bookkeeping-retention limitation and 15 untriaged dependency-audit findings remain unchanged.

## Prospective bounded plan and observation

Prepared diagnostic commit `28ab9841c536676a67b4b70765277c41c0392169` adds [one integration case](../../../server/tests/lab-04/create-critical-path.integration.test.ts) and [a test-only observer](../../../server/tests/lab-04/create-phase-observer.ts). It reuses the unchanged benchmark-sized diagnostic fixture: 50 real authenticated users (20 Requesters,20 Staff,10 Administrators),2,050 Tickets,8,000 Actions,24,000 Action events and3,800 Ticket events. Each virtual user performs five sequential operations:30 independent CREATEs plus220 mixed detail/Dashboard/list/comments/Action reads. Current Staff detail DTOs supply parent tokens; fresh UUIDs and eligible actor/self-assignees match the benchmark. This is one first wave, not the 5,500-request T-47 schedule or proof of its sustained behavior.

Observation is pass-through at public pg/Prisma and our exported composition boundaries. ALS identifies each request/attempt. Actual FIFO take/grant/release produces observed queue membership/active holder; public pool occupancy and database advisory ownership are sampled separately. Unique query IDs retain allowlisted model/operation/stage and monotonic start/end, never SQL/parameters/private contents. Query times include client queue/network/server/scheduling; they do not allocate server execution time. Pool/advisory samples are not atomic. The observer adds ALS,Promise-continuation and sampling overhead. Public callback-finally markers establish awaited callback draining, not arbitrary detached user tasks.

Deadline observations retain the active stage before cleanup independently of safe actual error name/code/allowlisted metadata. An engine-reported subtype is copied only if actually supplied. A composition's generic `meta.phase=transaction-start` cannot establish FIFO versus checkout/admission. Historical P2028s are not reclassified from timing.

## Attempt 01 — natural cohort, immediate verification pass

At clean prepared `28ab984`,from `server/`:

`npm.cmd test -- tests/lab-04/create-critical-path.integration.test.ts`

UTC09:52:06.958–09:52:51.292 (Bangkok16:52),exit0;1 file/1 collected/executed/passed,0 failed/skipped;42.34s framework,24.668s case,44.339s wall. [All request/attempt events and samples](create-critical-path-2026-11-03-6af1f89b.json),[independent full-request path reconstruction](create-path-full-request-analysis-2026-11-03.json) and [offline reproducer](analyze-create-path-2026-11-03.py) preserve the evidence. Every30 CREATE returned201,every220 read200. Exact persistence advanced Actions8,000→8,030,history24,000→24,030,receipts0→30;Ticket/history/comment counts remained2,050/3,800/0. Per-command scalar/identity/version/timestamp/full snapshot/receipt checks passed. There was **no expiry,P2028 or error** in this cohort;it does not reproduce/classify the benchmark's intermittent failures.

CREATE HTTP p50/p95/max558.999/610.150/651.722ms;FIFO wait410.013/507.996/508.611ms. Thirty holder intervals total661.912ms with p50/p95/max11.484/34.514/304.984ms. These are diagnostic measurements with observation overhead,not a post-correction improvement or T-47 verdict. Summed caller waits12,134.219ms overlap and must not be presented as elapsed wall time. Peak observed pool17,pool waiting149,FIFO queue29,database admission waiters0/owner1.

The actual slow-first path `u21-s4:1` is partitioned without overlap (ms):

| Consecutive boundaries | Elapsed |
|---|---:|
| HTTP start→transaction call |155.067|
| Transaction call→FIFO enqueue→grant |0.427+0.482|
| Grant→checkout start→result |0.008+46.895|
| Checkout result→advisory acquired |44.812|
| Advisory acquired→BEGIN start→result |17.817+37.323|
| BEGIN result→callback entry |0.280|
| Callback entry→exit |138.482|
| Callback exit→finish-before-cleanup (includes actual COMMIT) |6.972|
| Finish→physical release→FIFO release start |12.328+0.066|
| FIFO release→transaction result→HTTP end |0.039+0.024+4.599|

The first holder's startup,callback and cleanup all contribute;the evidence does not attribute the whole delay to FIFO or pool checkout. Its callback has14 actual driver calls:2 ordered gate calls;locked User/session/Ticket checks;receipt lookup;Action INSERT;history INSERT;parent UPDATE;Action SELECT plus3 User SELECTs for projection;receipt INSERT. The redundant projection interval union is29.597ms,not the sum of parallel User query durations. The last `u40-s4:1` waits508.611ms:29 preceding holder intervals cover507.921ms,with0.690ms outside those intervals. The slowest HTTP CREATE,u43-s4,takes651.722ms:141.154ms before the transaction call,498.409ms FIFO wait behind25 overlapping predecessors,0.059ms transaction-to-enqueue dispatch,and12.101ms from grant to HTTP completion. Its three pre-transaction AuthSession/User queries occupy27.839ms in interval union;the remaining113.314ms is not allocated by these observations (for example pool/HTTP/application scheduling is not separately proven). Across all30holders,the redundant projection union totals53.770ms of661.912ms holding time,so removal cannot explain or promise elimination of every delay. The JSON enumerates every predecessor,clipped overlap and all non-overlapping request partitions. This is a concrete holder-chain explanation,not aggregate-median arithmetic.

## Tests-first projection correction

The existing INSERT returns authoritative complete Action scalars. The same SERIALIZABLE attempt has already locked and validated actor/assignee User rows. A later `findUniqueOrThrow(actionSelect)` rereads the Action and three identity relations solely to project the CREATE response. Adding `name` to the existing locked User projection allows the unchanged safe `toActionDTO` serializer to use those current rows and INSERT scalars,with null performer. Receipt replay remains before stale/frozen/eligibility guards exactly as inherited. There is no new identity cache or client-authoritative timestamp.

[Two new real API cases](../../../server/tests/lab-04/action-create-projection.api.test.ts) first rename owned identities after login,then require exact current safe identity names,literal/full scalar DTO,history/receipt/parent persistence and unchanged prior records through the existing fixture assertions. Transparent driver observation additionally requires preserved gate/authorization/receipt reads and no post-INSERT Action/User projection SELECTs. This is resource RED,not invented failed business behavior.

- Attempt02 at prepared `28ab984` plus the new test only:exit1;1 file/2 executed,0 passed/2 failed,0 skipped;15.92s framework,17.163s wall. All exact DTO/guard/domain assertions execute before the semantic resource failure. [RED observation](create-projection-2026-11-03-ef53b4ce.json):self14,distinct15 callback calls,each with4 redundant projection reads. Tests-only RED committed separately as `14b4148f783a44b437e16ce0532bb40f61bfb897`.
- Attempt03 at RED HEAD with pending production correction:exit0;1 file/2 executed/passed,0 failed/skipped;14.39s framework,15.530s wall. [GREEN observation](create-projection-2026-11-03-aaabae48.json):self10,distinct11 calls,zero post-INSERT projection reads. Do not call this exact post-GREEN-commit execution.

The production diff is confined to `server/src/actions/action-create-service.ts`:extend the existing locked User SELECT by name and reuse its rows plus INSERT scalars in the safe projector. SERIALIZABLE/database admission/FIFO,User→Ticket order,fresh authorization/session/eligibility/token checks,replay precedence,atomic writes,receipt-last semantics,maxWait/execution budgets and maximum three positively confirmed40001 attempts are unchanged. No P2028 retry,parallelism,pool,version,index,DDL or threshold change. Query-count reduction is proven;benchmark improvement is not inferred.

## Attempt 04 — failed affected regression, preserved

The exact command/file list is retained in the command ledger. At RED HEAD with the pending correction:11 files/487 collected/executed,486 passed/1 failed,0 skipped;exit1,209.52s framework,210.477s wall,UTC10:01:08.350–10:04:38.824. All Action CREATE/patch/lifecycle,authorization,receipt recovery,concurrency,eligibility,independent-command and genuine COMMIT40001 recovery assertions pass. Both projection cases pass10/11 calls ([observation](create-projection-2026-11-03-47b48aaa.json)).

Failure:unchanged `write-admission-feasibility.integration.test.ts` case `does not inherit writer admission into an unrelated read transaction inside a callback` rejects with `TransactionStartDeadlineError` from `transaction-deadline.ts`. The nested read has explicit maxWait150ms;the case takes211ms. Runtime metadata identifying the effective budget/finer stage was not retained;150ms is the source configuration,not an observed engine subtype. It does not invoke Action CREATE. The output lacks per-stage attribution for this read's startup,so neither a FIFO subtype nor a machine-load/cold-pool explanation is established. [The resource artifact](write-admission-feasibility-2026-11-03-b64ddc46.json) retains other checks and verified cleanup;absence of the nested-read success entry is preserved. Its failing verdict cannot be replaced by a later passing run. No unchanged targeted favourable repeat,deadline increase,assertion change or speculative unrelated correction is made.

The new projection test's artifact cleanup flags are made truthful on cleanup failure (set only after successful fixture cleanup);no substantive assertion changes. Historical cleanup outcomes above were successful. Subsequent checks and the benchmark gate are recorded below when executed.

## Independent checks and comprehensive provenance

Attempt05,from `server/`:

`npm.cmd test -- tests/lab-04/ticket-workflow.api.test.ts tests/lab-03/ownership-eligibility-races.api.test.ts tests/lab-03/admin-concurrency.api.test.ts tests/lab-03/auth.api.test.ts tests/lab-03/auth-security.api.test.ts tests/lab-03/authorization.api.test.ts tests/lab-03/password-change.api.test.ts`

Exit0,7 files/272 collected/executed/passed,0 failed/skipped;88.82s framework,89.824s wall,UTC10:05:29.894–10:06:59.715. Both real cascade late-fault probes retain entries2/earlierWritesObserved true and complete rollback. Attempt06 `npm.cmd exec -- tsc --noEmit` exits0 in6.932s,UTC10:07:16.704–10:07:23.633. These commands execute at RED14b4148 plus pending production bytes (and the new-test cleanup-metadata correction),not at a future GREEN publication commit.

An independent guarded probe at10:07:23.925Z confirms zero owned disposable schemas,other connections,idle transactions,advisory locks,sessions and cascade fault functions. The owned official SeaweedFS4.51 archive is independently pinned to SHA-256 `08866a53e1bdd5378ee9880f8ee30d981d1bbb6ae22ee1897deb17ff87f8d2fb`;only the comprehensive child receives its executable path for inherited persistent-storage recovery. No shared service/settings change.

Attempt07 is one sequential comprehensive server command,explicitly excluding only the unchanged benchmark:

`npm.cmd test -- --exclude tests/lab-04/performance-smoke.integration.test.ts`

Normal discovery also executes the new diagnostic once with pending correction;this is not a standalone favourable rerun. [Raw regression-discovery cohort](create-critical-path-2026-11-03-26b3a963.json) and [independent reconstruction](create-path-regression-analysis-2026-11-03.json) retain all250 responses. Again30 CREATE201s and220 read200s,exact Action/history/receipt deltas30/30/30,zero errors/expiry/P2028,10 callback calls each andzero projection rereads. Case51.110s includes fixture/auth preparation. CREATE p50/p95/max1,266.739/1,438.822/1,458.988ms;FIFO p50/p95/max903.382/1,088.593/1,117.434ms;maximum holder863.296ms,maximum callback455.108ms. These are **not latency GREEN** or a controlled comparison:conditions/scheduling differ and no causal host-load explanation is established. Only query removal is deterministically established.

The same resource test,containing the unrelated nested read configured maxWait150ms,also fails in this comprehensive attempt. Its failed verdict is retained;no diagnostic retry or deadline adjustment occurs. T-47 is withheld while this required resource gate remains unresolved. Its latest unchanged workload and failed artifacts remain section33's historical result;there is no new T-47 measurement in this batch.

## Final results, publication and remaining blocker

Attempt07 exits1:92 files execute (91 pass/1 fail);2,083 collected/executed (2,082 pass/1 fail/0 skip),with exactly one T-47 file excluded from93 discovered files. UTC10:07:44.416–10:26:12.606;1,107.02s framework/1,108.199s wall. The sole failed case is the same nested-read startup deadline,205ms case duration. Passing application CREATE/resource/rollback/retry/authorization assertions do not replace this failed comprehensive verdict. No unhandled-error heading is reported. All previous proof/diagnostic files execute only through normal comprehensive discovery;their fresh generated artifacts are retained without replacing originals. Existing generated filenames containing2026-11-01 retain that date even though this execution is2026-11-03.

Attempt08 `npm.cmd run build` exits0,8.012s wall,UTC10:26:37.642–10:26:45.652. The [machine-readable command ledger](create-path-commands-2026-11-03.json) gives all eight timed commands/exits/durations/file lists/source provenance. Earlier preparatory noEmit validations passed;their individual durations were not retained and are not fabricated. Two offline display inspections needed explicit UTF-8/ASCII-safe output on Windows;no application/fixture outcome changed and no HTTP cohort was repeated for these display errors.

| Attempt | File/case result | Exit | Framework / wall seconds |
|---|---|---:|---:|
|01 first-wave diagnosis|1 file;1 pass/0 fail/0 skip|0|42.34 /44.339|
|02 projection RED|1 file;0 pass/2 fail/0 skip|1|15.92 /17.163|
|03 projection GREEN|1 file;2 pass/0 fail/0 skip|0|14.39 /15.530|
|04 affected API/resource|11 files;486 pass/1 fail/0 skip|1|209.52 /210.477|
|05 workflow/auth|7 files;272 pass/0 fail/0 skip|0|88.82 /89.824|
|06 TypeScript|noEmit passed|0|— /6.932|
|07 server excluding onlyT-47|92 files;2,082 pass/1 fail/0 skip|1|1,107.02 /1,108.199|
|08 server build|passed|0|— /8.012|

Prepared28ab984 and tests-only RED14b4148 remain separate history. Cleanup-observation correction `06eabeb5185009613a1e265c1887b865c1b16d46` changes only the newly authored artifact flags,no business assertions. Production projection correction `365557c5d2c001c318e79c66126f959a2430ce06` changes only `action-create-service.ts`. Full/build execution HEAD was14b4148 with those pending source bytes;independent SHA-256 equality confirms final committed production/test bytes equal the bytes recorded before attempt07. This is not exact post-commit execution or whole-regression GREEN.

Final independent guarded read-only probe10:28:07.659Z confirms zero owned schemas,other database connections,idle transactions,advisory locks,sessions,fault functions,owned relations andowned functions. Harness artifacts verify HTTP listeners closed,requests/callbacks drained,pools disconnected,observers/settings restored andowned schemas removed. No repository test/build/application/storage process remains. The resolved owned tool directory alone is removed after checking no executable uses it;private command logs remain local. Historical tracked artifacts are unchanged. No operational database/service,shared storage or unrelated process is altered.

Windows/loopback Node24.14,PostgreSQL18.6,Prisma/client/adapter6.19.3 and existing pool17/budgets are unchanged. Existing pg concurrent-query deprecation,Prisma package-configuration deprecation,create-only seed review warnings and expected sanitized controlled-fault logs remain. There is no claim of certified memory safety,production capacity,Issue acceptance or dependency-audit clearance.

**Disposition:**a concrete unnecessary CREATE cost is corrected and resource/DTO assertions pass,but performance remains unsupported. The holder chain,unallocated pre-transaction time and later slower cohort show that four projection calls were not the sole bottleneck. The next bounded action is transparent attribution of the existing150ms nested-read failure before proposing any correction or budget/design change. Preserve its two failed verdicts and use public checkout/BEGIN/callback/drain observations;do not call it load,inheritance leakage or pool exhaustion without evidence. Only after required correctness/resource gates pass may the unchanged T-47 workload execute once. No further queue,parallelism,version,retention investigation or speculative tuning is authorized by this result. T-47's historical failed verdict,Lab-only metadata-retention/dependency limitations,55 Planned scenarios,Product DoD and peer/release gates remain intact.
