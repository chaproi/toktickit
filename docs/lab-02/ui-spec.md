# Lab 2 UI Specification — Zen Green

## 1. Purpose

This document defines the approved user-interface contract for the TokTickIT Requester Ticketing MVP. It covers navigation, visual design, responsive behavior, accessibility, screen states, validation feedback, and Requester-specific behavior.

The UI is a development MVP. Development Requester selection is used only as a testing mechanism and is not authentication.

## 2. Design Principles

The Lab 2 UI shall follow these principles:

1. **Calm and clear:** Use the Zen Green visual direction with restrained color, spacing, and decoration.
2. **Requester awareness:** Always show which Development Requester is currently selected.
3. **State visibility:** Loading, empty, no-results, validation-error, API-error, submitting, and success states must be explicit.
4. **Safe actions:** Destructive and duplicate actions must be prevented or confirmed.
5. **Accessible interaction:** Keyboard use, visible focus, labels, and non-color feedback are required.
6. **Responsive operation:** Every required workflow must remain usable on desktop, tablet, and mobile screens.
7. **Consistent components:** Buttons, form fields, cards, tables, alerts, badges, and spacing must behave consistently across screens.

## 3. Visual Design Tokens

### 3.1 Color Palette

| Token             | Value     | Intended Use                                                   |
| ----------------- | --------- | -------------------------------------------------------------- |
| `primary-green`   | `#006B3C` | Application header, primary actions, and strong emphasis       |
| `secondary-green` | `#0B7A46` | Active navigation, focus accents, links, and hover states      |
| `pale-green`      | `#EAF6EF` | Selected states, success feedback, and subtle section emphasis |
| `page-background` | `#F5F7F6` | Quiet near-white page background                               |
| `surface`         | `#FFFFFF` | Cards, forms, tables, and dialogs                              |
| `text-primary`    | `#17352A` | Dark charcoal-green main text                                  |
| `text-muted`      | `#667085` | Supporting text                                                |
| `border`          | `#D0D5DD` | Field, table, and card borders                                 |
| `read-only`       | `#F0F4F1` | Read-only field background                                     |
| `danger`          | `#B42318` | Errors and destructive actions                                 |
| `warning`         | `#B54708` | Warning callouts and badges                                    |
| `success`         | `#006B3C` | Successful operations                                          |

Color shall not be the only method used to communicate status. Status feedback must also include text, icons, labels, or badges.


### 3.2 Typography

* Use the existing application system sans-serif font stack.
* Page titles shall use clear heading hierarchy.
* Body text shall normally be at least `16px`.
* Helper and metadata text shall normally be at least `14px`.
* Text shall remain readable without requiring horizontal scrolling.
* Ticket Numbers and technical identifiers may use a monospace font.

### 3.3 Spacing and Shape

* Use a consistent spacing scale of `4px`, `8px`, `12px`, `16px`, `24px`, and `32px`.
* Form controls shall have at least `8px` vertical separation.
* Related controls shall be visually grouped.
* Cards shall use an `8px` to `12px` border radius.
* Shadows shall be subtle and shall not replace visible borders.
* Mobile touch targets should be at least `44px` high where practical.

### 3.4 Button Hierarchy

| Type        | Use                                                       |
| ----------- | --------------------------------------------------------- |
| Primary     | Continue, Create Ticket, Apply Filters, Upload            |
| Secondary   | Cancel, Clear Filters, Back                               |
| Destructive | Remove Attachment                                         |
| Disabled    | Action unavailable because requirements are not satisfied |

A submitting button shall be disabled and shall display progress text or a spinner.

## 4. Responsive Layout

### 4.1 Breakpoints

| Viewport  |             Width | Required Behavior                                                                       |
| --------- | ----------------: | --------------------------------------------------------------------------------------- |
| Mobile    | Less than `768px` | Fields stack vertically; buttons remain touch-friendly; no horizontal page scrolling    |
| Tablet    |     `768px–991px` | Two-column layout where practical; Summary and Description receive sufficient width     |
| Desktop   | `992px` and above | Multi-column layout; centered content with a sensible maximum width                     |
| All sizes |         Any width | No clipped labels, overlapping messages, hidden buttons, or unreadable attachment names |


### 4.2 General Responsive Rules

* No required information or action may be clipped.
* The page shall not produce unintended horizontal scrolling.
* Form labels shall remain adjacent to their controls.
* Buttons may become full width on mobile.
* Tables that cannot remain readable shall change into stacked ticket cards on mobile.
* Dialogs shall fit within the viewport and allow internal scrolling when necessary.
* Navigation shall collapse into a mobile menu when horizontal space is insufficient.

## 5. Navigation and Requester Context

### 5.1 Routes

| Route                | Screen                          | Requester Required |
| -------------------- | ------------------------------- | ------------------ |
| `/`                  | Route decision or redirect      | No                 |
| `/select-requester`  | Development Requester Selection | No                 |
| `/tickets`           | My Tickets                      | Yes                |
| `/tickets/new`       | Create Ticket                   | Yes                |
| `/tickets/:ticketId` | Ticket Detail                   | Yes                |

### 5.2 Route Behavior

* Opening `/` without a selected Requester shall redirect to `/select-requester`.
* Opening a Requester-required route without a selected Requester shall redirect to `/select-requester`.
* After a Requester is selected, the application shall navigate to `/tickets`.
* The selected Requester identifier shall be stored in `sessionStorage`.
* Reloading the page within the same browser tab shall restore the selected Requester when it remains active.
* An invalid or inactive stored Requester shall be cleared and the user shall return to `/select-requester`.

### 5.3 Global Navigation

After Requester selection, the navigation shall provide:

* **My Tickets**
* **Create Ticket**
* The selected Requester’s display name
* **Change Requester**

The active navigation destination shall be visually indicated.

### 5.4 Changing the Requester

When the user selects **Change Requester**:

1. The application navigates to `/select-requester`.
2. Requester-specific cached ticket and attachment data is cleared.
3. After a different Requester is selected, the application loads data for that Requester.
4. Data belonging to the previous Requester must not remain visible.

### 5.5 Requester Identity Header

Requests for Requester-owned resources shall include:

```http
X-Development-Requester-Id: <requester-id>
```

The header is a Lab 2 development mechanism only. The UI shall not describe it as secure login or authentication.

## 6. Development Requester Selection Screen

### 6.1 Purpose

Allow a tester to select one active Development Requester before entering Requester-specific workflows.

### 6.2 Screen Content

The screen shall contain:

* TokTickIT title
* Page title: **Select Development Requester**
* Short explanation that the selector is for Lab 2 testing only and is not a login screen
* Development Requester dropdown
* Active Requesters loaded from PostgreSQL
* Primary **Continue** button
* Retry action when loading fails

Suggested explanatory text:

> Select a Development Requester to test requester-specific ticket behavior. This is not a login screen. Authentication and role-based access will be introduced in Lab 3.

Inactive Requesters shall not appear as selectable options.

### 6.3 States

| State      | Required UI Behavior                                                                         |
| ---------- | -------------------------------------------------------------------------------------------- |
| Loading    | Disable the dropdown and display `Loading Development Requesters…`                           |
| Ready      | Display active Requesters as dropdown options and keep **Continue** disabled until selection |
| Selected   | Display the selected Requester and enable **Continue**                                       |
| Empty      | Display `No active Development Requesters are available.`                                    |
| API error  | Display a safe error message and a **Try Again** action                                      |
| Continuing | Disable the dropdown and repeated Continue actions while navigation occurs                   |

### 6.4 Interaction

* The dropdown shall be usable with a pointer and keyboard.
* Only one Requester may be selected at a time.
* Selecting another option replaces the previous selection.
* Pressing **Continue** stores the selected Requester in `sessionStorage`.
* Successful selection navigates to `/tickets`.
* Required-field and selected-state feedback must not rely only on color.


## 7. Create Ticket Screen

### 7.1 Purpose

Allow the selected Development Requester to create one new Ticket and optionally attach valid files.

### 7.2 Fields

| Field                 | Type           |  Required | UI Behavior                                                |
| --------------------- | -------------- | --------: | ---------------------------------------------------------- |
| Development Requester | Read-only text |       Yes | Display the selected Requester                             |
| Ticket Number         | Read-only text | Generated | Display `Generated after creation` before submission       |
| Ticket Date           | Read-only text | Generated | Display `Assigned by server on creation` before submission |
| Category              | Select         |       Yes | Load active Categories from the API                        |
| Related System        | Select         |       Yes | Load active Related Systems from the API                   |
| Priority              | Select         |       Yes | Options: `LOW`, `MEDIUM`, `HIGH`, `URGENT`                 |
| Summary               | Text input     |       Yes | Accept 5–150 trimmed characters                            |
| Description           | Text area      |       Yes | Accept 10–5000 trimmed characters                          |
| Attachments           | File input     |        No | Accept JPG, JPEG, PNG, WEBP, and PDF files                 |

The form shall display helper text for character limits and attachment restrictions.

### 7.3 Attachment Selection

Before Ticket creation:

* A maximum of five files may be selected.
* Each file must not exceed 5 MB.
* Duplicate selections of the same local file shall not create duplicate list entries.
* Each selected file shall display its filename, type, size, and a remove-from-selection action.
* Invalid files shall be rejected with a visible explanation.
* Selecting an invalid file shall not clear valid files already selected.
* The form shall clearly state that attachment upload may occur after the Ticket has been created.

### 7.4 Validation Behavior

* Validation shall occur when a field loses focus and again when the form is submitted.
* Each invalid field shall receive a field-level message.
* A summary error message shall appear above the form when submission is blocked.
* Focus shall move to the error summary or first invalid field after an invalid submission.
* Entered values shall remain available after a validation or API error.
* Whitespace-only values shall be treated as empty.

### 7.5 Submission Behavior

1. The UI generates and retains one `clientSubmissionId` UUID for the submission attempt.
2. The **Create Ticket** button changes to `Creating…` and becomes disabled.
3. The form sends the Ticket creation request.
4. Repeated clicks or Enter key submissions must not create duplicate requests.
5. After successful creation, selected valid attachments are uploaded to the created Ticket.
6. Ticket creation remains successful even if a later attachment upload fails.
7. The success state displays the backend-generated Ticket Number.
8. The user may open the created Ticket or return to **My Tickets**.

### 7.6 States

| State                      | Required UI Behavior                                             |
| -------------------------- | ---------------------------------------------------------------- |
| Loading reference data     | Disable dependent selects and display loading feedback           |
| Reference-data error       | Display a safe error message with a retry action                 |
| Ready                      | Display the editable form                                        |
| Validation error           | Display error summary and field-level messages                   |
| Submitting                 | Disable duplicate submission and show progress                   |
| Ticket created             | Display Ticket Number and navigation actions                     |
| Partial attachment failure | Keep Ticket success visible and list files that failed to upload |
| API failure                | Preserve form data and provide a retry action                    |

## 8. My Tickets Screen

### 8.1 Purpose

Display only Tickets owned by the selected Development Requester and allow searching, filtering, sorting, and pagination.

### 8.2 Search and Filters

The screen shall provide:

* Search by Ticket Number or Summary
* Category filter
* Related System filter
* Priority filter
* Status filter
* Sort selection
* Page-size selection with `10`, `25`, and `50`
* **Apply Filters** action when required
* **Clear Filters** action

Changing search, filters, sorting, or page size shall return the result to page 1.

### 8.3 Default Query

* Default page: `1`
* Default page size: `10`
* Default sort: `updatedAt` descending
* Tie-break sort: `id` descending
* Search values shall be trimmed
* Empty filter values shall mean no filter for that field

### 8.4 Desktop and Tablet Presentation

The Ticket table shall include:

| Column         | Behavior                                                        |
| -------------- | --------------------------------------------------------------- |
| Ticket Number  | Display as a link to Ticket Detail                              |
| Summary        | Truncate visually when necessary without losing accessible text |
| Category       | Display Category name                                           |
| Related System | Display Related System name                                     |
| Priority       | Display a text badge                                            |
| Status         | Display a text badge                                            |
| Updated        | Display a readable local date and time                          |

A row or Ticket Number link shall open `/tickets/:ticketId`.

### 8.5 Mobile Presentation

On mobile, table rows may change into stacked cards. Each card shall display:

* Ticket Number
* Summary
* Category
* Related System
* Priority
* Status
* Updated time
* Clear action to open Ticket Detail

No required Ticket information shall require horizontal scrolling.

### 8.6 States

| State             | Required UI Behavior                                                              |
| ----------------- | --------------------------------------------------------------------------------- |
| Loading           | Display table or card skeletons                                                   |
| Populated         | Display Requester-owned Tickets and pagination                                    |
| Empty             | Display `You have not created any Tickets yet.` with a **Create Ticket** action   |
| No results        | Display `No Tickets match the current search and filters.` with **Clear Filters** |
| API error         | Display a safe error message and **Try Again**                                    |
| Page out of range | Return to the last valid page or page 1                                           |
| Requester changed | Clear previous results and reload for the new Requester                           |

### 8.7 Pagination

* Display the current page and total page count.
* Disable **Previous** on the first page.
* Disable **Next** on the final page.
* Preserve the current search, filters, sorting, and page size while changing pages.
* Do not display pagination controls when there are no results.

## 9. Ticket Detail and Attachments Screen

### 9.1 Purpose

Display one owned Ticket as read-only information and allow management of that Ticket’s active attachments.

### 9.2 Ticket Detail Content

The screen shall display:

* Ticket Number
* Ticket Date
* Development Requester
* Category
* Related System
* Priority
* Status
* Summary
* Description
* Created date and time
* Updated date and time

All Ticket fields on this screen are read-only in Lab 2.

### 9.3 Detail States

| State                  | Required UI Behavior                              |
| ---------------------- | ------------------------------------------------- |
| Loading                | Display a detail skeleton                         |
| Loaded                 | Display the Ticket and attachment section         |
| Not found or not owned | Display the same safe `Ticket not found.` message |
| API error              | Display a safe error message and retry action     |

The UI shall not reveal whether a Ticket exists for another Requester.

### 9.4 Attachment List

Each attachment entry shall display:

* Original filename
* MIME type
* File size
* Upload date and time
* Active or removed status
* **Download** action for active files
* **Remove** action for active files

Removed attachments shall remain visible as metadata but shall not provide preview, download, or repeated removal actions.

### 9.5 Upload Behavior

* The upload control shall accept JPG, JPEG, PNG, WEBP, and PDF.
* Each file must not exceed 5 MB.
* The Ticket may have no more than five active attachments.
* The UI shall calculate remaining attachment capacity before upload.
* Uploading shall display progress or an in-progress state.
* Successful upload shall refresh the attachment list.
* Failed upload shall display a safe message without removing existing attachments.
* Invalid files shall be rejected before sending when the browser can determine the violation.

### 9.6 Download Behavior

* Selecting **Download** shall request the owned attachment content.
* The downloaded file shall use the retained original filename for display.
* The original filename shall never be constructed into a storage path by the UI.
* A failed or unavailable download shall display a safe error message.

### 9.7 Removal Confirmation

Selecting **Remove** shall open a confirmation dialog containing:

* Attachment filename
* Explanation that the removal is a soft removal
* Required removal-reason input
* **Cancel** button
* Destructive **Remove Attachment** button

The reason shall contain 5–200 trimmed characters. While removal is processing, the destructive button shall be disabled.

After successful removal:

* The dialog closes.
* The attachment list refreshes.
* The item is marked as removed.
* Preview, download, and removal actions disappear.
* A success message is announced.

### 9.8 Attachment Error States

| Condition                 | Required Feedback                                             |
| ------------------------- | ------------------------------------------------------------- |
| Unsupported type          | `This file type is not allowed.`                              |
| File over 5 MB           | `Each attachment must be 5 MB or smaller.`                   |
| Active limit reached      | `This Ticket already has five active attachments.`            |
| Invalid removal reason    | Display a field-level reason requirement                      |
| Removed content requested | Display that the attachment is no longer available            |
| Not owned or not found    | Display a safe not-found message                              |
| Storage/API failure       | Display a safe retryable error without infrastructure details |


## 10. Shared Components and States

### 10.1 Shared Components

The UI should reuse consistent components for:

* Application navigation
* Selected Requester indicator
* Page headings
* Form fields and validation messages
* Primary, secondary, and destructive buttons
* Loading indicators and skeletons
* Empty-state and no-results panels
* Safe error alerts
* Success notifications
* Priority and status badges
* Pagination
* Confirmation dialogs
* Attachment list items

### 10.2 Loading States

* A loading indicator shall appear near the content being loaded.
* Existing content may remain visible during a background refresh when it is not misleading.
* Controls that depend on unavailable data shall be disabled.
* The loading message shall identify what is being loaded.
* The interface shall not display an empty state before loading is complete.

### 10.3 Empty and No-Results States

An empty state means no records exist for the selected Requester. A no-results state means records may exist, but none match the current query.

These states must use different messages and actions:

| State                 | Message                                            | Suggested Action                 |
| --------------------- | -------------------------------------------------- | -------------------------------- |
| No Tickets exist      | `You have not created any Tickets yet.`            | **Create Ticket**                |
| Filters match nothing | `No Tickets match the current search and filters.` | **Clear Filters**                |
| No active Requesters  | `No active Development Requesters are available.`  | **Try Again** or contact message |
| No attachments        | `This Ticket has no active attachments.`           | **Add Attachment**               |

### 10.4 Error States

* Error messages shall use safe, user-readable language.
* Stack traces, database details, storage paths, and internal exception messages must not appear.
* Retryable errors shall provide a **Try Again** action.
* Validation errors shall appear beside the related fields.
* Page-level errors shall appear in an alert region near the page heading.
* Ownership failures and missing resources shall use the same not-found presentation.

### 10.5 Success Feedback

* Successful Ticket creation shall display the generated Ticket Number.
* Successful attachment upload shall identify the uploaded file.
* Successful attachment removal shall identify the removed file.
* Success notifications shall be announced to assistive technology.
* Temporary notifications shall remain visible long enough to be read.

## 11. Accessibility Requirements

### 11.1 Keyboard Operation

* All interactive elements shall be reachable with the keyboard.
* Focus order shall follow the visual reading order.
* A visible focus indicator shall appear on links, buttons, form controls, selectable Requester items, and dialog actions.
* Dialog focus shall remain inside the open dialog.
* Closing a dialog shall return focus to the action that opened it.
* Escape may close a non-processing confirmation dialog.

### 11.2 Forms

* Every field shall have a persistent accessible label.
* Required fields shall be indicated in text or accessible attributes.
* Helper text and validation errors shall be associated with their fields.
* Error messages shall explain how to correct the value.
* Placeholder text shall not replace a label.
* Read-only values shall be identified as read-only and visually different from editable controls.

### 11.3 Status and Dynamic Content

* Loading, error, and success feedback shall use appropriate live regions.
* Requested Priority and Ticket status shall include visible text.
* Selected Requester state shall include text or an icon in addition to color.
* Disabled actions shall remain understandable from nearby instructions.
* Destructive actions shall include clear wording and confirmation.

### 11.4 Visual Accessibility

* Text and important controls shall meet reasonable contrast requirements.
* Text shall remain usable when zoomed to 200%.
* Information shall not depend on color alone.
* Focus outlines shall not be removed.
* Content shall remain readable in narrow viewports without two-dimensional scrolling.

## 12. Approved UI Copy

| Situation                     | Approved Message                                   |
| ----------------------------- | -------------------------------------------------- |
| Requesters loading            | `Loading Development Requesters…`                  |
| No active Requesters          | `No active Development Requesters are available.`  |
| Ticket creation in progress   | `Creating…`                                        |
| Ticket creation success       | `Ticket created successfully.`                     |
| Ticket list loading           | `Loading your Tickets…`                            |
| No Tickets                    | `You have not created any Tickets yet.`            |
| No matching Tickets           | `No Tickets match the current search and filters.` |
| Ticket unavailable            | `Ticket not found.`                                |
| Attachment upload in progress | `Uploading attachment…`                            |
| Attachment upload success     | `Attachment uploaded successfully.`                |
| Attachment removed            | `Attachment removed successfully.`                 |
| Unsupported attachment        | `This file type is not allowed.`                   |
| Oversized attachment          | `Each attachment must be 5 MB or smaller.`        |
| Attachment limit              | `This Ticket already has five active attachments.` |
| Removed attachment content    | `This attachment is no longer available.`          |
| General safe error            | `Something went wrong. Please try again.`          |

The implementation may add context to these messages but shall not expose internal system information.

## 13. UI Evidence Requirements

Before the Lab 2 release Pull Request is merged, screenshots shall demonstrate the implemented UI at representative viewport sizes.

### 13.1 Required Screenshot Groups

| Screen                          | Required Evidence                                                                |
| ------------------------------- | -------------------------------------------------------------------------------- |
| Development Requester Selection | Loading or populated state, selected state, and mobile view                      |
| Create Ticket                   | Ready form, validation errors, success state, and mobile view                    |
| My Tickets                      | Populated state, empty or no-results state, filters, pagination, and mobile view |
| Ticket Detail                   | Read-only Ticket data, active attachments, removed attachment, and mobile view   |
| Error handling                  | At least one safe API-error state                                                |
| Accessibility                   | Visible keyboard focus on representative controls                                |

### 13.2 Suggested Evidence Locations

* `artifacts/lab-02/screenshots/requester-selection/`
* `artifacts/lab-02/screenshots/create-ticket/`
* `artifacts/lab-02/screenshots/my-tickets/`
* `artifacts/lab-02/screenshots/ticket-detail/`
* `artifacts/lab-02/screenshots/error-states/`

Screenshot evidence shall represent the actual implementation. Placeholder or design-only images shall not be reported as completed evidence.

## 14. UI Scope Exclusions

The following UI features are not part of Lab 2:

* Real login, logout, password, session, or account screens
* IT Staff dashboards and queues
* Ticket claiming or reassignment
* IT Priority editing
* Ticket status changes after creation
* Public comments
* Internal notes
* Actions Taken
* Resolution confirmation
* Closing, reopening, or cancelling Tickets
* User, role, Category, Related System, or Requester administration
* Email or in-application notification centers
* Features assigned to Lab 3 or a later sprint

Controls, empty placeholders, or navigation links for excluded features shall not be added during Lab 2.
