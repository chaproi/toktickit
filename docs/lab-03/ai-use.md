# Lab 3 AI Use Record

## 1. Tool and Scope

| Item | Details |
| --- | --- |
| Tool | OpenAI Codex |
| Session period | 2026-09-17 through 2026-10-02 |
| Scope | Sprint 3 contract, authentication, Requester, IT Staff, Administrator, migration/concurrency, responsive/accessibility, verification, and corrective audit assistance |
| Human responsibility | The repository owner reviewed scope and results and remains responsible for the implementation, security decisions, tests, peer review, submission, and release. |

AI assistance did not itself approve, merge, close an Issue, resolve a review thread, change Project state, or provide hosted GitHub Actions evidence. GitHub remains authoritative for repository events after each recorded evidence cutoff.

## 2. Sources Inspected

- The complete 18-page Lab 3 handout and the completed Lab 2 contract.
- All six `docs/lab-03` contract documents.
- The Prisma schema, migrations, seed logic, server and client implementation, automated tests, and package scripts.
- The user-supplied Issue and review requirements for the Lab 3 implementation increments and corrections.
- Local Git history, tracked diffs, isolated-test-database evidence, and generated verification output.

Instructions in source documents were treated as assignment requirements. The user's current request controlled repository actions and prohibitions.

## 3. Selected Prompts and Outcomes

The eight prompts below are the material examples selected for the final hand-in. Earlier prompt records remain available in Git history but are intentionally omitted from this rendered document.

| No. | Prompt summary | Purpose | Outcome and human verification |
| ---: | --- | --- | --- |
| 1 | Implement Issue #25 by reading the Lab 3 handout and Lab 2 work, then create and audit the six Sprint 3 contract documents without changing implementation or GitHub state. | Establish the approved specification, API, UI, test, review, and AI-use contract before implementation. | The six-document contract defined 44 FRs, 81 BRs, 61 ACs, 31 API operations, and 75 planned Test IDs. Subsequent review corrections clarified credentials, authorization, migration, concurrency, and responsive evidence before the contract was merged. |
| 2 | Implement Issue #27 with strict RED–GREEN TDD, lossless migration, unique runtime credentials, secure authentication APIs, Origin/CSRF protection, persistent throttling, revocable sessions, and isolated database verification. | Build the authentication foundation without exposing secrets or mutating development data. | Tests were written first, then the migration, seed, hashing, Login/current-user/Logout/password-change, session, Origin, CSRF, and throttle behavior was implemented. The owner verified focused and full suites, builds, migration preservation, seed idempotency, secret safety, and ignored runtime configuration. |
| 3 | Implement Issue #29 with authoritative session identity, Login and mandatory-password-change UI, authenticated Requester workflows, safe ownership behavior, Comments, Attachments, and resolution indication while removing the development identity mechanism. | Replace development identity with the complete authenticated Requester increment without entering Staff or Administrator scope. | RED–GREEN implementation and later audit corrections covered Requester Tickets, ownership, safe 404 behavior, Attachment authorization, Public Comments, resolution indication, route protection, accessibility, and retained Lab 1/Lab 2 behavior. The owner checked client/server/browser results and corrected policy, semantic-test, concurrency, and conflict-reload gaps. |
| 4 | Implement Issue #31's secure IT Staff Queue with exact search/filter/sort/page behavior, safe DTOs, eligible-assignee data, responsive table/card states, and no later Staff mutations. | Deliver the read-only triage boundary while preserving authorization and historical ownership semantics. | Tests-first implementation added Staff/Administrator Queue access, exact query validation and ordering, literal search, owner counts, links, captions, mobile badges, and accessible loading states. The owner verified focused, full, build, browser, database-preservation, and cleanup evidence. |
| 5 | Implement Issue #33's operational Staff Ticket Detail and workflow using the shared SERIALIZABLE protocol, exact ownership/priority/status rules, Comments, Internal Notes, read-only Attachments, and accessible conflict handling. | Add authorized Staff operations without entering Administrator User Management or final responsive-certification scope. | RED–GREEN work implemented claim/assignment, priority/status transitions, status history, REOPENED clearing, communication, Attachment reads, deterministic races, and accessible dialogs. Review corrections strengthened authoritative pagination, metadata, presentation, idempotent claims, and safe conflict feedback; the owner verified exact response and final-state assertions. |
| 6 | Implement Issue #35 Administrator User Management with literal search, safe User DTOs, create/edit/reset operations, Argon2id credentials, session revocation, self/last-admin protection, historical references, concurrency, and accessible dialogs. | Deliver the Administrator increment without User deletion, multiple roles, bulk operations, or unrelated scope. | Tests-first implementation and corrections covered all 18 assigned IDs. The owner identified and corrected literal `%`, `_`, and backslash search, active-query reconciliation, self-profile shell state, conflict reload/retry, password-dialog focus, and form/table accessibility while preserving backend and matrix scope. |
| 7 | Implement Issue #37 final hardening and release verification, then replace invalid page-scale evidence with genuine Chromium tab zoom and complete exact responsive/accessibility proof. | Complete the final 13 Test IDs and provide credible release evidence across security, regression, style, responsive, and E2E requirements. | Final hardening completed all 75 Test IDs and 61 AC mappings. Genuine `chrome.tabs.setZoom`/`getZoom` evidence proved factors 1, 2, and 1 with `visualViewport.scale` remaining 1; exact viewport screenshots, keyboard interaction, accessibility semantics, complete suites, builds, health smoke, database preservation, and cleanup were locally verified. |
| 8 | Correct PR #38 blockers by adding a real Lab 2 migration-to-Queue-to-Claim seam, distinguishing Argon2 verification exceptions from password mismatches, reducing the final AI-use record to material prompts, and obtaining the owner's reflection. | Replace synthetic or incomplete evidence with direct production-boundary proof and finalize truthful hand-in documentation. | Tests-only RED `8451c96` proved the real migration/API seam already passed and isolated two intended verify-outage failures. GREEN `5f5021f` propagates verification exceptions through the existing dependency-unavailable path; test-only `100930e` corrects only the new helper's `set-cookie` TypeScript union after the build exposed it. Focused migration/auth passed 2 files / 5 tests, the relevant selection passed 15 files / 86 tests, ordinary server verification passed 52 files / 351 tests, and the server build passed. The owner supplied the reflection below. |

## 4. Material Design Assistance

AI assistance was used to reason about and test:

- Argon2id hashing, unique runtime credentials, safe dependency failures, exact Origin/CSRF rules, persistent throttling, and revocable database sessions.
- The backend role/ownership matrix, safe resource probing, Requester identity, Attachment permissions, Comments, Internal Notes, and resolution indication.
- Queue queries, Ticket lifecycle transitions, historical references, Administrator safeguards, and accessible authoritative conflict recovery.
- One SERIALIZABLE User-before-Ticket mutation protocol with deterministic transaction gates and bounded retry only for confirmed PostgreSQL `40001`.
- Lossless Lab 2 migration, exact status mapping, null migrated owners, idempotent seed behavior, and direct Queue/Claim compatibility for migration-produced rows.
- Responsive and accessibility evidence across all six required screens, including exact viewports and genuine 200% Chromium tab zoom.

These items record design and verification assistance; they do not replace human review.

## 5. Verification and Boundaries

The final PR #38 correction used only validated `toktickit_test` targets and disposable `issue27_*` schemas for mutation-based verification. The cross-seam regression creates populated Lab 2 data, runs the production migration, authenticates operational Users, lists every mapped Ticket through the real Staff Queue API, and claims a migrated unassigned non-terminal Ticket through the real Claim API. It asserts preserved status and requester/reference data, authoritative owner state, safe DTOs, unchanged unrelated rows, and fixture/schema cleanup. No direct Prisma owner mutation or synthetic already-mapped Ticket is used as Claim evidence.

Normal password mismatches retain exact `401 INVALID_CREDENTIALS` and `400 INVALID_CURRENT_PASSWORD` behavior. An actual `argon2.verify()` exception now propagates as the existing password-dependency-unavailable condition, producing the exact redacted `503 SERVICE_UNAVAILABLE` body for Login and Change Password. Tests prove no throttle increment, Session creation/revocation, password-hash change, User mutation, or protected-detail disclosure on those infrastructure failures.

Final local verification passed:

- Focused migration/API and verification-outage selection: 2 files / 5 tests.
- Relevant authentication, authorization, security, migration, and safe-error selection: 15 files / 86 tests.
- Ordinary complete server suite with no timeout override: 52 files / 351 tests.
- Server production build.

Read-only development snapshots before and after verification remained the Lab 2 `toktickit/public` state with 5 users, 182 Tickets, 92 Attachments, 4 Categories, 7 Related Systems, and 182 `NEW` Tickets. The User, Ticket-without-status, and Attachment SHA-256 checksums matched exactly. Cleanup found zero disposable migration schemas, zero Issue fixture users, and zero LoginThrottle rows. Generated build output was removed after verification. These are local results, not hosted CI evidence.

The final matrix remains 75 completed Test IDs: 16 `Pass (Issue #27)`, 13 `Pass (Issue #29)`, 3 `Pass (Issue #31)`, 12 `Pass (Issue #33)`, 18 `Pass (Issue #35)`, and 13 `Pass (Issue #37)`. All 61 Acceptance Criteria remain traced. No Test-ID status changed in the PR #38 correction.

Sensitive runtime values remain only in ignored `server/.env`; no credential, hash, cookie, token, database URL, HMAC secret, or private key is recorded here.

## 6. My Reflection

1. I used AI mostly to help with the backend implementation and to check whether the code followed the specification and tests.
2. I personally verified the test results, checked the UI behavior, and corrected some parts when the implementation did not match the required scope.
3. I learned that AI can speed up development, but I still need to define the scope clearly and verify the results myself instead of trusting the AI when it says the work is done.
4. One limitation is that AI may implement things outside the required scope. There is also a risk of exposing sensitive information, such as passwords or secrets, if they are shared with AI.
