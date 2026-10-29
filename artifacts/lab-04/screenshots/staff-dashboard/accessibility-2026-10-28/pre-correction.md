# Staff Dashboard accessibility: pre-correction evidence

2026-10-28 Asia/Bangkok. Execution HEAD `0d32d55a341233eb1d83d144eaebb2aa3c3d5dae`, with new accessibility tests/helper uncommitted; production unchanged. Existing 17/17 browser history and its screenshots remain separate and intact. This record precedes any production correction.

From root:

```text
npm.cmd run test:e2e -- e2e/lab-04/staff-dashboard.spec.ts --grep "Staff accessibility:"
```

Three collected/executed, one passed, two failed, zero skipped; exit 1, wall 64.40s (Playwright 53.7s). Keyboard order, textual status names, single loading/alert semantics and keyboard Retry passed. One controlled browser transport abort is labelled as injected, followed by a real successful API response.

Meaningful RED: `inputBoundary` measured **1.3021563367987066:1**, below 3:1, in the real rendered Staff Dashboard. The independent `selectBoundary` measurement is the same. Both use rgb(222,226,230) against white. Normal text samples pass 4.5:1; large text/control-state cues use 3:1. Comparisons use unrounded ratios and alpha-composited effective backgrounds. Bootstrap's low-contrast unfocused borders reach the new Staff screen; the intended correction is scoped to that screen, not a global inherited-control change. [Raw contrast observations](initial/contrast.json), [pre-correction screenshot](initial/keyboard-focus.png), [metadata](initial/keyboard-focus.json).

The other failure was in the new zoom test's immediate scroll/hit-test helper, not established product RED. Reusing the unchanged existing `reachable` helper waits for actual layout/scroll stability without weakening geometry assertions or adding sleeps. The isolated diagnostic then ran:

```text
npm.cmd run test:e2e -- e2e/lab-04/staff-dashboard.spec.ts --grep "Staff accessibility: genuine"
```

One collected/executed/passed, zero failed/skipped; exit 0, wall 21.10s (Playwright 20.2s). Real extension-controlled `chrome.tabs.setZoom/getZoom` proved 1.0→2.0→1.0, native window 1440×900, effective CSS viewport 1424×805→712×402→1424×805, pinch scale 1. Filters, cards, previews, injected transport recovery, Queue pagination and selected Action focus/browser-back return passed. Existing helper restored zoom, closed context and removed its owned temporary profile. This is pre-correction verification, not an application RED claim.

Both E2E TypeScript commands passed, exit 0, wall 2.96s and 1.60s:

```text
node server/node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --esModuleInterop --skipLibCheck --strict --typeRoots server/node_modules/@types --types node --jsx react-jsx client/src/vite-env.d.ts e2e/lab-04/staff-dashboard.spec.ts e2e/lab-04/staff-dashboard-accessibility-helpers.ts
```

Real Chromium/React/Express/PostgreSQL, one worker, zero retries, unchanged budgets. Actual guard/live dedicated database/schema checks preceded fixture writes; only the uniquely owned prepared schema was migrated/seeded. Exact domain preservation and owned cleanup/disconnection passed even on failure. Color-environment warnings remain. No screen reader, cross-browser or certified WCAG execution is claimed. Implementation review remains Pending; #53 navigation, #49 final integration and #50 release remain separate.

Threshold references interpreting the existing WCAG 2.2 AA target: [text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [meaningful control/state cues](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), [visible focus](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html). Decorative card borders are not treated as control boundaries. Native select arrow graphics, gradients, images and exhaustive contrast/conformance are outside these solid text/border samples.
