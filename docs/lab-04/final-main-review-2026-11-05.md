# Narrow release correction review - 5 November 2026

Addresses #50. Base: `lab4-staging`. Main `040e13b` and fetched staging `a3575a2` share reviewed tree `e26e54a2f9ddf795eeed039ebd12c6485ddd15c0`. Only one test file changes. Production, schema, migrations, seed, dependencies, configuration, timeouts, pool settings, retries and business assertions are unchanged.

## Source change to review

`server/tests/lab-04/legacy-actions.integration.test.ts` loads the real App once in file setup under the unchanged default hook budget, then creates and injects a fresh guarded real client per case and restores/disconnects it. Schema, migration, seed, authentication and business checks remain inside each case. All 38 original `expect` lines and all four test declarations are preserved. No temporary executable diagnostic observer is included in this PR.

This fixes repeated module-graph setup in the legacy harness. It does not change business behavior or fix the PATCH failure.

## Exact evidence and limits

- [Legacy RED/GREEN ledger](https://github.com/chaproi/toktickit/blob/458ffd72354e878e87d5d4b2498a7c24a17ee154/artifacts/lab-04/release/legacy-timeout-040e13b-2026-11-05/diagnosis.md): the instrumented representative file had one pass and three failures. The first App import took 6,396.788 ms inside a 5,000 ms case. The specific harness correction passed 4/4, and the legacy file passed 4/4 in the later full diagnostic. These executions included test-only instrumentation. It was subsequently stripped; no execution at the later publication commit is claimed.
- [Latest full JSON](https://github.com/chaproi/toktickit/blob/458ffd72354e878e87d5d4b2498a7c24a17ee154/artifacts/lab-04/release/legacy-timeout-040e13b-2026-11-05/full-vitest.json): **99 files / 2,110 executed / 2,109 passed / 1 failed / 0 skipped, exit 1**, excluding only T-47. Runner exit and cleanup records are retained. The sole failed test expected HTTP 200 but received HTTP 500 in its PATCH cohort.
- [Standalone PATCH observation and PID chains](https://github.com/chaproi/toktickit/blob/458ffd72354e878e87d5d4b2498a7c24a17ee154/artifacts/lab-04/release/patch-holder-2026-11-05/diagnosis.md): **1/1 passed; 90 writes + 57 reads; all 147 responses HTTP 200**. This does not erase the comprehensive failure. The historical failing artifact lacks PID/resource/holder mapping: **the historical blocking holder cannot be confirmed retrospectively**. New successful-run chains cannot be transplanted into that failure. **There is no production fix.**
- [Original final-main command records](https://github.com/chaproi/toktickit/blob/458ffd72354e878e87d5d4b2498a7c24a17ee154/artifacts/lab-04/release/final-main-command-records-2026-11-05/commands.json): client 352 passes/build, server build and E2E 77 passes retain their actual `040e13b` provenance. The generated-client setup failure and incomplete post-generation server run also remain recorded separately.

## Requested scoped reviewer decision - Pending

1. Is the small legacy fixture lifecycle diff correct, isolated and adequately supported by its actual RED/GREEN evidence?
2. Is the retained server limitation (2,109 passes / 1 failure, standalone PATCH pass, historical holder unknown, no production fix) acceptable **for qualified Lab submission**, or is further scoped work required? Record the decision against the actual reviewed HEAD and identify any required follow-up.
3. Does the Parts 1-9 draft accurately distinguish execution rounds, provenance and the student-approved AI-assisted reflection and unfinished submission?

This requests review of the new diff and limitation only. It does not reopen accepted PR58, D-12/D-13, T-37/T-38 or the limited T-47 disposition, or ask for repeated benchmark/audio/visual evidence. Silence is not acceptance. No all-pass verdict, reviewer approval, Product DoD promotion, merge or submission is claimed.

## Report package and publication checks

- [Parts 1-9 source](submission-report-draft.md) and [13-page PDF draft](../../output/pdf/toktickit-lab4-parts-1-9-draft.pdf): nine rubric parts, 60 available points; this is not an awarded score. The student accepted the AI-assisted reflection on 5 November 2026. This is not independently student-authored text or approval of the entire report; peer disposition and submission remain pending.
- [PDF provenance and inspection record](../../artifacts/lab-04/release/report-draft-2026-11-05/provenance.json): five unchanged historical images, 33 PDF link annotations, original capture sources and hashes. The Staff figure is explicitly a viewport excerpt of the historical full-page image. No new application screenshots or audio were taken.
- Full original diagnostic evidence is preserved on a separate archive branch at pinned commit `458ffd72354e878e87d5d4b2498a7c24a17ee154`. Raw diagnostic output is not copied into this narrow PR.
- Application tests, builds, E2E and benchmarks were not rerun for publication. Only document/PDF/Git scope, assertion preservation, links, encoding and whitespace checks were performed. No database/runtime resources were created by report preparation.

