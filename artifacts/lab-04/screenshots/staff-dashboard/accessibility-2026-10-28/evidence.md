# Staff Dashboard accessibility addendum and review handoff

2026-10-28, Asia/Bangkok. This supplements, without rewriting, the [2026-10-27 browser report](../evidence.md), its 17/17 result, earlier failures and three ordinary-zoom screenshots. Implementation peer review remains **Pending**. No shared scenario, Issue or Product DoD status is promoted.

## Source state and separate commits

- Initial execution HEAD: `0d32d55a341233eb1d83d144eaebb2aa3c3d5dae`; new tests/helper were pending and production was unchanged. [Pre-correction evidence](pre-correction.md) retains the genuine contrast RED and separately passing zoom diagnostic.
- RED commit: `725e1445697484f5e6efa7d5b6ab9634b75ff1ca`, adding three focused cases and measured initial evidence. All original eight browser case bodies/assertions remain intact; only imports and appended cases were added.
- Successful corrected execution used **HEAD `725e1445697484f5e6efa7d5b6ab9634b75ff1ca` with two pending production files**: `client/src/components/StaffDashboard.tsx` and `client/src/lab2.css`. Those exact production bytes were subsequently committed as GREEN `d562960dc019833669c3e59caef6919f11cd9a7c`. No post-GREEN-commit or exact-publication-HEAD rerun is claimed.
- Correction: a `staff-dashboard` scope class and one scoped filter-border rule using the existing `--text-muted` token, declared before existing focus rules. It changes no shared token, earlier-screen selectors, request/DTO/query behavior, navigation or backend code. Existing green focus styling remains effective.

## Actual command ledger

Local Windows/PowerShell, Node 24.14.0/npm 11.9.0, Playwright Chromium **153.0.8010.12**. Real React/Vite, Express, authentication and PostgreSQL; one worker, zero retries and unchanged timeouts/configuration. Successful reads were never fabricated. Existing global setup owns and migrates a unique disposable schema in the guarded dedicated database, distinct from operational.

| Attempt / command | Files/cases collected and executed | Passed | Failed | Skipped | Exit | Wall duration |
| --- | --- | --- | --- | --- | --- | --- |
| Root: `npm.cmd run test:e2e -- e2e/lab-04/staff-dashboard.spec.ts --grep "Staff accessibility:"` | 1 file / 3 cases | 1 | 2 | 0 | 1 | 64.40s; Playwright 53.7s |
| Root: `npm.cmd run test:e2e -- e2e/lab-04/staff-dashboard.spec.ts --grep "Staff accessibility: genuine"` | 1 file / 1 case | 1 | 0 | 0 | 0 | 21.10s; Playwright 20.2s |
| Root, scoped capture phase `final`: `npm.cmd run test:e2e -- e2e/lab-04/staff-dashboard.spec.ts` | 1 file / 11 cases | 11 | 0 | 0 | 0 | 47.87s; Playwright 47.0s |
| Client: `npm.cmd test -- tests/lab-04/StaffDashboard.test.tsx` | 1 file / 25 cases | 25 | 0 | 0 | 0 | 57.28s; Vitest 50.29s, test bodies 3.81s |
| Client: six inherited files, exact command below | 6 files / 84 cases | 84 | 0 | 0 | 0 | 8.87s; Vitest 7.96s |
| Client: `npm.cmd test` | 23 files / 318 cases | 318 | 0 | 0 | 0 | 34.89s; Vitest 33.93s |
| Client: `npm.cmd run build` | TypeScript and Vite build | Passed | — | — | 0 | 6.26s; Vite 0.97s |

```text
npm.cmd test -- tests/lab-03/AuthenticatedShell.test.tsx tests/lab-03/Login.test.tsx tests/lab-03/ChangePassword.test.tsx tests/lab-03/StaffTicketQueue.test.tsx tests/lab-04/MyActions.test.tsx tests/lab-04/RequesterDashboard.test.tsx
```

Both root E2E TypeScript checks passed, exit 0, wall 2.96s and 1.60s:

```text
node server/node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --esModuleInterop --skipLibCheck --strict --typeRoots server/node_modules/@types --types node --jsx react-jsx client/src/vite-env.d.ts e2e/lab-04/staff-dashboard.spec.ts e2e/lab-04/staff-dashboard-accessibility-helpers.ts
```

The first run's contrast assertion exposed an actual 1.30:1 unfocused Search/select boundary. Its zoom failure was a new immediate scroll/hit-test assumption, corrected by reusing the unchanged established `reachable` helper; the isolated zoom diagnostic then passed **before** production correction. No timing sleep, timeout increase, retry configuration or assertion weakening was used. The valid contrast failure remains RED; passing keyboard/native-zoom work is verification, not invented RED. Full server and full-product E2E suites were not rerun. Server 2,002/build remains carried at its original `b2bdec2d93d7207e1a1d927b972a05754b55cc8f` provenance.

Warnings: browser NO_COLOR/FORCE_COLOR notices and Git's repository line-ending notice; full client retained ten React act warnings, two Router future-flag notices and one jsdom navigation diagnostic. Final browser page-error checks were zero. A local byte-prefix check initially compared Git LF with working CRLF; normalized committed-source comparison confirmed unchanged original case bodies. No application test failure was hidden by that audit correction.

## Genuine native 200% zoom

The unchanged [genuineZoom helper](../../../../../e2e/lab-04/action-layout-helpers.ts) launched an owned persistent Chromium context with **native window 1440×900, `viewport:null`**, loading the existing [extension](../../../../../e2e/fixtures/tab-zoom-extension/service-worker.js). Its actual `chrome.tabs.setZoom` and `chrome.tabs.getZoom` returned **1.0 → 2.0 → 1.0**. [Raw observations](final/genuine-zoom.json): effective CSS viewport **1424×805 → 712×402 → 1424×805**, pinch scale **1** throughout. This is not CSS zoom, transforms, viewport emulation, deviceScaleFactor, pinch zoom or screenshot enlargement. At 2.0, capture used the native compositor via CDP so screenshot automation did not reset zoom.

At verified 2.0, all seven filters were reached through ordinary scrolling; textual metric cards and long literal previews reflowed without page-wide overflow. Keyboard Retry recovered from one deliberately injected browser transport abort through a real API response. A real mine drill-down retained its predicates and 12-Ticket total, reached pagination and loaded page 2, then the selected Action was keyboard-opened and actually focused. Its Start control remained reachable. Browser Back returned to the delivered Dashboard with the category filter intact. This verifies that delivered screen/return contribution, not #53's entire landing/global-navigation chain.

The helper restored 1.0 in both success/failure paths, closed its context and removed its owned temporary profile. Independent post-run profile count was zero.

## Keyboard, semantics and contrast

Programmatic labels match all seven optional controls. Real Tab order runs Search → Category → Related System → Requested Priority → IT Priority → Current Status → Owner → Apply → Clear → first metric. Textual names and numeric counts identify all Ticket and Action statuses independently of color. Pending reads expose one labelled `role=status` with `aria-busy=true` without fabricated widgets. One controlled transport abort exposes exactly one `role=alert`, then keyboard Retry restores real data and sequential keyboard navigation remains inside the recovered screen. Stored ARIA snapshots are DOM/accessibility-tree evidence, **not actual screen-reader execution**.

Contrast samples use actual rendered sRGB styles, alpha-composited foreground/ancestor backgrounds and unrounded comparisons after actual CSS transitions finish. Decorative card borders are excluded. Text uses **4.5:1** for ordinary size and **3:1** for large text; meaningful control/state cues use **3:1**, following the contract's WCAG 2.2 AA target ([text](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [non-text](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), [focus](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)).

| Actual sampled pair | Final ratio | Threshold | Observation |
| --- | --- | --- | --- |
| Heading / page background | 12.36:1 | 3:1 large text | Passed |
| Label, input/select text, preview body / white | 15.43:1 | 4.5:1 | Passed |
| Unfocused input and select borders / inner and outer white | **4.97:1**, from **1.30:1** | 3:1 | Actual RED→GREEN correction |
| Apply, metric label/count, textual status / solid background | 6.63:1 | 4.5:1 ordinary; 3:1 large count | Passed |
| Clear text / white | 4.69:1 | 4.5:1 | Passed |
| Focused Search/Apply border / adjacent white | 5.40:1 | 3:1 | Existing focused green preserved |
| Metric keyboard outline / page background | 17.68:1 | 3:1 | Visible native outline |
| Error text / effective alert background | 10.22:1 | 4.5:1 | Single honest alert |
| Retry text / solid green | 6.63:1 | 4.5:1 | Passed |
| Retry focus border / effective alert background | 4.05:1 | 3:1 | Passed |

[Full contrast observations](final/contrast.json) and [recovery observations](final/recovery-1.json) retain actual colors, backgrounds, indicators, font sizes and thresholds. Focus samples measure the indicated outline or focused border against its adjacent exterior; the translucent shadow is not claimed to independently meet 3:1. Native select arrow graphics, anti-aliasing, unsupported image/opacity environments and exhaustive interactive states are outside these solid text/border samples. This is sampled evidence, not certified WCAG conformance.

## Inspected final captures

Every final screenshot was visually inspected at native capture resolution on 2026-10-28. Eight captures and their same-name `.json` metadata retain execution HEAD, pending production paths, browser, viewport, zoom and inspection provenance. Viewport-fold content is naturally scrollable; the images do not claim every field/record fits simultaneously.

| Screenshot and matching metadata | Inspected state |
| --- | --- |
| [keyboard-focus.png](final/keyboard-focus.png), [metadata](final/keyboard-focus.json) | Stronger unfocused field boundaries and focused Apply at ordinary zoom |
| [error-retry-1.png](final/error-retry-1.png), [metadata](final/error-retry-1.json) | One ordinary-zoom error, no fake metrics, focused Retry |
| [zoom200-filters.png](final/zoom200-filters.png), [metadata](final/zoom200-filters.json) | Lower filter controls/Apply/Clear at native 2.0; all seven controls independently reached by scrolling |
| [zoom200-cards.png](final/zoom200-cards.png), [metadata](final/zoom200-cards.json) | Textual cards and visible keyboard outline at native 2.0 |
| [zoom200-preview.png](final/zoom200-preview.png), [metadata](final/zoom200-preview.json) | Literal summary, status/priority, owner and timestamp reflow |
| [error-retry-2.png](final/error-retry-2.png), [metadata](final/error-retry-2.json) | Single safe error and reachable Retry at native 2.0 |
| [zoom200-pagination.png](final/zoom200-pagination.png), [metadata](final/zoom200-pagination.json) | Queue card layout, textual total, disabled Previous/enabled focused Next |
| [zoom200-selected-action.png](final/zoom200-selected-action.png), [metadata](final/zoom200-selected-action.json) | Selected record outline, literal Notes and reachable Action controls |

Additional raw JSON: [contrast](final/contrast.json), [genuine zoom](final/genuine-zoom.json), [ordinary recovery](final/recovery-1.json), [zoomed recovery](final/recovery-2.json). The committed initial contrast JSON/screenshot/metadata and pre-correction report remain unchanged; surplus newly generated initial diagnostics and all run logs/failure contexts were archived separately. Six overwritten historical viewport image/metadata files were archived as fresh outputs, then restored to their exact saved bytes. No broad reset/clean was used. Tracing remained off under committed configuration.

## AC/T contribution and concrete review handoff

| Responsibility | Observed contribution or remaining gate |
| --- | --- |
| #48 domain AC-37/T-37 | Prior exact three viewports plus corrected-domain 11/11 browser rerun; usable filters/cards/previews/Queue paging, long literal content and no unintended page-level overflow |
| #48 domain AC-38/T-38, related AC-36/T-36 | Native verified 200% reflow, keyboard order/labels/textual status, selected focus/browser-back return, loading/alert/Retry semantics and measured contrast correction now evidenced |
| #48 documentation preparation | Update only necessary six Lab 4 documents in a separately authorized batch: actual API-09/list/UI paths, real RED/GREEN versus verification history, this measured correction, command provenance and limitations; remove stale current no-implementation/zoom wording without erasing history or promoting shared scenarios |
| #48 actual implementation peer review | **Pending**. Prepare an authorized PR into lab4-staging with `Addresses #48`, exact code/evidence SHAs and remaining boundaries. A real reviewer must review the implementation/correction; historical contract approvals and this AI-assisted audit do not approve it. No PR/review request/message is sent here. |
| #53 under #45 | Still implements password-gated role landing, shared Dashboard active navigation and reviewed full return/cache-isolation integration. Current roleHome/global navigation remain unchanged; #48 screen delivery is not circularly blocked by that future integration. Full AC-35/T-35 remains incomplete. |
| #49 | Final integrated verification, comprehensive earlier-screen accessibility/responsiveness, real screen-reader and cross-browser contributions, wider shared scenarios/performance. This domain result does not transfer an unfinished Staff screen defect to #49. |
| #50 | Release/submission after actual verification and review gates; no release or whole-product readiness claim |

Review checklist still open: reconcile current implementation/test/AI evidence in the six contract documents without changing accepted decisions; complete the pre-PR scope/regression assessment required by the publication task; obtain actual implementation peer review; integrate through reviewed lab4-staging; retain linked #53/#49/#50 obligations. The included Staff accessibility increment is ready for implementation peer review preparation on the observed evidence, **not approved or complete Issue acceptance**. No personal reflection is authored.

## Cleanup and preserved scope

Actual guard/live dedicated target checks preceded all fixture writes. Existing owned fixtures compared exact Ticket/Action/history/receipt/Notes state around reads and used FK-safe cleanup; synthetic users/sessions/references were removed and Prisma disconnected. The deliberate transport route was removed and held requests settled. Scoped capture phase was restored in `finally`. Independent post-run checks found **zero prepared schemas, zero idle transactions, zero application listeners at 3100/4173 and zero owned zoom profiles**.

All prior component/API tests, shared browser fixtures/helpers, server/schema/migrations/seed/configuration/dependencies and historical image bytes remain unchanged. The original eight browser cases/assertions are preserved; the spec adds imports and three focused cases only. Production scope is exactly two files, one scope class and five scoped CSS lines. Existing evidence.md receives only a dated append-only pointer to this addendum. No Issue/PR/project/scenario/checklist updates, reviewer messages, approvals or personal reflection are included.
