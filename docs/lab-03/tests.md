# Lab 3 Test Plan

## 1. Status and Strategy

The matrix contains 75 Test IDs. Following completion and verification of Issues #27, #29, and #31, 16 Test IDs are recorded as `Pass (Issue #27)`, 13 as `Pass (Issue #29)`, and 3 as `Pass (Issue #31)`. The remaining 43 Test IDs remain `Planned` for later Sprint 3 increments.

The suite uses an isolated PostgreSQL TEST_DATABASE_URL protected by the existing structural database guard. Tests must be deterministic, independent of execution order, use unique fixture keys, and clean up only their own data. Authentication tests use non-production fixture credentials supplied at runtime. Cookies and password material must never appear in snapshots, logs, or retained artifacts.

Test levels:

- Unit: isolated validation, hashing configuration, exact Origin parsing, query parsing, transition, and invariant rules.
- API/integration: Express, Prisma, cookies, CSRF, persistence, response DTOs, and safe failures.
- Security/authorization: direct endpoint attacks, identity spoofing, resource isolation, secret redaction, and final-state race assertions.
- Migration/regression: populated Lab 2 upgrade, exact status/null-owner transformation, ownership preservation, deterministic repeatability, seed idempotency, and earlier suites.
- UI/style/responsive: role routes, screen states, accessibility, Zen Green consistency, exact evidence viewports, and 200% zoom.
- E2E: real-browser workflows through the client, API, and isolated database.

## 2. Planned Tests

### 2.1 Unit Tests

| Test ID | Requirement / AC | What It Tests | Expected Result | Planned Automated Test File | Status |
| --- | --- | --- | --- | --- | --- |
| UNIT-01 | BR-05–BR-07, AC-05, AC-06 | Password boundaries, category rule, confirmation, current-password difference, and Argon2id configuration | Valid input accepted; invalid input rejected; only encoded hashes stored | server/tests/lab-03/auth-validation.unit.test.ts | Pass (Issue #27) |
| UNIT-02 | BR-08–BR-16, AC-07–AC-09, AC-61 | Session token digests, expiry, cookie flags, CSRF comparison, and exact normalized Origin tuple parsing | Default ports normalize correctly; null/malformed/partial tuples fail closed; session and CSRF rules remain deterministic | server/tests/lab-03/session-security.unit.test.ts | Pass (Issue #27) |
| UNIT-03 | BR-02–BR-04, BR-17, AC-02–AC-04 | Email normalization and login-throttle window calculations | Equivalent emails share a key; five failures trigger the documented block | server/tests/lab-03/login-throttle.unit.test.ts | Pass (Issue #27) |
| UNIT-04 | BR-69–BR-74, AC-18–AC-20 | Queue search/filter/sort/page parsing and priority/status ordering | Only whitelisted values produce stable order specifications | server/tests/lab-03/staff-queue-query.unit.test.ts | Pass (Issue #31) |
| UNIT-05 | BR-34–BR-48, AC-24–AC-30, AC-60 | Nullable owner in every status, non-null eligibility, unassign rules, complete status matrix, confirmations, and reasons | Unassigned stored states remain valid; mutation prerequisites and every allowed/forbidden edge are exact | server/tests/lab-03/ticket-workflow.unit.test.ts | Planned |
| UNIT-06 | BR-49–BR-57, AC-31–AC-37 | Comment, Note, and resolution-indication validation | Trimmed boundaries and eligible statuses are enforced | server/tests/lab-03/ticket-communication.unit.test.ts | Planned |
| UNIT-07 | BR-34, BR-41, BR-58–BR-68, AC-42–AC-48, AC-57, AC-58, AC-60 | User validation, one-role rule, self/last-admin/non-terminal-owner guards, lock ordering, bounded serialization retry, and history | Approved changes preserve history; deterministic User/Ticket lock sets and every safety violation are exact | server/tests/lab-03/admin-user-validation.unit.test.ts | Planned |
| UNIT-08 | BR-28–BR-33, BR-80, AC-14, AC-15, AC-39 | Authenticated Requester creation defaults and retained Lab 2 validation adapters | Session identity is used and Lab 2 business limits remain unchanged | server/tests/lab-03/requester-regression.unit.test.ts | Pass (Issue #29) |

### 2.2 API and Integration Tests

| Test ID | Requirement / AC | What It Tests | Expected Result | Planned Automated Test File | Status |
| --- | --- | --- | --- | --- | --- |
| API-01 | FR-01, FR-02, AC-01, AC-02, AC-61 | Valid/invalid Login after approved Origin, cookie creation, safe DTO, and dummy-hash path | 200 and cookies only after exact Origin plus valid active credentials; identical safe 401 for invalid credentials | server/tests/lab-03/auth.api.test.ts | Pass (Issue #27) |
| API-02 | FR-06, AC-03, AC-04 | Inactive-account handling and persistent normalized-email/IP throttle, including deterministically overlapping same-key failures at the threshold and an independent second key | Safe 403 after valid inactive credentials; overlapping failures atomically advance the count from three to five, establish one 15-minute block row, leave the independent key unchanged, and make the next request a safe 429 without exposing sensitive data | server/tests/lab-03/auth.api.test.ts | Pass (Issue #27) |
| API-03 | FR-03, FR-04, AC-07, AC-08 | Current User, idle/absolute expiry, inactivation, logout deletion, and cookie clearing | Safe User returned only for a live active session; revoked access cannot be reused | server/tests/lab-03/auth.api.test.ts | Pass (Issue #27) |
| API-04 | FR-05, AC-05, AC-06 | Forced-password route restriction and successful/invalid password changes | Only permitted auth endpoints work until valid change; session rotates afterward | server/tests/lab-03/password-change.api.test.ts | Pass (Issue #27) |
| API-05 | FR-06, AC-09, AC-61 | CSRF cookie/header/digest and exact Origin validation on authenticated unsafe endpoints and Login distinction | Authenticated failures and Login Origin failures return exact 403 codes with no write/session | server/tests/lab-03/csrf.api.test.ts | Pass (Issue #27) |
| API-06 | FR-10–FR-12, AC-12, AC-14, AC-15 | Authenticated Ticket creation/list, ignored spoof headers, defaults, and idempotency | Session User owns the Ticket; NEW/null owner/copied priority are atomic | server/tests/lab-03/requester-tickets.api.test.ts | Pass (Issue #29) |
| API-07 | FR-13, FR-15, AC-13, AC-14 | Requester Detail DTO and missing/non-owned equivalence | Owned Detail includes Lab 3 public fields; foreign resource returns safe 404 | server/tests/lab-03/requester-tickets.api.test.ts | Pass (Issue #29) |
| API-08 | FR-14, FR-21, AC-13, AC-38, AC-39 | Role-aware Attachment listing/content and Requester-only upload/removal | Existing files persist; role/ownership/mutation rules and 410 behavior hold | server/tests/lab-03/attachments.api.test.ts | Pass (Issue #29) |
| API-09 | FR-18, FR-19, AC-17–AC-21 | Queue fields, search, all filters/sorts/pages, empty/no-results data, and invalid queries | Stable correct pages or documented 400 response | server/tests/lab-03/staff-queue.api.test.ts | Pass (Issue #31) |
| API-10 | FR-20, FR-21, AC-22, AC-23 | Operational Detail and eligible-assignee DTO for Staff/Admin versus Requester | Permitted roles receive grouped data; Requester receives 403 | server/tests/lab-03/staff-ticket-detail.api.test.ts | Planned |
| API-11 | FR-22, FR-23, AC-24–AC-26, AC-60 | Claim including any migrated non-terminal status, idempotent own claim, competing claim, assignment/reassignment/unassign, target eligibility | Nullable states remain valid; committed non-null owner is eligible; all conflicts are safe | server/tests/lab-03/staff-ticket-ownership.api.test.ts | Planned |
| API-12 | FR-24, AC-27, AC-30 | IT Priority update, terminal rejection, optimistic concurrency, Requested Priority immutability | Only IT Priority changes on a current eligible Ticket | server/tests/lab-03/staff-ticket-workflow.api.test.ts | Planned |
| API-13 | FR-25, FR-26, AC-28–AC-30, AC-60 | Every transition, unassigned stored states, owner eligibility at commit, confirmation, reason, history, stale/concurrent write | Matrix and append-only history are exact with no partial writes or ineligible owner | server/tests/lab-03/staff-ticket-workflow.api.test.ts | Planned |
| API-14 | FR-27, FR-28, AC-33–AC-35 | Public Comment creation/list pagination, ownership, author, timestamp, validation, inert content | One safe append-only Comment or documented rejection | server/tests/lab-03/comments-notes.api.test.ts | Pass (Issue #29) |
| API-15 | FR-29, AC-36, AC-37 | Internal Note creation/list and Requester denial-before-lookup | Staff/Admin see safe Notes; Requester receives 403 and no content | server/tests/lab-03/comments-notes.api.test.ts | Planned |
| API-16 | FR-17, AC-31, AC-32 | Requester resolution indication, eligible status, owner protection, repeated request, reopen clearing | Status unchanged; one current-cycle indication; safe rejection otherwise | server/tests/lab-03/resolution-indication.api.test.ts | Planned |
| API-17 | FR-31, AC-40, AC-41 | Admin User list DTO, deterministic order, search, optional role, invalid queries, role denial | Safe non-credential summaries or 403/400 | server/tests/lab-03/users-admin.api.test.ts | Planned |
| API-18 | FR-32, FR-37, AC-42, AC-43 | User creation, normalized duplicate email, one role, password hashing, unknown fields | Atomic 201 with mustChangePassword true or documented safe rejection | server/tests/lab-03/users-admin.api.test.ts | Planned |
| API-19 | FR-33, FR-35, FR-36, AC-44–AC-47, AC-60 | User edit, stale write, self/last-admin/non-terminal-owner guards, shared locks, and session invalidation | Only valid approved fields and session changes commit; final User/Ticket invariants always hold | server/tests/lab-03/users-admin.api.test.ts | Planned |
| API-20 | FR-34, AC-48 | Initial-password reset, self-reset rejection, hash replacement, forced change, all-session revocation | Target’s old sessions fail and next login is gated | server/tests/lab-03/users-admin.api.test.ts | Planned |
| API-21 | FR-42, BR-76–BR-79, AC-52 | Unexpected database/storage/hash failures and DTO/log redaction | Safe 500/503 body with no protected material | server/tests/lab-03/safe-errors.api.test.ts | Planned |
| API-22 | FR-33, FR-36, BR-20, BR-22, BR-34, BR-41, BR-65, AC-44, AC-47, AC-57, AC-58, AC-60 | OP-30 matrix: historical Requesters, non-terminal/terminal owners, Staff/Admin swaps, session invalidation, lock ordering, and last-admin precedence | Historical references remain; current permissions change; exact conflicts and final database state satisfy invariants | server/tests/lab-03/users-admin-history.api.test.ts | Planned |
| API-23 | FR-22, FR-38, AC-24, AC-50, AC-59 | Staff Queue and Claim after migration for each mapped legacy status with ownerId=null | Every migrated Ticket is visible as Unassigned; every non-terminal one can be claimed without status rewrite; terminal claim conflicts | server/tests/lab-03/migrated-ticket-claim.api.test.ts | Planned |
| API-24 | FR-01, FR-06, BR-16, AC-01, AC-02, AC-61 | Login Origin matrix: missing, null, malformed, wrong scheme/host/port, misleading suffix/subdomain, approved default/explicit port, no Referer fallback, no CSRF requirement | Exact ORIGIN_REQUIRED/ORIGIN_FORBIDDEN responses; approved Origin reaches credentials; rejection creates no AuthSession/cookies and reveals no account existence | server/tests/lab-03/login-origin.api.test.ts | Pass (Issue #27) |

### 2.3 Security and Authorization Tests

| Test ID | Requirement / AC | What It Tests | Expected Result | Planned Automated Test File | Status |
| --- | --- | --- | --- | --- | --- |
| SEC-01 | FR-06, FR-08, AC-07–AC-11 | Every protected endpoint without, after-expiry, after-logout, and forced-change session | 401 or PASSWORD_CHANGE_REQUIRED; no protected DTO | server/tests/lab-03/authorization.api.test.ts | Planned |
| SEC-02 | FR-08, authorization matrix, AC-10, AC-11, AC-22, AC-41 | Complete role-operation matrix including direct URL/API access | Every allowed cell succeeds and every forbidden cell is 403 | server/tests/lab-03/authorization.api.test.ts | Planned |
| SEC-03 | BR-03, BR-04, BR-07, AC-02–AC-04, AC-52 | Enumeration resistance and credential/token/hash redaction | Equivalent invalid responses and no secret output/log capture | server/tests/lab-03/auth-security.api.test.ts | Pass (Issue #27) |
| SEC-04 | BR-21–BR-25, AC-12, AC-13 | Header/body identity spoofing and Ticket/Attachment ownership probing | Authenticated identity wins; protected existence is hidden | server/tests/lab-03/requester-ownership.api.test.ts | Pass (Issue #29) |
| SEC-05 | BR-25, BR-52, AC-37, AC-52 | Requester probing Internal Notes with valid/invalid Ticket and Note identifiers | Identical role denial occurs before lookup and never includes content | server/tests/lab-03/authorization.api.test.ts | Planned |
| SEC-06 | BR-14–BR-16, AC-09, AC-61 | Cross-site authenticated unsafe requests, Login Origin attacks, exact allowlist tuples, no Referer fallback, and cookie attributes | CSRF/Origin controls prevent mutation or session creation without leaking account existence | server/tests/lab-03/csrf.api.test.ts | Pass (Issue #27) |
| SEC-07 | FR-43, BR-40, BR-41, BR-64, BR-68, AC-24–AC-30, AC-44–AC-47, AC-58, AC-60 | Lock-order and bounded-retry harness for claims, workflow, duplicate email, last-admin, and owner-eligibility concurrency | User locks precede Ticket locks in ascending ids; only 40001 retries at most twice; final rows satisfy invariants | server/tests/lab-03/concurrency.api.test.ts | Planned |
| SEC-08 | BR-20, BR-22, BR-41, BR-65, AC-57, AC-58, AC-60 | Authorization immediately after Requester role change/deactivation and safe owner conflicts under concurrent User/Ticket edits | Former Requester access is denied; historical references remain; conflict bodies disclose no Ticket contents | server/tests/lab-03/user-role-history-security.api.test.ts | Planned |
| SEC-09 | FR-22, FR-43, BR-34, BR-35, BR-41, AC-24, AC-60 | Claim versus claimant deactivation in both lock orders | Claim-first leaves active eligible owner and blocks deactivation; deactivation-first leaves owner null and blocks claim; final User/Ticket/session rows asserted | server/tests/lab-03/ownership-eligibility-races.api.test.ts | Planned |
| SEC-10 | FR-23, FR-43, BR-34, BR-41, BR-65, AC-25, AC-47, AC-60 | Assign versus target deactivation in both lock orders | Assign-first blocks deactivation; deactivation-first blocks assignment; final owner/role/isActive/session rows asserted | server/tests/lab-03/ownership-eligibility-races.api.test.ts | Planned |
| SEC-11 | FR-23, FR-43, BR-34, BR-41, BR-65, AC-25, AC-47, AC-60 | Assign versus target change to REQUESTER in both lock orders | Assign-first blocks demotion; demotion-first blocks assignment; final owner/role/session rows asserted | server/tests/lab-03/ownership-eligibility-races.api.test.ts | Planned |
| SEC-12 | FR-23, FR-43, BR-34, BR-41, BR-65, AC-25, AC-47, AC-60 | Reassign versus old-owner deactivation/demotion in both lock orders | Reassign-first can release old owner; edit-first conflicts while ownership remains; final old/new User, Ticket, and session rows asserted | server/tests/lab-03/ownership-eligibility-races.api.test.ts | Planned |
| SEC-13 | FR-23, FR-43, BR-34, BR-41, BR-65, AC-25, AC-47, AC-60 | Reassign versus new-owner deactivation/demotion in both lock orders | Reassign-first blocks edit; edit-first blocks reassign; final old/new User, Ticket, and session rows asserted | server/tests/lab-03/ownership-eligibility-races.api.test.ts | Planned |
| SEC-14 | FR-25, FR-26, FR-43, BR-38, BR-41, AC-28, AC-29, AC-47, AC-60 | Owner-dependent status transition versus owner deactivation/demotion, including terminal transition | Non-terminal result retains eligible owner or conflicts; terminal result may retain historical owner; final Ticket/history/User/session rows asserted | server/tests/lab-03/ownership-eligibility-races.api.test.ts | Planned |
| SEC-15 | FR-35, FR-36, FR-43, BR-41, BR-64, BR-65, BR-68, AC-44–AC-47, AC-58, AC-60 | Concurrent Administrator edits, last-admin count, stale version, owned Tickets, lock order, and exhausted serialization retry | One valid commit; loser gets exact safe conflict; final admin count, User versions, sessions, and Ticket owners asserted | server/tests/lab-03/admin-concurrency.api.test.ts | Planned |

### 2.4 Migration and Regression Tests

| Test ID | Requirement / AC | What It Tests | Expected Result | Planned Automated Test File | Status |
| --- | --- | --- | --- | --- | --- |
| MIG-01 | FR-38, FR-39, AC-49, AC-59 | Populated Lab 2 schema migrates without reset; User/Ticket/Attachment ids, requester/uploader/remover links, row counts, timestamps, checksums, and foreign keys | Every preserved value/reference/count matches preflight; no historical owner or status history is fabricated | server/tests/lab-03/lab2-to-lab3.migration.test.ts | Pass (Issue #27) |
| MIG-02 | FR-38, Data migration, AC-50, AC-59 | All seven legacy status mappings, IT Priority backfill, ownerId=null in every status, and unknown-status preflight | Exact table transformation; unsupported value fails before mutation; no status changes merely to satisfy owner rules | server/tests/lab-03/lab2-to-lab3.migration.test.ts | Pass (Issue #27) |
| MIG-03 | FR-38, BR-05–BR-07, AC-05, AC-49, AC-56 | Valid per-User migration mapping produces independently salted Argon2id hashes and mandatory password change | Hashes differ even for independently processed Users; mustChangePassword is true; plaintext never persists or appears in output | server/tests/lab-03/lab2-to-lab3.migration.test.ts | Pass (Issue #27) |
| MIG-04 | FR-40, AC-51 | Seed mapping validation, repeatability, required role counts, realistic distribution, safe sample communication, and sequence continuity | Unique per-User runtime credentials create fixtures once; two runs preserve existing hashes | server/tests/lab-03/seed.integration.test.ts | Pass (Issue #27) |
| MIG-05 | FR-38, BR-05–BR-07, AC-49, AC-56 | Migration preflight with a missing User credential, duplicate credential, policy-invalid value, and unexpected key | Each invalid mapping fails before schema/data mutation and never echoes credentials | server/tests/lab-03/lab2-to-lab3-credentials.migration.test.ts | Pass (Issue #27) |
| MIG-06 | FR-38, FR-39, BR-34, BR-35, AC-49, AC-50, AC-59 | Two migrations from equivalent populated snapshots containing every legacy status, followed by Queue/claim fixture checks | Postflight checksums are identical; every ownerId is null; all mapped Tickets are visible; every non-terminal Ticket is claimable without status rewrite | server/tests/lab-03/lab2-to-lab3-repeatability.migration.test.ts | Planned |
| REG-01 | BR-81, AC-55 | Original Lab 1 health and Category API/client behavior | All original Lab 1 tests remain regression obligations | `server/tests/lab-01/categories.test.ts`<br>`server/tests/lab-01/health.test.ts`<br>`client/tests/lab-01/App.test.tsx` | Planned |
| REG-02 | FR-44, BR-28–BR-33, BR-80, AC-14, AC-39, AC-55 | Lab 2 server Ticket, query, validation, number, Attachment, and safe-error behavior under session identity | All non-identity behavior remains a regression obligation; approved identity assertions move to the planned Lab 3 file | Existing: `server/tests/lab-02/attachment-validation.unit.test.ts`<br>`server/tests/lab-02/attachments.api.test.ts`<br>`server/tests/lab-02/create-ticket.api.test.ts`<br>`server/tests/lab-02/error-handling.api.test.ts`<br>`server/tests/lab-02/my-tickets.api.test.ts`<br>`server/tests/lab-02/reference-data.api.test.ts`<br>`server/tests/lab-02/test-database.unit.test.ts`<br>`server/tests/lab-02/ticket-detail.api.test.ts`<br>`server/tests/lab-02/ticket-number.unit.test.ts`<br>`server/tests/lab-02/ticket-query.unit.test.ts`<br>`server/tests/lab-02/ticket-validation.unit.test.ts`<br>Planned: `server/tests/lab-03/requester-tickets.api.test.ts` | Planned |
| REG-03 | FR-44, AC-14, AC-16, AC-55 | Lab 2 Requester client flows and E2E without selector/Change Requester | Existing flows remain regression obligations; equivalent authenticated Lab 3 workflow is planned with no obsolete state | Existing: `client/tests/lab-02/AttachmentSection.test.tsx`<br>`client/tests/lab-02/AttachmentUploadApi.test.tsx`<br>`client/tests/lab-02/CreateTicket.test.tsx`<br>`client/tests/lab-02/MyTickets.test.tsx`<br>`client/tests/lab-02/RequesterTicketDetail.test.tsx`<br>`client/tests/lab-02/UiStyleAccessibility.test.tsx`<br>`e2e/lab-02/requester-ticket-flow.spec.ts`<br>Planned: `e2e/lab-03/requester-regression.spec.ts` | Planned |

### 2.5 UI, Style, and Responsive Tests

| Test ID | Requirement / AC | What It Tests | Expected Result | Planned Automated Test File | Status |
| --- | --- | --- | --- | --- | --- |
| UI-01 | FR-01, FR-06, AC-01–AC-04, AC-61 | Login initial, validation, busy, success, invalid, inactive, throttle, Origin-required/forbidden, and safe-failure states | Approved safe copy, cleared password, and no duplicate submission or account enumeration | client/tests/lab-03/Login.test.tsx | Pass (Issue #29) |
| UI-02 | FR-05, AC-05, AC-06 | Forced Change Password fields, rules, mismatch, busy, failure, success, and route gate | Normal app opens only after successful rotation | client/tests/lab-03/ChangePassword.test.tsx | Pass (Issue #29) |
| UI-03 | FR-07–FR-09, AC-08, AC-10, AC-11, AC-16 | Current User loading, role navigation, logout, protected routes, obsolete selector redirect | Exact destinations per role and direct access blocked | client/tests/lab-03/AuthenticatedShell.test.tsx | Pass (Issue #29) |
| UI-04 | FR-11–FR-17, AC-12–AC-16, AC-31–AC-35, AC-39 | Requester screens use session identity, show Lab 3 fields/Comments/indication, preserve Attachments, omit Notes | Complete owned workflow with all relevant states | client/tests/lab-03/RequesterTicketFlow.test.tsx | Pass (Issue #29) |
| UI-05 | FR-18, FR-19, AC-17–AC-22, AC-59 | Queue controls, all mapped migrated unassigned statuses, applied query, table/cards, pagination, and states | Migrated Tickets remain visible as Unassigned and query/state behavior matches contract | client/tests/lab-03/StaffTicketQueue.test.tsx | Pass (Issue #31) |
| UI-06 | FR-20, FR-21, AC-23, AC-38, AC-59 | Operational Detail groups, unassigned status validity, Claim availability, read-only/editable distinction, Attachments, and states | Every non-terminal migrated unassigned Detail offers Claim without status rewrite | client/tests/lab-03/StaffTicketDetail.test.tsx | Planned |
| UI-07 | FR-22–FR-26, AC-24–AC-30, AC-60 | Claim/assign/priority/status dialogs, owner-eligibility/concurrent/stale/terminal conflicts, and success refresh | Only permitted actions appear; safe race conflict reloads exact committed server state | client/tests/lab-03/StaffTicketActions.test.tsx | Planned |
| UI-08 | FR-27–FR-30, AC-33–AC-37 | Public versus Internal visual distinction, validation, pagination, safe rendering, announcements | Private composer is unmistakable; content is inert text | client/tests/lab-03/CommentsNotes.test.tsx | Planned |
| UI-09 | FR-17, AC-31, AC-32 | Resolution-indication confirmation, eligible controls, success, repeated, conflict, safe failure | Formal status is not represented as changed | client/tests/lab-03/ResolutionIndication.test.tsx | Pass (Issue #29) |
| UI-10 | FR-31, AC-40, AC-41 | Admin User list/search/filter and all meaningful screen states | Required columns and Edit action; role denial safe | client/tests/lab-03/UserManagement.test.tsx | Planned |
| UI-11 | FR-32–FR-37, AC-42–AC-48, AC-57, AC-58, AC-60 | Admin create/edit/reset forms, historical-reference guidance, field errors, owner/concurrent/stale/safety conflicts, success, focus return | Minimal operations complete without excluded controls, history rewrites, or misleading race success | client/tests/lab-03/UserManagement.test.tsx | Planned |
| STYLE-01 | FR-41, AC-53, AC-54 | Zen Green tokens, badges, editable/read-only fields, focus, labels, live regions, non-color cues | Shared accessible visual contract is present | client/tests/lab-03/UiStyleAccessibility.test.tsx | Planned |
| RESP-01 | FR-41, AC-53 | All six major screens at exactly 390 x 844, 834 x 1112, and 1440 x 900 with the 18 named screenshot paths in ui-spec.md | Each exact viewport screenshot exists; assertions find no page overflow, clipped/overlapping essential content, or hidden required action | e2e/lab-03/responsive.spec.ts | Planned |
| RESP-02 | FR-41, AC-54 | All six screens at 200% browser zoom: keyboard focus, controls/validation, content geometry, Comments/Notes distinction, editable/read-only distinction | Named assertions prove visible focus, usability, no essential clipping/overlap/overflow, and non-color distinctions | e2e/lab-03/responsive.spec.ts | Planned |

### 2.6 End-to-End Tests

| Test ID | Requirement / AC | What It Tests | Expected Result | Planned Automated Test File | Status |
| --- | --- | --- | --- | --- | --- |
| E2E-01 | AC-01–AC-09, AC-61 | Approved-Origin valid/invalid/inactive/throttled Login, Origin-safe UI failure, mandatory change, reload, logout, blocked reuse | Complete secure authentication lifecycle with session creation only after approved Origin | e2e/lab-03/authentication.spec.ts | Pass (Issue #29) |
| E2E-02 | AC-10–AC-16, AC-31–AC-35, AC-39 | Requester role shell, create/list/detail/Attachment, Public Comment, resolution indication, ownership attack | Existing workflow continues under authenticated identity | e2e/lab-03/requester-regression.spec.ts | Pass (Issue #29) |
| E2E-03 | AC-17–AC-30, AC-36–AC-38, AC-59 | Queue query, migrated unassigned Detail/claim, Attachment read, reassign, priority, transitions, Comment, Note | Complete operational Staff workflow with preserved migrated status and privacy distinction | e2e/lab-03/staff-ticket-flow.spec.ts | Planned |
| E2E-04 | AC-40–AC-48, AC-57, AC-58, AC-60 | Admin list/search/filter, create, duplicate error, role/history edits, owner/admin/concurrent safety conflicts, reset, forced change | Complete minimal User Management workflow with preserved history and fresh-state race feedback | e2e/lab-03/user-administration.spec.ts | Planned |
| E2E-05 | AC-10, AC-11, AC-13, AC-22, AC-37, AC-41, AC-52 | Direct navigation/API role and ownership matrix plus safe browser-visible failures | No unauthorized content appears before or after navigation | e2e/lab-03/authorization.spec.ts | Planned |

## 3. Acceptance-Criterion Traceability

Every Acceptance Criterion maps to at least one Test ID in the current status matrix.

| AC | Test IDs |
| --- | --- |
| AC-01 | API-01, API-24, UI-01, E2E-01 |
| AC-02 | UNIT-03, API-01, API-24, SEC-03, UI-01, E2E-01 |
| AC-03 | API-02, UI-01, E2E-01 |
| AC-04 | UNIT-03, API-02, SEC-03, UI-01, E2E-01 |
| AC-05 | UNIT-01, API-04, MIG-03, UI-02, E2E-01 |
| AC-06 | UNIT-01, API-04, UI-02, E2E-01 |
| AC-07 | UNIT-02, API-03, SEC-01, E2E-01 |
| AC-08 | API-03, SEC-01, UI-03, E2E-01 |
| AC-09 | UNIT-02, API-05, SEC-06, E2E-01 |
| AC-10 | SEC-02, UI-03, E2E-02, E2E-05 |
| AC-11 | API-04, SEC-01, SEC-02, UI-03, E2E-05 |
| AC-12 | API-06, SEC-04, UI-04, E2E-02 |
| AC-13 | API-07, API-08, SEC-04, E2E-02, E2E-05 |
| AC-14 | UNIT-08, API-06, API-07, REG-02, REG-03, UI-04, E2E-02 |
| AC-15 | UNIT-08, API-06, UI-04, E2E-02 |
| AC-16 | REG-03, UI-03, UI-04, E2E-02 |
| AC-17 | API-09, UI-05, E2E-03 |
| AC-18 | UNIT-04, API-09, UI-05, E2E-03 |
| AC-19 | UNIT-04, API-09, UI-05, E2E-03 |
| AC-20 | UNIT-04, API-09, UI-05 |
| AC-21 | API-09, UI-05, E2E-03 |
| AC-22 | API-10, SEC-02, UI-05, E2E-05 |
| AC-23 | API-10, UI-06, E2E-03 |
| AC-24 | UNIT-05, API-11, API-23, SEC-07, SEC-09, UI-07, E2E-03 |
| AC-25 | UNIT-05, API-11, SEC-07, SEC-10, SEC-11, SEC-12, SEC-13, UI-07, E2E-03 |
| AC-26 | UNIT-05, API-11, UI-07, E2E-03 |
| AC-27 | API-12, SEC-07, UI-07, E2E-03 |
| AC-28 | UNIT-05, API-13, SEC-07, SEC-14, UI-07, E2E-03 |
| AC-29 | UNIT-05, API-13, SEC-07, SEC-14, UI-07, E2E-03 |
| AC-30 | UNIT-05, API-12, API-13, UI-07, E2E-03 |
| AC-31 | UNIT-06, API-16, UI-09, E2E-02 |
| AC-32 | UNIT-06, API-16, UI-09, E2E-02 |
| AC-33 | UNIT-06, API-14, UI-04, UI-08, E2E-02 |
| AC-34 | API-14, UI-08, E2E-02 |
| AC-35 | UNIT-06, API-14, UI-08, E2E-02 |
| AC-36 | UNIT-06, API-15, UI-08, E2E-03 |
| AC-37 | API-15, SEC-05, UI-08, E2E-05 |
| AC-38 | API-08, API-10, UI-06, E2E-03 |
| AC-39 | UNIT-08, API-08, REG-02, UI-04, E2E-02 |
| AC-40 | API-17, UI-10, E2E-04 |
| AC-41 | API-17, SEC-02, UI-10, E2E-05 |
| AC-42 | UNIT-07, API-18, UI-11, E2E-04 |
| AC-43 | UNIT-07, API-18, UI-11, E2E-04 |
| AC-44 | UNIT-07, API-19, API-22, SEC-07, SEC-15, UI-11, E2E-04 |
| AC-45 | UNIT-07, API-19, UI-11, E2E-04 |
| AC-46 | UNIT-07, API-19, SEC-07, SEC-15, UI-11, E2E-04 |
| AC-47 | UNIT-07, API-19, API-22, SEC-07, SEC-08, SEC-10, SEC-11, SEC-12, SEC-13, SEC-14, SEC-15, UI-11, E2E-04 |
| AC-48 | UNIT-07, API-20, UI-11, E2E-04 |
| AC-49 | MIG-01, MIG-03, MIG-05, MIG-06 |
| AC-50 | API-23, MIG-02, MIG-06 |
| AC-51 | MIG-04 |
| AC-52 | API-21, SEC-03, SEC-05, E2E-05 |
| AC-53 | STYLE-01, RESP-01 |
| AC-54 | STYLE-01, RESP-02 |
| AC-55 | REG-01, REG-02, REG-03 |
| AC-56 | MIG-03, MIG-05 |
| AC-57 | UNIT-07, API-22, SEC-08, UI-11, E2E-04 |
| AC-58 | UNIT-07, API-22, SEC-07, SEC-08, SEC-15, UI-11, E2E-04 |
| AC-59 | API-23, MIG-01, MIG-02, MIG-06, UI-05, UI-06, E2E-03 |
| AC-60 | UNIT-05, UNIT-07, API-11, API-13, API-19, API-22, SEC-07, SEC-08, SEC-09, SEC-10, SEC-11, SEC-12, SEC-13, SEC-14, SEC-15, UI-07, UI-11, E2E-04 |
| AC-61 | UNIT-02, API-01, API-05, API-24, SEC-06, UI-01, E2E-01 |

## 4. Required Test Data and Isolation

- Each test run creates unique email, Ticket Summary, Comment, and Note markers.
- Password fixtures are injected through test environment setup and are redacted from assertion output.
- Session and CSRF cookies are parsed only in memory; raw values are never snapshot-tested.
- Concurrency tests coordinate both requests with barriers so each prescribed lock order is exercised. They inspect committed User role/isActive/updatedAt, Ticket owner/status/updatedAt, AuthSession deletion/retention, and status-history rows after both responses; HTTP assertions alone are insufficient.
- Lock-protocol tests instrument query order to prove ascending User-id locks precede ascending Ticket-id locks, inject SQLSTATE 40001 to prove no more than two retries, and prove business conflicts and non-40001 failures are not retried.
- Migration tests begin from a fixture database created by applying the Lab 2 migrations and seed before Lab 3. The fixture includes every Lab 2 status, representative Attachments/timestamps/references, and a controlled unsupported-status preflight fixture; equivalent snapshots are migrated twice for checksum comparison.
- E2E cleanup deletes only records with the run marker and never uses the development database.
- Time-bound tests use a controllable clock rather than real sleeps.

## 5. Planned Verification Commands

From server:

    npm test
    npm run build

From client:

    npm test
    npm run build

From repository root:

    npm run test:e2e

Migration verification shall additionally run the documented Lab 2-to-Lab 3 migration command against two equivalent disposable populated snapshots and compare preflight/postflight counts and checksums. It then exercises Staff Queue and Claim against each mapped status. The final implementation record shall add exact command output and counts only after execution.

## 6. Responsive and Evidence Plan

Playwright shall check Login, mandatory Change Password, authenticated Requester shell/updated Ticket Detail, Staff Queue, Staff Ticket Detail, and Administrator User Management at exactly 390 x 844, 834 x 1112, and 1440 x 900. RESP-01 captures the 18 exact paths specified in ui-spec.md and asserts geometry/required-action visibility; screenshots supplement semantic assertions and are not a pixel-diff baseline.

RESP-02 runs all six screens separately at 200% browser zoom and names assertions for visible keyboard focus, usable controls/validation, unclipped essential content, non-overlap, no unintended horizontal page overflow, Public Comment/Internal Note distinction, and editable/read-only distinction. Optional retained zoom screenshots use artifacts/lab-03/screenshots/zoom-200/{screen}.png.

Required visual states include:

- Login invalid, inactive, busy, missing/disallowed-Origin, and safe-failure feedback.
- Mandatory Change Password validation and success.
- Populated and no-results Queue with visible filters, owner, priorities, status, and migrated unassigned Tickets.
- Operational Detail with Public Comments and unmistakably private Internal Notes.
- Assignment, priority, status confirmation, conflict, and success.
- Admin list, create/edit validation, safety conflict, and initial-password reset confirmation.
- Keyboard focus and mobile navigation.

## 7. Completion Rule

No Planned entry may be changed to Pass until its file exists, the asserted behavior matches the approved contract, and the command has passed on the implementation branch. Skipped, commented-out, quarantined, or weakened tests do not satisfy an AC.

## 8. Issue #29 Semantic-Coverage Correction Evidence

The four Issue #29 Pass rows challenged by the final audit now have direct coverage in their designated files:

- `UNIT-08` asserts authenticated Requester ownership, `NEW`, `ownerId = null`, copied Requested/IT Priority, and rejection of submitted current or legacy ownership fields.
- `API-08` performs a successful owning-Requester upload and soft removal, verifies the persisted relationship and metadata, checks response redaction, and retains Staff/Administrator mutation denials.
- `SEC-04` proves that a spoofed legacy identity header cannot replace the authenticated Requester and that foreign and missing Ticket probes have the same safe response without protected details; the existing body-spoof and Attachment-probe cases remain.
- `UI-04` exercises Public Comment submission/rendering, Attachment upload/removal, resolution indication without formal status mutation, and loading, empty, no-results, validation, dependency-failure, and safe not-found states.

Tests-only RED commit `6dd78d4` failed only the new `UNIT-08` creation-data assertion because the pure builder was not yet exported; the other newly asserted production behavior already existed and passed. GREEN commit `8fd1e16` introduced and used the smallest pure creation-data builder without changing the API. Test-only commit `815155e` made the existing password boundary tables deterministic under the ordinary full client run by setting exact field values through change events; it retained the same boundary, Unicode, internal-whitespace, submission, and rejection assertions.

After these commits, the focused server run passed 3 files / 10 tests and the focused Requester UI run passed 1 file / 8 tests. The ordinary complete commands passed 30 server files / 203 tests and 12 client files / 94 tests. All 8 Playwright scenarios, both production builds, and the compiled-server health smoke passed. No Test ID status changed: the matrix remains 75 = 16 `Pass (Issue #27)` + 13 `Pass (Issue #29)` + 46 `Planned`; `API-16` and `SEC-01` remain `Planned`.

## 9. PR #30 Requested-Changes Regression Evidence

Corrective RED commit `25e7c24` added deterministic database-lock/barrier coverage in `server/tests/lab-03/requester-mutation-concurrency.api.test.ts` for Ticket creation, Public Comment creation, resolution indication, Attachment upload, and Attachment removal. Each mutation is covered against both Requester deactivation and role change in both meaningful commit orders. The 10 cases initially failed only because stale eligibility could commit or because a committed eligibility change did not produce the safe conflict. The focused client RED run covered 17 tests; 13 passed and four failed for the intended missing authoritative conflict reload, safe reload-failure state, modal keyboard/focus behavior, and later-page Comment success flow.

GREEN commit `5043200` made the 5-file / 21-test focused server run and 2-file / 17-test focused client run pass. The 10-test concurrency file also passed three further consecutive stress runs after the combined focused run. Follow-up `9b249b4` preserved the Lab 2 safe-unexpected-error assertion at the new transaction boundary and applied a narrow 30-second timeout to the existing credential-preflight parameterized cases without changing their assertions.

Plain `npm test` then passed 31 server files / 213 tests with no command-line or global timeout override, and plain client `npm test` passed 12 files / 97 tests. All 8 Playwright scenarios, both production builds, and the compiled-server health smoke passed. No Test ID status changed: the matrix remains 75 = 16 `Pass (Issue #27)` + 13 `Pass (Issue #29)` + 46 `Planned`; `API-16` and `SEC-01` remain `Planned`.

## 10. Transaction-Scoped Gate Correction Evidence

Tests-only RED commit `bad31ad` added three focused database assertions without adding a Test ID or changing a matrix status. The same-session assertion failed against the previous implementation because the granted advisory lock and mutation transaction reported different PostgreSQL backend PIDs. The rollback-release and second-callback exclusion assertions passed, confirming that the RED failure isolated the transaction-boundary defect.

GREEN commit `31cada3` moved ordered coordination into each Prisma SERIALIZABLE attempt. The gate and mutation now use the same `Prisma.TransactionClient`; PostgreSQL transaction-scoped locks release on commit or rollback without explicit unlock. A transaction that waits for a gate raises structured SQLSTATE `40001` before its mutation callback, rolls back its stale snapshot, and restarts within the existing three-attempt bound. The subsequent callback executes once, after the fresh transaction has acquired its gates. User locking still precedes Ticket locking, and Attachment upload staging/rollback cleanup and post-commit physical removal are unchanged.

The gate file passed 3 tests. A combined focused run passed 5 files / 67 tests, including all 10 eligibility races, all 9 retry/exhaustion and storage-cleanup cases, all 3 role-aware Attachment cases, and all 42 retained Attachment cases including the concurrent fifth-file limit. The eligibility file passed five further consecutive 10-test runs. Plain server `npm test` passed 33 files / 225 tests with no global or command-line timeout override; plain client `npm test` passed 12 files / 98 tests. All 8 Playwright scenarios, both builds, and the compiled-server health smoke passed.

No Test ID status changed. The matrix remains 75 = 16 `Pass (Issue #27)` + 13 `Pass (Issue #29)` + 46 `Planned`; `API-16` and `SEC-01` remain `Planned`, and all 61 Acceptance Criteria retain valid traceability.

## 11. Issue #31 IT Staff Queue Evidence

RED commit `d95abc1` added only the three designated Issue #31 test files. The focused runs failed for the expected missing Queue parser/business ordering, absent Staff Queue and assignee routes, and placeholder Queue UI; they did not fail for syntax, dependency, setup, or unsafe-database reasons.

GREEN commit `5e77396` implements only OP-19 plus the read-only OP-21 eligible-assignee summary used by Queue filtering. `UNIT-04` passed 18 tests, `API-09` passed 21 tests against the validated isolated `toktickit_test/public` target, and `UI-05` passed 10 tests including every mapped status rendered as Unassigned. The ordinary commands passed 35 server files / 264 tests and 13 client files / 111 tests. The six retained Lab 2 Playwright scenarios, both production builds, and the compiled-server health smoke passed; the smoke process was terminated and port 3199 was closed.

Read-only development snapshots before and after verification remained Lab 2 with 5 Development Requesters, 182 Tickets, 92 Attachments, 4 Categories, and 7 Related Systems. Status totals remained 182 NEW, and the User, Ticket-without-status, and Attachment SHA-256 checksums matched exactly. Regenerated Lab 2 screenshots and generated build/test output were removed. No schema, migration, seed, dependency, Staff mutation/detail, Administrator workflow, final responsive evidence, or GitHub state change is claimed.

The matrix is now 75 = 16 `Pass (Issue #27)` + 13 `Pass (Issue #29)` + 3 `Pass (Issue #31)` + 43 `Planned`. `API-10`, `SEC-01`, `SEC-02`, and `E2E-03` remain `Planned`, and all 61 Acceptance Criteria retain their existing traceability rows.
