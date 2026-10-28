# Staff Dashboard browser integration evidence

Date: 2026-10-27, Asia/Bangkok. Execution HEAD: `e67436ca1ffebe02c290f82a2417c2bad79ba262`, with the new browser test/helper uncommitted. Production bytes were unchanged throughout these runs. This is verification evidence, not a manufactured RED/GREEN application change or an exact-publication-HEAD rerun. Implementation peer review remains Pending.

## Environment and isolation

Local Windows/PowerShell, Node 24.14.0, npm 11.9.0, repository Playwright, Chromium **153.0.8010.12**, real React/Vite at 127.0.0.1:4173, Express at 127.0.0.1:3100 and PostgreSQL. Existing configuration: one worker, zero retries, unchanged timeouts/global setup/teardown. No browser was opened in the conversation. No successful Dashboard/list response was fabricated.

The actual `configureTestDatabaseEnvironment` guard and independent live database/schema identity probe passed before fixtures. The dedicated database differs from operational. Existing global setup built and migrated its uniquely owned `issue27_suite_*` schema; it seeded only that disposable schema. New fixtures independently checked the exact live schema before writing, tracked owned identities immediately and used real Argon2id credentials and login. Connection/credential/session values are deliberately absent from this record.

## Commands and actual attempts

From repository root, the same command ran three times, each following a concrete correction to newly authored fixture/query assumptions:

```text
npm.cmd run test:e2e -- e2e/lab-04/staff-dashboard.spec.ts e2e/lab-04/dashboards.spec.ts e2e/lab-04/actions-taken-flow.spec.ts
```

| Attempt | Collected/executed | Passed | Failed | Skipped | Exit | Wall duration | Diagnosis |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 17 | 9 | 8 | 0 | 1 | 74.87s | All new cases stopped at setup: synthetic Ticket numbers for longer cohort keys exceeded varchar(20), producing sanitized P2000. Replaced only the new fixture identifier with a bounded owned counter. No product RED. |
| 2 | 17 | 15 | 2 | 0 | 1 | 64.12s | New assumptions: default sorting was required explicitly in the UI URL although the API request correctly supplied it; the mobile Queue was queried as a visible table although its accessible presentation is cards. Corrected only these new expectations, retaining exact outgoing sorting/predicates, row sequences and totals. |
| 3 | 17 | 17 | 0 | 0 | 0 | 55.78s | Eight Staff cases, five unchanged Requester Dashboard cases and four unchanged Action workflow cases passed. Playwright reported 54.9s. |

Both E2E TypeScript attempts passed (exit 0; command wall durations 2.87s and 1.55s):

```text
node server/node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --esModuleInterop --skipLibCheck --strict --typeRoots server/node_modules/@types --types node --jsx react-jsx client/src/vite-env.d.ts e2e/lab-04/staff-dashboard.spec.ts e2e/lab-04/staff-dashboard-browser-fixtures.ts
```

All original failed-run logs and generated failure contexts were retained separately from final evidence. No production defect was demonstrated, so no production change, full client/server rerun or new build was needed. Carried evidence remains 25 component cases, 84 inherited client cases, 318 full client cases/23 files and client build at the preceding implementation execution; server 2,002/build at `b2bdec2d93d7207e1a1d927b972a05754b55cc8f`. Those are not new executions in this batch.

The color environment emitted NO_COLOR/FORCE_COLOR warnings. The final browser cases reported zero page errors. Existing Requester recovery deliberately aborts one browser transport request, then recovers through the real server: it is not outage evidence. The new Staff logout test holds an unmodified, real successful response until after real logout; no fabricated data, polling or arbitrary sleep is used.

## Independently known fixture observations

Each Staff case owns a fresh category and twenty Tickets. Explicit Ticket bins: NEW=1, OPEN=12, IN_PROGRESS=1, WAITING_FOR_REQUESTER=1, REOPENED=1, RESOLVED=2, CLOSED=1, CANCELLED=1. Active excludes the two terminals: LOW=2, MEDIUM=13, HIGH=2, URGENT=1. Unassigned active=3; Staff A mine=12; Administrator B mine=3; Staff C mine=0. Recent updated=17; recent resolved=1, excluding old CLOSED and missing-history legacy RESOLVED. These are independent fixture expectations, not counts computed from previews or production calculation helpers.

A's Action bins are PLANNED=4, IN_PROGRESS=2, COMPLETED=1, CANCELLED=1; six unfinished, first five ordered by createdAt/id including equal timestamps. B has one planned and one completed; C has no assignments despite creator/performer references. A's unfinished Actions belong to B's Ticket. Directly constructed histories respect lifecycle/source constraints; they do not prove workflow transitions. Inherited Action workflows separately execute real non-assignee completion and follow-up clearing.

## Acceptance contribution and remaining work

| Accepted criteria / scenarios | Actual evidence | Scope and limitation |
| --- | --- | --- |
| AC-01/02; T-01/02 | [Staff browser suite](../../../../e2e/lab-04/staff-dashboard.spec.ts): real login, unauthenticated Login, Requester Forbidden/API ROLE_FORBIDDEN, logout/late-response suppression; [security suite](../../../../server/tests/lab-04/staff-dashboard-security.api.test.ts) | Browser cases do not replace inherited expiry/password/revocation/security tests. Prior dependency tests are controlled classification injections after authenticated real reads, not actual outages. |
| AC-24/25; T-24/25 | Staff browser metrics/parity/old CLOSED/legacy observations; [API tests](../../../../server/tests/lab-04/staff-dashboard.api.test.ts); [service](../../../../server/src/dashboards/staff-dashboard-service.ts); [component tests](../../../../client/tests/lab-04/StaffDashboard.test.tsx) | Known filtered global counts are distinct from actor-specific mine; no-assignment actor still sees nonzero global data. No aggregate arithmetic from truncated previews. |
| AC-26/44; T-26/54 | Staff browser Action bins/top five, unfinished/completed destination requests, assignee identities, actual completing actor, selected Action focus, non-assignee Complete control; [API-07 service](../../../../server/src/actions/staff-action-service.ts) | Real #48 screen consumes reconstructed Dashboard-return filters. Role landing/global active navigation and the complete #53 chain remain unaccepted shared obligations. |
| AC-27; T-27 | Staff browser stable time/id order and bounded lists; existing precise date/history tests in Staff API/drill-down suites | Browser timestamps are comfortably inside/outside the window, not new midnight/future-cap proof. Detailed database boundary evidence remains the previously executed tests. |
| AC-28; T-28/46 | Staff browser all six Ticket widget classes, exact request predicates, IDs/totals/order, two-page mine, all seven Apply/Clear controls, reload/back/forward; [drill-down tests](../../../../server/tests/lab-04/dashboard-drilldown.api.test.ts) and [snapshot helper](../../../../server/tests/lab-04/staff-snapshot-coordination-test-helper.ts) | Distinct HTTP reads use fresh snapshots. This browser suite is not a coordinated DB snapshot test; existing controlled-writer evidence remains separate. |
| AC-29/36; T-29/36 | Staff browser unmatched category zero bins/empty lists, old CLOSED matching row, no-assignment actor, pending logout read; existing component error/Retry coverage | Failure is not displayed as fabricated zeros. Staff browser Retry faults are not newly exercised; Requester transport-recovery regression is explicitly injected. |
| AC-34; T-34 | Existing Staff security suite and component safe dependency-error/Retry assertions; unchanged Requester browser transport-recovery regression | No new actual outage or Staff browser dependency fault is claimed. Safe-failure backend evidence is carried at its original provenance. |
| AC-35; T-35 | Direct Staff/Admin route and delivered Dashboard return consumption | [#53](https://github.com/chaproi/toktickit/issues/53) under #45 explicitly owns post-login Dashboard landing, shared active navigation and reviewed full navigation integration. The live Issues allocate #48's screen independently, avoiding a circular dependency. Current roleHome/global navigation remain unchanged. Full AC-35 is incomplete, and #53 is an acceptance dependency for that shared scenario rather than a missing #48 aggregate implementation. |
| AC-37/38; T-37/38 | Three exact viewports below, no page-level overflow, accessible labels, ordinary keyboard focus/visible treatment, reachable controls and Queue pagination; unchanged [geometry/keyboard helpers](../../../../e2e/lab-04/action-layout-helpers.ts) | Domain contribution only. Genuine 200% tab zoom, Staff-specific contrast sampling, screen-reader/cross-browser and comprehensive earlier-screen checks are not established here. Staff zoom/accessibility work must be recorded explicitly before claiming its complete domain acceptance; #49 owns final integrated verification. |
| AC-40; T-48 | Eight new real integration cases plus nine inherited browser regressions | Not the full E2E suite or whole-product acceptance. #49 final integration and #50 release remain. No Issue/scenario/Product DoD changes. |

The implemented increment is suitable for peer review on the observed integration evidence; full Issue #48 acceptance is not established. Finish the remaining domain zoom/accessibility evidence, documentation and actual implementation review; retain #53/#49/#50 handoffs. No backend correction or current functional blocker was demonstrated by this batch.

## Inspected screenshots

All final images came from attempt 3 at execution HEAD above with new verification source uncommitted and production unchanged. They are full-page captures at **unmodified browser zoom**, not 200% zoom. Every final image was visually inspected, including native-resolution sections: labels/cards remain readable, long names and unbroken literal content wrap, focus outline is visible, and no essential content is clipped. Automated geometry/reachability and keyboard assertions also passed; screenshots alone do not establish function or certified accessibility.

| Configured viewport | Final screenshot | Observed presentation |
| --- | --- | --- |
| 390×844 | [dashboard-390.png](dashboard-390.png), [metadata](dashboard-390.json) | Single-column filters, two-column status bins; long summaries and names wrap; lower previews reachable by ordinary scrolling. |
| 834×1112 | [dashboard-834.png](dashboard-834.png), [metadata](dashboard-834.json) | Two-column filters and summary cards; four-column bins; full literal previews and visible focus. |
| 1440×900 | [dashboard-1440.png](dashboard-1440.png), [metadata](dashboard-1440.json) | Three-column filters/four-column cards; readable bounded lists and assigned identities. |

Queue geometry, cards/table readiness and pagination reachability were checked in the same viewport cases. Historical Actions/Requester/workflow artifacts remained byte-identical; no restoration was needed. Earlier diagnostic screenshots/results are archived separately and are not relabelled as final captures. Browser tracing remained off under committed configuration.

## Cleanup and publication scope

Every fixture compares complete owned Ticket/Action/history/receipt/Notes rows before/after browser reads, excluding legitimate session bookkeeping. FK-safe cleanup verified zero owned users, sessions, Tickets, Actions/history/receipts and references, then disconnected Prisma. Existing global teardown removed the exact owned schema and stopped servers. Independent post-run probes found **zero prepared schemas, zero idle transactions and zero listeners at 3100/4173**. The held response settled and its route handler was removed. Browser contexts were closed by Playwright; no temporary zoom profile was created.

All **428 preexisting tracked files** remained byte-identical, including production, tests/helpers, configuration and historical artifacts. Only the new dedicated browser test/helper and this screenshot/evidence directory are publication scope. No credentials, session material, operational database mutations, Issue/PR edits, approval claims or scenario promotions are included.

## 2026-10-28 accessibility and review-handoff addendum

The [new dated addendum](accessibility-2026-10-28/evidence.md) records genuine native 200% zoom, Staff keyboard/announcement/focus checks, computed contrast RED/GREEN (unfocused filter borders 1.30:1 to 4.97:1), the scoped two-file correction, 11/11 Staff browser cases, 25/25 focused components, 84/84 inherited components, 318/318 full client cases and build. Execution was at RED test HEAD with pending production bytes subsequently committed as `d562960dc019833669c3e59caef6919f11cd9a7c`; no exact-publication-HEAD rerun is claimed. The original report, failed attempts and screenshots above remain historical evidence unchanged.

Eight new final captures were inspected; actual extension-controlled zoom was 1.0 -> 2.0 -> 1.0 with CSS viewport 1424x805 -> 712x402 -> 1424x805 and pinch scale 1. No real screen reader/cross-browser or certified WCAG claim is made. Implementation review remains Pending; documentation preparation, #53 navigation under #45, #49 final integration and #50 release remain explicit in the handoff checklist.
