# Lab 2 Sprint Engineering Specification

## 1. Sprint Goal


The goal of Lab 2 is to extend the existing TokTickIT Lab 1 application into a responsive Requester-facing ticketing MVP. A selected Development Requester can create a support ticket, view and find their own tickets, open Ticket Detail, and manage permitted attachments. The increment must preserve the existing React, Express, Prisma, and PostgreSQL foundation while introducing reusable Zen Green UI conventions, testable API behavior, ownership protection, and traceable automated tests.

## 2. Stakeholder Request Interpretation

The stakeholder needs a professional ticketing experience for end users who submit IT support requests. Because real authentication is planned for Lab 3, Lab 2 uses a temporary Development Requester selector to simulate the current user. The selected Requester determines the ownership context for creating tickets, viewing My Tickets, opening Ticket Detail, and managing attachments.

The backend is responsible for generating the official Ticket Number, validating submitted data, storing ticket information, and preventing access to another Requester’s tickets or attachments. The interface must provide clear loading, validation, success, empty, no-results, and failure states. All screens must follow the reusable Zen Green visual language and work at desktop, tablet, and mobile viewport sizes.

## 3. Scope

### 3.1 Included

* A Development Requester Selection screen that loads active Requesters from PostgreSQL.
* Storage and display of the selected Development Requester as the temporary user context.
* A Change Requester action that reloads requester-specific information.
* A Create Ticket screen containing Ticket Number, Ticket Date, Requester, Category, Related System, Ticket Summary, Requested Priority, Description, and Attachments.
* Backend generation of a unique official Ticket Number.
* Creation of every new Ticket with the initial Current Status of `NEW`.
* Frontend and backend validation with clear field-level messages.
* Duplicate-submission prevention and a disabled busy-state Submit button.
* Attachment selection and upload for JPG/JPEG, PNG, WEBP, and PDF files.
* A maximum attachment size of 5 MB per file and a maximum of five active attachments per Ticket.
* A My Tickets screen with search, filtering, sorting, pagination, loading, empty, no-results, and API-failure states.
* A read-only Requester Ticket Detail screen.
* Adding and downloading active attachments from an owned Ticket.
* Soft removal of an owned attachment with retained metadata and blocked preview or download.
* Backend ownership checks for Ticket and Attachment operations.
* Seed data for Categories, Related Systems, active Development Requesters, and one inactive Development Requester.
* REST APIs required for reference data, Requester selection, ticket creation, ticket listing, owned-ticket detail, and attachment management.
* Responsive and accessible Zen Green UI behavior for desktop, tablet, and mobile screens.
* Unit, API/integration, UI component, UI style, responsive, and end-to-end tests.
* GitHub Issues, feature branches, Pull Requests, peer review, staged integration, and traceable completion evidence.

### 3.2 Excluded

* Real login, logout, passwords, password hashing, sessions, tokens, and authenticated user identities.
* Production role-based authorization; the Development Requester selector is only a testing mechanism.
* IT Staff dashboards, queues, ticket claiming, reassignment, and IT Priority modification.
* Public Comments, Internal Notes, and Actions Taken.
* Ticket status changes after creation, including resolving, closing, reopening, and cancelling.
* Resolution confirmation and later ticket-workflow functionality.
* Administrator management of users, roles, Requesters, Categories, and Related Systems.
* Email and in-app notification delivery.
* Any feature that belongs to Lab 3 or a later sprint.


## 4. Functional Requirements

* **FR-01:** The system shall retrieve and display active Development Requesters from PostgreSQL on the Development Requester Selection screen.
* **FR-02:** The system shall require the user to select a Development Requester before accessing Create Ticket, My Tickets, or Ticket Detail.
* **FR-03:** The application shall display the selected Requester’s identity and provide a Change Requester action.
* **FR-04:** When the Development Requester changes, the application shall clear or reload all requester-specific ticket data.
* **FR-05:** The system shall retrieve active Categories from PostgreSQL while preserving the existing Lab 1 category functionality.
* **FR-06:** The system shall retrieve active Related Systems from PostgreSQL.
* **FR-07:** The Create Ticket screen shall display Ticket Number, Ticket Date, Requester, Category, Related System, Ticket Summary, Requested Priority, Description, and Attachments.
* **FR-08:** The Requester shall be able to submit valid ticket information to create one Ticket owned by the currently selected Development Requester.
* **FR-09:** After successful creation, the system shall display the backend-generated official Ticket Number and provide actions to view the Ticket or create another Ticket.
* **FR-10:** The Create Ticket screen shall provide field-level validation messages and preserve entered values when validation or an API request fails.
* **FR-11:** The system shall prevent duplicate Ticket creation while a submission is in progress or when the same submission is retried.
* **FR-12:** The Requester shall be able to select permitted attachments when creating a Ticket.
* **FR-13:** The My Tickets screen shall display only Tickets owned by the currently selected Development Requester.
* **FR-14:** The Requester shall be able to search My Tickets by official Ticket Number or Ticket Summary.
* **FR-15:** The Requester shall be able to filter My Tickets by Category, Related System, Requested Priority, and Current Status.
* **FR-16:** The Requester shall be able to sort My Tickets using the supported sort fields and directions.
* **FR-17:** The My Tickets screen shall provide server-side pagination and display the current page, page size, total item count, and total page count.
* **FR-18:** The My Tickets screen shall provide distinct loading, empty, no-results, and safe API-failure states.
* **FR-19:** The Requester shall be able to open the Ticket Detail screen for a Ticket they own.
* **FR-20:** The Ticket Detail screen shall display the current Ticket information as read-only and shall not expose IT Staff workflow controls.
* **FR-21:** The Ticket Detail screen shall display active and removed Attachment metadata with visually distinct states.
* **FR-22:** The Requester shall be able to upload a permitted Attachment to an existing Ticket they own.
* **FR-23:** The Requester shall be able to preview or download an active Attachment belonging to a Ticket they own.
* **FR-24:** The Requester shall be able to soft-remove an active Attachment from a Ticket they own after confirming the action and providing a removal reason.
* **FR-25:** The system shall prevent removed Attachments from being previewed or downloaded.
* **FR-26:** The backend shall enforce Requester ownership when listing Tickets, retrieving Ticket Detail, and uploading, retrieving, downloading, or removing Attachments.
* **FR-27:** The application shall provide navigation between Development Requester Selection, My Tickets, Create Ticket, and Ticket Detail.
* **FR-28:** All Lab 2 screens shall follow the Zen Green UI specification and remain usable at desktop, tablet, and mobile viewport sizes.
* **FR-29:** All interactive controls shall support keyboard operation, visible focus, accessible labels, and feedback that does not rely on color alone.
* **FR-30:** Unexpected server failures shall return safe error messages without exposing stack traces, database details, or file-system paths.


## 5. Business Rules

### 5.1 Ticket Identification and Defaults

* **BR-01:** The backend shall generate every official Ticket Number. The client shall never create or modify it.
* **BR-02:** The Ticket Number shall use the format `TKT-YYYY-NNNNN`, where `YYYY` is the creation year and `NNNNN` is a five-digit sequence.
* **BR-03:** Ticket Number generation shall be transaction-safe and unique. The annual sequence shall restart at `00001` for a new year.
* **BR-04:** Every new Ticket shall begin with Current Status `NEW`.
* **BR-05:** Ticket Date, creation timestamp, and update timestamp shall be generated by the backend and stored in UTC.
* **BR-06:** Ticket Number, Ticket Date, Requester, Current Status, IT Priority, and Ticket Owner shall be read-only on Requester screens. IT Priority and Ticket Owner may be unset in Lab 2.

### 5.2 Development Requester Context

* **BR-07:** The Development Requester selector is a testing mechanism only and shall not be described or implemented as secure authentication.
* **BR-08:** Only active Development Requesters shall appear in the selector.
* **BR-09:** An inactive or nonexistent Development Requester shall be rejected when used for a requester-specific operation.
* **BR-10:** The selected Development Requester ID shall be stored in browser `sessionStorage` so it survives page refreshes within the same browser tab but is not treated as a secure identity.
* **BR-11:** Requester-specific API requests shall send the selected Requester ID in the `X-Development-Requester-Id` header.
* **BR-12:** If no valid Development Requester is selected, the application shall redirect the user to the Development Requester Selection screen.
* **BR-13:** Changing the Development Requester shall clear cached requester-specific Ticket data and reload the destination screen using the newly selected Requester.
* **BR-14:** A Ticket shall store the Requester ID that was selected when the Ticket was created.

### 5.3 Ownership

* **BR-15:** Ticket-list queries shall return only Tickets owned by the selected Development Requester.
* **BR-16:** The backend shall perform ownership checks for Ticket Detail and every Attachment operation; client-side hiding alone is insufficient.
* **BR-17:** When the selected Requester requests another Requester’s Ticket or Attachment, the API shall return `404 Not Found` without returning ownership or resource details.
* **BR-18:** Switching Requesters shall immediately prevent the previous Requester’s Ticket data from remaining visible.

### 5.4 Ticket Input and Validation

* **BR-19:** Category, Related System, Ticket Summary, Requested Priority, and Description are required when creating a Ticket.
* **BR-20:** Category and Related System IDs must exist and be active at the time of Ticket creation.
* **BR-21:** Requested Priority shall be one of `LOW`, `MEDIUM`, `HIGH`, or `URGENT`.
* **BR-22:** Ticket Summary shall be trimmed and contain between 5 and 150 characters.
* **BR-23:** Description shall be trimmed and contain between 10 and 5,000 characters.
* **BR-24:** Values containing only whitespace shall be treated as empty.
* **BR-25:** Frontend validation shall provide immediate feedback, but the backend remains the authoritative validator.
* **BR-26:** A validation or API failure shall preserve the Requester’s valid form values and selected valid files whenever possible.

### 5.5 Duplicate-Submission Prevention

* **BR-27:** The client shall generate one UUID `clientSubmissionId` for each Create Ticket form attempt.
* **BR-28:** The Submit button shall be disabled and show a busy state while creation is in progress.
* **BR-29:** The database shall enforce uniqueness for `clientSubmissionId`.
* **BR-30:** Repeating the same `clientSubmissionId` with the same Requester and payload shall return the previously created Ticket instead of creating a duplicate.
* **BR-31:** Reusing a `clientSubmissionId` with different Ticket data shall return `409 Conflict`.

### 5.6 Search, Filtering, Sorting, and Pagination

* **BR-32:** Search shall be case-insensitive and match the official Ticket Number or Ticket Summary.
* **BR-33:** Search text shall be trimmed and limited to 100 characters.
* **BR-34:** Supported filters shall include Category, Related System, Requested Priority, and Current Status.
* **BR-35:** Unsupported filter values or sort fields shall return `400 Bad Request`.
* **BR-36:** Supported sort fields shall include Ticket Number, Ticket Date, Last Updated, Summary, and Requested Priority.
* **BR-37:** The default sorting shall be Last Updated descending, followed by Ticket ID descending to provide stable ordering.
* **BR-38:** The default page shall be `1`, and the default page size shall be `10`.
* **BR-39:** Permitted page sizes shall be `10`, `25`, and `50`.
* **BR-40:** Page numbers less than `1` or unsupported page sizes shall return `400 Bad Request`.
* **BR-41:** A valid page beyond the final page shall return an empty `items` array with correct pagination metadata.
* **BR-42:** An empty state means the selected Requester owns no Tickets. A no-results state means Tickets exist but none match the current search or filters.

### 5.7 Attachment Rules

* **BR-43:** Permitted file types are JPG/JPEG, PNG, WEBP, and PDF.
* **BR-44:** File type validation shall check the detected content type and permitted extension rather than trusting the filename alone.
* **BR-45:** Each file shall be no larger than 5 MB (`5,000,000` bytes).
* **BR-46:** A Ticket shall have no more than five active Attachments.
* **BR-47:** An invalid file shall be rejected without preventing other valid selected files from being identified.
* **BR-48:** The system shall preserve the original filename for display but use a server-generated storage identifier to prevent filename collisions and path traversal.
* **BR-49:** Attachment metadata shall include the original filename, stored identifier, MIME type, size in bytes, upload time, uploader Requester ID, removal state, and removal details when applicable.
* **BR-50:** Ticket creation and Attachment upload shall be separate operations. A successfully created Ticket shall remain saved if one or more Attachment uploads fail.
* **BR-51:** After a partial Attachment failure, the success screen shall display the official Ticket Number, identify failed files safely, and allow the Requester to retry from Ticket Detail.
* **BR-52:** Each Attachment upload shall be handled atomically. Failed storage shall not leave usable orphaned metadata, and failed metadata creation shall trigger cleanup of the stored file.
* **BR-53:** Only the selected Requester who owns the Ticket may upload, download, preview, or remove its Attachments.
* **BR-54:** Soft removal shall require a confirmation action and a trimmed removal reason between 5 and 200 characters.
* **BR-55:** Soft removal shall record `isRemoved`, `removedAt`, `removedByRequesterId`, and `removalReason`.
* **BR-56:** Removed Attachment metadata shall remain visible on Ticket Detail with a Removed state.
* **BR-57:** Removed Attachments shall not be previewed or downloaded. A content request for an owned removed Attachment shall return `410 Gone`.
* **BR-58:** Attachment metadata shall not be hard-deleted during Lab 2.

### 5.8 Reference Data and Seed Rules

* **BR-59:** The existing Lab 1 Categories—Account and Access, Hardware, Software, and Network—shall be preserved.
* **BR-60:** Seed execution shall be idempotent and shall not create duplicate records.
* **BR-61:** Seed data shall contain at least six realistic Related Systems.
* **BR-62:** Seed data shall contain at least four active Development Requesters and at least one inactive Development Requester.
* **BR-63:** The inactive Development Requester shall remain in PostgreSQL for testing but shall not appear in the selection dropdown.

### 5.9 Failure and Presentation Rules

* **BR-64:** API errors shall use a consistent safe response structure containing an error code, user-safe message, and field errors when applicable.
* **BR-65:** Unexpected errors shall be logged on the server without exposing stack traces, SQL messages, storage paths, or secrets to the client.
* **BR-66:** Loading, empty, no-results, success, warning, and failure states shall be visually distinguishable and shall not rely on color alone.
* **BR-67:** Existing Lab 1 health-check and Category behavior and tests shall continue to pass after the Lab 2 increment.


## 6. UI Specification Summary

The detailed visual and interaction rules are maintained in `docs/lab-02/ui-spec.md`. All Lab 2 screens shall use a shared application shell and reusable components rather than screen-specific styling.

### 6.1 Application Shell

* Display the TokTickIT name and application identity.
* Provide navigation links for My Tickets and Create Ticket.
* Clearly indicate the active page.
* Display the selected Development Requester’s name.
* Provide a visible Change Requester action.
* Collapse navigation into a keyboard-accessible mobile menu when space is limited.

### 6.2 Development Requester Selection

The screen shall contain:

* A clear explanation that the selector is for Lab 2 testing and is not a real login screen.
* A dropdown populated with active Development Requesters from PostgreSQL.
* A primary Continue button.
* Loading, empty, API-failure, and ready states.
* Keyboard-accessible controls and visible focus indicators.

After a valid selection, the application shall store the Requester ID in `sessionStorage` and navigate to My Tickets. No active Requesters shall produce an empty state rather than an unusable dropdown.

### 6.3 Create Ticket

The screen shall group information into clear sections:

1. System-generated information: Ticket Number and Ticket Date.
2. Requester information: selected Requester shown as read-only.
3. Classification: Category, Related System, and Requested Priority.
4. Ticket content: Ticket Summary and Description.
5. Attachments: selected files, validation results, and removal before submission.
6. Actions: Submit Ticket and Clear Form.

Editable fields shall use a white background. Read-only fields shall use distinct soft gray-green or ivory styling. Required fields shall include a visible asterisk and an accessible required indication.

The screen shall support initial, reference-data loading, ready, validation failure, submitting, success, partial-attachment failure, and API-failure states. The success state shall show the generated Ticket Number and actions to view the Ticket or create another Ticket.

### 6.4 My Tickets

The desktop layout shall use a table containing enough information to identify and open a Ticket. The initial columns shall be:

* Ticket Number
* Ticket Date
* Summary
* Category
* Related System
* Requested Priority
* Current Status
* Last Updated

The screen shall provide search, Category filter, Related System filter, Requested Priority filter, Current Status filter, sorting, Clear Filters, pagination, and Create Ticket actions.

On mobile screens, each Ticket shall be displayed as a readable card or responsive row without requiring horizontal page scrolling. Empty, no-results, loading, and API-failure states shall be visually distinct.

### 6.5 Ticket Detail and Attachments

Ticket Detail shall present all current Ticket information as read-only. It shall not show Public Comments, Internal Notes, Actions Taken, status changes, or IT Staff workflow controls.

The Attachment section shall display:

* Original filename
* File type
* File size
* Upload time
* Active or Removed state
* Preview or Download action for active files
* Remove action for active files
* Removal time and reason for removed files

Removing an Attachment shall require confirmation and a valid reason. Removed Attachments shall remain visible as metadata but shall not provide preview or download controls.

### 6.6 Zen Green Visual Rules

| Token or element | Required value or behavior                                |
| ---------------- | --------------------------------------------------------- |
| Primary green    | `#006B3C`                                                 |
| Secondary green  | `#0B7A46`                                                 |
| Pale green       | `#EAF6EF`                                                 |
| Page background  | `#F5F7F6`                                                 |
| Surface          | White with a subtle border and restrained shadow          |
| Main text        | Dark charcoal-green                                       |
| Editable field   | White background with a neutral border                    |
| Read-only field  | Soft gray-green or warm ivory background                  |
| Error            | Dark red border, icon or text, and nearby message         |
| Warning          | Amber callout or badge                                    |
| Success          | Green confirmation with text or icon in addition to color |

Primary, secondary, tertiary, destructive, disabled, and busy buttons shall have consistent styles. Validation messages shall appear immediately below their related fields.

### 6.7 Responsive and Accessibility Rules

* Desktop at `992px` or wider shall use a centered multi-column layout with a sensible maximum width.
* Tablet from `768px` to `991px` shall use two columns where practical.
* Mobile below `768px` shall stack fields vertically.
* No supported viewport shall contain clipped labels, overlapping messages, hidden buttons, or horizontal page scrolling.
* Buttons and interactive controls shall remain touch-friendly.
* Every form control shall have an associated label.
* Icon-only controls shall have an accessible name and tooltip.
* Keyboard focus shall remain visible.
* Status and validation information shall not rely on color alone.

## 7. Data Changes

The Lab 2 database increment shall extend the existing Lab 1 Prisma schema. The current `Category` model and the four existing Category records shall be preserved.

### 7.1 Models and Fields

| Model                  | Purpose                                                        | Required fields                                                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Category`             | Existing Lab 1 ticket classification                           | `id`, `name`, `isActive`, `createdAt`, `updatedAt`                                                                                                                                   |
| `RelatedSystem`        | Service, application, device, or platform affected by a Ticket | `id`, `name`, `isActive`, `createdAt`, `updatedAt`                                                                                                                                   |
| `DevelopmentRequester` | Temporary Requester identity used only for Lab 2 testing       | `id`, `name`, `email`, `isActive`, `createdAt`, `updatedAt`                                                                                                                          |
| `TicketNumberSequence` | Transaction-safe annual Ticket Number sequence                 | `year`, `lastValue`, `updatedAt`                                                                                                                                                     |
| `Ticket`               | Requester-owned IT support request                             | `id`, `ticketNumber`, `clientSubmissionId`, `requesterId`, `categoryId`, `relatedSystemId`, `summary`, `requestedPriority`, `description`, `currentStatus`, `createdAt`, `updatedAt` |
| `Attachment`           | Metadata for a file associated with a Ticket                   | `id`, `ticketId`, `originalFilename`, `storageKey`, `mimeType`, `sizeBytes`, `uploadedByRequesterId`, `isRemoved`, `createdAt`, `removedAt`, `removedByRequesterId`, `removalReason`     |

### 7.2 Enumerations

`RequestedPriority` shall contain:

```text
LOW
MEDIUM
HIGH
URGENT
```

`TicketStatus` shall support the approved TokTickIT lifecycle:

```text
NEW
ASSIGNED
IN_PROGRESS
PENDING_REQUESTER
RESOLVED
CLOSED
CANCELLED
```

Lab 2 shall create Tickets only with `NEW` and shall not provide any status-transition operation.

### 7.3 Relationships

* One `DevelopmentRequester` may own zero or many `Ticket` records.
* Every `Ticket` belongs to exactly one `DevelopmentRequester`.
* One `Category` may be referenced by zero or many `Ticket` records.
* Every `Ticket` belongs to exactly one `Category`.
* One `RelatedSystem` may be referenced by zero or many `Ticket` records.
* Every `Ticket` belongs to exactly one `RelatedSystem`.
* One `Ticket` may contain zero or many `Attachment` records.
* Every `Attachment` belongs to exactly one `Ticket`.
* `uploadedByRequesterId` identifies the Development Requester who uploaded the Attachment.
* `removedByRequesterId` is nullable and identifies the Development Requester who removed the Attachment.

Ticket, Category, Related System, and Development Requester records shall not be hard-deleted by Lab 2 functionality.

### 7.4 Field Decisions

| Field                           | Decision                                                    |
| ------------------------------- | ----------------------------------------------------------- |
| `Category.name`                 | Unique, required, maximum 100 characters                    |
| `Category.isActive`             | Required, default `true`                                    |
| `RelatedSystem.name`            | Unique, required, maximum 100 characters                    |
| `RelatedSystem.isActive`        | Required, default `true`                                    |
| `DevelopmentRequester.name`     | Required, maximum 120 characters                            |
| `DevelopmentRequester.email`    | Unique, required, stored in lowercase                       |
| `DevelopmentRequester.isActive` | Required, default `true`                                    |
| `Ticket.ticketNumber`           | Unique, backend-generated                                   |
| `Ticket.clientSubmissionId`     | Unique UUID supplied by the client for duplicate prevention |
| `Ticket.summary`                | Required, trimmed, 5–150 characters                         |
| `Ticket.description`            | Required, trimmed, 10–5,000 characters                      |
| `Ticket.requestedPriority`      | Required `RequestedPriority` value                          |
| `Ticket.currentStatus`          | Required, default `NEW`                                     |
| `Attachment.originalFilename`       | Required for display; must not be used as the storage path  |
| `Attachment.storageKey`         | Unique server-generated identifier                          |
| `Attachment.mimeType`           | Required and limited to an approved MIME type               |
| `Attachment.sizeBytes`          | Required integer from 1 to 5,000,000                        |
| `Attachment.isRemoved`          | Required, default `false`                                   |
| Removal fields                  | Nullable while active and populated during soft removal     |

Attachment binaries shall be stored in a local single-node SeaweedFS service on the same deployment server, following the approved TokTickIT System-Level SDS. PostgreSQL shall store only Attachment metadata and the SeaweedFS storage identifier. The original filename shall be retained only for display and shall never be used as a storage path.

### 7.5 Constraints and Indexes

The database shall provide:

* A unique constraint on `Category.name`.
* A unique constraint on `RelatedSystem.name`.
* A unique constraint on `DevelopmentRequester.email`.
* A unique constraint on `Ticket.ticketNumber`.
* A unique constraint on `Ticket.clientSubmissionId`.
* A unique constraint on `Attachment.storageKey`.
* A foreign key from `Ticket.requesterId` to `DevelopmentRequester.id`.
* A foreign key from `Ticket.categoryId` to `Category.id`.
* A foreign key from `Ticket.relatedSystemId` to `RelatedSystem.id`.
* A foreign key from `Attachment.ticketId` to `Ticket.id`.
* Foreign keys for Attachment uploader and remover Requester IDs.
* A composite index on `Ticket(requesterId, updatedAt)`.
* Indexes on `Ticket.categoryId`, `Ticket.relatedSystemId`, `Ticket.requestedPriority`, and `Ticket.currentStatus`.
* A composite index on `Attachment(ticketId, isRemoved)`.
* A primary or unique constraint on `TicketNumberSequence.year`.

These indexes are justified because My Tickets always filters by Requester and frequently sorts by Last Updated or filters by Category, Related System, Priority, and Status.

### 7.6 Migration Decisions

A new Prisma migration shall:

1. Add `isActive` and `updatedAt` to the existing `Category` model without deleting current records.
2. Create the new enums and models.
3. Create the required foreign keys, unique constraints, and indexes.
4. Preserve the existing Lab 1 data and tests.
5. Avoid resetting or recreating the development database.

### 7.7 Seed Data

The seed process shall remain idempotent and shall use `upsert`.

Categories:

* Account and Access
* Hardware
* Software
* Network

Related Systems:

* Email
* Campus Wi-Fi
* VPN
* LEB2 App
* Grade Submission App
* Printer
* Corporate Laptop

Active Development Requesters:

* Jennifer Anderson — `jennifer.anderson@example.com`
* Alex Morgan — `alex.morgan@example.com`
* Priya Shah — `priya.shah@example.com`
* Daniel Kim — `daniel.kim@example.com`

Inactive Development Requester:

* Emily Carter — `emily.carter@example.com`

The inactive Requester shall be retained for API and UI testing but shall not be returned by the active Development Requester endpoint.


## 8. API Contract

The complete request and response definitions are maintained in `docs/lab-02/api-spec.md`. All requester-specific endpoints shall require the `X-Development-Requester-Id` request header. This header represents only the temporary Lab 2 testing context and is not authentication.

### 8.1 Reference-Data Endpoints

| Method | Endpoint                      | Purpose                                                                 | Success  |
| ------ | ----------------------------- | ----------------------------------------------------------------------- | -------- |
| `GET`  | `/api/categories`             | Retrieve active Categories while preserving the existing Lab 1 endpoint | `200 OK` |
| `GET`  | `/api/related-systems`        | Retrieve active Related Systems                                         | `200 OK` |
| `GET`  | `/api/development-requesters` | Retrieve active Development Requesters                                  | `200 OK` |

Reference-data responses shall be arrays ordered by name ascending, except the Category endpoint shall preserve its existing Lab 1 ordering to maintain compatibility with existing tests.

Example Development Requester response:

```json
[
  {
    "id": 1,
    "name": "Jennifer Anderson",
    "email": "jennifer.anderson@example.com"
  }
]
```

Inactive records shall not appear in these responses.

### 8.2 Create Ticket

`POST /api/tickets`

Required header:

```text
X-Development-Requester-Id: 1
```

Request body:

```json
{
  "clientSubmissionId": "9ed553a5-8a2b-4fc2-a3bc-8e3ef21d8081",
  "categoryId": 2,
  "relatedSystemId": 7,
  "summary": "Laptop battery drains quickly",
  "requestedPriority": "MEDIUM",
  "description": "The battery drains much faster than usual after the latest update."
}
```

The client shall not submit Ticket Number, Ticket Date, Current Status, or ownership fields.

First successful creation shall return `201 Created`:

```json
{
  "ticket": {
    "id": 101,
    "ticketNumber": "TKT-2026-00001",
    "ticketDate": "2026-09-03T14:30:00.000Z",
    "requester": {
      "id": 1,
      "name": "Development Requester 1"
    },
    "category": {
      "id": 1,
      "name": "Hardware"
    },
    "relatedSystem": {
      "id": 2,
      "name": "Learning Management System"
    },
    "requestedPriority": "MEDIUM",
    "currentStatus": "NEW",
    "summary": "Laptop battery drains quickly",
    "description": "The battery decreases from full to empty in approximately one hour.",
    "createdAt": "2026-09-03T14:30:00.000Z",
    "updatedAt": "2026-09-03T14:30:00.000Z"
  },
  "replayed": false
}
```

A repeated identical `clientSubmissionId` shall return the existing Ticket with `200 OK` and `"replayed": true`. Reusing the identifier with different data shall return `409 Conflict`.

### 8.3 My Tickets

`GET /api/tickets`

Required header:

```text
X-Development-Requester-Id: 1
```

Supported query parameters:

| Parameter           | Purpose                                                                     | Default     |
| ------------------- | --------------------------------------------------------------------------- | ----------- |
| `search`            | Case-insensitive Ticket Number or Summary search                            | Empty       |
| `categoryId`        | Filter by Category                                                          | All         |
| `relatedSystemId`   | Filter by Related System                                                    | All         |
| `requestedPriority` | Filter by Requested Priority                                                | All         |
| `currentStatus`     | Filter by Current Status                                                    | All         |
| `sortBy`            | `ticketNumber`, `createdAt`, `updatedAt`, `summary`, or `requestedPriority` | `updatedAt` |
| `sortOrder`     | `asc` or `desc`                                                             | `desc`      |
| `page`              | One-based page number                                                       | `1`         |
| `pageSize`          | `10`, `25`, or `50`                                                         | `10`        |

Example request:

```text
GET /api/tickets?search=laptop&categoryId=2&sortBy=updatedAt&sortOrder=desc&page=1&pageSize=10
```

Successful response:

```json
{
  "items": [
    {
      "id": 1,
      "ticketNumber": "TKT-2026-00001",
      "ticketDate": "2026-09-03T14:30:00.000Z",
      "summary": "Laptop battery drains quickly",
      "category": {
        "id": 2,
        "name": "Hardware"
      },
      "relatedSystem": {
        "id": 7,
        "name": "Corporate Laptop"
      },
      "requestedPriority": "MEDIUM",
      "currentStatus": "NEW",
      "updatedAt": "2026-09-03T14:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "totalItems": 1,
    "totalPages": 1
  }
}
```

The response shall contain only Tickets owned by the Requester identified in the required header.

### 8.4 Owned Ticket Detail

`GET /api/tickets/:ticketId`

A successful `200 OK` response shall contain the owned Ticket, Requester, Category, Related System, and Attachment metadata.

```json
{
  "ticket": {
    "id": 1,
    "ticketNumber": "TKT-2026-00001",
    "ticketDate": "2026-09-03T14:30:00.000Z",
    "requester": {
      "id": 1,
      "name": "Jennifer Anderson",
      "email": "jennifer.anderson@example.com"
    },
    "category": {
      "id": 2,
      "name": "Hardware"
    },
    "relatedSystem": {
      "id": 7,
      "name": "Corporate Laptop"
    },
    "summary": "Laptop battery drains quickly",
    "requestedPriority": "MEDIUM",
    "description": "The battery drains much faster than usual after the latest update.",
    "currentStatus": "NEW",
    "createdAt": "2026-09-03T14:30:00.000Z",
    "updatedAt": "2026-09-03T14:30:00.000Z"
  },
  "attachments": []
}
```

A missing Ticket or a Ticket owned by another Requester shall return the same `404 Not Found` response.

### 8.5 Attachment Endpoints

| Method   | Endpoint                                                   | Purpose                                                        | Success       |
| -------- | ---------------------------------------------------------- | -------------------------------------------------------------- | ------------- |
| `POST`   | `/api/tickets/:ticketId/attachments`                       | Upload one Attachment using `multipart/form-data` field `file` | `201 Created` |
| `GET`    | `/api/tickets/:ticketId/attachments`                       | Retrieve active and removed Attachment metadata                | `200 OK`      |
| `GET`    | `/api/tickets/:ticketId/attachments/:attachmentId`         | Retrieve one Attachment’s metadata                             | `200 OK`      |
| `GET`    | `/api/tickets/:ticketId/attachments/:attachmentId/content` | Preview or download an active Attachment                       | `200 OK`      |
| `DELETE` | `/api/tickets/:ticketId/attachments/:attachmentId`         | Soft-remove an active Attachment                               | `200 OK`      |

Upload request:

```text
Content-Type: multipart/form-data
Field name: file
```

Upload response:

```json
{
  "id": 10,
  "ticketId": 1,
  "originalFilename": "battery-report.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 245760,
  "isRemoved": false,
  "createdAt": "2026-09-03T14:35:00.000Z"
}
```

The content endpoint shall support:

```text
?disposition=inline
?disposition=attachment
```

The server shall return a safe `Content-Type` and `Content-Disposition` header. The original filename shall not be used to construct the storage path.

Soft-removal request body:

```json
{
  "removalReason": "Uploaded the wrong document"
}
```

Soft-removal response shall include the retained metadata, removal time, remover Requester ID, and removal reason. Repeating removal on an already removed Attachment shall return `409 Conflict`.

### 8.6 Error Response

New Lab 2 endpoints shall use the following safe error format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Some submitted values are invalid.",
    "fields": {
      "summary": "Summary must contain between 5 and 150 characters."
    }
  }
}
```

`fields` may be omitted when an error is not related to individual fields. Internal exception messages, SQL details, stack traces, and storage paths shall never be returned.

### 8.7 HTTP Status Decisions

| Status                       | Use                                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| `200 OK`                     | Successful retrieval, idempotent Ticket replay, or successful soft removal                   |
| `201 Created`                | New Ticket or Attachment created                                                             |
| `400 Bad Request`            | Missing Requester header, malformed identifiers, invalid fields, or invalid query parameters |
| `404 Not Found`              | Missing resource or resource owned by another Requester                                      |
| `409 Conflict`               | Changed idempotency payload, already removed Attachment, or active Attachment limit reached  |
| `413 Payload Too Large`      | Attachment exceeds 5 MB                                                                     |
| `415 Unsupported Media Type` | Attachment type is not permitted                                                             |
| `410 Gone`                   | Owned Attachment was removed and its content is no longer available                          |
| `500 Internal Server Error`  | Safe unexpected-error response                                                               |

### 8.8 Validation and Ownership Order

For requester-owned resources, the backend shall:

1. Validate the Development Requester header.
2. Validate path and query parameter formats.
3. Retrieve the requested resource using both its ID and the selected Requester ownership condition.
4. Return `404 Not Found` when no owned resource is found.
5. Perform the requested operation only after ownership is confirmed.


## 9. Acceptance Criteria

### 9.1 Development Requester Context

* **AC-01:** Given active and inactive Development Requesters exist, when the selection screen loads successfully, then only active Requesters are displayed in the dropdown.
* **AC-02:** Given no active Development Requester exists, when the selection screen finishes loading, then an empty-state message is displayed and the Continue button is unavailable.
* **AC-03:** Given the Development Requester API fails, when the selection screen loads, then a safe failure message and Retry action are displayed.
* **AC-04:** Given no valid Development Requester is selected, when the user attempts to open Create Ticket, My Tickets, or Ticket Detail, then the Development Requester Selection screen is shown.
* **AC-05:** Given an active Development Requester is selected, when the user continues into the application, then the selected Requester is displayed in the application shell and remains selected after a page refresh in the same tab.
* **AC-06:** Given Requester A is currently selected, when the user changes to Requester B, then Requester A’s cached Ticket data is cleared and Requester B’s data is loaded.

### 9.2 Reference Data and Ticket Creation

* **AC-07:** Given active Categories and Related Systems exist, when Create Ticket loads, then both dropdowns display active database records and the selected Requester appears as read-only.
* **AC-08:** Given valid Ticket data, when the selected Requester submits the form, then exactly one Ticket is saved with the matching `requesterId`, a backend-generated Ticket Number, server-generated timestamps, and Current Status `NEW`.
* **AC-09:** Given one or more required fields are blank or outside their permitted limits, when the Requester submits the form, then field-level messages are displayed and the Ticket API is not called.
* **AC-10:** Given an inactive or nonexistent Category, Related System, or Development Requester ID, when Ticket creation is requested, then the backend rejects the request with a safe validation response and no Ticket is saved.
* **AC-11:** Given valid entered values, when the Ticket API fails unexpectedly, then a safe error message is displayed and the valid form values remain available for retry.
* **AC-12:** Given a Ticket has already been created with a `clientSubmissionId`, when the identical Requester and payload are submitted again with the same identifier, then the existing Ticket is returned and no duplicate Ticket is created.
* **AC-13:** Given a `clientSubmissionId` has already been used, when it is submitted with different Ticket data, then the API returns `409 Conflict` and no additional Ticket is created.
* **AC-14:** Given submission is in progress, when the Requester attempts to submit again, then the Submit button remains disabled and only one creation request is sent.

### 9.3 Attachments During Ticket Creation

* **AC-15:** Given one permitted file and one invalid file are selected, when the client validates the selection, then the permitted file remains selected and the invalid file displays a specific error.
* **AC-16:** Given a file exceeds 5 MB, uses an unsupported type, or would exceed five active Attachments, when upload is requested, then the server rejects it with the documented status and does not create active Attachment metadata.
* **AC-17:** Given a Ticket is created successfully but one or more Attachment uploads fail, when the workflow completes, then the Ticket remains saved, its official Ticket Number is displayed, successful uploads remain available, and failed files are identified safely for retry.

### 9.4 My Tickets

* **AC-18:** Given Requester A is selected and owns Tickets, when My Tickets loads, then only Requester A’s Tickets are returned and displayed.
* **AC-19:** Given Requester A’s Tickets are visible, when the user changes to Requester B, then Requester A’s Tickets disappear and only Requester B’s Tickets are displayed.
* **AC-20:** Given the selected Requester owns multiple Tickets, when a Ticket Number or Summary search is entered, then matching Tickets are returned using case-insensitive search.
* **AC-21:** Given Tickets with different Categories, Related Systems, Requested Priorities, and Current Statuses exist, when filters are applied, then only Tickets matching all active filters are returned.
* **AC-22:** Given multiple matching Tickets exist, when an allowed sort field and direction are selected, then the result is returned in that order with stable secondary sorting.
* **AC-23:** Given more matching Tickets exist than the selected page size, when another page is requested, then the correct items and page, page size, total item, and total page metadata are returned.
* **AC-24:** Given the selected Requester owns no Tickets, when My Tickets loads without filters, then the empty state and Create Ticket action are displayed.
* **AC-25:** Given the selected Requester owns Tickets but none match the active search or filters, when the request completes, then a no-results state and Clear Filters action are displayed.
* **AC-26:** Given the My Tickets API fails, when the screen attempts to load data, then a safe failure state and Retry action are displayed without showing stale data from another Requester.

### 9.5 Ticket Detail and Ownership

* **AC-27:** Given the selected Requester owns a Ticket, when Ticket Detail is opened, then the Ticket, Requester, Category, Related System, and Attachment information are displayed as read-only.
* **AC-28:** Given Ticket Detail is displayed in Lab 2, when the Requester views the available controls, then Public Comments, Internal Notes, Actions Taken, status changes, IT Priority changes, claiming, and reassignment controls are absent.
* **AC-29:** Given Requester B is selected, when a Ticket belonging to Requester A is requested directly, then the API returns `404 Not Found` and no Ticket information is returned.

### 9.6 Attachment Lifecycle

* **AC-30:** Given the selected Requester owns a Ticket with fewer than five active Attachments, when a permitted file is uploaded, then one Attachment record is created and the active Attachment appears on Ticket Detail.
* **AC-31:** Given an active owned Attachment exists, when the Requester selects Preview or Download, then the correct content is returned with safe `Content-Type` and `Content-Disposition` headers.
* **AC-32:** Given an active owned Attachment exists, when the Requester confirms removal with a valid reason, then the Attachment is soft-removed and its removal time, remover, and reason are recorded.
* **AC-33:** Given the removal reason is missing or shorter than five characters, when removal is requested, then the API returns a validation response and the Attachment remains active.
* **AC-34:** Given an Attachment is already removed, when another removal is requested, then the API returns `409 Conflict` without changing the original removal metadata.
* **AC-35:** Given an owned Attachment has been removed, when Ticket Detail loads, then the retained metadata and Removed state are visible but Preview and Download actions are unavailable.
* **AC-36:** Given an owned Attachment has been removed, when its content endpoint is requested, then the API returns `410 Gone` and no file content is returned.
* **AC-37:** Given Requester B is selected, when an Attachment belonging to Requester A’s Ticket is retrieved, uploaded, downloaded, or removed, then the API returns `404 Not Found` and performs no operation.

### 9.7 UI, Responsive Behavior, and Safety

* **AC-38:** Given each Lab 2 screen is opened at desktop, tablet, and mobile viewport sizes, when the screen is visually inspected, then no labels, messages, buttons, tables, cards, or filenames are clipped or overlapping and the page has no unintended horizontal scrolling.
* **AC-39:** Given a keyboard-only user navigates a Lab 2 screen, when controls receive focus and are activated, then the focus indicator remains visible and every required operation can be completed without a mouse.
* **AC-40:** Given validation, warning, success, priority, or status information is displayed, when the UI is viewed without relying on color, then readable text, labels, or icons still communicate the meaning.
* **AC-41:** Given an unexpected server error occurs, when the client receives the response, then the response contains a safe error code and message without stack traces, SQL details, secrets, or file-system paths.
* **AC-42:** Given the Lab 2 increment is complete, when the original Lab 1 health-check, Category API, and client tests are executed, then all original tests continue to pass.


## 10. Definition of Done

### 10.1 Product Completion

The Lab 2 product increment is complete only when every applicable item below is satisfied:

* [ ] The approved `specification.md`, `tests.md`, `ui-spec.md`, and `api-spec.md` existed before the main implementation work was completed.
* [ ] All approved Functional Requirements from `FR-01` through `FR-30` are implemented.
* [ ] Every Business Rule from `BR-01` through `BR-67` is implemented or verified by appropriate evidence.
* [ ] Every Acceptance Criterion from `AC-01` through `AC-42` maps to at least one planned test.
* [ ] The Development Requester selector clearly states that it is for Lab 2 testing and is not authentication.
* [ ] Only active Development Requesters appear in the selector.
* [ ] Requester switching reloads requester-specific data and does not leave the previous Requester’s Tickets visible.
* [ ] Ticket creation stores the selected `requesterId` and generates the official Ticket Number on the backend.
* [ ] Ticket Number generation remains unique under concurrent requests.
* [ ] Duplicate submissions do not create duplicate Tickets.
* [ ] Create Ticket handles initial, loading, validation, submitting, success, partial-attachment failure, and API-failure states.
* [ ] My Tickets supports ownership filtering, search, filters, sorting, pagination, empty state, no-results state, and failure state.
* [ ] Ticket Detail displays only an owned Ticket and contains no Lab 3 or IT Staff controls.
* [ ] Attachment type, size, count, ownership, upload, download, preview, and soft-removal rules are enforced by the backend.
* [ ] Removed Attachment metadata remains visible while its content is unavailable.
* [ ] Cross-Requester Ticket and Attachment access tests pass.
* [ ] The Prisma migration applies without resetting or deleting Lab 1 data.
* [ ] The seed command can run repeatedly without creating duplicates.
* [ ] Attachment binaries are stored in SeaweedFS and Attachment metadata is stored in PostgreSQL.
* [ ] Safe error responses contain no stack traces, SQL details, secrets, or storage paths.
* [ ] The Zen Green visual tokens and reusable component rules are implemented consistently.
* [ ] Desktop, tablet, and mobile screenshots show no clipping, overlap, hidden actions, or unintended horizontal scrolling.
* [ ] Keyboard navigation, visible focus, accessible labels, and non-color feedback have been verified.
* [ ] All planned unit tests pass.
* [ ] All planned API or integration tests pass.
* [ ] All planned UI component and UI style tests pass.
* [ ] All planned responsive and end-to-end tests pass.
* [ ] No required test is skipped, disabled, commented out, or unrelated to its mapped Acceptance Criterion.
* [ ] The original Lab 1 server and client tests continue to pass.
* [ ] README setup, migration, seed, SeaweedFS, run, and test instructions are current and reproducible.
* [ ] `.env`, secrets, `node_modules`, uploaded binaries, generated test output, and local storage data are excluded from Git.
* [ ] The final implementation is present and testable from the final `main` branch.

### 10.2 Course Delivery Requirements

Course delivery is complete only when:

* [ ] All Lab 2 work is represented by GitHub Issues.
* [ ] Each implementation Issue uses its own Feature Branch.
* [ ] Feature Branches enter `lab2-staging` through Pull Requests.
* [ ] Pull Requests receive the required peer review and approval.
* [ ] Review comments are answered and resolved.
* [ ] Integration testing is completed on `lab2-staging`.
* [ ] One final release Pull Request merges `lab2-staging` into `main`.
* [ ] `reviewer.md` contains reviewer identity, Pull Request links, comments, responses, and approvals.
* [ ] `ai-use.md` identifies the LLM used, records 6–10 important prompts, and contains a short personal reflection.
* [ ] Required screenshots are stored under `artifacts/lab-02/screenshots/`.
* [ ] The final evidence PDF uses headings `Answer Part 1` through `Answer Part 9` in the required order.
* [ ] All links in the evidence PDF open correctly and screenshots remain readable without extreme zoom.

## 11. Assumptions and Decisions

| ID     | Decision                                                                                                                                                                                                      | Reason                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `D-01` | Lab 2 extends the existing Lab 1 React, TypeScript, Vite, Bootstrap, Express, Prisma, PostgreSQL, Vitest, and Supertest project.                                                                              | Preserves the approved starter architecture and existing work.                                       |
| `D-02` | The Lab 2 handout controls sprint scope, while the approved TokTickIT System-Level SDS guides architecture decisions that do not conflict with the handout.                                                   | Prevents accidental implementation of later-sprint features.                                         |
| `D-03` | The Development Requester selector is a temporary testing context and provides no security guarantee.                                                                                                         | Authentication and role-based access are explicitly deferred to Lab 3.                               |
| `D-04` | Requester-specific APIs use the `X-Development-Requester-Id` header.                                                                                                                                          | Keeps the simulated identity separate from Ticket request bodies and makes ownership tests explicit. |
| `D-05` | The selected Development Requester ID is stored in browser `sessionStorage`.                                                                                                                                  | Preserves selection during refresh while limiting it to the current browser-tab session.             |
| `D-06` | Attachment binaries are stored in a local single-node SeaweedFS service, while PostgreSQL stores Attachment metadata.                                                                                         | Follows the approved TokTickIT System-Level SDS and avoids storing large binary data in PostgreSQL.  |
| `D-07` | Soft removal retains Attachment metadata but deletes or makes the SeaweedFS binary permanently unavailable. If binary cleanup fails, access remains blocked and the failure is logged for retry.              | Satisfies auditability while ensuring removed files cannot be downloaded.                            |
| `D-08` | Ticket creation is completed before Attachment uploads begin. Each Attachment is uploaded as a separate operation.                                                                                            | Allows the Ticket to remain valid when one optional Attachment upload fails.                         |
| `D-09` | Ownership failures return the same `404 Not Found` response as missing resources.                                                                                                                             | Prevents disclosure of another Requester’s Ticket or Attachment existence.                           |
| `D-10` | The API base path remains `/api` instead of introducing `/api/v1` during Lab 2.                                                                                                                               | Preserves compatibility with the existing Lab 1 endpoints and handout examples.                      |
| `D-11` | All API timestamps use ISO 8601 UTC strings. The client may format them for display in the user’s locale.                                                                                                     | Provides consistent storage and test assertions.                                                     |
| `D-12` | My Tickets defaults to page 1, page size 10, and Last Updated descending with Ticket ID descending as a stable secondary sort.                                                                                | Shows the most recently changed Tickets first and provides deterministic pagination.                 |
| `D-13` | Attachment uploads use one `file` field per request instead of uploading a batch in one request.                                                                                                              | Simplifies validation, retry, compensation, and partial-failure handling.                            |
| `D-14` | Search covers Ticket Number and Ticket Summary only.                                                                                                                                                          | These are the fields Requesters can identify most easily and are explicitly suitable for Lab 2.      |
| `D-15` | Lab 2 does not create, update, or expose passwords, sessions, tokens, IT Staff controls, comments, notes, Actions Taken, notifications, or status-transition endpoints.                                       | These capabilities are explicitly outside the approved sprint scope.                                 |
| `D-16` | There are no unresolved specification questions at the start of implementation. Any later change requires updating the affected specification, Acceptance Criteria, and planned tests before the code change. | Maintains Spec-Driven Development and traceability.                                                  |
