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

This section records the current PR #30 review and the local correction. It does not claim remote visibility or reviewer acceptance of the local commits.

| Item | Current evidence |
| --- | --- |
| Pull Request / Issue | PR #30 / Issue #29 |
| Base / source branch | `lab3-staging` / `feat/29-authenticated-requester` |
| Reviewed HEAD | `1bf936af18518e4f1e5e9ad111d40cb7fc0cac3e` |
| Reviewer / review status | cottonlnwza / Requested Changes |
| Findings | Atomic current-role eligibility for Requester mutations; authoritative Ticket reload after resolution conflict; modal keyboard/focus behavior; newly created Public Comment pagination; truthful governance evidence |
| Corrective RED | `25e7c244ae83b30cd60ce2e7c43a5caebba26165` (`test(lab3): expose requested changes regressions`) |
| Corrective GREEN | `5043200` (`fix(lab3): resolve requester review blockers`) |
| Verification-coverage follow-up | `9b249b4` (`test(lab3): preserve verification coverage`) |
| Commit visibility | The corrective commits are local and pending push/re-review; no reviewer acceptance is claimed |
| Current external state | No approval, merge, Issue #29 closure, review-thread resolution, re-review request, or GitHub Project transition occurred during this correction |

The RED server file deterministically covered Ticket creation, Public Comment creation, resolution indication, Attachment upload, and Attachment removal against both deactivation and role change in both meaningful commit orders. The RED client run exposed the four intended conflict-reload, reload-failure, modal-accessibility, and later-page Comment cases. GREEN uses the contract's SERIALIZABLE User-before-Ticket lock protocol and safe eligibility conflict; the client now reloads authoritative conflict state, implements modal focus containment/dismissal rules, and renders the server-created Comment on its authoritative final page. This documentation sync itself performs no GitHub action.

## 9. Issue #29 Implementation Handoff

This is implementation and locally executed verification evidence, not peer review, approval, merge, Issue closure, or a GitHub Project transition.

| Item | Current evidence |
| --- | --- |
| Issue / branch | #29 / feat/29-authenticated-requester |
| Starting commit | 924995bde6897d08188a6cb21b176093199efeb6 |
| RED commit | 6f554cfca0246859a5d2c1bd5d155c23035f1d03 (`test(lab3): define authenticated requester experience`) |
| GREEN commit | 6361316e3bab1e00c056c30313c1ecf637f6e4c7 (`feat(lab3): implement authenticated requester`) |
| Audit-correction commits | Corrective RED fba93c41d6825e1ed0fbabff55b23526089da72d; corrective GREEN f739337; deterministic browser-verification follow-up fd93ae8; TypeScript test-signature follow-up 49c5c31; semantic-coverage RED 6dd78d4; creation-defaults GREEN 8fd1e16; password-boundary input stabilization 815155e; PR #30 requested-changes RED 25e7c24; GREEN 5043200; verification-coverage follow-up 9b249b4. These commits follow the original Issue #29 documentation commit 46a460f without rewriting prior history. |
| Implemented scope | Login and mandatory Change Password UI; authenticated role shell, bootstrap, expiry, logout, route protection, and cache clearing; complete removal of the Development Requester identity mechanism; authenticated Requester Ticket create/list/detail/query flows; role-aware Attachment access; Public Comments; Problem Appears Resolved without a formal status change; Unicode-consistent Change Password validation; and the authenticated Lab 1 Check System Online/category/Offline workflow |
| Corrective RED evidence | Six server files / 16 tests passed because the covered backend behavior already existed. The focused client run failed only the four intended missing cases: Unicode password categories, internal whitespace, authenticated Lab 1 Online, and authenticated Lab 1 Offline. |
| Focused GREEN verification | The latest semantic-coverage run passed 3 server files / 10 tests and 1 client file / 8 tests. `UNIT-08`, `API-08`, `SEC-04`, and `UI-04` now directly assert every behavior claimed by their matrix rows. |
| PR #30 RED evidence | The new server concurrency file failed all 10 cases for the intended stale-eligibility behavior, covering 20 operation/change permutations. The two focused client files ran 17 tests: 13 passed and the four intended missing conflict-reload, safe reload-failure, modal-accessibility, and later-page Comment behaviors failed. No RED failure was a syntax, setup, dependency, or unsafe-database error. |
| PR #30 focused GREEN evidence | Five server files / 21 tests and two client files / 17 tests passed. The 10-test deterministic concurrency file passed the initial GREEN run and three additional consecutive stress runs after the combined focused run, with no timing sleep used to establish commit order. |
| Complete verification | Plain `npm test` passed 31 server files / 213 tests with no command-line or global timeout override; three measured migration cases have explicit 30-second per-test limits. Plain client `npm test` passed 12 files / 97 tests. Eight Playwright scenarios passed (six retained Lab 2 and two Issue #29), both production builds passed, and the compiled-server health endpoint returned status `ok` before the process was terminated and port 3187 was confirmed closed. |
| Development database | Read-only before/after evidence for `toktickit/public` remained 5 DevelopmentRequester rows, 182 Tickets, 92 Attachments, 4 Categories, 7 Related Systems, 1 TicketNumberSequence row, and 3 migration-history rows; every table count and SHA-256 row-set checksum matched. |
| Database isolation and cleanup | Database tests used only validated `toktickit_test`; disposable Issue #29 schemas were removed, relevant test/smoke ports had no listeners, tracked generated screenshots were restored, and no temporary build or migration artifact was committed |
| Secrets and local configuration | `server/.env` remained ignored and outside every Issue #29 and corrective commit; committed-diff scans found no private credentials, password hashes, cookies, tokens, database URLs introduced by Issue #29, HMAC secrets, or private keys |
| Test-contract status | 13 assigned Test IDs are recorded as `Pass (Issue #29)`. API-16 is returned to `Planned` because its full contract includes later REOPENED clearing; SEC-01 and every later-increment obligation also remain `Planned`. The matrix totals are 75 = 16 Issue #27 Pass + 13 Issue #29 Pass + 46 Planned. |
| External state | PR #30 and its Requested Changes review pre-existed this correction. No corrective commit was pushed, no re-review was requested, and no approval, merge, Issue #29 closure, review-thread resolution, or GitHub Project change was performed or claimed. |

The role destinations for IT Staff and Administrator are compatibility placeholders only. Issue #29 does not claim the later Staff workflow, Administrator workflow, final Requester-role conversion, or REOPENED-clearing implementation. The correction restores retained Lab 1 behavior without reviving any Development Requester mechanism.

The requested-changes verification used only the validated `toktickit_test` target for mutation. Read-only development evidence before and after remained exactly 92 Attachments, 4 Categories, 5 DevelopmentRequesters, 7 RelatedSystems, 182 Tickets, 1 TicketNumberSequence row, and 3 migration-history rows, with every previously recorded SHA-256 row-set checksum unchanged. Playwright-regenerated tracked Lab 2 screenshots were restored; build/test output was removed; no disposable Issue #27/Issue #29/Lab 3/E2E schema, verification listener, or repository Node process remained. This is local implementation evidence only and makes no new GitHub-state claim.
