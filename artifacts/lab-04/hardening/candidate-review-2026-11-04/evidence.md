# Candidate review preparation - 4 November 2026

Tested source: `2671b3a2374bb10fe2cbaae50d6b844c66e7f0e4`, isolated `feat/49-d12-rc-candidate`, verified equal to upstream/live origin before work. No application, test or configuration correction occurs. The original `535a2e5` branch/proposal and historical evidence remain preserved. No server suite/build or performance workload runs in this batch.

| Directory | Actual command | Exit | Actual result | Outer duration |
|---|---|---:|---|---:|
| client/ | `npm.cmd test` | 0 | 24 files; 352 collected/executed/passed; zero failed/skipped | 41.766 s |
| client/ | `npm.cmd run build` | 0 | TypeScript/Vite build passed | 5.337 s |
| root | `npm.cmd run test` | 1 | Missing root test script; zero collected/executed | 0.540 s |
| root, after user clarification | `npm.cmd run test:e2e` | 0 | 15 files; 72 collected/executed/passed; zero failed/skipped; one worker/zero retries | 285.780 s |

[Exact command timestamps, arguments, source hashes and warnings](commands.json) preserve every attempt. Bangkok times on 4 November: client 04:16-04:17, build/root 04:17, E2E 04:18-04:23. The root missing-script invocation executes no business assertion; the user explicitly clarifies the existing test:e2e script. No manifest change is made. Later documentation publication is not represented as exact-publication-HEAD application execution or hosted CI.

E2E uses real Chromium 153.0.8010.12, React, Express, authentication and isolated PostgreSQL. Existing 60-second case/10-second assertion budgets remain. Transport holds/aborts and constructed read fixtures retain their source qualifications. Component HTTP fixtures do not prove database behavior; browser geometry and keyboard checks do not certify WCAG, screen-reader or cross-browser coverage.

Server evidence retains its original provenance: 99 files/2110 passed, only T-47 excluded, 994.45 s framework/997.004 s outer at `8e80cd4` with pending projection bytes committed unchanged as `0abd40d`; prior TypeScript/build passed. All 215 server source/test/configuration hashes still match. This is neither a fresh server run nor an unfiltered full-suite result.

**T-47 has a complete passing B2 observation, with observed variability and acceptance pending.** A1/B2 pass every inline assertion; B3/A4 fail and remain intact. The [complete ABBA ledger](../t47-abba-2026-11-04/comparison.md) retains all 22000 samples, both B outcomes, telemetry gaps and unknown causes. No new four-of-four acceptance requirement, performance tuning or benchmark execution is introduced.

The [student/peer review package](../../../../docs/lab-04/d12-candidate-review.md) contains proposed D-12/D-13 wording, actual writer/session/locking refinements, rollout/rollback, evidence and remaining integrated obligations. D-12 remains proposed; student adoption and human implementation review are Pending. [Live handoff](live-handoff.json) establishes `lab4-staging` atdd8eafb as the required feature PR base, with `feat/49-final-hardening` at535a2e5 retained as the focused RC comparison baseline. Merged PR57 and its preserved reviews do not approve this candidate. No related hardening PR is found; none is created here.

[Artifact preservation](artifact-preservation.json): all 546 pre-run tracked artifact bytes survive. Fresh outputs are privately archived: 102 overwritten historical files restored and 63 new generated files removed after archiving, comprising 92 PNGs and 73 JSON files. No fresh screenshot visual inspection is claimed. Historical inspection dates/HEADs/pending-byte qualifications remain unchanged. Only proven generated capture paths are restored; user/review work is preserved.

[Independent native cleanup](database-cleanup.json), at2026-11-03T21:24:00.100Z, reports zero owned browser/recovery schemas, sessions/fixture identities, other connections, idle transactions, advisory locks and fault objects. [Resource cleanup](resource-cleanup.json), at21:24:03.648Z, reports zero new zoom profiles, owned repository/browser processes and application listeners. Pre-existing unrelated user browsers remain untouched. Requests, contexts, clients and listeners drain; scoped E2E values exist only in the child process. Ignored dependency junctions reuse existing installations; no package installation or lockfile change occurs.

Warnings remain: React act, Router future flags, jsdom navigation, color environment and pg queued-query deprecation. No Vitest unhandled-error summary occurs. Fifteen earlier dependency-audit findings remain untriaged; no new audit result is invented. Accepted Lab-only failed-start bookkeeping retention remains a limitation, not a memory-safety or release approval. Normative IDs, decisions, scenarios and Product DoD states remain unchanged.
