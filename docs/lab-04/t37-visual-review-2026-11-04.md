# T-37: current screenshot review, 4 November 2026

All **92 supplied PNGs were visually reviewed by ChatGPT/Codex AI**. No clearly blocking visual defect was identified in their captured pixels. One minor spacing observation and explicit coverage gaps are retained below. **This is not human visual sign-off, a full T-37 pass or PR approval.** Human visual observation/acceptance, actual T-38 screen-reader/additional-browser observation and T-47 acceptance remain Pending.

## Provenance and scope

Capture source: `2671b3a2374bb10fe2cbaae50d6b844c66e7f0e4`. Candidate compared: `8e259ce2b8222d733c34f8bdfda756c40a139593`. Review date: 4 November 2026, Asia/Bangkok. The uploaded ZIP SHA256 is `d5e2643119c2ea2cc333bdaaf73c18f2c6fda44a49657593abba79664d074d8b`. Its 166 files comprise **92 PNGs + 73 JSON artifacts matching all 165 published fresh SHA256 values**, plus the separately classified Playwright last-run record. That record reports passed/no failed IDs; it adds no executed case or independent verification.

The original [capture/preservation manifest](../../artifacts/lab-04/hardening/candidate-review-2026-11-04/artifact-preservation.json) remains unchanged, including its then-uninspected status. Every supplied original PNG/JSON is copied byte-for-byte under a **new evidence prefix**, so historical restored captures and their metadata are not overwritten. All 73 metadata files identify the capture source above. The 304 non-document/non-artifact blobs at the compared candidate match both the capture source and `84ef0ad91502a0c660998ddc13d0c7a163f1a169`. This carries provenance; it does not claim fresh execution at this documentation HEAD.

[Open all 92 originals and per-image observations](../../artifacts/lab-04/hardening/t37-visual-review-2026-11-04/gallery.md) · [Machine-readable hashes, source comparisons, coverage and observations](../../artifacts/lab-04/hardening/t37-visual-review-2026-11-04/review.json).

## Visual observations

Review examined captured clipping, wrapping, reading order, text/control separation and visible focus appearance. Long unbroken strings, multilingual names, Thai/emoji, literal markup, attachment filenames/reasons, desktop/tablet/mobile layouts and genuine-tab-zoom captures were included where present. Full-page Staff Dashboard images V68–V70 were checked through the final View my actions link. Component/viewport captures were treated as partial regions.

| Surface | Reviewed IDs | Actual coverage qualification |
| --- | --- | --- |
| Lab 2 forms, My Tickets, detail/attachments and safe states | V01–V15 | Login appears under historical requester-selection filename V09. Full-page mobile/tablet captures are Ticket detail, not every inherited screen. |
| Lab 3 Requester/Staff detail, Queue and Admin | V16–V27 | Desktop/mobile/tablet viewport captures are often scrolled. Login/password PNG matrix is not included in this fresh archive. |
| Actions, My Actions, dialogs/history and zoom/focus/error | V28–V50 | Three normal-zoom Create PNGs and mobile clear-confirmation PNG are referenced by metadata but absent. V44/V47 show Create validation/200% states, not those missing states. |
| Role navigation and Requester Dashboard | V51–V67 | Desktop/mobile/tablet and zoom/error/focus regions; three filter images are component crops, not full-screen captures. |
| Staff Dashboard and focused/error/zoom states | V68–V78 | V68–V70 reviewed as complete long pages; other captures are selected regions. |
| Ticket workflow dialogs, history, blocker/validation/zoom | V79–V92 | Dialog text, wrapping and focus appearance observed; actual speech/focus trapping not established by screenshots. |

**OBS-01 — minor spacing/readability observation, V48:** at 200% Action History, the event-count text and the following “History events per page” label appear joined as `eventsHistory`. Text, page-size selector, Previous/Next and Close remain visible; no blocked control or overlapping text was demonstrated. This is recorded for human disposition, not silently discarded or used to assert acceptance. No production correction was made from this evidence-only review.

**Table/modal capture limits:** V27 shows the right-hand part of the tablet Queue table, with left columns outside the table window. The reviewed [Lab 3 source](../../e2e/lab-03/responsive.spec.ts) scrolls each required control into view, checks clipping/hit testing, then takes a viewport screenshot after the final Queue action. That explains why a capture may show a shifted table; this source reading and the carried E2E result are separate from direct visual evidence of live access. V31/V36/V40 show only the upper part of long History content; V48 shows its bottom/Close at 200%. [Action geometry/reachability helpers](../../e2e/lab-04/action-layout-helpers.ts) provide separately carried checks. None of this is a newly executed browser check or human keyboard observation.

## Missing coverage retained

69 JSONs name a screenshot: **65 named PNGs are present; four are absent**. The remaining 27 supplied PNGs have no matching screenshot reference in these JSONs. Four additional JSONs contain aggregate evidence without a `screenshot` field. All 73 JSONs remain original and hash-matched.

| Referenced PNG absent from uploaded archive | What remains unobserved |
| --- | --- |
| `artifacts/lab-04/screenshots/actions-taken/1440x900-create.png` | Actual pixels of this normal-zoom Create/clear-confirmation state; metadata alone is not visual evidence. |
| `artifacts/lab-04/screenshots/actions-taken/390x844-clear-confirmation.png` | Actual pixels of this normal-zoom Create/clear-confirmation state; metadata alone is not visual evidence. |
| `artifacts/lab-04/screenshots/actions-taken/390x844-create.png` | Actual pixels of this normal-zoom Create/clear-confirmation state; metadata alone is not visual evidence. |
| `artifacts/lab-04/screenshots/actions-taken/834x1112-create.png` | Actual pixels of this normal-zoom Create/clear-confirmation state; metadata alone is not visual evidence. |

The reason those PNGs are absent is not established here. They are not part of the 165-entry fresh-output archive manifest; neither a fresh capture nor equivalence to a historical PNG is inferred. The supplied archive also lacks the full Login/change-password screenshot matrix. V09 actually shows desktop Sign in despite its historical requester-selection filename. Requester/Staff detail, Queue, Admin, Dashboards, Actions and workflow regions are represented, but this is not a claim that every required screen/state/viewport is visually inspected. Reuse recoverable originals with verified provenance first; do not repeat the workload merely to obtain another passing result.

## Human checks still required

For **T-37**, the student/peer should inspect the linked originals, record their actual name/date/source and observations (including OBS-01 and any missing-screen disposition), then make the human acceptance decision. The AI review record must not be relabelled as that person's inspection. Confirm any unseen table/modal region through real interaction or adequate additional original captures. Metadata that says Pending manual inspection remains historical evidence.

For **T-38**, use the current candidate's existing guarded local test setup and record the operator, application HEAD, Windows version, actual screen-reader name/version and actual browser name/version. Observe Login/error speech, role navigation, Dashboard metrics/drill-down, filter/page labels, Action validation, dialog title/trap/return, History and busy/error/Retry announcements. Record the words actually heard and pass/fail per task; screenshots or an ARIA assertion cannot supply the speech observation. Also record representative navigation/forms/dialogs/keyboard/200% zoom in an additional supported browser. Identify the engine: another Chromium browser is an additional-browser observation, not evidence for a different engine. Unsupported/untested combinations stay explicit.

For **T-47**, retain A1/B2 complete passes and B3/A4 failures together. The B2 pass is evidence on current application bytes; B3's CREATE p95 506.970 ms and A4's aggregate p95 963.614 ms remain failures. An actual student/peer acceptance decision is still needed; no repeated benchmark, new four-of-four requirement, threshold change or automatic acceptance is introduced by screenshot review.

## Changes and verification boundary

This batch adds review evidence/original capture copies and updates current status pointers only. No production/test/configuration/dependency/benchmark changes, test execution, database/browser/screen-reader session, merge, deployment or Issue/DoD promotion occurred. There are no newly started application resources to clean up; earlier independent cleanup remains at its original provenance. Local checks verify all 165 supplied artifact hashes, all 92 uploaded Git blob IDs, 304 protected-source equivalence checks against each comparison source, JSON parsing, relative-link targets, UTF-8 and whitespace. The full publication tree is compared against the parent before moving the branch, preserving every prior artifact blob.

Student D-12/D-13 adoption is unchanged. Human amendment/implementation approval, retention/dependency limitations, unknown historical failures and ABBA telemetry limitations remain as recorded in the [closeout](hardening-closeout-2026-11-04.md). PR58 remains Draft.
