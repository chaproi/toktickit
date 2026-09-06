# Lab 2 Test Plan and Results

## 1. Test Strategy

Lab 2 used Test-Driven Development and traceable automated evidence. Tests were planned from the approved requirements and Acceptance Criteria before implementation was declared technically complete.

The strategy contains the following levels:

* **Unit tests:** Verify isolated ticket-number, validation, attachment, and query rules.
* **API/integration tests:** Verify Express routes, Prisma persistence, ownership, validation, pagination, and safe failure responses.
* **UI component tests:** Verify React screen states, user interactions, validation messages, accessibility semantics, and API integration behavior.
* **UI style tests:** Verify Zen Green classes, field states, labels, messages, focus behavior, and non-color indicators.
* **Responsive and visual tests:** Verify desktop, tablet, and mobile layouts using Playwright assertions and retained screenshots.
* **End-to-end tests:** Verify complete Requester workflows through the real browser, API, and database.
* **Regression tests:** Verify that all Lab 1 behavior continues to pass.

Each automated test shall:

1. Identify the related Acceptance Criteria.
2. Fail for the expected reason before implementation when TDD is applicable.
3. Use controlled and repeatable test data.
4. Avoid depending on test execution order.
5. Clean up or isolate created records.
6. Verify both successful and failure behavior.
7. Record its actual test-file path and final result.

My Tickets API and UI tests use deterministic, isolated data with uniquely identifiable records and clean up every record they create. Existing Tickets do not determine asserted totals, ordering, empty states, or no-results states. The final E2E harness similarly uses a unique `Issue21-` run marker and deletes only matching fixtures.

`Implemented` means the test exists and passed in the latest Issue #21 GREEN verification. It does not mean Issue #21 has received peer-review, merge, or release approval.

## 2. Planned-versus-Implemented Tests

| Test ID | Type | Requirement / AC | What It Tests | Automated Test File | Status |
| --- | --- | --- | --- | --- | --- |
| `UNIT-01` | Unit | BR-01–BR-05, AC-08 | Ticket Number generation and yearly sequence formatting | `server/tests/lab-02/ticket-number.unit.test.ts` | Implemented |
| `UNIT-02` | Unit | BR-19–BR-26, AC-09, AC-10 | Ticket input trimming, required fields, lengths, enums, and reference validation | `server/tests/lab-02/ticket-validation.unit.test.ts` | Implemented |
| `UNIT-03` | Unit | BR-43–BR-49, AC-15, AC-16 | Attachment extension, MIME type, size, filename, and count validation | `server/tests/lab-02/attachment-validation.unit.test.ts` | Implemented |
| `UNIT-04` | Unit | BR-32–BR-42, AC-20–AC-23 | Search, filter, sort, page, page-size, unknown-parameter, and repeated-parameter parsing | `server/tests/lab-02/ticket-query.unit.test.ts` | Implemented |
| `API-01` | API | FR-01, FR-05, FR-06, AC-01–AC-03, AC-07, AC-10 | Active Development Requester, Category, and Related System endpoints | `server/tests/lab-02/reference-data.api.test.ts` | Implemented |
| `API-02` | API | FR-08, FR-09, AC-08 | Valid Ticket creation and persistence | `server/tests/lab-02/create-ticket.api.test.ts` | Implemented |
| `API-03` | API | FR-10, FR-30, AC-09–AC-11, AC-41 | Ticket creation validation, unknown-field rejection, and safe failures | `server/tests/lab-02/create-ticket.api.test.ts` | Implemented |
| `API-04` | API | FR-11, BR-27–BR-31, AC-12–AC-14 | Duplicate-submission and idempotency behavior | `server/tests/lab-02/create-ticket.api.test.ts` | Implemented |
| `API-05` | API | FR-13, FR-26, AC-18, AC-19, AC-26 | My Tickets ownership isolation, Requester switching, safe failures, and isolated data | `server/tests/lab-02/my-tickets.api.test.ts` | Implemented |
| `API-06` | API | FR-14–FR-18, AC-20–AC-25 | Search, filters, sorting, pagination, empty results, metadata, and query rejection | `server/tests/lab-02/my-tickets.api.test.ts` | Implemented |
| `API-07` | API | FR-19, FR-20, FR-26, AC-27–AC-29 | Owned Ticket Detail and cross-Requester rejection | `server/tests/lab-02/ticket-detail.api.test.ts` | Implemented |
| `API-08` | API | FR-12, FR-22, BR-43–BR-53, AC-15–AC-17, AC-30 | Attachment upload, validation, atomic active-count limit, storage, and compensation | `server/tests/lab-02/attachments.api.test.ts` | Implemented |
| `API-09` | API | FR-21, FR-23–FR-25, AC-31–AC-37 | Attachment metadata, preview, download, soft removal, and ownership | `server/tests/lab-02/attachments.api.test.ts` | Implemented |
| `API-10` | API | FR-30, BR-64, BR-65, AC-41 | Unexpected database and attachment-storage failures | `server/tests/lab-02/error-handling.api.test.ts` | Implemented |
| `UI-01` | UI component | FR-01–FR-04, AC-01–AC-06 | Development Requester loading, selection, persistence, route protection, empty, error, and switching states | `client/tests/lab-02/DevelopmentRequesterSelection.test.tsx` | Implemented |
| `UI-02` | UI component | FR-05–FR-07, AC-07 | Create Ticket reference-data loading and read-only Requester display | `client/tests/lab-02/CreateTicket.test.tsx` | Implemented |
| `UI-03` | UI component | FR-08–FR-11, AC-08–AC-14 | Create Ticket validation, busy, success, replay, and API-failure states | `client/tests/lab-02/CreateTicket.test.tsx` | Implemented |
| `UI-04` | UI component | FR-12, AC-15–AC-17 | Create Ticket Attachment selection, client validation, multipart upload, and partial-upload results | `client/tests/lab-02/CreateTicket.test.tsx`; `client/tests/lab-02/AttachmentUploadApi.test.tsx` | Implemented |
| `UI-05` | UI component | FR-13–FR-19, AC-18–AC-26 | My Tickets dates, links, controls, sorting, pagination, screen classification, accessibility, and Requester-safe loading | `client/tests/lab-02/MyTickets.test.tsx` | Implemented |
| `UI-06` | UI component | FR-19–FR-25, AC-27–AC-37 | Ticket Detail and Attachment lifecycle UI | `client/tests/lab-02/RequesterTicketDetail.test.tsx`; `client/tests/lab-02/AttachmentSection.test.tsx` | Implemented |
| `UI-07` | UI style/accessibility | FR-28, FR-29, AC-38–AC-40 | Zen Green tokens, responsive structure, focus, labels, status feedback, and non-color indicators | `client/tests/lab-02/UiStyleAccessibility.test.tsx` | Implemented |
| `E2E-01` | E2E | AC-05, AC-07, AC-08, AC-18, AC-27 | Requester selection, Ticket creation, validation, My Tickets, retry, and Ticket Detail | `e2e/lab-02/requester-ticket-flow.spec.ts` (consolidated) | Implemented |
| `E2E-02` | E2E | AC-06, AC-19, AC-29, AC-37 | Multi-Requester ownership isolation | `e2e/lab-02/requester-ticket-flow.spec.ts` (consolidated) | Implemented |
| `E2E-03` | E2E | AC-30–AC-36 | Upload, preview, download, soft removal, and blocked removed content | `e2e/lab-02/requester-ticket-flow.spec.ts` (consolidated) | Implemented |
| `E2E-04` | Responsive/visual | AC-38–AC-40 | Desktop, tablet, mobile, keyboard, accessible navigation, copy, and overflow behavior | `e2e/lab-02/requester-ticket-flow.spec.ts` (consolidated) | Implemented |
| `REG-01` | Regression | BR-67, AC-42 | Existing Lab 1 server and client behavior | `server/tests/lab-01/categories.test.ts`; `server/tests/lab-01/health.test.ts`; `client/tests/lab-01/App.test.tsx` | Implemented |

The four logical E2E identifiers are retained for traceability. Their six executable scenarios are intentionally consolidated in `e2e/lab-02/requester-ticket-flow.spec.ts`; no separate ownership, attachment, or responsive E2E files exist.

## 3. Acceptance-Criterion Traceability

Every Acceptance Criterion in `specification.md` maps to at least one implemented test at an existing repository path.

| Acceptance Criterion | Implemented Test IDs | Existing Automated Evidence |
| --- | --- | --- |
| `AC-01` | `API-01`, `UI-01` | `server/tests/lab-02/reference-data.api.test.ts`; `client/tests/lab-02/DevelopmentRequesterSelection.test.tsx` |
| `AC-02` | `API-01`, `UI-01` | `server/tests/lab-02/reference-data.api.test.ts`; `client/tests/lab-02/DevelopmentRequesterSelection.test.tsx` |
| `AC-03` | `API-01`, `UI-01` | `server/tests/lab-02/reference-data.api.test.ts`; `client/tests/lab-02/DevelopmentRequesterSelection.test.tsx` |
| `AC-04` | `UI-01` | `client/tests/lab-02/DevelopmentRequesterSelection.test.tsx` |
| `AC-05` | `UI-01`, `E2E-01` | `client/tests/lab-02/DevelopmentRequesterSelection.test.tsx`; `e2e/lab-02/requester-ticket-flow.spec.ts` |
| `AC-06` | `UI-01`, `E2E-02` | `client/tests/lab-02/DevelopmentRequesterSelection.test.tsx`; `e2e/lab-02/requester-ticket-flow.spec.ts` |
| `AC-07` | `API-01`, `UI-02`, `E2E-01` | `server/tests/lab-02/reference-data.api.test.ts`; `client/tests/lab-02/CreateTicket.test.tsx`; `e2e/lab-02/requester-ticket-flow.spec.ts` |
| `AC-08` | `UNIT-01`, `API-02`, `UI-03`, `E2E-01` | `server/tests/lab-02/ticket-number.unit.test.ts`; `server/tests/lab-02/create-ticket.api.test.ts`; `client/tests/lab-02/CreateTicket.test.tsx`; `e2e/lab-02/requester-ticket-flow.spec.ts` |
| `AC-09` | `UNIT-02`, `API-03`, `UI-03` | `server/tests/lab-02/ticket-validation.unit.test.ts`; `server/tests/lab-02/create-ticket.api.test.ts`; `client/tests/lab-02/CreateTicket.test.tsx` |
| `AC-10` | `UNIT-02`, `API-01`, `API-03` | `server/tests/lab-02/ticket-validation.unit.test.ts`; `server/tests/lab-02/reference-data.api.test.ts`; `server/tests/lab-02/create-ticket.api.test.ts` |
| `AC-11` | `API-03`, `UI-03` | `server/tests/lab-02/create-ticket.api.test.ts`; `client/tests/lab-02/CreateTicket.test.tsx` |
| `AC-12` | `API-04` | `server/tests/lab-02/create-ticket.api.test.ts` |
| `AC-13` | `API-04` | `server/tests/lab-02/create-ticket.api.test.ts` |
| `AC-14` | `API-04`, `UI-03` | `server/tests/lab-02/create-ticket.api.test.ts`; `client/tests/lab-02/CreateTicket.test.tsx` |
| `AC-15` | `UNIT-03`, `API-08`, `UI-04` | `server/tests/lab-02/attachment-validation.unit.test.ts`; `server/tests/lab-02/attachments.api.test.ts`; `client/tests/lab-02/CreateTicket.test.tsx` |
| `AC-16` | `UNIT-03`, `API-08` | `server/tests/lab-02/attachment-validation.unit.test.ts`; `server/tests/lab-02/attachments.api.test.ts` |
| `AC-17` | `API-08`, `UI-04` | `server/tests/lab-02/attachments.api.test.ts`; `client/tests/lab-02/CreateTicket.test.tsx`; `client/tests/lab-02/AttachmentUploadApi.test.tsx` |
| `AC-18` | `API-05`, `UI-05`, `E2E-01` | `server/tests/lab-02/my-tickets.api.test.ts`; `client/tests/lab-02/MyTickets.test.tsx`; `e2e/lab-02/requester-ticket-flow.spec.ts` |
| `AC-19` | `API-05`, `UI-05`, `E2E-02` | `server/tests/lab-02/my-tickets.api.test.ts`; `client/tests/lab-02/MyTickets.test.tsx`; `e2e/lab-02/requester-ticket-flow.spec.ts` |
| `AC-20` | `UNIT-04`, `API-06`, `UI-05` | `server/tests/lab-02/ticket-query.unit.test.ts`; `server/tests/lab-02/my-tickets.api.test.ts`; `client/tests/lab-02/MyTickets.test.tsx` |
| `AC-21` | `UNIT-04`, `API-06`, `UI-05` | `server/tests/lab-02/ticket-query.unit.test.ts`; `server/tests/lab-02/my-tickets.api.test.ts`; `client/tests/lab-02/MyTickets.test.tsx` |
| `AC-22` | `UNIT-04`, `API-06`, `UI-05` | `server/tests/lab-02/ticket-query.unit.test.ts`; `server/tests/lab-02/my-tickets.api.test.ts`; `client/tests/lab-02/MyTickets.test.tsx` |
| `AC-23` | `UNIT-04`, `API-06`, `UI-05` | `server/tests/lab-02/ticket-query.unit.test.ts`; `server/tests/lab-02/my-tickets.api.test.ts`; `client/tests/lab-02/MyTickets.test.tsx` |
| `AC-24` | `API-06`, `UI-05` | `server/tests/lab-02/my-tickets.api.test.ts`; `client/tests/lab-02/MyTickets.test.tsx` |
| `AC-25` | `API-06`, `UI-05` | `server/tests/lab-02/my-tickets.api.test.ts`; `client/tests/lab-02/MyTickets.test.tsx` |
| `AC-26` | `API-05`, `UI-05` | `server/tests/lab-02/my-tickets.api.test.ts`; `client/tests/lab-02/MyTickets.test.tsx` |
| `AC-27` | `API-07`, `UI-06`, `E2E-01` | `server/tests/lab-02/ticket-detail.api.test.ts`; `client/tests/lab-02/RequesterTicketDetail.test.tsx`; `e2e/lab-02/requester-ticket-flow.spec.ts` |
| `AC-28` | `UI-06` | `client/tests/lab-02/RequesterTicketDetail.test.tsx` |
| `AC-29` | `API-07`, `E2E-02` | `server/tests/lab-02/ticket-detail.api.test.ts`; `e2e/lab-02/requester-ticket-flow.spec.ts` |
| `AC-30` | `API-08`, `UI-06`, `E2E-03` | `server/tests/lab-02/attachments.api.test.ts`; `client/tests/lab-02/AttachmentSection.test.tsx`; `e2e/lab-02/requester-ticket-flow.spec.ts` |
| `AC-31` | `API-09`, `UI-06`, `E2E-03` | `server/tests/lab-02/attachments.api.test.ts`; `client/tests/lab-02/AttachmentSection.test.tsx`; `e2e/lab-02/requester-ticket-flow.spec.ts` |
| `AC-32` | `API-09`, `UI-06`, `E2E-03` | `server/tests/lab-02/attachments.api.test.ts`; `client/tests/lab-02/AttachmentSection.test.tsx`; `e2e/lab-02/requester-ticket-flow.spec.ts` |
| `AC-33` | `API-09`, `UI-06` | `server/tests/lab-02/attachments.api.test.ts`; `client/tests/lab-02/AttachmentSection.test.tsx` |
| `AC-34` | `API-09` | `server/tests/lab-02/attachments.api.test.ts` |
| `AC-35` | `API-09`, `UI-06`, `E2E-03` | `server/tests/lab-02/attachments.api.test.ts`; `client/tests/lab-02/AttachmentSection.test.tsx`; `e2e/lab-02/requester-ticket-flow.spec.ts` |
| `AC-36` | `API-09`, `E2E-03` | `server/tests/lab-02/attachments.api.test.ts`; `e2e/lab-02/requester-ticket-flow.spec.ts` |
| `AC-37` | `API-09`, `E2E-02` | `server/tests/lab-02/attachments.api.test.ts`; `e2e/lab-02/requester-ticket-flow.spec.ts` |
| `AC-38` | `UI-07`, `E2E-04` | `client/tests/lab-02/UiStyleAccessibility.test.tsx`; `e2e/lab-02/requester-ticket-flow.spec.ts` |
| `AC-39` | `UI-07`, `E2E-04` | `client/tests/lab-02/UiStyleAccessibility.test.tsx`; `e2e/lab-02/requester-ticket-flow.spec.ts` |
| `AC-40` | `UI-07`, `E2E-04` | `client/tests/lab-02/UiStyleAccessibility.test.tsx`; `e2e/lab-02/requester-ticket-flow.spec.ts` |
| `AC-41` | `API-03`, `API-10`, `E2E-01` | `server/tests/lab-02/create-ticket.api.test.ts`; `server/tests/lab-02/error-handling.api.test.ts`; `e2e/lab-02/requester-ticket-flow.spec.ts` |
| `AC-42` | `REG-01` | `server/tests/lab-01/categories.test.ts`; `server/tests/lab-01/health.test.ts`; `client/tests/lab-01/App.test.tsx` |

The earlier AC-04 inconsistency is corrected: protected-route redirection is mapped to its actual `UI-01` component test and is no longer attributed to `E2E-01`, whose implemented browser scenarios do not exercise that condition.

## 4. Responsive and Visual Verification

The passing `E2E-04` scenario checked every Lab 2 screen for unintended horizontal overflow at these widths:

* Mobile: `390px`
* Tablet: `768px` and `820px`
* Desktop: `1024px` and `1440px`

This execution covered Development Requester Selection, Create Ticket, My Tickets, and Ticket Detail. It also checked the accessible mobile navigation control and the approved invalid-file message. Component and style tests cover loading, empty, failure, validation, focus, labels, non-color status text, read-only presentation, and keyboard-operable controls.

The screenshots in Section 7 were visually inspected as retained evidence. They supplement automated assertions; they are not a pixel-diff approval baseline.

## 5. Verification Commands

### 5.1 Server

```powershell
cd server
npm test
npm run build
npm start
```

The production-start verification was a bounded smoke test of the compiled server and its health endpoint, followed by process cleanup.

### 5.2 Client

```powershell
cd client
npm test
npm run build
```

### 5.3 End-to-End

From the repository root:

```powershell
npm run test:e2e
```

The E2E harness scopes `NODE_ENV=test` to its own server execution and therefore uses the repository's existing in-memory Attachment storage adapter. Production storage defaults were not changed. A live SeaweedFS deployment was not exercised by this E2E run.

## 6. Latest Verified Results

The latest GREEN verification was performed after commit `0f4d48d` on the Issue #21 branch.

| Verification | Result |
| --- | --- |
| End-to-end suite | Passed: 6/6 scenarios |
| Client suite | Passed: 58/58 tests across 8 files |
| Server suite | Passed: 106/106 tests across 12 files |
| Client production build | Passed |
| Server production build | Passed |
| Compiled server production-start smoke test | Passed |
| `git diff --check` | Passed |
| Issue #21 E2E database cleanup | Passed: zero matching E2E Tickets remained |

All 26 planned logical Test IDs are implemented. Executable test counts differ from the 26 logical IDs because a logical ID may contain multiple test cases, while the four E2E IDs are implemented as six consolidated browser scenarios.

## 7. Automated E2E Evidence Index

These tracked screenshots were produced by the passing GREEN execution of `e2e/lab-02/requester-ticket-flow.spec.ts`.

### 7.1 Requester Selection

* `artifacts/lab-02/screenshots/requester-selection-desktop.png`

### 7.2 Create Ticket

* `artifacts/lab-02/screenshots/create-ticket-desktop.png`
* `artifacts/lab-02/screenshots/create-ticket-success.png`
* `artifacts/lab-02/screenshots/create-ticket-validation.png`

### 7.3 My Tickets

* `artifacts/lab-02/screenshots/my-tickets-desktop.png`
* `artifacts/lab-02/screenshots/my-tickets-filtered-desktop.png`

### 7.4 Ticket Detail

* `artifacts/lab-02/screenshots/ticket-detail-desktop.png`

### 7.5 Active and Removed Attachments

* `artifacts/lab-02/screenshots/attachment-active-and-removed.png`
* `artifacts/lab-02/screenshots/attachment-removed.png`

### 7.6 Safe Error and Ownership Protection

* `artifacts/lab-02/screenshots/safe-api-error.png`
* `artifacts/lab-02/screenshots/ownership-safe-not-found.png`

### 7.7 Responsive Desktop, Tablet, and Mobile Evidence

* Desktop (`1024px` and `1440px`): `artifacts/lab-02/screenshots/ticket-detail-tablet-large.png`, `artifacts/lab-02/screenshots/ticket-detail-desktop.png`
* Tablet (`768px` and `820px`): `artifacts/lab-02/screenshots/ticket-detail-tablet-boundary.png`, `artifacts/lab-02/screenshots/ticket-detail-tablet.png`
* Mobile (`390px`): `artifacts/lab-02/screenshots/ticket-detail-mobile.png`

`ticket-detail-desktop.png` appears in both the Ticket Detail and responsive groups because one tracked artifact provides both forms of evidence. All 15 tracked screenshot files are represented above.

## 8. Known Limitations and Deferred Concerns

* Real authentication, password handling, sessions, and production authorization remain outside Lab 2 scope.
* `X-Development-Requester-Id` is a development-only identity mechanism and must not be treated as production authentication.
* E2E Attachment behavior was verified with the scoped test environment and existing in-memory adapter; a live SeaweedFS deployment was not tested in Issue #21.
* Retained screenshots were inspected, but no automated visual-regression threshold or pixel baseline is claimed.
* Tests for IT Staff workflows, comments, internal notes, actions taken, status transitions, and administrator functions remain outside Lab 2 scope.
* Issue #21 peer review, release Pull Request, merge, release approval, and Issue closure remain pending.

## 9. Definition-of-Done Status

Technical verification is complete on the Issue #21 branch: automated E2E, client, server, production builds, compiled-server startup, responsive evidence, cleanup, and diff checks passed. Governance and release completion are separate: Issue #21 still requires peer review, its release Pull Request has not been created or merged, and no release or Issue closure is claimed.
