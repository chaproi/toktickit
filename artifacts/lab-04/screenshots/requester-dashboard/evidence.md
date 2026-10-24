# Requester Dashboard layout and accessibility evidence

Recorded on 2026-10-24 for Issue #47. This is a bounded contribution to AC-37/T-37, AC-38/T-38 and AC-36/T-36, not full scenario, Issue or Product DoD completion. No application correction was necessary; these are verification tests, not an invented RED/GREEN phase.

## Execution provenance

- Repository/branch: `chaproi/toktickit`, `feat/47-requester-dashboard`.
- Every execution had Git HEAD `0475989409d8d5ff73d69a6a05e379decfe05289`, with the new verification file pending. Application source, shared tests/helpers, configuration and historical artifacts were unchanged. `pendingProductionFiles` is empty in every capture.
- The new test was subsequently committed as `d0dccfb3f6ef927edc40b73f759ad27a6f990bb5`. These runs were **before that commit**, not post-commit or exact-publication-HEAD reruns.
- Environment: local Windows/PowerShell, Playwright 1.63.0, Chromium 153.0.8010.12. Normal captures report `HeadlessChrome/153.0.8010.12`; the persistent extension context reports `Chrome/153.0.8010.12`.
- Real React/Vite, Express, inherited password/session authentication and PostgreSQL in the existing guarded disposable E2E schema. Successful application responses were never mocked. Constructed read cohorts are not workflow-transition evidence.
- [New suite](../../../../e2e/lab-04/requester-dashboard-layout.spec.ts) reuses [Dashboard fixtures](../../../../e2e/lab-04/requester-dashboard-browser-fixtures.ts) and [geometry/keyboard/contrast/genuineZoom helpers](../../../../e2e/lab-04/action-layout-helpers.ts) unchanged. Its capture function writes only here, never to `actions-taken/`.

## Commands and actual attempts

From the repository root, the combined command was:

```text
npm.cmd run test:e2e -- e2e/lab-04/requester-dashboard-layout.spec.ts e2e/lab-04/dashboards.spec.ts
```

| Attempt | Collected/executed | Passed | Failed | Skipped | Exit | Reported runner duration | Purpose/result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 9 | 4 | 5 | 0 | 1 | 1.3m | Existing workflows passed. Three new checks incorrectly required the entire tall table to fit inside the viewport; two sampled Retry contrast during transient CSS hover/color transitions. |
| 2 | 9 | 6 | 3 | 0 | 1 | 49.5s | Tall-table and stable-transition checks corrected. Mobile and zoom passed. Three checks hit-tested the whitespace center of a wrapped inline link's union rectangle. |
| 3 | 9 | 9 | 0 | 0 | 0 | 55.7s | Keyboard arrival, actual text-rectangle hit-testing and contained scrolling passed. Added representative recent-record screenshots. All five new cases and four existing workflows passed. |

The first/second failures were new-test assumptions, not demonstrated application defects. Corrections retained page-wide overflow, complete-text, keyboard focus, real scrolling and unobscured-link requirements. No sleeps, timeout changes, retries, shared-helper edits or production changes were used. Stable contrast sampling awaits actual CSS animation completion after removing incidental hover; it does not poll until a ratio passes.

After attempt 3, the only test change was one extra 200% recent-list screenshot. The affected case was rerun:

```text
npm.cmd run test:e2e -- e2e/lab-04/requester-dashboard-layout.spec.ts --grep "genuine 200%"
```

Result: **1 collected/executed, 1 passed, 0 failed/skipped, exit 0, 19.4s**. The combined command was not repeated after this capture-only addition. Final responsive/keyboard PNGs come from attempt 3; final zoom PNGs come from this focused rerun. Per-image UTC capture timestamps and execution state are in adjacent JSON files. Wall-clock wrappers measured approximately 88.977s, 50.352s, 56.586s and 20.232s respectively, separately from the runner durations above.

The E2E TypeScript check passed, including after the final capture addition:

```text
node server/node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --esModuleInterop --skipLibCheck --strict --typeRoots server/node_modules/@types --types node client/src/vite-env.d.ts e2e/lab-04/requester-dashboard-layout.spec.ts e2e/lab-04/dashboards.spec.ts
```

No full server/full E2E suite, client suite or build was run in this batch. Client verification was conditional on a production change, and there was none. Configuration stayed at one worker, zero retries and existing timeouts. Capture-phase environment selection affected artifact destinations only and was restored after each run.

## Observed behavior

- Exact configured viewports **390×844**, **834×1112**, **1440×900**: all six associated filter labels/controls, Apply/Clear, four textual metric links, both populated five-row recent lists and active-filter summary were exercised. Long multilingual/literal summaries and long names stayed within accepted 150/120-character bounds.
- Complete text wrapped without page-wide horizontal overflow, hidden overflow or clipped essential content. Normal page scrolling was used to reach off-screen content. A native closed select shows its selected value; this is not a claim that every option is simultaneously visible.
- Each responsive case applied all six filters, verified the active summary, then used a real metric link to a nonempty authoritative My Tickets drill-down. The filtered total was 12, and rendered Ticket-number order was matched to the real response.
- The My Tickets region is keyboard-focusable. Where horizontal scrolling is present, ArrowRight actually changes its scroll position. Tall regions are not required to fit vertically in one viewport. Wrapped inline links were verified through keyboard focus and hit-tests on actual line rectangles, not the whitespace center of their combined bounding box. Page-size and Next controls remained reachable through normal scrolling.
- Keyboard checks exercised the six filters in logical Tab order, visible focus, Apply/Clear and Enter activation of a metric link. No dialog focus trap was imposed on the ordinary Dashboard page.
- Loading used one `role=status` with `aria-busy=true`. An independently installed, one-time, held browser transport abort produced one accessible error alert and Retry, with no fake zero metrics/empty success. Retry was activated by keyboard and recovered real populated server data. Each recovery case injected exactly one browser transport failure after initial StrictMode reads settled, released/drained the handler and restored routing. This is **not** evidence of a natural PostgreSQL outage or backend failure classification.
- Sampled stable computed contrast: metric text **6.63:1**, summary **15.43:1**, Apply **6.63:1**, error text **10.22:1**, Retry **6.63:1**. Samples cover selected solid computed foreground/background combinations, not every state, focus-ring contrast, rasterized text or certified WCAG conformance.

## Genuine browser zoom

The unchanged Chromium extension uses `chrome.tabs.setZoom/getZoom`; the native persistent browser window uses no emulated viewport. Observed factors and CSS viewports were:

| State | Verified tab zoom | Native CSS viewport | Pinch scale |
| --- | --- | --- | --- |
| Before | 1.0 | 1424×805 | 1 |
| Zoomed | 2.0 | 712×402 | 1 |
| Restored | 1.0 | 1424×805 | 1 |

All six filters, metric/list text, Retry, Apply/Clear and drill-down controls were checked at 200% through ordinary scrolling and keyboard interaction. The additional close-up shows the literal long summary and owner name reflow at 2.0. Native compositor screenshots preserve actual tab zoom. CSS zoom, transforms, deviceScaleFactor, pinch zoom and a smaller substitute viewport were not used. The helper restored zoom, closed the owned context and removed its temporary profile.

## Final screenshots and visual inspection

All **14 final PNGs** below were inspected by Codex at original resolution on 2026-10-24. Associated metadata records actual viewport, browser, role, zoom, source state and inspection observations. Filter images intentionally capture the form element; their smaller image dimensions do not replace the configured page viewport. Other images capture the native viewport, so lower rows may continue below its edge through ordinary scrolling.

| Screenshot | Metadata | Inspection observation |
| --- | --- | --- |
| [390×844 filters](final/390x844-filters.png) | [JSON](final/390x844-filters.json) | Six stacked labels/controls and Apply/Clear are readable. |
| [390×844 metrics](final/390x844-metrics-lists.png) | [JSON](final/390x844-metrics-lists.json) | Four stacked textual cards and date-window text fit; lists are below the fold. |
| [390×844 records](final/390x844-recent-records.png) | [JSON](final/390x844-recent-records.json) | Literal markup and unbroken summaries/names wrap, with readable status/priority/time. |
| [834×1112 filters](final/834x1112-filters.png) | [JSON](final/834x1112-filters.json) | Two-column controls and labelled buttons fit. |
| [834×1112 metrics](final/834x1112-metrics-lists.png) | [JSON](final/834x1112-metrics-lists.json) | Two-column cards remain legible with surrounding context. |
| [834×1112 records](final/834x1112-recent-records.png) | [JSON](final/834x1112-recent-records.json) | Long record text stays within the card. |
| [1440×900 filters](final/1440x900-filters.png) | [JSON](final/1440x900-filters.json) | Desktop filter grid and buttons remain legible. |
| [1440×900 metrics](final/1440x900-metrics-lists.png) | [JSON](final/1440x900-metrics-lists.json) | Four-column metrics and beginning of the recent list are readable. |
| [1440×900 records](final/1440x900-recent-records.png) | [JSON](final/1440x900-recent-records.json) | Literal summaries/long names remain visible; natural viewport cutoff is scrollable. |
| [Keyboard error/Retry](final/keyboard-error-retry.png) | [JSON](final/keyboard-error-retry.json) | One honest error, visible Retry focus and no zero-success cards. |
| [200% metrics](final/zoom200-metrics-lists.png) | [JSON](final/zoom200-metrics-lists.json) | Large readable metric labels/counts and calendar-window text. |
| [200% records](final/zoom200-recent-records.png) | [JSON](final/zoom200-recent-records.json) | Long literal text and owner name reflow within the native zoomed viewport. |
| [200% error/Retry](final/zoom200-error-retry.png) | [JSON](final/zoom200-error-retry.json) | Error text and keyboard-focused Retry remain readable/reachable. |
| [200% drill-down](final/zoom200-drilldown.png) | [JSON](final/zoom200-drilldown.json) | Real My Tickets destination and retained filter text are readable; lower controls were checked by scrolling. |

## Preservation, cleanup and limitations

- All **386 pre-existing tracked files**, including prior screenshot bytes, were compared to a pre-run manifest and remained byte-for-byte unchanged. No historical-artifact restoration was necessary. Initial generated diagnostics, failure logs/contexts and earlier captures were archived separately in a private temporary evidence directory; seven initial diagnostic PNGs were removed from the new publication directory only after their archived bytes were verified. They are not relabelled as final successful evidence.
- The actual repository guard and live dedicated database/schema identity were verified before fixture writes. The operational target was not used. The inherited fixture verified read-only domain preservation and FK-safe removal of owned Tickets, history, notes, users, sessions and references; the narrow long-content wrapper also checked preservation before restoring its owned fixture variations.
- Independent post-run checks found zero owned disposable schemas, E47 users/Tickets/reference records, idle transactions and temporary zoom profiles. Both application listeners (3100/4173) were closed. CDP sessions, browser contexts, routes and Prisma clients were closed/restored by the test/helper cleanup paths. No credentials, cookies, password hashes or connection values are in the screenshots/metadata.
- The runner emitted the existing `NO_COLOR`/`FORCE_COLOR` warning. PowerShell represented stderr warnings as `NativeCommandError` records; actual command exit codes and Playwright results are recorded above. No browser page errors were observed in the successful cases. A temporary launcher exited before starting a second browser run; it contributed no test evidence and was replaced by the normal PowerShell command.
- This is Chromium-only, synthetic-data domain evidence. No screen-reader, other-browser, full responsive earlier-screen regression, exhaustive contrast audit, performance or certified WCAG claim is made. Role landing/global navigation remains #53; Staff Dashboard coordination remains #48; final integrated verification/release remain #49/#50. Full Issue #47 and shared scenarios remain incomplete.
