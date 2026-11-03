Addresses #49.

Proposes the explicit-lock READ COMMITTED command candidate for student and human peer review. This replaces selected commands' SERIALIZABLE/global-admission protocol only if the D-12/D-13 amendment is actually accepted. It is not final Issue49 completion, deployment approval or a request to waive known limitations.

**Prepared PR base:** `lab4-staging` (`dd8eafb9a101625d07e4ce164fcc856402ecaed5`), following Issue49's integration DoD. **Head:** `feat/49-d12-rc-candidate`. The original hardening branch `feat/49-final-hardening` at `535a2e5426ffe263630e44b763779050a95ab436` is the focused RC comparison baseline, not an alternative integration target. Review both the parent's earlier adapter/Queue/hardening work and the RC increment; neither is silently treated as approved. No mixed-version rollout is supported.

Review starts with `docs/lab-04/d12-candidate-review.md` in this change: exact proposed D-12 replacement/consequential D-13 paragraph, participating-writer/session matrix, actual implementation refinements, both-order invariants, rollout/rollback and explicit remaining obligations. The [original proposal](https://github.com/chaproi/toktickit/blob/2671b3a2374bb10fe2cbaae50d6b844c66e7f0e4/docs/lab-04/d12-amendment-proposal.md) and historical failures remain records; accepted normative documents are not relabelled as amended.

## Implementation scope

- Supported public client/adapter seams acquire ordered resource locks before BEGIN, on the same physical checkout, under the existing single maxWait allowance. Compatible shared maintenance permits disjoint commands to overlap; same-resource writers exclude each other. No hidden all-writer FIFO remains for selected commands. Callback/transaction draining precedes reverse unlock and exactly-once physical release.
- Current User/session authorization and required resource access precede original receipt lookup. Authorized replay precedes mutable footprint drift/stale/frozen checks; revoked replay is denied. Fresh token/eligibility/owner/lifecycle guards, atomic history and receipt-last persistence remain.
- All participating Action/Ticket/User/login/password/seed writers are covered. Legacy communication/attachment SERIALIZABLE paths and read-only RR snapshots remain. Missing-row/set predicates have owning-resource barriers; seed is exclusive maintenance. Reference reads use shared maintenance coverage because current reference mutation is seed-owned. Administrator membership protection is conservative for every User create/edit.
- Keep only positively confirmed structured 40001 retries, at most three fresh attempts, separate defensive receipt recovery and all negative classifications. Preserve genuine SERIALIZABLE COMMIT-error evidence with an explicitly labelled test override/native participant.
- Retain verified read consolidation and shared PATCH projection (four actual reads reduced to one current safe identity lookup), including historical identity names and nullable performer. No pool, budget, workload, retry or dependency tuning accompanies the review package.

Tests-first resource/session RC changes, fixture/observer corrections, actual failures and later confirmations remain distinct. Read/PATCH RED-to-GREEN is separate from immediately passing verification. The focused candidate-to-parent increment changes14 production/seed paths with no DDL/migration/backfill/dependency-manifest change. The full staging PR additionally includes the parent pinned6.19.3packages/schema-generator configuration,public connection/client/deadline/release/UTC/error seams,guarded test preparation,ordinary Staff Queue SQL pagination,CREATE projection and two real browser recovery cases. All those paths and historical attempts require review;database DDL/historical migrations,client production and root browser settings remain unchanged. Quiesced all-process adoption and rollback are required; arbitrary nonparticipating SQL and remote/TLS deployment are outside the verified configuration.

## Verification and actual provenance

New checks at **2671b3a2374bb10fe2cbaae50d6b844c66e7f0e4**, local Windows, 4 November Asia/Bangkok:

- Client `npm.cmd test`: **24 files /352 collected, executed and passed**, zero failed/skipped;38.41 s framework/41.766 s outer.
- Client `npm.cmd run build`: passed,5.337 s outer.
- Literal root `npm.cmd run test`: exit1,missing script,zero collected/executed. The user explicitly clarifies `npm.cmd run test:e2e`; no configuration workaround is added.
- Root `npm.cmd run test:e2e`: **15 files /72 collected, executed and passed**, zero failed/skipped;285.780 s outer,one worker, zero retries,unchanged timeouts. Real Chromium 153.0.8010.12/React/Express/auth/isolated PostgreSQL.

Carried server evidence remains **99 files /2110 passed**, only unchanged T-47 excluded, TypeScript/build passed, at8e80cd4 with pending production bytes committed unchanged as0abd40d. All 215 server source/test/config hashes still match. [Original exact commands/results](https://github.com/chaproi/toktickit/blob/2671b3a2374bb10fe2cbaae50d6b844c66e7f0e4/artifacts/lab-04/hardening/patch-projection-commands-2026-11-04.json) retain the earlier failed attempts. It was not rerun here or claimed as unfiltered/current-publication-HEAD execution. Later review-document publication changes documentation/evidence only; no hosted CI claim.

**T-47 has a complete passing B observation, observed variability and acceptance pending.** [Complete pinned ABBA ledger](https://github.com/chaproi/toktickit/blob/2671b3a2374bb10fe2cbaae50d6b844c66e7f0e4/artifacts/lab-04/hardening/t47-abba-2026-11-04/comparison.md): A1 and B2 pass every inline assertion; B3 fails CREATE p95 and A4 fails aggregate. Aggregate measured p95:390.214/401.518/441.080/963.614ms. Every run retains5000 warm-up + 500 measured requests,zero errors,exact persistence,zero replay and original thresholds. Both B results and all historical failures remain. No new four-of-four acceptance rule or benchmark repeat occurs in this package.

## Limits and pending gates

The ABBA run1 post-execution telemetry serializer lost its one-second array; before/after observations/full samples/failure/cleanup are retained, without a replacement run. PostgreSQL process CPU is unavailable. Two observations/version establish no broad confidence, consistent latency benefit or definitive environmental cause. The accepted Lab-only failed-start bookkeeping-retention limitation and15untriaged dependency findings remain; neither is deployment approval.

Automated browser responsive/keyboard/contrast/genuine 2.0 tab zoom checks pass. Fresh browser captures are privately archived,102historical overwrites restored exactly and63 new generated files archived/removed;all546 pre-run artifact bytes and old inspection provenance remain. Fresh images are not newly inspected visual evidence. Actual screen-reader/broader-browser work, current integrated screen/state visual review, final55-scenario reconciliation and Issue49 implementation acceptance remain. #45/#48/#53 administrative/shared handoffs are preserved; [#50](https://github.com/chaproi/toktickit/issues/50) owns release/submission. No product scenario or Product DoD is promoted.

Independent cleanup proves zero owned schemas/fixtures/sessions/idle transactions/locks, new zoom profiles/processes and application listeners. Existing browsers/worktrees/proposal are preserved. Existing React act/Router/jsdom/pg/color warnings remain visible.

**Student amendment adoption and actual human implementation review remain Pending.** Review the exact protocol, writer completeness, session/mixed-isolation ordering, rollback/resource guarantees, supported configuration, complete performance evidence and remaining integrated obligations. No predecessor approval substitutes for this review; do not merge or deploy based only on this prepared package.
