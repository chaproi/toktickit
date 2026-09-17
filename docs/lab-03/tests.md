# Lab 3 Test Plan

## 1. Status and Strategy

This is a pre-implementation Test DD plan. Every entry is **Planned**; no Lab 3 production test, review, pass result, or screenshot is claimed. Results shall change to Pass only after the named file exists and the test has run successfully on the implementation branch.

The suite uses an isolated PostgreSQL TEST_DATABASE_URL protected by the existing structural database guard. Tests must be deterministic, independent of execution order, use unique fixture keys, and clean up only their own data. Authentication tests use non-production fixture credentials supplied at runtime. Cookies and password material must never appear in snapshots, logs, or retained artifacts.

Test levels:

- Unit: isolated validation, hashing configuration, query parsing, transition, and invariant rules.
- API/integration: Express, Prisma, cookies, CSRF, persistence, response DTOs, and safe failures.
- Security/authorization: direct endpoint attacks, identity spoofing, resource isolation, secret redaction, and concurrency.
- Migration/regression: populated Lab 2 upgrade, ownership preservation, seed idempotency, and earlier suites.
- UI/style/responsive: role routes, screen states, accessibility, Zen Green consistency, and supported widths.
- E2E: real-browser workflows through the client, API, and isolated database.

## 2. Planned Tests

### 2.1 Unit Tests

| Test ID | Requirement / AC | What It Tests | Expected Result | Planned Automated Test File | Status |
| --- | --- | --- | --- | --- | --- |
| UNIT-01 | BR-05–BR-07, AC-05, AC-06 | Password boundaries, category rule, confirmation, current-password difference, and Argon2id configuration | Valid input accepted; invalid input rejected; only encoded hashes stored | server/tests/lab-03/auth-validation.unit.test.ts | Planned |
| UNIT-02 | BR-08–BR-16, AC-07–AC-09 | Session token digests, absolute/idle expiry, refresh bound, cookie flags, and CSRF comparison | Exact session and CSRF rules are deterministic and fail closed | server/tests/lab-03/session-security.unit.test.ts | Planned |
| UNIT-03 | BR-02–BR-04, BR-17, AC-02–AC-04 | Email normalization and login-throttle window calculations | Equivalent emails share a key; five failures trigger the documented block | server/tests/lab-03/login-throttle.unit.test.ts | Planned |
| UNIT-04 | BR-69–BR-74, AC-18–AC-20 | Queue search/filter/sort/page parsing and priority/status ordering | Only whitelisted values produce stable order specifications | server/tests/lab-03/staff-queue-query.unit.test.ts | Planned |
| UNIT-05 | BR-34–BR-48, AC-24–AC-30 | Owner eligibility, unassign rules, complete status matrix, confirmations, and reasons | Every allowed edge passes and every other edge fails with the correct reason | server/tests/lab-03/ticket-workflow.unit.test.ts | Planned |
| UNIT-06 | BR-49–BR-57, AC-31–AC-37 | Comment, Note, and resolution-indication validation | Trimmed boundaries and eligible statuses are enforced | server/tests/lab-03/ticket-communication.unit.test.ts | Planned |
| UNIT-07 | BR-34, BR-58–BR-68, AC-42–AC-48, AC-57, AC-58 | User validation, one-role rule, self/last-admin/non-terminal-owner guards, and historical-reference decisions | Approved changes preserve history; every safety violation fails without mutation | server/tests/lab-03/admin-user-validation.unit.test.ts | Planned |
| UNIT-08 | BR-28–BR-33, BR-80, AC-14, AC-15, AC-39 | Authenticated Requester creation defaults and retained Lab 2 validation adapters | Session identity is used and Lab 2 business limits remain unchanged | server/tests/lab-03/requester-regression.unit.test.ts | Planned |

### 2.2 API and Integration Tests

| Test ID | Requirement / AC | What It Tests | Expected Result | Planned Automated Test File | Status |
| --- | --- | --- | --- | --- | --- |
| API-01 | FR-01, FR-02, AC-01, AC-02 | Valid and invalid Login response, cookie creation, safe DTO, dummy-hash path | 200 and cookies for valid active User; identical safe 401 for invalid credentials | server/tests/lab-03/auth.api.test.ts | Planned |
| API-02 | FR-06, AC-03, AC-04 | Inactive-account handling and persistent normalized-email/IP throttle | Safe 403 after valid inactive credentials; sixth blocked attempt is 429 | server/tests/lab-03/auth.api.test.ts | Planned |
| API-03 | FR-03, FR-04, AC-07, AC-08 | Current User, idle/absolute expiry, inactivation, logout deletion, and cookie clearing | Safe User returned only for a live active session; revoked access cannot be reused | server/tests/lab-03/auth.api.test.ts | Planned |
| API-04 | FR-05, AC-05, AC-06 | Forced-password route restriction and successful/invalid password changes | Only permitted auth endpoints work until valid change; session rotates afterward | server/tests/lab-03/password-change.api.test.ts | Planned |
| API-05 | FR-06, AC-09 | CSRF cookie/header/digest and Origin validation on unsafe endpoints | Missing, mismatched, and disallowed-origin mutations return 403 with no write | server/tests/lab-03/csrf.api.test.ts | Planned |
| API-06 | FR-10–FR-12, AC-12, AC-14, AC-15 | Authenticated Ticket creation/list, ignored spoof headers, defaults, and idempotency | Session User owns the Ticket; NEW/null owner/copied priority are atomic | server/tests/lab-03/requester-tickets.api.test.ts | Planned |
| API-07 | FR-13, FR-15, AC-13, AC-14 | Requester Detail DTO and missing/non-owned equivalence | Owned Detail includes Lab 3 public fields; foreign resource returns safe 404 | server/tests/lab-03/requester-tickets.api.test.ts | Planned |
| API-08 | FR-14, FR-21, AC-13, AC-38, AC-39 | Role-aware Attachment listing/content and Requester-only upload/removal | Existing files persist; role/ownership/mutation rules and 410 behavior hold | server/tests/lab-03/attachments.api.test.ts | Planned |
| API-09 | FR-18, FR-19, AC-17–AC-21 | Queue fields, search, all filters/sorts/pages, empty/no-results data, and invalid queries | Stable correct pages or documented 400 response | server/tests/lab-03/staff-queue.api.test.ts | Planned |
| API-10 | FR-20, FR-21, AC-22, AC-23 | Operational Detail and eligible-assignee DTO for Staff/Admin versus Requester | Permitted roles receive grouped data; Requester receives 403 | server/tests/lab-03/staff-ticket-detail.api.test.ts | Planned |
| API-11 | FR-22, FR-23, AC-24–AC-26 | Claim, idempotent own claim, competing claim, assignment/reassignment/unassign, target eligibility | One owner invariant holds and all conflicts are safe | server/tests/lab-03/staff-ticket-ownership.api.test.ts | Planned |
| API-12 | FR-24, AC-27, AC-30 | IT Priority update, terminal rejection, optimistic concurrency, Requested Priority immutability | Only IT Priority changes on a current eligible Ticket | server/tests/lab-03/staff-ticket-workflow.api.test.ts | Planned |
| API-13 | FR-25, FR-26, AC-28–AC-30 | Every allowed/forbidden transition, confirmation, reason, owner prerequisite, history, stale write | Matrix and append-only history are exact with no partial writes | server/tests/lab-03/staff-ticket-workflow.api.test.ts | Planned |
| API-14 | FR-27, FR-28, AC-33–AC-35 | Public Comment creation/list pagination, ownership, author, timestamp, validation, inert content | One safe append-only Comment or documented rejection | server/tests/lab-03/comments-notes.api.test.ts | Planned |
| API-15 | FR-29, AC-36, AC-37 | Internal Note creation/list and Requester denial-before-lookup | Staff/Admin see safe Notes; Requester receives 403 and no content | server/tests/lab-03/comments-notes.api.test.ts | Planned |
| API-16 | FR-17, AC-31, AC-32 | Requester resolution indication, eligible status, owner protection, repeated request, reopen clearing | Status unchanged; one current-cycle indication; safe rejection otherwise | server/tests/lab-03/resolution-indication.api.test.ts | Planned |
| API-17 | FR-31, AC-40, AC-41 | Admin User list DTO, deterministic order, search, optional role, invalid queries, role denial | Safe non-credential summaries or 403/400 | server/tests/lab-03/users-admin.api.test.ts | Planned |
| API-18 | FR-32, FR-37, AC-42, AC-43 | User creation, normalized duplicate email, one role, password hashing, unknown fields | Atomic 201 with mustChangePassword true or documented safe rejection | server/tests/lab-03/users-admin.api.test.ts | Planned |
| API-19 | FR-33, FR-35, FR-36, AC-44–AC-47 | User edit, stale write, self guard, last-admin transaction, non-terminal-owner guard, and role/deactivation session invalidation | Only valid approved fields commit, affected sessions end, and invariants always hold | server/tests/lab-03/users-admin.api.test.ts | Planned |
| API-20 | FR-34, AC-48 | Initial-password reset, self-reset rejection, hash replacement, forced change, all-session revocation | Target’s old sessions fail and next login is gated | server/tests/lab-03/users-admin.api.test.ts | Planned |
| API-21 | FR-42, BR-76–BR-79, AC-52 | Unexpected database/storage/hash failures and DTO/log redaction | Safe 500/503 body with no protected material | server/tests/lab-03/safe-errors.api.test.ts | Planned |
| API-22 | FR-33, FR-36, BR-20, BR-22, BR-34, BR-65, AC-44, AC-47, AC-57, AC-58 | OP-30 matrix: Requester-to-operational roles, historical requester authorization, non-terminal versus terminal-only owners, both Staff/Admin swaps, session invalidation, and last-admin precedence | Historical requesterId/terminal ownerId values remain; current permissions change; invalid owner/admin edits return safe exact conflicts | server/tests/lab-03/users-admin-history.api.test.ts | Planned |

### 2.3 Security and Authorization Tests

| Test ID | Requirement / AC | What It Tests | Expected Result | Planned Automated Test File | Status |
| --- | --- | --- | --- | --- | --- |
| SEC-01 | FR-06, FR-08, AC-07–AC-11 | Every protected endpoint without, after-expiry, after-logout, and forced-change session | 401 or PASSWORD_CHANGE_REQUIRED; no protected DTO | server/tests/lab-03/authorization.api.test.ts | Planned |
| SEC-02 | FR-08, authorization matrix, AC-10, AC-11, AC-22, AC-41 | Complete role-operation matrix including direct URL/API access | Every allowed cell succeeds and every forbidden cell is 403 | server/tests/lab-03/authorization.api.test.ts | Planned |
| SEC-03 | BR-03, BR-04, BR-07, AC-02–AC-04, AC-52 | Enumeration resistance and credential/token/hash redaction | Equivalent invalid responses and no secret output/log capture | server/tests/lab-03/auth-security.api.test.ts | Planned |
| SEC-04 | BR-21–BR-25, AC-12, AC-13 | Header/body identity spoofing and Ticket/Attachment ownership probing | Authenticated identity wins; protected existence is hidden | server/tests/lab-03/requester-ownership.api.test.ts | Planned |
| SEC-05 | BR-25, BR-52, AC-37, AC-52 | Requester probing Internal Notes with valid/invalid Ticket and Note identifiers | Identical role denial occurs before lookup and never includes content | server/tests/lab-03/authorization.api.test.ts | Planned |
| SEC-06 | BR-14–BR-16, AC-09 | Cross-site unsafe request simulation and cookie attributes | CSRF and Origin controls prevent mutation | server/tests/lab-03/csrf.api.test.ts | Planned |
| SEC-07 | FR-43, BR-40, BR-41, BR-64, BR-68, AC-24–AC-30, AC-44–AC-47, AC-58 | Concurrent claims, stale workflow updates, duplicate email, last-admin edits, and owner-eligibility changes | One valid commit; losing operations receive conflict; invariants remain | server/tests/lab-03/concurrency.api.test.ts | Planned |
| SEC-08 | BR-20, BR-22, BR-65, AC-57, AC-58 | Authorization immediately after Requester role change/deactivation and safe non-terminal-owner conflicts under concurrent User/Ticket edits | Former Requester access is denied; historical references remain; conflict bodies disclose no Ticket contents | server/tests/lab-03/user-role-history-security.api.test.ts | Planned |

### 2.4 Migration and Regression Tests

| Test ID | Requirement / AC | What It Tests | Expected Result | Planned Automated Test File | Status |
| --- | --- | --- | --- | --- | --- |
| MIG-01 | FR-38, FR-39, AC-49 | Populated Lab 2 schema migrates without reset; ids, row counts, ownership checksum, and foreign keys | All existing data and references remain valid | server/tests/lab-03/lab2-to-lab3.migration.test.ts | Planned |
| MIG-02 | Data migration, AC-50 | Status mapping, IT Priority backfill, null owner, and status-history initial state | Exact deterministic transformation with no invalid enum rows | server/tests/lab-03/lab2-to-lab3.migration.test.ts | Planned |
| MIG-03 | FR-38, BR-05–BR-07, AC-05, AC-49, AC-56 | Valid per-User migration mapping produces independently salted Argon2id hashes and mandatory password change | Hashes differ even for independently processed Users; mustChangePassword is true; plaintext never persists or appears in output | server/tests/lab-03/lab2-to-lab3.migration.test.ts | Planned |
| MIG-04 | FR-40, AC-51 | Seed mapping validation, repeatability, required role counts, realistic distribution, safe sample communication, and sequence continuity | Unique per-User runtime credentials create fixtures once; two runs preserve existing hashes | server/tests/lab-03/seed.integration.test.ts | Planned |
| MIG-05 | FR-38, BR-05–BR-07, AC-49, AC-56 | Migration preflight with a missing User credential, duplicate credential, policy-invalid value, and unexpected key | Each invalid mapping fails before schema/data mutation and never echoes credentials | server/tests/lab-03/lab2-to-lab3-credentials.migration.test.ts | Planned |
| REG-01 | BR-81, AC-55 | Original Lab 1 health and Category API/client behavior | All original Lab 1 tests remain regression obligations | `server/tests/lab-01/categories.test.ts`<br>`server/tests/lab-01/health.test.ts`<br>`client/tests/lab-01/App.test.tsx` | Planned |
| REG-02 | FR-44, BR-28–BR-33, BR-80, AC-14, AC-39, AC-55 | Lab 2 server Ticket, query, validation, number, Attachment, and safe-error behavior under session identity | All non-identity behavior remains a regression obligation; approved identity assertions move to the planned Lab 3 file | Existing: `server/tests/lab-02/attachment-validation.unit.test.ts`<br>`server/tests/lab-02/attachments.api.test.ts`<br>`server/tests/lab-02/create-ticket.api.test.ts`<br>`server/tests/lab-02/error-handling.api.test.ts`<br>`server/tests/lab-02/my-tickets.api.test.ts`<br>`server/tests/lab-02/reference-data.api.test.ts`<br>`server/tests/lab-02/test-database.unit.test.ts`<br>`server/tests/lab-02/ticket-detail.api.test.ts`<br>`server/tests/lab-02/ticket-number.unit.test.ts`<br>`server/tests/lab-02/ticket-query.unit.test.ts`<br>`server/tests/lab-02/ticket-validation.unit.test.ts`<br>Planned: `server/tests/lab-03/requester-tickets.api.test.ts` | Planned |
| REG-03 | FR-44, AC-14, AC-16, AC-55 | Lab 2 Requester client flows and E2E without selector/Change Requester | Existing flows remain regression obligations; equivalent authenticated Lab 3 workflow is planned with no obsolete state | Existing: `client/tests/lab-02/AttachmentSection.test.tsx`<br>`client/tests/lab-02/AttachmentUploadApi.test.tsx`<br>`client/tests/lab-02/CreateTicket.test.tsx`<br>`client/tests/lab-02/DevelopmentRequesterSelection.test.tsx`<br>`client/tests/lab-02/MyTickets.test.tsx`<br>`client/tests/lab-02/RequesterTicketDetail.test.tsx`<br>`client/tests/lab-02/UiStyleAccessibility.test.tsx`<br>`e2e/lab-02/requester-ticket-flow.spec.ts`<br>Planned: `e2e/lab-03/requester-regression.spec.ts` | Planned |

### 2.5 UI, Style, and Responsive Tests

| Test ID | Requirement / AC | What It Tests | Expected Result | Planned Automated Test File | Status |
| --- | --- | --- | --- | --- | --- |
| UI-01 | FR-01, FR-06, AC-01–AC-04 | Login initial, validation, busy, success, invalid, inactive, throttle, and safe-failure states | Approved copy and no duplicate submission or enumeration | client/tests/lab-03/Login.test.tsx | Planned |
| UI-02 | FR-05, AC-05, AC-06 | Forced Change Password fields, rules, mismatch, busy, failure, success, and route gate | Normal app opens only after successful rotation | client/tests/lab-03/ChangePassword.test.tsx | Planned |
| UI-03 | FR-07–FR-09, AC-08, AC-10, AC-11, AC-16 | Current User loading, role navigation, logout, protected routes, obsolete selector redirect | Exact destinations per role and direct access blocked | client/tests/lab-03/AuthenticatedShell.test.tsx | Planned |
| UI-04 | FR-11–FR-17, AC-12–AC-16, AC-31–AC-35, AC-39 | Requester screens use session identity, show Lab 3 fields/Comments/indication, preserve Attachments, omit Notes | Complete owned workflow with all relevant states | client/tests/lab-03/RequesterTicketFlow.test.tsx | Planned |
| UI-05 | FR-18, FR-19, AC-17–AC-22 | Queue controls, applied query, table/cards, pagination, loading, empty, no-results, forbidden, failure | Query and state behavior exactly match contract | client/tests/lab-03/StaffTicketQueue.test.tsx | Planned |
| UI-06 | FR-20, FR-21, AC-23, AC-38 | Operational Detail groups, read-only/editable distinction, Attachments, loading/not-found/forbidden/failure | Clear complete role-appropriate surface | client/tests/lab-03/StaffTicketDetail.test.tsx | Planned |
| UI-07 | FR-22–FR-26, AC-24–AC-30 | Claim/assign/priority/status dialogs, confirmations, stale and terminal conflicts, success refresh | Only permitted actions appear and safe conflict state is retained | client/tests/lab-03/StaffTicketActions.test.tsx | Planned |
| UI-08 | FR-27–FR-30, AC-33–AC-37 | Public versus Internal visual distinction, validation, pagination, safe rendering, announcements | Private composer is unmistakable; content is inert text | client/tests/lab-03/CommentsNotes.test.tsx | Planned |
| UI-09 | FR-17, AC-31, AC-32 | Resolution-indication confirmation, eligible controls, success, repeated, conflict, safe failure | Formal status is not represented as changed | client/tests/lab-03/ResolutionIndication.test.tsx | Planned |
| UI-10 | FR-31, AC-40, AC-41 | Admin User list/search/filter and all meaningful screen states | Required columns and Edit action; role denial safe | client/tests/lab-03/UserManagement.test.tsx | Planned |
| UI-11 | FR-32–FR-37, AC-42–AC-48, AC-57, AC-58 | Admin create/edit/reset forms, historical-reference guidance, field errors, duplicate/stale/safety conflicts, success, focus return | Minimal operations complete without excluded controls or history rewrites | client/tests/lab-03/UserManagement.test.tsx | Planned |
| STYLE-01 | FR-41, AC-53, AC-54 | Zen Green tokens, badges, editable/read-only fields, focus, labels, live regions, non-color cues | Shared accessible visual contract is present | client/tests/lab-03/UiStyleAccessibility.test.tsx | Planned |
| RESP-01 | FR-41, AC-53 | Login, password change, Requester, queue, operational detail, and Admin at 390/768/820/1024/1440 | No page overflow, clipping, overlap, or hidden required action | e2e/lab-03/responsive.spec.ts | Planned |
| RESP-02 | FR-41, AC-54 | Keyboard flows, menu/dialog focus, 200% zoom, touch targets, live feedback | Required operations remain accessible without a pointer | e2e/lab-03/responsive.spec.ts | Planned |

### 2.6 End-to-End Tests

| Test ID | Requirement / AC | What It Tests | Expected Result | Planned Automated Test File | Status |
| --- | --- | --- | --- | --- | --- |
| E2E-01 | AC-01–AC-09 | Invalid/valid/inactive/throttled login, mandatory change, reload, logout, blocked reuse | Complete secure authentication lifecycle | e2e/lab-03/authentication.spec.ts | Planned |
| E2E-02 | AC-10–AC-16, AC-31–AC-35, AC-39 | Requester role shell, create/list/detail/Attachment, Public Comment, resolution indication, ownership attack | Existing workflow continues under authenticated identity | e2e/lab-03/requester-regression.spec.ts | Planned |
| E2E-03 | AC-17–AC-30, AC-36–AC-38 | Queue query, Detail, Attachment read, claim/reassign, priority, transitions, Comment, Note | Complete operational Staff workflow with privacy distinction | e2e/lab-03/staff-ticket-flow.spec.ts | Planned |
| E2E-04 | AC-40–AC-48, AC-57, AC-58 | Admin list/search/filter, create, duplicate error, role/history edits, owner/admin safety conflicts, reset, target forced change | Complete minimal User Management workflow with preserved historical references | e2e/lab-03/user-administration.spec.ts | Planned |
| E2E-05 | AC-10, AC-11, AC-13, AC-22, AC-37, AC-41, AC-52 | Direct navigation/API role and ownership matrix plus safe browser-visible failures | No unauthorized content appears before or after navigation | e2e/lab-03/authorization.spec.ts | Planned |

## 3. Acceptance-Criterion Traceability

Every Acceptance Criterion maps to at least one planned test.

| AC | Planned Test IDs |
| --- | --- |
| AC-01 | API-01, UI-01, E2E-01 |
| AC-02 | UNIT-03, API-01, SEC-03, UI-01, E2E-01 |
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
| AC-24 | UNIT-05, API-11, SEC-07, UI-07, E2E-03 |
| AC-25 | UNIT-05, API-11, SEC-07, UI-07, E2E-03 |
| AC-26 | UNIT-05, API-11, UI-07, E2E-03 |
| AC-27 | API-12, SEC-07, UI-07, E2E-03 |
| AC-28 | UNIT-05, API-13, SEC-07, UI-07, E2E-03 |
| AC-29 | UNIT-05, API-13, SEC-07, UI-07, E2E-03 |
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
| AC-44 | UNIT-07, API-19, API-22, SEC-07, UI-11, E2E-04 |
| AC-45 | UNIT-07, API-19, UI-11, E2E-04 |
| AC-46 | UNIT-07, API-19, SEC-07, UI-11, E2E-04 |
| AC-47 | UNIT-07, API-19, API-22, SEC-07, SEC-08, UI-11, E2E-04 |
| AC-48 | UNIT-07, API-20, UI-11, E2E-04 |
| AC-49 | MIG-01, MIG-03, MIG-05 |
| AC-50 | MIG-02 |
| AC-51 | MIG-04 |
| AC-52 | API-21, SEC-03, SEC-05, E2E-05 |
| AC-53 | STYLE-01, RESP-01 |
| AC-54 | STYLE-01, RESP-02 |
| AC-55 | REG-01, REG-02, REG-03 |
| AC-56 | MIG-03, MIG-05 |
| AC-57 | UNIT-07, API-22, SEC-08, UI-11, E2E-04 |
| AC-58 | UNIT-07, API-22, SEC-07, SEC-08, UI-11, E2E-04 |

## 4. Required Test Data and Isolation

- Each test run creates unique email, Ticket Summary, Comment, and Note markers.
- Password fixtures are injected through test environment setup and are redacted from assertion output.
- Session and CSRF cookies are parsed only in memory; raw values are never snapshot-tested.
- Concurrency tests use database transactions and independently await both competing requests.
- Migration tests begin from a fixture database created by applying the Lab 2 migrations and seed before applying Lab 3 migrations.
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

Migration verification shall additionally run the documented Lab 2-to-Lab 3 migration command twice against disposable populated databases and compare preflight/postflight reports. The final implementation record shall add exact command output and counts only after execution.

## 6. Responsive and Evidence Plan

Playwright shall check every major screen at 390, 768, 820, 1024, and 1440 pixels. Retained screenshots belong under artifacts/lab-03/screenshots/authentication, staff-queue, staff-ticket-detail, and user-management. Screenshots supplement semantic assertions; they are not a pixel-diff baseline.

Required visual states include:

- Login invalid, inactive, busy, and safe-failure feedback.
- Mandatory Change Password validation and success.
- Populated and no-results Queue with visible filters, owner, priorities, and status.
- Operational Detail with Public Comments and unmistakably private Internal Notes.
- Assignment, priority, status confirmation, conflict, and success.
- Admin list, create/edit validation, safety conflict, and initial-password reset confirmation.
- Keyboard focus and mobile navigation.

## 7. Completion Rule

No Planned entry may be changed to Pass until its file exists, the asserted behavior matches the approved contract, and the command has passed on the implementation branch. Skipped, commented-out, quarantined, or weakened tests do not satisfy an AC.
