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
| PR #28 governance | Requested Changes; Project status Fixing; Issue #27 open; re-review not requested |

One earlier verification command reached `toktickit_test/public` because its custom Vitest configuration flag was parsed incorrectly. The migration SQL failed and rolled back transactionally before tests ran, and the exact failed Prisma metadata entry was marked rolled back using the documented recovery action. After private mappings were supplied, the guarded migration later applied successfully to that validated shared test target. All disposable `issue27_*` schemas were removed after their runs; no development database mutation occurred.

## 7. PR #28 Requested-Changes Record

This section records the corrective commits now pushed and visible in PR #28 together with the current review and Project state. It does not claim that the reviewer accepted the correction.

| Item | Current evidence |
| --- | --- |
| Pull Request | #28 |
| Related implementation Issue | #27 |
| Reviewer | Tanaboonnnnn |
| Review status | Requested Changes |
| GitHub Project status | Fixing |
| Issue #27 | Open |
| Reviewed HEAD | e74334a62cbbd92ba2a1a105ebc912b51a764bb1 |
| Finding | `recordFailedLogin()` used an unlocked read followed by a separate upsert, so two simultaneous failures for one normalized-email/IP key could both read count 3 and overwrite each other with count 4 instead of reaching count 5 and starting the required block. |
| RED concurrency-test commit | 0fc0cd373ffa596276875aa1376ecb69561c5ba8 (`test(auth): cover concurrent login failures`) |
| GREEN atomic-throttle commit | 0e606ac2cc9d52583db6bca0d4b95978dd3581e6 (`fix(auth): serialize failed-login updates`) |
| Documentation-evidence commit | 268eb53a6935528aee005ef9ec8cc54c53cf2cbe (`docs(lab3): record throttle concurrency review`) |
| Commit visibility | The implementation and corrective commits through `268eb53` are pushed and visible in PR #28. The containing governance-sync commit is identified by Git history. |
| Correction | A single PostgreSQL `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING` statement now calculates and commits the same-key count, active-window reset, and block deadline atomically at the unique throttle row. |
| Regression coverage | A database lock barrier deterministically overlaps two real failed-login requests from stored count 3; the test asserts count 5, one throttle row, a valid 15-minute block, a safe following 429, an unchanged independent key, and redacted response bodies. |
| Verification after correction | The focused concurrency case passed six consecutive runs; 73 focused Issue #27 tests, 185 server tests, 58 client tests, and six existing Lab 2 Playwright scenarios passed. Server/client production builds and the compiled health smoke passed, the smoke listener terminated, test sessions/throttles and disposable schemas were absent, and development counts/checksums remained unchanged. |
| Re-review | Pending and not requested |
| Review thread | No inline review thread exists; the submitted `Changes Requested` review remains active. |
| Approval / merge / Issue #27 closure / Done transition | None occurred |

The three corrective commits listed above are pushed and visible in PR #28. This documentation sync performs no GitHub action: it does not request re-review, resolve a review thread, approve or merge the PR, close Issue #27, or move the Project item from Fixing to Done.

## 8. PR #28 Description Replacement

Replace the implementation-evidence section of the PR #28 description with the following text. Applying it on GitHub is outside this documentation-only task.

```markdown
## Issue #27 authentication foundation

Closes #27

### Key commits

- Initial RED: `22ce542`
- Initial GREEN: `e74334a`
- Concurrency RED: `0fc0cd3`
- Concurrency GREEN: `0e606ac`
- Documentation evidence: `268eb53`
- Governance evidence sync: `8f370d6`

### Verification

- Focused Issue #27: 11 files, 73 tests
- Complete server: 24 files, 185 tests
- Client: 8 files, 58 tests
- Lab 2 Playwright: 6 scenarios

The failed-login update is atomic at the PostgreSQL database level. A deterministic concurrency regression verifies that simultaneous same-key failures cannot overwrite each other and that the threshold establishes the required block.

Peer re-review pending.
```

## 9. Issue #29 Implementation Handoff

This is implementation and locally executed verification evidence, not peer review, approval, merge, Issue closure, or a GitHub Project transition.

| Item | Current evidence |
| --- | --- |
| Issue / branch | #29 / feat/29-authenticated-requester |
| Starting commit | 924995bde6897d08188a6cb21b176093199efeb6 |
| RED commit | 6f554cfca0246859a5d2c1bd5d155c23035f1d03 (`test(lab3): define authenticated requester experience`) |
| GREEN commit | 6361316e3bab1e00c056c30313c1ecf637f6e4c7 (`feat(lab3): implement authenticated requester`) |
| Audit-correction commits | Corrective RED fba93c41d6825e1ed0fbabff55b23526089da72d; corrective GREEN f739337; deterministic browser-verification follow-up fd93ae8; TypeScript test-signature follow-up 49c5c31. These commits follow the original Issue #29 documentation commit 46a460f without rewriting prior history. |
| Implemented scope | Login and mandatory Change Password UI; authenticated role shell, bootstrap, expiry, logout, route protection, and cache clearing; complete removal of the Development Requester identity mechanism; authenticated Requester Ticket create/list/detail/query flows; role-aware Attachment access; Public Comments; Problem Appears Resolved without a formal status change; Unicode-consistent Change Password validation; and the authenticated Lab 1 Check System Online/category/Offline workflow |
| Corrective RED evidence | Six server files / 16 tests passed because the covered backend behavior already existed. The focused client run failed only the four intended missing cases: Unicode password categories, internal whitespace, authenticated Lab 1 Online, and authenticated Lab 1 Offline. |
| Focused GREEN verification | Seven server files / 20 tests passed, including the two migration tests under their narrow explicit limits; five client files / 37 tests passed after the corrections. |
| Complete verification | Plain `npm test` passed 30 server files / 201 tests with no CLI or global timeout override; only the two known migration cases have explicit 30-second per-test limits. Plain client `npm test` passed 12 files / 91 tests. Eight Playwright scenarios passed (six retained Lab 2 and two Issue #29), both production builds passed, and the compiled-server health endpoint returned HTTP 200 before the process was terminated and port 3199 was confirmed closed. |
| Development database | Read-only before/after evidence for `toktickit/public` remained 5 DevelopmentRequester rows, 182 Tickets, 92 Attachments, 4 Categories, 7 Related Systems, 1 TicketNumberSequence row, and 3 migration-history rows; every table count and SHA-256 row-set checksum matched. |
| Database isolation and cleanup | Database tests used only validated `toktickit_test`; disposable Issue #29 schemas were removed, relevant test/smoke ports had no listeners, tracked generated screenshots were restored, and no temporary build or migration artifact was committed |
| Secrets and local configuration | `server/.env` remained ignored and outside every Issue #29 and corrective commit; committed-diff scans found no private credentials, password hashes, cookies, tokens, database URLs introduced by Issue #29, HMAC secrets, or private keys |
| Test-contract status | 13 assigned Test IDs are recorded as `Pass (Issue #29)`. API-16 is returned to `Planned` because its full contract includes later REOPENED clearing; SEC-01 and every later-increment obligation also remain `Planned`. The matrix totals are 75 = 16 Issue #27 Pass + 13 Issue #29 Pass + 46 Planned. |
| External state | No push, pull request, review, approval, merge, Issue #29 closure, or GitHub Project change was performed or claimed |

The role destinations for IT Staff and Administrator are compatibility placeholders only. Issue #29 does not claim the later Staff workflow, Administrator workflow, final Requester-role conversion, or REOPENED-clearing implementation. The correction restores retained Lab 1 behavior without reviving any Development Requester mechanism.
