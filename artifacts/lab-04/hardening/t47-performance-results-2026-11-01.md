# T-47 specified performance workload - 2026-11-01

**FAILED.** One complete execution of the reviewed workload retained all 5,000 warm-up and 500 measured requests. Measured p50 **224.886 ms**, p95 **749.008 ms**, unexpected errors **112/500 (22.4%)**. Aggregate p95 <500 ms, four successful-read operation p95s and the zero-error expectation were not met. No favourable rerun, tuning, production correction, workload reduction, retry/budget change or index change followed. This is measured failing evidence, not manufactured feature RED/GREEN or Issue acceptance.

## Revision, plan and environment

Repository/branch preflight verified chaproi/toktickit, clean feat/49-final-hardening, local/upstream/live remote f3adb963a2e4ab3122d70c9bb68583e12db43b53, ahead/behind 0/0. No applicable AGENTS.md was found. The actual guard/live identity probe confirmed the dedicated test database/schema, distinct from operational. Owned schemas were created only after that check, and the real application client independently verified its exact fresh target. No competing repository test/build/seed process was found; unrelated tool runtimes were not terminated.

The [prospective workload plan](t47-workload-plan-2026-11-01.md), [harness](https://github.com/chaproi/toktickit/blob/8053570a835a9b9c04f01a72cf9a5085f2b6e3b8/server/tests/lab-04/performance-smoke.integration.test.ts#L1), [HTTP/statistics helper](https://github.com/chaproi/toktickit/blob/8053570a835a9b9c04f01a72cf9a5085f2b6e3b8/server/tests/lab-04/performance-test-helpers.ts#L1) and all preparation failures were committed as **8053570a835a9b9c04f01a72cf9a5085f2b6e3b8 before the full run**. Execution started from a clean working tree/index at that exact HEAD; no pending source correction was present. This subsequent evidence publication is not a new application execution or hosted CI. Preparation V1/V2/V3 ran at f3adb963a2e4ab3122d70c9bb68583e12db43b53 with pending new harness files; their artifacts do not establish exact-baseline application execution.

Full command began **2026-11-01T20:24:39.9661981+07:00**, Vitest start 20:24:42; timed case began 2026-11-01T13:24:45.914Z (20:24:45.914 Asia/Bangkok). All attempts below occurred locally on November 1. No application checks ran at the later evidence commit.

| Host/runtime | Observed value |
| --- | --- |
| CPU | Intel Core i5-13420H; 8 physical cores from read-only CIM, 12 logical/available processors |
| RAM | 34,049,220,608 bytes total; available 5,725,335,552 before / 5,007,818,752 after |
| OS | Windows x64; Node os.release 10.0.26200 |
| Node / Vitest / Prisma / PostgreSQL | 24.14.0 / 2.1.9 / 5.22.0 / 18.6 |
| Runtime mode | Real Express source under Vitest/Vite TypeScript transformation, NODE_ENV=test; HTTP loopback; no TLS, production build or separate load host |
| Process RSS | 106,921,984 before / 394,383,360 after bytes; snapshots, not peak/utilization measurements |
| HTTP policy | 50 keep-alive Agents, one per VU, maxSockets=1/maxFreeSockets=1; sequential per VU; no client retries |
| Prisma URL pool options | connection_limit, pool_timeout, connect_timeout unset; inherited defaults unchanged; exact configured engine capacity not asserted |
| PostgreSQL settings | max_connections=100; shared_buffers=128MB; work_mem=4MB; effective_cache_size=4GB; jit=on; track_io_timing=off |
| Connection observation | 18 sessions on dedicated database after warm-up, including the independent observer; not a proof of configured application-pool capacity |
| New harness limits | Initial finite case budget 1,200,000 ms; 15,000 ms client deadline; no existing global/test/transaction budget changed |

Authentication was real, outside latency traffic: 50 independently hashed synthetic active/password-ready accounts, 50 successful inherited real logins and 50 successful loopback /api/auth/me checks. Cookies/CSRF remained private; normal middleware/limits/transactions/retries stayed enabled. No login-performance, upload, binary storage, new feature or recovery test was included.

## Actual workload and fixtures

All **50 VUs** ran concurrently with sequential requests inside each VU: 20 Requesters, 20 Staff, 10 Administrators. Each completed exactly **100 warm-up requests**, then after the complete all-user barrier exactly **10 measured requests**. Independent sample validation checked every per-user sequence, exact operation counts/mix and non-overlap within each user. No request was retried, excluded or replaced by a replay; no client-generated version/time or artificial successful response was used. New mutation UUIDs and acknowledged authoritative tokens were used. There were **zero STALE_WRITE responses**, zero transport/deadline/JSON/semantic-shape errors and zero receipt replays.

Measured mix: **200 Requester + 200 Staff + 100 Administrator = 500**; **360 reads / 140 writes**. Warm-up uses exactly ten times every operation count. The unchanged precommitted plan contains all paths, query parameters, expected 200/201 statuses and sequence. Selected immutable Ticket/Action domains use creation/read/update/approved cancellation rather than unsupported hard deletion; no attachment/upload shortcut was substituted.

Fresh indexed fixture before traffic: **2,050 Tickets, 8,000 Actions, 24,000 ActionHistory rows, 3,800 Ticket status events, 50 users/sessions, four categories/four systems; zero receipts/comments**. Background Ticket states each have 250 rows; 50 extra independent OPEN mutation targets make OPEN=300. Action bins are PLANNED=1,250, IN_PROGRESS=1,250, COMPLETED=2,750, CANCELLED=2,750. Unfinished children on frozen parents=0. Priorities, ownership, time windows and actual valid resolution histories are heterogeneous; all committed CHECK/FK/index definitions remain in force. Direct background data is read-fixture setup, not workflow-endpoint evidence. ANALYZE was confined to owned tables before traffic.

Post-run real state: **8,083 Actions, 24,209 histories, 209 receipts, 220 comments**; Tickets/status events/users/sessions remained 2,050/3,800/50/50. Zero-error expectations were 8,330/25,320/1,320/220, so the independent write-count assertion correctly failed. The **83 new Actions and 209 real history/receipt operations**, rather than expected 330/1,320, expose failed work; no missing writes were fabricated or assertions weakened. This aggregate check is not a per-failure atomicity proof.

## Measurements and target verdict

Nearest-rank p50/p95 use every phase sample, including failures: sorted durations at ceil(p*n), one-based. Timing covers HTTP dispatch through complete body receipt/JSON parse, including normal auth/pool/business waits. No success-only selection, clipping, slow-response exclusion or compensation for observer/test-runner overhead. All samples and transaction rejection observations are in the [redacted machine artifact](t47-performance-2026-11-01-measurement-1f0f9c94.json), 1,955,595 bytes, SHA-256 **1e8b3ad78b9bf53da1b9e17cb82bcc34faf1f28a25b43f2a59e1c906400d0d2d**. It contains no cookies, credentials, private bodies, storage identifiers, actual target URLs/IDs or raw SQL/errors.

| Phase | Requests | Unexpected | Error rate | p50 ms | p95 ms | HTTP elapsed | Attempt throughput | Peak / time-weighted HTTP in-flight |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Warm-up | 5,000 | 1,245 | 24.9% | 254.493 | 516.323 | 28.6281314s | 174.653 requests/s | 50 / 47.025 |
| Measured | 500 | 112 | 22.4% | 224.886 | 749.008 | 2.8111058s | 177.866 requests/s | 50 / 47.628 |

Measured successful-response throughput is **138.024 requests/s**, not the attempted 177.866 as successful capacity. Timed case (including setup/plans/cleanup) was 56.234s, file 56.235s, framework 60.02s, command wall 62.373s. The artifact's internal pre-serialization case span is 56,199.4404 ms. Neither HTTP phase had pending client requests at completion. The workload is closed-loop and has synchronized operation waves; no production arrival-rate/concurrency guarantee or CPU-load cause is inferred from one shared-host run.

| Measured operation | n | p50 ms | p95 ms | Errors | Latency-only <500 ms |
| --- | --- | --- | --- | --- | --- |
| action.cancel | 15 | 216.829 | 347.416 | 12 | Met |
| action.complete | 15 | 205.571 | 366.026 | 15 | Met |
| action.create | 30 | 295.628 | 357.210 | 27 | Met |
| action.detail | 30 | 118.195 | 197.747 | 2 | Met |
| action.edit | 30 | 320.280 | 410.688 | 26 | Met |
| action.history | 30 | 71.157 | 110.015 | 2 | Met |
| action.start | 30 | 300.426 | 427.706 | 28 | Met |
| comments.create | 20 | 160.119 | 230.119 | 0 | Met |
| comments.list | 40 | 164.696 | 182.041 | 0 | Met |
| requester.dashboard | 40 | 263.930 | 488.377 | 0 | Met |
| requester.ticket.detail | 40 | 109.695 | 219.507 | 0 | Met |
| requester.tickets.filtered-list | 20 | 250.785 | 301.514 | 0 | Met |
| requester.tickets.list | 20 | 731.174 | 857.332 | 0 | Failed |
| staff.actions.list | 30 | 309.907 | 504.500 | 0 | Failed |
| staff.dashboard | 30 | 194.093 | 1050.620 | 0 | Failed |
| staff.ticket.detail | 30 | 96.024 | 123.834 | 0 | Met |
| staff.tickets.list | 30 | 749.008 | 864.613 | 0 | Failed |
| ticket.actions.list | 20 | 235.346 | 246.301 | 0 | Met |

**Four successful-read buckets fail p95**: ordinary owned Tickets (857.332 ms), Staff Queue (864.613 ms), Staff Dashboard (1,050.620 ms), My Actions (504.500 ms). Each of those buckets has zero status errors. Thus the latency failure does not depend on interpreting failed mutations as successful operations. Conversely, fast write failures make a latency-only Met cell insufficient for acceptance: Action completion succeeded 0/15, creation 3/30, edits 4/30, starts 2/30, cancellation 3/15.

Measured statuses: 200=365, 201=23, 400=10, 409=41, 500=61. Unexpected codes: INTERNAL_ERROR=61, ACTION_TERMINAL=27, INVALID_ACTION_ID=10, ACTION_STATUS_UNCHANGED=8, INVALID_ACTION_TRANSITION=6. Requesters had 0/200 errors; Staff 75/200; Administrators 37/100. Warm-up statuses: 200=3,475, 201=280, 400=605, 409=190, 500=450; all are retained in the artifact.

The pass-through real transaction observer recorded **450 warm-up and 61 measured P2034 rejections**, with **no positively confirmed SQLSTATE** in the inspected code/meta/cause fields. No artificial fault, callback/option replacement or generic serialization retry was introduced. The exact underlying PostgreSQL failure subtype remains unproven; do not call these confirmed 40001 or deadlocks. V2's missing subtype is not retroactively recovered. Subsequent 400/409 outcomes include dependency consequences of failed create/edit/start steps; the VUs kept the original schedule/last acknowledged state rather than secretly repairing/replacing requests. This is performance/error evidence for the declared workflows, not 500 independently successful CRUD microbenchmarks or a new proof of backend atomicity.

The test completed both phases, summaries and cleanup, then failed at the exact persisted-write-count assertion. Subsequent inline mix/per-user/error/p95 assertions were **unreached**, not credited as passes. Their relevant raw counts/sequences/concurrency and nearest-rank percentiles were independently recomputed and validated from all 5,500 artifact samples; target Booleans had already been computed false before the assertion. The single collected/executed test remains FAILED.

## Real plans outside measured traffic

These are unforced EXPLAIN ANALYZE/BUFFERS on representative predicate/index probes, before warm-up, not captured SQL for every Prisma-generated request. The history-resolution probe uses a representative rolling seven-day bound; it is not replacement evidence for precise Bangkok calendar logic. All predicate values/schema identifiers/raw SQL are omitted from the artifact; safe actual nodes/index names/rows/buffers remain.

| Probe | Planning ms | Execution ms |
| --- | --- | --- |
| requester-list | 0.135 | 0.050 |
| ticket-actions | 0.080 | 0.014 |
| action-history | 0.132 | 0.116 |
| assignee-unfinished | 0.116 | 0.163 |
| dashboard-resolutions | 0.547 | 1.538 |

Observed existing indexes: Ticket_requesterId_updatedAt_idx, Action_ticketId_createdAt_id_idx, ActionHistory_actionId_createdAt_id_idx and Action_assigneeId_status_createdAt_id_idx. The resolution probe chose sequential scans/hash join/aggregation on this scale. No planner method was forced and no query plan implies a missing index or identifies the end-to-end latency cause by itself; authentication, query count, pool waits, projection, network and client/test overhead remain separate possible contributors, not established diagnoses.

## Every preparation and execution attempt

All application commands ran from server/, sequentially. Validation mode was command-scoped and restored. Full execution explicitly unset it and restored the prior value. No full regression/build/client/browser/accessibility/recovery command ran.

```text
T: npm.cmd exec -- tsc --noEmit
V: TOKTICKIT_T47_VALIDATE_ONLY=1 npm.cmd test -- tests/lab-04/performance-smoke.integration.test.ts
W: npm.cmd test -- tests/lab-04/performance-smoke.integration.test.ts
D: node --import tsx --input-type=module - [private bounded SQL-construction diagnostic]
```

| Attempt | Actual exit/counts | Duration and disposition |
| --- | --- | --- |
| T1 | Exit 0; no test collection/diagnostics | 27.622s wall; initial type check |
| V1 | Exit 1; 1 file/case collected/executed/failed, 0 passed/skipped; 0 workload requests | Case 35.386s; framework 41.54s; wall 44.305s. Fixture CHECK failure before route schedule; [artifact](t47-performance-2026-11-01-validation-007c403b.json) retained |
| D | Exit 1; SQL-only, no test/HTTP count | 4.00s tool wall. Statement 103 (Action INSERT), SQLSTATE 23514; private detail withheld. Confirmed trailing-space fixture descriptions/results conflict with trim CHECKs; owned diagnostic schema verified remaining=0. No application behavior was bypassed or production error invented |
| T2 | Exit 0; no test collection/diagnostics | 13.625s wall after explicit btrim of only those two fixture literals |
| V2 | Exit 1; 1 file/case collected/executed/failed, 0 passed/skipped; 30 schedule requests | Case 28.659s; framework 32.26s; wall 33.810s. Full fixture/session checks passed; one real create 500 + five dependent 400s; [artifact](t47-performance-2026-11-01-validation-a3ea2cb2.json) retained. Not labelled a remaining fixture defect |
| T3 | Exit 0; no test collection/diagnostics | 7.942s wall after adding only pass-through rejection observations |
| V3 | Exit 1; 1 file/case collected/executed/failed, 0 passed/skipped; 30 schedule requests | Case 20.929s; framework 33.28s; wall 36.522s. Three genuine Action-write 500s, three P2034/no confirmed SQLSTATE; [artifact](t47-performance-2026-11-01-validation-ebb510d8.json) retained. Bounded classification, not a rerun to seek a lucky pass |
| Prepared harness commit | No application execution | 8053570a835a9b9c04f01a72cf9a5085f2b6e3b8, including plan/all preparation artifacts; zero-error functional validation remained failed |
| W1 | Exit 1; 1 file/case collected/executed/failed, 0 passed/skipped; 5,000 warm-up + 500 measured | Case 56.234s; framework 60.02s; wall 62.373s; one complete run alone at the committed revision, no subsequent workload rerun |

The single fixture correction and observer are new-test-only changes; all original tests/helpers, production, schema/migrations, seed, dependencies, global configuration and existing budgets remain byte-identical. Existing create-only seed ambiguity/frozen-fixture warnings and repeated sanitized application database-error messages were retained, along with PowerShell's NativeCommandError stderr rendering. No unexpected logs were concealed or private raw errors published. There is no claimed production GREEN correction.

## Cleanup and next gate

Every phase awaited all VU tasks and completed HTTP responses (no transport deadlines occurred) before Agents were destroyed, listener closed, observer restored and Prisma disconnected. The existing owned-schema helper dropped the exact fresh schema/fixtures/sessions and verified remaining=0; environment restoration passed. No primary setup/cleanup exception occurred in W1. V1's schema-removed artifact flag was unreached after its callback threw; the helper log and independent probes establish actual removal, not an edited historical flag.

Independent guarded post-run probes confirmed the live dedicated target, **zero owned performance/SQL-diagnostic schemas, zero unexpected default-schema benchmark users/Tickets, zero idle transactions and zero repository application/test processes**. Only unrelated tool runtimes remained. No shared resource/process was stopped. No owned temporary storage, buckets, profiles or binaries were created in this batch; private logs remain separately retained. Historical artifacts are preserved, and exclusive-create run filenames prevented overwrites.

**Next action:** a separately scoped diagnostic/RED-correction proposal for the observed real independent-worker write failures and slow successful read paths, preserving this fixed workload/result. First obtain safe positive PostgreSQL failure evidence behind P2034 without broadening retries; separately localize successful list/Dashboard latency (query counts/timing/pool waits) before proposing a minimum correction. Do not infer a missing index, machine-load cause, generic-retry remedy or change the accepted target. No new measurement is authorized by this report alone. T-47 is now measured failing evidence, not Missing or Passed; T-31's isolated confirmation/earlier unknown timeout remain untouched. Final integrated acceptance, broader T-37/T-38 contributions, actual #49 review and #50 release are still outstanding. All 55 normative scenarios remain Planned; no Product DoD/Issue/GitHub metadata changes.
