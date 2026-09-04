# Lab 2 Test Plan and Results

## 1. Test Strategy

Lab 2 uses Test-Driven Development and traceable automated evidence. Tests shall be planned from the approved requirements and Acceptance Criteria before implementation is declared complete.

The strategy contains the following levels:

* **Unit tests:** Verify isolated ticket-number, validation, attachment, and query rules.
* **API/integration tests:** Verify Express routes, Prisma persistence, ownership, validation, pagination, and failure responses.
* **UI component tests:** Verify React screen states, user interactions, validation messages, and API integration behavior.
* **UI style tests:** Verify required Zen Green classes, field states, labels, messages, and button behavior.
* **Responsive and visual tests:** Verify desktop, tablet, and mobile layouts using Playwright screenshots and visual inspection.
* **End-to-end tests:** Verify complete Requester workflows through the browser, API, and database.
* **Regression tests:** Verify that all Lab 1 behavior continues to pass.

Each automated test shall:

1. Identify the related Acceptance Criteria.
2. Fail for the expected reason before implementation when TDD is applicable.
3. Use controlled and repeatable test data.
4. Avoid depending on test execution order.
5. Clean up or isolate created records.
6. Verify both successful and failure behavior.
7. Record its actual test-file path and final result.

The `Final` column shall remain `Planned` until the test file exists and the documented command has been executed successfully on the final `main` branch.

## 2. Planned Tests

| Test ID   | Type                   | Requirement / AC                               | What It Tests                                                                                              | Expected Result                                                                                        | Automated Test File                                                                                       | Final   |
| --------- | ---------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------- |
| `UNIT-01` | Unit                   | BR-01–BR-05, AC-08                             | Ticket Number generation and yearly sequence formatting                                                    | Produces unique `TKT-YYYY-NNNNN` values and handles year boundaries                                    | `server/tests/lab-02/ticket-number.unit.test.ts`                                                          | Planned |
| `UNIT-02` | Unit                   | BR-19–BR-26, AC-09, AC-10                      | Ticket input trimming, required fields, lengths, enums, and reference validation                           | Valid data is accepted; invalid data produces field-specific errors                                    | `server/tests/lab-02/ticket-validation.unit.test.ts`                                                      | Planned |
| `UNIT-03` | Unit                   | BR-43–BR-49, AC-15, AC-16                      | Attachment extension, MIME type, size, filename, and count validation                                      | Permitted files pass; invalid type, size, name, or count fails safely                                  | `server/tests/lab-02/attachment-validation.unit.test.ts`                                                  | Planned |
| `UNIT-04` | Unit                   | BR-32–BR-42, AC-20–AC-23                       | Search, filter, sort, page, and page-size parameter parsing                                                | Valid parameters produce a normalized query; invalid parameters are rejected                           | `server/tests/lab-02/ticket-query.unit.test.ts`                                                           | Planned |
| `API-01`  | API                    | FR-01, FR-05, FR-06, AC-01–AC-03, AC-07, AC-10 | Active Development Requester, Category, and Related System endpoints                                       | Active records are returned in the defined order; inactive records are excluded; failures are safe     | `server/tests/lab-02/reference-data.api.test.ts`                                                          | Planned |
| `API-02`  | API                    | FR-08, FR-09, AC-08                            | Valid Ticket creation and persistence                                                                      | Returns `201`; saves one owned Ticket with generated number, timestamps, and `NEW` status              | `server/tests/lab-02/create-ticket.api.test.ts`                                                           | Planned |
| `API-03` | API | FR-10, FR-30, AC-09–AC-11, AC-41 | Ticket creation validation, unknown-field rejection, and safe failure responses | Invalid or unknown fields return `400` with `VALIDATION_ERROR`; no invalid Ticket is saved | `server/tests/lab-02/create-ticket.api.test.ts` | Planned |
| `API-04`  | API                    | FR-11, BR-27–BR-31, AC-12–AC-14                | Duplicate-submission and idempotency behavior                                                              | Identical replay returns existing Ticket; changed payload returns `409`; no duplicate is saved         | `server/tests/lab-02/create-ticket.api.test.ts`                                                           | Planned |
| `API-05`  | API                    | FR-13, FR-26, AC-18, AC-19, AC-26              | My Tickets ownership isolation and requester switching                                                     | Returns only the selected Requester’s Tickets and never leaks another Requester’s data                 | `server/tests/lab-02/my-tickets.api.test.ts`                                                              | Planned |
| `API-06`  | API                    | FR-14–FR-18, AC-20–AC-25                       | Search, filters, sorting, pagination, empty, and no-results behavior                                       | Returns correct ordered items and accurate pagination metadata                                         | `server/tests/lab-02/my-tickets.api.test.ts`                                                              | Planned |
| `API-07`  | API                    | FR-19, FR-20, FR-26, AC-27–AC-29               | Owned Ticket Detail and cross-Requester rejection                                                          | Owned Ticket returns `200`; missing or unowned Ticket returns `404` without data                       | `server/tests/lab-02/ticket-detail.api.test.ts`                                                           | Planned |
| `API-08`  | API                    | FR-12, FR-22, BR-43–BR-53, AC-15–AC-17, AC-30  | Attachment upload, validation, limits, storage, and partial failure                                        | Valid file returns `201`; invalid file is rejected; Ticket remains saved after upload failure          | `server/tests/lab-02/attachments.api.test.ts`                                                             | Planned |
| `API-09`  | API                    | FR-21, FR-23–FR-25, AC-31–AC-37                | Attachment metadata, preview, download, soft removal, and ownership                                        | Active content is available; removal metadata is retained; removed or unowned content is blocked       | `server/tests/lab-02/attachments.api.test.ts`                                                             | Planned |
| `API-10`  | API                    | FR-30, BR-64, BR-65, AC-41                     | Unexpected database and SeaweedFS failures                                                                 | Returns safe `500` response without internal details and logs the server-side failure                  | `server/tests/lab-02/error-handling.api.test.ts`                                                          | Planned |
| `UI-01`   | UI component           | FR-01–FR-04, AC-01–AC-06                       | Development Requester loading, selection, persistence, empty, error, and switching states                  | Correct state and navigation are displayed for every scenario                                          | `client/tests/lab-02/DevelopmentRequesterSelection.test.tsx`                                                 | Planned |
| `UI-02`   | UI component           | FR-05–FR-07, AC-07                             | Create Ticket reference-data loading and read-only Requester display                                       | Active reference data loads and required/read-only fields render correctly                             | `client/tests/lab-02/CreateTicket.test.tsx`                                                               | Planned |
| `UI-03`   | UI component           | FR-08–FR-11, AC-08–AC-14                       | Create Ticket validation, busy, success, replay, and API-failure states                                    | API is called only with valid data; busy prevents repeat; values survive failure                       | `client/tests/lab-02/CreateTicket.test.tsx`                                                               | Planned |
| `UI-04`   | UI component           | FR-12, AC-15–AC-17                             | Attachment selection, invalid-file feedback, and partial-upload results                                    | Valid files remain selected; invalid files show specific errors; partial failure is explained          | `client/tests/lab-02/AttachmentSection.test.tsx`                                                          | Planned |
| `UI-05`   | UI component           | FR-13–FR-18, AC-18–AC-26                       | My Tickets list, search, filters, sorting, pagination, and screen states                                   | Correct controls, items, metadata, empty, no-results, and failure states render                        | `client/tests/lab-02/MyTickets.test.tsx`                                                                  | Planned |
| `UI-06`   | UI component           | FR-19–FR-25, AC-27–AC-37                       | Ticket Detail and Attachment lifecycle UI                                                                  | Ticket fields are read-only; prohibited controls are absent; Attachment states and actions are correct | `client/tests/lab-02/RequesterTicketDetail.test.tsx` and `client/tests/lab-02/AttachmentSection.test.tsx` | Planned |
| `UI-07`   | UI style/accessibility | FR-28, FR-29, AC-38–AC-40                      | Zen Green tokens, editable/read-only styles, validation placement, focus, labels, and non-color indicators | Required classes and accessible UI behavior are present                                                | `client/tests/lab-02/UiStyleAccessibility.test.tsx`                                                       | Planned |
| `E2E-01`  | E2E                    | AC-05, AC-07, AC-08, AC-18, AC-27              | Complete Requester selection, Ticket creation, My Tickets, and Ticket Detail flow                          | Created Ticket Number appears and the same Ticket can be found and opened                              | `e2e/lab-02/requester-ticket-flow.spec.ts`                                                                | Planned |
| `E2E-02`  | E2E                    | AC-06, AC-19, AC-29, AC-37                     | Multi-Requester ownership isolation                                                                        | Switching Requesters changes visible data and direct cross-Requester access is rejected                | `e2e/lab-02/requester-ownership.spec.ts`                                                                  | Planned |
| `E2E-03`  | E2E                    | AC-30–AC-36                                    | Add, preview, download, soft-remove, and block removed Attachment                                          | Complete Attachment lifecycle matches the approved specification                                       | `e2e/lab-02/attachment-lifecycle.spec.ts`                                                                 | Planned |
| `E2E-04`  | Responsive/visual      | AC-38–AC-40                                    | Desktop, tablet, mobile, keyboard, and non-color presentation                                              | Screenshots contain no clipping, overlap, hidden actions, or unintended horizontal scrolling           | `e2e/lab-02/responsive-visual.spec.ts`                                                                    | Planned |
| `REG-01`  | Regression             | BR-67, AC-42                                   | Existing Lab 1 server and client tests                                                                     | All original Lab 1 tests continue to pass unchanged                                                    | `server/tests/lab-01/*.test.ts` and `client/tests/lab-01/App.test.tsx`                                    | Planned |

## 3. Acceptance-Criterion Traceability

Every Acceptance Criterion in `specification.md` is mapped to at least one planned test.

| Acceptance Criterion | Planned Test IDs                       |
| -------------------- | -------------------------------------- |
| `AC-01`              | `API-01`, `UI-01`                      |
| `AC-02`              | `API-01`, `UI-01`                      |
| `AC-03`              | `API-01`, `UI-01`                      |
| `AC-04`              | `UI-01`, `E2E-01`                      |
| `AC-05`              | `UI-01`, `E2E-01`                      |
| `AC-06`              | `UI-01`, `E2E-02`                      |
| `AC-07`              | `API-01`, `UI-02`, `E2E-01`            |
| `AC-08`              | `UNIT-01`, `API-02`, `UI-03`, `E2E-01` |
| `AC-09`              | `UNIT-02`, `API-03`, `UI-03`           |
| `AC-10`              | `UNIT-02`, `API-01`, `API-03`          |
| `AC-11`              | `API-03`, `UI-03`                      |
| `AC-12`              | `API-04`                               |
| `AC-13`              | `API-04`                               |
| `AC-14`              | `API-04`, `UI-03`                      |
| `AC-15`              | `UNIT-03`, `API-08`, `UI-04`           |
| `AC-16`              | `UNIT-03`, `API-08`                    |
| `AC-17`              | `API-08`, `UI-04`                      |
| `AC-18`              | `API-05`, `UI-05`, `E2E-01`            |
| `AC-19`              | `API-05`, `UI-05`, `E2E-02`            |
| `AC-20`              | `UNIT-04`, `API-06`, `UI-05`           |
| `AC-21`              | `UNIT-04`, `API-06`, `UI-05`           |
| `AC-22`              | `UNIT-04`, `API-06`, `UI-05`           |
| `AC-23`              | `UNIT-04`, `API-06`, `UI-05`           |
| `AC-24`              | `API-06`, `UI-05`                      |
| `AC-25`              | `API-06`, `UI-05`                      |
| `AC-26`              | `API-05`, `UI-05`                      |
| `AC-27`              | `API-07`, `UI-06`, `E2E-01`            |
| `AC-28`              | `UI-06`                                |
| `AC-29`              | `API-07`, `E2E-02`                     |
| `AC-30`              | `API-08`, `UI-06`, `E2E-03`            |
| `AC-31`              | `API-09`, `UI-06`, `E2E-03`            |
| `AC-32`              | `API-09`, `UI-06`, `E2E-03`            |
| `AC-33`              | `API-09`, `UI-06`                      |
| `AC-34`              | `API-09`                               |
| `AC-35`              | `API-09`, `UI-06`, `E2E-03`            |
| `AC-36`              | `API-09`, `E2E-03`                     |
| `AC-37`              | `API-09`, `E2E-02`                     |
| `AC-38`              | `UI-07`, `E2E-04`                      |
| `AC-39`              | `UI-07`, `E2E-04`                      |
| `AC-40`              | `UI-07`, `E2E-04`                      |
| `AC-41`              | `API-03`, `API-10`                     |
| `AC-42`              | `REG-01`                               |


## 4. Responsive and Visual Test Checklist

The following checks shall be performed at desktop, tablet, and mobile viewport sizes. Evidence screenshots shall be stored under `artifacts/lab-02/screenshots/`.

### 4.1 Development Requester Selection

* [ ] Active Development Requesters are displayed correctly.
* [ ] Loading, empty, and API-error states are visible and understandable.
* [ ] The selected Requester is clearly highlighted.
* [ ] The Continue action is unavailable until a Requester is selected.
* [ ] Keyboard navigation and visible focus indicators work correctly.
* [ ] The screen does not clip content or create unintended horizontal scrolling.

### 4.2 Create Ticket

* [ ] Category and Related System options load from the API.
* [ ] The selected Development Requester is displayed as read-only.
* [ ] Initial, loading, validation-error, submitting, success, and API-error states are distinguishable.
* [ ] Required fields and field-level validation messages are visible.
* [ ] Duplicate submission is prevented while the request is processing.
* [ ] Invalid attachment type, size, and count messages are displayed.
* [ ] Successful creation displays the backend-generated Ticket Number.
* [ ] The form remains usable at desktop, tablet, and mobile sizes.

### 4.3 My Tickets

* [ ] Loading, populated, empty, no-results, and API-error states are displayed.
* [ ] Search, filters, sorting, page-size selection, and pagination remain usable.
* [ ] Ticket rows or cards display the required summary information.
* [ ] Long summaries do not break the layout.
* [ ] Ownership-safe results are maintained when the selected Requester changes.
* [ ] Desktop, tablet, and mobile layouts do not overlap or clip content.

### 4.4 Ticket Detail and Attachments

* [ ] Ticket information is displayed as read-only.
* [ ] Active and removed attachments are visually distinguishable.
* [ ] Upload progress and upload failure feedback are displayed.
* [ ] Download and remove controls are available only for active attachments.
* [ ] Attachment removal requires a reason and confirmation.
* [ ] Removed attachment content cannot be previewed or downloaded.
* [ ] The screen remains usable at desktop, tablet, and mobile sizes.

### 4.5 Zen Green and Accessibility

* [ ] Zen Green colors, typography, spacing, cards, and controls are consistent.
* [ ] Primary, secondary, destructive, and disabled actions are distinguishable.
* [ ] Editable and read-only fields are visually different.
* [ ] Text and controls have sufficient contrast.
* [ ] Every interactive control has a visible keyboard focus state.
* [ ] Form controls have accessible labels.
* [ ] Validation and status feedback do not rely on color alone.
* [ ] Touch targets remain usable on mobile screens.

## 5. Planned Test Commands

The exact scripts may be added or updated during implementation, but the intended verification commands are:

### 5.1 Server

```powershell
cd server
npm test
npm run build
```

### 5.2 Client

```powershell
cd client
npm test
npm run build
```

### 5.3 End-to-End

Run from the repository root after the Playwright configuration and root E2E script are added:

```powershell
npm run test:e2e
```

### 5.4 Full Regression

The final verification shall execute:

1. Server unit and API/integration tests.
2. Client component and style tests.
3. Client and server production builds.
4. Playwright end-to-end tests.
5. Manual responsive and Zen Green visual checks.
6. Existing Lab 1 regression tests.

## 6. Test Execution Results

This engineering contract is prepared before implementation. Therefore, no Lab 2 test is marked as passed at this stage.

| Test Level                | Planned Tests | Passed | Failed | Current Status       |
| ------------------------- | ------------: | -----: | -----: | -------------------- |
| Unit                      |             4 |      0 |      0 | Planned              |
| API/Integration           |            10 |      0 |      0 | Planned              |
| UI Component and Style    |             7 |      0 |      0 | Planned              |
| End-to-End and Responsive |             4 |      0 |      0 | Planned              |
| Lab 1 Regression          |             1 |      0 |      0 | Planned              |
| **Total**                 |        **26** |  **0** |  **0** | **Not executed yet** |

The results table shall be updated after implementation and before the Lab 2 release Pull Request is merged.

## 7. Known Limitations and Deferred Test Concerns

* Real authentication, password handling, sessions, and production authorization are outside the Lab 2 scope.
* `X-Development-Requester-Id` is a development-only identity mechanism and must not be treated as production authentication.
* Attachment integration and E2E tests require the local single-node SeaweedFS service to be available or replaced by a controlled test double.
* Visual approval requires manual inspection and retained screenshots in addition to automated assertions.
* Tests for IT Staff workflows, comments, internal notes, actions taken, status transitions, and administrator functions are deferred because those features are outside the Lab 2 scope.
* No Lab 2 test result shall be reported as passed until the associated test has been implemented and executed successfully.
