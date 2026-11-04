# D-12 isolated implementation candidate — 2026-11-03

Status: **partial candidate; verification blocked**. The amendment remains proposed. AI-assisted design review is neither student acceptance nor human peer approval. No deployment, performance or Issue acceptance is recorded.

## Isolation and source provenance

The original `feat/49-final-hardening` remains at `535a2e5426ffe263630e44b763779050a95ab436`, with its uncommitted `docs/lab-04/d12-amendment-proposal.md` preserved. Its only authorized correction makes current authorization/resource access precede original receipt inspection, and mutable discovery checks follow that inspection. An ignored owned worktree on `feat/49-d12-rc-candidate` contains the candidate. No original branch reset, stash, merge, dependency upgrade or DDL change occurred.

Local candidate commits, in order:

| Revision | Scope |
|---|---|
| `b5d1a64` | Proposed amendment and corrected replay order; no acceptance |
| `fd2c331` | Resource/replay tests-first evidence against unchanged production |
| `6692deb` | Additional resource cases and corrections to newly authored observers |
| `af21cb6` | First pre-BEGIN resource-coordination implementation; not whole-candidate GREEN |
| `c6775c0` | Real-logout tests, including a subsequently identified priority-fixture error |

After `c6775c0`, writer/session integration and compatibility edits are **pending uncommitted bytes**. The accompanying [command record](d12-rc-candidate-commands-2026-11-03.json) includes their final SHA-256 manifest. Earlier runs used different pending bytes, explicitly identified below. No execution is attributed to a later evidence/publication HEAD.

## Implemented candidate protocol

- Designated commands use READ COMMITTED and acquire same-checkout session advisory gates before BEGIN: maintenance shared; Administrator membership; normalized email; ascending Users; numbering year; ascending Tickets; ascending Actions. Seed takes maintenance exclusive. The old global lane/FIFO remains available only for historical explicit proof composition; converted commands do not use it.
- User-protected owned-Ticket discovery precedes Ticket gate acquisition; parent-protected cascade discovery precedes Action gate acquisition. Current owner/email/assignee footprint checks remain fail-closed, without late lower-ranked locks or unconfirmed planning retries.
- Legacy Comments/Notes and Attachments retain SERIALIZABLE, their transaction gates, compensation and execution budgets, while joining maintenance shared before BEGIN. Their waited-gate confirmed-40001 behavior remains. Read-only snapshots remain outside command selection.
- Existing public startup/deadline/release seams retain one effective maxWait, separate callback timeout, late-result draining, rollback and exact physical release. No new queue, pool size, timeout, retry or schema change is introduced.
- Designated Action receipt checks retain current authorization/resource access first, original receipt next, and new-command drift/stale/frozen/other guards afterward. An authorized replay survives real intervening reassignment; a revoked actor cannot replay.
- Request-local session context is established by real authentication middleware, never body identity fields. Legacy Ticket/communication/User writers revalidate their locked actor and session before writes, retaining inherited actor-conflict precedence. Login rechecks the actual verified credential/email snapshot under its User protection before creating a session. Password/User changes prelock affected sessions in order before domain locks, then revoke only after guards pass.
- Administrator edits count current active Administrators under the membership barrier, rather than relying on a preliminary ID list. Normalized old/new email gates and numbering-year namespace protect absent rows. Seed participates in exclusive maintenance admission.
- The three-attempt confirmed structured40001 classifier and separate defensive receipt recovery are unchanged. No generic P2034/P2028/deadlock/uniqueness/message-only retry was added.

These are implemented source changes, not a completed correctness proof. Remaining domain, mixed-isolation, seed, hot-resource and comprehensive checks are required before candidate recommendation.

## Executed attempts

Windows host; PowerShell; local guarded PostgreSQL; existing pinned Prisma/client/adapter6.19.3. No hosted CI. Times below are command wall seconds; exact UTC times and arguments are in the machine record. All tests ran sequentially with unchanged budgets, retries and pool settings.

| Attempt | Actual command from `server/` | Exit / files / collected-executed result | Wall s |
|---|---|---|---:|
| 01 | `npm.cmd test -- tests/lab-04/command-coordination.integration.test.ts tests/lab-04/command-replay-footprint.api.test.ts` | 1 / 2 / 4: 1 passed, 3 failed, 0 skipped | 20.461 |
| 02 | `npm.cmd exec -- tsc --noEmit` | 0 | 7.518 |
| 03 | Same two test files after added resource cases | 1 / 2 / 8: 6 passed, 2 failed, 0 skipped | 27.684 |
| 04 | `npm.cmd test -- tests/lab-04/command-replay-footprint.api.test.ts -t revoked=false` | 0 / 1 / 2 collected: 1 executed/passed, 1 filtered skip | 11.255 |
| 05 | Same two full test files after concrete new-fixture corrections | 0 / 2 / 8: all passed, 0 skipped | 22.268 |
| 06 | `npm.cmd test -- tests/lab-04/command-session.api.test.ts` | 1 / 1 / 3: all failed, 0 skipped; **two semantic failures, one setup failure** | 13.612 |
| 07 | `npm.cmd exec -- tsc --noEmit` | 2: one production type mismatch | 7.717 |
| 08 | Same TypeScript command after narrow predicate-type correction | 0 | 7.509 |
| 09 | `npm.cmd test -- tests/lab-04/command-session.api.test.ts tests/lab-04/command-replay-footprint.api.test.ts tests/lab-04/command-coordination.integration.test.ts tests/lab-03/admin-concurrency.api.test.ts tests/lab-03/password-change.api.test.ts tests/lab-03/auth.api.test.ts` | 1 / 6 / 34: 29 passed, 5 failed, 0 skipped | 52.540 |
| 10 | `npm.cmd exec -- tsc --noEmit` on final pending source/test edits | 0 | 7.654 |
| 11 | Same TypeScript command after adapting the remaining independent-pair diagnostic coordinator | 0 | 8.628 |

Framework durations:01 19.32s;03 26.64s;04 10.20s;05 21.26s;06 12.43s;09 51.41s. TypeScript10 ran 2026-11-03 12:11:21–12:11:28 UTC; final check11 ran 12:15:14–12:15:23 UTC. Before10, direct invocation of the temporary PowerShell runner was refused by Windows script execution policy; no npm command ran in that invocation. The normal `npm.cmd` TypeScript command then ran directly. No policy setting was changed.

### Semantic RED versus fixture corrections

01 reached real cross-process disjoint exclusion under the old global lane, and the old SERIALIZABLE isolation assertion: meaningful resource RED. Authorized replay passed immediately and is verification evidence. The revoked replay case stopped at its preparatory EDIT500; it did not establish a replay defect. A new direct model-method spy restored an undefined delegate method. A pass-through public query-extension observer corrected this; it preserves actual results and real independent reassignment/deactivation operations.

03 also exposed a new resource-test coordination deadlock: it awaited public timeout rejection before releasing the callback, although the required public promise waits for callback draining. The corrected test observes actual PostgreSQL rollback, retained advisory ownership and unsettled public promise while the callback is held, then releases it and verifies P2028 and balanced release. No budget or business assertion changed.

05 verifies six resource cases (including two actual child-process orders), plus two real-HTTP receipt cases. Disjoint callbacks overlap on separate connections; shared resources exclude; partial lock acquisition expires and releases earlier keys; shared maintenance peers overlap/exclusive maintenance waits; late checkout never invokes expired work and reconnect does not revive it; execution expiry retains resource ownership until callback drain.

06 demonstrates two real revoked-session writes through Comments and User edit before integration (201/200 instead of401). Its priority case **did not reach the intended operation**: the new fixture used `/priority` instead of inherited `/it-priority`, and a later inspection found unsupported `CRITICAL` instead of `URGENT`. Both setup defects are corrected locally, not claimed as executed semantic RED or GREEN.

09 executes and passes the two corrected revoked-session behaviors, the eight resource/replay cases, and inherited authentication/password checks. It remains a **failed affected run**. Four Administrator concurrency cases use observers selecting only SERIALIZABLE business transactions; they do not observe the newly converted RC callbacks. The fifth failure is the new priority-fixture readiness failure. These original failures are retained, not replaced by TypeScript or a targeted pass.

After09, narrowly adapted observers identify selected RC commands through the public composition marker. Defensive receipt recovery remains separately read-only and unselected. Snapshot read assertions remain REPEATABLE READ/read-only. Independent CREATE coordination now holds all eight genuinely overlapping disjoint callbacks, instead of requiring the superseded global lane's single callback. The genuine COMMIT40001 regression explicitly opts those proof transactions back into SERIALIZABLE through the public test boundary and uses an independent real PostgreSQL participant; no RC fault is substituted. Its independent winning control follows loser recovery. These adaptations are **not yet executed**.

07's production type error was a current-actor predicate expecting a newly extended full locked-User type while its preliminary eligibility projection contains only role/activity. Narrowing the predicate's required type fixed that compilation issue; no outcome was weakened.

## External execution blocker

The next focused database command was rejected **before execution** by automatic approval review: authentication access token could not refresh because the connected account had logged out/changed. This is approval infrastructure failure, not a safety determination or application test failure. It also prevented publication. The rejected combined command performed no edits or tests; its safe local edits were subsequently applied separately. No database command, remote operation or escalation was retried to bypass that restriction.

The intended focused next command is:

```text
npm.cmd test -- tests/lab-04/command-session.api.test.ts tests/lab-04/independent-action-create.api.test.ts tests/lab-04/action-commit-recovery.api.test.ts tests/lab-03/admin-concurrency.api.test.ts
```

No comprehensive server suite, build, representative hot-resource cohort or T-47 ran. T-47 remains failed. Pool occupation under hot-resource waiting is specifically unmeasured for this candidate; eliminating the global lane is not proof of acceptable contention or latency.

## Cleanup and preservation

Each executed resource case drains work, waits for child exit, checks owned tagged connections absent, disconnects clients and drops only its owned schema. Executed Action fixtures verify exact owned Ticket/User IDs absent and disconnect;09 retains those successful cleanup messages despite its failed verdict. Auth fixtures retain their normal teardown. No command was pending when the approval rejection occurred.

A final fresh database/process-ownership audit could not be completed: further privileged database execution was blocked and the unprivileged Windows process inventory returned Access denied. Do not turn successful test cleanup into an independently verified final zero-resource claim. Private command logs remain retained locally; only redacted classifications, counts and source manifests are included here. No raw credentials, database URLs, SQL parameters, session/hash values or private contents are published.

The original branch and uncommitted proposal are preserved. All historical artifacts, benchmark/helper/workload plan, dependencies, schema/migrations, accepted decisions,55 Planned scenarios and Product DoD states remain unchanged. The ignored worktree has the owned test environment copy and dependency junction needed to resume; neither is a tracked artifact. Candidate integration/observer edits and this evidence are not published or represented as a completed GREEN commit.

## Resume and review gate

Restore the approval connection, then run the focused command above once against the dedicated guard. Inspect actual results, correct demonstrated defects, and continue dependency order: affected retry/receipt/workflow/User/session/seed/communication/attachment/snapshot checks; bounded disjoint and hot-resource write/read measurements; TypeScript/build and comprehensive discovery excluding only unchanged T-47. Run T-47 at most once only if that correctness and contention evidence supports the performance candidate. Commit remaining candidate and evidence separately, then normally publish only the isolated branch.

The amendment is available for student and peer review as **proposed**. The implementation candidate is **not yet ready for a correctness or performance recommendation**; the concrete current blocker is approval authentication, with the enumerated execution obligations still outstanding. The accepted Lab-only failed-start metadata-retention and dependency-audit limitations are unchanged.
