# PR #57 active-navigation correction ? 2026-10-31

## Submitted review and actual source state

[cottonlnwza's CHANGES_REQUESTED review](https://github.com/chaproi/toktickit/pull/57#pullrequestreview-5713907250) was submitted **2026-10-30T14:40:33Z** (21:40:33 Asia/Bangkok) against **99c8e3c228472c0dd53baa6e0222f5cc7f7ce342**. The original 69/69 browser run did not assert active navigation on Ticket detail or selected-Action routes. Its passing verdict did not establish this missing requirement. The review and earlier evidence remain preserved; no reviewer acceptance, resolution or approval is inferred.

RED **3682415e5dad735ecf1d4dda2e2b5e57bf550ce1** contains four test/helper additions, first executed with production unchanged at 99c8e3c. Corrective test commit **96e00aae40ac382bb91560dc4c69c02334ba8561** fixes three newly authored unsupported Testing Library query options. App correction **d4c042193c5be7f23c550edc7017532dda644e38** is separate. Correction executions used RED/test-correction HEADs with pending App bytes subsequently committed unchanged. They are not exact-production-commit or later documentation-commit executions.

Actual execution logs are dated **2026-10-30 Asia/Bangkok**, local Windows/PowerShell; Node 24.14.0 / npm 11.9.0, Playwright 1.63.0, Chromium 153.0.8010.12, real React/Express/authentication/PostgreSQL. This addendum is prepared on 2026-10-31. No hosted CI, screen-reader, cross-browser or certified WCAG claim. Existing screenshots retain their original inspection dates/source states; no fresh screenshot inspection is claimed here.

## Corrected behavior and traceability

App.tsx uses router matching and a single active decision for aria-current and existing active/fw-semibold classes. Valid positive bounded numeric /tickets/:ticketId maps to My Tickets; /staff/tickets/:ticketId maps to Ticket Queue. Selected-Action hashes do not change pathname selection. /tickets/new stays Create Ticket only. Dashboard, Actions and Administrator exact destinations remain exact. Permissions, role landing, mobile-menu behavior and data loading are unchanged.

Primary partial mapping: AC-35/T-35; selected-Action integration also AC-44/T-54. The actual real-App component file is client/tests/lab-04/DashboardNavigation.test.tsx; browser assertions are in e2e/lab-04/dashboards.spec.ts and actions-taken-flow.spec.ts, with two narrow additions to navigation-browser-helpers.ts. Exactly one correct aria-current=page item and one matching styled active item are asserted. Existing content, privacy, authorization, selected focus/single DOM record, pagination and seven-filter-return checks remain intact. Component HTTP fixtures establish presentation; successful browser reads/writes use real application endpoints and PostgreSQL.

Five detail/selected-Action variants fail before the fix and pass after it. The /tickets/new positive case already passed before production, so it is verification, not manufactured RED. In component RED, assertions after the first missing active indication remain unreached. Browser selected-Action focus precedes the missing active assertion; later return assertions are reached and pass in the affected correction run.

## Every command attempt

Case counts below are collected/executed unless explicitly marked unexecuted. Results overlap and are not additive. C/R/F/B run from client/; P/T/full browser run from root. Wall seconds are command measurements, not inferred from runner rounding.

| Attempt / execution source | Actual result |
| --- | --- |
| C RED: new tests pending, original App | 1 file;34 executed,29 passed/5 failed;0 skipped;exit1;59.1523759s wall,47.91s Vitest. Expected aria-current=page, received null on Requester/Staff/Admin detail and both selected-Action variants; no collection/authentication/fixture failure |
| P RED: new browser assertions pending, original App | 2 selected files;6 executed,1 passed/5 failed;0 skipped;exit1;111.0168227s wall,1.8m Playwright. Real detail content loaded but zero active aria items; Create-only already passes |
| T E2E TypeScript | Exit0;3.0039053s wall. Browser source unchanged after this check |
| C first correction at 3682415 + pending App | 34/34 passed;0 skipped;exit0;11.2134835s wall,9.90s Vitest |
| R inherited regressions, same pending App | 7 files;109/109 passed;0 skipped;exit0;9.7675074s wall,8.13s Vitest |
| F first full client, same pending App | 24 files;352/352 passed;0 skipped;exit0;39.1786768s wall,35.15s Vitest |
| B first build | Exit2;15.7041175s wall. TS2769 in three newly added role queries: unsupported exact option. Corrective96e00aa replaces only those new options with anchored accessible-name regexes; no product type defect or weakened assertion |
| C after new-test type correction, App pending | 34/34 passed;0 skipped;exit0;16.5426089s wall,14.49s Vitest |
| F latest full client | **24 files;352 executed,304 passed / 48 failed;0 skipped;exit1;146.6023411s wall,135.18s Vitest.16 failed files/8 passed. Current full-client regression is FAILED** |
| B final build | Passed;exit0;50.0388175s wall;TypeScript/Vite succeed |
| C bounded diagnostic after full failure | 34 executed,32 passed/2 failed;0 skipped;exit1;48.7744163s wall,42.13s Vitest. Unchanged Staff/Admin history.back return waits fail after all new active/style assertions pass. This diagnostic unintentionally overlapped the pending final build and is not an isolated timing measurement |
| P correction at 96e00aa + pending App | 6/6 passed;0 skipped;exit0;86.5132642s wall,1.4m Playwright. All missing active/style assertions, Create-only protection and original focus/pagination/filter-return checks execute and pass |
| Full browser once at 96e00aa + pending App | **15 files;70 collected;50 executed:45 passed/5 failed;20 did not run;exit1;504.9502158s wall,8.4m Playwright. FAILED**, one worker/zero retries/original timeouts unchanged |

```text
C: npm.cmd test -- tests/lab-04/DashboardNavigation.test.tsx
R: npm.cmd test -- tests/lab-03/AuthenticatedShell.test.tsx tests/lab-03/Login.test.tsx tests/lab-03/ChangePassword.test.tsx tests/lab-03/StaffTicketQueue.test.tsx tests/lab-04/RequesterDashboard.test.tsx tests/lab-04/StaffDashboard.test.tsx tests/lab-04/MyActions.test.tsx
F: npm.cmd test
B: npm.cmd run build
P: npm.cmd run test:e2e -- e2e/lab-04/dashboards.spec.ts e2e/lab-04/actions-taken-flow.spec.ts --grep 'Navigation #53:.*(real landing|filtered Dashboard|Create Ticket)'
T: node server/node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --esModuleInterop --skipLibCheck --strict --typeRoots server/node_modules/@types --types node --jsx react-jsx client/src/vite-env.d.ts e2e/lab-04/dashboards.spec.ts e2e/lab-04/actions-taken-flow.spec.ts e2e/lab-04/navigation-browser-helpers.ts
Full browser: npm.cmd run test:e2e
```

## Failed comprehensive checks and limitations

The latest full-client failures include five-second test timeouts and one-second rendering deadlines across inherited and new suites: Attachment/Create/MyTickets, authentication/shell/UserManagement, Actions/Dashboards and Ticket Workflow. App bytes are identical between the first passing full run and the later failure; the intervening tracked edit corrects three new query type options. Transform/setup/collect/environment costs were higher in the failed run. Resource pressure is an unproven hypothesis, not an established cause or a reason to dismiss failures. The later build/diagnostic overlap did not cause the earlier failed full-client run, which had already finished. No timeouts, workers, retries, sleeps, unrelated tests or assertions were changed. No repeated full-client run sought a lucky pass.

The full-browser failure categories are concrete, not five navigation assertion failures:

- requester-dashboard-layout.spec.ts:295: genuine-zoom cleanup failed with EPERM removing its owned temporary profile. Its error context and outputs were archived; the exact profile was safely removed after verifying no Chromium process referenced it.
- responsive.spec.ts:7 (390x844), staff-dashboard.spec.ts:68, ticket-resolution.spec.ts:142 and ticket-workflow-layout.spec.ts:162 (390x844): worker process exited unexpectedly, code 3221226091, signal=null. The native-exit cause is unestablished; no speculative OS/resource diagnosis is asserted.
- Twenty subsequent cases did not run; they are not passes or intentional skips. No full E2E rerun was used to replace this failed result. All six affected navigation cases completed before these failures; their separate 6/6 run remains narrower evidence only.

Current comprehensive client and browser verdicts are both FAILED and need bounded diagnosis before regression can be called GREEN. Passing first/focused/build/browser evidence does not supersede them. No out-of-scope production or harness fix is attempted here. The sole active-state correction is published for re-review with these limitations explicit, not as merge-ready approval.

Existing warning observations remain: first full client: 10 act/2 Router future/1 jsdom navigation-not-implemented notices; second full: 6 act/2 Router/1 jsdom. Full browser includes one NO_COLOR/FORCE_COLOR notice. Git line-ending notices occurred during generated-artifact inspection; configuration was not changed to suppress them. None is asserted to explain the failures.

## Isolation, artifact preservation and cleanup

The actual repository isolation guard and independent read-only live identity probe ran before browser fixtures: dedicated test database differs from operational and live database/schema match the guarded target. Owned migrated-schema fixtures use real sessions, domain-preservation comparisons and FK-safe cleanup. No server suite or operational migration/data operation was run for this client-only correction.

All 200 original tracked artifact files were backed up and restored byte-identically. Focused RED and correction runs each restored two known generated files. Full-run handling restored 47 overwritten tracked artifacts and archived/removed 20 new owned generated captures by explicit paths. Fresh outputs/logs/failure contexts remain archived separately; existing screenshots/metadata/evidence.md are unchanged and are not relabelled as corrected-UI captures.

Final independent safe probes: zero owned disposable schemas, zero idle transactions, zero application listeners on 3100/4173, zero owned zoom profiles. The read-only probe disconnected its client and restored scoped credential environment. One run-owned profile remained after the recorded EPERM failure; its absolute path/ownership and absence of referencing Chromium processes were verified before narrowly removing it. No unrelated process/profile was terminated or removed. Existing fixture/held-response cleanup remains unchanged; native worker exits limit direct teardown-callback evidence; final independent probes nevertheless found no application listeners or owned profiles.

All original test/helper lines are preserved in order. Backend/schema/migrations/configuration/dependencies, accepted normative contracts and original checklists remain unchanged. The addendum and four allowed documentation records preserve actual review/failed-run history. No new screenshot, certification, natural outage/race or complete-product claim is made.

## Remaining gates

Actual implementation re-review and reviewed staging integration remain Pending. The submitted review remains CHANGES_REQUESTED until the reviewer decides otherwise. The two current failed comprehensive checks require diagnosis; they are not silently assigned away to final integration. #45 retains coordination; #49 final product integration and #50 release remain distinct. No reviewer message/reply, thread resolution, review dismissal, Issue/project/checklist change, merge or scenario/Product DoD promotion occurred.

## Documentation and scope checks

Strict UTF-8, original CRLF/final newlines, whitespace and full diff checks passed. All four original document bodies and historical opening status records remain preserved; original checkboxes are identical. Inventory remains 31 FR / 46 BR / 45 AC / 55 unchanged Planned scenario rows / 20 accepted decisions. All 388 local links/anchors, 65 Markdown tables/806 rows and four newly referenced commit SHAs were checked. The table totals include retained historical records. All 463 original tracked files outside the nine authorized existing paths remain byte-identical, including both protected specification/API contracts and all 200 historical artifact files. One new dated evidence addendum is the tenth changed path. No application execution is attributed to documentation publication.

## Isolated diagnostic confirmation - 2026-10-31

### Current verdict and execution source

**Current full-client confirmation: GREEN, 24 files/352 collected, executed and passed, zero failed/skipped. Current full-E2E confirmation: GREEN, 15 files/70 collected, executed and passed, zero failed/skipped/unexecuted.** Both ran at committed **ee730c0968b4b6428706973669ecbc5c77e608cd**, with no pending production/test/configuration changes. Full browser started with a clean tree after focused generated artifacts were restored. App blob is 2c6fae6fbf2889ef55401af44447940071ee722b. Later evidence/documentation publication is not an application-tested HEAD and is not hosted CI.

These new confirmations supersede the *current failed regression verdict* above, not its historical results. The earlier 304/352 client and 45 passed / 5 failed / 20 did not run browser attempts remain genuine failed runs. Their original root causes are still unestablished. The later build/diagnostic overlap happened after the old full-client failure and is not asserted to have caused it. Passing today does not prove yesterday's cause was fixed.

No application, test, helper, configuration, timeout, worker, dependency or runtime correction was made. No correction or empty implementation commit is manufactured. The user explicitly authorized bounded diagnosis followed by one isolated full confirmation after satisfactory focused results; there were no additional full reruns seeking a lucky pass. The previously passed build was not repeated because source/test/configuration bytes are unchanged; no server suite was needed.

### What the retained failures actually establish

| Inspected evidence | Proven finding / limit |
| --- | --- |
| Old full-client raw output | 33 cases grouped under the five-second Vitest timeout; 13 missing-render query failures; 2 value assertions. 24 files collected, 16 failed / 8 passed; no collection failure. The first reported failed file was ResolutionIndication.test.tsx, 10 cases with 2 failures. This is report order, not a measured causal ordering across parallel workers |
| Passing-to-failing source difference | 96e00aa changes only three newly authored role queries from unsupported exact options to anchored accessible-name regexes. App correction bytes are unchanged. No identified production behavior change explains the broad failure |
| Setup/collection costs | Old failed runner: transform 17.99s, setup 39.40s, collect 94.30s, environment 204.01s, prepare 53.85s. Current passing runner: 1.35s, 5.69s, 16.83s, 30.98s, 3.37s respectively. These are parallel runner phase totals, not additive wall time or proof of resource-pressure causality |
| EPERM call site | Existing genuineZoom finally awaits context.close(), validates owned profile path, then rmSync recursively removes exactly that profile. The old stack points to that final removal. No retained historical handle-owner evidence identifies what denied removal; old profile was already safely removed in the prior task. No failure reproduced in the bounded zoom case or full confirmation, so adding retries or changing lifecycle is unsupported |
| Native worker exits | Installed Playwright 1.63.0 runner ProcessHost uses child_process.fork for workerProcessEntry and reports that child's exit code. Thus four old 3221226091/signal=null events are **Node test-worker exits**, not direct proof of Chromium, Express or application failure. No exception meaning is guessed from the number |
| Crash-event availability | Windows Application log was readable; no matching node.exe/chrome.exe Application Error/Windows Error Reporting record was found for 2026-10-30 22:20-23:10 Asia/Bangkok. No dump or module/exception evidence establishes the native-exit cause; absence of a matching report does not exclude a crash |
| Shared lifecycle inspection | Existing React test teardown/fetch restoration, Playwright worker dispatch, guarded profile cleanup and global database/listener teardown were inspected. Current focused/full runs leave no owned work behind. No reproducible lifecycle/readiness defect justifies changing them |

### Controlled execution conditions

Local Windows/PowerShell, 2026-10-31 Asia/Bangkok. Exact installed executable/package versions: Node v24.14.0, npm 11.9.0, Vitest 2.1.9, TypeScript 5.9.3, Playwright 1.63.0, Chromium 153.0.8010.12. No version/dependency/configuration change. One browser worker, zero retries, original timeouts; client uses committed default settings unchanged.

Safe read-only pre-run process inspection found no active Vitest/build/Playwright workspace task. Relevant Node test-worker ownership was the current user. Existing unrelated browsers/tooling were left running; no process was killed, security software disabled, profile broadly deleted or cache cleared. Commands were strictly sequential: focused client -> full client -> focused browser -> full browser. Resource probes were observations, not concurrent tests/builds.

Resource samples: 31.71 GiB physical memory / 12 logical processors; before client 17.50 GiB physical and 20.16 GiB virtual free, CPU 25%; before full browser 17.64 GiB physical and 20.32 GiB virtual free, CPU 51%. During-browser samples: 15.96 / 16.04 GiB physical free, CPU 59% / 48%. Free disk: C 161.00 GiB, D 620.97 GiB. No historical measurements establish conditions during the old failure, and these bounded samples are not peak-usage profiling. Resource pressure remains a hypothesis for the old attempt.

### All newly executed commands and justification

All four commands below ran once, with no overlap, at clean source/test HEAD ee730c0. Durations are measured command wall seconds; runner values are separately labelled. Results overlap and are not additive.

| Command and working directory | Why this execution was justified | Actual result |
| --- | --- | --- |
| client/: npm.cmd test -- tests/lab-03/ResolutionIndication.test.tsx | Small representative file selected from earliest reported old failures; preserve every assertion and real-App fixture | 1 file; 10/10 passed, 0 failed/skipped; exit 0; 10.9839449s wall, 7.53s Vitest |
| client/: npm.cmd test | Authorized isolated full confirmation after bounded client success and safe process check | 24 files; 352/352 passed, 0 failed/skipped; exit 0; 37.6176144s wall, 36.57s Vitest |
| root/: npm.cmd run test:e2e -- e2e/lab-04/requester-dashboard-layout.spec.ts e2e/lab-04/responsive.spec.ts --grep 'Requester Dashboard genuine 200% tab zoom preserves filters\|Actions screens and all dialogs reflow at 390x844' | Bounded reproduction of actual EPERM cleanup case plus representative native-worker-exit case, unchanged fixtures and settings | 2 files; 2/2 passed, 0 failed/skipped; exit 0; 34.0972582s wall, 32.8s Playwright |
| root/: npm.cmd run test:e2e | Authorized single full confirmation after bounded browser success, fixture cleanup, restored artifacts and zero active test/build tasks | 15 files; 70/70 passed, 0 failed/skipped/unexecuted; exit 0; 276.0424183s wall, 4.6m Playwright |

The genuine-zoom reproduction verifies 1.0 -> 2.0 -> 1.0; native CSS viewport 1424x805 -> 712x402 -> 1424x805, pinch scale 1. Profile cleanup completes normally. Full E2E executes all 20 previously unexecuted cases as well as the active-state/selected-Action assertions. Successful browser data comes from real React/Express/PostgreSQL. The existing one-time browser transport abort remains deliberately injected recovery evidence, not an actual database outage. New captures were archived, not visually inspected or relabelled as historical screenshots.

Full client retains 10 act, 2 Router future and 1 jsdom navigation warning notices. Focused browser/full browser each emit one NO_COLOR/FORCE_COLOR notice; full browser emits 14 Git line-ending notices while existing capture helpers inspect regenerated metadata. These warnings remain reported; none is proven to explain the old failures.

### Isolation, preservation and final cleanup

The actual repository guard and independent live identity probe verify a dedicated test database distinct from operational before fixtures. Scoped credential environment is restored and probe clients disconnect. Existing per-case fixtures verify zero owned rows/sessions in FK-safe cleanup; global owned migrated schemas are removed. Real endpoints and business assertions were never mocked away or weakened.

All 473 tracked files matched saved pre-run hashes after generated output restoration and before documentation editing. All 201 existing artifact files were restored exactly at that point. Focused browser: 11 overwritten tracked artifacts restored, 8 new owned captures archived/removed. Full browser: 104 overwrites restored, 63 new captures archived/removed. Fresh logs/results/images remain archived separately; only explicit generated paths were restored/removed, no broad reset/clean. This intentional append then changes one existing ledger; the other 200 historical artifact files remain byte-identical, including images and metadata.

Final independent probes: zero owned schemas, zero idle transactions, zero test/build tasks, zero test-profile browser processes, zero application listeners on 3100/4173, zero owned zoom profiles. No manual profile removal was needed in this confirmation. Fixture/session cleanup and held/injected browser request restoration completed; client disconnection and scoped environment restoration verified. No operational database operation or unrelated process/profile change.

### Remaining review gate

Current comprehensive regression is supported as GREEN at ee730c0. Original failure mechanisms/root causes are not claimed resolved, and every failed attempt remains above. Actual implementation re-review and reviewed staging integration remain Pending; the submitted CHANGES_REQUESTED review is not dismissed or resolved by these checks. #45 coordination, #49 final product integration and #50 release remain separate. No Issue/project/scenario/Product DoD change, reviewer message, review submission, thread resolution or merge occurred.
### Documentation validation

Only this append and tests.md/reviewer.md changed. All 470 other tracked files remain byte-identical, including application source, tests/helpers, configuration and 200 historical artifacts. The ledger retains its original byte prefix; both documents preserve their original bodies, prior status records, checkboxes and accepted identifiers. Counts remain 31 FR / 46 BR / 45 AC / 55 unchanged Planned scenarios / 20 decisions. Checks passed for 392 local links/anchors, 68 Markdown tables / 827 rows, 21 new table rows, strict UTF-8/original CRLF/final newlines and whitespace. No additional application run or causal fix is attributed to evidence publication.
