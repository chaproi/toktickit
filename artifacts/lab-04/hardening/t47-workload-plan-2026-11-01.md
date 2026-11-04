# T-47 workload plan recorded before measurement - 2026-11-01

Issue #49; AC-40/T-47, accepted D-01/D-14/D-15/D-16. This is a prospective local workload plan, not a performance result. The [reviewed scenario](https://github.com/chaproi/toktickit/blob/f3adb963a2e4ab3122d70c9bb68583e12db43b53/docs/lab-04/tests.md#L63) requires 50 active users, 100 warm-up and 10 measured requests per user to normal detail/Dashboard/list/CRUD, excluding uploads, with p50/p95/error rate/plans/host/fixture size. Target p95 is strictly below 500 ms. Earlier T-31 timeout and its unestablished cause remain preserved; no recovery investigation or workload is included here.

## Execution policy

- 50 distinct active, password-ready users: 20 Requesters, 20 IT_STAFF, 10 ADMINISTRATOR. Each has its own real, live session, verified before traffic. Accounts use inherited password hashing and real login through Express/Supertest; 50 sequential logins and 50 loopback GET /api/auth/me checks are provisioning, outside warm-up/measurement. No authentication/CSRF/session middleware is mocked or bypassed. This is not login-throughput measurement.
- The real Express App listens on one owned ephemeral IPv4 loopback port. PostgreSQL uses the actual repository guard, a distinct dedicated test database and one fresh owned disposable schema with committed migrations. No operational/shared database or storage is used. No uploads or attachment endpoints are in the traffic.
- Each VU owns one keep-alive Node HTTP Agent, maxSockets=1/maxFreeSockets=1, and issues requests sequentially with no think-time/sleep. All 50 VUs start together. Promise.allSettled drains each phase. A full barrier completes all **5,000 warm-ups** before any of the **500 measured requests** start. This is a closed-loop workload, not a fixed arrival-rate/SLA simulation; record achieved throughput and time-weighted/peak HTTP concurrency.
- Inherited Prisma pool, authentication/rate limits, isolation/transaction timeouts and maximum-three confirmed-40001 retries remain unchanged. Record configured numeric pool URL options or explicitly report unset/engine default; do not infer an unobserved pool capacity. Record PostgreSQL settings and dedicated-database connection count after warm-up (not an application-pool capacity claim).
- New finite case budget: 1,200,000 ms (20 minutes), including fixture/plans/workload/cleanup. Justification: 110 sequential requests per VU at the inherited ordinary 5-second transaction limit is about 550 seconds, plus real account/fixture setup, plans, reads and cleanup with bounded margin. New client transport deadline: 15,000 ms per request, reported as an error/sample, with no request retry. Existing test/global/transaction budgets are untouched.
- Default execution performs the full workload. Explicit TOKTICKIT_T47_VALIDATE_ONLY=1 instead constructs the same full fixtures/sessions and runs 30 unmeasured schedule checks (one Requester, an even Staff completer, an odd Administrator canceller). It is labelled fixture/harness validation, not warm-up/measurement or T-47 acceptance. TypeScript and structural fixture/authentication validation must complete before committing the harness. Genuine application failures in schedule checks remain failing evidence; they must not be hidden or treated as invalid fixtures. Then run the unchanged full workload once alone at the committed revision, retaining every failure.

## Per-user schedules and exact measured mix

Each Requester repeats its ten-step schedule 10 times for warm-up, then once for measurement. Each Staff/Admin does the same. Expected 201 is a genuine create, never a receipt replay. Other business calls expect 200.

| Operation | Method and route | Requesters: per measured user | Staff/Admin: per measured user | Total measured | Expected |
| --- | --- | --- | --- | --- | --- |
| Requester Ticket detail | GET /api/tickets/:ticketId | 2 | 0 | 40 | 200 |
| Requester Dashboard | GET /api/dashboard/requester | 2 | 0 | 40 | 200 |
| Owned list | GET /api/tickets | 1 | 0 | 20 | 200 |
| Owned OPEN-filtered list | GET /api/tickets?currentStatus=OPEN | 1 | 0 | 20 | 200 |
| Public comment list | GET /api/tickets/:ticketId/comments | 2 | 0 | 40 | 200 |
| Ticket Action list | GET /api/tickets/:ticketId/actions | 1 | 0 | 20 | 200 |
| Public comment create | POST /api/tickets/:ticketId/comments | 1 | 0 | 20 | 201 |
| Staff Ticket detail | GET /api/staff/tickets/:ticketId | 0 | 1 | 30 | 200 |
| Staff Dashboard | GET /api/dashboard/staff | 0 | 1 | 30 | 200 |
| Ordinary Staff Queue | GET /api/staff/tickets | 0 | 1 | 30 | 200 |
| My unfinished Actions | GET /api/staff/actions?assignee=me&actionStatusGroup=unfinished | 0 | 1 | 30 | 200 |
| Action create | POST /api/tickets/:ticketId/actions | 0 | 1 | 30 | 201 |
| Action detail | GET /api/tickets/:ticketId/actions/:actionId | 0 | 1 | 30 | 200 |
| Action edit | PATCH /api/tickets/:ticketId/actions/:actionId | 0 | 1 | 30 | 200 |
| Action start | PATCH /api/tickets/:ticketId/actions/:actionId/status | 0 | 1 | 30 | 200 |
| Action complete | PATCH /api/tickets/:ticketId/actions/:actionId/status | 0 | 1 for 15 even VUs | 15 | 200 |
| Action cancel | PATCH /api/tickets/:ticketId/actions/:actionId/status | 0 | 1 for 15 odd VUs | 15 | 200 |
| Action history | GET /api/tickets/:ticketId/actions/:actionId/history | 0 | 1 | 30 | 200 |

Totals: 200 Requester + 200 Staff + 100 Administrator measured requests = **500**; **360 reads / 140 writes** (72% / 28%). Warm-up is exactly ten times each operation count: **5,000**. Completion/cancellation split is fixed by VU ordinal, not changed after seeing latency. Selected Ticket/Action APIs preserve audit and offer logical cancellation rather than a hard-delete endpoint; no unsupported DELETE is invented. Thus CRUD coverage here is normal creation/read/update/approved cancellation, not arbitrary destructive deletion or an attachment-storage benchmark.

Ticket lists use page 1/pageSize 25, updatedAt DESC; comments/Actions/history use page 1/pageSize 20; My Actions uses page 1/pageSize 10 with actor-derived assignee. Dashboard reads use the ordinary default scope. No records are downloaded for client-side aggregate substitution.

Every VU has its own OPEN mutation Ticket. Requester comment targets are distinct from worker Action targets. Worker creates are self-assigned to avoid accidental cross-VU User-gate contention; this performance mix does not re-prove distinct-actor completion semantics. Each create gets a new UUID. Returned parent tokens and Action versions feed subsequent edits/start/finalization; create/detail are real responses. No intentional stale conflicts, shared mutation target, automatic HTTP retry, replay-as-write, hidden recovery request or local time/version fabrication is used. If an unexpected prerequisite failure occurs, retain it and subsequent dependent errors; do not silently repair, replace or remove requests to improve the distribution.

## Fixture scale and independent expectations

- 2,000 background Tickets, 250 in each of eight states; four active categories/four systems; all four requested and IT priorities with divergent values. Ownership includes null and all 30 workers; each Requester owns 96 or 104 background Tickets. Updated times span 14 days; valid resolution/reopening/closure/cancellation history follows the literal approved edges. These are directly constructed read fixtures, not endpoint workflow evidence.
- 50 additional independent OPEN mutation Tickets: 20 owned by the Requester VUs, 30 for worker VUs. Baseline total **2,050 Tickets**, **3,800 Ticket status events**. Real comment writes leave parent timestamps unchanged; real Action mutations advance them under ordinary gates.
- Four Actions per background Ticket: **8,000 Actions**, with PLANNED=1,250, IN_PROGRESS=1,250, COMPLETED=2,750, CANCELLED=2,750. Frozen parents have terminal children only. Creator/assignee/performer IDs are separately attributed. Valid retained follow-up notes, draft results and literal attachment notes are present.
- **24,000 complete ActionHistory snapshots**, three per background Action, unique versions/events, no fabricated cascade links. All fixtures use committed CHECK/FK/index definitions. Baseline receipts/comments=0, users/sessions=50. The workload exercises growing real receipt indexes, not repeated mutation keys.
- Zero-error full execution should finish with 330 genuine new Actions, 1,320 new Action histories/receipts and 220 comments: totals Actions=8,330, ActionHistory=25,320, receipts=1,320, comments=220. Tickets/Ticket status history/users/sessions stay at baseline counts. Independent expected totals are asserted after draining traffic.
- This moderate indexed scale extends the earlier 200-Ticket planner check; it is not a production-size/load-capacity guarantee. Existing historical rows and indexes are unmodified. ANALYZE owned fixture tables before traffic; no forced planner settings, new indexes or schema changes.

## Measurement, plans, artifacts and acceptance

Latency uses performance.now(): immediately before the real HTTP call through complete response-body receipt/JSON parsing, including pool/auth/business waits. Request construction is outside that timer; no latency sample is removed. Record all warm-up and measured samples, including errors/timeouts, with ordinal role/VU/sequence, template endpoint/method/operation, expected/actual status, safe error code, semantic-error marker, replay Boolean, timing and byte count. Never record cookies, credentials, raw bodies, private text, actual target URLs/IDs, SQL errors or connection values.

Overall and each operation use nearest-rank percentiles: sort **all** phase durations ascending, then p50=element ceil(0.50*n), p95=element ceil(0.95*n), using one-based ranks. Error rate is unexpected status/transport/semantic failures divided by all requests. No success-only percentile, outlier trimming or client retry. A pass-through transaction-boundary observer records only real rejection codes/proven SQLSTATE/model/isolation/timing and rethrows the unchanged error; it changes no callback, option, retry or result. Its unisolated test-runner/observer overhead is included, not subtracted, and these are not uninstrumented production-build measurements. Report endpoint sample sizes; 15-request finalization buckets are small local samples. Evaluate aggregate p95<500 ms and each operation's same target separately; retain both verdicts. The harness fails if counts/mix/concurrency, zero-error expectations or either p95 evaluation fail; no post-hoc workload/budget/index changes to obtain GREEN.

Record phase/total elapsed time, completed requests per second, peak and time-weighted client HTTP in-flight count, per-VU counts, host CPU/RAM/OS/Node/PostgreSQL/Prisma versions, process RSS, source test runtime and relevant PostgreSQL/pool settings. Observed host preflight: Intel Core i5-13420H, 8 cores/12 logical processors, 34,049,220,608 physical RAM bytes, Windows. Application and database share this host; no dedicated hardware/network/hosted-CI or optimized production build claim.

Outside latency measurement collect real unforced EXPLAIN ANALYZE/BUFFERS for representative owned Ticket list, Ticket Actions, ordered Action history, assigned unfinished list and recent-resolution aggregation. Preserve safe plan nodes/index names/rows/timings/buffer counts; exclude predicates/parameters/schema identity. These are representative predicate/index probes, not claims to capture every Prisma-generated statement. The resolution probe uses a rolling seven-day bound only to inspect a representative history aggregation; it does not replace the already-tested exact Bangkok calendar behavior. Explain probes and setup/checks are not counted in the 5,500 workload HTTP requests.

Write each run to a unique exclusive-create redacted JSON artifact under this directory, with tested HEAD, source cleanliness, plan, host, counts, plans, phase statistics, every sample, failure/cleanup classification and source-mode qualification. Preserve failed results. A concise dated results record and hardening-audit update follow execution; no performance numbers are invented here.

All HTTP work is drained before destroying owned Agents/listener and disconnecting Prisma. Existing disposable-schema ownership guards remove only this fresh schema and its owned fixtures/sessions. Restore scoped environment and independently probe for leftovers/idle transactions. A cleanup failure is retained separately from the primary failure. No global reset/clean, rate-limit relaxation, shared account edits, production fixes, unrelated suites or GitHub metadata changes are authorized by this plan.

## Preparation outcomes retained before the full workload

Preparation is not T-47 measurement and none of these attempts ran warm-up/measured phases. TypeScript passed on all three checks, repeated only after concrete code changes.

- Validation V1 executed one case and failed before route traffic: the generated Action INSERT violated a CHECK (SQL-only diagnostic positively retained 23514 at fixture statement 103). Inspection found trailing spaces in repeat-generated Action description/result. The only fixture-value correction was explicit btrim of those two literals; no constraints, assertions, counts or workload changed. The failed artifact remains preserved. Its ownedSchemaRemoved flag was unreached after the thrown callback, not proof of a leak; the existing schema helper independently logged remaining=0 and external probes verify absence.
- V2 built all expected rows and all 50 live sessions, executed 30 route checks and failed with six HTTP errors: one real Action create 500, then five dependent invalid-ID responses. No fault was injected. Its unretained database subtype is not retroactively inferred from later evidence.
- One bounded V3 added the pass-through rejection observer to classify actual failures, rather than rerunning for a favourable result. The same valid fixture/session/schedule checks completed, with three actual Action write 500s. The observer retained three P2034 rejections (MutationReceipt/Action), Serializable isolation and no confirmed SQLSTATE. This is not positively proven 40001/deadlock metadata and does not authorize generic retries. The real persistence counts differ from the zero-error expectations, so the validation case remains failed. No production correction, serialization-policy change, fixture prewarming, hidden resubmission or relaxed assertion follows.

This distinguishes the corrected fixture defect from real application failures. The original prospective all-success expectation is retained in the tests and workload table. Structural setup is valid; functional schedule verification is not GREEN. Commit the prepared harness and these records, then execute the specified 50-VU/5,500-request workload exactly once to quantify it. Do not serialize VUs, seed extra receipts, change targets/endpoints, retry requests or alter budgets to avoid the observed errors. The dated results record will retain exact command counts/durations and source-state provenance for all preparation attempts.
