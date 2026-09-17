# Lab 3 UI Specification — Zen Green Authentication, Staff, and Administration

## 1. Purpose and Principles

This document extends the completed Lab 2 Zen Green interface. It replaces simulated Requester identity with authenticated User context and defines Login, mandatory Change Password, role navigation, Requester additions, the IT Staff Queue and Detail, and minimalist Administrator User Management.

Principles:

1. Security state is visible: signed-out, forced-change, role, session expiry, forbidden, and conflict states are understandable.
2. Role clarity is explicit: the shell shows the current name and role, and the backend remains authoritative.
3. Public and private communication cannot be confused.
4. Operational density remains readable; the Queue does not become a mega-grid.
5. Existing Lab 2 components, tokens, focus, validation, and responsive conventions are reused.
6. Destructive, terminal, and credential actions require clear confirmation and never echo passwords.

## 2. Visual System

### 2.1 Preserved Tokens

| Token | Value | Use |
| --- | --- | --- |
| primary-green | #006B3C | Header, primary actions, strong emphasis |
| secondary-green | #0B7A46 | Active navigation, links, hover/focus accents |
| pale-green | #EAF6EF | Selected/success/subtle section emphasis |
| page-background | #F5F7F6 | Page background |
| surface | #FFFFFF | Cards, tables, dialogs, forms |
| text-primary | #17352A | Main text |
| text-muted | #667085 | Supporting text |
| border | #D0D5DD | Fields, cards, table boundaries |
| read-only | #F0F4F1 | Read-only values |
| danger | #B42318 | Error and destructive action |
| warning | #B54708 | Warning and private-note emphasis |
| success | #006B3C | Successful action |

Color never carries meaning alone. Role, priority, status, active/inactive, public/private, success, warning, and error presentations include text and, where useful, an icon.

### 2.2 Typography, Spacing, and Controls

- Reuse the Lab 2 system font stack and 4/8/12/16/24/32 pixel spacing scale.
- Body text is normally at least 16px; metadata at least 14px.
- Cards use 8–12px radius, visible border, and restrained shadow.
- Touch targets are at least 44px where practical.
- Buttons retain Primary, Secondary, Tertiary, Destructive, Disabled, and Busy variants.
- Editable fields use white; read-only values use read-only green-gray; private Note controls use a labelled warm warning surface, not color alone.
- Ticket Number and technical identifiers may use monospace.

### 2.3 Badges

- Role badges show Requester, IT Staff, or Administrator text.
- Priority badges always prefix Requested or IT where both appear.
- Status badges show human-readable New, Open, In Progress, Waiting for Requester, Resolved, Closed, Reopened, or Cancelled.
- User state badges say Active or Inactive.
- Private content uses a visible “Internal — not visible to Requester” label.

## 3. Responsive and Accessibility Contract

### 3.1 Breakpoints

| Viewport | Width | Behavior |
| --- | --- | --- |
| Mobile | below 768px | One column; stacked cards; full-width actions where useful; collapsed navigation |
| Tablet | 768–991px | Two columns where readable; Queue may use a bounded table or compact cards |
| Desktop | 992px and above | Centered multi-column layout with a sensible maximum width |

CSS breakpoints govern layout only; they are not evidence dimensions. Required evidence viewports are exactly Mobile 390 x 844, Tablet 834 x 1112, and Desktop 1440 x 900. Each is tested independently from the required 200% browser-zoom pass. There is no unintended page-level horizontal overflow, clipped essential content, overlapping message, hidden action, or unreadable long filename/email.

### 3.2 Accessibility

- Every field has a persistent label; placeholder text is not a label.
- Required state, helper text, errors, counts, and character limits are programmatically associated.
- Keyboard focus is visible and follows reading order.
- Modal focus is trapped; Escape closes a non-processing modal; close returns focus to its trigger.
- Loading, error, conflict, and success messages use appropriate status or alert semantics.
- Tables use headers and captions; card alternatives retain equivalent labels.
- At 200% browser zoom, keyboard focus remains visible; controls and validation remain usable; essential content is not clipped or overlapped; no unintended horizontal page overflow appears; Public Comments and Internal Notes remain visually distinct; and editable/read-only fields remain distinguishable without color alone.
- User content is rendered as text; no Comment/Note HTML or Markdown is interpreted.

## 4. Routes and Application Shell

### 4.1 Routes

| Route | Screen | Access |
| --- | --- | --- |
| / | Role-home decision | Signed-in User |
| /login | Login | Signed-out; signed-in redirects to gate/home |
| /change-password | Change Password | Signed-in User; mandatory when flagged |
| /tickets | My Tickets | Requester |
| /tickets/new | Create Ticket | Requester |
| /tickets/:ticketId | Requester Ticket Detail | Owning Requester |
| /staff/tickets | Ticket Queue | IT Staff, Administrator |
| /staff/tickets/:ticketId | Operational Ticket Detail | IT Staff, Administrator |
| /admin/users | User Management | Administrator |
| /select-requester | Obsolete redirect | Login if signed out; role home if signed in |

Role homes: Requester → /tickets; IT Staff → /staff/tickets; Administrator → /admin/users. An Administrator can navigate to Ticket Queue because the approved matrix explicitly grants operational permissions.

### 4.2 Route Resolution

1. The client requests GET /api/auth/me during application bootstrap.
2. A 401 shows Login and clears protected cached state.
3. A live User with mustChangePassword=true is routed to /change-password regardless of requested protected route.
4. Otherwise role guards select the permitted destination.
5. A forbidden destination shows a safe Forbidden page with a role-home action; it never briefly renders protected content.
6. Session expiry during use clears all User/Ticket/Note caches and returns to Login with “Your session has expired. Please sign in again.”

### 4.3 Authenticated Shell

The shell displays:

- TokTickIT identity.
- Current User name and explicit role badge.
- Role-permitted navigation.
- Change Password action.
- Logout action.
- Keyboard-accessible mobile navigation below 768px.

Requester navigation: My Tickets, Create Ticket. IT Staff: Ticket Queue. Administrator: User Management, Ticket Queue. No shell contains Select/Change Requester.

Logout enters a busy state, prevents repeats, calls the CSRF-protected Logout API, clears all client caches, and returns to Login. A safe API failure still clears local protected display; the user may retry sign-in after server response.

## 5. Shared Screen States

| State | Required behavior |
| --- | --- |
| Initial/loading | Named loading status or skeleton; dependent controls disabled; empty state not shown early |
| Ready/populated | Required data and permitted actions visible |
| Validation | Summary plus field messages; focus moves to summary/first invalid field; entered safe values retained |
| Saving/busy | Trigger disabled; progress text; duplicate submission prevented |
| Success | Specific result announced; fresh server data shown |
| Empty | No records exist in the applicable domain; a useful permitted action is offered |
| No results | Applied query matches none; Clear action offered |
| Forbidden | Role-safe message and role-home action; no protected detail |
| Not found | Safe resource message; another owner’s existence is not revealed |
| Conflict | Current server state explained safely; Reload action; stale entered data is not silently applied |
| Safe failure | General message and Try Again; no stack, SQL, credential, storage, or private data |

Not every screen needs every state, but each applicable state in Sections 6–11 is mandatory.

## 6. Login

### 6.1 Content

- TokTickIT title and “Sign in” heading.
- Email input with autocomplete=email.
- Password input with autocomplete=current-password and Show/Hide control with accessible name.
- Sign in primary action.
- No registration, Forgot Password email, SSO, or social-login controls.

### 6.2 Validation and Interaction

- Email is required, trimmed, and valid; password is required.
- Client messages prevent obviously invalid requests, but server response is authoritative.
- Submit becomes “Signing in…” and disables both inputs and repeat submission.
- INVALID_CREDENTIALS always displays “Email or password is incorrect.”
- ACCOUNT_INACTIVE displays “This account is inactive. Contact an Administrator.”
- LOGIN_THROTTLED displays a safe retry time without confirming an account.
- ORIGIN_REQUIRED and ORIGIN_FORBIDDEN display “The sign-in request could not be verified. Reload this page and try again.” The UI does not retry with Referer, add a CSRF token, or reveal whether the email exists.
- Safe dependency failure displays the general error and Try Again.
- Password is cleared after any failed login; email may remain.

### 6.3 Navigation Outcome

- mustChangePassword=true → /change-password.
- Requester → /tickets.
- IT Staff → /staff/tickets.
- Administrator → /admin/users.

## 7. Change Password

### 7.1 Content

- Heading is “Change your password” for voluntary use or “Create a new password” for the mandatory first login.
- A mandatory banner explains that normal access is blocked until completion.
- Current Password, New Password, and Confirm New Password fields.
- Visible rule list: 12–128 characters and at least three of lowercase, uppercase, number, symbol.
- Save Password primary action and Logout secondary action.

### 7.2 Behavior and States

- Validate required fields, match, rule categories, and different-from-current.
- Never echo a password in an error, success message, URL, persisted form state, or analytics.
- Saving disables inputs and says “Saving password…”.
- Wrong current password maps to its field without identifying any stored credential.
- Success announces “Password changed successfully.” and moves to role home under the rotated session.
- A 401 returns to Login; CSRF/safe failure retains no password values.
- During mandatory mode, direct navigation to any normal route returns here.

## 8. Requester Regression and Additions

### 8.1 Identity Migration

- Remove Development Requester Selection and Change Requester.
- Replace the selected-Requester display with authenticated User name/role.
- Create Ticket displays the authenticated Requester as read-only and sends no requesterId/header.
- My Tickets and Ticket Detail use session identity. Their Lab 2 loading, validation, success, empty/no-results, pagination, failure, responsive, and Attachment behaviors remain.

### 8.2 Updated Requester Ticket Fields

My Tickets adds compact read-only IT Priority and Owner information without removing Lab 2 fields. Owner displays “Unassigned” when null. On mobile, the existing card adds these labels.

Requester Ticket Detail groups:

1. Identification: Ticket Number, dates, status.
2. Requester and classification: Requester, Category, Related System.
3. Priorities and ownership: Requested Priority, IT Priority, Owner.
4. Content: Summary and Description.
5. Resolution indication, when present.
6. Public Comments.
7. Attachments.

Internal Notes, Staff status controls, owner editing, and IT Priority editing are absent.

### 8.3 Public Comments on Requester Detail

- Comments load oldest first with author name/role and backend time.
- Empty message: “No public comments yet.”
- Composer label: “Add a public comment”. Helper: “Visible to you and the support team.”
- Character counter and 1–2,000 validation.
- “Post comment” becomes “Posting…” and prevents duplicate submission.
- Success appends/refetches the server entry and clears the composer.
- Failure retains safe text and offers retry.
- Pagination preserves current Ticket and does not expose Notes.

### 8.4 “Problem Appears Resolved”

The action appears only for OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, or REOPENED owned Tickets without an indication in the current cycle.

Selecting it opens a confirmation dialog:

- Title: “Does the problem appear resolved?”
- Explanation: “This tells the support team the problem appears resolved. It does not formally resolve or close the Ticket.”
- Cancel and “Yes, it appears resolved” actions.

During submission the confirm action disables. Success displays a persistent read-only banner with time and “Waiting for the support team to formally resolve this Ticket.” A same-cycle replay produces the same state. A status conflict reloads Detail and explains that the action is no longer available.

## 9. IT Staff Ticket Queue

### 9.1 Purpose and Controls

The Queue supports operational triage without an unreadable mega-grid.

Controls:

- Search Ticket Number, Summary, Requester name, or Requester email.
- Category, Related System, Requested Priority, IT Priority, Status, and Owner filters.
- Owner choices include All, Unassigned, Mine, and active assignees.
- Sort field and direction.
- Page size 10, 25, or 50.
- Apply Filters and Clear Filters.
- Simple matching, unassigned, and mine counts.

Search/filter values remain draft until Apply. Sort, direction, and page size apply immediately. Applying/clearing or changing immediate controls resets to page 1. Query state may be represented in the URL so reload/back preserves it; invalid URL values show a validation message and reset only after explicit user action.

### 9.2 Desktop/Tablet Table

Columns:

| Column | Content |
| --- | --- |
| Ticket | Ticket Number link and Created date |
| Summary | Summary plus Category / Related System secondary text |
| Requester | Name; email available in accessible secondary text |
| Priorities | Requested and IT text badges |
| Status | Status badge and resolution-indication marker when present |
| Owner | Name/role or Unassigned |
| Updated | Last Updated and Open action |

This grouping keeps nine data concepts in seven columns. At the 834 x 1112 tablet evidence viewport, secondary text may wrap and lower-priority metadata may stack inside cells; the table remains bounded within its container. Below the 768px CSS breakpoint, including the 390 x 844 evidence viewport, every Ticket becomes a labelled card with the same information and an Open Ticket action.

### 9.3 States

- Loading: Queue skeleton and “Loading Ticket Queue…”.
- Empty: no Tickets exist; “No Tickets are available in the Queue.” Filters remain usable.
- No results: “No Tickets match the current Queue filters.” plus Clear Filters.
- Page out of range: accept empty response, then request final valid page once when totalPages is greater than zero.
- Forbidden: “You do not have permission to view the Ticket Queue.” plus role home.
- Failure: safe alert and Try Again without stale data from a previous role/session.

## 10. Operational Ticket Detail

### 10.1 Structure

Header shows Ticket Number, status, Updated time, Back to Queue, and responsive actions. Content groups:

1. Requester-reported information: dates, Requester, Category, Related System, Requested Priority, Summary, Description.
2. Operations: Owner, IT Priority, Current Status, permitted actions, and resolution-indication banner.
3. Attachments: Lab 2 active/removed metadata and active Preview/Download only.
4. Public Comments: shared communication.
5. Internal Notes: private operations area.
6. Status History: read-only actor/from/to/reason/time.

Only Owner, IT Priority, and permitted action controls are editable. Requested Priority and Requester fields remain read-only.

### 10.2 Claim and Owner Controls

- Any unassigned non-terminal Ticket offers Claim Ticket, including migrated OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, or RESOLVED Tickets. The Queue and Detail show “Unassigned” without changing the migrated status.
- Claim becomes “Claiming…” and handles a competing-owner conflict by announcing who now owns the Ticket after reload.
- Assign/Reassign opens an assignee dialog populated only with active IT Staff and Administrators.
- Unassign appears only for NEW, OPEN, or REOPENED.
- Dialog shows current owner, target, and Save/Cancel.
- A stale conflict preserves no misleading success and offers Reload Ticket.
- OWNER_ELIGIBILITY_CONFLICT or CONCURRENT_UPDATE preserves the server state, announces that ownership eligibility changed, and offers Reload Ticket without naming protected Tickets or accounts beyond the refreshed permitted DTO.
- CLOSED/CANCELLED shows ownership read-only.

### 10.3 IT Priority

- Requested Priority remains adjacent and read-only.
- IT Priority select contains Low, Medium, High, Urgent.
- Save is disabled when unchanged or while saving.
- Success identifies the new value. Stale/terminal conflict reloads current value.

### 10.4 Status Transition

- The dropdown contains only allowedStatusTransitions from the server.
- Selecting RESOLVED, CLOSED, or CANCELLED opens a confirmation dialog.
- CANCELLED dialog additionally requires a 5–500 character reason.
- Owner-required transitions on any unassigned Ticket remain disabled with the explanation “Assign an active Ticket Owner first.” The Ticket's current status remains valid and Claim stays available while non-terminal.
- The UI sends expectedUpdatedAt and never synthesizes an unapproved transition.
- Success updates the badge/history. A conflict reloads server state and announces that no change was applied.
- CLOSED/CANCELLED displays “No further status changes are available.”

### 10.5 Resolution-Indication Banner

When present, a prominent pale-green banner says “Requester reports that the problem appears resolved” with the backend time. It never says that the Ticket is formally Resolved unless currentStatus is RESOLVED.

### 10.6 Public Comments and Internal Notes

Public section:

- Heading “Public Comments”.
- Helper “Visible to the Requester and support team.”
- Neutral/pale-green surface.
- 1–2,000 character composer.

Private section:

- Heading “Internal Notes”.
- Persistent warning label “Internal — not visible to Requester”.
- Warm warning-accented surface and distinct Note icon/text.
- 1–5,000 character composer.
- Confirmation text near Post: “This note is private to IT Staff and Administrators.”

Both support loading, empty, paginated, validation, posting, success, and safe-failure states. They are not combined into one ambiguous composer. Entries have no Edit or Delete action.

### 10.7 Attachments

IT Staff/Administrator may list active/removed metadata and Preview/Download active content. Upload and Remove controls are absent. Removed items have no content action. Storage and ownership failures use safe messages.

## 11. Administrator User Management

### 11.1 One-Screen Layout

The screen contains:

- Page title and “Create User” primary action.
- Search by name/email.
- Optional single Role filter.
- User list with Name, Email, Role, Status, and Edit.
- No pagination, delete, bulk, import/export, multi-role, department, or account-history control.

Desktop/tablet uses a readable table. Mobile uses labelled User cards. Long emails wrap without page overflow.

### 11.2 List States

- Loading: “Loading users…” with list skeleton.
- Populated: deterministic name order.
- Empty: “No users are available.” plus Create User.
- No results: “No users match the current search.” plus Clear Search.
- Forbidden: role-safe message and role home.
- Failure: safe alert and Try Again with no stale previous-account data.

### 11.3 Create User Dialog/Page Mode

Fields:

| Field | Rules |
| --- | --- |
| Name | Required; trimmed 2–120 |
| Email | Required; valid; normalized by server; max 254 |
| Role | Exactly Requester, IT Staff, or Administrator |
| Status | Active/Inactive control; required |
| Initial Password | Required; 12–128 and three categories |
| Confirm Initial Password | Must match |

Password inputs use autocomplete=new-password. Helper text states that the User must change the initial password at next login and that it will not be emailed or retrievable. Submit says “Creating user…” when busy. Duplicate email is shown at Email. Success announces the created name, closes/changes mode, focuses the new row, and never displays the supplied password.

### 11.4 Edit User Dialog/Page Mode

Fields are Name, Email, Role, and Status only. The form retains the loaded updatedAt for concurrency. It displays a read-only “Password change required: Yes/No” value but cannot edit it.

Safety behavior:

- Current Administrator’s Role and Status controls are disabled with “You cannot change your own role or deactivate your own account here.”
- Changing a Requester to IT Staff or Administrator warns that current permissions will change but existing submitted Tickets remain attributed to that historical User; it never offers to transfer or rewrite requesterId.
- Deactivation or a change to Requester is blocked while the User owns any non-terminal Ticket. The safe conflict asks the Administrator to reassign or unassign remaining work without displaying protected Ticket details in the error.
- If the User owns only CLOSED or CANCELLED Tickets, deactivation or a change to Requester may succeed and the UI explains that historical ownership remains. Active IT Staff/Administrator role swaps remain available, subject to self-change and last-active-Administrator protection; a simultaneous deactivation still applies the non-terminal-owner rule.
- Last-active-Administrator, non-terminal-owner, stale, or exhausted-concurrency conflicts show the exact safe business explanation and retain non-password edits for correction.
- Stale write says “This user changed since you opened the form. Reload the latest details.”
- No Delete action exists.

### 11.5 Set New Initial Password

Available from another User’s Edit mode. It opens a separate confirmation form with Initial Password and Confirm Initial Password, the standard rules, and warning that all target sessions will end and password change will be required next login. The current Administrator cannot invoke it on self; Change Password is linked instead.

Success announces “A new initial password was set. The user must change it at next login.” It clears both password inputs and refreshes mustChangePassword. No password is shown, copied, emailed, or persisted by the UI.

## 12. Approved UI Copy

| Situation | Approved core copy |
| --- | --- |
| Invalid credentials | Email or password is incorrect. |
| Inactive account | This account is inactive. Contact an Administrator. |
| Login busy | Signing in… |
| Session expired | Your session has expired. Please sign in again. |
| Mandatory password | Create a new password before continuing. |
| Password saving | Saving password… |
| Password success | Password changed successfully. |
| Forbidden | You do not have permission to view this page. |
| Queue loading | Loading Ticket Queue… |
| Queue empty | No Tickets are available in the Queue. |
| Queue no results | No Tickets match the current Queue filters. |
| Internal Note warning | Internal — not visible to Requester |
| Resolution prompt | Does the problem appear resolved? |
| Admin loading | Loading users… |
| Admin no results | No users match the current search. |
| Initial-password success | A new initial password was set. The user must change it at next login. |
| Safe failure | Something went wrong. Please try again. |

Context may be added without weakening safety or exposing protected detail.

## 13. Role-Visibility Checklist

| UI element | Requester | IT Staff | Administrator |
| --- | --- | --- | --- |
| My Tickets / Create Ticket | Visible | Hidden | Hidden |
| Requester Public Comment | Visible on owned Ticket | N/A | N/A |
| Problem Appears Resolved | Eligible owned Ticket | Hidden | Hidden |
| Ticket Queue | Hidden | Visible | Visible |
| Claim/assign/IT Priority/status | Hidden | Visible when eligible | Visible when eligible |
| Public Comments on operational Detail | N/A | Visible | Visible |
| Internal Notes | Never rendered | Visible | Visible |
| Attachment upload/remove | Owned Ticket | Hidden | Hidden |
| Attachment read | Owned Ticket | Any Ticket | Any Ticket |
| User Management | Hidden | Hidden | Visible |

The table controls rendering only. The API authorization matrix remains the security control.

## 14. Visual Evidence Requirements

Implementation evidence must cover every major screen at each exact viewport. Screenshot paths are deterministic:

| Screen | Mobile 390 x 844 | Tablet 834 x 1112 | Desktop 1440 x 900 |
| --- | --- | --- | --- |
| Login | artifacts/lab-03/screenshots/mobile-390x844/login.png | artifacts/lab-03/screenshots/tablet-834x1112/login.png | artifacts/lab-03/screenshots/desktop-1440x900/login.png |
| Mandatory Change Password | artifacts/lab-03/screenshots/mobile-390x844/change-password.png | artifacts/lab-03/screenshots/tablet-834x1112/change-password.png | artifacts/lab-03/screenshots/desktop-1440x900/change-password.png |
| Authenticated Requester shell and updated Ticket Detail | artifacts/lab-03/screenshots/mobile-390x844/requester-ticket-detail.png | artifacts/lab-03/screenshots/tablet-834x1112/requester-ticket-detail.png | artifacts/lab-03/screenshots/desktop-1440x900/requester-ticket-detail.png |
| IT Staff Ticket Queue | artifacts/lab-03/screenshots/mobile-390x844/staff-ticket-queue.png | artifacts/lab-03/screenshots/tablet-834x1112/staff-ticket-queue.png | artifacts/lab-03/screenshots/desktop-1440x900/staff-ticket-queue.png |
| IT Staff Ticket Detail | artifacts/lab-03/screenshots/mobile-390x844/staff-ticket-detail.png | artifacts/lab-03/screenshots/tablet-834x1112/staff-ticket-detail.png | artifacts/lab-03/screenshots/desktop-1440x900/staff-ticket-detail.png |
| Administrator User Management | artifacts/lab-03/screenshots/mobile-390x844/admin-user-management.png | artifacts/lab-03/screenshots/tablet-834x1112/admin-user-management.png | artifacts/lab-03/screenshots/desktop-1440x900/admin-user-management.png |

The Login set includes invalid/Origin-safe failure and valid/forced-change routing; screen-specific validation, loading/busy, success, empty/no-results, conflict, and safe-failure states may be captured as additional exact-dimension screenshots or proven by named automated assertions. Queue evidence includes populated, filtered/no-results, unassigned migrated Tickets, and mobile cards. Staff Detail includes ownership, priority, status confirmation, Comments versus private Notes, Attachment continuity, and resolution indication. Administrator evidence includes list, create/edit, validation, owner/admin safety conflict, and responsive form mode.

A separate 200%-zoom automated pass covers all six screens and explicitly asserts visible keyboard focus, usable controls and validation, no clipped essential content, no overlapping content, no unintended horizontal page overflow, distinct Public Comments/Internal Notes, and distinguishable editable/read-only fields. Retained zoom screenshots, when captured, use artifacts/lab-03/screenshots/zoom-200/{screen}.png.

No screenshot is marked complete in this contract. Placeholder or design-only images are not evidence.

## 15. UI Exclusions

Do not add registration, Forgot Password email, MFA, SSO, social login, notifications, Actions Taken, SLA widgets, advanced dashboards, user deletion, bulk actions, import/export, departments, multiple-role controls, account history, or cloud administration.
