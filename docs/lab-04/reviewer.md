# Sprint 4 Review Record

Status: **Student decisions accepted — Pending peer review**.

Issue #41; branch `feat/41-lab4-contract`; integration `lab4-staging`. Baseline `64ff04ea8fb1395f569c1095aea556ee6a695ebd`. Formal peer reviewer: **Pending (not assigned)**. Formal peer review date: **Pending (not performed)**. Peer approval: **Pending**. Student decision approval: **Accepted by student — D-01–D-20, Recommended option**. PR: [#42](https://github.com/chaproi/toktickit/pull/42), open for review. Contract commit `010cfb86620a53b0bdd130dd9e255c6061a9e23c` was pushed normally on 2026-10-04 Asia/Bangkok; no implementation or product acceptance claimed.

This file records actual student design acceptance and the pending formal peer gate. The assistant's scope/rubric confirmation and documentation checks are AI-assisted review, not peer approval; the assistant is not the peer reviewer. Historical Lab 2/3 approvals remain in their original documents and are not a new Lab 4 sign-off.

## 1. Review package

Read [specification](specification.md), [tests](tests.md), [UI](ui-spec.md), [API](api-spec.md), [AI use](ai-use.md), the supplied 11-page handout including pages 10–11 rubric, and the supplied SDS v1.0. D-01 through D-20 are all **Accepted by student (Recommended option)**; chosen behavior/rationale/alternatives retained. The SRS referenced by SDS was not supplied; no SRS IDs inferred. No applicable AGENTS.md found during source inventory. Application test evidence is absent; the six-document contract is published in PR #42, with this publication-evidence correction limited to three metadata documents.

### Student acceptance evidence

- Student: **สิริกร ฝันนิมิตร (ไทเกอร์)**.
- Date: **2026-10-04, Asia/Bangkok**; no time of day supplied.
- Actual message supplied in the current user request: “ยอมรับ Recommended ทั้ง 20 ข้อ ว่าแต่อันนี้ถูกทั้งตาม lab4 ใช่มั้ยถ้าถูกฉันยอมรับ”.
- The supplied evidence reports the assistant subsequently confirmed that the reviewed contract matches Lab 4 scope/rubric. This records the student's design acceptance and AI-assisted documentation review, not a formal peer sign-off.
- All D-01–D-20 individually select the Recommended option below; the same student/date/evidence applies to every row. Their full chosen behavior, rationale and alternatives remain in specification section 3. No new design alternative selected.

Student acceptance does not complete Product DoD item 1: actual dated formal contract review is also required and remains pending. All 11 Product DoD items stay unchecked, all 55 product scenarios Planned; no implementation/release readiness claimed.

## 2. Student decision record — Formal peer review pending

| Decision | Chosen Recommended behavior for peer review | Student disposition |
| --- | --- | --- |
| [D-01](specification.md#d-01) | Handout scope controls; retain approved Lab 3 behavior when SDS conflicts, with explicit conflict review. | Accepted by student (Recommended option) |
| [D-02](specification.md#d-02) | Use PLANNED, IN_PROGRESS, COMPLETED and CANCELLED with the recorded Action matrix. | Accepted by student (Recommended option) |
| [D-03](specification.md#d-03) | Separate creator, assignee and Ticket Owner; automatically record actual completer as Performed by. | Accepted by student (Recommended option) |
| [D-04](specification.md#d-04) | All active Staff/Admin share operational action access; use the recorded field bounds. | Accepted by student (Recommended option) |
| [D-05](specification.md#d-05) | Resolve/close with no unfinished Actions, including zero/all-cancelled; no minimum completion or workCycle. | Accepted by student (Recommended option) |
| [D-06](specification.md#d-06) | Follow-up is informative; final merged edits require explicit confirmed null to clear an existing note; no forced false before completion. | Accepted by student (Recommended option) |
| [D-07](specification.md#d-07) | Use automatic creation time, no backdating, and advance Ticket.updatedAt for action activity. | Accepted by student (Recommended option) |
| [D-08](specification.md#d-08) | Edit unfinished actions only; immutable history uses fixed events, full safe snapshots and explicit nulls. | Accepted by student (Recommended option) |
| [D-09](specification.md#d-09) | Freeze Action writes on RESOLVED/CLOSED/CANCELLED; retain earlier-feature rules. | Accepted by student (Recommended option) |
| [D-10](specification.md#d-10) | Ticket cancellation atomically cancels unfinished Actions; retain Staff-only formal transitions and terminal states. | Accepted by student (Recommended option) |
| [D-11](specification.md#d-11) | Block deactivation/demotion while open Actions are assigned; preserve terminal historical references. | Accepted by student (Recommended option) |
| [D-12](specification.md#d-12) | Extend existing locks/retries and Ticket timestamp token; add Action version only. | Accepted by student (Recommended option) |
| [D-13](specification.md#d-13) | Use receipts/current-auth replay and one rollback-first read for verified receipt uniqueness, separate from 40001 retries. | Accepted by student (Recommended option) |
| [D-14](specification.md#d-14) | Use exact dashboard metrics, Bangkok calendar window and assignee-based current-user Actions. | Accepted by student (Recommended option) |
| [D-15](specification.md#d-15) | Use backend snapshots, filter intersection and equivalent drill-down; later requests take fresh snapshots. | Accepted by student (Recommended option) |
| [D-16](specification.md#d-16) | Add tables/indexes without rewriting IDs/times/data; use backup/forward repair recovery. | Accepted by student (Recommended option) |
| [D-17](specification.md#d-17) | Seed creates missing fixtures through stable registry keys and preserves operational edits. | Accepted by student (Recommended option) |
| [D-18](specification.md#d-18) | Keep /api, integer IDs, HTTP400 validation, existing envelope and Strict cookies. | Accepted by student (Recommended option) |
| [D-19](specification.md#d-19) | Use dashboard landing pages and guarded /staff/actions with mapped filters, fixed order/paging and return route. | Accepted by student (Recommended option) |
| [D-20](specification.md#d-20) | Ticket Workflow stores every validated successful transition reason; cancellation mandatory, historical rows unchanged/no backfill. | Accepted by student (Recommended option) |

The evidence above records each student decision outcome and date. Any future change must record its actor/date/rationale and affected AC/T references. Formal peer reviewer/approval remains pending; student acceptance, the assistant's checks and an empty signature are not peer approval.

## 3. Reviewer checklist — all pending

- [ ] Confirm H coverage for assignment, lifecycle, complete/cancel, inactive rejection, Requester all-action visibility and Staff current-user Actions.
- [ ] Review corrected Part 1–9 features/evidence/work-item mapping (10/5/10/5/5/10/5/5/5=60); Git/Spec DD/Test DD/AI reflection are not mislabeled as standalone migration/API parts.
- [ ] Review all source conflicts C-01–C-13 and each student-accepted Recommended decision; obtain architecture exception review where SDS requires it.
- [ ] Verify no invented handout mandate for minimum completed actions, new-cycle completion, Ticket.workCycle or follow-up=false.
- [ ] Review 31 FR/46 BR/45 AC/55 Planned test scenarios, full matrices/schema/recovery/index/seed plans and bidirectional decision-linked traceability.
- [ ] Check optimistic tokens/lock order/phantom prevention/user-role races/duplicate requests and sanitized failure rollback.
- [ ] Confirm non-destructive reseed tests after operational edits and complete earlier-lab regression scope.
- [ ] Confirm responsive/accessibility, genuine zoom, planned performance smoke and all Product DoD boxes remain unchecked.
- [ ] Verify AI log records only actual prompts/activities and leaves the student's reflection to the student.
- [ ] Review eight work items with only #41 numbered; no implementation readiness or release approval before formal peer review and required evidence.
- [ ] Re-review explicit follow-up clearing and failure invariants (AC-41), bounded receipt recovery/cross-Ticket gate guarantees (AC-42), student-accepted status reasons (AC-43), /staff/actions destination (AC-44) and ActionHistory/null projection (AC-45).

Historical P-03 revision record: the user's seven findings were incorporated as **draft revisions**, not student decisions or peer approval at that step: corrected rubric/evidence mapping; new paths under lab-04; consistent follow-up partial updates; receipt-specific recovery distinct from40001 retry; changed D-20 recommendation; definite /staff/actions UI route; explicit ActionHistory event/snapshot contract. AC-41–AC-45 and T-49–T-55 were added as Planned and remain Planned. The later student acceptance is recorded separately above; formal review remains Pending.

## 4. Evidence ledger

| Activity | Actual state |
| --- | --- |
| Baseline/source comparison | Performed by authoring assistant; source inventory in specification section 1 |
| Documentation drafting | Six Draft Markdown files created for review |
| User feedback revision | Seven requested document changes incorporated only in the six authorized files; branch/baseline retained; no inferred decision approval |
| Author documentation checks | P-03 revision ID/reference/traceability/decision/link/table/whitespace/content/scope checks recorded in ai-use.md; no missing mappings or link diagnostics; not peer review or application tests |
| Product/unit/API/UI/E2E/performance/migration/seed/recovery tests | Planned; not executed |
| Student decision acceptance | D-01–D-20 Accepted by student, Recommended option; สิริกร ฝันนิมิตร (ไทเกอร์), 2026-10-04 Asia/Bangkok, actual message above |
| AI-assisted documentation review | Supplied evidence reports the assistant's Lab 4 scope/rubric confirmation; actual documentation checks recorded in ai-use.md; assistant is not a peer reviewer |
| Formal peer review / peer approval | Pending; peer reviewer/date/results not invented |
| Contract commit / push / PR | Performed on 2026-10-04 Asia/Bangkok: commit 010cfb86620a53b0bdd130dd9e255c6061a9e23c, normal push to origin/feat/41-lab4-contract, [PR #42](https://github.com/chaproi/toktickit/pull/42) targeting lab4-staging; publication is not peer approval |
| Integration / submission | Pending; no merge or submission performed |

### Publication evidence

- Publication date: **2026-10-04, Asia/Bangkok**.
- Published contract commit: [010cfb86620a53b0bdd130dd9e255c6061a9e23c](https://github.com/chaproi/toktickit/commit/010cfb86620a53b0bdd130dd9e255c6061a9e23c), message `docs(lab4): define accepted Sprint 4 engineering contract`; six contract files only.
- Normal push to `origin/feat/41-lab4-contract`; no force-push. PR: [#42 — Lab4: Define Sprint 4 engineering contract](https://github.com/chaproi/toktickit/pull/42), base `lab4-staging`, head `feat/41-lab4-contract`, open and not merged. Created via GitHub API because gh was unavailable, after confirming no existing matching PR.
- Earlier no-commit/no-push/no-PR statements describe the historical drafting and decision-recording steps. The baseline `64ff04ea8fb1395f569c1095aea556ee6a695ebd` remains the original source baseline, not the current publication HEAD.
- Formal peer review/approval remains **Pending**. All 20 decisions remain accepted; all 55 product scenarios Planned and all 11 Product DoD items unchecked. No application tests or peer approval inferred from publication.

## 5. Product acceptance

**Pending, unchecked, not implementation-ready.** Future peer findings and actual resolutions belong here once they exist. No present pass/fail assessment of unimplemented product features is asserted.
