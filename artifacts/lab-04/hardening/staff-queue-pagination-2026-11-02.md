# Ordinary Staff Queue database pagination - 2026-11-02

**The bounded Queue correction passes. The original T-47 benchmark remains FAILED.** No workload, full regression, latency comparison or write-transport correction was executed in this batch. All previous samples, failures and recovery evidence remain unchanged.

## Provenance and correction

Preflight verified chaproi/toktickit, clean working tree/index on feat/49-final-hardening at published **c3c4b42ce542b65ded8e8f80b3a4185d31cd2066**, fetched origin, live head equality and upstream ahead/behind 0/0. No applicable AGENTS.md was found. The repository guard and a real read-only probe confirmed the dedicated live database/schema and a different operational database before fixture writes. A redacted process inventory found no other test/build/seed job; the dedicated target had no other non-idle connection. No unrelated process was stopped.

The [prior diagnosis](t47-diagnosis-2026-11-01.md) observed ordinary Queue retrieving 2,052 rows to return 25. This is a demonstrated unbounded retrieval defect; the diagnosis did not establish which unmeasured latency components caused the benchmark's slow reads.

- Tests-only RED: [a5ea5b0705d0480fb0589f64f3b5f283aa08349c](https://github.com/chaproi/toktickit/commit/a5ea5b0705d0480fb0589f64f3b5f283aa08349c), adding only [staff-queue-pagination.api.test.ts](https://github.com/chaproi/toktickit/blob/a5ea5b0705d0480fb0589f64f3b5f283aa08349c/server/tests/lab-04/staff-queue-pagination.api.test.ts).
- Production GREEN: [4c7d78d0c70cf0bda6d5a94e3a18f04968504dc6](https://github.com/chaproi/toktickit/commit/4c7d78d0c70cf0bda6d5a94e3a18f04968504dc6), changing only [staff-queue-service.ts](https://github.com/chaproi/toktickit/blob/4c7d78d0c70cf0bda6d5a94e3a18f04968504dc6/server/src/tickets/staff-queue-service.ts).
- Both RED executions used unchanged starting production and pending new tests. GREEN, inherited regressions, affected Dashboard suites, final TypeScript and build ran at HEAD a5ea5b0 with the pending production correction. Those production bytes were subsequently committed unchanged as 4c7d78d (Git blob b04f4e7a5f086c56bfde94fe48d73514ef8e4c2e). No clean post-GREEN-commit, evidence-publication-HEAD or hosted-CI execution is claimed.

The ordinary entry point now delegates its unchanged parsed base query to the existing PostgreSQL Staff Ticket reader. Loading is deferred because that reader consumes this module's shared safe projection. The reader's source and all extended Dashboard behavior remain unchanged. Its parameterized predicates, whitelisted ordering expressions, aggregate counts and LIMIT/OFFSET run in one explicitly read-only REPEATABLE READ transaction. Only page IDs are hydrated; SQL page order is restored after hydration. Out-of-range pages return metadata before multiplying a potentially huge offset.

No status group or date/widget predicate is present for an ordinary query: terminal and unassigned Tickets remain visible. Numeric owner selection still requires a currently active Staff/Admin; unfiltered historical inactive/demoted owners remain visible. Matching/totalItems use the selected owner; mine/unassigned replace only that owner predicate. Safe DTOs, literal search, business severity/status ranks, defaults, allowed sizes and same-direction ID tie-breaking remain intact. No index, pool, timeout, retry, Action protocol, dependency, HTTP route or configuration change was made.

## Fixtures, assertions and actual bounds

The new real App/Supertest/PostgreSQL file has **19 independently reported cases**. Five owned identities and one real Staff session support 63 synthetic Tickets: 60 matching the base category/system/search, in five 12-row owner cohorts, plus three independent category/system/search decoys. Two owned Categories and two Related Systems isolate the reads. Historical ineligible ownership appears only on constructed terminal parents; these are read fixtures, not workflow evidence.

Independent expected index/ID sets and literal business-rank buckets establish all/unassigned/me/explicit eligible owner pages, excluded numeric inactive/demoted owners, owner-replacement counters with intersecting search/system/category/priority/status predicates, literal percent/underscore/backslash search, all six sort fields and ties, page sizes 10/25/50, zero and beyond-final pages, and Number.MAX_SAFE_INTEGER page handling. Earlier Ticket rows are compared exactly after all reads, excluding legitimate authentication/session bookkeeping. No fixture business outcome is mocked.

Pass-through Prisma middleware records **actual resolved Ticket projection and raw page-ID result cardinalities**. It does not assert supplied `take` arguments. An observation-only callback wrapper reads the actual PostgreSQL isolation/read-only settings before commit; aggregate results and all Ticket/page results must be transactional. Neither wrapper substitutes successful results or alters transaction options.

| Observation | Returned items | Actual page IDs / projections | Aggregate / snapshot |
| --- | ---: | --- | --- |
| RED-1 and RED-2, page 1 size 10 | 10 | No SQL page; 60 projections, outside transaction | No aggregate snapshot |
| GREEN page 1, 2 and 6, size 10 | 10 each | 10 / 10 each | One aggregate row; one read-only REPEATABLE READ snapshot per request |
| GREEN page 7, size 10 | 0 | Neither retrieved | Same aggregate/snapshot |
| GREEN mine page 2, size 10 | 2 | 2 / 2 | Same aggregate/snapshot |
| GREEN page 2, size 25 | 25 | 25 / 25 | Same aggregate/snapshot |
| GREEN page 2, size 50 | 10 | 10 / 10 | Same aggregate/snapshot |

[Machine-readable redacted observations and results](staff-queue-pagination-observations-2026-11-02.json) preserve both RED attempts and all seven GREEN observations. Bounds concern rows returned to the application, not a claim that PostgreSQL scans at most pageSize rows. No new planner or latency measurement was used to declare improvement.

## Commands and all attempts

All commands below ran sequentially from server/ on Windows PowerShell, Node 24.14.0, Prisma 5.22.0 / Vitest 2.1.9, against the existing guarded local PostgreSQL setup. Times are local **2026-11-02, Asia/Bangkok**. Framework time and wrapper wall time are distinct. No tests were skipped.

| Attempt / start | Exact command | Collected / executed / passed / failed / skipped | Exit | Framework / wall |
| --- | --- | --- | ---: | --- |
| TS-1, before API execution | `npm.cmd exec -- tsc --noEmit` | Not applicable; one TS2345 in the new observation-options fixture type | 1 | TS alone not timed; 9.523s shell included expected-index review and whitespace check |
| RED-1, 01:49:02 | `npm.cmd test -- tests/lab-04/staff-queue-pagination.api.test.ts` | 19 / 19 / 18 / 1 / 0; 1 file | 1 | 4.17s / 5.407s; cases 1.871s |
| TS-2 | `npm.cmd exec -- tsc --noEmit` | No diagnostics | 0 | No framework / 8.066s |
| RED-2, 01:49:48 | `npm.cmd test -- tests/lab-04/staff-queue-pagination.api.test.ts` | 19 / 19 / 18 / 1 / 0; 1 file | 1 | 4.09s / 5.120s; cases 1.740s |
| GREEN-1, 01:50:22 | `npm.cmd test -- tests/lab-04/staff-queue-pagination.api.test.ts` | 19 / 19 / 19 / 0 / 0; 1 file | 0 | 4.33s / 5.424s; cases 2.078s |
| INHERITED-1, 01:50:36 | `npm.cmd test -- tests/lab-03/staff-queue.api.test.ts tests/lab-03/staff-queue-query.unit.test.ts tests/lab-03/authorization.api.test.ts tests/lab-03/safe-errors.api.test.ts` | 57 / 57 / 57 / 0 / 0; 4 files | 0 | 12.10s / 13.099s |
| DASHBOARD-1, 01:51:04 | `npm.cmd test -- tests/lab-04/staff-dashboard.api.test.ts tests/lab-04/dashboard-drilldown.api.test.ts tests/lab-04/staff-dashboard-security.api.test.ts` | 157 / 157 / 157 / 0 / 0; 3 files | 0 | 30.85s / 31.863s |
| TS-3 | `npm.cmd exec -- tsc --noEmit` | No diagnostics | 0 | No framework / 7.881s |
| BUILD-1 | `npm.cmd run build` | TypeScript build passed | 0 | No framework / 7.044s |

TS-1 was a newly authored test type defect, corrected by explicitly typing the request-options array; it was not semantic RED. Before the final RED commit, the test also added aggregate observations, 25/50-size observations and exact final Ticket preservation/cleanup checks. RED-2 was justified by those test changes, and still failed on the same actual 60-row retrieval. Both RED attempts passed all 18 behavioral cases and reached the boundedness assertion; later snapshot/aggregate/subsequent observed-page assertions remained unreached. GREEN executed and passed those deeper assertions unchanged. No production correction was needed after GREEN-1.

The inherited files contributed 25 Queue, 23 parser, 5 authorization and 4 safe-error cases. The affected group contributed 28 Staff Dashboard, 90 drill-down and 39 security cases, including real coordinated snapshot writers and safe controlled-fault behavior. Existing fault tests remain controlled classifications after real authentication/database reads, not natural outage evidence.

Existing create-only seed warnings about ambiguous legacy identities/references and frozen/ineligible Action fixtures were retained; the preparation reported operational records preserved and no pending migrations. Git warned about future LF-to-CRLF conversion; whitespace checks passed. An initial sandbox process-inventory denial was resolved through authorized read-only escalation. The first inline isolation probe failed JavaScript parsing due to PowerShell quoting before connecting; corrected stdin execution passed. These are tooling/setup observations, not application failures.

## Cleanup, preservation and next gate

Every focused run restored the transaction spy, disabled the observation capture, drained its awaited requests, removed only its immediately tracked Tickets/sessions/users/reference rows and disconnected the client. Final RED-2 and GREEN also compared exact Ticket state. No schema, listener, coordination/fault object, browser profile or environment override was created by this new file. Inherited/affected suites reported owned cleanup and restored their scoped observers/settings. An independent guarded post-run probe confirmed zero Q49 Tickets, owned category/system rows, idle transactions and other non-idle database connections. No operational data or unrelated process was altered.

All 502 pre-existing tracked files were hashed before edits. Only staff-queue-service.ts changed before the GREEN commit; all inherited tests/helpers, extended reader, migrations, benchmark samples and historical artifacts stayed byte-identical. The new committed RED test also stayed byte-identical through GREEN. The later evidence increment changes only this ledger, its redacted JSON and hardening-audit.md. Final validation checked five UTF-8 files without BOM/replacement characters, 24 local links, consistent Markdown table columns and valid JSON. All 55 ordered scenario IDs/dependencies, execution/status cells and checkbox lines were preserved. Only the intended service and audit differ among the 502 original tracked files; complete/staged scope and whitespace checks passed. No test/build/seed process remained at the final redacted inventory.

Partial traceability: T-47 / AC-40 diagnosis correction, inherited OP-19 Queue semantics, with T-28 / AC-28 and T-34 / AC-34 regressions. No whole scenario or Product DoD is promoted. **T-47 remains F current + I.** The opaque COMMIT-error SQLSTATE transport proof is still the separate write-correction gate; generic P2034 retries remain prohibited. Other read-latency components remain unestablished. Preserve the failed 50-user benchmark and all samples; do not repeat it until separately justified corrections and authorization. Actual implementation review, integrated acceptance and #50 release remain outstanding.
