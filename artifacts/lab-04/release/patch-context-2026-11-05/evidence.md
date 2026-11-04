# PR61 PATCH context diagnosis - 5 November 2026, Asia/Bangkok

**Verdict: reproduced semantic failure; no justified correction yet.** The accepted legacy harness correction is not reopened. No comprehensive suite, T-47, client/build/E2E, Narrator or screenshot execution occurred. The latest complete server verdict remains **2,109 passed / 1 failed / exit 1**. This new two-file diagnostic is separate evidence, not a replacement release result.

## Review and source state

- [cottonlnwza REQUEST CHANGES](https://github.com/chaproi/toktickit/pull/61#pullrequestreview-5775027525), submitted 2026-11-04T20:08:24Z, reviewed exact `57cdda549b33e29a864974f0b9ce518e1ce5ce21`.
- The reviewer accepts the existing legacy harness fix and its RED/GREEN. They reject treating the remaining server failure as a qualified release pass. New work is limited to PATCH context attribution; reflection is untouched pending genuine student wording.
- Clean review branch was safely fast-forwarded from `77cbf05` to `57cdda5`. Execution uses `57cdda5` plus explicit temporary test-only diagnostic wiring. Production and original test assertions, case budgets, concurrency, fixtures, pools and retry rules are unchanged.
- Existing lockfile-installed/generated Prisma 6.19.3 dependencies were reused through an owned junction. Exact SeaweedFS 4.51 prerequisite was restored from the official release, SHA256 `08866a53e1bdd5378ee9880f8ee30d981d1bbb6ae22ee1897deb17ff87f8d2fb` for its archive. No package or settings changes.

## Historical file context and static inspection

The retained full JSON's exact `action-patch-projection.integration.test.ts` timestamps are 1793817461355 to 1793817512552.545 ms. There is no overlapping reported file interval. Immediately before it, `attachment-cold-upload.integration.test.ts` ended at 1793817459915.5044. The preceding sequence was dashboard snapshot, legacy Actions, CREATE contention, Staff Actions, bounded t47 diagnosis, authorization, cold upload, then PATCH. This ordering is execution evidence, not a newly imposed full-suite order.

Static inspection found: the cold file awaits its lifetime promise, app disconnection, storage close/process exit and environment restoration; bounded diagnostic writers await settled work and listener/client cleanup; snapshot writers end their coordination clients. PATCH itself awaits all started HTTP work in `finally`, stops its sampler, destroys agents, closes the listener, disconnects the client and restores mocks/settings. Static cleanup code is not proof that all historical async work drained.

The new experiment preserves the **immediately preceding cold-upload file**, rather than collecting another standalone PATCH pass. Public Vitest sequencing runs that file and PATCH in that order with the normal global setup. A test-only setup observer records per-file worker PID, public pool events/counts, live database activity/locks and environment equality; a restored public prototype wrapper observes the real adapter without fabricated results. The existing pass-through request/attempt SQL-comment/catalog observer records PID/resource/blocker chains. No private pg/Prisma engine fields, raw SQL, parameters, credentials, cookies, tokens or private business contents are published.

## Actual commands and attempts

Commands run from review worktree `server/`; `<private>` denotes the owned evidence directory, not a connection target.

| Attempt | Command | Actual result |
| --- | --- | --- |
| Types | `npm.cmd exec -- tsc --noEmit` | Exit 0; 33.095 s. Checks new test helpers; not an application test. |
| Initial context setup | `npm.cmd test -- tests/lab-04/attachment-cold-upload.integration.test.ts tests/lab-04/action-patch-projection.integration.test.ts --config vitest.patch-context.config.ts --reporter=default --reporter=json --outputFile=<private>/context-vitest.json` | Exit 1; 9.022 s outer / 5.99 s Vitest; **0 tests collected/executed**. `TypeError: Sequencer is not a constructor`. New diagnostic config incorrectly used a path instead of Vitest 2's public constructor interface. Not semantic RED. |
| Corrected context | Same two files/config, with `--outputFile=<private>/context-confirm-vitest.json` | Exit 1; **2 files / 3 collected/executed / 2 passed / 1 failed / 0 skipped**; 84.107 s outer / 81.46 s Vitest. Cold upload 2/2; PATCH 0/1, HTTP expected 200 / actual 500. |

The configuration error was corrected by importing the same sequencer class and supplying its constructor. No underlying assertion or budget changed. The initial failed setup and its post-setup cleanup proof are preserved. The corrected diagnostic configuration was then exercised by the real run; no later static check of that top-level config is claimed. A preliminary runner preparation stopped before a command because the old temporary Seaweed binary was absent; the exact existing prerequisite was restored before execution.

No outer deadline, signal or spawn error occurred in either test attempt. Direct log files avoid output buffering/maxBuffer. All requests were drained after the semantic failure; no replacement run follows it.

## Isolation observations in the new failing run

Cold-upload worker **3812** and PATCH worker **30692** are distinct processes. The cold file's after-boundary and PATCH's before-boundary each report **zero other database connections and zero advisory locks**. Cold pool total/idle/waiting is 0/0/0; scoped environment equality and the adapter-prototype restoration check pass. PATCH's final boundary also has empty pools, no connections/locks and restored environment/prototype. Public boundary queries exclude only their own observation connection.

Thus this reproduction does **not** show a surviving cold-upload connection/lock or an inherited same-process module/prototype as its blocker. It does not prove every possible earlier-file/host influence absent, or establish the old full run's holder. There is no inference from final cleanup back to an earlier wait.

## New failure: actual request/PID/resource attribution

Raw artifact: [patch-chain-phases-2026-11-04-66d7593f.json](patch-chain-phases-2026-11-04-66d7593f.json); [derived analysis](analysis.json), [holder timelines](holder-timelines.json). The historical UTC filename is retained; actual execution is 5 November Bangkok. Times below are monotonic milliseconds in this **new** artifact's epoch.

First failed response: `edit-28`, attempt 1, backend **46888**. It returns safe HTTP 500 `INTERNAL_ERROR`. Recorded internal classification is **TransactionStartDeadlineError / P2028 / transaction-start / maxWait 2000**; engine-provided subtype remains null.

| Event | atMs / interval | Evidence |
| --- | --- | --- |
| Attempt selected | 46517.146 | One unchanged 2000 ms startup allowance |
| Checkout | 46517.418 to 46654.010 | 136.592 ms; not the dominant retained interval |
| User resource 21 query | 46732.543 to 48354.944 | 1622.401 ms wire interval; public samples confirm advisory blocking during it |
| First retained chain | 46755.608 | `edit-28` PID46888 waits behind granted User21 holder `edit-0` PID6064; edit-0 waits on edit-1 PID1652, then edit-2 PID31864, edit-3 PID58480 and edit-4 PID40880. A queued/soft blocker is separately represented. |
| Later User21 holder | 48328.651 | PID63136 / edit-29 has the matching granted User21 lock |
| User resource 50 query | 48372.621 to 48537.453 | Query remains in flight across the deadline; samples identify granted holder PID26816 / start-27 |
| Deadline / physical teardown | 48518.091 / 48520.676 | Deadline observed during resource acquisition, before BEGIN/callback |
| Safe rejection / drained finish | 48523.400 / 48538.589 | Primary classification retained before cleanup; late query/cleanup drained |

The holder attribution uses matched granted advisory scope/key plus current/last tagged statement and the request timeline. An idle backend's last tag alone is not a holder proof. Samples are not an atomic lifetime trace; a repeated PID subgraph is not a deadlock cycle. All matching granted locks are retained separately from soft queue blockers.

Other failing EDITs are 17,18,19,16. For example edit-17 PID47860 waits on User39 held by edit-18 PID32268; edit-18 waits on User40 held by edit-19 PID22984; edit-19 waits on User42 held by edit-21 PID53116. Those are live PATCH-cohort dependencies. All five have zero callback-entry observations. No generic P2028 classification is applied to the older benchmark or unrelated failures.

## What the evidence does and does not justify

The fixture shares worker Users in a ring: each EDIT locks its actor, old assignee `(i+1)%30` and new assignee `(i+2)%30`. Disjoint Ticket/Action targets therefore do **not** make these commands independent. The new failure demonstrates partial-footprint User-lock convoys within the real coordination protocol, not a surviving prior test resource. Example holder edit-29 enters its callback at 47939.374, exits at 48162.338 and physically releases at 48359.052; its finish-to-release span is 166.558 ms. These spans are serial portions of a critical path; they must not be added to overlapping waits as independent totals.

This is not yet a demonstrated *unnecessary* production cost or a proven breach of a deadline/cleanup invariant. The accepted protocol deliberately holds ordered resource protections through draining and physical release, and it correctly rejects startup beyond the existing allowance. Changing User lock modes/footprint semantics, replacing acquisition with a new queue, reducing concurrent workers, altering expected outcomes, or merely increasing budgets would not be a justified minimal fix from this observation. A sample showing WalWrite at one holder does not establish machine/storage pressure as the cause of the cohort.

**Missing before a correction:** a controlled, bounded distinction between necessary same-User contention and avoidable acquisition/cleanup round trips or observer work, including the earliest live holder's exact non-overlapping acquisition/body/release path. The current trace measures wire intervals and callback spans but not database execution versus application scheduling within every interval. It also does not retain a complete native lock-holder trace for the original full-run failure.

**Next proposed bounded scope, not executed:** assess one concrete resource-acquisition/release correction against this captured convoy, preserving the same 30 workers, request overlap, ordered protections, current authorization/receipt behavior, all assertions and existing single startup budget. Any protocol change requires its resource/ordering proof and meaningful RED before adoption. Do not rerun the full suite merely to get another sample, and do not change the accepted legacy correction. No production change is made in this batch because that minimum-correction argument is not yet established.

## Reached and unreached assertions

There are **137 real HTTP responses**: EDIT 25x200 + 5x500; START 25x200; COMPLETE 12x200; CANCEL 13x200; Requester Dashboard/list/detail each 19x200. The failed workers do not issue their two later lifecycle requests. These are not 147 successes. The successful responses reach the existing identity/version/timestamp assertions.

The test fails at its HTTP 200 assertion and remains at `phase=observed-overlap`. Final exact +90 history/+90 receipt totals, all final lifecycle rows and all90 projection-bound checks are **unreached**, not passing. No complete persisted rollback comparison for the failed commands is invented; the trace shows they do not enter business callbacks. Existing failure cleanup assertions still execute.

## Cleanup and preserved scope

The independent guarded live-target probe after execution confirms: distinct dedicated database, 0 other connections, 0 idle transactions, 0 advisory locks, no new owned schemas/directories, and both pre-existing schema/table checksums unchanged. Owned Seaweed process exited; no competing/remaining repository Node/weed workload was found. Boundary and PID observers were drained/restored. All temporary executable diagnostic files and PATCH wiring are archived as text and removed; original PATCH/cold file bytes are restored exactly. No credentials or environment content is committed.

Original full-run and standalone artifacts are untouched. Reflection/report/PDF files are preserved byte-for-byte. No new comprehensive correctness execution is justified until a substantive supported correction passes affected verification. **PR61 remains REQUEST CHANGES, with the legacy correction accepted and PATCH unresolved.**
