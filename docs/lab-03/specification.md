# Lab 3 Sprint Engineering Specification

## 1. Sprint Goal

Lab 3 turns the completed Requester-facing Lab 2 increment into an authenticated, role-aware ticketing system. Requesters keep their existing ticket and attachment workflows under their signed-in identity; IT Staff gain a shared operational queue and ticket workflow; Administrators gain deliberately minimal user management. The increment preserves existing Category, Related System, Ticket, and Attachment data while extending the Zen Green interface and enforcing every role and ownership decision on the backend.

## 2. Stakeholder Request Interpretation

The temporary Development Requester selector is replaced by secure login, revocable server-side sessions, and a mandatory first-login password change. A signed-in Requester can act only on their own Tickets. IT Staff and Administrators can operate the shared queue under the explicit authorization matrix below. Public Comments are shared with the Requester; Internal Notes remain private to IT Staff and Administrators. Administrators manage accounts without user deletion, multiple roles, email delivery, or advanced identity workflows.

The Lab 2 contract remains the regression baseline except where this contract explicitly replaces simulated identity, adds Lab 3 fields, or changes the status vocabulary. Detailed REST and UI behavior is defined in [api-spec.md](api-spec.md) and [ui-spec.md](ui-spec.md). Planned evidence and Acceptance-Criterion traceability are defined in [tests.md](tests.md).

## 3. Scope

### 3.1 Included

- Email-and-password login, logout, current-user retrieval, session expiry, and mandatory initial-password change.
- Exactly one role per User: REQUESTER, IT_STAFF, or ADMINISTRATOR.
- Backend role and ownership authorization for every protected operation.
- Removal of the Development Requester selector, Change Requester action, sessionStorage identity, and X-Development-Requester-Id authority.
- Lossless migration of all DevelopmentRequester rows into User rows, deterministic mapping of every Lab 2 Ticket status, and null operational ownership without inventing historical assignees.
- Authenticated continuation of Create Ticket, My Tickets, Requester Ticket Detail, and permitted Attachment behavior.
- A shared IT Staff Ticket Queue and an operational Ticket Detail screen.
- Claim, assign, reassign, and constrained unassign behavior.
- Requested Priority retained unchanged and IT Priority initialized from it.
- The eight-status Ticket workflow and append-only status history.
- Append-only Public Comments and role-restricted Internal Notes.
- A Requester “Problem Appears Resolved” indication that does not formally resolve a Ticket.
- Minimal Administrator user listing, search, optional role filter, create, edit, activate/deactivate, and initial-password reset.
- Idempotent local seed data for all roles, realistic Tickets, Comments, and Notes.
- Migration, unit, API/integration, authorization/security, UI, style, responsive, regression, and E2E testing.
- Responsive and accessible Zen Green behavior at Lab 2 CSS breakpoints, with required evidence at 390 x 844, 834 x 1112, 1440 x 900, and 200% browser zoom.

### 3.2 Explicitly Excluded

- Email delivery, invitations, password-reset email, reset links, account unlocking, or administrator approval workflows.
- MFA, SSO, social login, self-registration, or multiple roles per User.
- Actions Taken, SLA calculation or automation, escalation, notification services, or advanced dashboards/KPIs.
- User deletion, bulk user operations, import/export, role history, account history, departments, organizations, profile photos, or extended profiles.
- Advanced Administrator-list pagination, multi-column sorting, or multiple simultaneous filters.
- Cloud deployment, production infrastructure changes, or multi-tenancy.

## 4. Terminology and Functional Requirements

### 4.1 Terminology

- Requester means a User whose role is REQUESTER.
- IT Staff means a User whose role is IT_STAFF.
- Administrator means a User whose role is ADMINISTRATOR.
- Ticket Requester means the immutable historical submitter User referenced by Ticket.requesterId; current role or active state does not rewrite that reference.
- Ticket Owner means the nullable User referenced by Ticket.ownerId. A non-terminal Ticket owner must currently be an active IT Staff or Administrator; a terminal Ticket may retain an ineligible User as historical owner.
- Requested Priority is the immutable priority chosen by the Requester at creation.
- IT Priority is the operational priority initialized from Requested Priority and editable only by IT Staff or Administrators.
- Active Ticket means a Ticket not in CLOSED or CANCELLED status.

### 4.2 Functional Requirements

- **FR-01:** The system shall authenticate an active User with a normalized email address and valid password only after the Login request passes exact approved-Origin validation.
- **FR-02:** The system shall establish a revocable server-side session without exposing the session credential to client JavaScript.
- **FR-03:** The system shall retrieve the current authenticated User and their single role.
- **FR-04:** The system shall log out the current session and remove authenticated access.
- **FR-05:** The system shall require a User with mustChangePassword set to replace the initial password before entering normal application screens.
- **FR-06:** The system shall enforce session expiration, account activation, authenticated-request CSRF validation, exact Origin validation including Login, and login throttling.
- **FR-07:** The application shell shall display the authenticated User name and role and shall show role-permitted navigation only.
- **FR-08:** The backend shall enforce the authorization matrix for every protected endpoint regardless of UI visibility.
- **FR-09:** The Development Requester selector and Change Requester behavior shall be removed.
- **FR-10:** Requester identity and ownership shall come only from the authenticated session.
- **FR-11:** An authenticated Requester shall retain the Lab 2 Create Ticket workflow.
- **FR-12:** An authenticated Requester shall list, search, filter, sort, and paginate only their own Tickets.
- **FR-13:** An authenticated Requester shall open only their own Ticket Detail.
- **FR-14:** An authenticated Requester shall retain permitted upload, metadata, preview/download, and soft-removal operations for Attachments on their own Tickets.
- **FR-15:** Requester Ticket Detail shall display Requested Priority, IT Priority, status, owner, Public Comments, and any active resolution indication without exposing Internal Notes.
- **FR-16:** A Requester shall post a Public Comment on their own Ticket.
- **FR-17:** A Requester shall indicate that an eligible owned Ticket’s problem appears resolved without changing its formal status.
- **FR-18:** IT Staff and Administrators shall access a shared Ticket Queue.
- **FR-19:** The Ticket Queue shall support the specified search, filters, stable sorting, pagination, counts, and default ordering.
- **FR-20:** IT Staff and Administrators shall open operational Ticket Detail for any Ticket.
- **FR-21:** IT Staff and Administrators shall view active and removed Attachment metadata and active Attachment content on operational Ticket Detail.
- **FR-22:** IT Staff and Administrators shall claim any eligible unassigned non-terminal Ticket, including a migrated Ticket whose legacy workflow status was preserved.
- **FR-23:** IT Staff and Administrators shall assign, reassign, or, where permitted, unassign a Ticket to an active IT Staff or Administrator User.
- **FR-24:** IT Staff and Administrators shall update IT Priority without changing Requested Priority.
- **FR-25:** IT Staff and Administrators shall perform only transitions permitted by the status-transition matrix.
- **FR-26:** The system shall record every successful status transition with actor, old status, new status, optional reason, and backend timestamp.
- **FR-27:** Requesters, IT Staff, and Administrators shall retrieve Public Comments visible to them.
- **FR-28:** Requesters on owned Tickets, IT Staff, and Administrators shall append Public Comments.
- **FR-29:** Only IT Staff and Administrators shall retrieve or append Internal Notes.
- **FR-30:** Public Comments and Internal Notes shall be rendered safely as text and shall be append-only.
- **FR-31:** An Administrator shall list Users and search by name or email with an optional single role filter.
- **FR-32:** An Administrator shall create a User with one permitted role, activation state, and initial password.
- **FR-33:** An Administrator shall edit a User’s name, email, role, and activation state.
- **FR-34:** An Administrator shall set a new initial password that forces password change at the next login.
- **FR-35:** The system shall prevent self-deactivation and removal or deactivation of the last active Administrator.
- **FR-36:** The system shall prevent deactivating or changing to Requester a User who owns non-terminal Tickets until those Tickets are reassigned or unassigned, while preserving historical ownership on terminal Tickets.
- **FR-37:** The system shall reject duplicate normalized email addresses and invalid role values.
- **FR-38:** Lab 2 Development Requesters shall migrate to Users without changing identifiers or requester references; every legacy Ticket shall receive the documented deterministic status mapping, ownerId=null, and unique runtime-supplied initial credentials that require password change.
- **FR-39:** Existing Tickets, Attachments, Categories, and Related Systems shall remain valid and accessible after migration.
- **FR-40:** The seed process shall be idempotent and shall create the required role, Ticket, Comment, and Note fixtures from unique runtime-supplied credentials without storing real, hard-coded, or shared passwords.
- **FR-41:** All new screens and states shall follow the reusable Zen Green, responsive, keyboard, focus, labelling, and non-color-feedback rules and shall produce evidence at the exact required mobile, tablet, desktop, and 200%-zoom configurations.
- **FR-42:** API and UI failures shall use safe messages without exposing password hashes, session tokens, stack traces, SQL details, storage keys, internal notes to Requesters, or protected-resource existence.
- **FR-43:** Claim, assignment, reassignment, owner-dependent status, and Administrator role/activation changes shall share the documented lock-ordered transaction protocol so no concurrent commit violates final owner eligibility or Administrator safety.
- **FR-44:** Original Lab 1 and completed Lab 2 behavior shall continue to pass except for explicitly migrated identity and status behavior.

## 5. Business Rules

### 5.1 Authentication, Passwords, Sessions, and CSRF

- **BR-01:** Only an active User with valid credentials may authenticate.
- **BR-02:** Emails are trimmed and lowercased before lookup and storage; database uniqueness applies to the normalized value.
- **BR-03:** Unknown email, malformed email, and wrong-password login attempts return the same 401 INVALID_CREDENTIALS response. An inactive account returns 403 ACCOUNT_INACTIVE only after its password is valid.
- **BR-04:** Password verification performs an Argon2id calculation even when the email is unknown, using a fixed dummy hash, to reduce account-enumeration timing differences.
- **BR-05:** Passwords shall be 12 to 128 Unicode characters, contain at least three of lowercase, uppercase, digit, and symbol categories, not be whitespace-only, and differ from the current password.
- **BR-06:** Passwords are hashed with Argon2id using a unique random 16-byte salt, 64 MiB memory, three iterations, parallelism one, and a 32-byte output. Only the encoded Argon2id hash is stored.
- **BR-07:** Passwords, initial passwords, session tokens, CSRF tokens, and hashes shall never be returned after the request, logged, seeded as repository literals, or committed in environment files.
- **BR-08:** A successful login creates a cryptographically random 32-byte opaque session token. Only its SHA-256 digest is stored in AuthSession.
- **BR-09:** The raw session token is sent only in the tocktickit_session cookie with HttpOnly, SameSite=Strict, Path=/, and Secure outside localhost development. It is never placed in localStorage, sessionStorage, a URL, or JSON.
- **BR-10:** A session has an eight-hour absolute lifetime and a 30-minute idle lifetime. Authenticated activity refreshes lastSeenAt no more than once every five minutes and never extends the absolute expiry.
- **BR-11:** Expired, revoked, missing, unknown, or inactive-user sessions return 401 AUTHENTICATION_REQUIRED and are cleared when possible.
- **BR-12:** Logout deletes the current AuthSession row and clears both authentication cookies. Reuse of that credential fails.
- **BR-13:** A successful password change or Administrator initial-password reset revokes all existing sessions for the affected User.
- **BR-14:** Login creates a separate random CSRF token in the readable tocktickit_csrf SameSite=Strict cookie and stores only its SHA-256 digest in AuthSession.
- **BR-15:** Every authenticated POST, PATCH, PUT, or DELETE request must supply an X-CSRF-Token header equal to the CSRF cookie and matching the stored digest; otherwise it returns 403 CSRF_INVALID. Login is exempt because no authenticated session exists yet.
- **BR-16:** Credentialed CORS is permitted only for configured approved origins. POST /api/auth/login requires exactly one Origin header and compares its normalized scheme, hostname, and effective port as an exact tuple against the allowlist before credential lookup; wildcard, suffix, substring, literal null, malformed values, and Referer fallback are forbidden. Missing Origin returns 403 ORIGIN_REQUIRED; malformed, null, or disallowed Origin returns 403 ORIGIN_FORBIDDEN. Login requires no CSRF token because no authenticated session exists, and an Origin rejection creates no session and reveals no account information. Every authenticated unsafe request retains the same exact-Origin rule plus BR-15 CSRF validation.
- **BR-17:** Five failed logins for the same normalized-email-and-IP key within 15 minutes produce 429 LOGIN_THROTTLED for that key until 15 minutes after the fifth failure. A valid successful login clears that key. This transient throttle is not account locking.
- **BR-18:** A User with mustChangePassword true may access only current-user, change-password, and logout operations. Other protected operations return 403 PASSWORD_CHANGE_REQUIRED.
- **BR-19:** A valid mandatory password change verifies the current password, validates matching newPassword and confirmPassword values, saves a new hash, sets mustChangePassword false, records passwordChangedAt, revokes all sessions, and issues a new session so the User can continue.

### 5.2 Roles, Ownership, and Safe Authorization

- **BR-20:** A User has exactly one current role: REQUESTER, IT_STAFF, or ADMINISTRATOR. Current role and active state determine present permissions; historical foreign-key references do not grant permissions.
- **BR-21:** Authentication middleware resolves User identity from the session. X-Development-Requester-Id and client-supplied requesterId values never select identity or ownership.
- **BR-22:** Only an active User whose current role is REQUESTER may use Requester operations, and may create, list, or retrieve only Tickets whose requesterId equals the authenticated User id. Ticket.requesterId is the immutable historical submitter reference: role changes and deactivation never rewrite or remove it, and a historical submitter need not still have the REQUESTER role.
- **BR-23:** For a Requester, a missing Ticket and another Requester’s Ticket return the same 404 TICKET_NOT_FOUND response.
- **BR-24:** For Attachment metadata or content, a missing, mismatched, or unauthorized resource returns the same 404 ATTACHMENT_NOT_FOUND response. Removed owned content continues to return 410 ATTACHMENT_REMOVED.
- **BR-25:** Role rejection occurs before a protected resource lookup when that role can never use the operation, preventing existence leaks.
- **BR-26:** Administrators are explicitly permitted to perform the IT Staff Ticket operations in this matrix because Ticket ownership may target an Administrator and the handout permits Administrator access to Comments and Notes. User Management remains unavailable to IT Staff.
- **BR-27:** Frontend route guards and hidden controls are usability measures only; backend checks are authoritative.

### 5.3 Requester and Lab 2 Continuity

- **BR-28:** Ticket creation preserves Lab 2 validation, idempotency, numbering, timestamps, active reference checks, attachment limits, and safe failures.
- **BR-29:** A new Ticket stores authenticatedUser.id as requesterId, begins at NEW, has ownerId null, and copies requestedPriority into itPriority in the same transaction.
- **BR-30:** Requested Priority is immutable after creation.
- **BR-31:** My Tickets preserves Lab 2 search, filter, sorting, page sizes, stable ordering, empty/no-results behavior, and DTO fields; it additionally returns read-only itPriority and owner summary.
- **BR-32:** Attachment upload and soft removal remain Requester-only operations on owned Tickets. IT Staff and Administrators may list metadata and retrieve active content but do not upload or remove Attachments in Lab 3.
- **BR-33:** The Development Requester endpoint, selector route, Change Requester action, sessionStorage key, and identity header are removed. The obsolete /select-requester client route redirects to /login when signed out or the role home when signed in.

### 5.4 Assignment, Priority, and Concurrency

- **BR-34:** Ticket.ownerId is nullable in every status, so an unassigned non-terminal Ticket is valid. When a non-terminal Ticket has a non-null owner, that User must currently be active IT Staff or Administrator. CLOSED and CANCELLED Tickets may retain their historical owner after that User is deactivated or changed to REQUESTER; the reference is not rewritten, and the User foreign key preserves identity rather than a permanent role invariant.
- **BR-35:** Claim succeeds for any non-terminal Ticket with no owner, including migrated OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, or RESOLVED Tickets; claiming a Ticket already owned by the caller is an idempotent 200, while another owner causes 409 OWNER_CONFLICT.
- **BR-36:** Assign or reassign is permitted for every status except CLOSED and CANCELLED.
- **BR-37:** Unassign is permitted only in NEW, OPEN, or REOPENED. It is rejected in IN_PROGRESS, WAITING_FOR_REQUESTER, RESOLVED, CLOSED, and CANCELLED.
- **BR-38:** A future transition to OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, RESOLVED, CLOSED, or REOPENED requires a non-null eligible Ticket Owner at commit time. This mutation prerequisite does not make an already stored unassigned Ticket in any status invalid and does not authorize migration to invent an owner or alter a legacy status.
- **BR-39:** IT Priority is one of LOW, MEDIUM, HIGH, or URGENT and may be updated only by IT Staff or Administrators.
- **BR-40:** Owner, IT Priority, status, and Administrator User edits require expectedUpdatedAt. A stale value returns 409 STALE_WRITE without partial change.
- **BR-41:** Claim, assign, reassign, owner-dependent status transitions, and Administrator role/activation edits use the shared eligibility transaction protocol below. Concurrency may produce one success and one documented safe conflict, never a lost update or an invalid final owner.

#### Shared eligibility transaction protocol

1. Begin a PostgreSQL SERIALIZABLE transaction.
2. From an initial read, collect every User that can affect the decision: authenticated actor, Administrator target, current owner, proposed owner/claimant, and all active Administrators needed for the last-active-Administrator invariant. Lock those User rows with SELECT FOR UPDATE in ascending User id order.
3. Lock the affected Ticket with SELECT FOR UPDATE. An Administrator demotion/deactivation additionally locks all non-terminal Tickets currently owned by the target in ascending Ticket id order after User locks. If the locked Ticket reveals an affected User not in the initial lock set, roll back without mutation and restart from step 1 with the expanded set.
4. After all locks are held, re-read User role/activation, Ticket status/ownerId/updatedAt, and User updatedAt; then revalidate authorization, expected versions, owner eligibility, terminal state, and last-active-Administrator safety.
5. Apply the Ticket/User/session/history changes atomically and commit. A non-terminal Ticket may commit unassigned, but must never commit with a non-null owner who is inactive or not IT Staff/Administrator; a terminal Ticket may retain a historical owner.
6. Automatically retry only PostgreSQL serialization failures (SQLSTATE 40001), at most twice after the initial attempt for three total attempts. Every retry restarts the whole protocol and lock order. Exhaustion returns 409 CONCURRENT_UPDATE without partial change. Business conflicts, stale versions, validation failures, and unexpected/deadlock errors are not retried; deterministic User-then-Ticket and ascending-id ordering prevents protocol deadlocks.
7. Final eligibility failures return safe 409 codes: OWNER_ELIGIBILITY_CONFLICT for claim/assign/reassign/status races, USER_HAS_NON_TERMINAL_TICKETS for blocked deactivation/demotion, STATUS_OWNER_REQUIRED for an owner-required transition on an unassigned Ticket, and STALE_WRITE for a changed expected version. Responses contain no protected Ticket details.

Deterministic race outcomes:

| Race pair | First valid commit | Waiting operation and final database state |
| --- | --- | --- |
| Claim vs claimant deactivation | Claim sets the eligible caller as owner | Deactivation returns USER_HAS_NON_TERMINAL_TICKETS; Ticket retains an active eligible owner |
| Claimant deactivation vs claim | Deactivation makes the caller inactive | Claim returns OWNER_ELIGIBILITY_CONFLICT; Ticket remains unassigned |
| Assign vs target deactivation | Assignment sets the eligible target | Deactivation returns USER_HAS_NON_TERMINAL_TICKETS; target remains active and owns the Ticket |
| Target deactivation vs assign | Deactivation succeeds before ownership exists | Assignment returns OWNER_ELIGIBILITY_CONFLICT; Ticket owner is unchanged |
| Assign vs target change to REQUESTER | Assignment sets the eligible target | Role change returns USER_HAS_NON_TERMINAL_TICKETS; target retains an operational role |
| Target change to REQUESTER vs assign | Role change succeeds before ownership exists | Assignment returns OWNER_ELIGIBILITY_CONFLICT; Ticket owner is unchanged |
| Reassign vs old-owner deactivation/demotion | Reassignment removes the old owner | User edit may then succeed if no other non-terminal ownership remains; Ticket has the eligible new owner |
| Old-owner deactivation/demotion vs reassign | User edit sees the still-owned non-terminal Ticket | User edit returns USER_HAS_NON_TERMINAL_TICKETS; reassignment may then commit and final owner is eligible |
| Reassign vs new-owner deactivation/demotion | Reassignment sets the eligible new owner | User edit returns USER_HAS_NON_TERMINAL_TICKETS; new owner remains eligible |
| New-owner deactivation/demotion vs reassign | User edit succeeds before new ownership exists | Reassignment returns OWNER_ELIGIBILITY_CONFLICT; prior owner remains unchanged and eligible |
| Owner-dependent status transition vs owner eligibility edit | The transition revalidates and commits with an eligible owner | A later edit conflicts while the Ticket remains non-terminal; if the transition made it terminal, the edit may succeed and retain historical ownerId |
| Owner eligibility edit vs status transition | A valid edit can commit only when it does not invalidate existing non-terminal ownership | The transition re-reads final state and either commits with an eligible owner or returns OWNER_ELIGIBILITY_CONFLICT/STATUS_OWNER_REQUIRED |
| Concurrent Administrator edits | First valid edit updates User.updatedAt and all safety invariants | The second returns STALE_WRITE or the applicable last-admin/owner conflict; final Administrator count and ownership are valid |

### 5.5 Ticket Status Workflow

- **BR-42:** TicketStatus values are NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, RESOLVED, CLOSED, REOPENED, and CANCELLED.
- **BR-43:** Only IT Staff and Administrators may formally change Ticket status.
- **BR-44:** A status request must name the current expectedUpdatedAt and one target allowed by the matrix. Repeating the current status returns 409 STATUS_UNCHANGED.
- **BR-45:** RESOLVED, CLOSED, and CANCELLED transitions require confirm=true. CANCELLED additionally requires a trimmed reason of 5 to 500 characters.
- **BR-46:** Every successful transition appends TicketStatusHistory; history is never editable or deleted in Lab 3.
- **BR-47:** Moving to REOPENED clears requesterResolutionIndicatedAt so the Requester may indicate resolution again during the new work cycle.
- **BR-48:** CLOSED and CANCELLED are terminal in Lab 3.

#### Status-transition matrix

| From | Permitted target | Actor | Extra rule |
| --- | --- | --- | --- |
| NEW | OPEN, CANCELLED | IT Staff, Administrator | OPEN requires owner; CANCELLED requires confirmation and reason |
| OPEN | IN_PROGRESS, WAITING_FOR_REQUESTER, RESOLVED, CANCELLED | IT Staff, Administrator | Owner required; terminal transitions confirmed |
| IN_PROGRESS | WAITING_FOR_REQUESTER, RESOLVED, CANCELLED | IT Staff, Administrator | Owner required; terminal transitions confirmed |
| WAITING_FOR_REQUESTER | IN_PROGRESS, RESOLVED, CANCELLED | IT Staff, Administrator | Owner required; terminal transitions confirmed |
| RESOLVED | CLOSED, REOPENED | IT Staff, Administrator | Owner required; CLOSED confirmed |
| REOPENED | IN_PROGRESS, WAITING_FOR_REQUESTER, RESOLVED, CANCELLED | IT Staff, Administrator | Owner required; terminal transitions confirmed |
| CLOSED | None | None | Terminal |
| CANCELLED | None | None | Terminal |

The matrix governs requested transitions, not migration validity. An unassigned Ticket may remain stored in any mapped status and may be claimed while non-terminal; an owner-required transition remains unavailable until an eligible owner is assigned or claims it.

### 5.6 Comments, Notes, and Resolution Indication

- **BR-49:** Public Comment content is trimmed, required, and 1 to 2,000 characters.
- **BR-50:** Internal Note content is trimmed, required, and 1 to 5,000 characters.
- **BR-51:** Public Comments and Internal Notes record backend-resolved authorId and createdAt and are append-only; editing and deletion are excluded.
- **BR-52:** Public Comments are visible to the owning Requester, IT Staff, and Administrators. Internal Notes are visible only to IT Staff and Administrators.
- **BR-53:** Comments and Notes are returned oldest first by createdAt then id and use page 1, default page size 20, and allowed sizes 20, 50, or 100.
- **BR-54:** Comment and Note content is returned as data and rendered as text; HTML, Markdown, and script execution are not supported.
- **BR-55:** A Requester may indicate resolution only on an owned Ticket in OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, or REOPENED.
- **BR-56:** Resolution indication sets requesterResolutionIndicatedAt and requesterResolutionIndicatedById but does not change status, owner, priority, or create a formal resolution.
- **BR-57:** Repeating the indication in the same work cycle returns the unchanged indication with 200 and is not duplicated.

### 5.7 Administrator User Management

- **BR-58:** User names are trimmed and contain 2 to 120 characters. Email addresses are normalized and contain at most 254 characters.
- **BR-59:** Duplicate normalized email creates or updates return 409 EMAIL_ALREADY_EXISTS without disclosing password or session data.
- **BR-60:** User creation requires name, email, one role, isActive, initialPassword, and confirmPassword; a created User always has mustChangePassword true.
- **BR-61:** Administrator list search is a trimmed case-insensitive partial match on name or email, limited to 100 characters; optional role is one valid role. Results sort by normalized name ascending then id ascending and are not paginated in Lab 3.
- **BR-62:** No API deletes a User.
- **BR-63:** An Administrator cannot deactivate their own account or change their own role through User Management.
- **BR-64:** A transaction must preserve at least one active Administrator after any role or activation edit.
- **BR-65:** Deactivating a User or changing an IT Staff/Administrator to REQUESTER returns 409 USER_HAS_NON_TERMINAL_TICKETS if that User owns any Ticket not in CLOSED or CANCELLED; the edit may succeed only after every such Ticket is reassigned or unassigned. Ownership of only CLOSED or CANCELLED Tickets does not block the edit and those historical ownerId references remain unchanged. IT_STAFF-to-ADMINISTRATOR and ADMINISTRATOR-to-IT_STAFF changes remain eligible for non-terminal ownership, subject to self-change and last-active-Administrator protection. The shared eligibility protocol locks and rechecks User/Ticket state before the edit and session deletion commit together, so authorization changes take effect immediately without racing a new assignment.
- **BR-66:** Setting a new initial password for another User validates the password, replaces its hash, sets mustChangePassword true, records passwordChangedAt, and revokes all their sessions.
- **BR-67:** Administrators cannot use the initial-password endpoint on themselves; they use the authenticated Change Password screen instead.
- **BR-68:** User create, edit, password reset, and Administrator-count invariants are transactionally enforced.

### 5.8 Query, Validation, Failure, and Regression Rules

- **BR-69:** Queue search is case-insensitive across Ticket Number, Summary, Requester name, and Requester email and is trimmed to at most 100 characters.
- **BR-70:** Queue filters are categoryId, relatedSystemId, requestedPriority, itPriority, currentStatus, and owner with values unassigned, me, or a positive eligible User id.
- **BR-71:** Queue sort fields are ticketNumber, ticketDate, updatedAt, requestedPriority, itPriority, and currentStatus. Default order is updatedAt descending then id descending; id is the same-direction stable tie-breaker for every sort.
- **BR-72:** Priority sort order is LOW, MEDIUM, HIGH, URGENT. Status sort order is NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, REOPENED, RESOLVED, CLOSED, CANCELLED.
- **BR-73:** Queue page defaults to 1 and pageSize to 10; allowed page sizes are 10, 25, and 50. A valid page beyond the end returns an empty items array with correct metadata.
- **BR-74:** Unknown, repeated, malformed, or unsupported query parameters return 400 INVALID_QUERY. A valid reference id that matches nothing returns a successful empty result.
- **BR-75:** Unknown JSON fields, client-managed identity fields, password hashes, owner objects, storage keys, and system timestamps are rejected with 400 VALIDATION_ERROR.
- **BR-76:** Error responses use a stable code, safe message, optional field messages, and optional non-sensitive requestId.
- **BR-77:** Unauthenticated access returns 401, role or CSRF denial returns 403, validation returns 400, protected missing/non-owned resources return 404, stale or invariant conflicts return 409, throttling returns 429, and unexpected or unavailable dependencies return safe 500 or 503 responses.
- **BR-78:** Server logs may contain protected diagnostic details but shall redact passwords, cookies, Authorization values, CSRF tokens, database URLs, file contents, and password hashes.
- **BR-79:** All timestamps are backend-generated UTC values and all API dates use ISO 8601 UTC strings.
- **BR-80:** Lab 2 Attachment type, size, count, compensation, and removed-content rules remain unchanged unless this contract explicitly changes the actor authorization.
- **BR-81:** Lab 1 health and Category response compatibility and all non-identity Lab 2 contracts remain regression obligations.

## 6. Authorization Matrix

Legend: Own means the authenticated Requester owns the Ticket; All means all Tickets; — means forbidden. Every row is backend-enforced.

| Protected operation | Requester | IT Staff | Administrator | Safe denial |
| --- | --- | --- | --- | --- |
| Current User, Logout, Change Password | Self | Self | Self | 401/403 |
| Create Ticket | Yes, requesterId from session | — | — | 403 |
| List My Tickets | Own only | — | — | 403 |
| Requester Ticket Detail | Own only | — | — | 404 for non-owned |
| Queue and operational Ticket Detail | — | All | All | 403 |
| Claim any unassigned non-terminal Ticket; assign, reassign, or constrained unassign | — | All eligible | All eligible | 403/409 |
| Change IT Priority or status | — | All eligible | All eligible | 403/409 |
| List Attachment metadata/content | Own | All | All | 404 for protected mismatch |
| Upload or soft-remove Attachment | Own | — | — | 403 or ownership-safe 404 |
| List Public Comments | Own | All | All | 404 for Requester mismatch |
| Add Public Comment | Own | All | All | 403/404 |
| Indicate problem appears resolved | Own | — | — | 403/404/409 |
| List or add Internal Notes | — | All | All | 403 before lookup for Requester |
| List eligible assignees | — | Yes | Yes | 403 |
| List, create, or edit Users | — | — | Yes | 403 |
| Set another User’s initial password | — | — | Yes | 403/409 |

## 7. UI Specification Summary

The complete contract is in [ui-spec.md](ui-spec.md).

- Signed-out users see Login. Users requiring a password change see only Change Password and Logout.
- The shell displays name, role, role-specific navigation, Change Password, and Logout.
- Requester routes remain /tickets, /tickets/new, and /tickets/:ticketId; selector UI is removed.
- IT Staff and Administrators use /staff/tickets and /staff/tickets/:ticketId.
- Administrators use /admin/users; IT Staff and Requesters cannot render or directly enter it.
- Queue desktop/tablet presentation avoids a mega-grid and uses cards below the mobile CSS breakpoint; required evidence uses 390 x 844 mobile, 834 x 1112 tablet, and 1440 x 900 desktop viewports.
- Operational Ticket Detail visually separates public communication from private Internal Notes.
- User Management is one responsive list-and-form surface without deletion, bulk actions, or mandatory pagination.
- Every applicable screen provides loading, validation, saving, success, empty/no-results, forbidden, not-found, conflict, and safe-failure feedback.

## 8. Data Changes

### 8.1 Enums

| Enum | Values |
| --- | --- |
| UserRole | REQUESTER, IT_STAFF, ADMINISTRATOR |
| RequestedPriority | LOW, MEDIUM, HIGH, URGENT |
| TicketStatus | NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, RESOLVED, CLOSED, REOPENED, CANCELLED |

### 8.2 Models and Key Fields

| Model | Fields and constraints |
| --- | --- |
| User | id; name varchar(120); normalized unique email varchar(254); role; passwordHash; mustChangePassword; isActive; passwordChangedAt nullable; createdAt; updatedAt |
| AuthSession | id UUID; unique tokenHash char(64); csrfTokenHash char(64); userId; createdAt; lastSeenAt; expiresAt; indexes on userId and expiresAt |
| LoginThrottle | unique keyHash char(64); failureCount; windowStartedAt; blockedUntil nullable; updatedAt |
| Ticket | Existing fields; requesterId references User; nullable ownerId references User; required itPriority; new requesterResolutionIndicatedAt and requesterResolutionIndicatedById; migrated currentStatus; existing indexes plus queue indexes |
| Attachment | Existing metadata; uploadedByRequesterId and removedByRequesterId renamed to uploadedByUserId and removedByUserId while preserving values |
| PublicComment | id; ticketId; authorId; content text; createdAt; index on ticketId, createdAt, id |
| InternalNote | id; ticketId; authorId; content text; createdAt; index on ticketId, createdAt, id |
| TicketStatusHistory | id; ticketId; actorId; fromStatus; toStatus; reason nullable varchar(500); createdAt; index on ticketId, createdAt, id |

Application/service transactions enforce current-role eligibility when a Ticket is submitted, when a non-null non-terminal owner is assigned or retained through a User edit, and when a User authors a Comment, Note, or resolution indication. Ticket.requesterId is an immutable historical submitter reference and does not require the User to remain a Requester. Ticket.ownerId may be null in every status; if non-null on a non-terminal Ticket it must reference an active IT Staff or Administrator, while CLOSED and CANCELLED Tickets may retain a historical owner who later becomes inactive or a Requester. PostgreSQL foreign keys preserve User identity with RESTRICT; they do not enforce permanent roles, and no Lab 3 operation hard-deletes these records.

Queue indexes include Ticket(updatedAt, id), Ticket(ownerId, updatedAt), Ticket(currentStatus, updatedAt), Ticket(itPriority, updatedAt), and existing Category, Related System, Requested Priority, and Requester indexes. Normalized User email is unique; User(role, isActive, name) supports assignee and Admin queries.

Exact new-field decisions:

- User.id is an auto-increment integer retained from DevelopmentRequester. name is varchar(120); email is varchar(254); role is required UserRole; passwordHash is varchar(255); mustChangePassword and isActive are required booleans; passwordChangedAt is a nullable UTC timestamp; createdAt and updatedAt are required UTC timestamps. Defaults are mustChangePassword=true, isActive=true, and backend/database current time for timestamps.
- AuthSession.id is a generated UUID. tokenHash and csrfTokenHash are required 64-character lowercase hexadecimal digests; tokenHash is unique. userId is a required RESTRICT foreign key to User. createdAt, lastSeenAt, and expiresAt are required UTC timestamps. Session invalidation deletes the row; an expiry-cleanup job may delete expired rows.
- LoginThrottle.keyHash is the 64-character primary key derived from normalized email plus IP using a server-side HMAC secret; raw email/IP combinations are not stored in this table. failureCount is a non-negative integer; windowStartedAt and updatedAt are required timestamps; blockedUntil is nullable. Expired entries may be deleted.
- Ticket.ownerId is a nullable RESTRICT foreign key to User in every TicketStatus. Current owner eligibility is a transactionally enforced final-state invariant rather than a database role constraint. itPriority is required RequestedPriority. requesterResolutionIndicatedAt is nullable and requesterResolutionIndicatedById is a nullable RESTRICT foreign key to User; both are null or populated together. Every successful Ticket mutation advances updatedAt.
- PublicComment and InternalNote use auto-increment integer ids and required RESTRICT foreign keys to Ticket and User. content is PostgreSQL text and createdAt is a required UTC timestamp. They have no updatedAt because Lab 3 entries are immutable.
- TicketStatusHistory uses an auto-increment integer id; required RESTRICT foreign keys to Ticket and actor User; required fromStatus and toStatus TicketStatus values; nullable varchar(500) reason; and required createdAt. It has no update/delete API.
- Attachment keeps every Lab 2 field, constraint, storage key, and Ticket reference. Only uploader/remover foreign-key column names and Prisma relation names change from Requester to User terminology; the public Lab 2 DTO remains compatible.
- Migration SQL adds CHECK constraints for User name length 2–120, normalized lowercase email length at most 254, Comment length 1–2,000, Note length 1–5,000, status-history reason length 5–500 when present, non-negative LoginThrottle counts, and paired resolution-indication fields. Application validation supplies field-specific messages before these database guards.
- All foreign-key mutation behavior is ON DELETE RESTRICT and ON UPDATE CASCADE. Unique constraints cover User.email, AuthSession.tokenHash, Attachment.storageKey, Ticket.ticketNumber, and Ticket(requesterId, clientSubmissionId).

### 8.3 Lossless Migration

The complete Lab 2 status mapping is:

| Lab 2 status | Lab 3 status | ownerId after migration |
| --- | --- | --- |
| NEW | NEW | null |
| ASSIGNED | OPEN | null |
| IN_PROGRESS | IN_PROGRESS | null |
| PENDING_REQUESTER | WAITING_FOR_REQUESTER | null |
| RESOLVED | RESOLVED | null |
| CLOSED | CLOSED | null |
| CANCELLED | CANCELLED | null |

1. Before any mutation, preflight asserts that the distinct legacy Ticket statuses are exactly values covered by the table, that no Ticket or Attachment requester reference is orphaned, and that the credential mapping is complete. An unsupported/unknown legacy status causes a safe failure with no schema or data change; it is never silently coerced.
2. Record Ticket, Attachment, DevelopmentRequester, Category, and RelatedSystem row counts; Ticket id/requesterId/status/createdAt/updatedAt checksums; Attachment id/ticket/uploader/remover checksums; status totals; and relevant foreign-key validity for postflight comparison.
3. Load LAB3_MIGRATION_INITIAL_CREDENTIALS as an untracked environment-provided JSON mapping with exactly one entry keyed by each existing DevelopmentRequester numeric id. Reject a missing User entry, duplicate plaintext value assigned to two Users, any value that violates BR-05, or an unexpected key. Validation errors identify only safe User ids and never echo a credential.
4. Rename DevelopmentRequester to User so existing ids remain unchanged; add role=REQUESTER, password fields initially nullable, and authentication fields.
5. Rename Attachment uploader/remover foreign-key columns to User terminology without changing their values.
6. Add Ticket.ownerId nullable, itPriority nullable, resolution fields, and supporting tables/indexes. Set ownerId=null for every migrated Ticket because Lab 2 recorded no operational IT owner; never infer or fabricate one.
7. Apply the status table exactly and backfill Ticket.itPriority from requestedPriority. Do not change Ticket ids, requesterId, ticketNumber, ticketDate, createdAt, updatedAt, Category/RelatedSystem links, Attachment data/links, or other preserved fields, and do not fabricate status-history events for activity that predates Lab 3.
8. Independently hash each validated mapped credential with Argon2id and a unique random salt, store only its encoded hash, and set mustChangePassword=true for every migrated User. Plaintext values and the complete mapping are never stored, logged, returned, committed, or included in test output.
9. Postflight validates non-null fields, foreign keys, unchanged preserved counts/checksums/timestamps, exact per-status totals after mapping, requester/Attachment links, ownerId=null for every migrated Ticket, and itPriority=requestedPriority; then passwordHash and itPriority become non-null.
10. Run the migration against equivalent populated Lab 2 fixtures more than once from the same starting snapshot and require identical transformed data/checksums. Migrated unassigned Tickets of every non-terminal mapped status must appear in the Staff Queue with owner=null and be claimable without changing their migrated status first.
11. Remove Development Requester API/client state only after authenticated ownership and migrated-queue regression tests pass. Migration never resets the database.

Rollback uses the pre-migration database backup and migration transaction; it does not attempt lossy down-conversion after Lab 3 writes exist.

### 8.4 Seed Rules

- Seed requires LAB3_SEED_INITIAL_CREDENTIALS as an untracked environment-provided mapping keyed by each deterministic seeded User email. Before mutation it rejects a missing entry, duplicate credential, unexpected entry, or password-policy violation; tests inject isolated per-User fixture values at runtime and never print them.
- Existing password hashes are never overwritten by a normal repeat seed.
- Each newly inserted seeded User receives an independently salted Argon2id hash and mustChangePassword=true; migrated Users retain the unique hashes established by migration.
- Preserve at least four active and one inactive migrated Requester; add at least three active and one inactive IT Staff; add at least one active Administrator.
- Deterministic clientSubmissionId values make realistic Ticket fixtures idempotent while official numbers continue through the transaction-safe sequence.
- Fixtures cover every status, every priority, assigned and unassigned Tickets, and multiple Requesters.
- Example Comments and Notes use non-sensitive fictional content. Repeat seed checks stable Ticket, author, and content keys before appending.

## 9. API Contract Summary

The exact 31 operations, cookies, bodies, DTOs, queries, validations, and failures are in [api-spec.md](api-spec.md). Existing Requester endpoints retain their /api paths but use the authenticated session. New route groups are /api/auth, /api/staff, and /api/admin. There is no Development Requester selection endpoint in the Lab 3 application contract.

## 10. Acceptance Criteria

### 10.1 Authentication and Session

- **AC-01:** Given an approved exact Origin and an active User with valid credentials, when Login is submitted, then Origin validation precedes credential validation, one revocable session is established in secure cookies, and the response contains only the safe User and session expiry fields.
- **AC-02:** Given an unknown email, malformed email, or wrong password, when Login is submitted, then the same safe 401 response is returned and no session is created.
- **AC-03:** Given an inactive User and the correct password, when Login is submitted, then a safe inactive-account response is shown and no session is created.
- **AC-04:** Given five failed attempts for one normalized-email-and-IP key in 15 minutes, when another attempt occurs during the block, then it returns 429 without performing authenticated access.
- **AC-05:** Given a User must change the initial password, when Login succeeds, then normal protected routes remain unavailable until a valid current password and matching valid new password are saved.
- **AC-06:** Given a password change succeeds, when the response completes, then all old sessions are revoked, a fresh session is issued, mustChangePassword is false, and the role home opens.
- **AC-07:** Given an authenticated session, when its idle or absolute expiry is reached or its User becomes inactive, then protected access returns 401 and no protected data is returned.
- **AC-08:** Given an authenticated User, when Logout succeeds, then the current session is revoked, cookies are cleared, and direct protected access returns 401.
- **AC-09:** Given an authenticated unsafe request lacks a valid matching CSRF header and cookie, when it reaches the API, then it returns 403 and performs no mutation.

### 10.2 Identity, Roles, and Requester Regression

- **AC-10:** Given any authenticated User, when the application shell loads, then it displays the User name and role and only destinations authorized for that role.
- **AC-11:** Given a User has mustChangePassword true or lacks a required role, when a protected UI route or API is requested directly, then access is blocked by the backend with the documented safe response.
- **AC-12:** Given a Requester supplies another requesterId or X-Development-Requester-Id, when a Requester operation runs, then authenticatedUser.id remains the only ownership identity.
- **AC-13:** Given two Requesters have Tickets, when one lists or directly requests the other’s Ticket or Attachment, then no foreign data or existence information is returned.
- **AC-14:** Given an authenticated Requester, when Create Ticket, My Tickets, Ticket Detail, and permitted Attachment workflows run, then the completed Lab 2 behavior remains available without a Requester selector.
- **AC-15:** Given a Requester creates a valid Ticket, when creation commits, then requesterId equals the session User, status is NEW, owner is null, and IT Priority equals Requested Priority.
- **AC-16:** Given a signed-out user or obsolete /select-requester route, when navigation occurs, then Login or the authenticated role home is shown and no selector state is used.

### 10.3 Queue and Operational Ticket Detail

- **AC-17:** Given IT Staff or an Administrator is authenticated, when the Ticket Queue loads, then Tickets across Requesters are returned with the approved fields and stable default ordering.
- **AC-18:** Given Ticket data varies, when queue search and filters are applied, then only records matching all criteria are returned and search covers the four documented fields.
- **AC-19:** Given matching queue Tickets, when each supported sort and page is requested, then priority/status business order, same-direction id tie-breaks, and correct pagination metadata are returned.
- **AC-20:** Given an invalid, unknown, or repeated queue query parameter, when the queue API is requested, then it returns 400 INVALID_QUERY without executing untrusted ordering.
- **AC-21:** Given a queue has no Tickets or a query has no matches, when loading completes, then distinct empty or no-results feedback and the appropriate action are shown.
- **AC-22:** Given a Requester or signed-out user, when the staff queue or operational detail is requested directly, then the API rejects access and returns no Ticket data.
- **AC-23:** Given IT Staff or an Administrator opens operational Ticket Detail, when data loads, then Ticket fields, owner, both priorities, permitted status actions, Public Comments, Internal Notes, and existing Attachments are presented in distinct groups.

### 10.4 Assignment, Priority, Status, and Resolution Indication

- **AC-24:** Given any eligible unassigned non-terminal Ticket, including an unassigned migrated OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, or RESOLVED Ticket, when IT Staff or an Administrator claims it, then that User becomes owner exactly once without an intermediate status rewrite; a competing claim receives a safe conflict.
- **AC-25:** Given an eligible Ticket and active IT Staff or Administrator target, when assignment or reassignment uses the current expectedUpdatedAt, then the shared User-then-Ticket lock protocol commits an eligible owner or rejects the stale/ineligible race without overwrite.
- **AC-26:** Given a Ticket in NEW, OPEN, or REOPENED, when a permitted actor unassigns it, then owner becomes null; disallowed statuses reject unassignment.
- **AC-27:** Given a valid IT Priority and current expectedUpdatedAt, when IT Staff or an Administrator updates priority, then only itPriority changes and Requested Priority remains unchanged.
- **AC-28:** Given a current Ticket status, when a permitted target in the transition matrix is submitted with all prerequisites, then the status changes and one history row records actor, from, to, reason, and time.
- **AC-29:** Given a target is absent from the matrix, requires an owner, requires confirmation, or requires a cancellation reason, when status change is requested without satisfying it, then a safe validation or conflict response leaves the Ticket unchanged.
- **AC-30:** Given CLOSED or CANCELLED status, when claim, assignment, priority, or status mutation is attempted, then the documented terminal-state conflict is returned.
- **AC-31:** Given a Requester owns an eligible Ticket, when “Problem Appears Resolved” is confirmed, then the indication and actor/time are stored while formal status remains unchanged.
- **AC-32:** Given a non-owner, ineligible status, or repeated same-cycle indication, when the resolution action is requested, then ownership is protected, invalid state conflicts, and an existing indication is returned idempotently.

### 10.5 Comments, Notes, and Attachments

- **AC-33:** Given a permitted actor submits trimmed Public Comment content of 1 to 2,000 characters, when creation succeeds, then one append-only entry records the authenticated author and backend time.
- **AC-34:** Given an owning Requester, IT Staff, or Administrator lists Public Comments, when a valid page is requested, then visible entries are returned oldest first with correct pagination.
- **AC-35:** Given empty, oversized, unknown-field, or unsafe markup-like Comment content, when submitted, then invalid content is rejected or returned as inert text and no script executes.
- **AC-36:** Given IT Staff or an Administrator submits or lists Internal Notes, when the request succeeds, then entries are append-only, oldest first, and include safe author and time fields.
- **AC-37:** Given a Requester, when any Internal Note endpoint is requested, then it returns 403 before resource lookup and no Note content or Ticket-existence information is returned.
- **AC-38:** Given IT Staff or an Administrator views Attachments, when metadata or active content is requested, then existing Lab 2 files remain available without storage identifiers; upload and removal remain unavailable to those roles.
- **AC-39:** Given an owning Requester, when permitted Attachment operations run, then Lab 2 type, size, count, ownership, soft-removal, compensation, and removed-content rules still apply.

### 10.6 Administrator User Management

- **AC-40:** Given an Administrator opens User Management, when loading succeeds, then every User row shows Name, Email, Role, Status, and Edit and supports name/email search and one optional role filter.
- **AC-41:** Given a non-Administrator, when a User Management route or API is requested directly, then it returns 403 and no User list or credential field is returned.
- **AC-42:** Given valid create data and one permitted role, when an Administrator creates a User, then the normalized email is unique, the initial password is hashed, and mustChangePassword is true.
- **AC-43:** Given duplicate email, invalid role, invalid name/email/password, unknown field, or mismatched confirmation, when User creation is submitted, then a safe field/conflict response appears and no partial User is created.
- **AC-44:** Given an existing User and current expectedUpdatedAt, when an Administrator edits name, email, role, or activation, then only approved fields change, current role/active state immediately governs permissions, historical requesterId references remain unchanged, and stale edits conflict.
- **AC-45:** Given an Administrator attempts self-deactivation or self-role-change, when the edit is submitted, then it returns a conflict and the account remains an active Administrator.
- **AC-46:** Given only one active Administrator would remain, when an edit would remove or deactivate that role, then the transaction is rejected and at least one active Administrator remains.
- **AC-47:** Given a User owns any non-terminal Ticket, when deactivation or a change to REQUESTER races an ownership operation, then the shared lock protocol permits only a final state with an eligible owner and otherwise returns the documented safe conflict; given only CLOSED or CANCELLED ownership, the edit succeeds and preserves historical ownerId references. IT_STAFF/ADMINISTRATOR changes remain permitted unless self-change or last-active-Administrator protection blocks them.
- **AC-48:** Given an Administrator sets another User’s valid new initial password, when it succeeds, then the password is hashed, all sessions are revoked, and the next login requires password change; self-reset is rejected.

### 10.7 Migration, Safety, UI, and Regression

- **AC-49:** Given populated Lab 2 data, when Lab 3 migration completes, then every Development Requester keeps the same User id, every Ticket retains its id/requester/timestamps and other preserved fields, and every Attachment retains its id, Ticket, uploader/remover references, timestamps, and counts.
- **AC-50:** Given the seven Lab 2 statuses, when migration completes, then NEW/IN_PROGRESS/RESOLVED/CLOSED/CANCELLED remain unchanged, ASSIGNED maps to OPEN, PENDING_REQUESTER maps to WAITING_FOR_REQUESTER, every migrated ownerId is null, and IT Priority equals Requested Priority; an uncovered value fails before mutation.
- **AC-51:** Given seed runs repeatedly with environment-provided local credentials, when it completes, then required role and realistic workflow fixtures exist once and existing hashes are not reset.
- **AC-52:** Given any safe failure or protected denial, when its response and logs are inspected, then no plaintext password, hash, cookie, CSRF token, Internal Note to a Requester, stack trace, SQL detail, database URL, storage key, or protected-resource existence leaks.
- **AC-53:** Given Login, mandatory Change Password, authenticated Requester shell/Ticket Detail, Staff Queue, Staff Ticket Detail, and Administrator User Management at exactly 390 x 844, 834 x 1112, and 1440 x 900, when evidence is captured, then each screen follows Zen Green tokens with no unintended horizontal page overflow, clipping, overlap, or hidden essential action.
- **AC-54:** Given those six screens at 200% browser zoom with keyboard-only and assistive-technology use, when exercised, then focus remains visible; controls, validation, labels, dialogs, and live feedback remain usable; essential content is not clipped or overlapped; Comments/Notes remain distinct; and editable/read-only fields remain distinguishable without color alone.
- **AC-55:** Given the Lab 3 increment is complete, when all original Lab 1 and Lab 2 regression suites plus planned Lab 3 suites and builds run against the isolated test database, then all applicable tests pass with only the explicitly migrated identity/status assertions updated.
- **AC-56:** Given populated Lab 2 Users and the migration credential mapping, when preflight runs, then a missing User credential, duplicate credential, unexpected key, or policy-invalid credential fails before mutation; when a valid unique mapping is supplied, every migrated User receives an independently salted Argon2id hash and mustChangePassword=true without plaintext appearing in storage, logs, responses, commits, or test output.
- **AC-57:** Given a historical Ticket submitter is deactivated or changed away from REQUESTER, when the User edit succeeds, then existing requesterId values remain unchanged while that User can no longer authenticate as or receive Requester operations under the former role.
- **AC-58:** Given concurrent Administrator edits involving role, activation, last-active-Administrator state, or non-terminal ownership, when OP-30 executes through the shared lock protocol, then at most one valid transaction commits and each losing request receives the documented safe conflict without Ticket contents.
- **AC-59:** Given a populated Lab 2 snapshot containing every legacy status, when migration runs repeatedly from equivalent starting snapshots, then the exact mapping and null-owner result are deterministic, preserved identifiers/references/counts/timestamps match postflight checks, every migrated Ticket appears in the Staff Queue, and every non-terminal migrated Ticket is claimable without a status rewrite.
- **AC-60:** Given each documented claim/assign/reassign/status-versus-role-or-activation race and concurrent Administrator edit, when both operations execute, then locks use ascending User ids before Ticket ids, only documented serialization failures receive at most two retries, the HTTP outcomes match the race table, and assertions prove the final database owner/status/User/session/history state satisfies every invariant.
- **AC-61:** Given Login with a missing, literal null, malformed, wrong-scheme, wrong-hostname, wrong-port, misleading suffix/subdomain, or approved Origin, when submitted, then the first case returns 403 ORIGIN_REQUIRED, the disallowed cases return 403 ORIGIN_FORBIDDEN, the approved exact tuple continues to credential validation without a CSRF token, rejected cases create no session, and no response reveals whether the email exists.

## 11. Product Definition of Done

Product completion requires every applicable item below; documentation approval alone is not implementation completion.

- [ ] FR-01 through FR-44 and BR-01 through BR-81 are implemented or directly verified.
- [ ] AC-01 through AC-61 map to at least one planned test and later to passing evidence.
- [ ] All 31 REST operations match api-spec.md and the authorization matrix.
- [ ] Argon2id parameters, password boundaries, session digest storage, expiry, logout revocation, login throttling, authenticated CSRF, and exact Login/unsafe-request Origin controls are implemented and tested.
- [ ] Forced password change cannot be bypassed through routes or direct API calls.
- [ ] The Development Requester selector, Change Requester action, sessionStorage identity, and identity header are removed.
- [ ] Requester Ticket and Attachment ownership is derived from the session and remains safe against direct identifiers.
- [ ] Queue query, assignment, priority, status, Comment, Note, and resolution-indication contracts are complete; every ownership/User race follows ascending User-id then Ticket-id locks, bounded serialization retry, and final-state assertions.
- [ ] The exact status-transition matrix and required confirmations are enforced.
- [ ] Requesters never receive Internal Notes.
- [ ] Administrator self-safety, last-active-Administrator, non-terminal-owner, duplicate-email, one-role, no-deletion, and session-revocation rules are enforced transactionally; terminal-only ownership and historical submitter/owner references remain intact.
- [ ] Migration preflight/postflight prove the complete seven-status mapping, ownerId=null, deterministic repeatability, Queue visibility/claimability, preserved ids/references/counts/timestamps, and complete unique per-User credential hashing without exposure.
- [ ] Seed is idempotent, uses unique environment-provided per-User local credentials, preserves existing hashes, and creates all required safe fixtures.
- [ ] All 75 stable Unit, API/integration, SEC, MIG, REG, UI, STYLE, RESP, and E2E Planned tests are implemented without skipped or weakened assertions.
- [ ] Existing Lab 1 and Lab 2 suites pass after only approved migration updates.
- [ ] Client and server production builds pass; compiled-server start and health smoke checks pass.
- [ ] Evidence covers all six major screens at exactly 390 x 844, 834 x 1112, and 1440 x 900, plus 200% zoom assertions for visible focus, usable controls/validation, no clipped/overlapping/overflowing essential content, communication distinction, and editable/read-only distinction.
- [ ] No response or tracked artifact contains a credential, secret, token, hash, database URL, or private Internal Note exposed to a Requester.
- [ ] reviewer.md contains only real review evidence and ai-use.md contains only real AI-use evidence.
- [ ] README and environment examples document untracked migration/seed credential-map provisioning, session configuration, run, test, and recovery steps without real credentials or complete mappings.
- [ ] No excluded feature has been added.
- [ ] Final implementation reaches main only through the required lab3-staging review and release workflow.

## 12. Assumptions and Decisions

| ID | Decision | Reason |
| --- | --- | --- |
| D-01 | Use Argon2id and opaque database-backed cookie sessions instead of browser-stored bearer tokens. | Password and logout revocation are explicit, and JavaScript cannot read the session credential. |
| D-02 | Use SameSite=Strict cookies plus a stored-digest double-submit CSRF token and an exact normalized scheme/host/effective-port Origin allowlist; Login requires Origin but no CSRF token. | Cookie authentication and session-creating Login both need explicit cross-site request protection without trusting Referer or partial hostname matches. |
| D-03 | Grant Administrators the operational Ticket permissions shown in the matrix. | The handout permits Administrator ownership and visibility; the choice is explicit rather than accidental. |
| D-04 | Keep Requester REST paths stable and replace only identity resolution. | Minimizes Lab 2 regression while removing insecure simulated identity. |
| D-05 | Keep Attachment mutation Requester-only; Staff/Admin receive read access. | Lab 3 requires Attachment continuity on operational detail but does not add Staff attachment management. |
| D-06 | Model resolution indication as Ticket fields, not a status transition. | It communicates Requester belief while preserving IT responsibility for RESOLVED and CLOSED. |
| D-07 | Record status history but not account history. | Status auditability supports the workflow; account-history screens are explicitly excluded. |
| D-08 | Rename the existing requester table and preserve ids and immutable requesterId references. | This is the least risky way to keep Ticket and Attachment ownership intact while current role and activation independently govern permissions. |
| D-09 | Do not paginate the minimalist Administrator list. | The handout excludes mandatory pagination and advanced list behavior. |
| D-10 | Treat CLOSED and CANCELLED as terminal for Lab 3. | REOPENED is reserved for returning a RESOLVED Ticket to work and avoids an ambiguous terminal workflow. |
| D-11 | Combine optimistic timestamps with SERIALIZABLE transactions, ascending User-id then Ticket-id row locks, and at most two full retries for SQLSTATE 40001. | Prevents silent overwrites, assignment/demotion races, and protocol deadlocks while giving deterministic safe conflicts. |
| D-12 | There are no unresolved specification ambiguities in this revision. Future changes must update affected requirements, ACs, APIs, UI rules, and planned tests before implementation. | Preserves Spec DD and traceability. |
| D-13 | Provision migrated and seeded initial credentials from separate untracked per-User environment mappings; reject incomplete, duplicate, unexpected, or policy-invalid values before mutation. | Unique credentials eliminate the shared-secret design while keeping real password material outside version control and evidence. |
| D-14 | Treat requesterId and terminal ownerId as historical identity references, while application transactions enforce current eligibility for permissions and non-terminal ownership. | A foreign key preserves who acted; it cannot safely encode a User's permanent role, and history must not be rewritten. |
| D-15 | Preserve every legacy Ticket's mapped workflow status with ownerId=null rather than inventing an owner or altering status to meet a future-transition prerequisite. | Lab 2 stored no operational IT owner, and migration must preserve facts rather than manufacture them. |
| D-16 | Keep CSS breakpoints separate from evidence viewports and require 390 x 844, 834 x 1112, 1440 x 900, and 200% zoom evidence. | Exact reproducible evidence dimensions make responsive acceptance objective without redefining layout breakpoints. |
