# Sprint 4 API Contract

Status: **Student decisions accepted — Contract peer review approved**. All new behavior below reflects the student-accepted decisions in [specification](specification.md). No endpoint is claimed implemented. All product tests remain **Planned**. Preserve the [approved Lab 3 API](../lab-03/api-spec.md) with the recorded student-accepted Sprint 4 extensions. [Formal approval](reviewer.md#completed-peer-review) applies to reviewed HEAD fec388a3c2ab63cabb1bf20f3fa913fb023d9241; this metadata change is unreviewed. Remaining work items must become GitHub Issues before RED–GREEN implementation; no implementation or release readiness is claimed.

## 1. Compatibility, identity and safety

[D-18](specification.md#d-18): `/api` prefix, camelCase JSON, positive integer entity IDs, ISO 8601 UTC timestamps, 400 malformed/validation/query errors, existing `{ error: { code, message, fields?, requestId? } }` envelope. `fields` is a field-to-message object. No wholesale move to SDS `/api/v1`, UUID entity IDs, 422, fieldErrors array or SameSite=Lax. Student accepted this conflict treatment under [D-01](specification.md#d-01); formal contract peer review approved the reviewed HEAD.

Keep all Lab 3 auth/session/Origin/CSRF/forced-password-change/rate-limit/revocation rules and safe DTOs. Every write is JSON with same-origin credentials, exact Origin and X-CSRF-Token. Actor is the session user, never body/query/header identity. Requester reads scope by immutable Ticket.requesterId. Role denial 403 precedes protected lookup; nonowned/missing requester Ticket 404 TICKET_NOT_FOUND, identical message. Ticket/action path mismatch returns 404 ACTION_NOT_FOUND without exposing the other parent. No Prisma-wide serialization, passwords, sessions, Internal Notes, raw receipt/fingerprint or storage credentials.

Response/cache policy: authorized role-specific data, no shared public cache; client clears user-scoped cache on logout/identity/role change. Counts calculated on backend, not from downloaded full collections. Failure never looks like an empty successful response.

## 2. New operation inventory

All action operations implement FR-01–FR-10/FR-22/FR-26 and AC-01–AC-16/AC-34/AC-39. Endpoint paths are **student-accepted design** under D-18; lifecycle D-02, identities D-03, fields D-04, edit/history D-08, parent guard D-09, eligibility D-11, concurrency D-12, retries D-13.

| Operation | Method/path | Authorization | First success / identical replay |
| --- | --- | --- | --- |
| API-01 Ticket action list | GET /api/tickets/:ticketId/actions | Owned Requester or Staff/Admin | 200 |
| API-02 Action detail | GET /api/tickets/:ticketId/actions/:actionId | Same | 200 |
| API-03 Action history | GET /api/tickets/:ticketId/actions/:actionId/history | Same, public-safe action fields only | 200 |
| API-04 Create | POST /api/tickets/:ticketId/actions | Staff/Admin | 201 / 200 |
| API-05 Edit/reassign | PATCH /api/tickets/:ticketId/actions/:actionId | Staff/Admin | 200 / 200 |
| API-06 Lifecycle | PATCH /api/tickets/:ticketId/actions/:actionId/status | Staff/Admin | 200 / 200 |
| API-07 Current-user action drill-down | GET /api/staff/actions | Staff/Admin; assignee=me | 200 |
| API-08 Requester dashboard | GET /api/dashboard/requester | Requester | 200 |
| API-09 Staff dashboard | GET /api/dashboard/staff | Staff/Admin | 200 |

No action delete/reopen endpoint. Existing GET /api/staff/assignees supplies active eligible targets; exclude Requesters/inactive users, but render historical names on retained records. Do not add a Requester mutation by reusing the shared read route.

## 3. Fields and DTOs

Student-accepted Action DTO (planned implementation):

```json
{
  "id": 801,
  "ticketId": 121,
  "actionAt": "2026-10-04T03:00:00.000Z",
  "description": "Investigate the reported connection failure",
  "result": null,
  "createdBy": { "id": 21, "name": "Worker B" },
  "assignee": { "id": 22, "name": "Worker C" },
  "performedBy": null,
  "status": "PLANNED",
  "followUpRequired": true,
  "followUpNote": "Arrange a second diagnostic session",
  "attachmentNotes": "See the diagnostic image in Ticket attachments",
  "cancellationReason": null,
  "createdAt": "2026-10-04T03:00:00.000Z",
  "updatedAt": "2026-10-04T03:00:00.000Z",
  "completedAt": null,
  "cancelledAt": null,
  "version": 1
}
```

Safe identity shape is `{id,name}`, without email/credentials; historical references survive activation/role changes. Ticket Owner is shown using the existing Ticket DTO, never inferred from action assignment. Performed by is null until completion under D-03. Attachment Notes is inert text, not Attachment IDs/URLs, an upload or Internal Notes; existing authenticated attachment routes retain their authorization and removed-content behavior.

### API-04 Create

Required: `description`, `assigneeId`, `followUpRequired`, `expectedTicketUpdatedAt`, `clientMutationId`. Optional: `result`, `followUpNote`, `attachmentNotes` (null accepted as absent). Assignee picker defaults to current eligible user; backend still validates the supplied explicit target. Initial state is PLANNED; client cannot set status, creator, performer, ticketId, actionAt, timestamps, version or history.

Trim/validate bounds in D-04: description 5–2000; result 1–2000 when present; attachmentNotes 0–2000 normalize empty to null. **Create followUpRequired=false:** omitted/null/trimmed-empty followUpNote normalizes to null; nonempty text rejected 400 VALIDATION_ERROR with followUpNote field. **Create true:** note required, trimmed 1–2000; omitted/null/empty/overlong or wrong-type rejected 400. No silent discard of nonempty note. Boolean must be actual boolean. IDs positive decimal integers; token strict UTC ISO with millisecond precision; UUID mutation key; no unknown fields. All text displayed literally. Success returns `{ action: ActionDTO, ticketUpdatedAt: UTC }`. Action and parent times/version/history/receipt commit together; invalid input changes none. Field/token/follow-up/history policies depend on D-04/D-06/D-07/D-08/D-12/D-13/D-18; AC-41/T-49.

### API-05 Edit and reassignment

Required: `expectedVersion` positive integer, `expectedTicketUpdatedAt`, `clientMutationId`. At least one of `description`, `result`, `assigneeId`, `followUpRequired`, `followUpNote`, `attachmentNotes`; **partial update preserves unspecified fields**. Merge first, validate the final state. Changing true→false with existing note requires the literal provided field `followUpNote:null`; omitted/empty-string/nonempty note is 400, never an implicit erase. UI obtains clearing confirmation before sending false+null. Updating other fields while true and omitting both follow-up fields retains the note. Turning false→true requires a final valid 1–2000 note; clearing null/empty while final true fails. If already false with null note, explicitly empty/null note normalizes to null, nonempty fails. Successful clear stores old note in history.before and after.followUpNote=null; every validation rejection leaves action/parent time/version/history/receipt unchanged (D-04/D-06/D-08/D-18, AC-41/T-50).

Only nonterminal actions on editable parent; ticket/creator/time/performer/status immutable. Effective no-op (same normalized editable values) returns 409 ACTION_UNCHANGED and writes no event/receipt. Success returns action/parent token as create. Reassignment revalidates active eligibility at commit and does not change Ticket.ownerId.

### API-06 Start/complete/cancel

Required: `targetStatus`, `expectedVersion`, `expectedTicketUpdatedAt`, `clientMutationId`. Completion additionally `confirm=true` and `result` (1–2000); cancellation `confirm=true` and `reason` (5–500). Start accepts neither result/confirm/reason; unknown or irrelevant fields 400. Completion may keep follow-up=true with existing valid note; completing actor automatically becomes performedBy. Cancellation does not set performedBy and retains any existing draft result; cancelledAt/reason are server-owned. Status timestamps and ActionHistory occur in the same commit. Matrix:

| From | Allowed targets | Additional guard |
| --- | --- | --- |
| PLANNED | IN_PROGRESS, CANCELLED | Start eligible assignee; cancel confirmed reason |
| IN_PROGRESS | COMPLETED, CANCELLED | Complete eligible assignee/confirmed result; cancel confirmed reason |
| COMPLETED | None | Terminal |
| CANCELLED | None | Terminal |

This table is student-accepted D-02, not handout-enumerated vocabulary. Same/omitted edge = 409 INVALID_ACTION_TRANSITION (same state uses ACTION_STATUS_UNCHANGED). Terminal edit = ACTION_TERMINAL; frozen parent = TICKET_ACTIONS_LOCKED. Missing confirmation/reason/result is malformed input 400, not 422. Eligibility first detected before a race = 400 INVALID_ASSIGNEE with assigneeId field; lost eligibility at commit = 409 ASSIGNEE_INELIGIBLE. Do not reveal whether an inaccessible user exists.

### API-01/02/03/07 lists and history

API-01: `page` default 1, `pageSize` 20/50/100 default 20, optional single `status` in Action enum. Default order createdAt ASC,id ASC. Return `{items,pagination:{page,pageSize,totalItems,totalPages,hasPreviousPage,hasNextPage}}` as in L; empty totalPages=0, items=[]. Page beyond final is an empty server response; UI corrects to the last existing page as in L. API-02 returns `{action,ticketUpdatedAt}`. API-03 same pagination/order and `{id,actionId,actor:{id,name},event,createdAt,actionVersion,sourceTicketStatusHistoryId,before,after}`. Exact event/snapshot/null rules and safe allowlist are authoritative in [ActionHistory contract](specification.md#actionhistory-events-and-safe-snapshots), AC-45/T-55: `ACTION_CREATED`, `ACTION_EDITED`, `ACTION_REASSIGNED`, `ACTION_STARTED`, `ACTION_COMPLETED`, `ACTION_CANCELLED`, `ACTION_CANCELLED_BY_TICKET`. Only creation has before=null; after always full, other before full; explicit nullable keys, no sparse diff. A combined reassign/content edit is one ACTION_REASSIGNED. Cascade links the same transaction's TicketStatusHistory event. Project only allowed action fields, never receipts/private Notes/secrets. User name changes can affect display; actor ID immutable, no frozen-name claim.

API-07 requires `assignee=me` (default me if omitted), optional `status` or `actionStatusGroup=unfinished` (intersection allowed); pagination 10/25/50 default 10. Always actor-derived assignee; accepts section 5 Staff parent filters and uses createdAt ASC,id ASC. Return bounded action rows with `{ticket:{id,ticketNumber,summary,currentStatus}, action:ActionDTO}` and pagination. Do not permit arbitrary assigneeId masquerading as current user. Global other-assignee reporting is excluded; Ticket-specific list still shows all assignees.

The definite UI destination is **/staff/actions**, active Staff/Admin only (D-15/D-19, AC-44/T-54). UI query whitelist: assignee=me, status, actionStatusGroup, search, categoryId, relatedSystemId, requestedPriority, itPriority, currentStatus, owner, statusGroup, updatedFrom/updatedBefore, resolvedFrom/resolvedBefore, page, pageSize. Map same names to GET /api/staff/actions; default assignee=me, page=1, pageSize=10, fixed createdAt ASC,id ASC (no client sort fields). Parent currentStatus is a Ticket state; status is an Action state. Every predicate intersects. “View my actions” opens unfinished group with current Dashboard base filters; each status bin opens that status with no unfinished group. Unknown/repeated/invalid fields or assignee other than me are 400 INVALID_QUERY. API pagination is the same object fields as API-01; no pageSize=20 inherited from Ticket-specific history. Detail links open /staff/tickets/:ticketId#action-:actionId; the hash opens the selected action without changing backend authorization. Back to Dashboard uses /staff/dashboard with only its six common base filters plus owner, dropping action status/group/page/date-list extensions. No requester route/API access or user-provided return URL; reconstruct a known route from whitelisted filters.

## 4. Existing mutations extended, not replaced

PATCH /api/staff/tickets/:ticketId/status keeps Lab 3 body `targetStatus`, `expectedUpdatedAt`, `confirm`, `reason` conventions. All eight Ticket edges/owner/confirmation/same-state rules are in [specification section 5](specification.md#5-roles-ownership-and-transition-matrices). Preserve L response DTO and 409 stale behavior; no new Ticket.version/workCycle.

[D-05](specification.md#d-05): resolve AND close count unfinished actions under the shared lock/transaction. If any, 409 ACTIONS_OUTSTANDING with safe message; state/history untouched. Zero/all cancelled pass subject to existing guards. Follow-up flag alone does not block (D-06). Requester indication endpoint remains advisory. RESOLVED→REOPENED clears indication, does not reset historical actions or require completion in a new cycle.

[D-10](specification.md#d-10): cancellation's required 5–500 reason is copied to each unfinished ACTION_CANCELLED_BY_TICKET event in the same transaction; versions/times update, parent timestamp advances once; terminal actions untouched. Race outcome follows a serial order. No new permission to cancel from RESOLVED/CLOSED or reopen CLOSED/CANCELLED.

[D-20](specification.md#d-20) is **Accepted by student (Recommended option)** for the **Ticket Workflow** Issue: every successful status transition stores the existing validator's reason output in its one new TicketStatusHistory row. Noncancel omitted/null→null; supplied string trimmed, 0–500 accepted (trimmed blank stored as ""); wrong type or >500 is 400 VALIDATION_ERROR. Cancellation retains required trimmed 5–500. No additional minimum or new validation status. History DTO exposes that stored reason; rejected/stale/forbidden/gated/same-state transition creates no history. Existing rows remain exactly as stored, no backfill of discarded reasons. Current endpoint implementation is unchanged in #41. AC-43/T-53 cover present/absent/null/empty/invalid input and rejected-write invariants.

PATCH /api/admin/users/:userId retains L expectedUpdatedAt/self-change/last-admin/password/session behavior. Add 409 USER_HAS_OPEN_ACTIONS if deactivation/demotion would leave any PLANNED/IN_PROGRESS assignment. Existing USER_HAS_NON_TERMINAL_TICKETS still applies; check it first for deterministic error priority. Staff↔Admin remains eligible except L safeguards. Terminal historical assignments do not block. No automatic unassign/cancel.

## 5. Dashboard and list query contract

FR-15–FR-18, BR-26–BR-32, AC-23–AC-29, D-14/D-15. Full calculations are authoritative in [specification section 6](specification.md#6-dashboard-calculations-bounds-and-drill-down); this API uses those definitions, not a second formula.

Common dashboard base filters: `search`, `categoryId`, `relatedSystemId`, `requestedPriority`, `itPriority`, `currentStatus`. Staff additionally `owner=unassigned|me|positive eligible user ID`. Keep inherited search semantics/limits; Requester search only ticketNumber/summary. Requester cannot pass owner/requesterId/userId/asOf/timezone. Staff cannot select dashboard current actor. Unknown/repeated fields and unsupported enum/date/ID are 400 INVALID_QUERY. Date horizon/timezone are fixed server policy under D-14, exposed in response, not user-configurable.

Student-accepted response structure (numeric/list values are examples, not seed facts):

```json
{
  "asOf": "2026-10-04T03:00:00.000Z",
  "timezone": "Asia/Bangkok",
  "recentWindow": {
    "from": "2026-09-27T17:00:00.000Z",
    "before": "2026-10-04T17:00:00.000Z"
  },
  "filters": {},
  "metrics": { "outstanding": 0, "needsAttention": 0, "recentUpdated": 0, "recentResolved": 0 },
  "lists": { "recentUpdated": [], "recentResolved": [] },
  "drillDown": {
    "outstanding": { "path": "/api/tickets", "query": { "statusGroup": "outstanding" } }
  }
}
```

Requester `metrics` exactly the four example fields; lists recentUpdated/recentResolved max 5. Staff `metrics`: `unassigned`, `mine`, `byStatus` with all eight integer bins, `byItPriority` with all four integer bins for active set, `recentUpdated`, `recentResolved`, `myActionsByStatus` with all four bins and `myUnfinishedActions`; `lists`: recentUpdated/recentResolved max 5 and myUnfinishedActions max 5. Every widget has a drillDown descriptor; no optional invented administration counts. Ticket rows are explicit safe `{id,ticketNumber,summary,currentStatus,requestedPriority,itPriority,owner,updatedAt,resolvedAt?}` projections, not full comments/attachments/Notes/collections.

Metrics/bounded lists are read in one PostgreSQL REPEATABLE READ read-only snapshot with one server asOf captured at snapshot start. No per-card network consistency claims. A later drill-down request uses equivalent predicates against its own snapshot; concurrent changes may change totals. It is not a retained historical snapshot across HTTP requests. UI refetch explains a changed count; do not promise original totals forever.

The student-accepted design extends GET /api/tickets and GET /api/staff/tickets with `statusGroup=active|outstanding|resolved`, paired `updatedFrom`/`updatedBefore`, paired `resolvedFrom`/`resolvedBefore`, and `sortBy=resolvedAt` (resolved pair required); descriptors set `sortOrder=desc`, IDs follow the same direction. Add `itPriority` to Requester list explicitly as a D-15 extension (it is not a Lab 3 My Tickets filter); prior queries/defaults remain unchanged. All dates strict UTC ISO; from < before, both supplied together; use `[from,before)` and server snapshot future cap. currentStatus and statusGroup **intersect**, never override. `resolved` group means RESOLVED/CLOSED. Resolved date matches latest qualifying transition-to-RESOLVED event for currently resolved/closed Tickets; distinct IDs, order time DESC,id DESC. Missing historical event fails that predicate, not fabricated ticketDate. Keep existing sortBy/sortOrder/pagination/defaults otherwise; dashboard descriptors set the required new sort/bounds. Existing Staff Queue response counters still replace owner as required by L; dashboard equivalence compares filtered pagination.totalItems, not legacy counts.mine/unassigned. API-07 applies same parent filters and actor-derived action predicate. Never use a raw URL from untrusted data as a redirect; map known descriptor paths to known UI routes.

To encode widget/base-filter intersections without repeated query keys, add single `dashboardWidget` on Ticket list routes: Requester permits `outstanding|attention|recentUpdated|recentResolved`; Staff permits `unassigned|mine|status|itPriority|recentUpdated|recentResolved`. `status` requires `widgetStatus` (one of eight Ticket statuses); `itPriority` requires `widgetItPriority` (one of four priorities); other widgets forbid those bucket fields. Unsupported role/combination is 400 INVALID_QUERY. These fixed predicates are exactly section 6's calculation, ANDed with all ordinary filters; e.g. `owner=42&dashboardWidget=mine` is zero for actor 41, and `currentStatus=OPEN&dashboardWidget=status&widgetStatus=IN_PROGRESS` is zero. No override, duplicate keys or client actor selector. Recent widgets require their matching date pair; descriptors for active owner/priority widgets include statusGroup=active. Requester attention intersects WAITING_FOR_REQUESTER. Ordinary queries without widget fields preserve L behavior. API-07 uses the parent filter subset plus actor-derived assignee and optional action status; it does not accept Ticket dashboardWidget/bucket fields. Drill-down descriptors for current-user action status bins use API-07 status instead.

## 6. Concurrency and duplicate semantics

D-07/D-08/D-11/D-12/D-13: action writes supply current expectedVersion (except create) plus expectedTicketUpdatedAt. Comparing parent token intentionally means unrelated parent action updates can cause a safe stale conflict; UI retains input and refetches, never overwrites automatically. Parent updatedAt must strictly increase at database millisecond precision, even for same-millisecond writes. Creation cannot introduce an unfinished action into a resolved Ticket by racing resolution.

Lock current/target relevant User gates/rows in L order, then Ticket gate/row, then existing Action rows ascending; recheck active role/parent/version/assignee/gate in transaction. User-edit checks and new assignments share the same eligibility gates before snapshot-sensitive reads. The parent Ticket lock serializes action insertion predicates, avoiding a phantom Action after a successful gate check. Do not acquire User locks after Ticket/Action. Keep L confirmed-40001 retry policy; retries must rerun all reads in a fresh transaction, never reuse a stale authorization snapshot. Exhaustion 409 CONCURRENT_UPDATE. Other dependency faults follow L safe mapping.

Mutation receipt key is unique `(actorId,clientMutationId)` across new Action operations. Authenticate/authorize current role and parent access, validate shape, then inspect receipt after the actor gate and before stale/terminal guards. Compare original operation/parent/action/input including expected tokens, never current edited fields. Canonical input retains **PATCH field presence** (omitted and explicit null differ); create normalization may represent omitted/null/empty false-note identically. Replay safe stored response with replayed=true at 200, no time/version/history write; client refetches its possibly older snapshot. Revoked/inactive/role-changed caller cannot replay; a currently authorized replay may return after parent becomes terminal. Different input/operation/target with the same key is 409 DUPLICATE_REQUEST_CONFLICT. Failed writes create no receipt. No receipt expiry/deletion policy; retries retain original key/payload/tokens, intentional changed input gets a fresh key. L Ticket status same-state remains 409, not retroactively idempotent.

**Receipt uniqueness recovery is a separate bounded read path (D-13, AC-42), not serialization retry:**

1. Accept only a positively identified violation of the MutationReceipt(actorId,clientMutationId) unique constraint: verified PostgreSQL 23505 constraint metadata, or Prisma P2002 whose model/target metadata proves this constraint. P2002/23505 alone, another unique constraint, deadlock or unexpected error never authorizes this recovery.
2. Roll back the whole failed transaction and confirm completion of rollback before another read. No attempted Action/history/parent update/receipt survives; never continue SQL in an aborted transaction.
3. At most **one** fresh read-only READ COMMITTED recovery transaction checks current session/active role/parent authorization and reads the committed receipt. Recheck authorization before returning any replay DTO. No mutation re-execution, polling, sleeps or additional recovery attempts.
4. Same original operation/target/input returns 200 replay; mismatch returns 409 DUPLICATE_REQUEST_CONFLICT. Missing receipt after a verified conflict is an invariant failure: safe 409 CONCURRENT_UPDATE, not a fresh write. Read dependency/unexpected failures keep L's sanitized mapping; a read serialization failure yields safe conflict without restarting mutation. No failed-attempt receipt/history is created.

D-12 remains unchanged: only confirmed 40001 retries the **mutation** in a new transaction, max three attempts total; no P2034-only/P2002/deadlock retry. The one defensive recovery read is not an extra mutation attempt and may follow a receipt-specific failure at any mutation attempt.

All cooperating writes, including different Tickets, acquire the same actor's User gate/row in the established ordering and hold it until commit/rollback. Same actor+key therefore cannot normally insert competing receipts: a waiting gate forces confirmed40001/fresh snapshot; pre-write receipt lookup sees winner, or bounded retry exhausts with no mutation. Across Tickets the targets differ, so loser returns409 key conflict once winner is visible. Different actors using the same UUID do not collide because actorId is part of the key. Do not weaken locks merely to manufacture a production uniqueness race. Planned T-52 verifies these real protocol guarantees in both orders; T-51 exercises rollback and defensive recovery through an isolated known-constraint failure (staged writes then duplicate insert against a previously committed receipt) and recovery-handler fault cases, explicitly not a claim of a reachable cooperating-writer race.

## 7. Error catalog and planned validation

| HTTP | Code/condition | Safe behavior |
| --- | --- | --- |
| 400 | VALIDATION_ERROR, INVALID_QUERY, invalid path ID, INVALID_ASSIGNEE | Specific safe fields; malformed payload/target/confirmation never changes data |
| 401 | AUTHENTICATION_REQUIRED | Preserve L session policy |
| 403 | FORBIDDEN, PASSWORD_CHANGE_REQUIRED, L Origin/CSRF codes | Preserve L; no protected data |
| 404 | TICKET_NOT_FOUND, ACTION_NOT_FOUND | Ownership/path mismatch indistinguishable |
| 409 | STALE_WRITE, INVALID_ACTION_TRANSITION, ACTION_STATUS_UNCHANGED, ACTION_UNCHANGED, ACTION_TERMINAL, TICKET_ACTIONS_LOCKED | Refetch; no auto overwrite |
| 409 | ACTIONS_OUTSTANDING, ASSIGNEE_INELIGIBLE, USER_HAS_OPEN_ACTIONS, DUPLICATE_REQUEST_CONFLICT, CONCURRENT_UPDATE | Domain/race conflict, no partial write/history/receipt |
| 429 | Existing authentication throttle where applicable | No invented new rate policy |
| 500 | Unexpected fault under L safe mapping | Sanitized message/requestId where present; server internals hidden |
| 503 | Known unavailable dependency under L safe mapping | Retryable UI; no fake counts or partial success |

Required planned paths: `server/tests/lab-04/actions-taken.api.test.ts`, `ticket-workflow.api.test.ts`, `requester-dashboard.api.test.ts`, `staff-dashboard.api.test.ts`; detailed T IDs and additional race/security/failure paths are in [tests](tests.md). No request execution or API implementation is claimed.
