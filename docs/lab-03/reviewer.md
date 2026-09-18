# Lab 3 Peer Review Record

## 1. Purpose

This file records only review and governance events supported by repository or GitHub evidence. It does not treat specification drafting, automated checks, or AI assistance as peer approval.

## 2. Current Status

| Item | Value |
| --- | --- |
| Engineering-contract Issue | #25 |
| Source branch | docs/lab3-engineering-contract |
| Intended PR target | lab3-staging |
| Reviewed commit | f77339c635145286e20c1efc21c83183a5381aa2 |
| Pull Request | #26 — docs(lab3): define sprint 3 engineering contract |
| Peer reviewer | Chxtamos |
| Review status | Requested Changes |
| Review comments | Four blocker categories recorded below |
| Corrective commit | Follow-up commit containing this response; immutable hash is reported from Git after creation because a commit cannot contain its own hash |
| Re-review | Pending; not requested during this correction |
| Approval | Not granted |
| Merge | Not performed |
| Issue closure | Not performed |
| GitHub Project status change | Not performed |

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
- [ ] Every AC maps to at least one Planned test and no test is prematurely marked Pass.
- [ ] UI states, responsive widths, accessibility, and Zen Green rules are complete.
- [ ] API request/response shapes, statuses, validation limits, conflicts, and safe failures are internally consistent.
- [ ] Product Definition of Done is testable and does not claim future evidence.

## 4. Findings and Responses

PR #26 has one requested-changes review from Chxtamos. The response column records documentation changes made locally; it does not claim that a conversation was resolved or that the reviewer accepted the response.

| Date | Reviewer | Location | Finding | Response / Commit | Status |
| --- | --- | --- | --- | --- | --- |
| 2026-09-18 | Chxtamos | PR #26 requested-changes review, Blocker 1 | Migrated Lab 2 statuses, ownerId=null, and the owner invariant were contradictory. | Added the complete seven-status table, null-owner migration/postflight policy, unassigned Queue/Claim behavior, ACs, and Planned migration/API tests in the corrective follow-up commit containing this row. | Addressed locally; re-review pending |
| 2026-09-18 | Chxtamos | PR #26 requested-changes review, Blocker 2 | Assignment and Administrator deactivation/demotion races lacked one lock/transaction protocol and final-state tests. | Added SERIALIZABLE User-before-Ticket locks, ascending ids, bounded 40001 retry, deterministic race outcomes, safe conflicts, and Planned database-state race tests in the corrective follow-up commit containing this row. | Addressed locally; re-review pending |
| 2026-09-18 | Chxtamos | PR #26 requested-changes review, Blocker 3 | Login could create a session without an exact Origin contract. | Added required exact Login Origin validation, ORIGIN_REQUIRED/ORIGIN_FORBIDDEN, no Referer/partial match, no rejected session, UI behavior, AC, and Planned tests in the corrective follow-up commit containing this row. | Addressed locally; re-review pending |
| 2026-09-18 | Chxtamos | PR #26 requested-changes review, Blocker 4 | Responsive evidence used width breakpoints instead of exact reproducible dimensions. | Separated CSS breakpoints from 390 x 844, 834 x 1112, 1440 x 900, and 200% zoom evidence; specified all six screens, exact paths/assertions, ACs, and Planned tests in the corrective follow-up commit containing this row. | Addressed locally; re-review pending |

## 5. Approval Record

No approval, conversation resolution, re-review, merge, release, Issue closure, Done transition, or completion is claimed. This section must be updated only from later actual Pull Request evidence.

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
| GREEN commit | Authorized after final staged scope and secret checks; the exact local commit hash is reported from Git after creation rather than embedded in its own content |
| Peer review / approval | Pending; neither performed nor claimed |

One earlier verification command reached `toktickit_test/public` because its custom Vitest configuration flag was parsed incorrectly. The migration SQL failed and rolled back transactionally before tests ran, and the exact failed Prisma metadata entry was marked rolled back using the documented recovery action. After private mappings were supplied, the guarded migration later applied successfully to that validated shared test target. All disposable `issue27_*` schemas were removed after their runs; no development database mutation occurred.

## 7. PR #28 Requested-Changes Record

This section records the actual local response to the requested-changes review. It does not claim that the reviewer accepted the correction or that any GitHub review state changed.

| Item | Current evidence |
| --- | --- |
| Pull Request | #28 |
| Related implementation Issue | #27 |
| Reviewer | Tanaboonnnnn |
| Review status | Requested Changes |
| Reviewed HEAD | e74334a62cbbd92ba2a1a105ebc912b51a764bb1 |
| Finding | `recordFailedLogin()` used an unlocked read followed by a separate upsert, so two simultaneous failures for one normalized-email/IP key could both read count 3 and overwrite each other with count 4 instead of reaching count 5 and starting the required block. |
| RED concurrency-test commit | 0fc0cd373ffa596276875aa1376ecb69561c5ba8 (`test(auth): cover concurrent login failures`) |
| GREEN atomic-throttle commit | 0e606ac2cc9d52583db6bca0d4b95978dd3581e6 (`fix(auth): serialize failed-login updates`) |
| Correction | A single PostgreSQL `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING` statement now calculates and commits the same-key count, active-window reset, and block deadline atomically at the unique throttle row. |
| Regression coverage | A database lock barrier deterministically overlaps two real failed-login requests from stored count 3; the test asserts count 5, one throttle row, a valid 15-minute block, a safe following 429, an unchanged independent key, and redacted response bodies. |
| Verification after correction | The focused concurrency case passed six consecutive runs; 73 focused Issue #27 tests, 185 server tests, 58 client tests, and six existing Lab 2 Playwright scenarios passed. Server/client production builds and the compiled health smoke passed, the smoke listener terminated, test sessions/throttles and disposable schemas were absent, and development counts/checksums remained unchanged. |
| Re-review | Pending; not requested by this local correction |
| Approval / resolution / merge / Issue closure | Not claimed or performed |

The corrective commits remain local. No push, force-push, review-thread resolution, re-review request, approval, merge, Issue closure, or GitHub Project status change was performed.
