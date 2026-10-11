# Sprint 4 Engineering Contract

Status: **Student decisions accepted; contract peer review approved; Issue #44 backend reviewed and merged; Issue #45 Actions UI domain implemented and evidenced; Issue #45 implementation peer review Pending.** Contract approval remains limited to reviewed HEAD `fec388a3c2ab63cabb1bf20f3fa913fb023d9241` ([contract review](reviewer.md#completed-peer-review)). Backend approval and merge through PR #51 are recorded separately in [backend review](reviewer.md#6-issue-44-implementation-review-and-evidence). UI source evidence is pinned to `9e81523ea7f0aaab0cd00bab911dd8a04f20b4bb`, with browser execution provenance preserved in [UI evidence](tests.md#6-issue-45-ui-evidence-and-current-traceability). This documentation/publication step runs no application tests and has no new UI implementation peer approval. All 55 product scenario rows remain **Planned**; only the contract-review Product DoD item is checked, and overall product/release readiness is incomplete.

## 1. Goal, baseline, sources and authority

Extend TokTickIT with Actions Taken, an enforced Ticket resolution gate, Requester and IT Staff dashboards, and complete earlier-lab regression. This document retains the student-accepted, peer-reviewed contract and separately records Issue #44 backend implementation/review in section 12 and Issue #45 UI contribution in section 13. Contract approval is distinct from implementation approval.

Before drafting, the branch matched the requested branch and the working tree was clean. HEAD and local `lab4-staging` both resolved to `64ff04ea8fb1395f569c1095aea556ee6a695ebd`. No changes were discarded. Local refs are not a verification of remote branch state. No applicable AGENTS.md was found in the repository or the searched ancestor locations.

Publication evidence: the six contract documents were committed as `010cfb86620a53b0bdd130dd9e255c6061a9e23c`, pushed normally to `origin/feat/41-lab4-contract`, and published in [PR #42](https://github.com/chaproi/toktickit/pull/42) targeting `lab4-staging` on **2026-10-04, Asia/Bangkok**. cottonlnwza [APPROVED reviewed HEAD fec388a3c2ab63cabb1bf20f3fa913fb023d9241](https://github.com/chaproi/toktickit/pull/42#pullrequestreview-5405737951) at 2026-10-04T11:31:01Z (2026-10-04 18:31:01 Asia/Bangkok). PR #42 was merged into lab4-staging as `25368774a1f61ac372918bd7d9187ca8cedd74c4`. The original drafting baseline remains historical evidence; see the [publication ledger](reviewer.md#publication-evidence) and [completed peer review](reviewer.md#completed-peer-review). Those #41 publication/review steps did not execute application tests. Later Issue #44 server evidence is recorded in section 12; product completion and approval of this documentation change are not inferred.

Sources read and compared:

| Source | Extent and interpretation |
| --- | --- |
| `SE+Lab+4.pdf` | All 11 pages, extracted text and visual inspection of every page; illustrations on pages 5–6 and grading rubric on pages 10–11 included. Handout controls Sprint 4 scope. |
| `06-TokTickIT-System-Level-SDS-v1.0.docx` | Entire body, tables, header/footer and embedded architecture illustration; SDS-SYS-001 v1.0, dated 17 August 2026, internally labelled Approved. Architecture guidance subject to the scope/conflict rule below. |
| [Lab 2 specification](../lab-02/specification.md), [tests](../lab-02/tests.md), [UI](../lab-02/ui-spec.md), [API](../lab-02/api-spec.md), [reviewer](../lab-02/reviewer.md), [AI use](../lab-02/ai-use.md) | Inherited Ticket creation, requester ownership, attachments, responsive conventions, and D-02 precedence approach. Lab 3 supersedes the development-requester mechanism. |
| [Lab 3 specification](../lab-03/specification.md), [tests](../lab-03/tests.md), [UI](../lab-03/ui-spec.md), [API](../lab-03/api-spec.md), [reviewer](../lab-03/reviewer.md), [AI use](../lab-03/ai-use.md) | Approved baseline, including eight statuses, role checks, append-only communications/history, terminal states, sessions, concurrency, safe errors and user administration. Historical test/approval entries are source records, not tests or approvals performed in this drafting session. |
| [README](../../README.md), [Prisma schema](../../server/prisma/schema.prisma), [seed](../../server/prisma/seed.ts) | Current setup/data behavior; all four existing migrations also read: initial categories, requester reference data, Ticket creation and Lab 3 authentication foundation. |
| Current implementation and test conventions | Authentication/session/CSRF, authorization, Ticket creation/query/detail/ownership/priority/status, resolution indication, Comments, Notes, Attachments, user administration, serializable mutation protocol; server Lab 1–3, client Lab 2–3 and E2E Lab 2–3 fixtures/configuration reviewed. No application tests executed here. |

The SRS referenced by the SDS was not supplied. No SRS requirement IDs or additional scope are inferred. Attached documents are source material; their deployment/submission instructions do not authorize actions beyond this documentation task.

Source labels below: **H** = handout requirement (including rubric); **L** = inherited approved Lab 2/3 rule; **S** = SDS guidance; **E** = observed implementation; **P** = design introduced through a decision, now accepted by the student (not an H mandate). Follow Lab 2 D-02: H controls sprint scope; S guides architecture where compatible; conflicts with L remain explicit. Every D decision below is **Accepted by student**, selecting its previously Recommended option, including retention of L when S conflicts. Dependent P requirements/tests describe that accepted design; formal contract peer review approved the reviewed HEAD recorded above. Future design changes still require documented review. Student acceptance does not rewrite source provenance or historical Lab 2/3 approvals.

## 2. Scope and rubric mapping

Included: action fields/list/detail/create/edit/assignment/lifecycle/complete/cancel; inactive-assignee rejection; requester read-only visibility of all action items on owned Tickets; eight-status workflow and backend gate; two dashboards including current-user Actions Taken; additive migration/recovery/index/seed planning; authorization, duplicate requests, concurrency, safe failures; Zen Green responsive accessible UI; all earlier-lab regression; review and submission evidence planning.

Excluded: SLA/on-call/escalation/breach, inventory/parts/procurement/cost/payroll/billing, approval signatures, external notifications, advanced BI/export/warehouse, multi-tenancy/cloud deployment, unrelated features. SDS notification/category-management/deployment expansion and an architecture-wide UUID/API/audit rewrite are outside this sprint scope. Historical Issue #41 maintained the six contract documents without application implementation or test execution. This current documentation-only update records previously executed #44 evidence; it authorizes no application, test, database or historical-contract changes. Earlier drafting/decision-recording steps excluded commit/push/PR; later explicit publication and three-file evidence-update authorizations produced PR #42 and its reviewed HEAD. The historical review-record step permitted only necessary metadata changes in the six existing docs/lab-04 files, with no application tests, commit, push, new PR or merge. The pre-existing PR merge is recorded as evidence; local lab4-staging was updated by fast-forward only.

| Handout/rubric area | Contract feature and evidence (product evidence Planned) | Planned work item |
| --- | --- | --- |
| Part 1 Git Use with Engineering Workflow — 10 | Eight-Issue plan, feature branches→lab4-staging→main, actual commits/PR links, peer review and check evidence; authoritative integrated main. #41 records published contract PR #42, its approval and merge into lab4-staging; actual follow-on Issues #44–#50 now exist; implementation peer review and final main integration remain required. | All eight work items; Release Integration and submission report assembles Git evidence |
| Part 2 Spec DD — 5 | Six engineering-contract documents, FR/BR/GWT ACs, authorization/transition matrices, source decisions, API/data/migration/seed/recovery/UI definitions and Product DoD; dated actual contract review after student decisions. | Engineering Contract #41; later issues implement and maintain the approved contract |
| Part 3 Test DD and Traceability — 10 | FR/BR→AC→Planned test paths now; later meaningful unit/API/UI/style/responsive/migration/seed/concurrency/performance/E2E execution reports and full regression evidence. Migration/seed/API evidence supports this part and Spec DD, not separate invented grading parts. | Engineering Contract #41 plans; Actions Taken Backend, Actions Taken UI, Ticket Workflow and both Dashboards implement tests; Final Hardening validates |
| Part 4 AI Use with Reflection — 5 | Actual prompts/model/activities in ai-use.md, student-authored reflection and real verification decisions; do not invent extra prompts or a completed reflection. | All work items record actual AI use; Release Integration and submission report assembles selected prompts/reflection |
| Part 5 Working IT Staff Dashboard UI — 5 | Database-backed unassigned/mine/status/IT-priority/recent metrics, current-user assigned Actions, empty/filter/drill-down states; later screenshots/demo and query-equivalence tests. | IT Staff Dashboard; Actions Taken Backend provides data; Final Hardening validates |
| Part 6 Working Actions Taken UI — 10 | Field/list/create/edit/assign/lifecycle/start/complete/cancel/inactive rejection, safe history and Requester read-only visibility; later role-specific screenshots/demo/API/UI/E2E evidence. | Actions Taken Backend; Actions Taken UI; Final Hardening |
| Part 7 Working Ticket Workflow — 5 | Eight-state permitted/forbidden edges, server resolution gate, cancellation cascade, append-only history/status reasons, roles and concurrent/duplicate failure handling; later direct API and UI/E2E evidence. | Ticket Workflow; Actions Taken Backend; Final Hardening |
| Part 8 Working Requester Dashboard and Final Regression UI — 5 | Owned attention/recent/outstanding metrics and drill-down plus all earlier-lab UI flows; later Requester screenshots/demo and complete Labs 1–3 regression results. | Requester Dashboard; Final Hardening; Release Integration and submission report collects evidence |
| Part 9 Zen Green UI, Responsive, Accessibility, and Final Polish — 5 | Common Zen Green controls on all major screens, desktop/tablet/mobile and genuine 200% zoom, keyboard/labels/focus/contrast, no broken links/console errors/placeholders; later checklist/screenshots/results. | Actions Taken UI, Ticket Workflow and both Dashboards apply conventions; Final Hardening; Release Integration and submission report |

Total: 60 points. Final report headings remain Answer Part 1–9 in this order; their evidence must match these areas, not the superseded migration/API-as-separate-parts mapping. Contract publication, peer approval and staging merge evidence are recorded above; backend execution evidence is recorded separately; UI/E2E/performance, final integration and submission remain Planned/Pending.

## 3. Student-accepted decisions — Contract peer review approved

Each heading is a stable decision link. All D-01–D-20 retain the reviewed Recommended behavior, rationale and alternatives; the student selected that option for each decision. Alternatives are retained for traceability and were not selected. Formal peer approval is recorded for the reviewed HEAD; it does not approve this new metadata change or assert implementation/release readiness.

### Student acceptance evidence

- Student: **สิริกร ฝันนิมิตร (ไทเกอร์)**.
- Acceptance date: **2026-10-04, Asia/Bangkok**; no time of day supplied.
- Scope: **D-01–D-20, Recommended option accepted for every decision**.
- Actual student message supplied as evidence: “ยอมรับ Recommended ทั้ง 20 ข้อ ว่าแต่อันนี้ถูกทั้งตาม lab4 ใช่มั้ยถ้าถูกฉันยอมรับ”.
- The earlier decision-recording request reports the assistant's subsequent confirmation that the reviewed contract matches Lab 4 scope/rubric. This is student design acceptance and AI-assisted documentation review; the assistant is not a formal peer reviewer.

This common evidence applies to each individually marked decision below and the [student decision record](reviewer.md#student-acceptance-evidence). Separate [formal peer approval](reviewer.md#completed-peer-review) and PR #42's staging merge are recorded. All product tests remain Planned; only the combined student-acceptance/contract-review Product DoD item is complete, with the other ten unchecked.

### D-01

**Accepted by student (Recommended option):** retain H scope and approved L behavior when SDS conflicts. Use the conflict register below and escalate architecture conflicts through documented design review. Reason: prevents accidental scope expansion and replacement of approved behavior. Affects all APIs/data/UI/tests and source traceability. Alternative: amend approved contracts explicitly with review; never silently substitute SDS.

### D-02

**Accepted by student (Recommended option):** adopt SDS Action states `PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`; only the edges in section 5. H requires lifecycle/complete/cancel but does not enumerate the vocabulary. Alternative: two-state open/done is simpler but loses planned versus active work and cancellation detail. Affects enum, status API, controls, lifecycle tests.

### D-03

**Accepted by student (Recommended option):** immutable `createdById` is the authenticated creator; required `assigneeId` defaults to creator and may name another active Staff/Admin; nullable `performedById` is automatically the authenticated user who completes the Action, then immutable. Ticket Owner remains the coordinator. Before completion display Performed by as “Not completed”. H says Performed by automatic but does not settle its timing or distinguish the rubric's assignee. Alternative: auto-populate performer on creation and retain a separate completedBy field; simpler display but misleading for delegated work. Affects DTOs/FKs/create/complete/UI/audit and identity tests.

### D-04

**Accepted by student (Recommended option):** any active Staff/Admin may operate actions on any accessible Ticket, even when neither owner nor assignee. Require description 5–2000 characters; result optional until completion then 1–2000; follow-up note 1–2000 when required; attachment notes optional 0–2000; cancellation reason 5–500 (all trimmed plain text). Assignee is required; no free-form identity. These exact bounds are P, not H. Alternative: restrict completion to assignee/owner; requires a delegation policy absent from H and reduces shared operational access. Affects validation, authorization, field UI and negative tests.

### D-05

**Accepted by student (Recommended option):** resolution and closure require **zero Actions in PLANNED or IN_PROGRESS**, evaluated in the commit transaction. Zero-action Tickets and all-cancelled Actions pass this gate; existing owner/confirmation/matrix rules still apply. This follows S's universal completed-or-cancelled rule, not an H mandate for positive evidence. **No minimum completed Action, no new-cycle completion rule and no Ticket.workCycle.** Alternative A: require at least one completed Action (stronger evidence, breaks zero-action/legacy resolution); alternative B: require completion after latest REOPENED event (uses existing history without a column but adds a stricter rule and timestamp/event ordering semantics); alternative C: Ticket.workCycle plus per-cycle actions (explicit but larger migration and mutation surface). Alternatives A–C were not selected by the student. Affects Ticket service, count predicate, legacy handling, resolve/close UI and tests.

### D-06

**Accepted by student (Recommended option):** follow-up is descriptive information; `followUpRequired=true` requires a trimmed 1–2000 note but does not itself prevent completion/resolution. On create with false, omitted/null/trimmed-empty note normalizes to null; nonempty note is 400. Edits preserve omitted fields and validate the final merged state. Changing true→false while a note exists requires explicit followUpNote=null after UI confirmation; omission or empty-string replacement must not silently clear it. Clearing preserves the old note in ActionHistory.before. Result remains required to complete. A real unfinished task should be another nonterminal Action. Alternative: block completion until false, or block resolution on follow-up flags; both add a policy and can strand completed history. H does not mandate false before completion. Affects validation, history, form clearing, completion/gate and tests.

### D-07

**Accepted by student (Recommended option):** Action Date/Time is immutable backend creation time (`actionAt=createdAt`); completion/cancellation/update timestamps are separate UTC instants; no backdating in this sprint. Action material mutations advance parent `Ticket.updatedAt` monotonically so recent-updated dashboards reflect action activity. Comments/Notes retain their current timestamp semantics. Alternative: user-entered occurredAt preserves offline work but needs timezone/backdate limits and audit; alternative recentActivityAt avoids additional Ticket stale conflicts but adds another field/contract. H's “Action create date/time” illustration supports the simple timestamp interpretation but does not decide it. Affects schema/DTO/stale writes/dashboard ordering/tests.

### D-08

**Accepted by student (Recommended option):** edit nonterminal current Action fields while appending immutable ActionHistory in the same transaction; completed/cancelled actions are read-only. Section 9 defines exact event names, full before/after snapshots, null rules and requester-safe projection; one event per material version (reassignment wins event naming if content changes too). Do not rewrite TicketStatusHistory, Comments or Notes. Preserve cleared/changed notes in before. Alternative: immutable action entries with amendments avoids edits but conflicts with the rubric's edit expectation unless explicitly agreed. Affects tables/edit/UI/history and rollback tests.

### D-09

**Accepted by student (Recommended option):** action writes allowed on NEW/OPEN/IN_PROGRESS/WAITING_FOR_REQUESTER/REOPENED; freeze them on RESOLVED/CLOSED/CANCELLED. Reopen RESOLVED through L before new work. Existing L Comments/Notes/attachments retain their approved rules; this freeze is scoped to Actions. Alternative: permit audited corrections on RESOLVED but never unfinished creation; adds exception paths. Affects parent guards, UI and resolve-versus-edit tests.

### D-10

**Accepted by student (Recommended option):** Ticket cancellation atomically cancels all unfinished Actions with the Ticket reason and one ActionHistory event per affected action, preserving completed/cancelled actions. This is S guidance and a new L extension, not H's prescribed algorithm. Alternative: reject Ticket cancellation while actions remain open; simpler changes but demands manual cleanup. Do not allow Requesters to cancel/reopen or reopen CLOSED/CANCELLED. Affects workflow transaction, timestamp/version updates, audit and race tests.

### D-11

**Accepted by student (Recommended option):** reject inactive/REQUESTER assignees at create/reassign and commit; block user deactivation or demotion to REQUESTER while assigned any nonterminal Action, in addition to L owner checks. Preserve terminal assignee/creator/performer references and names through User IDs; eligible Staff↔Admin changes remain permitted subject to L safeguards. No automatic cancellation/reassignment on deactivation. Alternative: unassign automatically requires nullable assignments and hides accountability. Affects User service, assignment picker, eligibility locks/error and tests.

### D-12

**Accepted by student (Recommended option):** retain Ticket `expectedUpdatedAt` and L shared serializable User-before-Ticket locking/gates; add integer Action `version` with `expectedVersion`. All Action writes, Ticket resolve/close/cancel and affected User edits participate in the same protocol. Recheck parent gate and assignee eligibility after locking; lock Action rows after parent, ascending IDs. Retain L's retry only for confirmed SQLSTATE 40001, two retries after initial attempt, exhausted 409 CONCURRENT_UPDATE; P2034 alone/deadlock is not retry proof. Alternative SDS Ticket.version is reasonable for greenfield but breaks L clients and requires extra migration. Affects service transactions, optimistic tokens, UI conflict and concurrency tests.

### D-13

**Accepted by student (Recommended option):** each new Action write carries UUID clientMutationId; receipt unique (actorId,clientMutationId) stores operation/parent/action/canonical original input and safe response. Same key/original input replay 200; different input/operation/target 409 DUPLICATE_REQUEST_CONFLICT. Create first 201, others 200. Re-authorize and inspect receipt before stale/terminal guards; never compare against current editable values. Receipt unique-constraint recovery is separate from D-12: rollback all attempted writes, then at most one fresh read-only recovery transaction rechecks current auth and committed receipt; no mutation retry/polling. Only positively identified receipt-key conflicts qualify, not generic P2002/23505. Missing committed receipt yields safe 409 CONCURRENT_UPDATE; dependency failures keep L safe mapping. All cooperating same-actor writes hold the actor User gate even across Tickets, normally preventing receipt insertion collisions; a confirmed 40001 retry starts fresh and sees the winner. Tests must prove these normal outcomes and exercise defensive constraint recovery separately. Alternative: create-only idempotency reduces storage but weakens completion retry UX. L Ticket status duplicate behavior unchanged. Affects receipts/API/locks/recovery/history tests.

### D-14

**Accepted by student (Recommended option):** use the precise dashboard definitions in section 6, seven Asia/Bangkok calendar days including today, top five recent items, current-user Actions = assignee (not creator/performer/owner), and explicit active sets. Alternatives: rolling 168 hours, completion actor, or all-time creator metrics are valid but materially different. No invented percentage/yesterday comparisons from illustrations. Affects aggregates, labels/date handling/drill-down/tests.

### D-15

**Accepted by student (Recommended option):** backend filtered aggregates and bounded lists share one read snapshot and normalized filters; expose effective UTC bounds, timezone, asOf, counts and drill-down descriptors. Accept no client-chosen actor or asOf; apply the same filter predicates in target list APIs. Dashboard counts use filter intersection; existing Staff Queue counters keep L's replacement of the owner filter. Compare drill-down against list pagination.totalItems, not those legacy counters. Alternative: reuse queue counter replacement semantics, or use independent aggregate queries; the former gives a different filtered-dashboard definition and the latter can visibly disagree under writes. Affects dashboard/list API query extension, isolation, cache/session clearing and equivalence tests.

### D-16

**Accepted by student (Recommended option):** additive integer-ID Action, ActionHistory, MutationReceipt and seed-fixture registry tables, RESTRICT historical FKs, UTC instants and composite indexes; preserve existing IDs and TIMESTAMP(3) conventions, interpret as UTC, do not convert existing data types in this sprint. Legacy Tickets get zero actions, no fabricated owner/action/history/time. Recover through verified backup/forward repair; no destructive automatic down migration. Alternative SDS UUID/timestamptz conversion is an architecture project, not necessary for H. Affects migration/recovery/index plan and populated/empty baseline tests.

### D-17

**Accepted by student (Recommended option):** existing operational users/references/Tickets/actions must never be reset by reseeding. Seed creates missing fixtures through immutable registry keys, in a transaction, and leaves existing domain rows and credentials/role/name/isActive/status/assignment/times/history untouched. Registry maps a stable fixture key to a typed historical FK, not mutable name/email/content; bootstrap existing fixture identities before edits, and report ambiguous legacy mappings for review rather than recreating a renamed user. Skip/report a missing dependent fixture if existing operational state makes it illegal (inactive worker/frozen parent); never reactivate/reopen to seed. Support safe rerun after interruption and operational edits. Alternative reset/upsert fixture values is useful only in a separately authorized disposable database and fails preservation here. A registry adds metadata but avoids duplicates after email edits. Affects current seed behavior, fixture identities, migration/seed tests and setup guidance.

### D-18

**Accepted by student (Recommended option):** preserve `/api`, positive integer entity IDs, L error envelope, 400 validation/query errors, Strict cookies and existing DTO names; new endpoints follow those conventions. Do not adopt SDS `/api/v1`, 422, fieldErrors array, Lax cookie or UUID entity IDs. Separate 409 business conflicts from malformed 400. Affects HTTP/client/API tests and SDS exception record.

### D-19

**Accepted by student (Recommended option):** use Zen Green and L breakpoints/accessibility; add /dashboard for Requester and /staff/dashboard for Staff/Admin, role Dashboard nav and post-login defaults there (password-change gate first). “View my actions” goes to /staff/actions, active Staff/Admin only, with actor-derived assignee=me, mapped parent/status filters, pagination 10/25/50 (default 10), createdAt ASC,id ASC and Back to Dashboard retaining base filters. API-07/UI define the exact mapping. Keep all old list/detail/admin routes. Admin dashboard uses Staff metrics, optional user counts excluded. Alternative: a filtered panel on Dashboard avoids a route but complicates pagination/links. Affects routing/navigation/style/responsive/E2E tests; illustration's Create Ticket does not override Requester-only creation.

### D-20

**Accepted by student (Recommended option):** in the planned **Ticket Workflow** Issue, persist the optional reason accepted by the existing validator for **every successful Ticket status transition**, not only cancellation. Retain existing validation: non-cancel reason omitted/null→null, supplied string trimmed (0–500 accepted, including empty string stored as ""); wrong type/>500 is 400; cancellation trimmed 5–500 mandatory. Store the validator output without inventing a reason; preserve historical rows and never backfill previously discarded reasons. Rejected/stale/forbidden/gated transitions create no history. This is a scoped student-accepted implementation correction to the observed service, not an endpoint change performed by #41 or formal peer approval. Alternative: keep losing non-cancel reasons, which preserves current implementation but leaves audit/spec disagreement. Affects status service/history DTO, optional reason UI and AC-43/T-53.

## 4. Conflicts and observed gaps

| ID | SDS/handout versus approved/current behavior | Student-accepted treatment and decision |
| --- | --- | --- |
| C-01 | S seven states include ASSIGNED/PENDING_REQUESTER, omit REOPENED; H and L require eight OPEN/WAITING_FOR_REQUESTER/REOPENED vocabulary. Earlier migration already maps old vocabulary. | Retain all eight; no remapping/reduced enum (D-01, D-18). |
| C-02 | S lets read-authorized Requester cancel/reopen, including CLOSED/CANCELLED; L reserves formal transitions for Staff/Admin and terminal states never reopen. | Retain L; Requester indication stays advisory (D-01, D-10). |
| C-03 | S CLOSED is locked until reopen; S reopen becomes IN_PROGRESS or NEW; L only RESOLVED→REOPENED with eligible owner, clears indication. | Retain L matrix/terminal rules; no new cycle field (D-01, D-05, D-09). |
| C-04 | S Ticket.version and general transaction guidance; L expectedUpdatedAt plus established gates/40001 policy. | Extend L protocol to new child mutations, add only Action version (D-12). |
| C-05 | S 422 validation, /api/v1, UUID, fieldErrors; L/E 400, /api, integer IDs, fields object. | Preserve L; new API follows it (D-16, D-18). |
| C-06 | S SameSite=Lax and KMUTT orange; L Strict security and H Zen Green. | Preserve Strict/CSRF and Zen Green (D-18, D-19). |
| C-07 | S broad Staff create/upload/remove permissions; L Requester-only create/upload/remove, Staff/Admin attachment reads. | Preserve L; mockup is illustration, not a role amendment (D-01, D-19). |
| C-08 | At #41 drafting E had no Action/dashboard model/endpoints/gate. S permits completed/cancelled, with no positive-completion requirement. | #44 implements Action models/API-01–07; #46 owns Ticket gates/cascade, #47/#48 dashboards. D-05/D-06 remain unchanged. |
| C-09 | Historical E seed overwrote user name/role/isActive and reactivated reference fixtures; Ticket fixtures largely skipped existing entries. | D-17 retained; #44 now implements registered create-only seed and operational-edit preservation tests. |
| C-10 | Historical E eligibility checked only nonterminal Ticket ownership. | #44 now implements open-assignment guards under the existing D-11/D-12 protocol; owner conflict priority and inherited safeguards retained. |
| C-11 | L optional non-cancel status reason versus E storage only on cancellation; Comments/Notes do not advance Ticket.updatedAt. | Student-accepted D-20 preserves all validated transition reasons in Ticket Workflow, with no historical backfill; endpoint remains unchanged here. D-07 is action-specific timestamp extension, not all activity. |
| C-12 | S suggests unified immutable TicketEvent for all material changes; L separate status history plus append-only Comments/Notes. | Scoped ActionHistory, preserve old records; unified audit rewrite excluded (D-08, D-16). |
| C-13 | L Staff Queue counters replace the owner filter, whereas the student-accepted Dashboard design intersects all active filters. L My Tickets has no itPriority filter. | Keep old queue counters/defaults; compare drill-down totalItems. Add requester itPriority only as explicit D-15 query extension, with legacy regression. |

## 5. Roles, ownership and transition matrices

Session identity and current active role govern every request; no actor header, requester selector or supplied actorId. L login/password-change/Origin/CSRF/revocation checks continue. Requester inaccessible/missing Ticket returns indistinguishable 404; role denial is 403 before protected lookup. No password/hash/session/receipt/internal-note data in public DTOs.

| Operation | Requester | IT Staff | Administrator | Source/decision |
| --- | --- | --- | --- | --- |
| Ticket create/upload/remove Attachment | Own Ticket under L rules | Denied | Denied | L, D-01 |
| Ticket/attachment read | Owned only | All | All | L |
| Action list/detail/read-only history | All items on owned Ticket | All | All | H, D-08 |
| Action create/edit/reassign/start/complete/cancel | Denied | Accessible Ticket, parent/status guards | Same as Staff | H, D-02–D-04, D-09 |
| Ticket owner/priority/formal transitions | Denied | All under L matrix | Same as Staff | L, H gate extension D-05/D-10 |
| Requester resolution indication | Owned eligible state; advisory | Denied | Denied | L |
| Public Comment / Internal Note | Own public comments; no Notes | Public comments and private Notes | Same as Staff | L |
| Dashboard | Requester own data | Staff data/current actor | Staff data/current actor | H, D-14/D-15 |
| User administration | Denied | Denied | L admin safeguards plus student-accepted open-action check | L, D-11 |

`requesterId` = immutable Ticket submitter; `ownerId` = nullable Ticket coordinator; `createdById` = immutable action author; `assigneeId` = current responsible action worker; `performedById` = actual completing actor under D-03. These may differ. User FKs preserve identity after role/activation changes; current eligibility is a commit-time rule, not a permanent historical-role constraint. Requester “owned” means requesterId, not Ticket ownerId.

Ticket matrix (all omitted edges forbidden, including same-status; L preserved):

| From | Allowed to | Actor | Guard |
| --- | --- | --- | --- |
| NEW | OPEN, CANCELLED | Staff/Admin | OPEN eligible owner; cancel confirmation/reason |
| OPEN | IN_PROGRESS, WAITING_FOR_REQUESTER, RESOLVED, CANCELLED | Staff/Admin | Target owner rule; resolve gate; confirmation on resolve/cancel |
| IN_PROGRESS | WAITING_FOR_REQUESTER, RESOLVED, CANCELLED | Staff/Admin | Same guards |
| WAITING_FOR_REQUESTER | IN_PROGRESS, RESOLVED, CANCELLED | Staff/Admin | Same guards |
| RESOLVED | CLOSED, REOPENED | Staff/Admin | Eligible owner; close confirmation and gate; reopen clears indication |
| REOPENED | IN_PROGRESS, WAITING_FOR_REQUESTER, RESOLVED, CANCELLED | Staff/Admin | Target owner rule; resolve gate; confirmation on resolve/cancel |
| CLOSED | None | None | Terminal |
| CANCELLED | None | None | Terminal |

Every mutation requires current expectedUpdatedAt, current authorization and atomic append-only TicketStatusHistory. Owner required when targeting OPEN/IN_PROGRESS/WAITING_FOR_REQUESTER/RESOLVED/CLOSED/REOPENED; cancellation needs no owner. Owner is still nullable on every stored status, including legacy records; no fabricated owner. Claim/assign/unassign/priority preserve Lab 3 BR-34–BR-41. Gate is a server rule (D-05), not a hidden UI-only button rule. Cancellation cascade is D-10; Requester advisory cannot trigger a formal transition or bypass either gate.

Action matrix (student-accepted design under D-02–D-04/D-09):

| From | To | Commit prerequisites |
| --- | --- | --- |
| PLANNED | IN_PROGRESS | Active eligible assignee; editable parent; current version |
| PLANNED | CANCELLED | confirm=true; 5–500 reason; editable parent; current version |
| IN_PROGRESS | COMPLETED | confirm=true; nonempty result; eligible assignee; editable parent; current version; auto performer/completedAt |
| IN_PROGRESS | CANCELLED | confirm=true; reason; editable parent; current version |
| COMPLETED | None | Terminal, read-only |
| CANCELLED | None | Terminal, read-only |

Creation starts PLANNED. No PLANNED→COMPLETED shortcut, reopening, terminal edit or hard delete. Edit/reassign only nonterminal; a transition is a distinct operation. Ticket cancellation cascade is the sole parent-state exception to ordinary editable-parent guards. A completed Action can still have follow-up=true with note (D-06).

## 6. Dashboard calculations, bounds and drill-down

All following choices are defined by student-accepted D-14/D-15. A = all Tickets after immutable requester ownership scope (Requester) or all-access Staff scope and shared filters. Active set = `{NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, REOPENED, RESOLVED}`; outstanding set = active minus RESOLVED. Current status, requested priority and IT priority are distinct fields.

Common filters: search/categoryId/relatedSystemId/requestedPriority/itPriority/currentStatus; Staff also owner=unassigned/me/eligible ID. Requester search matches ticketNumber/summary; Staff includes requester name/email as in L. Reject unknown/repeated parameters. Each widget intersects these base filters with its own predicate; do not silently replace an explicit owner/status filter. Return normalized filters and intersection in its drill-down descriptor. A card may legitimately be zero because of an active filter. Clear filters is visible.

At server `asOf`, determine the Asia/Bangkok calendar date D. Recent start = local midnight D−6; end = local midnight D+1; convert both to UTC ISO. Use `[start,end)` and additionally eventTime ≤ asOf; month/year/leap-day boundaries are tested. Capture one read snapshot for counts and lists. Display dates in Asia/Bangkok and label “7 calendar days including today”; no browser-timezone-dependent bucket. No client-selected asOf. Ordinary timestamps remain UTC instants; no reinterpretation of existing UTC values as local time.

| Widget | Exact calculation/order | Drill-down |
| --- | --- | --- |
| Requester outstanding | count A with currentStatus in outstanding | Owned list, same filters + statusGroup=outstanding |
| Requester needs attention | count A with currentStatus=WAITING_FOR_REQUESTER | Owned list with effective status predicate; label “Waiting for your response” |
| Requester recent updated | A with updatedAt in recent bounds and ≤asOf; count plus top 5 updatedAt DESC,id DESC | Same updated bounds, sort updatedAt DESC |
| Requester recently resolved | Tickets in A currently RESOLVED/CLOSED with a transition-to-RESOLVED history instant in bounds; count distinct Ticket IDs; use latest qualifying resolved event per Ticket for top 5 time DESC,id DESC | Same current-status and resolution-event predicate; sort resolvedAt DESC,id DESC |
| Staff unassigned | count A with ownerId=null and active status | Same owner/status intersection |
| Staff mine | count A with ownerId=current user and active status | Same actor-derived owner/status intersection |
| Staff by status | counts for all eight statuses in A; zero bins included | Exact status plus same filters |
| Staff by IT priority | counts active A for LOW/MEDIUM/HIGH/URGENT using itPriority | Exact itPriority + active group |
| Staff recent updated/resolved | Same event/bounds definitions as above, all-access scope | Staff list, equivalent predicates |
| Staff current-user Actions Taken | count/list actions assigned to current user, with parent in A; all four status bins; unfinished count; top 5 unfinished ordered createdAt ASC,id ASC | Action list with assignee=me and effective parent filters/statuses, same order |

Old completed/cancelled assignments remain visible to an active Staff/Admin even when a referenced historical worker is now inactive. They do not become current-user assignments by creator/performer/owner match. An unassigned RESOLVED legacy Ticket contributes to active/unassigned but has no recent-resolution event if history is absent; never invent a date. Count each Ticket once for recent resolved even with multiple events. Reopened Tickets cease to count as currently resolved. Action updates affect updatedAt under D-07; Comments/Notes alone keep L semantics, so labels say “Ticket updated” rather than “all activity”. Requester aggregates never reveal others' Tickets or private notes.

Target list query extensions (`statusGroup`, updated/resolved UTC bounds, sortBy=resolvedAt, Requester itPriority, dashboardWidget/widgetStatus/widgetItPriority and action assignee/status filters) are new student-accepted API behavior, not already-supported L filters. Fixed widget predicates are separate from base owner/currentStatus/itPriority parameters, so contradictory intersections are expressible without repeated query keys or silently dropping filters; the API defines exact allowed combinations. Keep old Staff Queue owner-replacement counters; equivalence uses filtered list pagination.totalItems. URL encoding, inclusive/exclusive semantics and authorization must match the descriptor exactly. Detail remains accessible from each row. No full dataset download for client-side counting. Empty counts = numeric zero, lists = []; unavailable metrics are an error, never fake zeros. After mutation, invalidate/refetch relevant authorized detail/dashboard/list data; clear caches on logout/role change; labels describe a snapshot rather than claiming live consistency after later mutations.

## 7. Functional requirements and business rules

IDs are Sprint 4-local; prefix references with “Lab 4” when comparing historical IDs. P entries are student-accepted design choices; H/L retain their source authority. Contract peer review is complete for the reviewed HEAD; the required follow-on Issues now exist as #44–#50. Their implementation and final verification boundaries remain separate.

| ID | Requirement | Basis / decision | AC |
| --- | --- | --- | --- |
| FR-01 | Preserve active session, CSRF, role and safe DTO enforcement on new operations. | L, D-18 | AC-01, AC-02 |
| FR-02 | List/view all Actions of accessible Tickets, Requester read-only on owned Tickets. | H, D-08 | AC-02, AC-03 |
| FR-03 | Create all handout action fields with separate creator/assignee/performer. | H, D-03, D-04, D-07 | AC-04, AC-05 |
| FR-04 | Assign/reassign active eligible workers independently of Ticket Owner. | H, D-03, D-11 | AC-06, AC-07 |
| FR-05 | Edit nonterminal action content, retaining immutable identity/timestamps/history. | H, D-04, D-08, D-09 | AC-08, AC-12 |
| FR-06 | Start, complete and cancel through the full action matrix. | H, D-02, D-04, D-06 | AC-09, AC-10, AC-11 |
| FR-07 | Reject action writes for frozen parents/terminal Actions. | P, D-08, D-09 | AC-12 |
| FR-08 | Record atomic append-only ActionHistory with explicit snapshots/event/null rules; preserve earlier immutable records. | H/L/S, D-08 | AC-13, AC-45 |
| FR-09 | Prevent duplicate action writes and bounded receipt-specific recovery under retries. | H, D-13 | AC-14, AC-42 |
| FR-10 | Detect stale/concurrent mutations without overwrite. | H/L, D-12 | AC-15, AC-16 |
| FR-11 | Preserve the eight-status Ticket matrix and advisory indication. | H/L, D-01, D-20 | AC-17, AC-20 |
| FR-12 | Enforce resolution/closure action gate in backend transaction. | H/S, D-05, D-06 | AC-18, AC-19 |
| FR-13 | Cancel unfinished actions atomically with Ticket cancellation. | P/S, D-10 | AC-21 |
| FR-14 | Preserve ownership/priority rules and extend user eligibility to assignments. | L/P, D-11, D-12 | AC-07, AC-22 |
| FR-15 | Serve authoritative Requester dashboard metrics and bounded lists. | H, D-14, D-15 | AC-23, AC-24 |
| FR-16 | Serve Staff dashboard ownership/status/priority/recent metrics. | H, D-14, D-15 | AC-25 |
| FR-17 | Include current-user assigned Actions Taken and /staff/actions drill-down on Staff/Admin Dashboard. | H/P, D-03, D-14, D-15, D-19 | AC-26, AC-44 |
| FR-18 | Define stable dates/order/filters/empty states and equivalent drill-down. | H, D-07, D-14, D-15 | AC-27, AC-28, AC-29 |
| FR-19 | Add migration without data loss, fabrications or legacy rewriting. | H, D-16 | AC-30 |
| FR-20 | Plan safe recovery, constraint/index validation and clean deployment migration. | H/S, D-16 | AC-31 |
| FR-21 | Seed realistic fixtures idempotently without resetting operational edits. | H, D-17 | AC-32, AC-33 |
| FR-22 | Provide exact validated action/dashboard API contracts, partial follow-up updates and safe failures. | H/L/P, D-04, D-06, D-18 | AC-05, AC-34, AC-41 |
| FR-23 | Provide role Dashboard navigation, guarded /staff/actions and permitted controls only. | H/P, D-19 | AC-35, AC-44 |
| FR-24 | Render all action and dashboard loading/busy/validation/empty/error states. | H, D-13, D-19 | AC-36 |
| FR-25 | Apply Zen Green responsive layouts and accessible interaction. | H/L, D-19 | AC-37, AC-38 |
| FR-26 | Keep Attachment Notes as plain text, separate from actual attachments/Notes. | H/L, D-04 | AC-05, AC-39 |
| FR-27 | Plan complete Labs 1–3 regression and meaningful performance smoke. | H/S | AC-40 |
| FR-28 | Publish a decision-linked planned test for every AC and truthfully record review status. | H | AC-40 |
| FR-29 | Plan Product DoD, nine-part submission evidence and ordered integration. | H | AC-40 |
| FR-30 | Keep SDS conflicts, decision provenance and student-accepted design choices visible for formal peer review. | L/P, D-01–D-20 | AC-40 |
| FR-31 | Preserve validated optional reasons on every successful status transition without rewriting historical rows. | L/P, D-20 | AC-43 |

| ID | Business rule | Basis / decision | AC |
| --- | --- | --- | --- |
| BR-01 | Current active session identity only; preserve password gate/CSRF/revocation. | L, D-18 | AC-01 |
| BR-02 | Requester sees owned Ticket Actions only; nonowned/missing indistinguishable 404. | H/L | AC-02 |
| BR-03 | Requester cannot mutate actions/formal status; Staff/Admin share operational access. | H/L, D-04 | AC-03, AC-17 |
| BR-04 | One Action belongs to exactly one immutable ticketId; no hard delete. | H/P, D-16 | AC-04, AC-13 |
| BR-05 | Creator, Ticket Owner, assignee and automatic completing performer are distinct. | H/P, D-03 | AC-04, AC-06, AC-10 |
| BR-06 | Trim plain-text fields and enforce D-04 bounds; reject unknown/input identity fields. | P/L, D-04, D-18 | AC-05 |
| BR-07 | True requires valid note. Create false normalizes omitted/null/trimmed-empty to null, rejects nonempty 400. Partial edit preserves omissions/final merged state; true→false with existing note requires explicit null after UI confirmation, never implicit clearing; history retains old note. | H/P, D-04, D-06, D-08, D-12, D-13, D-18 | AC-05, AC-10, AC-41 |
| BR-08 | Assignment must be active Staff/Admin at commit; no null/free-text worker. | H/P, D-03, D-11 | AC-06, AC-07 |
| BR-09 | Initial PLANNED; only action-matrix edges; no same-state/terminal writes. | P/S, D-02, D-08 | AC-09, AC-11, AC-12 |
| BR-10 | Completion requires result, confirmation, active assignee; performer/time automatic. | P, D-03, D-04 | AC-10 |
| BR-11 | Cancellation requires confirmation and reason; retains original fields. | H/P, D-04 | AC-11 |
| BR-12 | createdAt/actionAt immutable UTC, separate updated/completed/cancelled times; no backdate. | P, D-07 | AC-04, AC-08 |
| BR-13 | Nonterminal fields editable; material edit appends history, bumps Action version and parent time. | H/P, D-07, D-08, D-12 | AC-08, AC-13, AC-15 |
| BR-14 | RESOLVED/CLOSED/CANCELLED action-write freeze; ordinary earlier features unchanged. | P/L, D-09 | AC-12 |
| BR-15 | Every Action write and history/receipt/parent update commits or rolls back together. | S/P, D-08, D-12, D-13 | AC-13, AC-14, AC-34 |
| BR-16 | Identical idempotency replay is 200, changed key reuse 409; replay remains authorized. | P, D-13 | AC-14 |
| BR-17 | Action expectedVersion and Ticket expectedUpdatedAt reject stale writes 409. | L/P, D-12 | AC-15 |
| BR-18 | Shared User→Ticket→Action lock protocol and bounded confirmed-40001 retry preserve invariants. | L/P, D-12 | AC-16, AC-22 |
| BR-19 | Preserve all eight Ticket states/edges, confirmation/owner rules and terminality. | H/L, D-01 | AC-17 |
| BR-20 | Resolve AND close require count of unfinished actions=0; other L guards still apply. | H/S/P, D-05 | AC-18 |
| BR-21 | Zero Actions/all cancelled pass student-accepted gate; no min-completion/cycle field. | P, D-05 | AC-19 |
| BR-22 | Follow-up true does not block completion/gate when note/result valid. | P, D-06 | AC-10, AC-19 |
| BR-23 | REOPENED clears requester indication under L; Requester indication never changes formal state. | L | AC-20 |
| BR-24 | Cancel Ticket cancels unfinished actions atomically; no automatic action reopening. | P/S, D-10 | AC-21 |
| BR-25 | Ineligible User edits blocked by open assignments; terminal historical refs preserved. | L/P, D-11 | AC-22 |
| BR-26 | Requester dashboard starts with session requesterId scope before aggregation. | H/L | AC-23 |
| BR-27 | Outstanding/attention/recent-updated/recent-resolved follow section 6 exactly. | P, D-14 | AC-23, AC-24 |
| BR-28 | Staff owner/status/IT-priority metrics use distinct precise predicates and zero bins. | P, D-14 | AC-25 |
| BR-29 | Current-user Actions use assigneeId, not creator/performer/Ticket owner. | H/P, D-03, D-14 | AC-26 |
| BR-30 | Seven local calendar days, half-open UTC bounds, future cap asOf, stable ID tie-break. | P, D-14 | AC-27 |
| BR-31 | Same normalized filter intersections/snapshot drive widget and drill-down query. | H/P, D-15 | AC-28 |
| BR-32 | Zero is a valid count; empty lists distinct from dependency failure/no-results. | H | AC-29, AC-34 |
| BR-33 | Additive migration preserves all existing rows/IDs/content/times/nullable owners. | H/P, D-16 | AC-30 |
| BR-34 | No synthetic Action/event for legacy Tickets; RESTRICT FKs and tested indexes. | P, D-16 | AC-30, AC-31 |
| BR-35 | Restore/forward repair verified on disposable copies, never destructive live rollback. | P/S, D-16 | AC-31 |
| BR-36 | Stable seed keys create missing fixtures only; repeated/interrupted seed retains operational edits. | H/P, D-17 | AC-32, AC-33 |
| BR-37 | Keep /api, integer IDs, UTC DTOs, 400 validation and existing safe error shape. | L/P, D-18 | AC-05, AC-34 |
| BR-38 | No cache/DTO leaks across users/roles; new routing retains prior routes/password gate. | L/P, D-19 | AC-02, AC-35 |
| BR-39 | Busy mutation disabled, retried key retained, recoverable errors preserve input. | H/P, D-13 | AC-36 |
| BR-40 | Keyboard, focus/dialog/labels/noncolor states and 200% genuine zoom follow L. | H/L | AC-37, AC-38 |
| BR-41 | Attachment Notes neither links actual binary automatically nor replaces private Internal Notes. | H/L/P, D-04 | AC-39 |
| BR-42 | Earlier labs unchanged except approved scoped changes; tests/review/evidence are not claimed early. | H/L, D-01, D-20 | AC-40 |
| BR-43 | Successful Ticket transitions store existing validator's optional reason output; cancellation mandatory, invalid/rejected writes append no history, historical nulls never backfilled. | L/P, D-05, D-20 | AC-43 |
| BR-44 | ActionHistory uses section 9's fixed event names/full snapshots/null rules and requester-safe projection; create before=null, all after non-null; cascade linked to Ticket status event; rollback/replay never duplicates events. | P, D-08, D-10, D-12, D-13, D-18 | AC-45 |
| BR-45 | Receipt-key uniqueness recovery rolls back first and performs at most one authorized committed-receipt read; distinct from 40001 ≤3 mutation attempts; same-actor gate serializes across Tickets. | L/P, D-12, D-13 | AC-42 |
| BR-46 | /staff/actions is active Staff/Admin-only, assignee=me, mapped filters, pageSize 10/25/50, createdAt ASC,id ASC; Back to Dashboard retains base filters. | P, D-15, D-19 | AC-44 |

## 8. Acceptance criteria

Every row is Given–When–Then. Test IDs and concrete paths are in [tests](tests.md); all are Planned. “Then” with D IDs describes the student-accepted design outcome, not a handout mandate or completed implementation. Formal contract peer review is complete for the reviewed HEAD.

| ID | Given | When | Then | Accepted decisions | Planned tests |
| --- | --- | --- | --- | --- | --- |
| AC-01 | Missing/expired/inactive/password-gated session or invalid Origin/CSRF | New action/dashboard API is requested | L 401/403 and safe envelope; no mutation | D-18 | T-01 |
| AC-02 | Two Requesters and own/other/missing Tickets | Lists/details/dashboard/replayed receipt are read | Only owned actions; other/missing 404; no private fields/cache reuse | D-08, D-13, D-15 | T-02 |
| AC-03 | Requester, Staff and Admin sessions | Each action operation is attempted | Requester read-only; Staff/Admin operate under guards | D-02, D-04, D-09 | T-03 |
| AC-04 | Editable Ticket and valid action input | Staff creates an Action | Exactly one PLANNED row, fields/creator/time server-derived, same Ticket | D-02, D-03, D-04, D-07, D-16 | T-04 |
| AC-05 | Boundary/unknown/spoofed/plain-text/follow-up/Attachment Notes input | Create/edit validates | Exact field errors 400; inert text; no unsupported relation/actor/date field | D-04, D-06, D-18 | T-05 |
| AC-06 | Owner A, creator B, assignee C, completing actor D | Action is created/reassigned/completed | Distinct identities retained; active eligible target accepted | D-03, D-04, D-11 | T-06 |
| AC-07 | Inactive/Requester/missing assignee or concurrent demotion | Create/reassign commits | Validation/conflict rejects safely; no ineligible committed open assignment | D-11, D-12 | T-07 |
| AC-08 | Nonterminal Action with current version | Content or assignment is edited | Only approved fields change, immutable identity/time retained, history/version/time advance | D-04, D-07, D-08, D-12 | T-08 |
| AC-09 | Each Action state and every target state | Status is requested | Only full matrix edges succeed; same/forbidden edges conflict | D-02, D-09 | T-09 |
| AC-10 | IN_PROGRESS Action with follow-up=true and note | Completion is confirmed with result | Completes, auto performer/time; missing result/confirmation rejected; follow-up need not be false | D-03, D-04, D-06 | T-10 |
| AC-11 | PLANNED/IN_PROGRESS Action | Cancellation with and without valid reason/confirmation is requested | Valid cancellation records reason/time; invalid input rejected without partial change | D-02, D-04, D-08 | T-11 |
| AC-12 | Each frozen Ticket or terminal Action | Any new action write is attempted | 409 documented terminal/frozen conflict; retained readable history | D-08, D-09 | T-12 |
| AC-13 | Existing action/history and prior Comments/Notes/status history | Material action writes succeed or a transaction fails | One new immutable event on success; full rollback on failure; earlier rows unchanged | D-08, D-12, D-13 | T-13 |
| AC-14 | Concurrent/retried identical key and changed payload reuse | Any new action write is submitted | One mutation/event/receipt; 201 initial create/200 replay; changed reuse 409; current auth enforced | D-13 | T-14, T-41 |
| AC-15 | Two editors or stale parent/action tokens | Mutation is submitted | One compatible commit; stale attempt 409 without overwrite | D-07, D-12 | T-15 |
| AC-16 | Action create/edit/assignment competes with resolve/close | Both transaction orders and retry exhaustion are exercised | No resolved/closed Ticket with unfinished actions, no partial audit; L retry policy retained | D-05, D-09, D-12 | T-16, T-42 |
| AC-17 | All eight Ticket statuses, null/eligible/ineligible owners and roles | Every status target is requested | Exactly L matrix; confirmation/owner checks; unchanged-state conflict; terminal states retained | D-01, D-05, D-20 | T-17 |
| AC-18 | Eligible resolve/close target with PLANNED/IN_PROGRESS child | UI and direct API attempt transition | Backend 409 ACTIONS_OUTSTANDING, no history/state change | D-05 | T-18 |
| AC-19 | Zero actions, all cancelled, or completed follow-up action | Otherwise-valid Ticket resolve/close occurs | Student-accepted gate passes; no fabricated completion/workCycle and L guards still apply | D-05, D-06 | T-19, T-43 |
| AC-20 | Owned eligible Ticket or RESOLVED Ticket | Requester indicates or Staff reopens | Indication remains advisory; only RESOLVED→REOPENED; paired indication fields clear | D-01, D-05 | T-20 |
| AC-21 | Ticket with mixed action states | Ticket cancel competes with action mutation | Atomic reason-bearing cascade for unfinished actions only; audit/versions consistent | D-10, D-12 | T-21, T-44 |
| AC-22 | Users with open/terminal action assignments and Ticket ownership | Admin role/deactivation edit races assignment | Open assignment blocks demotion/deactivation; terminal refs preserved; L admin safeguards/revocation intact | D-11, D-12 | T-22, T-45 |
| AC-23 | Two Requesters and diverse statuses | Own dashboard metrics are requested | Only owned outstanding/attention counts; database predicate agrees | D-14, D-15 | T-23 |
| AC-24 | Resolved/reopened/closed Tickets, repeated/missing resolution history | Recent widgets are requested | Distinct current resolved/closed Tickets and exact updated/resolved dates; no invented history | D-07, D-14 | T-24 |
| AC-25 | Assigned/unassigned/terminal/legacy Tickets with divergent priorities | Staff/Admin dashboard is requested | All status bins, active owner/IT-priority metrics equal database calculations | D-14, D-15 | T-25 |
| AC-26 | Current actor is creator/performer/owner but not assignee on some actions | Staff Actions widget loads/drills down | Only assignee=current user; exact four bins/open count/stable list | D-03, D-14, D-15 | T-26 |
| AC-27 | Equal times and UTC/local midnight/month/year/leap-day boundary fixtures | Dashboards/list pages calculate/order | Seven local days, half-open bounds/asOf cap and stable ties with no duplicate page rows | D-07, D-14 | T-27 |
| AC-28 | Combined filters, conflicting widget predicates and a concurrent writer | Widgets drill into lists | Same effective predicates/snapshot contract and authorized rows; unknown/repeated filters 400 | D-15, D-18 | T-28, T-46 |
| AC-29 | No owned Tickets, no matching filters or no current-user actions | Dashboard/list loads | Zero/[] and correct empty/no-results state, no misleading error-zero substitution | D-14, D-15 | T-29 |
| AC-30 | Populated Lab 3 snapshot and clean schema | Additive Lab 4 migration is applied on test copies | All historical data/IDs/times/content remain; legacy zero actions/nullable owners stay valid | D-16 | T-30 |
| AC-31 | Verified backup, constraints and representative query fixtures | Recovery rehearsal/index inspection occurs on disposable copies | Restorable data, valid RESTRICT/unique constraints and explained intended index use | D-16 | T-31 |
| AC-32 | Clean fixture DB, seeded DB and interrupted run | Seed runs repeatedly | Stable realistic zero/one/many actions/status/priority/ownership fixtures; no duplicate events/keys | D-17 | T-32 |
| AC-33 | Seeded users/references/Tickets/actions have operational edits | Seed repeats twice | Names/roles/isActive/passwords/assignments/status/content/times/history and unrelated rows unchanged | D-17 | T-33 |
| AC-34 | DB/storage fault or malformed/conflicting request | New APIs fail | Correct 400/401/403/404/409/429/500/503 as applicable; sanitized errors; no partial write/receipt | D-12, D-13, D-18 | T-34 |
| AC-35 | Each role and password-change gate | Login/nav/direct route is used | Student-accepted dashboard home, old routes work, unauthorized controls/routes blocked, caches cleared | D-19 | T-35 |
| AC-36 | Loading/no data/validation/network loss/stale mutation | Action/dashboard interaction repeats | Busy prevention, preserved input, same retry key, explicit conflict refresh and honest states | D-13, D-19 | T-36 |
| AC-37 | Desktop/tablet/mobile and all new/earlier major screens | Responsive/style review runs | Zen Green common tokens, no horizontal overflow, usable tables/cards/forms | D-19 | T-37 |
| AC-38 | Keyboard/screen-reader semantics and genuine 200% browser zoom | Controls/dialogs/errors/charts are used | Labels, focus trap/return, announcements, noncolor statuses and readable reflow meet L checklist | D-19 | T-38 |
| AC-39 | Attachment Notes mention a removed/other Ticket file or script text | Requester reads action and follows attachment UI | Notes inert; no automatic binary link/leak; L attachment ownership/content rules unchanged | D-04 | T-39 |
| AC-40 | Complete draft/approved baseline and eventual integrated increment | Documentation review, regression and performance smoke are scheduled | All ACs traced, decisions/review honest, Labs 1–3 preserved except approved change; results/evidence required before DoD | D-01–D-20 | T-40, T-47, T-48 |
| AC-41 | Create false/true and existing true/false actions with notes | Create or partial edit supplies omitted/null/empty/nonempty note and UI clears a note | False create normalizes empty absence, rejects nonempty 400; merged edits retain omissions, true→false requires explicit null after confirmation; true requires valid note; rejection changes no rows/time/version/history/receipt and successful clear preserves before note | D-04, D-06, D-08, D-12, D-13, D-18 | T-49, T-50 |
| AC-42 | Same actor/key races on same/different Tickets or identified receipt-key conflict | Cooperating gated writes or defensive constraint recovery completes | Gate gives one winning mutation; same original operation/target/input 200 replay, changed target/input/operation 409; unique conflict rolls back before one fresh authorized receipt read, no mutation retry; no partial/duplicate history/failed receipt, generic 40001 budget≤3 | D-12, D-13 | T-51, T-52 |
| AC-43 | Allowed/forbidden/stale/gated status edges, existing history and present/absent/invalid reasons | Staff/Admin submits status changes | Every success stores validated trimmed reason (omitted/null=null, noncancel blank=""); cancellation mandatory; invalid 400 or rejected 409 has no new history; old rows unchanged/no backfill | D-05, D-20 | T-53 |
| AC-44 | Staff/Admin/Requester, dashboard base filters and action status bins | View my actions, direct /staff/actions, page/filter/detail and Back to Dashboard are used | Guarded route maps to API-07 with assignee=me, AND parent/status filters, 10/25/50 paging, createdAt ASC,id ASC; unknown/repeated filters rejected; return preserves base filters, no other-assignee leak | D-03, D-14, D-15, D-18, D-19 | T-54 |
| AC-45 | Each action write including mixed content/reassign and Ticket cancellation cascade | ActionHistory is read by authorized Requester/Staff/Admin | Exact events and full snapshots/null rules from section 9, one per material version, retained old note/actor, cascade link; safe projected fields only, rollback/replay/rejection produces no duplicate event | D-02, D-03, D-04, D-07, D-08, D-10, D-12, D-13, D-16, D-18 | T-55 |

## 9. Data, migration, indexes, recovery and seeds

Defined by student-accepted D-16: Action stores integer id/ticketId/createdById/assigneeId/nullable performedById; description/result/follow-up fields/attachmentNotes; state; actionAt/createdAt/updatedAt/completedAt/cancelledAt/cancellationReason; version initially 1. ActionHistory stores immutable actionId/actorId/event/time/before/after/actionVersion and nullable sourceTicketStatusHistoryId with RESTRICT historical FK; only cascade sets it and verifies the linked event belongs to the same Ticket. MutationReceipt stores actorId/clientMutationId/operation/targets/input fingerprint/safe response/time. Fingerprint must use canonical initial input and include operation/target/tokens, not current editable fields; never store session/password material. SeedFixture stores unique fixtureKey and exactly one typed nullable FK among User/Category/RelatedSystem/Ticket/Action, with a check constraint for one target and RESTRICT references. Implemented physical models and additive SQL are `server/prisma/schema.prisma` and `server/prisma/migrations/20261006000000_lab4_action_foundation/migration.sql`; evidence is separate from the accepted data contract. Same-Ticket cascade validation and actual Ticket cancellation remain #46 obligations.

### ActionHistory events and safe snapshots

Defined by student-accepted D-02/D-03/D-04/D-07/D-08/D-10/D-12/D-13/D-16/D-18; AC-45/T-55. Every event has `{id,actionId,actor:{id,name},event,createdAt,actionVersion,sourceTicketStatusHistoryId,before,after}`. Actor ID is immutable; display name comes from the historical User reference, not a permanently frozen name. Event time is a backend UTC transition instant; actionVersion is the committed after.version. No client-supplied event/time/actor. The only event values are:

| Event | Trigger | before / after rules | Actor / source link |
| --- | --- | --- | --- |
| ACTION_CREATED | Successful create | before=null; after=full initial PLANNED snapshot, version=1 | Authenticated creator; sourceTicketStatusHistoryId=null |
| ACTION_EDITED | Material content-only edit, assignee unchanged | Full before version n and after n+1; immutable fields/status unchanged, includes old/new follow-up notes | Authenticated editor; source=null |
| ACTION_REASSIGNED | Assignee changes, including simultaneous content edit | Full before/after n→n+1; one event contains both worker/content changes, not a second edit event | Authenticated reassigner; source=null |
| ACTION_STARTED | PLANNED→IN_PROGRESS | Full before/after n→n+1; performer/completedAt/cancelledAt/reason still null | Authenticated starter; source=null |
| ACTION_COMPLETED | IN_PROGRESS→COMPLETED | Full before/after n→n+1; after result nonempty, performedById=actorId, completedAt=transition instant, cancelledAt/reason null | Authenticated completer; source=null |
| ACTION_CANCELLED | Explicit cancellation from PLANNED/IN_PROGRESS | Full before/after n→n+1; after cancelledAt=transition instant/reason nonempty; performer/completedAt null; content/result/follow-up retained | Authenticated canceller; source=null |
| ACTION_CANCELLED_BY_TICKET | Ticket cancellation cascade of each unfinished Action | Same cancellation snapshot rules; exact Ticket reason; completed/cancelled children have no new event | Ticket cancellation actor; source=the new TicketStatusHistory.id in the same transaction |

“source=null” always means the explicit envelope key sourceTicketStatusHistoryId=null. Cascade uses a real linked event, not an invented ID or history backfill. For all events except creation, before and after are non-null **full** snapshots, not sparse diffs. Snapshot keys are exactly: `id`, `ticketId`, `createdById`, `assigneeId`, `performedById`, `status`, `description`, `result`, `followUpRequired`, `followUpNote`, `attachmentNotes`, `actionAt`, `createdAt`, `updatedAt`, `completedAt`, `cancelledAt`, `cancellationReason`, `version`. No keys omitted. Nullable values use explicit JSON null, never missing keys/undefined; required IDs/text/status/boolean/times/version are non-null. result/attachmentNotes may be null; followUpNote is null iff false, otherwise valid text. PLANNED/IN_PROGRESS have performedById/completedAt/cancelledAt/cancellationReason=null. COMPLETED has performer/completion time/nonempty result and null cancellation fields. CANCELLED has cancellation time/reason and null performer/completion time, but may retain a draft result. Original createdById/ticketId/actionAt/createdAt never change. Material events advance version/updatedAt; no-op, rejection, rollback and idempotent replay append no event.

This exact allowlist is also the **requester-safe projection** for an owned Ticket, including historical before notes; Staff/Admin use the same action-history shape. No email/role credentials, Internal Notes, attachment storage keys/URLs, receipt input/fingerprint, session or raw Prisma relations. Safe creator/assignee/performer names remain in Action detail; snapshot IDs and immutable actor ID preserve distinct attribution. UI renders null as explicit absence and all text literally. Cleared notes survive in before, with no history-edit API.

### Migration, recovery and seed plan

Two justified DB decisions: (1) normalized Action with RESTRICT User/Ticket FKs preserves distinct historical identity without copying role invariants; (2) composite indexes support scoped action lists/current-user unfinished work and gate counts without loading all rows. Student-accepted planned indexes: Action(ticketId,createdAt,id), Action(ticketId,status), Action(assigneeId,status,createdAt,id), ActionHistory(actionId,createdAt,id), unique ActionHistory(actionId,actionVersion), unique MutationReceipt(actorId,clientMutationId); check existing Ticket/TicketStatusHistory indexes before proposing additions for dashboard status/owner/updatedAt and transition-to-resolved queries. Confirm real query plans in a representative disposable fixture; do not assert index performance without evidence.

Migration plan: inventory/count/checksum relevant historical columns and credential mappings on a backed-up copy; verify known enums/IDs/null owners; add tables/enum/FKs/constraints/indexes transactionally where supported; never truncate/reset/remap current statuses or fabricate actions; apply to clean DB and populated Lab 3 copies; compare pre/post users/passwords/sessions/Tickets/attachments/comments/notes/status histories/reference activation and content; verify legacy zero-action gate/dashboard behavior. Existing migrations stay immutable. Invalid assumptions fail before mutation. No actual migration is performed by #41.

Recovery plan: back up PostgreSQL and existing attachment metadata/binaries consistently before release; test restore to isolated instance and row/credential/content comparisons; retain application-compatible old schema where additive migration fails; use documented forward repair after successful writes. Do not drop new tables containing operational actions to “roll back”; any destructive recovery requires a separate authorized procedure. SDS daily backups/7-day retention informs later deployment runbook, not an already executed service. No credentials or private data in artifacts.

Seed plan (D-17): stable UUID fixture submission keys for Tickets, stable action mutation keys and registry fixtureKey→typed FK mappings for users/references/actions; create-only existing references/users; no resets to activation/role/name/email/password/mustChangePassword. Existing fixture matching cannot depend solely on editable text. On clean DB create registry with fixtures; on populated baseline bind verified existing identities once. If legacy identity is ambiguous after name/email edits, report/skip until an explicit reviewed mapping exists; never create a second original-email user as a guess. Create missing action fixtures using supported domain invariants, not fake actor attribution. If a registered user's current role/activation or existing parent status makes a missing dependent fixture illegal, skip/report that fixture and preserve the operational edit; the complete demonstration cohort is guaranteed only on a clean isolated seed. Include each Ticket status/priority, owned/unassigned, zero/one/multiple Actions, all four action states, current-user/delegated assignments and empty/nonempty dashboard cohorts. Avoid creating unfinished Actions on frozen Tickets. Seed transaction/rerun must not duplicate history/receipts/number sequences; do not advance timestamps of existing entries. Test interruption then rerun, and edit every operational field then seed twice. The earlier overwriting seed was historical conflict C-09. Issue #44 now implements create-only registered seeding; actual preservation/rollback evidence is recorded in tests section 5.

## 10. Eight-work-item plan and dependencies

| Order | Work item | Confirmed Issue | Depends on | Current boundary |
| --- | --- | --- | --- | --- |
| 1 | Engineering Contract | [#41](https://github.com/chaproi/toktickit/issues/41) | Sources, decisions, contract review | Completed administration; #42/#43 merged; historical approval retained |
| 2 | Actions Taken Backend, including migration/seed/API | [#44](https://github.com/chaproi/toktickit/issues/44) | #41 | Backend reviewed and merged through PR #51; Issue #44 Closed — Completed |
| 3 | Actions Taken UI | [#45](https://github.com/chaproi/toktickit/issues/45) | #41, #44 | Action controls, Requester views, clear-note confirmation and /staff/actions implemented; domain evidence recorded; UI peer review Pending; Dashboard navigation shared with #47/#48 |
| 4 | Ticket Workflow | [#46](https://github.com/chaproi/toktickit/issues/46) | #41, #44; coordinate #45 | Resolve/close gates, cancellation cascade/races, matrix UI and D-20 reasons without backfill |
| 5 | Requester Dashboard | [#47](https://github.com/chaproi/toktickit/issues/47) | #41, #44, #46 query/event semantics | Owned aggregate API/UI, dates and equivalent drill-down |
| 6 | IT Staff Dashboard | [#48](https://github.com/chaproi/toktickit/issues/48) | #41, #44, #46; shared components with #47 | Staff aggregates/current-user widgets/API/UI; consumes API-07 |
| 7 | Final Hardening | [#49](https://github.com/chaproi/toktickit/issues/49) | #44–#48 | Integrated regression, races, performance, responsive/accessibility and actual evidence |
| 8 | Release Integration and submission report | [#50](https://github.com/chaproi/toktickit/issues/50) | #49, implementation reviews and required green checks | Reviewed feature→lab4-staging→main integration and Parts 1–9 PDF/evidence |

The original unnumbered plan remains in approved baseline `d4560d73819cb193c7b9c73c67402a6134cc8c57`. #44–#50 are actual Issues, not invented numbers. This task creates/edits no GitHub Issue. Original work-item boundaries/dependencies remain; final integration waits for all required work. Live #44 is Closed — Completed following reviewed PR #51. #45 remains open; its original To Do wording and contract-baseline links are historical administration metadata, not proof that the UI contribution is absent. This publication does not edit Issue checklists or declare shared integration complete.

## 11. Product Definition of Done

- [x] Student acceptance of D-01–D-20 and conflict choices is recorded; actual dated formal contract review/approval is evidenced by cottonlnwza's APPROVED review of fec388a3c2ab63cabb1bf20f3fa913fb023d9241 on 2026-10-04 18:31:01 Asia/Bangkok. See [completed peer review](reviewer.md#completed-peer-review); this completes only the contract-review item, not approval of the new metadata change.
- [ ] All H fields, assignment/lifecycle/complete/cancel/inactive rejection and current-user Actions are implemented under approved decisions.
- [ ] Every approved FR/BR/AC maps to implemented tests with actual results; all eight status edges/forbidden edges and direct backend gates verified.
- [ ] Data-preserving migration, legacy zero actions, recovery rehearsal and operational-edit non-destructive reseed demonstrated on isolated databases.
- [ ] Auth/ownership/private Notes/attachments/session/user administration and full Labs 1–3 regression pass; concurrent/duplicate/failure cases have evidence.
- [ ] Both dashboards match database formulas and equivalent drill-down, boundaries, stable ordering, empty/error states and scoped data.
- [ ] Zen Green desktop/tablet/mobile plus genuine 200% zoom/keyboard/accessibility evidence captured; no console errors/broken links/placeholders.
- [ ] Required checks and meaningful performance smoke recorded with environment, fixtures, measurements and limitations; no fabricated passing results.
- [ ] README/setup/migration/seed/test/demo guidance updated in a later authorized implementation issue; no secrets in artifacts.
- [ ] Actual peer review, feature/staging/main integration and one PDF with Answer Part 1–9 and working evidence links completed by release issue.
- [ ] AI prompts/activities truthful and student reflection written by the student; final authoritative main linked only after integration.

Companion contracts: [planned tests](tests.md), [UI](ui-spec.md), [API](api-spec.md), [review record](reviewer.md), [actual AI use](ai-use.md).

## 12. Issue #44 implementation evidence and handoffs

Implementation baseline: `d4560d73819cb193c7b9c73c67402a6134cc8c57` (approved contract integration). Previously verified implementation HEAD: [30bc657163ddc677f851c92f1054ae2340152f1b](https://github.com/chaproi/toktickit/commit/30bc657163ddc677f851c92f1054ae2340152f1b), branch `feat/44-actions-taken-backend`, aligned with origin at the earlier #44 documentation preflight. Original Lab 3 drafting baseline `64ff04ea8fb1395f569c1095aea556ee6a695ebd` and reviewed contract SHA remain historical evidence.

#44 supplies additive Action/ActionHistory/MutationReceipt/SeedFixture structure, create-only seeding, API-01–API-07, pure validation, safe DTO/history/receipt projections, Administrator assignment guards, optimistic tokens, ordered eligibility gates, confirmed-40001 retries and rollback-first receipt recovery. [Actual backend paths/coverage](tests.md#5-issue-44-backend-evidence-and-current-traceability) distinguish evidenced server assertions from shared obligations; [review record](reviewer.md#6-issue-44-implementation-review-and-evidence) records actual backend approval/merge; Issue #45 implementation peer review remains Pending.

Text-bound clarification under unchanged D-04/BR-06: Action bounds count **Unicode code points**, matching PostgreSQL `char_length`, after existing trimming. Description 5–2000; non-null result/required follow-up note 1–2000; Attachment Notes nullable/trimmed-empty→null, maximum 2000; cancellation reason 5–500. Supplementary characters count once, combining marks separately; no grapheme counting, NFC normalization or literal-text rewrite. No numeric bound or D-20 Ticket reason rule changed.

Previously executed evidence, **not rerun here**: on 2026-10-09 Asia/Bangkok the affected suites passed 726/726 (527 validation + 199 Action API), full server passed 65 files / 1,513 executed and passed, and build passed. Unicode RED `21efa6498ca6ae4111dfe1c51b73605ff8ba3a0b` reached 29 semantic failures (19 unit/10 HTTP), with all 648 prior cases passing; GREEN `30bc657163ddc677f851c92f1054ae2340152f1b` corrected only code-point counting. Short-text 400/fields/preservation and formerly unreached maxima persistence/DTO/history/receipt assertions now pass. Nine fresh completion/cancellation requests against constructed RESOLVED/CLOSED/CANCELLED parents passed frozen 409 preservation; these fixtures do not prove #46 transitions.

#45 consumes ActionDTO/History/API-07 and records implemented controls, confirmation, scoped reads, recovery and domain browser evidence in section 13. Dashboard navigation still requires #47/#48 coordination. #46 consumes `toActionSnapshot`, safe history projection, source TicketStatusHistory FK/event enum and User→Ticket→Action protocol; it must implement same-Ticket source validation, actual cascade/gates/races and D-20 storage. No completed cascade is claimed from primitives. #47/#48 own API-08/API-09 aggregates, snapshot/date formulas and Dashboard/list equivalence; API-07 filters alone do not prove widgets. #49/#50 retain integration/performance/visual/review/release evidence. All 20 decisions and all 11 Product DoD check states remain unchanged.

## 13. Issue #45 implemented UI contribution and review boundary

UI baseline: [57667b2e115779141b1310ef131562a97abf912e](https://github.com/chaproi/toktickit/commit/57667b2e115779141b1310ef131562a97abf912e), the reviewed PR #51 staging merge. Pre-publication implementation/evidence HEAD: [9e81523ea7f0aaab0cd00bab911dd8a04f20b4bb](https://github.com/chaproi/toktickit/commit/9e81523ea7f0aaab0cd00bab911dd8a04f20b4bb), branch `feat/45-actions-taken-ui`. [Ordered UI history](reviewer.md#7-issue-45-ui-review-package) separates RED, readiness corrections, GREEN and immediately passing verification. This documentation task changes only the six contracts and executes no application checks.

The UI contribution implements shared public Actions list/detail/history on Requester and Staff/Admin Ticket details, distinct Owner/Created by/Assigned to/Performed by labels, literal text and read-only Requester controls; real create/edit/reassign/start/complete/cancel dialogs; eligible-worker selection, Unicode code-point feedback, explicit follow-up clearing, optimistic tokens and mutation keys. Active eligible Staff/Admin need not be Owner or assignee (unchanged D-03/D-04); completion records the actual actor. Frozen-parent and terminal eligibility remain separate from public history readability. Lost-response retry retains the original command; stale/eligibility/frozen recovery preserves drafts and requires explicit review/reselection. Confirmed save with failed refresh is not reported as a failed mutation.

`/staff/actions` implements API-07 actor-scoped reads, approved intersecting URL filters, safe invalid-query handling, authoritative pagination/page correction, selected-Action detail focus and known Back-to-Dashboard URL reconstruction. It does not implement Dashboard metrics. Source/test links, partial AC/T coverage and previously executed results are in [tests section 6](tests.md#6-issue-45-ui-evidence-and-current-traceability); [UI section 8](ui-spec.md#8-implemented-actions-ui-and-domain-verification) records interaction behavior and [inspected evidence](../../artifacts/lab-04/screenshots/actions-taken/evidence.md) records viewport/zoom/contrast limitations.

Prior checks: 83 targeted component cases passed; full client 20 files/258 passed and TypeScript/Vite build passed; four real browser/API/PostgreSQL workflows passed; latest combined workflow/responsive/accessibility contribution 10/10. The successful browser run used test-commit HEAD `5e77f1baaa2c8191f4a69d6ba67e93a6f5b9dbea` with pending production corrections subsequently committed unchanged as `edb378d07685b343bee729f1432894d1423cf793`. This is **not** a post-commit or exact-final-HEAD rerun. Component fetch simulations, injected browser transport faults and constructed history/frozen fixtures are labelled separately from real database workflows.

**Incomplete shared navigation: AC-35/T-35.** `roleHome` still returns `/tickets`, `/staff/tickets` and `/admin/users`. Dashboard role landing, active navigation and a working Dashboard return screen require #47/#48 coordination with #45; only return URL reconstruction is tested. #46 retains Ticket workflow/cascade/D-20. Comprehensive earlier-screen, cross-browser/screen-reader, performance and final integrated checks remain #49; release/submission remains #50. Issue #45 and its implementation peer review remain open/Pending. No accepted decision, requirement, scenario status or Product DoD checkbox is promoted by this domain evidence.
