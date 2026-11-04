# Lab 4 release handoff — 4 November 2026

**Status: Issue49 accepted; Issue50 release preparation in progress.** This is a documentation-only handoff, not a final-main verification result or submitted report. Student: สิริกร ฝันนิมิตร (ไทเกอร์),67070507215, GitHub chaproi.

## Accepted source and review

- [PR58](https://github.com/chaproi/toktickit/pull/58), [cottonlnwza APPROVED exact4eecb5f](https://github.com/chaproi/toktickit/pull/58#pullrequestreview-5769874363).
- Approved commit: `4eecb5f0ede2688c8fbe4a9b5a55502ea504144e`.
- Staging merge: `7fde762d61f25c67335269a9c768bd0dcd1f8ae5`,2026-11-04T14:20:20Z /21:20:20 Asia/Bangkok.
- Both point to tree `1122761f20441615b7fb472c4e45409926a9b346`; whole-tree equality, not merely assumed source similarity.
- At preparation, main remains `64ff04ea8fb1395f569c1095aea556ee6a695ebd`; no Lab4 final-main result exists yet. Re-read live refs before integration; do not overwrite concurrent changes.

The peer accepted the D-12/D-13 implementation and remaining Lab-level T-37/T-38 evidence, using real student reports plus labelled AI visual/automated evidence. [Checklist](t37-t38-decision-checklist.md#10-final-peer-disposition-and-staging-integration--2026-11-04) retains provenance. The reviewer explicitly says no repeated audio session, visual recapture or repeat-until-pass benchmark is needed solely for additional evidence.

## Evidence carried into release

| Evidence | Actual result and boundary |
| --- | --- |
| [Server ledger](../../artifacts/lab-04/hardening/patch-projection-commands-2026-11-04.json) | 99files/2,110passed; only T-47 excluded. Execution8e80cd4 plus pending bytes later committed; retain ledger provenance. Not a new staging/main execution. |
| [Client ledger](../../artifacts/lab-04/hardening/candidate-review-2026-11-04/commands.json) | 24files/352passed and build, recorded candidate execution. Not a final-main run. |
| [Latest normal E2E](closeout-normal-e2e-2026-11-04.md) | 16files/77passed,0failed/skipped at65f4bb1; normal setup/teardown,1worker/0retries,449.896s. Earlier74/77 failure and diagnostics retained. |
| [All55 reconciliation](hardening-closeout-2026-11-04.md) | All planned scenario identities map to actual evidence. The52 listed-obligation mappings are not52 fabricated whole-scenario pass results. #49 evidence has now received actual integrated peer acceptance. |
| [T-47 proposal/disposition](closeout-verification-proposal.md) | A1/B2pass; B2 one complete pass p95=401.518ms,18/18targets. B3 CREATE506.970ms and A4 aggregate963.614ms remain failures. Original p95<500ms unchanged; limited Lab disposition accepted. No stable-capacity/production-readiness/all-ABBA-pass claim. |
| [Visual/audio decision evidence](t37-t38-decision-checklist.md) | Chrome/Chromium + Edge accepted; other engines/combinations untested. Student audio completion plus earlier detailed reports and automated semantics/focus accepted; AI did not hear speech. Existing AI visual/geometry/keyboard/genuine200% evidence accepted; no new human pixel inspection fabricated. |

Existing artifact bytes must be preserved. A normal E2E run regenerates tracked screenshots: archive fresh outputs and restore only proven generated artifacts using the existing preservation approach; do not broadly reset/clean user work or relabel uninspected output. Record source HEAD,dirty state,actual commands/counts/times/versions/warnings/failures and owned-resource cleanup. Do not publish credentials,connection strings,cookies,tokens or .env contents.

## Finite release sequence

1. Finish only release documentation/setup/report packaging on `feat/50-release-submission`, based on accepted staging7fde762. Obtain actual feature-PR review into lab4-staging per Issue50. This adds no application feature or invented RED test.
2. Open the reviewed staging-to-main integration PR. Preserve existing history and expected refs; do not force-push or bypass peer review. Before main merge, confirm no unreviewed production/test/configuration delta has appeared and carry the accepted hardening evidence.
3. After reviewed main integration, check out the exact final main commit in an isolated worktree and run the final-main verification below once. These are final-source release checks, not reopening accepted #49 observations. A real failure requires diagnosis and a justified affected fix/check; do not repeat unchanged runs to choose a pass.
4. Fill actual main SHA/PR/review/results in the [Part1–9 draft](submission-report-draft.md), insert readable application-only figures with their actual provenance, collect the student's own reflection, then render/inspect the final PDF and validate links.
5. Mark remaining Product DoD/#50 items only from actual results. Record submission only when it really occurs. No more blanket “human pending” gate is added to already accepted #49 work.

## Exact final-main check plan — not executed here

Use the existing guarded,dedicated test database and installed Windows/Edge environment. Preserve existing environments and worktrees; use lockfile installs only where dependencies are absent. Root package has `test:e2e`, not a root `test` script. The server exclusion below is the already recorded command shape, retaining the accepted T-47 disposition rather than launching a new benchmark.

| Package/location | Command on Windows | Current release status |
| --- | --- | --- |
| client | `npm.cmd --prefix client test` | Pending actual final-main execution |
| client build | `npm.cmd --prefix client run build` | Pending |
| server correctness | `npm.cmd --prefix server test -- --exclude tests/lab-04/performance-smoke.integration.test.ts` | Pending; explicitly excludes only accepted T-47 smoke |
| server build | `npm.cmd --prefix server run build` | Pending |
| root E2E | `npm.cmd run test:e2e` | Pending; normal guarded setup/teardown,real installed Edge,existing worker/retry/budgets |

Before normal E2E, ports3100/4173 must be free. Stop only the known borrowed manual-review launcher gracefully (its own `q` command where still running); its owner must clean its owned schema. Do not kill unrelated processes or drop arbitrary issue27 schemas. Preserve operational localhost5173/3000 unless intentionally shutting that known runtime down. Final-main checks may need the user's local Codex because this remote documentation preparation has no Windows PostgreSQL/.env/Narrator session.

The test fixtures/global setup own disposable schemas under the dedicated test target. Use the central guard and live-target verification; no operational reset/role promotion. Track and verify only task-owned fixtures/connections/locks/listeners/browser profiles/settings. Keep all actual failures and warnings.

## Report completion fields

- Final main commit / integration PR / peer review: **Pending**.
- Final-main actual commands/results/environment and cleanup: **Pending**.
- Student-authored reflection: **Pending student words**, not AI-invented personal experience.
- Final PDF render/readability/link check: **Pending**.
- Actual submission: **Not performed**.
