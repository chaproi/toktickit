# Sprint 4 UI Contract

Status: **Student decisions accepted — Contract peer review approved**. Product completion incomplete; all product tests **Planned**. H = handout/rubric, L = inherited Lab 3, P = student-accepted design choice (not an H mandate). Read [specification](specification.md), [API](api-spec.md) and [tests](tests.md). Screens/mockup interpretations do not create permissions. [Formal approval](reviewer.md#completed-peer-review) applies to reviewed HEAD fec388a3c2ab63cabb1bf20f3fa913fb023d9241; this metadata change is unreviewed. Only the contract-review DoD item is complete; remaining GitHub Issues are required before RED–GREEN implementation, with no implementation or release readiness claimed.

## 1. Navigation and visual foundation

[D-19](specification.md#d-19), FR-23/FR-25, AC-35/AC-37/AC-38: recommend Requester `/dashboard`, Staff/Admin `/staff/dashboard` as post-login home after forced-password-change gate; role Dashboard nav with active state. Keep `/tickets`, create/detail, `/staff/tickets`, staff detail and `/admin/users` directly reachable under L. Admin uses Staff dashboard; user-count cards optional and excluded. Staff mockup Create Ticket button does not override Requester-only creation. Preserve logout/session-expiry behavior and clear scoped cached data before changing user/role.

Use existing Zen Green tokens/components (primary #006B3C, supporting #0B7A46, surface #EAF6EF), typography, buttons, spacing, fields, cards/tables and badges. SDS orange palette conflicts with H/L and remains in the conflict register. Breakpoints: mobile <768 px; tablet 768–991 px; desktop ≥992 px. No implementation reorganization or replacement CSS framework is required by this draft.

## 2. Actions Taken on Ticket Detail

H requires all action items visible read-only to Requesters on owned Tickets; Staff/Admin also get allowed controls. Keep Public Comments and private Internal Notes separate; Requester never receives Notes, hidden fields or privileged DOM controls. Attachment Notes is displayed as plain text in the action, with a separate existing authorized Ticket attachment panel; no guessed file URLs, new upload relation or automatic links. Long/untrusted text wraps and is never rendered as HTML.

List columns/cards: Action Date/Time, description, status text/badge, assignee, Performed by, result, follow-up flag/note, Attachment Notes; reveal creator and Ticket Owner labels separately in detail. Parent Ticket summary/header always shows coordinator. Required identities under [D-03](specification.md#d-03): “Created by”, “Assigned to”, “Performed by”; null performer = “Not completed”. All status/field/history choices D-02–D-09 are accepted by the student; they retain their design provenance rather than becoming handout mandates. List order oldest createdAt then id; pagination 20/50/100. Show full safe history via View history, ordered oldest first; never edit an event.

| Parent/action | Staff/Admin controls under student-accepted decisions | Requester |
| --- | --- | --- |
| Editable parent, PLANNED | View, Edit, Assign/reassign, Start, Cancel; Create action | View/list/history only |
| Editable parent, IN_PROGRESS | View, Edit, Assign/reassign, Complete, Cancel; Create action | Same read-only |
| COMPLETED/CANCELLED action | View/history only | Same read-only |
| RESOLVED/CLOSED/CANCELLED parent | View/history only, no new action writes | Same read-only |

Control visibility matches exact action matrix and role; server remains authoritative. D-04 recommends shared operational access rather than owner/assignee-only control. Existing Ticket Comments/Notes/attachments maintain L permissions; do not hide unrelated approved features due to the action freeze.

Create form: backend Date/Time shown as automatic/read-only; description required; result optional; active Staff/Admin assignee picker default current user; Performed by automatic on completion; follow-up checkbox plus required conditional note; Attachment Notes optional. Separate creator from assignee. Validation bounds D-04 match API; labels show required meaning and field-specific messages. Backend validates a worker that becomes inactive while picker is open. Do not silently substitute a newly ineligible assignee; retain text and show choose-an-active-worker error.

Edit form: nonterminal records only, approved content and assignee fields; retains immutable date/creator/Ticket and current tokens. Changes append history (D-08). Follow-up rules (D-04/D-06/D-08/D-18, AC-41/T-49/T-50): create false sends omitted/null/empty note as null, nonempty false note receives400; true requires validated note. Edit sends only intended changed fields and validates the final merged state, retaining omitted values. Changing true→false with existing note opens an explicit clear confirmation; confirm sends **followUpRequired=false and followUpNote=null**, cancel retains checkbox=true and text. Never send only false or an empty string to clear an existing note. Changing other fields while true preserves omitted note; true with null/empty note has field error. A rejected update retains local input, and server action/time/version/history/receipt remain unchanged. Successful clear shows old note in history.before; no history erase. No status change through content form. Completion dialog needs result/confirmation and auto performer explanation; follow-up=true with valid note is allowed, not secretly cleared. Cancel dialog needs reason/confirmation; detail retains reason/time. No backdating (D-07).

Action history uses [fixed event and snapshot rules](specification.md#actionhistory-events-and-safe-snapshots), AC-45/T-55. Display labels: ACTION_CREATED “Created”, ACTION_EDITED “Edited”, ACTION_REASSIGNED “Reassigned”, ACTION_STARTED “Started”, ACTION_COMPLETED “Completed”, ACTION_CANCELLED “Cancelled”, ACTION_CANCELLED_BY_TICKET “Cancelled with Ticket”. One combined content/reassignment displays one Reassigned event with both changes. Full before/after snapshots preserve original notes and explicit nulls; creation has no before (“No previous record”), while other null fields show “Not recorded”/“Not completed” appropriately. Cascade displays the safe linked Ticket status-event ID and actor/reason. Owned Requester history receives only the public action allowlist; no Internal Notes, credentials, receipt or storage data in DOM or payload.

## 3. Ticket workflow controls

FR-11–FR-14, AC-17–AC-22; retain eight status vocabulary and [full matrix](specification.md#5-roles-ownership-and-transition-matrices). Only Staff/Admin permitted targets shown; Requester has advisory indication on L eligible owned states. CLOSED/CANCELLED terminal; only RESOLVED can reopen. Keep owner claim/reassign/unassign/priority guards and historical null owners; do not invent an owner to enable a button.

Student-accepted D-05 gate shows count of unfinished Actions and links to the action section when resolve/close is blocked. Direct API still enforces count in transaction. Zero actions/all cancelled can pass; never show “one completed action required” or “complete a new work cycle action” as a mandate. No Ticket.workCycle display. Follow-up note is information, not a blocker under D-06. Resolve/close/cancel confirmation and cancellation 5–500 reason match L. Ticket cancel dialog states unfinished actions will be cancelled with the same reason (D-10); failed/raced operation never shows premature success. Under student-accepted D-20, all Staff/Admin status-transition forms allow optional reason up to500 trimmed characters, cancellation mandatory5–500; existing validation accepts noncancel blank. Successful transition's one history entry displays the stored reason; absent/blank labelled “No reason provided”, without inventing historical reasons or backfill. Invalid/rejected transition retains input and adds no history. Planned in Ticket Workflow, AC-43/T-53; no current endpoint change in #41.

## 4. Requester Dashboard

FR-15/FR-18, AC-23/AC-24/AC-27–AC-29. All widgets use session-owned data and [D-14 formulas](specification.md#6-dashboard-calculations-bounds-and-drill-down): outstanding, waiting for your response, recent Ticket updates, recently resolved. “Outstanding” excludes RESOLVED/CLOSED/CANCELLED; attention = WAITING_FOR_REQUESTER. Recent resolved counts distinct currently RESOLVED/CLOSED Tickets with real resolution history in the displayed seven-calendar-day period; historical missing events do not receive guessed times. Cards and top-five lists drill into the equivalent owned list, then detail.

Show filter controls/active filter summary, clear filters, server asOf and Asia/Bangkok recent dates; preserve shared predicates on every drill-down. No requester selector, others' Tickets, private Note snippets, Staff totals or client-side aggregate arithmetic. Empty overall dashboard offers Create Ticket; no matching-filter state offers Clear filters. Numeric zero is displayed as zero; dependency errors display retry rather than zero.

## 5. IT Staff/Administrator Dashboard

FR-16/FR-17, AC-25/AC-26: unassigned active Tickets, my active Tickets, all-eight-status counts, active IT-priority counts, recent updated/resolved lists and **my assigned Actions Taken**. IT priority is distinct from Requested priority. Label active set precisely: includes RESOLVED, excludes CLOSED/CANCELLED; outstanding is a different set. Owner filters intersect card predicates, so some filtered cards legitimately become zero.

Current-user Actions section displays four status counts, unfinished count and top five unfinished actions oldest first (createdAt,id); assignee=current session user, not author, completing actor or Ticket Owner. Rows show action description/state/Ticket/assigned worker and detail link. “View my actions” opens **/staff/actions** with assignee=me, actionStatusGroup=unfinished and current Dashboard base filters. Each status bin instead sends that Action status without unfinished group. Empty message: “No unfinished actions assigned to you”; terminal counts remain visible/drillable. Do not omit assignment/lifecycle controls or invent illustrations' yesterday percentages.

### My assigned Actions route

D-03/D-14/D-15/D-18/D-19, AC-44/T-54: `/staff/actions` is guarded for active IT_STAFF/ADMINISTRATOR after session/password gate; Requester sees forbidden route and API403, unauthenticated user goes to Login. It calls GET /api/staff/actions, never downloads all actions to filter locally. URL whitelist/mapping: assignee=me, status (Action state), actionStatusGroup=unfinished, search/categoryId/relatedSystemId/requestedPriority/itPriority/currentStatus (Ticket state)/owner/statusGroup/updatedFrom/updatedBefore/resolvedFrom/resolvedBefore, page and pageSize. All same-named fields map to API-07, with AND intersections. No other assignee, arbitrary sort, actorId or user-supplied return URL. Unknown/repeated query fields produce accessible invalid-query state, not silent omission. DashboardWidget/bucket fields are not action-route filters.

Default page1/pageSize10; choices10/25/50; fixed createdAt ASC,id ASC with stable ties. Filter changes reset page1; page beyond final corrects to last existing page, empty to1. Render totalItems/pagination and empty/no-results/loading/error states, accessible controls and detail link `/staff/tickets/:ticketId#action-:actionId` opening the selected action. “Back to Dashboard” reconstructs `/staff/dashboard` with only search/categoryId/relatedSystemId/requestedPriority/itPriority/currentStatus/owner base filters, dropping action status/group/page/date-list extensions. Preserve Dashboard active nav and filter context; no additional dashboard definition. Client component/E2E/API plans refer to the same route and query contract.

## 6. Interaction states, retries and accessibility

| State | Required UI behavior | AC/decisions |
| --- | --- | --- |
| Initial loading | Labelled loading/skeleton, aria-busy; do not flash zero metrics | AC-36, D-19 |
| Submitting | Disable duplicate button, preserve form and mutation key; busy dialog cannot close | AC-14/AC-36, D-13 |
| Success | Announce success once; refetch authorized detail/list/dashboard; use fresh parent/action tokens | AC-08/AC-36, D-07/D-12 |
| Validation | Inline errors plus focusable summary/first invalid field; text remains | AC-05/AC-36, D-04 |
| Empty / filtered no-results | Accurate contextual message and allowed next action; counts 0/lists [] | AC-29 |
| 401 / password gate | Session expired/login or password-change gate; clear scoped cache | AC-01/AC-35 |
| 403 / 404 | Accessible forbidden/not-found page, safe wording, no unauthorized controls/data | AC-02/AC-03 |
| 409 stale / eligibility / gate | Explain conflict, preserve input, offer refresh/reselect; no overwrite/automatic changed-input retry | AC-07/AC-15/AC-18, D-11/D-12 |
| Lost response / retry | Keep same key and identical payload for uncertain outcome; refetch after replay; new intentional edit gets new key | AC-14/AC-36, D-13 |
| Dependency/unexpected failure | Safe message/retry; no technical stack/raw SQL/secrets, no fake success/zero | AC-34/AC-36 |

Use semantic headings/landmarks/tables and native buttons/links. Chart counts have textual table equivalents and never depend on color. All fields have programmatic labels, required indicators, aria-invalid/describedby messages; dialogs labelled with focus trap, Escape only when not busy, focus restoration and inert background. Keyboard-only flow covers filters, pagination, action picker, start/complete/cancel, confirmations and drill-down. Visible focus and adequate contrast follow L; verify meaningful accessible names and disabled-state semantics. WCAG 2.2 AA is the SDS target, not a certified conformance claim.

Mobile cards replace overflowing dense rows; tablet/desktop maintain readable forms/widgets; long descriptions/notes/names wrap. Genuine browser 200% tab zoom, not CSS zoom or page pinch, must be checked alongside 390×844, 834×1112 and 1440×900. Evidence remains Planned at `artifacts/lab-04/screenshots/staff-dashboard/`, `artifacts/lab-04/screenshots/requester-dashboard/`, `artifacts/lab-04/screenshots/actions-taken/`; no screenshots are claimed generated by #41. Include earlier login/list/detail/admin screens in final responsive regression. No console errors, broken links, placeholder metrics or permission-inconsistent buttons before Product DoD.

Planned component paths: `client/tests/lab-04/ActionsTaken.test.tsx`, `TicketWorkflow.test.tsx`, `RequesterDashboard.test.tsx`, `StaffDashboard.test.tsx`, plus style/accessibility coverage; E2E paths and exact T mappings in [tests](tests.md). Only these Markdown contracts are created in this task.
