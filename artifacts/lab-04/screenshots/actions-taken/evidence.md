# Issue #45 Actions layout and accessibility evidence

Executed and inspected on **2026-10-10, Asia/Bangkok**. This is the Actions domain contribution to AC-37/T-37 and AC-38/T-38, with AC-36/T-36, AC-41/T-50 and AC-45/T-55 interactions. It does not complete Issue #45 or the shared scenarios/DoD. Formal implementation peer review remains pending.

Starting HEAD: `31333243042a21be29442de1e0dcd3a92e958356`. New test commit: `5e77f1baaa2c8191f4a69d6ba67e93a6f5b9dbea`. Client correction: `edb378d07685b343bee729f1432894d1423cf793`.

The successful run and final screenshots used test-commit HEAD with the three production corrections still uncommitted. Those exact corrections were subsequently committed in the client correction above. Each JSON preserves the actual capture HEAD/date and adds the verified implementation commit and source blob identities; this is not a claimed post-commit rerun.

## Commands and observed results

From repository root:

```text
npm.cmd run test:e2e -- e2e/lab-04/actions-taken-flow.spec.ts e2e/lab-04/responsive.spec.ts e2e/lab-04/accessibility.spec.ts
```

| Attempt | Collected/executed | Passed | Failed | Exit | Interpretation |
| --- | ---: | ---: | ---: | ---: | --- |
| Initial | 10 | 4 | 6 | 1 | New repeated-text fixtures ended with whitespace and violated Action_attachmentNotes_check (23514); no layout assertions reached in those six cases. Only new fixture text was trimmed. |
| Fixture-corrected | 10 | 6 | 4 | 1 | Clear-focus, history transport-harness, zoom harness/control and mobile overflow failures; diagnosis required. |
| Current-read fault/native capture diagnostic | 10 | 6 | 4 | 1 | Clear-focus, focus after Retry removal, mobile overflow were semantic failures. Zoom hit-test reached a deliberately disabled lifecycle submit. |
| After client corrections and valid zoom drafts | 10 | 10 | 0 | 0 | All four workflow cases, three exact-viewport cases and three accessibility/zoom cases passed in 46.8 seconds. |

Additional zoom diagnostics: `npm.cmd run test:e2e -- e2e/lab-04/accessibility.spec.ts -g "genuine 200%"` suffered Windows CLI filter quoting (no tests executed, exit 1). Corrected `-g genuine` collected/executed one case; it failed the disabled-submit hit-test, exit 1. Providing valid completion/cancellation/reassignment drafts corrected that new-test setup without weakening reachability assertions.

TypeScript checking passed (exit 0):

```text
node server/node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --esModuleInterop --skipLibCheck --strict --typeRoots server/node_modules/@types --types node client/src/vite-env.d.ts e2e/lab-04/responsive.spec.ts e2e/lab-04/accessibility.spec.ts e2e/lab-04/action-layout-helpers.ts
```

From `client/`, `npm.cmd test`: 20 files / 258 collected, executed and passed, zero failed, exit 0. `npm.cmd run build`: TypeScript and Vite passed, exit 0. No full server or full E2E suite ran. Existing warnings: ten React act warnings, two Router future warnings, jsdom attachment navigation limitation; Playwright reported NO_COLOR/FORCE_COLOR warnings. No unexpected browser page errors were observed in the ordinary page fixtures. History transport failure was deliberately injected in the browser, not claimed as a real server dependency outage.

## Findings and narrow corrections

- Escape/Keep note/confirmed clear now restore focus to the follow-up checkbox. Cancelling still retains the checkbox and original note, and no mutation is sent.
- When history Retry/loading controls disappear, focus remains in the dialog so Tab/Shift+Tab and Escape/trigger restoration work.
- A synthetic long Internal Note author expanded a shared record grid to scrollWidth 489 at viewport width 390. Adding min-width:0 and overflow-wrap:anywhere to the existing record-card style permits wrapping; no content is hidden or removed. The surrounding Ticket integration is checked, not comprehensive earlier-screen accessibility.
- Browser transport faults are held until explicit release/retry because an obsolete development-mode read can consume a one-shot fault. Reads otherwise use real endpoints. No successful application response or write is fabricated.

## Environment, genuine zoom and cleanup

Windows, Node 24.14.0, Playwright 1.63.0, Chromium 153.0.8010.12. Ordinary cases used exact 390×844, 834×1112 and 1440×900 viewports. Existing workers=1, retries=0 and timeouts/global preparation/teardown were unchanged. Database guard plus a live identity probe verified the dedicated test database differs from operational; every fixture also verifies the exact owned prepared schema. No connection values or credentials are recorded.

Genuine zoom uses the unchanged `e2e/fixtures/tab-zoom-extension` controller (`chrome.tabs.setZoom/getZoom`). A native Chromium window requested 1440×900 with viewport emulation disabled. The tab was observed at **1.0 → 2.0 → 1.0**, with visualViewport.scale=1; the native CSS viewport at factor 2.0 was **712×402**. This is actual tab zoom, not CSS zoom, transforms, deviceScaleFactor, pinch or a substituted small viewport. Device-metrics viewport emulation initially produced blank captures; native-window compositor capture resolved that harness problem. Zoomed forms, lifecycle dialogs, history, Actions section and My Actions passed reachability/reflow checks. Zoom was restored in finally, context closed and its exact owned temporary profile removed.

Post-run verification found zero new owned schemas, zero owned zoom profiles and zero headless-shell processes; API port 3100 and Vite port 4173 were closed. Per-case cleanup checked zero owned users/Tickets/Actions/history/receipts/sessions/reference records and disconnected Prisma. Existing setup owns synthetic credential environment values in child test processes; no persistent environment file or parent environment was modified.

## Inspected screenshots and limitations

**27 final PNGs** have JSON sidecars with actual viewport, role/state, browser version, date, capture HEAD, source note and zoom method/value. All were inspected through a contact sheet; representative full-size mobile Create/history, tablet My Actions, desktop Reassign and genuine-zoom images were also inspected. Long literal descriptions/notes and displayed worker names wrap, dialogs remain scrollable, and controls remain reachable. Native select labels can truncate visually when closed; their full option text remains available. These are representative viewport slices, not every scroll position.

- [Mobile Actions](390x844-staff-actions.png), [Requester Actions](390x844-requester-actions.png), [Create](390x844-create.png), [clear confirmation](390x844-clear-confirmation.png), [history](390x844-history.png), [My Actions](390x844-my-actions.png).
- [Tablet Actions](834x1112-staff-actions.png), [Create](834x1112-create.png), [history](834x1112-history.png), [My Actions](834x1112-my-actions.png).
- [Desktop Create](1440x900-create.png), [Edit](1440x900-edit.png), [Reassign](1440x900-reassign.png), [Complete](1440x900-complete.png), [Cancel](1440x900-cancel.png), [history](1440x900-history.png).
- [Field feedback](accessibility-create-errors.png), [history error/Retry](accessibility-history-error.png), [filter focus](accessibility-my-actions-focus.png).
- [Genuine zoom Actions](zoom200-staff-actions.png), [Create](zoom200-create.png), [history/footer](zoom200-history.png), [My Actions](zoom200-my-actions.png).
- [Pre-correction findings](before-correction/findings.json) and two preserved pre-correction screenshots retain failure history; they are not passing evidence.

Sampled computed normal-text contrast: field error **4.53:1**, Create primary button **6.63:1**, My Actions body text **11.99:1**, Apply button **6.36:1**. This sampling is not exhaustive contrast analysis or certified WCAG conformance. Labels, required/invalid/describedby semantics, textual status/identities, real-read loading, one error alert, focus visibility, trapping, inert background and idle Escape/focus return were exercised.

Screen-reader testing, cross-browser/OS coverage and comprehensive earlier-screen responsive/accessibility regression remain #49. Dashboard rendering/navigation integration remains #47/#48; Ticket workflow/cascade remains #46. Product scenario/DoD statuses and GitHub checklists were not promoted.
