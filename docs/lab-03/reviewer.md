# Lab 3 Peer Review Record

## 1. Purpose

This file records only review and governance events supported by repository or GitHub evidence. It does not treat specification drafting, automated checks, or AI assistance as peer approval.

## 2. PR #26 Contract Outcome

| Item | Value |
| --- | --- |
| Engineering-contract Issue | #25 |
| Source branch | docs/lab3-engineering-contract |
| Intended PR target | lab3-staging |
| Initial reviewed commit | f77339c635145286e20c1efc21c83183a5381aa2 |
| Corrected contract HEAD | 7da4cea22671fd61f5a2c2b61d8ca4b3b4226d52 |
| Pull Request | #26 — docs(lab3): define sprint 3 engineering contract |
| Review history | Chxtamos requested changes in four blocker categories recorded below |
| Approval | Tanaboonnnnn approved exact corrected HEAD 7da4cea22671fd61f5a2c2b61d8ca4b3b4226d52 |
| Merge | Merged into lab3-staging as 597a621bd857252a17771f9dc4b3cbb0dd0c1712 |
| Issue closure | Issue #25 closed |
| GitHub Project status | Done |

## 3. Review Checklist

The future reviewer should verify:

- [ ] The six docs/lab-03 contract files exist before implementation work is approved.
- [ ] Scope includes every mandatory Lab 3 capability and none of the excluded features.
- [ ] Authentication decisions cover Argon2id, secure credential/session storage, expiry, logout invalidation, login throttling, CSRF, and safe errors.
- [ ] Every protected API operation appears in the authorization matrix and is enforced by the backend plan.
- [ ] Requester identity comes only from the authenticated session.
- [ ] Queue query, assignment, IT Priority, status transitions, Comments, Notes, and resolution indication agree across all documents.
- [ ] Administrator rules cover one role, duplicate email, self-deactivation/self-role protection, last active Administrator, non-terminal owner conflicts, terminal historical ownership, no deletion, and new initial password behavior.
- [ ] Migration preserves Development Requester ids, immutable historical requester references, Ticket ownership, Attachment relationships, statuses, and priorities while validating unique per-User initial credentials before mutation.
- [ ] Every AC maps to at least one Test ID; only tests with completed evidence are marked Pass and all later obligations remain Planned.
- [ ] UI states, responsive widths, accessibility, and Zen Green rules are complete.
- [ ] API request/response shapes, statuses, validation limits, conflicts, and safe failures are internally consistent.
- [ ] Product Definition of Done is testable and does not claim future evidence.

## 4. Findings and Responses

PR #26 received a Requested Changes review from Chxtamos. The findings remain below as historical evidence. The corrected contract at 7da4cea22671fd61f5a2c2b61d8ca4b3b4226d52 was later approved by Tanaboonnnnn and merged through 597a621bd857252a17771f9dc4b3cbb0dd0c1712.

| Date | Reviewer | Location | Finding | Response / Commit | Status |
| --- | --- | --- | --- | --- | --- |
| 2026-09-18 | Chxtamos | PR #26 requested-changes review, Blocker 1 | Migrated Lab 2 statuses, ownerId=null, and the owner invariant were contradictory. | Added the complete seven-status table, null-owner migration/postflight policy, unassigned Queue/Claim behavior, ACs, and Planned migration/API tests in corrected contract HEAD 7da4cea22671fd61f5a2c2b61d8ca4b3b4226d52. | Corrected; later approved and merged |
| 2026-09-18 | Chxtamos | PR #26 requested-changes review, Blocker 2 | Assignment and Administrator deactivation/demotion races lacked one lock/transaction protocol and final-state tests. | Added SERIALIZABLE User-before-Ticket locks, ascending ids, bounded 40001 retry, deterministic race outcomes, safe conflicts, and Planned database-state race tests in corrected contract HEAD 7da4cea22671fd61f5a2c2b61d8ca4b3b4226d52. | Corrected; later approved and merged |
| 2026-09-18 | Chxtamos | PR #26 requested-changes review, Blocker 3 | Login could create a session without an exact Origin contract. | Added required exact Login Origin validation, ORIGIN_REQUIRED/ORIGIN_FORBIDDEN, no Referer/partial match, no rejected session, UI behavior, AC, and Planned tests in corrected contract HEAD 7da4cea22671fd61f5a2c2b61d8ca4b3b4226d52. | Corrected; later approved and merged |
| 2026-09-18 | Chxtamos | PR #26 requested-changes review, Blocker 4 | Responsive evidence used width breakpoints instead of exact reproducible dimensions. | Separated CSS breakpoints from 390 x 844, 834 x 1112, 1440 x 900, and 200% zoom evidence; specified all six screens, exact paths/assertions, ACs, and Planned tests in corrected contract HEAD 7da4cea22671fd61f5a2c2b61d8ca4b3b4226d52. | Corrected; later approved and merged |

## 5. PR #26 Approval and Merge Record

Tanaboonnnnn approved exact corrected contract HEAD 7da4cea22671fd61f5a2c2b61d8ca4b3b4226d52. PR #26 was merged into lab3-staging as merge commit 597a621bd857252a17771f9dc4b3cbb0dd0c1712. Issue #25 is closed and its GitHub Project status is Done. Chxtamos’s earlier Requested Changes remains recorded as historical review evidence and is not represented as an approval.

## 6. Issue #27 Implementation Handoff

This is an implementation handoff, not a peer review or approval record.

| Item | Current evidence |
| --- | --- |
| Issue / branch | #27 / feat/27-authentication-foundation |
| Starting commit | 597a621bd857252a17771f9dc4b3cbb0dd0c1712 |
| RED commit | 22ce5426cae6ca1dbd8002c02f14428dc9a9546c |
| Implemented scope | Lossless User/auth schema migration, guarded runtime credential mappings, idempotent seed foundation, four auth endpoints, exact Login/unsafe Origin controls, CSRF, sessions, throttling, and Lab 1/Lab 2 compatibility |
| Automated evidence | After the PR #28 concurrency correction, all 73 focused Issue #27 tests and the complete 185-test server suite passed against the migrated shared test database; the 58-test client suite, six existing Lab 2 Playwright scenarios, both production builds, and compiled health smoke also passed locally |
| Shared test migration | Applied through the guarded runner to `toktickit_test/public` after private ignored runtime mappings were provided. The populated Lab 2 snapshot preserved 5 Users, 9 Tickets, 0 Attachments, 4 Categories, 7 Related Systems, and matching User/Ticket/Attachment checksums. Two seed runs remained stable at 10 Users, 17 Tickets, 1 Public Comment, and 1 Internal Note while preserving hashes. |
| Development database | Read-only before/after evidence for `toktickit/public` remained 5 Users, 182 Tickets, 92 Attachments, 4 Categories, and 7 Related Systems with matching checksums |
| Initial GREEN commit | e74334a62cbbd92ba2a1a105ebc912b51a764bb1 |
| PR #28 governance | Approved at reviewed HEAD `6c9cbe6`; merged into `lab3-staging` as `924995bde6897d08188a6cb21b176093199efeb6`; Issue #27 closed |

One earlier verification command reached `toktickit_test/public` because its custom Vitest configuration flag was parsed incorrectly. The migration SQL failed and rolled back transactionally before tests ran, and the exact failed Prisma metadata entry was marked rolled back using the documented recovery action. After private mappings were supplied, the guarded migration later applied successfully to that validated shared test target. All disposable `issue27_*` schemas were removed after their runs; no development database mutation occurred.

## 7. PR #28 Final Outcome

PR #28 originally received Requested Changes from Tanaboonnnnn at `e74334a`. The deterministic concurrency correction was committed as `0fc0cd3` (RED), `0e606ac` (GREEN), and `268eb53` (evidence), then pushed and reviewed. Tanaboonnnnn subsequently approved reviewed HEAD `6c9cbe6`. PR #28 was merged into `lab3-staging` as `924995bde6897d08188a6cb21b176093199efeb6`, and Issue #27 is closed. The earlier Requested Changes remains historical evidence rather than the current PR state.

## 8. PR #30 Requested-Changes Record

This section records the PR #30 review history through Tanaboonnnnn's re-review of exact HEAD `dc8f397b51bba04a69f974aa4f0c7c98e2a8e07a`. GitHub is the authoritative source for live state after this documentation-only correction.

| Item | Current evidence |
| --- | --- |
| Pull Request / Issue | PR #30 / Issue #29 |
| Base / source branch | `lab3-staging` / `feat/29-authenticated-requester` |
| Initial reviewed HEAD | `1bf936af18518e4f1e5e9ad111d40cb7fc0cac3e` |
| Latest re-reviewed HEAD | `dc8f397b51bba04a69f974aa4f0c7c98e2a8e07a` |
| Latest reviewer / review status | Tanaboonnnnn / Requested Changes |
| Earlier findings | Atomic current-role eligibility for Requester mutations; authoritative Ticket reload after resolution conflict; modal keyboard/focus behavior; newly created Public Comment pagination; truthful governance evidence |
| Latest findings | Standards: 0 blocking findings. Specification: 1 blocking finding, limited to stale governance evidence. The reviewer confirmed that all three client implementation blockers were fixed |
| Corrective RED | `25e7c244ae83b30cd60ce2e7c43a5caebba26165` (`test(lab3): expose requested changes regressions`) |
| Corrective GREEN | `5043200` (`fix(lab3): resolve requester review blockers`) |
| Verification-coverage follow-up | `9b249b4` (`test(lab3): preserve verification coverage`) |
| Independent-audit retry/focus RED | `af0df90` (`test(lab3): expose retry and conflict focus gaps`) |
| Independent-audit retry/focus GREEN | `c68aab3` (`fix(lab3): handle serialization exhaustion safely`) |
| Serializable-entry compatibility follow-up | `370e8e4` (`fix(lab3): gate serializable requester mutations`), superseded by the transaction-boundary correction below |
| Transaction-gate RED | `bad31adb9523ee0823e8405bc7c93cb384aa2611` (`test(lab3): expose transaction gate boundary`) |
| Transaction-gate GREEN | `31cada316564edc4940a539d5b26eeca2863a5e7` (`fix(lab3): scope mutation gate to serializable transaction`) |
| Final requester-regression RED | `e5ebe38f8ca5a7194e683aaf9c907b24efe36d99` (`test(lab3): expose final requester review regressions`) |
| Final requester-regression GREEN | `e98d52c4995f04388360541d8f75e2e0a9d2f36b` (`fix(lab3): resolve requester state regressions`) |
| Commit visibility | RED `e5ebe38f8ca5a7194e683aaf9c907b24efe36d99`, GREEN `e98d52c4995f04388360541d8f75e2e0a9d2f36b`, and documentation commit `dc8f397b51bba04a69f974aa4f0c7c98e2a8e07a` were pushed and are present in PR #30 |
| Current external state at the `dc8f397` review event | PR #30 remained open with Requested Changes solely because its governance evidence still described the three pushed commits as local/pending. PR #30 was not approved or merged; Issue #29 remained open; and no GitHub Project Done transition had occurred |
| Governance correction | This documentation-only correction addresses that sole remaining finding. The review outcome for the exact HEAD created by this correction remains pending; GitHub is authoritative for subsequent live review state |

The RED server file deterministically covered Ticket creation, Public Comment creation, resolution indication, Attachment upload, and Attachment removal against both deactivation and role change in both meaningful commit orders. The RED client run exposed the four intended conflict-reload, reload-failure, modal-accessibility, and later-page Comment cases. GREEN uses the contract's SERIALIZABLE User-before-Ticket lock protocol and safe eligibility conflict; the client now reloads authoritative conflict state, implements modal focus containment/dismissal rules, and renders the server-created Comment on its authoritative final page. This documentation sync itself performs no GitHub action.

The independent follow-up audit identified three remaining blockers: an unqualified Prisma `P2034` was treated as retryable, exhausted confirmed serialization failures reached generic 500 handling, and resolution conflict/focus recovery covered only one conflict code and could focus an element that was about to unmount. RED `af0df90` added route-level transactional failure injection after each real operation, storage-effect tracking, and separate UI conflict/focus assertions. It failed six of nine server cases and two of nine client cases for exactly those missing behaviors; no failure came from syntax, setup, dependency, or database-target configuration.

GREEN `c68aab3` inspects structured error fields only. The configured-stack probe produced Prisma `P2010` with PostgreSQL SQLSTATE in `meta.code`; natural commit-time `P2034` exposed only `meta.modelName` and no SQLSTATE/cause, so `P2034` alone remains non-retryable. Confirmed `40001` receives exactly three total attempts and exhaustion becomes a typed internal condition mapped by all five Requester mutation routes to the existing safe `409 CONCURRENT_UPDATE` body. `40P01`, ambiguous `P2034`, and unrelated SQLSTATE failures receive one attempt and existing generic handling. Follow-up `370e8e4` restored the retained atomic five-Attachment regression, but its separate session-level gate was later found not to participate in the Prisma transaction and is superseded by `31cada3`.

Transaction-gate RED `bad31ad` added direct PostgreSQL lock-owner evidence. Against the separate-session implementation, one of three focused tests failed because the advisory-lock holder and mutation transaction had different backend PIDs; rollback release and callback exclusion otherwise behaved as expected. GREEN `31cada3` removed the standalone `pg.Client`, explicit connection teardown, and session-level lock. Each attempt now begins one Prisma SERIALIZABLE transaction, tries ordered `pg_advisory_xact_lock` keys through that exact `Prisma.TransactionClient`, and invokes the mutation callback only after the gates are held. If a gate is busy, that same transaction waits for it and raises a structured PostgreSQL `40001`; rollback releases every xact lock automatically, and the bounded retry starts a fresh transaction and snapshot. The final order is transaction-scoped coordination, ascending User locks, Ticket locks, revalidation, mutation, and commit. Ticket creation also coordinates its year sequence. No lock spans retry transactions and no explicit advisory unlock remains.

The focused gate test passed 3 tests. The combined gate, eligibility, retry/cleanup, Lab 3 Attachment, and retained Lab 2 Attachment run passed 5 files / 67 tests. The 10-test eligibility file then passed five consecutive complete runs. Plain server `npm test` passed 33 files / 225 tests with no global or command-line timeout override; plain client `npm test` passed 12 files / 98 tests. All eight Playwright scenarios, both production builds, and the compiled health smoke passed. The smoke listener was terminated and port 3199 was closed. Generated builds/test output were removed, regenerated tracked Lab 2 screenshots were restored, and zero disposable test schemas remained.

The client handles `RESOLUTION_INDICATION_NOT_ALLOWED` and `CONCURRENT_UPDATE` as separate authoritative-reload conflicts. Either closes the settled dialog, replaces the complete Ticket DTO, applies current status/owner/updated state and eligibility, presents only the safe conflict message, and focuses the refreshed Ticket Detail heading. If reload fails, the replacement error view receives focus on its meaningful `Ticket Detail` heading with `tabIndex={-1}`; focus is never restored into the unmounted dialog. Existing initial focus, Tab/Shift+Tab containment, Escape, processing protection, inert background, Cancel restoration, and normal-success heading focus remain covered.

The latest supplied review re-reviewed exact HEAD `3cf83e4` and returned Requested Changes for three client regressions plus stale governance evidence. RED `e5ebe38` added three focused tests without production changes. The two-file run had 18 passing tests and exactly three intended failures: the created Comment stayed hidden behind the initial list-error state, no authoritative page-3 request occurred after concurrent growth to 41 Comments, and an eligible authoritative Ticket received the unavailable message instead of retry guidance.

GREEN `e98d52c` separates Comment-list, POST, and refresh failures; reconciles the exact POST DTO by id against authoritative pagination; prevents a page effect from dropping the retained created Comment; preserves a successful Comment with a safe non-blocking warning if refresh fails; and uses one eligibility predicate for both action rendering and post-conflict messaging. Local verification passed 2 focused client files / 21 tests, the ordinary client suite at 12 files / 101 tests, the ordinary server suite at 33 files / 225 tests against validated `toktickit_test/public`, all 8 Playwright scenarios, and both production builds. These are local results, not hosted GitHub Actions evidence. Generated output was removed, regenerated tracked screenshots were restored, no known test listener remained, and zero disposable schemas or E2E fixture Tickets remained.

RED `e5ebe38`, GREEN `e98d52c`, and documentation commit `dc8f397` were subsequently pushed to PR #30. Tanaboonnnnn re-reviewed exact HEAD `dc8f397` and confirmed zero remaining substantive implementation blockers and zero Standards blockers. The review returned Requested Changes only for the stale governance statements corrected here; it did not approve or merge PR #30, close Issue #29, or move the GitHub Project item to Done. The recorded test counts remain local verification evidence and are not represented as hosted GitHub Actions results.

## 9. Issue #29 Implementation Handoff

This is implementation and locally executed verification evidence, not peer review, approval, merge, Issue closure, or a GitHub Project transition.

| Item | Current evidence |
| --- | --- |
| Issue / branch | #29 / feat/29-authenticated-requester |
| Starting commit | 924995bde6897d08188a6cb21b176093199efeb6 |
| RED commit | 6f554cfca0246859a5d2c1bd5d155c23035f1d03 (`test(lab3): define authenticated requester experience`) |
| GREEN commit | 6361316e3bab1e00c056c30313c1ecf637f6e4c7 (`feat(lab3): implement authenticated requester`) |
| Audit-correction commits | Corrective RED fba93c41d6825e1ed0fbabff55b23526089da72d; corrective GREEN f739337; deterministic browser-verification follow-up fd93ae8; TypeScript test-signature follow-up 49c5c31; semantic-coverage RED 6dd78d4; creation-defaults GREEN 8fd1e16; password-boundary input stabilization 815155e; PR #30 requested-changes RED 25e7c24; GREEN 5043200; verification-coverage follow-up 9b249b4; independent-audit retry/focus RED af0df90; typed-exhaustion/UI GREEN c68aab3; serializable-entry compatibility follow-up 370e8e4; transaction-gate RED bad31ad; transaction-scoped GREEN 31cada3; final requester-regression RED e5ebe38; final requester-state GREEN e98d52c. These commits follow the original Issue #29 documentation commit 46a460f without rewriting prior history. |
| Implemented scope | Login and mandatory Change Password UI; authenticated role shell, bootstrap, expiry, logout, route protection, and cache clearing; complete removal of the Development Requester identity mechanism; authenticated Requester Ticket create/list/detail/query flows; role-aware Attachment access; Public Comments; Problem Appears Resolved without a formal status change; Unicode-consistent Change Password validation; and the authenticated Lab 1 Check System Online/category/Offline workflow |
| Corrective RED evidence | Six server files / 16 tests passed because the covered backend behavior already existed. The focused client run failed only the four intended missing cases: Unicode password categories, internal whitespace, authenticated Lab 1 Online, and authenticated Lab 1 Offline. |
| Focused GREEN verification | The latest semantic-coverage run passed 3 server files / 10 tests and 1 client file / 8 tests. `UNIT-08`, `API-08`, `SEC-04`, and `UI-04` now directly assert every behavior claimed by their matrix rows. |
| PR #30 RED evidence | The new server concurrency file failed all 10 cases for the intended stale-eligibility behavior, covering 20 operation/change permutations. The two focused client files ran 17 tests: 13 passed and the four intended missing conflict-reload, safe reload-failure, modal-accessibility, and later-page Comment behaviors failed. No RED failure was a syntax, setup, dependency, or unsafe-database error. |
| PR #30 focused GREEN evidence | The latest retry file and resolution UI file each passed 9 tests initially and in three additional consecutive runs. A combined 3-file server regression passed 61 tests: all 9 retry/cleanup cases, all 10 deterministic eligibility cases representing 20 operation/change/commit-order combinations, and all 42 retained Attachment cases including the concurrent fifth-file limit. Confirmed `40001` then success used 2 attempts; exhausted `40001` used 3; `40P01`, ambiguous `P2034`, and unrelated SQLSTATE each used 1. All five exhausted routes returned the exact safe `409 CONCURRENT_UPDATE` body with no retained database/history/storage effect. |
| Complete verification | Plain `npm test` passed 32 server files / 222 tests with no command-line or global timeout override; three measured migration cases retain explicit 30-second per-test limits. Plain client `npm test` passed 12 files / 98 tests. Eight Playwright scenarios passed (six retained Lab 2 and two Issue #29), both production builds passed, and the compiled-server health endpoint returned status `ok` before the process was terminated and port 31029 was confirmed closed. |
| Latest client-regression verification | RED produced exactly 3 intended failures with 18 existing focused tests passing. GREEN passed 2 focused files / 21 tests, 12 client files / 101 tests, 33 server files / 225 tests with ordinary commands and no timeout override, all 8 Playwright scenarios, and both production builds. Results were executed locally, not by hosted GitHub Actions. |
| Development database | Read-only before/after evidence for `toktickit/public` remained 5 DevelopmentRequester rows, 182 Tickets, 92 Attachments, 4 Categories, 7 Related Systems, 1 TicketNumberSequence row, and 3 migration-history rows; every table count and SHA-256 row-set checksum matched. |
| Database isolation and cleanup | Database tests used only validated `toktickit_test`; disposable Issue #29 schemas were removed, relevant test/smoke ports had no listeners, tracked generated screenshots were restored, and no temporary build or migration artifact was committed |
| Secrets and local configuration | `server/.env` remained ignored and outside every Issue #29 and corrective commit; committed-diff scans found no private credentials, password hashes, cookies, tokens, database URLs introduced by Issue #29, HMAC secrets, or private keys |
| Test-contract status | 13 assigned Test IDs are recorded as `Pass (Issue #29)`. API-16 is returned to `Planned` because its full contract includes later REOPENED clearing; SEC-01 and every later-increment obligation also remain `Planned`. The matrix totals are 75 = 16 Issue #27 Pass + 13 Issue #29 Pass + 46 Planned. |
| External state | RED `e5ebe38`, GREEN `e98d52c`, and documentation commit `dc8f397` were pushed in PR #30. Tanaboonnnnn re-reviewed exact HEAD `dc8f397`, confirmed all three client implementation blockers were fixed, and reported 0 Standards blockers and 1 Specification blocker for then-stale governance evidence. After that historical review event and its documentation correction, PR #30 was approved and merged into `lab3-staging` as `f8eb6029f74134ca245e896464f09af001e9e8c8`, and Issue #29 was closed as completed. |

The role destinations for IT Staff and Administrator are compatibility placeholders only. Issue #29 does not claim the later Staff workflow, Administrator workflow, final Requester-role conversion, or REOPENED-clearing implementation. The correction restores retained Lab 1 behavior without reviving any Development Requester mechanism.

The requested-changes verification used only the validated `toktickit_test` target for mutation. Read-only development evidence before and after remained exactly 92 Attachments, 4 Categories, 5 DevelopmentRequesters, 7 RelatedSystems, 182 Tickets, 1 TicketNumberSequence row, and 3 migration-history rows, with every previously recorded SHA-256 row-set checksum unchanged. Playwright-regenerated tracked Lab 2 screenshots were restored; build/test output was removed; no disposable Issue #27/Issue #29/Lab 3/E2E schema, verification listener, or repository Node process remained. This is execution evidence; the pushed state recorded above does not imply reviewer acceptance.

## 10. Issue #31 IT Staff Queue Handoff

This section records local execution evidence and supplied governance facts. PR #30 was approved and merged and Issue #29 was closed before Issue #31 began. The complete Issue #31 chain through `ef48d94` was pushed before this governance-sync record was created; no Issue #31 PR existed when the sync began.

| Item | Current evidence |
| --- | --- |
| Issue / branch | #31 / feat/31-it-staff-queue |
| Starting commit | f8eb6029f74134ca245e896464f09af001e9e8c8 |
| RED commit | d95abc1 (`test(lab3): define IT Staff queue`) |
| GREEN commit | 5e77396 (`feat(lab3): implement IT Staff queue`) |
| Initial evidence commit | 9c831d5 (`docs(lab3): record IT Staff queue evidence`) |
| Corrective RED / GREEN | `e84dc71` (`test(lab3): expose IT Staff queue contract gaps`) / `0bded01` (`fix(lab3): close IT Staff queue contract gaps`) |
| Implemented scope | Secure Staff/Administrator shared Queue; approved four-field search; Category, Related System, Requested Priority, IT Priority, status, and owner filters; business sorting; pagination; matching/unassigned/mine counts; exact safe Queue DTO; read-only active Staff/Admin assignee summaries; responsive table/cards and documented Queue states |
| Excluded scope preserved | No operational Ticket Detail, claim/assignment, IT Priority mutation, status transition, Internal Note workflow, Staff Attachment mutation, Administrator workflow, REOPENED clearing, E2E-03 workflow, or final responsive screenshot evidence was implemented |
| Focused verification | `UNIT-04`: 1 file / 18 tests; `API-09`: 1 file / 21 tests against validated `toktickit_test/public`; `UI-05`: 1 file / 10 tests. All passed. |
| Initial complete verification | Plain server `npm test`: 35 files / 264 tests; plain client `npm test`: 13 files / 111 tests; retained Lab 2 Playwright: 6 scenarios; server and client production builds: passed; compiled health smoke: passed, terminated, port 3199 closed |
| Later unfiltered Playwright follow-up | After the initial audit, the ordinary repository command discovered and passed all 8 existing scenarios in 3 specs: 6 Lab 2 plus the existing Lab 3 Authentication and authenticated Requester scenarios. This supplements rather than rewrites the earlier six-scenario event. |
| Corrective scope | OP-21 rejects unknown/repeated query parameters; terminal historical Requester ownership remains visible and safely summarized without assignee eligibility; Ticket Numbers link to the later Detail route; the accessible Queue heading, status, inert skeleton, and disabled dependent controls persist during loading |
| Corrective focused verification | `UNIT-04` + `API-09`: 2 files / 42 tests; `UI-05`: 1 file / 11 tests. All passed against the validated test configuration. |
| Corrective complete verification | Plain server `npm test`: 35 files / 267 tests; plain client `npm test`: 13 files / 112 tests; ordinary unfiltered Playwright: 8 scenarios in 3 specs; both production builds and compiled health smoke: passed; smoke process terminated and port 3199 closed |
| PR #32 review event | On 2026-09-26, PR #32 returned Requested Changes at reviewed HEAD `4f68765` for literal Queue search, the missing table caption, mobile badge parity, and the PR description's use of title instead of Summary. This records that review event without asserting a later hosted review outcome. |
| PR #32 correction commits | Tests-only RED `09bc991` (`test(lab3): expose staff queue review gaps`) and GREEN `5f878f1` (`fix(lab3): resolve staff queue review blockers`) form a direct chain after reviewed HEAD `4f68765`; the documentation commit containing this record follows them. |
| PR #32 RED evidence | Focused server RED: 2 files / 48 tests, with 42 retained passes and six intended failures (five absent-helper cases and one wildcard-expanded database result). Focused client RED: 1 file / 11 tests, with nine retained passes and two parameterized missing-caption failures; the committed cases also assert the statically confirmed missing mobile badges. No failure came from syntax, dependencies, environment, unsafe database selection, or invalid setup. |
| PR #32 focused GREEN | `UNIT-04` + `API-09`: 2 files / 48 tests; `UI-05`: 1 file / 11 tests. Literal percent, underscore, backslash, and combined patterns; four search fields; safe authorization/DTO/no-mutation behavior; actual caption; and scoped mobile badge semantics all passed. |
| PR #32 complete local verification | Plain server `npm test`: 35 files / 273 tests; plain client `npm test`: 13 files / 112 tests; ordinary unfiltered Playwright: 8 scenarios in 3 specs; both production builds: passed; compiled health smoke: `ok`, process terminated, port 3199 closed. These are local results, not hosted CI. |
| Development database | Read-only before/after evidence remained Lab 2 with 5 Development Requesters, 182 Tickets, 92 Attachments, 4 Categories, and 7 Related Systems; 182 NEW status total and all three SHA-256 row-set checksums matched exactly |
| Cleanup and secrets | Regenerated tracked Lab 2 screenshots were restored; generated build/test output and the temporary read-only snapshot helper were removed; `server/.env` remained ignored and outside commits; no private value was printed or recorded |
| Test-contract status | `UNIT-04`, `API-09`, and `UI-05` are `Pass (Issue #31)`. Totals are 75 = 16 Issue #27 Pass + 13 Issue #29 Pass + 3 Issue #31 Pass + 43 Planned. `API-10`, `SEC-01`, `SEC-02`, and `E2E-03` remain Planned. |
| Prior completed governance | PR #30 was approved and merged into `lab3-staging` as `f8eb6029f74134ca245e896464f09af001e9e8c8`; Issue #29 was closed as completed. |
| Issue #31 external state | The complete chain through corrective RED `e84dc71`, GREEN `0bded01`, and evidence commit `ef48d94` was pushed before this governance-sync record was created. No Issue #31 PR existed when the sync began. No hosted CI, review, approval, merge, Issue #31 closure, or Project Done transition is claimed. GitHub is authoritative for events occurring after this recorded state. |

The PR #32 correction record claims no hosted CI, approval, merge, Issue #31 closure, resolved review thread, or Project Done transition. It does not assert whether the new correction chain is later pushed or re-reviewed; GitHub is authoritative for events after this dated record.

## 11. Issue #33 IT Staff Workflow Handoff

This section records locally executed implementation and verification evidence. It is not peer review, hosted CI, approval, merge, Issue closure, or a GitHub Project transition. No push or other GitHub action was performed for Issue #33.

| Item | Current evidence |
| --- | --- |
| Issue / branch | #33 / `feat/33-it-staff-workflow` |
| Starting commit | `774a0c006b9553d9255529b5db46878a4148f3a0` |
| RED commit | `5c48e6383223bf2d26dcc8473388bf8f2daaa308` (`test(lab3): define IT Staff operational workflow`) |
| GREEN commit | `46a21cc5f8957d76cbcc02eddcec38772007e34c` (`feat(lab3): implement IT Staff operational workflow`) |
| RED evidence | Focused server: 7 files / 23 tests, with 18 intended failures and 5 retained passes. Focused client: 3 files / 9 tests, all 9 failed for the missing operational Detail UI. The browser flow reached the Queue/Detail boundary and failed at the missing operational heading after its own test-order race was corrected. No RED failure came from syntax, dependencies, unsafe database targeting, or invalid setup. |
| Implemented scope | Staff/Administrator operational Ticket Detail; eligible-assignee read; claim, assign, reassign, unassign, IT Priority, and status transitions; exact owner and transition eligibility; Public Comments and Internal Notes; Staff read-only Attachment access; Requester-resolution clearing on REOPENED; safe conflict reloads; accessible dialogs, focus, pagination, validation, and inert rendering |
| Transaction and authorization boundary | Every operational mutation reuses the existing SERIALIZABLE, transaction-scoped gate and User-before-Ticket revalidation protocol. Backend session role is authoritative; Requesters cannot access Staff Detail or Internal Notes, and Staff/Administrators do not receive Requester Attachment upload/removal authority. Safe errors do not expose protected resource or database details. |
| Excluded scope preserved | No Administrator user-management workflow, Staff Attachment mutation, final responsive screenshot evidence, schema/migration/seed/dependency change, or unrelated feature was added |
| Focused GREEN verification | Server: 7 files / 23 tests. Client: 3 files / 9 tests. All passed against the validated test configuration. |
| Complete verification | Plain server `npm test`: 40 files / 291 tests with no command-line timeout override. Plain client `npm test`: 16 files / 121 tests. Ordinary unfiltered Playwright: all 9 scenarios passed, comprising the 6 retained Lab 2 scenarios, the existing Authentication and authenticated Requester scenarios, and the new Staff operational workflow scenario. Server and client production builds passed. |
| Health smoke | The compiled server health endpoint on port 31933 returned the exact expected `ok` service response. The process was terminated and the port was confirmed closed. |
| Development database | Read-only before/after evidence for `toktickit/public` matched exactly: 92 Attachments, 4 Categories, 5 Development Requesters, 7 Related Systems, 182 Tickets, and 1 TicketNumberSequence row. Every recorded SHA-256 row-set checksum was unchanged. |
| Database isolation and cleanup | Mutation-based tests used only validated `toktickit_test`. The disposable Playwright schema was dropped, regenerated tracked Lab 2 screenshots were restored, generated build/test output and temporary helpers were removed, and no test process or verification listener remained. |
| Secrets and local configuration | `server/.env` remained ignored and outside every Issue #33 commit. Committed-diff scans found no private credentials, password hashes, cookies, tokens, database URLs, HMAC secrets, private keys, or environment files introduced by Issue #33. |
| Test-contract status | `UNIT-05`, `UNIT-06`, `API-10`, `API-11`, `API-12`, `API-13`, `API-15`, `API-16`, `UI-06`, `UI-07`, `UI-08`, and `E2E-03` are `Pass (Issue #33)`. Totals are 75 = 16 Issue #27 Pass + 13 Issue #29 Pass + 3 Issue #31 Pass + 12 Issue #33 Pass + 31 Planned. All 61 Acceptance Criteria remain traced. |
| External state | No Issue #33 push, pull request, hosted CI run, review, approval, merge, Issue #33 closure, review-thread resolution, or Project Done transition is claimed. GitHub is authoritative for subsequent external events. |
