# Sprint 4 AI Use Record

Status: **Student decisions accepted — Pending peer review**. This log records actual assistance in this conversation for Issue #41, including student acceptance of D-01–D-20. All 55 product test scenarios remain Planned, all Product DoD items unchecked, formal peer review Pending. It does not manufacture prompts, test results, peer approval or a student's personal reflection.

## 1. Tool/model and scope

Assistant: OpenAI Codex, identified in this session as based on **GPT-6**. The exact served model variant/configuration was not independently exposed; do not infer a suffix, token usage or temperature. Tools actually used: PowerShell read-only repository inspection, Python PDF/XML/ZIP reading, PDF page/image inspection, Markdown file drafting and documentation checks. No delegated subagents used. PDF/document-reading guidance supported source inspection; no DOCX/PDF submission artifact created.

The user first authorized analysis only, then explicitly authorized drafting only the six `docs/lab-04` files. The attached documents were treated as sources, not instructions overriding that scope. No application source, historical contract, database, commit, push or PR was changed/performed. The temporary PDF reader and rendered source-page images from the earlier analysis were used for inspection, not product assets.

## 2. Actual prompt record

P-01–P-03 are preserved historical excerpts; their former Pending/Draft states describe those steps. P-04 is the actual decision-recording request, included in full below. No future prompt is represented as already used.

| Actual prompt | User excerpt and context | Actual assistance |
| --- | --- | --- |
| P-01 | “Act as the specification agent for TokTickIT Lab 4, Issue #41.” / “This step is contract analysis only. Do not modify files…” | Verified clean requested branch/baseline; read all 11 handout pages including illustrations/rubric, earlier contracts and implementation; returned Thai analysis with ambiguities, scope, proposed decisions and dependencies. No repo files changed in that analysis step. |
| P-02 | “Continue Issue #41 on feat/41-lab4-contract as the specification agent.” / “Create a reviewable Draft Sprint 4 engineering contract. This authorizes documentation drafting only.” | Reverified baseline, read supplied SDS text/tables/header/footer/architecture figure, compared sources, drafted only six Markdown contracts, and checked documentation. New decisions remain Pending; simpler gate alternatives evaluated without treating strict completion/workCycle/follow-up rules as mandates. |
| P-03 | “แก้ Draft Sprint 4 contract บน feat/41-lab4-contract จากผล review ต่อไปนี้” | Verified same branch/baseline and six existing untracked drafts; revised only those documents using seven supplied findings. Corrected rubric and new paths, follow-up partial semantics, receipt-specific recovery, D-20 recommendation, /staff/actions destination and explicit ActionHistory. Added Planned AC/test scenarios; no approval inferred. |
| P-04 | “Finalize the student decision record for TokTickIT Lab 4 Issue #41 on feat/41-lab4-contract.” | Recorded supplied student acceptance evidence for all 20 Recommended choices; updated only six document statuses/current references, preserving behaviors/alternatives/historical records. Formal peer review Pending, tests Planned, DoD unchecked; documentation checks recorded separately below. |
| P-05 (continuation) | “continue” | Continued the same authorized decision-recording task, completed preservation checks and recorded actual documentation verification; no new scope or design acceptance inferred. |

The handout requests selected AI prompts in eventual submission (6–10 examples). This record contains **four actual user task prompts and one continuation message**; it does not fabricate extras. The quoted student acceptance is supplied evidence in P-04, not invented as a separate observed task prompt. Later genuine prompts may be appended accurately; tool commands are not falsely counted as student prompts.

### P-04 actual prompt (verbatim)

```text
Finalize the student decision record for TokTickIT Lab 4 Issue #41 on feat/41-lab4-contract.

The student has explicitly accepted the Recommended option for all decisions D-01 through D-20 in the current reviewed contract.

Approval evidence:

- Student: สิริกร ฝันนิมิตร (ไทเกอร์)
- Date: 2026-10-04, Asia/Bangkok
- Actual message: “ยอมรับ Recommended ทั้ง 20 ข้อ ว่าแต่อันนี้ถูกทั้งตาม lab4 ใช่มั้ยถ้าถูกฉันยอมรับ”
- The assistant subsequently confirmed that the reviewed contract matches the Lab 4 scope and rubric. This is student design acceptance and an AI-assisted documentation review; formal peer review remains pending.

Scope:\
Modify only the six Markdown files in docs/lab-04/.\
Do not change application code, schema, migrations, seeds, tests or Lab 2–3 documents. Do not commit, push or open a PR in this step.

Tasks:

1. Record each D-01–D-20 as Accepted by student, retaining its chosen behavior, rationale and alternatives.
2. Update current document statuses consistently to “Student decisions accepted — Pending peer review”.
3. Update current references to Pending decisions or conditional recommendations to reflect the accepted design. Preserve historical drafting/check records as historical; do not globally replace their former Pending statuses.
4. In reviewer.md, record actual student acceptance and keep formal peer reviewer, peer approval and PR pending. Do not treat the assistant as a peer reviewer.
5. Append this actual prompt and decision-recording activity to ai-use.md. Do not invent student reflection or test results.
6. Keep all 55 product test scenarios Planned and all Product DoD items unchecked. The first DoD item also requires actual contract review, so student acceptance alone does not complete it.
7. Preserve the contract behavior and totals: 31 FR, 46 BR, 45 AC, 55 planned scenarios and 20 accepted decisions.
8. Check IDs, bidirectional traceability, decision references, links, tables, whitespace and six-file scope.

Return a concise summary of changed statuses, verification results and Git status. Formal peer review remains the next review gate; do not claim implementation or release readiness.
```

## 3. Actual activities and boundaries

The Drafting/P-03 entries preserve their historical states; current P-04 acceptance is recorded separately, not retroactively applied to those activities.

| Activity | Record |
| --- | --- |
| Baseline | `feat/41-lab4-contract`, clean before drafting, HEAD/local staging `64ff04ea8fb1395f569c1095aea556ee6a695ebd`; local refs only, no remote sync claim |
| Source reading | Full Lab 4 PDF text and 11 page images; full SDS DOCX body/tables/header/footer and embedded figure; all six Lab 3 documents, inherited Lab 2 contracts, README/schema/all migrations/seed/auth/authorization/Ticket/communications/attachments/users/test conventions |
| Source handling | No applicable AGENTS.md found; referenced SRS not supplied; SDS conflicts retained explicitly rather than used to silently amend approved Lab 3 |
| Drafting | specification.md, tests.md, ui-spec.md, api-spec.md, reviewer.md, ai-use.md only; Draft, Pending decisions/review, Planned tests, unchecked Product DoD |
| P-03 revision | Read current six drafts and existing validator/status service/eligibility gate read-only; used scoped Python path normalization and Markdown patches only in docs/lab-04. Verified validator trims optional noncancel reason (blank accepted) and actor gate serializes same-actor operations across Tickets. Earlier cached PDF page images were unavailable for re-view; original PDF still exists, prior full source reading retained, and this revision uses the user's exact rubric list. |
| P-04 decision recording | Verified feat/41-lab4-contract and unchanged baseline, preserved the six existing untracked documents, recorded สิริกร ฝันนิมิตร (ไทเกอร์)'s acceptance dated 2026-10-04 Asia/Bangkok using the supplied message/assistant-confirmation evidence. Each D is Accepted by student; current statuses/references updated, unchanged chosen behaviors and alternatives, historical Pending records preserved. Assistant is not formal peer reviewer. |
| Documentation verification | Results recorded below after the actual checks; not product execution or peer approval |
| Application verification | No app/unit/API/UI/E2E/performance/migration/seed/recovery test executed; all new test scenarios Planned |
| Repository actions | No commit/push/PR/merge; no edits to application code or historical contracts; no destructive database operation |

## 4. Documentation check record

The P-02/P-03 records below are preserved historical checks: “Pending”, “Draft” and “current revision” refer to their respective earlier steps. P-04 student acceptance and new author checks are recorded separately after them.

Initial P-02 draft checks performed on 2026-10-04 with read-only Python/PowerShell and Git diff checks. These are historical author checks, not the current revision totals:

| Check actually performed | Result |
| --- | --- |
| ID inventory/uniqueness/sequence and defined references | 30 FR, 42 BR, 40 AC, 48 Planned test scenarios, 20 Recommended / Pending decisions; no undefined/duplicate IDs |
| FR/BR→AC→test traceability and decision dependencies | Every FR/BR links to AC; 40/40 ACs map bidirectionally to concrete intended test paths, with dependent decision IDs; 48/48 T rows Planned. Initial missing FR-05→AC-12 guard mapping corrected, then check passed. |
| Local Markdown links and heading fragments | 72 checked, all resolve; future test/artifact paths intentionally code-formatted and not claimed existing; external sites not probed |
| Markdown table structure, UTF-8/EOF/trailing whitespace/tabs | 22 tables consistent after adding this ledger; UTF-8 without BOM, one final newline, no trailing whitespace or tabs |
| Git whitespace checks including untracked drafts | Each of six files checked with `git -c core.autocrlf=false diff --no-index --check -- NUL <file>`; no whitespace diagnostics. Exit 1 denotes content differs from NUL, not a whitespace failure. Per-command config avoids the local LF/CRLF warning without changing Git configuration. |
| Conditional content/status consistency | All 20 decisions Pending; all 40 GWT rows populated; eight planned work items with only #41 numbered; 11 Product DoD boxes unchecked; reviewer unassigned/not reviewed; simpler gate/non-mandates and inherited sortBy/counter semantics checked |
| Repository boundary/baseline | Branch/HEAD unchanged, origin matches chaproi/toktickit; no tracked/staged changes, exactly the six authorized new Markdown files |

Initial checker assumptions about table-column count/Windows output decoding and issue-number matching of CSS hex colors were corrected before the final successful checks. These were author tooling checks, not application test executions, peer review or decision approval.

### P-03 revision checks

Actual author checks for this revision used in-memory Python validators, read-only repository commands and Git whitespace checks; no application tests were run:

| Check actually performed | Revision result |
| --- | --- |
| IDs, sequences, duplicates and references | 31 FR, 46 BR, 45 AC, 55 Planned test scenarios; no undefined/duplicate IDs; all 20 decisions Recommended / Pending student decision |
| Bidirectional traceability and decision dependencies | All FR/BR have ACs; all 45 GWT ACs link to tests and all 55 T rows link back, with concrete intended lab-04 paths and dependent D IDs; no missing edge/dependency |
| Local links/anchors and tables | 75 local Markdown links/fragments resolve; final 24 tables have consistent columns (including this ledger); planned nonexistent test/artifact paths are code-formatted, external URLs not probed |
| New paths and preservation boundary | All new work paths use lab-04 in the six current drafts; old Lab 1–3 paths and requested branch names retained. Only six authorized untracked files; no tracked/staged code/schema/migration/historical-contract changes; HEAD remains 64ff04ea8fb1395f569c1095aea556ee6a695ebd on feat/41-lab4-contract |
| Rubric and revised content consistency | Nine exact rubric parts total 60; features/evidence/work items aligned; explicit follow-up cases, distinct one-read receipt recovery, normal actor-gate outcomes, proposed all-transition reasons, /staff/actions and seven history events checked across contracts |
| UTF-8/EOF/whitespace | Six files UTF-8 without BOM, one final newline, no tabs/trailing whitespace; same per-command Git no-index check against NUL has no diagnostics (exit1 is expected content difference) |
| Truthful status/evidence | All 55 tests Planned, formal reviewer/decisions Pending, all 11 Product DoD boxes unchecked; P-03 recorded as actual user feedback, not approval; no application execution/commit/push/PR |

A targeted rubric check initially mismatched a Unicode dash in PowerShell's piped Python source; the checker was corrected to use an explicit Unicode code point and passed. Initial P-02 check counts above remain labelled historical; these are current revision counts. Final checks were rerun after recording this ledger, not treated as peer approval or product acceptance.

### P-04 acceptance-recording checks

Actual author checks on 2026-10-04 used read-only Python/PowerShell/Git inspection and in-memory comparisons against the six pre-edit documents. These checks record documentation consistency, not application execution or peer approval.

| Check actually performed | Acceptance-recording result |
| --- | --- |
| IDs, sequences, duplicates and defined references | 31 FR, 46 BR, 45 AC, 55 Planned scenarios and 20 Accepted by student decisions; no duplicate, missing or undefined IDs |
| Bidirectional traceability and decision dependencies | Every FR/BR links to ACs; all 45 Given-When-Then ACs and 55 scenarios map in both directions, with concrete intended test paths and complete dependent decision references |
| Accepted behavior and alternatives preservation | Compared all 20 decision bodies, reasons and alternatives against the pre-edit documents; only acceptance metadata changed. Ticket/Action transition matrices and all nine API operation rows preserved. All 55 scenario rows preserved apart from acceptance/peer-review wording in T-17 and T-47. |
| Historical record preservation | P-01–P-03 prompt rows, Drafting/P-03 activity rows and the complete historical P-02/P-03 check records preserved verbatim; their former Pending statuses were not globally replaced |
| Current statuses and evidence | All six documents use Student decisions accepted — Pending peer review; student name/date/actual message recorded, all 20 reviewer dispositions Accepted by student. Formal peer reviewer, peer approval and PR Pending; assistant not a peer reviewer. All 55 product scenarios Planned and all 11 Product DoD items unchecked. |
| Local links, heading fragments and tables | 76 local Markdown links/fragments resolve; 25 tables have consistent columns including this ledger. Intended test/artifact paths remain code-formatted plans; external URLs not probed. |
| UTF-8, EOF and whitespace | Six files UTF-8 without BOM, one final newline, no tabs/trailing whitespace; per-file Git no-index checks against NUL produced no whitespace diagnostics (exit 1 is expected content difference) |
| Git baseline and six-file boundary | feat/41-lab4-contract at unchanged 64ff04ea8fb1395f569c1095aea556ee6a695ebd; exactly the six existing untracked docs/lab-04 Markdown files, no tracked/staged changes. No application/schema/migration/seed/test/Lab 2–3 edits, commit, push or PR. |

Documentation checks were rerun after recording this ledger. Formal peer review remains the next review gate; these checks do not establish implementation or release readiness.

## 5. Student review and reflection

Student design acceptance: **Accepted by student — D-01–D-20, Recommended option**; สิริกร ฝันนิมิตร (ไทเกอร์), 2026-10-04 Asia/Bangkok. Actual message: “ยอมรับ Recommended ทั้ง 20 ข้อ ว่าแต่อันนี้ถูกทั้งตาม lab4 ใช่มั้ยถ้าถูกฉันยอมรับ”. The current request supplies the subsequent assistant scope/rubric confirmation as AI-assisted documentation review evidence. Formal peer reviewer/approval: **Pending**; the assistant is not a peer reviewer. Personal reflection: **Not yet supplied by the student**. No feelings, lessons or independent product verification are invented. The student must supply their own reflection before submission; product tests and DoD remain incomplete.

Package: [specification](specification.md), [planned tests](tests.md), [UI](ui-spec.md), [API](api-spec.md), [pending reviewer](reviewer.md).
