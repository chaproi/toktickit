# PATCH holder attribution — one bounded targeted run

**5November2026 Asia/Bangkok. Disposition: stop after standalone pass; original PATCH failure remains unresolved.** No full suite, other affected file, client/build/E2E or benchmark was executed in this batch. No production/configuration/concurrency/pool/budget/retry/assertion change or PR.

## Branch and preserved minimal legacy correction

Created **`feat/50-server-patch-diagnosis`** from production main040e13b while preserving pending work. Main and the other worktrees/proposal remain unchanged.

- `0138c140c76e64b721576c6629d48c3e2304bccc`: historical [legacy RED/GREEN diagnostic package](../legacy-timeout-040e13b-2026-11-05/diagnosis.md), explicitly preserving failed instrumented execution, corrected confirmation and full-run results/provenance.
- `73872c103b1730555d612d5a1ea170e6821d46de`: **minimal** legacy harness lifecycle correction only. Load the real App graph once in file setup; construct and restore a fresh guarded real client per case. All original38expect lines/test declarations and existing budgets remain. No executable phase instrumentation remains in the legacy file.

Temporary legacy instrumentation was archived before removal. The legacy4/4confirmation and full-run4/4were executed with that instrumentation; removing it is not claimed as a new exact-minimal-source runtime execution. This batch's TypeScript check includes the minimal source. These commits are historical evidence/correction preservation, not fabricated new tests-first RED or product acceptance.

## Retrospective first failed request

Read the latest full-run `patch-chain-phases-2026-11-04-239a92c6.json` without modifying it. The earliest retained failure is **`edit-19`,attempt1**. [Exact timeline/field inventory](retrospective-first-failure.json) pins the artifact hash. Times below are monotonic milliseconds relative to **that artifact's observer epoch**, not wall timestamps or the later run's epoch.

| Event | atMs / interval | What is established |
| --- | --- | --- |
| HTTP dispatch / entry |45584.899 /45721.159|Pre-transaction work begins; separate attempt0checkouts exist |
| Transaction selection |46267.116|maxWait2000 selected |
| Startup checkout |46267.263→46363.393|96.129ms checkout interval |
| Maintenance shared acquisition |46422.110→46451.084|28.974ms query interval |
| First User resource query |46469.931→46476.039|Completed6.109ms query |
| Second User resource query starts |46480.981|`q2754`,namespace1; actual key and backend not retained |
| Startup deadline recorded |48271.436|**1790.455ms** after that User query began;2004.320ms after selection |
| Physical release/destroy recorded |48274.255|Expiry resource teardown occurs before late startup Promise finishes |
| Safe transaction error |48277.492|`TransactionStartDeadlineError /P2028 /phase=transaction-start /maxWait2000`; engine subtype null |
| HTTP result / late query rejection |48300.504 /48306.672|Late User-query error does not represent successful business execution |
| Finish / drained |48308.324→48308.376|Late startup cleanup drained |
| BEGIN / business callback / COMMIT |Not reached in retained request events|No committed mutation to attribute to this request |

The User query was in flight for most of the allowance. Its elapsed interval includes any wire/server wait/runtime scheduling that was not separately measured. It is **not** assumed to be entirely lock waiting.

### Mapping sufficiency check

The old artifact has **no PID, actual resource key or blocking-holder mapping**. `resource-1` identifies a namespace, not a User ID or lock owner. Its samples contain aggregate resource-owner/waiter and pool counts only. Therefore: **“Blocking holder cannot be confirmed retrospectively”** (`ยืนยัน blocking holder ย้อนหลังไม่ได้`). Cleanup-state zeros are not used to explain any earlier wait.

## Prospective single-run instrumentation

[Plan](prospective-plan.json) was recorded before execution. Temporary wiring added one new dedicated test-only observer to the existing PATCH cohort. No shared helper or production file changed.

The observer appends a nonce/request/attempt/query-sequence **SQL comment** through the public pg query method, retaining parameters/results unchanged and adding no application request/query round trip. Named prepared queries are not altered. One serialized native catalog query samples public `pg_stat_activity`, `pg_locks` and `pg_blocking_pids`, parsing **only the tag** and returning no SQL text. It records PIDs, state/wait class, blockers and advisory scope/key/mode/granted facts. The original aggregate observer remains unchanged. Public supported interfaces only; no engine/private connection fields.

Actual bounded sampling:81samples,0sampling errors, no event/sample truncation. Tags are current/last statement IDs; an idle backend's last tag is not automatically a current holder identity. Direct granted-key matches are distinguished from queued/soft blockers. Catalog samples are not an atomic lifetime lock trace. Added comments/catalog work may perturb timing; the result is not a performance intervention or benchmark. [Helper source](helper.ts), [temporary test wiring](test-delta.patch), [instrumented test snapshot](instrumented-patch-test.ts).

## Exactly one targeted execution

From server/:

`npm.cmd test -- tests/lab-04/action-patch-projection.integration.test.ts --reporter=default --reporter=json --outputFile=<private>/patch-vitest.json`

- Execution HEAD **73872c1**, with explicitly pending temporary PATCH test instrumentation; production source remains main040e13b.
- UTC2026-11-04 execution / **5November Bangkok**. [Command timestamps](command.json) retain exact start/end; generated UTC filename dates stay unchanged.
- **Exit0;1file;1collected/executed/passed;0failed/skipped.** Vitest42.78s; outer45.094s.
- **90writes +57Requester reads =147responses, allHTTP200.** Exact history+90/receipt+90 and parent/history/identity assertions passed; all90projection checks executed; report reaches`phase=verified`.
- TypeScript passed once for this instrumentation/minimal legacy source: `npm.cmd --prefix server exec -- tsc --noEmit --project server/tsconfig.json`.
- No retry/replacement targeted run or further test command followed this pass.

[Raw redacted output](patch-raw.log), [Vitest JSON](patch-vitest.json), [durable journal](patch-journal.json), [safe counts/chains analysis](targeted-analysis.json), [full new artifact](fresh-output/patch-chain-phases-2026-11-04-8fab9c08.json).

### What the new live chains establish

The sampler retained74samples with blocking and867blocker-relation observations;826have matching granted advisory rows. These are repeated sampled observations, **not867independent incidents**.

For example, atnew-run epoch **32537.206ms**, active`edit-19` PID**45892** was blocked by active`edit-20` PID**41728**. A matching granted advisory row identifies User namespace**1**,synthetic resource key**41**,ExclusiveLock. This is a real holder chain **in this successful run**. Its sampled observation and relationship are preserved in `targeted-analysis.json` alongside other edit19chains.

There was **no failed request** in this run, so none of those chains demonstrates which holder exhausted the original request's budget or which cost was unnecessary. The older failure cannot be explained by transplanting this successful-run chain. No causal explanation such as “machine slow,” “pool size,” or “this specific User is the sole cause” is inferred.

## Cleanup and final scope

Actual dedicated-test guard/live identity passed before writes and afterward, distinct from operational; connection values withheld. No operational connection/reset. Final independent check:0other connections,idle transactions,advisory locks,new schemas/directories or owned test processes. New artifact independently reports listener closed,checked-out0,owned schema removed. Polling was drained and public-method interception restored. [Cleanup](cleanup.json).

The original PATCH test bytes were restored exactly. The temporary helper was archived here and removed from executable tests. The new generated artifact was copied privately/exported separately and removed only from its proven owned source path. Historical artifacts and the prior full-run JSON remain unchanged. [Preservation](artifact-preservation.json), [source state](post-diagnostic-source-state.json).

Only the minimal committed legacy harness correction remains as executable source difference from main. Temporary diagnostics are evidence artifacts. Branch commits preserve historical results and this standalone verification; no production correction/acceptance claim and no PR.

**Remaining uncertainty:** exact holder/critical-path cost for the historical startup deadline. A successful standalone observation cannot fill that historical gap. Per authorization, stop here rather than rerun the full suite or chase other failures. Current comprehensive verdict remains the retained2109passed/1failed result.
