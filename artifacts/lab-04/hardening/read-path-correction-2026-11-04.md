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
