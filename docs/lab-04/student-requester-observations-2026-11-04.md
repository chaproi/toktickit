# Student Requester observations — 4 November 2026

**Partial human observation evidence, not full T-37/T-38 or Lab 4 acceptance.** The student operated Windows Narrator and the local app, then supplied reports/screenshots in this chat. The latest screenshot confirms Microsoft Edge at actual **200%** zoom on the Outstanding Ticket list. The student reports the representative Requester route works the same as Chrome. No repetition of that already-observed route is requested solely to record this evidence.

## Observed scope

| Record | Actual observation | Limits |
| --- | --- | --- |
| M-01 | Student confirms hearing Email, Password and Sign in names; Show password name separately confirmed. Blank-submit error UI was supplied earlier. | Approximate earlier speech remains uncertain; exact required/checked/error-summary speech and automatic focus are not fully transcribed. |
| M-02 | Login/password change succeeded; screenshot shows Alex Morgan Requester Dashboard and “Password changed successfully.” | A local manual result, not a new automated pass. |
| M-03 | Student says “อ่านได้ครบ” after Chrome dashboard-filter/control names, Outstanding drilldown/list and Ticket detail reading tasks. Detail screenshots include empty Actions, comment and attachment controls. | No exact speech recording, separate focus description, explicit pagination/filter submission or populated Action interaction. |
| M-04 | Chrome screenshot explicitly shows 200%; student reports reading complete. | This was initially supplied for Edge and was correctly retained as **Chrome**, never a second-browser result. Captured region alone does not prove full-page reflow. |
| M-05 | Edge screenshot explicitly shows 200% on the Outstanding My Tickets list. After the combined keyboard/Narrator/navigation/layout/focus instructions, the student replies “ได้เหมือนกัน”. | Consolidated student report for the attempted route; no separate focus explanation, exact transcript/version or image of every visited region. |

[Machine-readable evidence and five supplied-file hashes](../../artifacts/lab-04/hardening/student-requester-observations-2026-11-04.json) distinguish reports from visible pixels. Images are retained in the student chat; unrelated personal browser UI is not newly published. Hashes do not replace image/audio inspection.

The earlier worktree screenshot identifies local application HEAD `39eb0e5bb347bcc9392ffc0ef1dcf97e0d4499cf`. HEAD/dirty state have not since been confirmed for this manual session. Exact Windows, Chrome, Edge and Narrator versions are unrecorded. Chrome and Edge are both Chromium-based; no cross-engine claim is made.

## Local setup qualification

The local app initially returned 503. A read-only application-client probe initialized Prisma but failed at LoginThrottle with **P2021**; later probe stages did not execute. Migration status then showed the Lab 3 authentication foundation and two Lab 4 migrations pending in the local application database. The student received guarded Lab 3 migration → gated remaining deploy → seed instructions. A later screenshot shows seed completion with conservative legacy-fixture skips, and a safe User query shows five existing Requesters. Alex subsequently logged in using the local migration credential mapping for User 2 and changed the initial password. No passwords, hashes or secret values are published.

Full migration output/postflight was not supplied; no independent preservation/cleanup proof is invented. Local server/browser remain intentionally active. This setup history does not change prior isolated test provenance or imply a demonstrated production correction.

## Remaining closeout

The Requester observations reduce the earlier observation gap; they do **not** cover Staff/Admin navigation, Staff Dashboard/My Actions, populated Actions, distinct validation/status/nested-confirmation/history/Ticket-blocker dialogs, or explicit busy/error/Retry speech. The observed application database currently contains Requesters only, so Staff credentials are not guessed and existing users are not silently promoted.

T-37 still needs coverage-mapped human disposition of remaining screens/viewports/missing captures and the minor History spacing observation. T-38 retains the unobserved task patterns and environment/source qualifications above. The [finite verification proposal](closeout-verification-proposal.md) remains proposed; supported-browser scope and no waived task/threshold are inferred from the student's desire to submit.

T-47 still has complete passing A1/B2 and failed B3/A4 observations; its explicit acceptance decision remains Pending. Human amendment/implementation review and Issue49 acceptance remain Pending. Issue50 still owns reviewed main integration, required final-main verification and the nine-part report/reflection.

This publication changes documentation and a new observation JSON only. No suite/benchmark was repeated, no production/test/configuration/dependency/threshold or historical artifact changed, and no scenario/DoD checkbox, peer approval, merge, deployment or Issue closure is promoted.
