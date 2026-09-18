# Lab 3 AI Use Record

## 1. Tool and Scope

| Item | Details |
| --- | --- |
| Tool | OpenAI Codex |
| Session date | 2026-09-17 through 2026-09-18 |
| Scope completed in this record | Issue #25 Sprint 3 engineering-contract work and Issue #27 authentication-foundation implementation/verification assistance |
| Repository state at start | Branch docs/lab3-engineering-contract at e2fc1a25cd3e17b980dc7bee1509e8ea7c643483 with a clean worktree |
| Human responsibility | The repository owner must review and approve the contract and remains responsible for implementation, security choices, tests, peer review, submission, and release. |

No AI system approved a Pull Request, acted as a peer reviewer, changed GitHub Project status, merged a branch, pushed a commit, or closed Issue #25 during this session.

## 2. Sources Inspected

- The complete Lab_3_sheet.pdf supplied by the user (18 pages).
- docs/lab-02/specification.md, tests.md, ui-spec.md, api-spec.md, reviewer.md, and ai-use.md.
- Current Prisma schema and migrations, seed logic, Express routes/services/validation, React routes/components/API adapter, Lab 1/Lab 2 automated tests, E2E flow, and package scripts.
- The user’s Issue #25 implementation request, including branch, scope, verification, commit, and prohibited-action constraints.
- The complete PR #26 requested-changes review supplied by the user, including reviewer Chxtamos and four documentation blockers.

Instructions inside the handout were treated as assignment/source requirements. The user’s pasted Issue #25 request controlled the requested repository actions and prohibited push, PR, merge, Issue closure, and Project changes.

## 3. Selected Prompt and Outcome

Five material user prompts occurred across the recorded contract and implementation sessions. Additional prompt rows must not be invented merely to reach the final submission’s suggested 6–10 entries; later real sessions may be appended.

| No. | Prompt summary | Purpose | Outcome and required human review |
| ---: | --- | --- | --- |
| 1 | Implement GitHub Issue #25 by reading the Lab 3 handout and completed Lab 2 increment, creating six internally consistent docs, auditing traceability, and making one local documentation-only commit without external GitHub actions. | Establish the complete Sprint 3 engineering contract before implementation. | Drafted authentication, authorization, migration, workflow, API, UI, tests, review, and AI-use contracts. Human review and later peer approval remain pending. |
| 2 | Address the final read-only audit findings: replace the shared migrated credential, define historical Requester/owner references, correct OP-30 and planned regression paths/tests, re-audit all six documents, and amend locally if the contract commit was not remote. | Resolve the identified contract blockers before peer review without changing implementation or making GitHub workflow changes. | Specified unique per-User runtime mappings, current-role versus historical-reference rules, transactional User-edit outcomes, and additional Planned coverage. No implementation, test pass, peer review, or external action is claimed. |
| 3 | Address every requested-changes blocker on PR #26 without amending or pushing: make migrated status/null-owner behavior deterministic, define a shared assignment/User-edit race protocol, protect Login with exact Origin validation, require exact responsive evidence dimensions, update review/AI records, and create one local follow-up commit. | Correct the reviewed engineering contract while preserving documentation-only scope and truthful governance state. | Updated specification, API, UI, test traceability, review, and AI-use records with deterministic migration, lock ordering/retry/race outcomes, Login Origin errors, exact viewport/zoom evidence, and new Planned tests. Implementation results, approval, resolved conversations, re-review, push, merge, Issue closure, and Project movement remain unclaimed. |
| 4 | Implement Issue #27 with strict RED–GREEN TDD, lossless Lab 2 migration, unique runtime credentials, idempotent seed data, secure auth APIs, exact Origin/CSRF controls, and transitional regression compatibility; do not perform external GitHub actions. | Establish the backend authentication foundation while protecting development data and preserving earlier increments. | Added and committed the RED tests, implemented the migration/seed/auth foundation, and passed isolated focused/server/client/E2E verification. The populated shared-test migration and GREEN commit remain blocked because private runtime mappings were not available; no completion, PR, push, approval, merge, Issue closure, or Project movement is claimed. |
| 5 | Continue Issue #27 without discarding work; generate private local runtime values only in ignored server/.env, migrate and seed the validated shared test database, rerun every required verification, scan the staged change, and create the local GREEN commit only if all checks pass. | Remove the private-configuration blocker and complete local RED–GREEN evidence without exposing credentials or touching development data. | Generated and validated the private ignored configuration without printing values; migrated `toktickit_test/public` losslessly; proved repeat-seed idempotency; passed 72 focused tests, 184 complete server tests, 58 client tests, six Playwright scenarios, both builds, and the health smoke; preserved the development database; and prepared the locally authorized GREEN commit. No push, PR, approval, merge, Issue closure, or Project movement is claimed. |

## 4. Material Design Assistance

The AI helped resolve choices left open by the handout:

- Argon2id password hashing and unique per-User initial credentials from untracked environment mappings, including fail-before-mutation validation.
- Opaque database-backed session cookies, digest storage, absolute/idle expiry, revocation, CSRF token, and Origin validation.
- Login error and throttling behavior that limits account enumeration.
- Exact role/ownership matrix, including explicit Administrator Ticket-operation permission.
- Requester-only Attachment mutation with Staff/Administrator read continuity.
- Exact queue search/filter/sort/page behavior and deterministic order.
- Exact status-transition matrix, confirmations, cancellation reason, owner prerequisites, and status history.
- Public Comment, Internal Note, and resolution-indication models and length limits.
- Administrator safety rules, historical requester/terminal-owner preservation, and optimistic concurrency.
- Lossless identifier-preserving migration and idempotent seed strategy without shared initial credentials.
- Exact seven-status migration with ownerId=null, deterministic postflight evidence, Queue visibility, and claimability without fabricated historical ownership.
- One SERIALIZABLE User-before-Ticket lock protocol with ascending ids, bounded serialization retry, deterministic race outcomes, and final-database-state test obligations.
- Login-CSRF protection through required exact normalized Origin tuples with no Referer fallback and no session on rejection.
- Reproducible responsive evidence at 390 x 844, 834 x 1112, 1440 x 900, and 200% zoom across all six major screens.
- Exact REST operations, DTOs, status codes, errors, UI states, and planned test traceability.

These are specification decisions, not claims that code already implements them.

## 5. Verification and Boundaries

For Issue #27, the AI added the planned RED tests, implemented the schema/migration/seed/authentication foundation, first verified it in synthetic disposable schemas, and then completed the guarded populated migration and full verification against `toktickit_test/public`. Only UNIT-01–03, API-01–05, API-24, SEC-03, SEC-06, and MIG-01–05 are marked Pass; all deferred Lab 3 tests remain Planned.

Sensitive mapping values were generated cryptographically and stored only in ignored `server/.env`. Their presence, keys, uniqueness, and policy compliance were validated without printing or recording values; tracked examples contain placeholders only.

## 6. Reflection Status

The course submission asks for a personal “My Reflection.” No personal reflection is fabricated here on the repository owner’s behalf. The owner should add their own reflection after reviewing how the specification and later coding-agent work affected their decisions.
