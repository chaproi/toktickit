# Lab 4: bounded closeout verification proposal

**Latest accepted staging status — 2026-11-04:** cottonlnwza [APPROVED exact HEAD4eecb5f](https://github.com/chaproi/toktickit/pull/58#pullrequestreview-5769874363); PR58 is merged into lab4-staging at `7fde762d61f25c67335269a9c768bd0dcd1f8ae5`. Both commits have identical tree `1122761f20441615b7fb472c4e45409926a9b346`. The peer accepts the D-12/D-13 candidate, Lab-level T-37/T-38 evidence, Chrome/Chromium + Edge scope and limited T-47 disposition. B2 is one complete passing observation; B3/A4 remain failed and p95<500ms is unchanged. No repeat audio session, visual recapture or repeat-until-pass benchmark is required solely to add evidence. Earlier Pending/CHANGES_REQUESTED statements below retain their historical scope and are superseded by this exact review for #49. Final main integration/checks, report/reflection, release Product DoD and submission remain #50 work; no fresh application execution or final-main pass is claimed. [Release handoff](release-handoff-2026-11-04.md).

Date: 4 November 2026 (Asia/Bangkok). Reviewed candidate: `bb16551fdf4588ad86d3782106f53b3947cde838`, PR58.

**Current status (2026-11-04): the student and cottonlnwza have accepted Chrome/Chromium + Edge scope and the limited T-47 disposition. Overall PR review is CHANGES_REQUESTED for evidence/docs closure and exact updated-HEAD re-review.** The original proposal below is retained as history, not an accepted contract amendment or a new passing result. [Actual scoped decision](t37-t38-decision-checklist.md#7-actual-student-decision--2026-11-04). The student requested a more convenient, faster route, allowing scope adjustment: “มีวิธีที่สะดวกและเร็วกว่านี้มั้ย หรือปรับขอบเขตงานก็ได้ ขอแค่ lab4 จบ”. This authorizes preparing a concrete plan; it is not an exact student/peer acceptance of the performance or observation dispositions below.

## 1. Preserve the required product

The provided SE Lab 4 handout requires Actions Taken, Ticket workflow, role dashboards, preserved Labs1–3 behavior, real regression/accessibility/visual evidence, peer review and staged integration. Section4.2 excludes production-scale cloud operations; sections8.5–8.6/10 require hardening and inherited responsive/accessibility coverage; section14 requires final-main passing test evidence and the nine-part PDF.

Retain all implemented features, role/ownership/security/data/race/replay invariants, accepted D-12/D-13 wording, AC/FR/BR identifiers, current test assertions and existing performance thresholds. [Specification](specification.md), [UI contract](ui-spec.md) and [55-scenario reconciliation](hardening-closeout-2026-11-04.md) remain authoritative until an actual reviewed amendment says otherwise. No code rollback, dependency change, new feature, expanded production-capacity study or speculative latency tuning is proposed.

The change is to organize verification by already-covered behavior and remaining evidence, rather than ask the student to repeat every automated case or answer one chat message per control. Automated semantics and real speech remain separate proof.

## 2. Concrete closeout map

| Gate | Reuse | Remaining bounded work | Actual decision |
| --- | --- | --- | --- |
| T-37 visual | [92 original PNGs and AI review](t37-visual-review-2026-11-04.md), retained geometry/zoom evidence and valid historical provenance | Human inspects a coverage-mapped gallery for every required major screen/viewport and records clipping, wrapping, readability and focus appearance in one checklist. First recover/verify the four referenced missing PNGs and absent Login/password coverage; capture only genuinely missing required states. Human decides the minor History spacing observation. | Human observation/coverage acceptance Pending; AI inspection is not relabelled as human sign-off. |
| T-38 accessibility | Existing executed component/keyboard/ARIA/contrast/genuine200% checks, source equivalence, student-reported Login observations | Three grouped task sessions below, one consolidated observation record per group; an additional supported-browser session. Reuse a shared component proof only where actual implementation/behavior is shared; cover distinct dialogs and role navigation separately. | Student/peer reviews named/browser/version/source evidence and explicit untested combinations. No automatic full-scenario pass. |
| T-47 smoke | All four unchanged ABBA runs and samples: A1/B2 pass, B3/A4 fail; B2 is on current application bytes | Review the complete mixed evidence once and make an explicit acceptance or rejection decision for the Lab configuration. No additional benchmark is implied. | Proposed disposition below requires actual student and peer agreement; otherwise Pending. |
| PR/Issue49 | Current correctness evidence and complete reconciliation | Peer reviews exact amendment/implementation plus only the new evidence/method/disposition delta against the previously reviewed HEAD. Resolve actual remaining findings and integrate into lab4-staging when approved. | No substituted peer approval or Issue closure. |
| Release/Issue50 | Approved staging work and existing report material | Reviewed integration into main, required final-main verification output, final source/checklist reconciliation and Answer Part1–9 PDF with actual student reflection. | These remain required; candidate review cannot finish the complete Lab submission by itself. |

No repeated comprehensive suite follows solely from this documentation proposal. Any code correction needs appropriate affected verification; final-main execution required by the handout still occurs at release. Previous failures and warnings are retained.

## 3. Group the actual accessibility work

**Group A — Login and shared navigation.** Finish field names/required semantics, Show password label/state and keyboard activation, Sign in button name and actual validation-summary announcement. Then observe role-appropriate navigation and active state for Requester and Staff; verify the distinct Admin navigation entry where applicable. Record actual speech, focus movement and failures together rather than one message per button.

**Group B — Dashboard/list flow.** Requester Dashboard → one metric drill-down → list filter/page/detail; Staff Dashboard → My assigned Actions → selected Action. Observe meaningful metric names/values, filter/page labels, loading/busy and a safely controlled read-error/Retry announcement for each distinct implementation pattern. Record actual inspected tasks and shared-component mapping; do not claim every browser/role/state combination from one traversal.

**Group C — Dialog/workflow/history flow.** Observe Action creation validation, a status/confirmation dialog, any distinct nested clear-confirmation behavior, history navigation and a Ticket workflow blocker/confirmation. Test focus entry/trap/return, field/error relationships, announced state and keyboard exit when allowed. Unique dialog behavior cannot be inferred solely from a different dialog's result.

**Additional browser session.** Propose the student's installed Edge alongside the currently used Chrome for the same representative navigation, form, dialog, keyboard and actual200% zoom behaviors, subject to the supported-browser scope and peer agreement. Record exact versions and observed differences. Chrome+Edge is two browsers but both Chromium-based: Firefox/WebKit/other engines are untested, not certified. If the existing/inherited agreed browser scope requires another engine, it must actually be observed or explicitly amended by the proper reviewer; this proposal does not remove it.

For each group, collect one compact record: operator/date, application HEAD and dirty state, actual browser/Windows/screen-reader versions, task/actions, words actually heard, focus/state result and defect/untested items. A short user-supplied recording can assist transcription when available; do not record real passwords or treat silence/uncertain transcription as a pass.

Subsequent [student-operated observations](student-requester-observations-2026-11-04.md) now confirm reported Login field/button names, successful login/password change, Requester reading/navigation and actual Chrome/Edge 200% views. Earlier approximate “added requie”/“scan checked” transcriptions remain uncertain. Exact summary speech, separate focus details, current source/version metadata and Staff/Action/dialog/error-pattern observations remain incomplete. These are partial human observations, not a full Login/T-38 pass or acceptance of this proposed method/browser/performance disposition.

## 4. Proposed T-47 disposition, for explicit review

Suggested decision wording:

> Accept B2 as evidence of **one complete passing T-47 observation** on the current application bytes in the recorded local Lab configuration. Retain B3's CREATE p95=506.970ms and A4's aggregate p95=963.614ms as failed observations and an explicit repeatability limitation. Do not claim all ABBA runs passed, stable capacity, a consistent code-caused performance gain, production readiness or that the failed observations meet the unchanged<500ms target. This is a proposed limited Lab acceptance decision, not a new test result or permission to hide failures.

B2's aggregate p95 was401.518ms with all18operation targets and every inline assertion passing. B3 aggregate441.080ms passed but CREATE failed; A4 aggregate failed; A1 passed. All22000samples, zero request errors/exact persistence, telemetry gaps and unknown historical causes remain at their original provenance.

**Neither the student's request for speed nor this proposal accepts that wording.** Actual student and peer disposition must be recorded against the current accepted contract; instructor clarification is needed if a mandatory assessment target would be relaxed. If the reviewers require demonstrated repeatability or reject the limited disposition, T-47 remains unresolved. Raising thresholds, deleting assertions, excluding a slow operation or reporting a failed run as passed is not proposed.

## 5. Adoption and completion boundary

This proposal adds one reviewable document. It changes no normative requirement, test, application/configuration/dependency/benchmark byte, old artifact, checklist state or PR Draft status. No application, database, browser, screen-reader or performance command ran for preparing it.

Student exact-plan decision: **not yet recorded**. Human review of method/browser scope/T-47 disposition: **Pending**. T-37/T-38/T-47 acceptance, PR58 approval, Issue49 completion and Lab4 release/submission: **Pending**.

Once actual decisions exist, update the specification/API/test/reviewer traceability only to the extent required by what was accepted, and preserve the original wording/results. The fastest supported route is a finite evidence closeout and explicit review decision; it is not an automatic promise of approval or a declaration that the Lab is already complete.

## Subsequent completion of automation and concrete decision worksheet - 2026-11-04

The old worklist above is historical. [The current checklist](t37-t38-decision-checklist.md) supersedes only its remaining-work inventory: ten supposed missing originals were located, four genuine mobile/tablet form/list gaps captured, Staff History error/Retry and Ticket blocker automated, and real Edge Admin navigation/History/200% verified. [Normal E2E confirmation](closeout-normal-e2e-2026-11-04.md) passes16files/77cases at finalized65f4bb1 while retaining the prior74/77failure and every diagnostic. No additional benchmark or repeated reported Requester traversal was used for evidence collection; the explicitly requested comprehensive command naturally includes inherited routes.

This does not accept the proposed method/browser/T-47 disposition. Specific visual/spacing, remaining speech, browser-scope, mixed-performance and actual peer-review decisions are listed as V/S/B/P/R entries for one consolidated response. Student-reported Create/clear/Start/History and Requester observations are carried, not requested again. No Pending state becomes Accepted here.

## Subsequent scoped student acceptance — 2026-11-04

After publication of `db852ac`, the student explicitly replied **“ยอมรับ”** to Chrome/Chromium + Edge as the Lab verification scope and the section4 limited T-47 disposition, both for peer review. This supersedes the earlier “not yet recorded” statements **only for those two student decisions**, not the complete proposed plan. [B-1/P-1 and exact decision context](t37-t38-decision-checklist.md#7-actual-student-decision--2026-11-04) distinguish student adoption from Pending peer acceptance. Other engines remain untested; B3/A4 remain failed; the unchanged <500ms target is not waived. No additional visual/speech report, full scenario acceptance, implementation approval, merge, Issue closure or Product DoD completion is inferred. No application check or benchmark was repeated.

## Subsequent actual peer disposition — 2026-11-04

[cottonlnwza's review](https://github.com/chaproi/toktickit/pull/58#pullrequestreview-5768109333) against `d76d0839ed26a067a9fa4634c9b47992d0da677e` accepts the browser scope and the existing section4 limited T-47 disposition. B-1/P-1 are no longer blockers; no benchmark rerun is required. This supersedes earlier peer-Pending statements **only for those decisions**. B2 remains one complete pass, B3/A4 remain failures, and the <500ms threshold is unchanged. [Current checklist and exact peer record](t37-t38-decision-checklist.md#8-actual-peer-decision--2026-11-04) retain visual/speech gaps and the overall CHANGES_REQUESTED result. Actual evidence/docs closure and exact updated-HEAD re-review are still required before merge; no full T-37/T-38, Issue49 or Product DoD acceptance is inferred.
