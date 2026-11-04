# PR61 requested-changes response: bounded PATCH context diagnosis

**5 November 2026, Asia/Bangkok. Status: PATCH unresolved; no correction or new comprehensive pass.**

[cottonlnwza's review](https://github.com/chaproi/toktickit/pull/61#pullrequestreview-5775027525) on `57cdda549b33e29a864974f0b9ce518e1ce5ce21` accepts the legacy harness change and its RED/GREEN. It rejects the remaining 2,109-pass/1-failure server result as a qualified release pass. That accepted harness is unchanged and was not re-reviewed or separately rerun.

## Context inspected and experiment performed

The retained full JSON shows no overlapping file interval at PATCH. Its nearest predecessor is the persistent cold-upload file. Inspection also covered the earlier snapshot, CREATE-contention, Staff Actions, bounded diagnosis and authorization cleanup, plus PATCH's own draining and coordination code. Cleanup implementations alone do not prove historical execution.

One small experiment therefore ran **cold upload then PATCH**, using the normal global setup and a public test-only sequencer. It retained all original assertions, 30 PATCH workers, 19 Requester readers, fixture sizes, requests, maxWait, transaction/test budgets, pools and retry policies. Added observations were test-only per-file boundary checks and public pg request/attempt/PID/resource/blocker correlation. This was not another standalone PATCH run or a full-suite retry.

Execution source: `57cdda5` plus temporary diagnostic wiring; production unchanged. Full redacted evidence, archived diagnostic source and exact command journals are pinned at [archive d1aa0b5](https://github.com/chaproi/toktickit/blob/d1aa0b5fb32127b5a5514974d1ddbb3fb0db3c1b/artifacts/lab-04/release/patch-context-2026-11-05/evidence.md).

| Command / attempt, from server/ | Actual result |
| --- | --- |
| `npm.cmd exec -- tsc --noEmit` | Exit 0, 33.095 s; new helper types checked before the configuration-constructor correction |
| Two-file diagnostic, initial configuration | Exit 1, 9.022 s; **0 tests**. New diagnostic setup error: Vitest 2 requires a sequencer constructor, not a path. Preserved as setup evidence, not semantic RED. |
| Same two files after that concrete configuration correction | **2 files / 3 collected and executed / 2 passed / 1 failed / 0 skipped**, exit 1; 84.107 s outer / 81.46 s Vitest |

Exact test command: `npm.cmd test -- tests/lab-04/attachment-cold-upload.integration.test.ts tests/lab-04/action-patch-projection.integration.test.ts --config vitest.patch-context.config.ts --reporter=default --reporter=json --outputFile=<private>/context-confirm-vitest.json`. The temporary configuration only adds boundary setup and explicit two-file order; normal global setup, isolation, file parallelism and all budgets remain inherited.

## Established observations

- Cold upload passed **2/2**, including its unchanged rollback/compensation checks. Worker PID3812 ended with empty pools, zero other database connections, zero advisory locks and restored scoped environment/prototype. PATCH started in distinct worker PID30692 with no surviving connections/locks. This reproduction does not show leakage from that preceding file.
- PATCH failed **0/1**. It produced **137 responses**, not 147 successes: 25 successful EDITs and 5 HTTP500 EDITs; 25 STARTs; 12 COMPLETEs; 13 CANCELs; 57 successful Requester reads. Failed workers did not issue their later two lifecycle requests.
- The first failure, `edit-28` PID46888, spent 136.592 ms in checkout and 1,622.401 ms on the User21 coordination query. Live granted-lock samples show it waiting behind `edit-0` PID6064, then the same-cohort User chain. A later User21 holder was `edit-29` PID63136. It subsequently waited on User50 held by `start-27` PID26816 until startup expiry.
- Exact new monotonic points: attempt selection46517.146; User21 query46732.543-48354.944; User50 query48372.621-48537.453; deadline48518.091; physical teardown48520.676; primary error48523.400; drained finish48538.589 ms. No BEGIN/business callback is observed for any of the five failures.
- Safe classification: `TransactionStartDeadlineError`, `P2028`, owned `transaction-start`, maxWait2000. Engine subtype remains null. This is not a retrospective reclassification of old P2028s.
- The fixture has disjoint Ticket/Action targets but overlapping actor/old/new-assignee Users through `(i+1)%30` and `(i+2)%30`. The trace establishes **same-cohort partial-footprint User-lock convoys**, rather than a surviving cold-upload holder. It does not prove all possible earlier-file/host effects absent.

[Analysis](https://github.com/chaproi/toktickit/blob/d1aa0b5fb32127b5a5514974d1ddbb3fb0db3c1b/artifacts/lab-04/release/patch-context-2026-11-05/analysis.json) retains direct granted-key matches separately from soft queue blockers. [Holder timelines](https://github.com/chaproi/toktickit/blob/d1aa0b5fb32127b5a5514974d1ddbb3fb0db3c1b/artifacts/lab-04/release/patch-context-2026-11-05/holder-timelines.json) distinguish callback, completion and physical release. These intervals overlap across commands and must not be summed as independent costs. Current/last statement tags alone are not holder proof. Sampling and added diagnostic work can affect timing; no latency improvement or performance acceptance is claimed.

## Missing correction argument and next boundary

The proximate new failure is observed resource contention within the existing startup allowance. No unnecessary cost or broken release/deadline invariant has yet been isolated well enough to justify a minimum production change. For example, holder edit-29's callback spans 222.964 ms and its subsequent finish-to-release spans 166.558 ms, but those wire/application intervals do not separate necessary protection, SQL execution and runtime scheduling completely.

Further work must establish one concrete avoidable acquisition/release cost or coordination defect while preserving the same overlapping resource topology, all assertions and budgets. Changing User lock modes, dropping guards, reducing workers, changing expected status, adding retries or expanding budgets is not supported by this result. No speculative fix is made. The experiment is not expanded or repeated to seek green; no full correctness rerun is justified yet.

The **historical** full-run holder remains unidentifiable from its old artifact. The new live chain must not be substituted for that missing historical mapping. The latest comprehensive verdict is still **99 files / 2,110 executed / 2,109 passed / 1 failed / exit 1**, excluding only T-47. The earlier standalone pass and all earlier failed attempts remain separate records.

## Cleanup and unchanged files

Independent after-run guard/live-target checks confirm the dedicated target differs from operational: 0 other connections, 0 idle transactions, 0 advisory locks, no new task schemas/directories and unchanged checksums for both pre-existing schemas. Owned HTTP/storage work was drained and processes exited. Public observers were restored.

All temporary diagnostic executable files/configuration were archived as text and removed. Original PATCH/cold-upload bytes are restored; production, helpers, settings and the accepted legacy correction have no new executable delta. Reflection, report, PDF and their provenance files are byte-preserved from `57cdda5`. The reviewer requires genuinely student-authored wording; none is supplied or invented in this batch.

**Remaining gate:** a supported correction and affected RED/GREEN, then one complete server correctness execution excluding only unchanged T-47, followed by actual re-review and reviewed staging/main integration. PR61 remains REQUEST CHANGES. No benchmark, Narrator, screenshot repetition, release acceptance, merge or submission is claimed.
