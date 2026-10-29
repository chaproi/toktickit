# Issue #53 navigation browser evidence ? 2026-10-29

This is a bounded navigation contribution to D-19, AC-35/T-35, AC-44/T-54 and shared AC-01/02/40 (T-01/02/48), not whole-scenario or product acceptance. No application, server, contract, configuration, timeout, worker or retry change was made in this batch.

## Execution provenance and result

All commands ran locally on Windows (PowerShell), Node v24.14.0, npm 11.9.0, Playwright 1.63.0 and Chromium 153.0.8010.12. React/Vite ran on local port 4173 and Express on port 3100 with real PostgreSQL and real session/CSRF/Origin handling. Playwright kept workers=1, retries=0 and the committed timeouts. These are local results, not hosted CI.

Execution HEAD throughout was `f81da7fe0c7ee0f6f77485cc52318585eae71fd1`, on `feat/53-dashboard-navigation`, descending from integration baseline `559f1b0dcbf37621ff5e92de8ad8484b9ff1e0c8`. New tests/helper and compatibility changes were pending during execution; the final compatibility check also included the login-readiness correction. Application bytes stayed identical to execution HEAD. Publication commits are not exact-HEAD reruns.

The initial automatic approval review could not execute the read-only isolation probe because of a usage limit. After continuation, the same approved probe executed successfully. No alternate tool was used to bypass the blocked database operation.

| Command/attempt | Collected/executed | Passed | Failed | Skipped | Exit | Duration |
| --- | --- | --- | --- | --- | --- | --- |
| Focused navigation, attempt 1 | 12/12 | 10 | 2 | 0 | 1 | 2.9m reported by Playwright |
| Focused navigation, attempt 2 | 12/12 | 10 | 2 | 0 | 1 | 50.0s reported; 51.15s command wall |
| Focused navigation, attempt 3 | 12/12 | 12 | 0 | 0 | 0 | 48.6s reported; 49.61s command wall |
| Full E2E, once, 15 files | 69/69 | 59 | 10 | 0 | 1 | 5.2m reported; 311.96s command wall |
| Five affected compatibility files, after corrections | 36/36 | 36 | 0 | 0 | 0 | 2.8m reported; 166.94s command wall |

**The full E2E verdict remains failed.** The subsequent 36 passing cases verify the affected corrections, including all ten formerly failing cases; they do not replace the failed comprehensive run. No second full E2E run was performed. Fresh full-suite confirmation of the corrected harness remains a #53 pre-PR verification gate, separate from #49's later product integration.

Focused command (three attempts; corrections explained below):

```text
npm.cmd run test:e2e -- e2e/lab-04/dashboards.spec.ts e2e/lab-04/actions-taken-flow.spec.ts --grep "Navigation #53"
```

Full command (one attempt):

```text
npm.cmd run test:e2e
```

Bounded post-correction command:

```text
npm.cmd run test:e2e -- e2e/lab-02/requester-ticket-flow.spec.ts e2e/lab-03/requester-regression.spec.ts e2e/lab-04/dashboards.spec.ts e2e/lab-04/requester-dashboard-layout.spec.ts e2e/lab-04/staff-dashboard.spec.ts
```

TypeScript: the first three-file check failed with TS7034/TS7005 for a newly authored untyped Action array. Declaring its element type as the awaited existing fixture result corrected it. The expanded nine-file check passed; the subsequent pre-full check passed (2.17s command wall). The final expanded check below passed after the compatibility fixes. No missing-module or collection failure was treated as product RED.

```text
node server/node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --esModuleInterop --skipLibCheck --strict --typeRoots server/node_modules/@types --types node --jsx react-jsx client/src/vite-env.d.ts e2e/lab-04/dashboards.spec.ts e2e/lab-04/actions-taken-flow.spec.ts e2e/lab-04/navigation-browser-helpers.ts e2e/lab-04/requester-dashboard-browser-fixtures.ts e2e/lab-04/requester-dashboard-layout.spec.ts e2e/lab-04/staff-dashboard.spec.ts e2e/lab-02/requester-ticket-flow.spec.ts e2e/lab-03/authentication.spec.ts e2e/lab-03/authorization.spec.ts e2e/lab-03/requester-regression.spec.ts e2e/lab-03/staff-ticket-flow.spec.ts e2e/lab-03/user-administration.spec.ts e2e/lab-03/responsive.spec.ts
```

No client or server unit/API suite/build was rerun: no application change required those commands. Prior component results (33 navigation, 109 selected regression, final full client 351/351 and build) remain historical evidence from the preceding GREEN batch, including its earlier 350/351 failure and authorized UserManagement href correction.

## Reached browser assertions

| Contribution | Actual paths and observations | Boundary |
| --- | --- | --- |
| Role landing and earlier routes ? AC-35/T-35 | [dashboards.spec.ts](../../../../e2e/lab-04/dashboards.spec.ts): three role cases observe real login POST, automatic Dashboard GET/content/URL before manual navigation; authenticated root/login redirects, brand home, exact single active navigation item, keyboard activation, Ticket/create/Action/Admin routes and role denials. | Does not replace all inherited backend authorization cases. |
| Mandatory rotation ? AC-01/35, T-01/35 | Same suite: three owned mandatory-password accounts make zero Dashboard reads before the gate, including a protected direct URL; real password change reaches the correct Dashboard, persisted gate clears and login with the replacement succeeds. | Initial account condition is constructed; login/change/session responses are real. No credential is saved in evidence. |
| Mobile and tab zoom ? partial AC-37/38, T-37/38 | Same suite plus unchanged genuineZoom/keyboard utilities: 390x844 menu keyboard open, role-link reachability, route-triggered close and correct active state. Genuine Administrator tab zoom is observed 1 ? 2 ? 1. | Focused navigation evidence; no screen reader, cross-browser or comprehensive accessibility certification. |
| Complete Actions return ? AC-44/T-54, shared AC-35/T-35 | [actions-taken-flow.spec.ts](../../../../e2e/lab-04/actions-taken-flow.spec.ts): Staff and Admin each start with seven independently specified base filters, see 26 actor assignments despite another-assignee decoy, page at 25, select the 26th Action outside the initial 20/27 parent page, use real authorized detail retrieval and focus, restore browser-history list state, then reach the actual Dashboard with exactly the original seven filters. | Constructed Action read fixtures are not write/workflow-race evidence. |
| Unsafe return selectors | Same two role cases reject returnTo with an accessible invalid-query state and no API-07 read/external link; deliberate Clear then Back reaches the known local Dashboard. The valid return above retains seven filters and drops Action status/group/page/date extensions. | Rejected query state is not treated as accepted base-filter state. |
| Identity/session isolation ? AC-01/02, T-01/02/48 | Dashboard case holds an actual fetched Requester A response, logs out through the real endpoint, verifies subsequent 401, logs in as B, then releases the unchanged A response and asserts B's independent counts/order and no A content. Action cases use real Administrator edits to demote/deactivate an owned worker, observe real 401/session loss, clear protected content; demoted actor logs in as Requester and receives role denial. Action/history snapshot remains preserved. | The held response is controlled scheduling, not a naturally occurring race. An aborted consumer may discard it. No successful response or session is fabricated. |

The new 12 cases are verification contributions against the existing GREEN implementation. No genuine client defect was demonstrated and no production correction was made. The complete original bodies/prefixes of both extended suites remain byte-identical.

## New-test corrections and inherited compatibility

1. Focused attempt 1 reached the real filtered Dashboard/Actions flow but used nonexistent date-label spellings. Only the new queries changed to the actual `updated From (UTC)` / `updated Before (UTC)` labels. Both role cases timed out at that lookup; this was not product RED.
2. Focused attempt 2 reached and passed pagination, off-page detail/focus and the valid seven-filter Dashboard return. The unsafe-query subcase additionally assumed rejected filters remained accepted. It was aligned with the approved existing component interaction: explicit Clear then Back. Valid filter-retention assertions were preserved. These were test assumptions, not a production defect or invented RED history.
3. Authorized inherited compatibility changes preserve substantive privacy, ownership, filtering, pagination, screenshots, workflows and security assertions:
   - [Lab 2 requester flow](../../../../e2e/lab-02/requester-ticket-flow.spec.ts): observe Dashboard after login, then explicitly visit My Tickets for the unchanged workflow; obsolete `/select-requester` now expects the role Dashboard.
   - [Authentication](../../../../e2e/lab-03/authentication.spec.ts), [authorization](../../../../e2e/lab-03/authorization.spec.ts), [Requester regression](../../../../e2e/lab-03/requester-regression.spec.ts): update only the old role-home/rotation headings, retaining denials and session/privacy checks.
   - [Staff Ticket flow](../../../../e2e/lab-03/staff-ticket-flow.spec.ts), [User administration](../../../../e2e/lab-03/user-administration.spec.ts), [inherited responsive suite](../../../../e2e/lab-03/responsive.spec.ts): observe Staff Dashboard first, then deliberately enter the original Queue/Admin screen without removing its assertions.
   - [Existing Dashboard login fixture](../../../../e2e/lab-04/requester-dashboard-browser-fixtures.ts): after non-mandatory authentication, await the correct real landing URL, heading and rendered As-of content. The helper previously returned while the new automatic Dashboard read was still in flight; a subsequent navigation/response wait could capture the previous document's response and fail with Network.getResponseBody/no resource. This narrow readiness correction also benefits its existing Staff-helper re-export. No cohort/setup/cleanup or domain assertion changed.

The full run's ten failures comprise two obsolete My Tickets headings and eight unavailable response bodies across existing Dashboard/layout/contrast/zoom cases. The unchanged affected assertions all execute and pass in the later five-file run. Original failed output and diagnostic contexts remain archived locally, not replaced with passing output.

## Inspected screenshots and genuine zoom

All three final screenshots below were visually inspected at useful resolution on 2026-10-29. They were captured during the successful 36-case compatibility run, still at execution HEAD with the pending test/helper corrections. Their JSON records retain actual capture time, browser, viewport, zoom, pending paths and inspection limitations. They are not exact-publication-commit captures.

| Screenshot / metadata | Actual viewport and zoom | Visual observation |
| --- | --- | --- |
| [Requester desktop](requester-desktop.png) / [metadata](requester-desktop.json) | 1440x900 CSS px, factor 1 | Dashboard active indication, earlier Ticket links, identity, Logout and Dashboard content are readable without overlap in this crop. |
| [Staff mobile menu](staff-mobile-menu.png) / [metadata](staff-mobile-menu.json) | 390x844 CSS px, factor 1 | Expanded role links wrap within the viewport; Dashboard and toggle remain clear/reachable. Lower content uses normal scrolling. |
| [Administrator genuine 200%](admin-zoom-200.png) / [metadata](admin-zoom-200.json) | Native CSS viewport 712x402, factor 2; initial/restored 1424x805 | Administrator navigation wraps readably; active Dashboard, toggle and Logout remain visible. Lower controls were exercised through keyboard/scrolling, not inferred from the screenshot crop. |

The unchanged extension/helper uses `chrome.tabs.setZoom/getZoom` and verifies actual factor 1.0 ? 2.0 ? 1.0; native CSS width decreases from 1424 to 712 and pinch scale remains 1. Capture uses the native Chromium compositor, not CSS zoom, transforms, deviceScaleFactor, pinch zoom or a substitute resized viewport. The owned context/profile is closed/removed by the helper. No new contrast certification is claimed; sampled contrast from existing domain tests retains its own limitations. No screen-reader or cross-browser run occurred.

## Isolation, preservation and cleanup

Before fixture writes, the actual repository isolation guard and read-only live identity probe confirmed a dedicated test database different from operational. Every reused browser fixture also checks its exact owned migrated `issue27_suite_*` schema before writes. Existing FK-safe cleanup verifies zero owned domain/session rows and disconnects Prisma. Real Administrator/session changes affect only owned identities. Held responses/routes settle and restore in finally; password material stays in process memory only.

Final independent safe probes reported: zero remaining owned schemas, zero idle transactions in the dedicated database, zero listeners on the two application ports and zero remaining owned zoom profiles. The probe disconnected and restored its scoped credential environment. No operational migration or data change occurred.

Exact pre-run bytes/hashes of all 193 tracked historical artifact files were preserved. Fresh outputs and failure contexts were archived separately. After the full run, 91 overwritten tracked artifacts were restored; after compatibility execution, 24 were restored again. All 193 final hashes match the pre-run originals. Another 63 newly generated initial captures outside this publication scope were archived and removed by explicit owned file path. No broad reset/clean or unrelated artifact overwrite was used. Only these three new navigation screenshots/metadata and this record are published.

Warnings observed: Node's inherited NO_COLOR/FORCE_COLOR conflict, Git LF/CRLF notices while capture provenance inspected regenerated JSON, and an npm update notice on the first focused attempt. No dependency, color environment, retry or timeout was changed. New fixture page-error assertions stayed empty; inherited workflow diagnostics reported zero page errors/browser warnings.

## Remaining gates

- #53: fresh comprehensive E2E confirmation of the corrected compatibility harness; documentation/pre-PR scope/evidence reconciliation, then actual implementation peer review and reviewed integration. The live Issue still contains historical not-started/absent-screen wording; it was read, not edited here.
- #45 retains navigation coordination and complete shared AC-35/T-35 accountability. #47/#48 supplied real Dashboard screens; this batch does not reopen their accepted formulas or widen query contracts.
- #49 retains final product integration, cross-browser/screen-reader and comprehensive earlier-screen verification; #50 retains release/submission.

No PR, Issue/checklist, review, scenario or Product DoD state was changed. Passing domain cases do not declare whole-product acceptance.

Publication review: 454 other tracked files were byte-identical to the clean preflight snapshot, including all 193 historical artifacts and every application/configuration file. Both original extended-suite prefixes were byte-identical. Strict UTF-8 checks passed for 15 changed/new text files; 16 local links and three Markdown tables (20 rows) validated. Working/staged whitespace and exact scope were reviewed before publication.

The browser tests and authorized compatibility corrections were committed separately as `6f74e3bbcf1321addb0e6ecae50d0175c6c6936b`. No browser or application command was rerun after that commit; captures/results retain the execution provenance above.
