# Issue #46 workflow layout and keyboard evidence

Executed and visually inspected on **2026-10-23, Asia/Bangkok**. This contributes to AC-37/T-37 and AC-38/T-38, with AC-18/T-18, AC-36/T-36 and AC-43/T-53 interactions. It does not complete Issue #46, any shared scenario or Product DoD.

Both browser attempts executed at HEAD `430a019c8aa69d5e3140ea1fe7d1d05c87cd012c`, with the new verification test uncommitted and **no pending production changes**. The verification/evidence commit is subsequent publication, not a claimed post-commit rerun. Each screenshot JSON retains its actual capture timestamp, execution HEAD, browser version, viewport, state and pending-production list. No production correction was necessary.

## Commands and actual attempts

From repository root, twice:

```text
npm.cmd run test:e2e -- e2e/lab-04/ticket-workflow-layout.spec.ts e2e/lab-04/ticket-resolution.spec.ts
```

| Attempt | Collected/executed | Passed | Failed | Exit | Interpretation |
| --- | ---: | ---: | ---: | ---: | --- |
| Initial | 10 | 7 | 3 | 1 | Five existing workflows, desktop layout and keyboard case passed. Mobile/tablet/zoom stopped at the new test's strict textarea reachability check after caret scrolling. No application defect was established. |
| New scrolling setup corrected | 10 | 10 | 0 | 0 | All five workflow and five layout/keyboard/zoom cases passed; all deeper dialog/history/blocker/zoom assertions executed. |

Initial diagnostics observed unobscured textarea centers, no clipping ancestors, and textarea bottom coordinates 845.39/1113.41/403.72 against viewport heights 844/1112/402. The new local `reach` function now centers controls through ordinary `scrollIntoView` before invoking the **unchanged** strict shared reachability assertion. No tolerance, assertion, helper, timeout, viewport, CSS or production behavior was weakened. Initial captures remain in [initial/](initial/); these are pre-correction captures, not passing evidence for the three interrupted cases.

Appropriate E2E TypeScript checking passed once, exit 0:

```text
node server/node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --esModuleInterop --skipLibCheck --strict --typeRoots server/node_modules/@types --types node client/src/vite-env.d.ts e2e/lab-04/ticket-workflow-layout.spec.ts e2e/lab-04/ticket-resolution.spec.ts
```

No client production changed, so the conditional client test/build runs were unnecessary. No full server or full E2E suite ran.

## Environment and observed behavior

Windows, Node v24.14.0, Playwright 1.63.0, Chromium 153.0.8010.12. Existing workers=1, retries=0, test budgets, configuration, global setup/teardown and dedicated browser fixtures were unchanged. The actual repository guard plus live identity check verified a dedicated test database distinct from operational. Each fixture additionally verified the exact prepared owned schema before writes.

The responsive cases used exact CSS viewports **390×844**, **834×1112** and **1440×900**. A valid 351-character ASCII reason includes a 264-character unbroken segment and literal script-like text. Ordinary optional reasons were saved through the real status endpoint; persisted reason, authoritative history and literal DOM text were checked. Forms, resolution/cancellation confirmations, explanation, labels and buttons passed geometry/reachability checks. Complete history text wraps without hiding or horizontal clipping.

Keyboard checks covered optional/required labels, retained invalid cancellation input, aria-invalid and describedby feedback, visible computed focus treatment, Tab/Shift+Tab trapping, inert background, Escape/Cancel restoration, and a **real 409 ACTIONS_OUTSTANDING** response. The count was read from real Action endpoints. Keyboard activation of View Actions Taken closed the dialog, removed inertness and focused its heading. No successful response, business failure or transport fault was fabricated. These are sequential browser workflows, not overlapping database-race evidence.

Genuine tab zoom reused the unchanged extension and `genuineZoom` helper: **chrome.tabs.setZoom/getZoom verified 1.0 → 2.0 → 1.0**. Native CSS width changed **1424 → 712 → 1424**, with the zoomed viewport **712×402** and pinch scale **1**. No CSS zoom, transform, device-scale, pinch or substituted viewport was used. Reason controls, cancellation explanation, actual blocker feedback/link, history reflow and keyboard trapping/handoff passed. Zoom was restored in finally, the context closed and the exact owned temporary profile removed.

## Visually inspected final screenshots

All **14** final PNGs were opened and visually inspected, with matching JSON metadata. The screenshots show readable labels/buttons, visible focus, literal text and wrapped history. Textareas retain ordinary internal scrolling: screenshots show either the beginning or end of a long draft, not every line at once. At 200%, the blocker dialog legitimately scrolls internally; its lower-state capture does not show the heading/alert above it. Reachability/trap checks exercised the controls independently. No content was hidden to satisfy geometry checks.

| Viewport/state | Final inspected screenshot |
| --- | --- |
| 390×844 resolution | [PNG](final/390x844-resolution.png) / [metadata](final/390x844-resolution.json) |
| 390×844 cancellation | [PNG](final/390x844-cancellation.png) / [metadata](final/390x844-cancellation.json) |
| 390×844 stored history | [PNG](final/390x844-history.png) / [metadata](final/390x844-history.json) |
| 834×1112 resolution | [PNG](final/834x1112-resolution.png) / [metadata](final/834x1112-resolution.json) |
| 834×1112 cancellation | [PNG](final/834x1112-cancellation.png) / [metadata](final/834x1112-cancellation.json) |
| 834×1112 stored history | [PNG](final/834x1112-history.png) / [metadata](final/834x1112-history.json) |
| 1440×900 resolution | [PNG](final/1440x900-resolution.png) / [metadata](final/1440x900-resolution.json) |
| 1440×900 cancellation | [PNG](final/1440x900-cancellation.png) / [metadata](final/1440x900-cancellation.json) |
| 1440×900 stored history | [PNG](final/1440x900-history.png) / [metadata](final/1440x900-history.json) |
| Invalid required reason | [PNG](final/keyboard-invalid-reason.png) / [metadata](final/keyboard-invalid-reason.json) |
| Real blocker and Actions link | [PNG](final/keyboard-blocker.png) / [metadata](final/keyboard-blocker.json) |
| Genuine 200% cancellation | [PNG](final/zoom200-cancellation.png) / [metadata](final/zoom200-cancellation.json) |
| Genuine 200% blocker, scrolled | [PNG](final/zoom200-blocker.png) / [metadata](final/zoom200-blocker.json) |
| Genuine 200% stored history | [PNG](final/zoom200-history.png) / [metadata](final/zoom200-history.json) |

## Cleanup, warnings and limitations

Both attempts reported owned domain/session fixture cleanup and client disconnection. Post-run independent checks found zero prepared E2E schemas, idle transactions and newly owned zoom profiles; API/Vite listeners on 3100/4173 were closed. Credential environment restoration follows the unchanged preparation/teardown path; no environment file was edited. Screenshots contain synthetic data only. Existing Actions artifacts remain unchanged.

New cases reported zero browser page errors and zero browser console warnings in both attempts. CLI output reported NO_COLOR/FORCE_COLOR warnings (three initial, one final). This does not certify WCAG compliance, measure contrast, exercise a screen reader, test other browser engines or physical mobile devices, or complete earlier-screen accessibility. Final comprehensive regression, contract/evidence updates and actual implementation peer review remain subsequent work; all shared scenario/DoD statuses are unchanged.
