# COMPLETE admission diagnosis — 2026-11-03

## Scope and prospective plan

Starting local/upstream/live revision: `7e6acaf337e782b2f45f60f41ccb601cd4adf06e`, branch `feat/49-final-hardening`. The tree/index were clean before this work. No applicable repository/ancestor AGENTS.md was found. No production correction, compatibility proof, full regression or T-47 workload was executed in this increment.

The bounded diagnostic reuses the existing `t47-diagnostic-fixtures.ts` indexed cohort: 2,050 Tickets, 8,000 Actions, 24,000 Action events and 3,800 Ticket events. It provisions 50 real identities (20 Requesters,20 Staff,10 Administrators), with real login sessions for the30 workers. These sizes are the original diagnostic fixture, not the tiny contention proof. The original T-47 workload/helper/plan and every historical sample remain unchanged.

Preparation uses real CREATE and START endpoints for30 independent targets. Each assignee differs from the completing actor; current server-returned versions/timestamps and fresh UUIDs feed COMPLETE. Planned observed traffic is4 sequential baseline reads,30 simultaneous COMPLETE commands and20 overlapping reads (five each of Staff detail,Dashboard,Ticket list andMy Actions). No response retry, forced failure, arbitrary readiness sleep, pool override or budget change is introduced. The new case has a finite120-second diagnostic budget; existing budgets/configuration are untouched.

`complete-phase-observer.ts` transparently observes public pg/adapter/client methods. It retains request/attempt labels, monotonic timings, pool total/idle/waiting counts,actual database advisory owners/waiters, callback draining and physical release. Query text is inspected only in memory for an allowlisted operation label, never retained. Error records contain only allowlisted name/code/meta.phase. Credentials,cookies,parameters,raw errors and business text are excluded. This instrumentation is not evidence until its relevant observed phase executes.

## Attempt1 — preparation failure, not bottleneck evidence

Command from server/: `npm.cmd test -- tests/lab-04/complete-contention.integration.test.ts`. It ran at the starting HEAD with the two pending new diagnostic files; there was no pending production change. Test artifact timestamps are **2026-11-03T04:16:32.566Z–04:16:51.646Z** (11:16:32.566–11:16:51.646 Bangkok). The Vitest2.1.9 results cache records **1 file,1 executed,0 passed,1 failed,0 skipped**,duration19,091.1629ms.

The PowerShell wrapper used `ErrorActionPreference=Stop`; native stderr interrupted the wrapper before its final exit/duration record and detailed failure report were retained. Thus the **command exit code is unavailable**, not asserted from the cache. The original partial log is retained locally; it contains the command/RUN header only. The [unaltered first artifact](complete-phases-2026-11-03-5383377f.json) proves the dedicated owned-schema check executed and cleanup reached zero checked-out connections. It has no `before` fixture count,observed responses,events or pool/lock samples. The specific preparation failure and last preparation operation were not retained. Do not label it an application semantic RED, a successful diagnostic, transaction expiry or pool starvation. The subsequent source adds safe preparation phase/ordinal,HTTP status/error code and allowlisted failure recording without changing business assertions.

The intended COMPLETE cohort,baseline/overlap reads,per-attempt attribution,hold-time measurements and exact mutation comparisons **remain unreached**. Existing success/rollback assertions are retained; they do not establish all-success behavior just because the diagnostic itself might later finish.

## Commands and bounded follow-up

| Action | Actual result |
| --- | --- |
| Server `npm.cmd exec -- tsc --noEmit`, before attempt1 | Exit0; no test execution |
| Diagnostic attempt1 | Vitest cache failed1/1,19.091s; wrapper exit unavailable; preparation cause unknown |
| Proposed corrected-logging confirmation | Rejected by automatic approval review; **not executed** |
| First read-only live-activity probe | Exit1,PowerShell/native argument quoting failed before connection |
| Corrected stdin-based read-only probe | Exit0; guarded database identity matched; no other database activity |
| Server `npm.cmd exec -- tsc --noEmit`, after safe preparation logging | Exit0; no test execution |
| Independent final isolation/resource probe | Exit0; dedicated identity matched and differed from operational; zero disposable schemas,other connections,idle transactions and database advisory locks |

Automatic approval review rejected the confirmation as a second database diagnostic beyond its reading of the bounded-execution authorization. No alternate invocation bypassed that rejection. A concise authorization question for **one** corrected-logging confirmation remains pending. The evidence shows that no observed COMPLETE/read cohort executed, but this does not establish why preparation failed.

## Disposition and next action

**Incomplete diagnosis.** Do not add a front queue based on this attempt. Whether pool-slot starvation delays reads/startup,how long admission is held,and the historical P2028 subtype all remain unknown. The two historical benchmark failures must not be retrospectively classified from their durations.

The next action is one explicitly authorized confirmation with complete safe preparation/failure logging. Inspect its measured result before selecting any correction. If it demonstrates pool-slot starvation,a per-pool local front queue may be evaluated while retaining the same-connection PostgreSQL advisory authority and the single existing maxWait deadline; no queue has been implemented here. Required semantic RED,resource/auth/receipt/workflow regressions,comprehensive server excluding T-47,build and any subsequent once-only benchmark remain contingent on a justified production correction.

The passing candidate correctness evidence is carried at its original provenance. T-47 remains **failed**. The Lab-only failed-start bookkeeping-retention limitation and15 untriaged dependency-audit findings are unchanged. No release,peer acceptance,scenario/Product DoD or Issue status is promoted.

## Authorized confirmation - 2026-11-03

The student explicitly authorized **one** corrected-logging diagnostic confirmation after the preceding publication. The pending-authorization statements above describe that earlier state; the rejection was not bypassed. Preflight verified clean local/upstream/live `04f137365603e21ecc83a957971d2f2a978dcbcf` and no competing repository test process. No application bytes, pool settings, transaction budgets or assertions changed before this run.

Command from server/: `npm.cmd test -- tests/lab-04/complete-contention.integration.test.ts`, exactly once. **Exit1;1 file;1 collected/executed;0 passed,1 failed,0 skipped.** Wrapper timing is2026-11-03T04:22:37.4481652Z to04:23:07.4203007Z (11:22:37.448–11:23:07.420 Bangkok),29.9761571s wall. Framework28.52s;case22.333s. Test artifact timestamps are04:22:44.945Z–04:23:07.248Z. PowerShell now continues past native stderr and retains the exit/verdict. Existing create-only seed review warnings remain; no unexpected application error log was suppressed. The [unaltered confirmation artifact](complete-phases-2026-11-03-b828fe4f.json) and [redacted command/probe summary](complete-confirmation-2026-11-03.json) preserve the result.

The failure is now precisely observed at `real-CREATE-START-preparation`,ordinal0: the first CREATE returns **409 STALE_WRITE**, where valid preparation requires201. No START,COMPLETE,baseline/overlap read,phase sampling or final mutation comparison executes. This is a **new diagnostic fixture defect**, not semantic application RED or an admission failure. The first attempt's detailed cause was not retained; this confirmation does not retroactively prove that attempt's cause or classify the historical benchmark P2028s.

A separate bounded **read-only** constant-timestamp probe used the guarded dedicated target and both native pg and the application adapter. `Ticket.updatedAt` is `timestamp without time zone`. For the same literal UTC millisecond value,native pg on this Bangkok host produced a Date7hours earlier (`nativeMinusAppMilliseconds=-25200000`); the application adapter preserved the expected UTC instant. The new diagnostic reused `seedBusinessRows`'s native `RETURNING updatedAt` Date directly as its first optimistic token. That explains the captured stale rejection. Session `SET TIME ZONE` does not change native pg's host-local JavaScript decoding of this type.

The smallest **test-only** correction is [5ae96eb0d675e30babb6e3a5de8ef263be092b5e](https://github.com/chaproi/toktickit/commit/5ae96eb0d675e30babb6e3a5de8ef263be092b5e): before each preparatory CREATE,read the real authorized Staff Ticket detail DTO,verify its exact Ticket ID/canonical timestamp,and use that authoritative token. Subsequent START/COMPLETE tokens still come exclusively from successful mutation responses. No expected status or business assertion is relaxed. The unchanged benchmark already starts each worker chain with that real detail read,so this diagnostic defect does **not** invalidate or explain away its historical failed measurements.

After this correction,server `npm.cmd exec -- tsc --noEmit` passes,exit0. **The corrected diagnostic has not executed.** The single authorized confirmation is exhausted; no second invocation,production change,semantic RED,comprehensive regression,build or T-47 run follows. Read-only probes pass,exit0. The independent final probe confirms dedicated identity distinct from operational and zero disposable schemas,other connections,idle transactions and advisory locks. The owned listener closed and checked-out count is0 in the confirmation artifact; the disposable-schema helper separately reports removal/remaining0. Process settings are scoped/restored and both probe clients disconnect.

**Current next action:** execute the corrected bounded diagnostic with explicit confirmation authorization. Obtain actual checkout/admission/start/callback/drain/release measurements before selecting a front queue or any other production correction. Pool-slot starvation,admission hold-time contribution and P2028 attribution remain unestablished. T-47 remains failed; all accepted limitations,historical evidence and release/review gates remain intact.
