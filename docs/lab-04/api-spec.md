# Sprint 4 API Contract

Status: **D-01-D-20 accepted; contract peer review approved at its original reviewed HEAD; #44 backend, PR #52 Actions UI Phase A, #46 workflow, #47 Requester Dashboard and #48 Staff Dashboard approved/merged. Issue #53 navigation is implemented and feature-level comprehensive E2E is GREEN; #53 implementation peer review and reviewed staging integration remain Pending.** [Verified PR #56 approval/merge](reviewer.md#16-pr-56-approval-and-merge) concerns exact predecessor HEAD `8c3dbbef6841f9a3b1cff786f8af09263e91273f`, not navigation approval. [Current #53 traceability](tests.md#12-issue-53-navigation-evidence-and-comprehensive-confirmation) records tests-first RED `09414f9`, GREEN `f81da7f`, browser/compatibility `6f74e3b`, evidence `0516e07` and the new full E2E **15 files / 69 passed, zero failed/skipped** at clean execution HEAD `0516e07421e0b18681d52deedbe11719f787bd8d`. [Confirmation addendum](../../artifacts/lab-04/screenshots/dashboard-navigation/evidence.md#comprehensive-confirmation--2026-10-29) preserves the prior 59/69 failure, 36/36 affected-file correction and original screenshots. Client **24 files / 351 passed and build** remain prior GREEN evidence; no unit/build rerun occurred here. Contract approval stays at `fec388a3c2ab63cabb1bf20f3fa913fb023d9241`; earlier Pending/not-implemented statements below describe their historical phases and are superseded only by the dated records. All **31 FR / 46 BR / 45 AC / 55 Planned scenarios / 20 accepted decisions** and original Product DoD checkbox states remain unchanged. #45 retains coordination, #49 final product integration and #50 release. No hosted-CI, whole-scenario or product-completion claim is made.

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

Student-accepted Action DTO (API-01–API-07 backend approved/merged through PR #51; PR #52 Phase A consumer approved/merged; #46 subsequently approved/merged through PR #54; #47 review Pending):

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

Trim/validate Unicode code-point bounds in D-04 (PostgreSQL char_length; no grapheme counting or normalization): description 5–2000; result 1–2000 when present; attachmentNotes 0–2000 normalize empty to null. **Create followUpRequired=false:** omitted/null/trimmed-empty followUpNote normalizes to null; nonempty text rejected 400 VALIDATION_ERROR with followUpNote field. **Create true:** note required, trimmed 1–2000; omitted/null/empty/overlong or wrong-type rejected 400. No silent discard of nonempty note. Boolean must be actual boolean. IDs positive decimal integers; token strict UTC ISO with millisecond precision; UUID mutation key; no unknown fields. All text displayed literally. Success returns `{ action: ActionDTO, ticketUpdatedAt: UTC }`. Action and parent times/version/history/receipt commit together; invalid input changes none. Field/token/follow-up/history policies depend on D-04/D-06/D-07/D-08/D-12/D-13/D-18; AC-41/T-49.

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

[D-20](specification.md#d-20) is **Accepted by student (Recommended option)** for the **Ticket Workflow** Issue: every successful status transition stores the existing validator's reason output in its one new TicketStatusHistory row. Noncancel omitted/null→null; supplied string trimmed, 0–500 accepted (trimmed blank stored as ""); wrong type or >500 is 400 VALIDATION_ERROR. Cancellation retains required trimmed 5–500. No additional minimum or new validation status. History DTO exposes that stored reason; rejected/stale/forbidden/gated/same-state transition creates no history. Existing rows remain exactly as stored, no backfill of discarded reasons. The original #41 documentation step left the endpoint unchanged; #46 now implements this extension with the narrowly authorized compatibility migration (section 10). AC-43/T-53 cover present/absent/null/empty/invalid input and rejected-write invariants.

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

## 7. Error catalog and validation

| HTTP | Code/condition | Safe behavior |
| --- | --- | --- |
| 400 | VALIDATION_ERROR, INVALID_QUERY, invalid path ID, INVALID_ASSIGNEE | Specific safe fields; malformed payload/target/confirmation never changes data |
| 401 | AUTHENTICATION_REQUIRED | Preserve L session policy |
| 403 | ROLE_FORBIDDEN, PASSWORD_CHANGE_REQUIRED, L Origin/CSRF codes | Preserve L; no protected data |
| 404 | TICKET_NOT_FOUND, ACTION_NOT_FOUND | Ownership/path mismatch indistinguishable |
| 409 | STALE_WRITE, INVALID_ACTION_TRANSITION, ACTION_STATUS_UNCHANGED, ACTION_UNCHANGED, ACTION_TERMINAL, TICKET_ACTIONS_LOCKED | Refetch; no auto overwrite |
| 409 | ACTIONS_OUTSTANDING, ASSIGNEE_INELIGIBLE, USER_HAS_OPEN_ACTIONS, DUPLICATE_REQUEST_CONFLICT, CONCURRENT_UPDATE | Domain/race conflict, no partial write/history/receipt |
| 429 | Existing authentication throttle where applicable | No invented new rate policy |
| 500 | Unexpected fault under L safe mapping | Sanitized message/requestId where present; server internals hidden |
| 503 | Known unavailable dependency under L safe mapping | Retryable UI; no fake counts or partial success |

Required planned paths: `server/tests/lab-04/actions-taken.api.test.ts`, `ticket-workflow.api.test.ts`, `requester-dashboard.api.test.ts`, `staff-dashboard.api.test.ts`; detailed T IDs and additional race/security/failure paths are in [tests](tests.md). API-01–API-07 implementation and prior execution are recorded in [tests section5](tests.md#5-issue-44-backend-evidence-and-current-traceability); API-08 and Requester list extensions are implemented by #47 (section 11); API-09/Staff Dashboard extensions remain #48. #46's prior evidence is in section 10 and subsequent PR #54 approval in reviewer section 11. No application verification is rerun here.

## 8. Implementation status and compatibility correction

Sections 8-12 retain their successive implementation-package chronology, including then-Pending review/navigation statements. Current predecessor approval and navigation consumer evidence are recorded in section 13 and reviewer section 16; the normative API definitions above are unchanged.

#44 implements API-01–API-07 in `server/src/app.ts` with Action read/create/patch/staff services, query parsers, explicit projections and receipt/recovery modules under `server/src/actions/`. Live-session/password/Origin/CSRF/role enforcement remains; authenticated data uses `Cache-Control: private, no-store`. See [source/test coverage](tests.md#coverage-and-responsibility). Backend implementation was approved and merged through [PR #51](https://github.com/chaproi/toktickit/pull/51); [actual review evidence](reviewer.md#6-issue-44-implementation-review-and-evidence) is separate from PR #52 Phase A approval and subsequent PR #54 workflow approval; #47 approval/merge is verified in reviewer section 14; #48 implementation peer review remains Pending. #46's implemented section4 gates/cascade/D-20 are recorded in section 10; #47 implements the Requester aggregate and owned-list extensions (section 11); Staff Dashboard/API-09 contributions remain #48.

Catalog correction under accepted D-01/D-18: the earlier Lab4 row said `FORBIDDEN`, but inherited `authorizeRequest` in `server/src/auth/auth-router.ts` and committed Action tests/services use **ROLE_FORBIDDEN**. The row now preserves the exact role-denial code; no authorization policy/shared middleware changed. Origin/CSRF-specific codes remain distinct inherited values.

The code-point correction applies to create, supplied PATCH/final merged text and lifecycle result/reason, preserving messages/null/presence/clearing rules. It does not change earlier-lab validators or D-20 Ticket reason rules. Receipt responses use safe id/name ActionDTO identities; ActionHistory retains full scalar-ID snapshots. Newly seeded receipts keep operation-time DTOs; reseeding never rewrites old receipts.

## 9. Issue #45 client consumers and evidence

[Client adapters](../../client/src/api.ts) consume API-01–API-07 with typed ActionDTO/history/assigned-row envelopes, credentialed abortable reads and inherited CSRF write handling. [ActionsTaken](../../client/src/components/ActionsTaken.tsx) is shared by public Requester and privileged Ticket detail. [Create dialog](../../client/src/components/ActionCreateDialog.tsx) sends only the eight API-04 fields; [operation dialog](../../client/src/components/ActionOperationDialog.tsx) uses API-05/06 tokens, confirmed explicit nulls and operation-appropriate fields. [History dialog](../../client/src/components/ActionHistoryDialog.tsx) renders the public API-03 complete scalar-ID snapshots, not current-user names substituted for historical IDs.

[My Actions](../../client/src/components/MyActions.tsx) and [URL query validation](../../client/src/components/my-action-query.ts) consume API-07 only, preserving actor-derived assignment and all approved AND predicates. No client-authoritative aggregate, actor/performer timestamp, attachment relation or Ticket cascade is fabricated. An Action absent from the initial Ticket list page is retrieved through API-02 without changing pagination totals or duplicating the selected DOM record.

Uncertain retries preserve identical payload/key/original tokens. STALE_WRITE requires explicit Action and parent refresh before a new intentional submission with fresh tokens/key; retained PATCH field intent is not inferred from differences against refreshed server content. Frozen-parent refresh cannot unlock writes; ineligible selection requires deliberate reselection. A confirmed mutation followed by failed read refresh offers read recovery, not mutation retry. These UI HTTP simulations are distinct from backend transaction evidence; [actual traceability](tests.md#6-issue-45-ui-evidence-and-current-traceability) records both real browser writes and simulation limitations. API-08/Requester rendering/equivalence are evidenced in section 11; API-09/Staff rendering remain #48; actual #46 Ticket workflow evidence is in section 10. PR #52 Phase A and later PR #54 workflow approval do not approve #47.

Current navigation delivery allocation: [#53](https://github.com/chaproi/toktickit/issues/53) implements password-gated role landing, global active navigation and full reviewed return integration under #45 lead. Both /dashboard (#47) and /staff/dashboard (#48) now exist; #48 verifies the delivered screen and selected-Action return contribution. The [phased table](specification.md#14-phased-navigation-delivery-and-retained-accountability) retains D-19/AC-35/AC-44 and all API/query requirements. Full AC-35/T-35 remains incomplete; direct screen delivery is not navigation acceptance.

## 10. Implemented Ticket workflow extension

The original workflow commands below retain their pre-PR provenance. Later PR #54 approval/merge is recorded in reviewer section11; #47's current Requester delivery is recorded in section11 below.

#46 source/test HEAD `fcfdf83a2535afdaf00dfa582a3c1aa2bbabc8f8`, based on PR #52 merge `94e68dc65a34626069b944147d42b523e64e4d11`, implements section 4 in [changeStaffTicketStatus](../../server/src/tickets/staff-ticket-service.ts) and [safe HTTP mapping](../../server/src/app.ts). The endpoint remains PATCH /api/staff/tickets/:ticketId/status with targetStatus/expectedUpdatedAt/confirm/reason and the inherited Ticket mutation DTO. No Action UUID/version fields, new route or Ticket receipt semantics were introduced. Existing authentication/ROLE_FORBIDDEN/Origin/CSRF, matrix/owner/terminal/stale/confirmation precedence and advisory indication remain intact.

The resolve **and** close predicate runs in each existing SERIALIZABLE attempt after inherited guards and before writes. Any PLANNED/IN_PROGRESS child yields safe 409 ACTIONS_OUTSTANDING without disclosing child details or writing history/receipts. Zero/all-cancelled/completed-follow-up cases remain permitted when otherwise valid. Ordered User eligibility gates/rows precede Ticket gate/row, then unfinished child locks ascending for cancellation; no User lock is acquired after parent/child locks. The inherited confirmed-40001 maximum-three-attempt policy is unchanged, and shared T-42 evidence remains applicable.

Cancellation writes one Ticket status event and only unfinished children in the same transaction. Each affected child has one new version and ACTION_CANCELLED_BY_TICKET event, full approved scalar before/after snapshots, actual actor, the same trimmed reason and sourceTicketStatusHistoryId referencing that real event for the same Ticket. One coherent timestamp exceeds prior parent/affected-child timestamps at millisecond precision; child cancelledAt/updatedAt/event.createdAt agree. Terminal children, draft result/follow-up/content/creation identity and existing receipts remain unchanged. Controlled late P0001 faults prove complete rollback; they are not serialization retries or ordinary race evidence.

D-20 now persists the existing validator output on every successful transition and exposes it unchanged through the inherited status-history DTO. Non-cancel omitted/null→null, trimmed empty→empty; cancellation remains mandatory trimmed 5–500. The [authorized forward migration](../../server/prisma/migrations/20261022000000_ticket_reason_compatibility/migration.sql) changes only the CHECK to allow non-cancel 0–500 while retaining nullable historical rows, cancellation5–500 and VARCHAR(500). No historical SQL/data/backfill or Ticket Unicode-length policy changed.

[Actual AC/T paths and commands](tests.md#8-issue-46-workflow-evidence-and-current-traceability) record workflow API 220, real overlapping workflow 30, migrated legacy4, compatibility14 and safe distributed T-34/T-39 assertions, plus client/browser contributions. Full server 1,781/build and E2E36 passed at fcfdf83; client 274/build remains at 1fabbe3. This documentation change reruns none. #46 was subsequently approved/merged through PR #54; #47 Requester delivery is recorded in section 11 with review Pending; #48 Staff Dashboard, #53 navigation under #45 and #49/#50 integration/release remain outstanding. Contract/predecessor approval and passing local checks are not approval of this implementation or hosted CI evidence.

## 11. Implemented Requester Dashboard and owned-list extensions

#47 supplies GET `/api/dashboard/requester` and the Requester-only GET `/api/tickets` extensions from section 5, without changing the accepted API contract or Staff Queue counters. [Dashboard query](../../server/src/dashboards/requester-dashboard-query.ts), [service](../../server/src/dashboards/requester-dashboard-service.ts), [owned-list query](../../server/src/tickets/requester-ticket-query.ts), [list service](../../server/src/tickets/ticket-service.ts) and [routes](../../server/src/app.ts) preserve inherited live-session/password/role order, ROLE_FORBIDDEN and `Cache-Control: private, no-store`.

The response contains asOf/timezone/recentWindow/normalized filters, exactly four metric keys, two at-most-five lists and four safe known-path drillDown descriptors. Ticket rows explicitly select id, ticketNumber, summary, currentStatus, requestedPriority, itPriority, updatedAt and nullable owner{id,name,role}; only resolution rows add actual resolvedAt. Ownership AND every base/widget predicate is server-side; no client-selected requester, clock, timezone, Staff actor or private collection is accepted. Description of formulas/legacy exclusions and calendar bounds remains authoritative in specification section 6.

Requester lists support itPriority, statusGroup, dashboardWidget, paired updated/resolved bounds and resolvedAt sort while preserving ordinary inherited queries/defaults. Repeated fields are rejected before scalar interpretation; malformed/unknown fields, unsupported widgets/bucket fields, invalid enums/IDs/date pairs use safe 400 INVALID_QUERY. Widget predicates intersect currentStatus/priority/statusGroup rather than replacing them. Dates are canonical UTC millisecond tokens with from < before; upper bounds are exclusive and future rows/events are capped at the fresh list snapshot clock. Resolution selection is latest qualifying real history on currently RESOLVED/CLOSED parents, distinct per Ticket, with time/id stable ordering. No fallback timestamp is fabricated.

Dashboard and extended owned-list reads use actual read-only REPEATABLE READ transactions with one captured clock per request. [Real controlled-writer evidence](../../server/tests/lab-04/dashboard-snapshot.integration.test.ts) verifies that a commit between reads cannot mix response snapshots. Its direct writer maintains fixture edges/history; it is not an HTTP workflow race, retained snapshot across requests or evidence of Staff/API-09 implementation. [Boundary and security tests](tests.md#requester-domain-traceability) separately identify mocked calendar calculations, controlled clock observation, real SQL predicates and injected failure classifications. Recovery after an injected read fault performs a real successful request; no fake zero response is substituted.

Baseline 964a3f9 → tested c3c2e5d and the previously executed comprehensive results are recorded in [tests section 9](tests.md#9-issue-47-requester-dashboard-evidence-and-current-traceability). No API tests run during this documentation edit. #47 was subsequently approved/merged through PR #55; #48 Staff implementation is documented in section 12 with peer review Pending. #53 under #45, final #49 verification and #50 release remain explicit.

## 12. Implemented Staff Dashboard and extended Staff Ticket reads

[API-09 route](../../server/src/app.ts), [base query adapter](../../server/src/dashboards/staff-dashboard-query.ts) and [Staff service](../../server/src/dashboards/staff-dashboard-service.ts) implement section 5 without new query vocabulary. Live session/password/Staff-Administrator authorization precedes business lookups; identity is session-derived and inherited ROLE_FORBIDDEN remains. Exactly the seven approved base filters are accepted, using inherited Staff literal search/limit, eligible numeric owner, me/unassigned, enum and ID semantics. Unknown/repeated/invalid fields are safe 400 INVALID_QUERY.

One explicitly read-only PostgreSQL REPEATABLE READ transaction captures one server asOf. Database aggregates retain all zero bins and intersect parent filters before active/owner/status/priority/assignee predicates. Recent updates use updatedAt; recent resolutions count distinct currently RESOLVED/CLOSED parents with actual qualifying resolution history and latest qualifying event, without legacy fallback. Bangkok calendar bounds are half-open and capped at asOf. Recent lists are bounded to five in time DESC,id DESC; actor-assigned unfinished Actions are bounded to five in createdAt ASC,id ASC. No complete-dataset download or JavaScript aggregate is used.

The concrete descriptor nesting mirrors metrics: unassigned, mine, byStatus, byItPriority, recentUpdated, recentResolved, myActionsByStatus, myUnfinishedActions. Ticket descriptors target /api/staff/tickets; Action descriptors target /api/staff/actions with assignee=me, status for an individual bin or actionStatusGroup=unfinished for unfinished. Base owner/currentStatus/itPriority are retained even when contradictory to a widget. This nesting was the minimal test-local convention for unspecified descriptor packaging, not a new business field. Ticket previews use the approved bounded safe projection, owner id/name/role; Action rows reuse API-07 {ticket,action} and its explicit id/name ActionDTO identities, including retained historical references. No Notes, credentials, sessions, receipts or fingerprints are serialized.

[Extended parser](../../server/src/tickets/staff-ticket-query.ts) and [Staff drill-down service](../../server/src/tickets/staff-ticket-drilldown-service.ts) support only section 5's status groups/widgets/buckets, paired canonical real UTC millisecond bounds and resolvedAt sort. All predicates intersect. PostgreSQL performs filtering, latest qualifying resolution selection, counting, stable ordering and pagination within a read-only REPEATABLE READ snapshot and one fresh clock. UTC instants are explicitly converted to the UTC-encoded timestamp comparison domain (`timestamptz AT TIME ZONE 'UTC'`), avoiding implicit session-timezone conversion of TIMESTAMP(3) columns. The corrected resolved upper bound is independently half-open and future capped; no updatedAt/ticketDate fallback or duplicate Ticket rows.

Ordinary [Staff Queue service](../../server/src/tickets/staff-queue-service.ts) remains the default path and shares only its existing safe projection. Extended lists retain inherited Staff DTOs, defaults/business ordering and search, with resolvedAt when applicable. counts.matching and pagination.totalItems use the final list predicate; counts.mine/unassigned replace only the explicit owner selection under inherited Queue semantics. They are not redefined as Dashboard metrics. Cross-request equivalence compares pagination.totalItems on a stable fixture, not a retained historical snapshot.

The HTTP boundary sets **Cache-Control: private, no-store** before authorization/query/service branches for API-09 and GET /api/staff/tickets, matching API-07. The route-level correction preserves Vary, ETag configuration, status/body and authentication. Ordinary/extended successful, empty and paginated results plus safe error exits pass through that same header assignment. The formerly failing security assertion executes an authorized extended data response; conditional/304 header coverage is assessed by code inspection, not claimed as a separately executed 304 test. No global cache or transaction policy changed. [Evidence/limitations](tests.md#11-issue-48-staff-dashboard-evidence-and-pre-pr-assessment) separate controlled dependency classifications from actual outages. Staff implementation peer review remains Pending.

## 13. Issue #53 navigation consumer confirmation

Current evidence, 2026-10-29. Earlier sections' then-Pending #48 and incomplete navigation language describe their source phases; [PR #56 approval/merge](reviewer.md#16-pr-56-approval-and-merge) and [#53 delivery](specification.md#18-issue-53-navigation-delivery-and-review-boundary) now supersede that current-state interpretation. Sections 1-7, all DTO/error/query vocabulary, Dashboard formulas and accepted decisions remain unchanged.

#53 changes only the client shell's role home/navigation in [App.tsx](../../client/src/App.tsx). No server endpoint, cache directive, session policy, query parser, descriptor, safe DTO or transaction behavior changes. Real session/password/role checks remain authoritative: Requester landing reads API-08; Staff/Admin landing reads API-09; My Actions reads API-07 with current-actor assignee=me. Mandatory-password-change accounts make no Dashboard read before successful real rotation. Real Administrator demotion/deactivation revokes owned target sessions; a subsequent business read yields the inherited 401 and clears protected UI, while a demoted re-login receives inherited ROLE_FORBIDDEN on Staff endpoints.

The complete browser return consumes the existing section 3/5 contracts: preserve exactly search/categoryId/relatedSystemId/requestedPriority/itPriority/currentStatus/owner across the valid Dashboard -> My Actions -> authorized Ticket/selected-Action -> browser-history list -> Dashboard flow. Action status/group/page/date extensions do not leak into the return. Unknown returnTo remains invalid and cannot cause a privileged list request or arbitrary external destination; explicit Clear then Back recovers to the known local Dashboard. Off-page selection uses API-02 without falsifying page totals or duplicating a DOM identity. No whole-dataset client filtering or fabricated success is introduced.

[Actual test paths/limitations](tests.md#12-issue-53-navigation-evidence-and-comprehensive-confirmation) distinguish component HTTP simulations, real React/Express/PostgreSQL/session/admin operations and an unchanged real response deliberately held across identity change. That scheduling is not a natural backend race or a replacement for inherited server authorization tests. New browser contributions passed 12/12; the original full 59/69 and corrected affected 36/36 remain recorded. A new clean-HEAD **0516e07421e0b18681d52deedbe11719f787bd8d** full E2E confirmation passed **69/69 across 15 files**, exit 0, one worker/zero retries. [Evidence addendum](../../artifacts/lab-04/screenshots/dashboard-navigation/evidence.md#comprehensive-confirmation--2026-10-29) records isolation, no domain leakage, artifact preservation, cleanup and warnings. No new server/client unit or build run is claimed. #53 peer review/integration is Pending; #45/#49/#50 responsibilities remain.
