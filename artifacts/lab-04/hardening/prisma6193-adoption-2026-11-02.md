# Lab4 Prisma6.19.3 candidate adoption ledger - 2026-11-02

## Prospective student decision and execution plan

Starting verified local/origin/upstream HEAD:cc137b47a033feeb956903527a989f3afae14fbf, feat/49-final-hardening, clean tree/index. No applicable AGENTS.md found.

Student decision,2026-11-02: accept failed-start transaction bookkeeping retention as a known limitation **only for the Lab4 candidate**. Failed-start records may accumulate until disconnect; no public per-record cleanup or memory-growth bound has been established. This accepts neither a fix nor production deployment or peer approval. The exact [real late-rejection observation](prisma6193-start-deadline-retention-2026-11-02.json) and [source/diagnostic limits](prisma6193-start-deadline-2026-11-02.md#essential-remaining-gate-waiting-start-bookkeeping) remain unchanged. No further retention exploration will be run.

Only that stop condition is removed. Preserve database resources, deadlines/no-late-callback behavior, authorization, receipt integrity, positive40001-only retry (maximum three fresh attempts), safe errors and the failed T-47 target. Reuse public release/deadline/configuration proof, without another version, private patch, rotation or timeout increase.

Prospective sequence: real authenticated independent CREATE/EDIT coordinated genuine COMMIT serialization regressions against unchanged5.22; commit semantic RED; pin matching6.19.3 and public compositions at the lazy guarded client seam; minimally correct demonstrated construction/type/public-observer incompatibilities without weakening business assertions; focused checks, affected mutation/concurrency/authentication/attachment/read-snapshot regressions, server build, then comprehensive server regression **excluding only tests/lab-04/performance-smoke.integration.test.ts**. Inspect actual discovery and report this as filtered comprehensive regression, never an unfiltered suite/benchmark pass. No T-47 workload/sample modification or rerun. All executions are sequential, with actual attempts and source state appended below.

The new SSI coordinator will use two otherwise independent real authorized HTTP commands and two owned read/write dependency rows. Both complete their actual domain bodies before controlled commit order; one genuine PostgreSQL COMMIT abort must roll back before its fresh retry. This is a coordinated real database failure, not the original50-user workload, fabricated SQLSTATE, or an uncontrolled production race.

## Execution disposition and source provenance

**Candidate adopted on the feature branch; filtered comprehensive server confirmation passed. T-47 remains failed and unexecuted in this batch.** Decision [a73c443](https://github.com/chaproi/toktickit/commit/a73c44303af938bb3e4bb80ec27b4faff367b63f), meaningful application RED [fe566e0](https://github.com/chaproi/toktickit/commit/fe566e020b24a2ee98e671eca0fa4e954a6453f3), candidate GREEN [bb6c720](https://github.com/chaproi/toktickit/commit/bb6c720f786424b0c48bfed827ea5d26bae92c8f) are separate; evidence publication follows. No application execution is attributed to the later GREEN/evidence commit.

Runs01?03 used native5.22 plus the new pending test, later committed as fe566e0. Subsequent application runs used HEAD fe566e0 with evolving pending candidate files. Before run30, SHA-256 digests were captured for the final source; all183 server files in that snapshot still matched after execution and the25 candidate files were then committed unchanged as bb6c720. [Redacted machine-readable attempts, exact commands, source digests and archived-output checksums](prisma6193-adoption-results-2026-11-02.json) accompany this ledger. The first comprehensive source inventory was captured during run26 after a local path-script correction, with no source edit during that run; it is not relabelled a pre-run inventory.

Actual local environment: Windows x64, Node24.14.0, PostgreSQL18.6, TypeScript5.9.3, tsx4.23.12, Vitest2.1.9, pg8.23.0, dotenv16.6.1. Exact matching prisma CLI, @prisma/client, @prisma/adapter-pg and @prisma/driver-adapter-utils are6.19.3. The earlier isolated proof's TypeScript5.7.2/tsx4.19.2 provenance is unchanged; those are not the installed application versions here. This is local guarded PostgreSQL, not hosted CI or a production deployment.

## Actual attempts and retained failures

All database test commands were sequential. The prospective statement above intended every command to be sequential; actual exception: dependency registration16 briefly overlapped focused run15 (no second database suite). Candidate source was also refined during diagnostic17, so that failed run is not evidence for final-source bytes. Both exceptions are retained rather than called clean final executions. Run19 and the later focused/affected/comprehensive checks establish the results below. Local bookkeeping scripts once used a wrong relative cwd and once a non-UTF-8 default; they did not establish application outcomes and were corrected before the relevant checks. Original private console logs and raw reporter outputs are retained; only redacted classifications/counts/hashes are published.

| Run | Bangkok start | Exit | Collected / executed / passed / failed / skipped | Framework / wall | Observation |
| --- | --- | --- | --- | --- | --- |
| 01 | 11:17:26 | 1 | 2 / 2 / 0 / 2 / 0 | 15.82s / 17.707s | CREATE semantic RED; EDIT source-fixture setup count interference, corrected only new setup. |
| 02 | 11:18:42 | 1 | 2 / 2 / 0 / 2 / 0 | 6.05s / 7.032s | Both real authorized commands fail recovery after verified COMMIT rollback; opaque P2034, no positively observed SQLSTATE. |
| 03 | 11:18:56 | 0 | Not a case run | ? / 6.441s | Native RED type check passed. |
| 04 | 11:20:42 | 0 | Not a case run | ? / 5.548s | Client/adapter dependencies installed; initial audit reported 12 vulnerabilities. |
| 05 | 11:20:59 | 0 | Not a case run | ? / 9.357s | CLI matching version; audit now 15 vulnerabilities. |
| 06 | 11:22:07 | 0 | Not a case run | ? / 4.145s | Generated matching6.19.3 client; generator-only schema change. |
| 07 | 11:22:42 | 2 | Not a case run | ? / 6.543s | Candidate generic typing and removed $use compatibility failures. |
| 08 | Not executed | ? | ? | ? | Approval review unavailable; no command execution. |
| 09 | 11:27:11 | 2 | Not a case run | ? / 6.180s | Preceding local edit script had wrong relative cwd; edits not applied, same type failures retained. |
| 10 | 11:27:27 | 0 | Not a case run | ? / 6.282s | Public observation/constructor compatibility type check passed. |
| 11 | 11:27:44 | 1 | 102 / 29 / 29 / 0 / 73 | 13.77s / 14.885s | Unsupported raw name/OID19 identity projection causes 7 suite-hook failures; no business pass claim for 73 skipped cases. |
| 12 | 11:28:19 | 1 | 102 / 72 / 43 / 29 / 30 | 33.75s / 34.714s | CREATE genuine40001 now recovers; public method spy restoration failure cascades into later setup/auth cleanup. |
| 13 | 11:29:29 | 1 | 8 / 8 / 7 / 1 / 0 | 395ms / 1.409s | Component semantic RED for exact public method restoration. |
| 14 | 11:29:39 | 0 | 8 / 8 / 8 / 0 / 0 | 414ms / 1.383s | Public descriptor forwarding correction passes. |
| 15 | 11:30:37 | 1 | 110 / 110 / 93 / 17 / 0 | 57.39s / 58.396s | Real CREATE/EDIT pass; 2 classification observation and15 defensive receipt failures remain. |
| 16 | 11:31:05 | 0 | Not a case run | ? / 3.472s | Explicit runtime dotenv dependency; installation overlaps run15 briefly (not another DB suite). Original prior approval rejection did not execute. |
| 17 | 11:31:53 | 1 | 111 / 111 / 95 / 16 / 0 | 55.55s / 56.490s | Receipt quoted target fields and wrapped40001 classification remain; source changed during this diagnostic run, not final-source evidence. |
| 18 | 11:33:31 | 1 | 18 / 1 / 0 / 1 / 17 | 9.02s / 9.985s | One receipt case diagnostic confirms mismatch; temporary observations later removed. |
| 19 | 11:34:00 | 0 | 113 / 113 / 113 / 0 / 0 | 61.93s / 62.932s | Six focused files all pass, including both genuine COMMIT recovery commands, T42/51/52 and resource lifecycle. |
| 20 | 11:35:23 | 1 | 702 / 702 / 682 / 20 / 0 | 220.64s / 221.656s | 20 failed: datetime binding/real throttle boundary, raw observer action vocabulary, safe seed class observation; two cold cases blocked by missing explicit Seaweed tool. |
| 21 | 11:40:34 | 0 | Not a case run | ? / 16.215s | Datetime/public observer compatibility type check passed. |
| 22 | 11:41:07 | 1 | 184 / 184 / 181 / 3 / 0 | 143.43s / 144.656s | 181 pass; two cold diagnostic expiry classifiers need structured Prisma6 subtype, one new lifecycle fixture assumed cold connection starts within60ms. |
| 23 | 17:10:48 | 0 | 15 / 15 / 15 / 0 / 0 | 43.75s / 48.984s | Corrected diagnostic subtype and warm-connected startup premise; natural cold expiry remains safe500 with successful compensation, no production cold-upload change. |
| 24 | 17:11:51 | 0 | Not a case run | ? / 10.546s | Build passed before first comprehensive run. |
| 25 | 17:12:37 | 0 | Not a case run | ? / not retained | Actual discovery:84 available files,83 selected; only unchanged T47 benchmark excluded. |
| 26 | 17:13:20 | 1 | 2045 / 2045 / 2043 / 2 / 0 | 742.01s / 743.266s | Comprehensive FAILED:2 inherited migrated-schema tests reject their matching search_path URL options; 2043 passes do not replace failed verdict. |
| 27 | 17:26:20 | 1 | 12 / 12 / 11 / 1 / 0 | 537ms / 1.801s | Additional component RED for exact inherited matching startup option. |
| 28 | 17:26:38 | 0 | 18 / 18 / 18 / 0 / 0 | 20.11s / 21.277s | Strict matching startup option mapping correction;18 pass including both migration tests. |
| 29 | 17:27:28 | 0 | Not a case run | ? / 6.073s | Build passed on final candidate bytes. |
| 30 | 17:28:01 | 0 | 2048 / 2048 / 2048 / 0 / 0 | 593.97s / 594.887s | Justified comprehensive confirmation after demonstrated shared configuration correction;83 files/2048 pass,0 skipped. Does not erase run26. |

Run11 has seven failed suite hooks while its29 executed cases pass and73 are skipped; those setup failures are not semantic recovery RED. Run12 executes72 cases;30 skipped cases are not passing evidence. Runs18's17 deselections are explicitly recorded. The run26 verdict remains **failed**, even though2043 cases passed. Its two errors were the inherited migration fixture's exact matching `options=-c search_path=<owned schema>` selector, not database DDL failure. A new unit assertion failed in27; strict matching support was added,18 focused cases passed in28, build passed in29, and only then was the comprehensive command repeated once in30. No timeout/retry/discovery change was made to obtain the confirmation.

A separate bounded real duplicate-category probe after18 observed only safe error class/code/constraint field shape and cleaned its single owned row/client (exit0); it did not count as a passing HTTP receipt case. The temporary receipt debug observation was removed before run19. The first attempted dotenv installation08 was not executed: automatic approval review could not complete because its reviewer usage limit was reached. Independent authorized work continued; a later newly reviewed installation16 succeeded. No failed approval was bypassed.

### Exact command groups

All commands below ran from server/. Full expanded commands for each numbered attempt are in the JSON record; output filenames are private redacted placeholders.

- 01/02: `npm.cmd test -- tests/lab-04/action-commit-recovery.api.test.ts`.
- 03/07/09/10/21: `npm.cmd exec -- tsc --noEmit`.
- 04: `npm.cmd install --save-exact @prisma/client@6.19.3 @prisma/adapter-pg@6.19.3 @prisma/driver-adapter-utils@6.19.3`;05: `npm.cmd install --save-dev --save-exact prisma@6.19.3`;06: `npm.cmd exec -- prisma generate`;16: `npm.cmd install --save-exact dotenv@16.6.1`.
- 11/12: `npm.cmd test -- tests/lab-04/action-commit-recovery.api.test.ts tests/lab-04/actions-concurrency.api.test.ts tests/lab-04/action-idempotency-recovery.integration.test.ts tests/lab-04/receipt-recovery.unit.test.ts`.15/17 append `tests/lab-04/prisma-runtime.unit.test.ts`;19 additionally appends `tests/lab-04/prisma-client-lifecycle.integration.test.ts`.
- 13/14/27: `npm.cmd test -- tests/lab-04/prisma-runtime.unit.test.ts`;18: `npm.cmd test -- tests/lab-04/action-idempotency-recovery.integration.test.ts -t 'create returns the original'`.
- 20 is the20-file affected mutation/authentication/attachment/Queue/seed/snapshot/Dashboard group;22 is the eight-file demonstrated-compatibility subset. Their exact paths/order are retained in JSON, without inventing another aggregate run.
- 23: `npm.cmd test -- tests/lab-04/attachment-cold-upload.integration.test.ts tests/lab-04/prisma-client-lifecycle.integration.test.ts tests/lab-04/prisma-runtime.unit.test.ts`.
- 24/29: `npm.cmd run build`.
- 25: `npm.cmd exec -- vitest list --filesOnly --exclude tests/lab-04/performance-smoke.integration.test.ts`.
- 26/30: `npm.cmd test -- --exclude tests/lab-04/performance-smoke.integration.test.ts --reporter=default --reporter=json --outputFile <private-report.json>`.
- 28: `npm.cmd test -- tests/lab-03/migrated-ticket-claim.api.test.ts tests/lab-03/lab2-to-lab3-repeatability.migration.test.ts tests/lab-04/prisma-runtime.unit.test.ts tests/lab-04/prisma-client-lifecycle.integration.test.ts`.

Discovery selects **83 of84 files**, excluding only the unchanged T-47 performance-smoke integration benchmark. Final run30: **83 files,2048 collected/executed/passed,0 failed/skipped**,593.97s framework/594.887s command wall. Run26:83 files,2045 collected/executed,2043 passed,2 failed,0 skipped,742.01s/743.266s. These are filtered comprehensive server results, never an unfiltered full-suite or performance pass. The unchanged bounded35-request diagnosis file remains included; its two newly generated redacted outputs were archived separately, not substituted for the original50-VU measurement.

## Completed compatibility and retry checklist

| Obligation | Concrete disposition / evidence | Qualification |
| --- | --- | --- |
| Prospective student decision | a73c443 records the exact accepted waiting-record limitation before application edits/tests | Accumulation until disconnect remains; no memory-growth bound, per-record cleanup, release or peer approval |
| Genuine authorized CREATE/EDIT COMMIT recovery | [New real API assertions](../../../server/tests/lab-04/action-commit-recovery.api.test.ts) complete both independent domain bodies; CREATE wins0/EDIT wins1. Native RED02 returns500 after exact loser rollback; GREEN19/30 returns201/200 with attempts[1,2]/[2,1], trusted native40001, fresh transaction IDs | Owned Category dependency rows deliberately coordinate actual PostgreSQL SSI; not fabricated SQLSTATE or the original workload |
| Exactly one authoritative command | Both new cases verify full Action, earlier/new history snapshots, one receipt, exact safe receipt/HTTP DTO, unchanged parent fields and one strict server timestamp advance | CREATE/EDIT only; existing lifecycle/race suites supply their separate assertions |
| Fresh checks, rollback and max3 | [Unchanged T-42 assertions](../../../server/tests/lab-04/actions-concurrency.api.test.ts): one/two late SQL40001 faults then success; three exhaust exactly3; actor revocation, assignee promotion and competing-token change observed after rollback. All53 cases pass19/30 | These late-fault tests intentionally raise PostgreSQL errors; genuine COMMIT failures are separately the new two cases. Three genuine spontaneous COMMIT aborts are not claimed |
| Negative classifications and receipt separation | Runtime synthetic components reject bare/forged/message-only P2034/40001,40P01 and23505 as serialization proof. Existing real deadlock/constraint and T-51/T-52 recovery/unit assertions pass19/30 | Synthetic components are labelled as such; defensive receipt recovery retains independent authorization and one read, not another mutation retry |
| Transaction release / attribution | Reused [public release proof](prisma6193-release-remedy-2026-11-02.md), public transaction-local completion/abort promises and original primary error. Two application attempts have different backends/xids and independent final-state checks | No global last-error cache, log matching, private registry patch or per-request pool shutdown |
| Deadlines and shutdown | [New lifecycle assertions](../../../server/tests/lab-04/prisma-client-lifecycle.integration.test.ts): default2000ms while held; concurrent60/100/140ms overrides; no callbacks after timeout; disconnect waits for drain; no remaining connections/unhandled rejections; reconnect and public query extensions. Run30 default observed2004.4942ms | Uses real held pool; timing tolerances are diagnostic assertions, not budget changes. Existing earlier public proof covers late rejection/other lifecycle components |
| Startup versus execution | Callback executes150ms after ready connection with maxWait60ms; execution timeout remains5000ms. Per-call/constructor/default option propagation retained from verified composition | Warming that already-tested startup connection is local fixture setup, not a cold-upload fix |
| Connection/configuration mapping | [Factory](../../../server/src/prisma-client.ts), [explicit mapping](../../../server/src/database/connection-configuration.ts), [datetime bindings](../../../server/src/database/utc-parameters.ts). Actual inherited schema selector, raw name/time scalar types and real UTC/Bangkok datetime tests pass | Supported/rejected configurations below; no general deployment certification |
| Affected/comprehensive regression |113 focused pass19; corrected15 pass23; migration/configuration18 pass28; build29 pass; filtered comprehensive2048 pass30 | Retain all failed attempts, package warnings, excluded benchmark and execution-before-commit provenance |

## Candidate construction and supported configuration

The existing lazy guarded getPrisma seam now creates the official adapter factory through public UTC-parameter, release and transaction-start deadline compositions. Preparation/seed entrypoints and isolated secondary clients use the same factory. Test target validation occurs before connection; runtime `.env` loading remains lazy with process-environment precedence. The configuration-owned official adapter owns its lazy pool; disconnect drains pending attempts before closing and supports reconnect. The earlier caller-owned proof-pool limitation is not silently carried into this factory.

No mutation executor/business callback, database DDL, migration, index, role, lock order, receipt protocol, count limit or retry budget changes. Exact structured public DriverAdapterError40001 is transported as a sanitized transaction-local cause. Trusted wrapped query40001 retains its inherited P2010 safe SQLSTATE seam; bare P2034,40P01,23505, message-only and unexpected errors remain non-serialization. Actual adapter23505 receipt field metadata contains quoted identifiers; the safe bridge normalizes only allowlisted quoted identifiers into the inherited P2002 target shape, preserving separate receipt recovery. It does not classify arbitrary unique failures as retryable.

| Configuration | Explicit application mapping | Limit |
| --- | --- | --- |
| URL/database/schema | Decode fields, public schema identifier, explicit startup search_path; schema default public. Permit inherited matching `options=-c search_path=<same schema>` only | Reject repeated/unknown options, conflicting paths and extra startup directives |
| SSL | Actual local loopback plaintext, sslmode omitted/disable | Remote/TLS/unmapped certificate configurations rejected; no `rejectUnauthorized:false` fallback or weakened verification |
| Pool size | Explicit connection_limit or native physical-core formula2*physical+1; thisWindows host8physical cores =>17 | No copied proof4 or pg-default10; other platforms need reviewed mapping before use |
| Separate budgets | Physical connect5s, pool wait10s by default; inherited explicit URL overrides. Pool idle300s, lifetime0. Transaction startup maxWait2s and execution timeout5s retain independent per-call overrides | No timeout or pool tuning; zero/unmapped semantics not invented |
| Timezone/raw result types | Preserve actual session timezone; public pg per-query timestamptz parser preserves the instant; typed datetime SQL arguments retain explicit UTC. Public FieldDef nameOID19 mapped to textOID25 with unchanged string values | No arbitrary SQL/text/JSON rewriting or global timezone/type parser changes; real UTC/Bangkok assertions and actual Dashboard/auth boundaries pass |
| Public lifecycle/options | Lazy `.env`, constructor transactionOptions/log options, public extensions/spying, drain/disconnect/reconnect verified; no custom adapter accepted at application factory | Unsupported configuration rejected safely, not silently mapped to pg defaults |

Exact package pins: prisma/@prisma/client/@prisma/adapter-pg/@prisma/driver-adapter-utils6.19.3, dotenv16.6.1; existing pg8.23.0 unchanged. Lockfile changes are required dependency graph updates (35 new nodes,7 version updates); the engines-version package name7.1.1-3 is the dependency shipped with pinned Prisma6.19.3, not an additional Prisma evaluation. No generated clients/dependency directories are committed. Version-matched public source/API/release-support limitations remain in the [evaluation](prisma6193-evaluation-2026-11-02.md) and [configuration proof](prisma6193-start-deadline-2026-11-02.md); GA status is not release acceptance.

## Narrow compatibility corrections versus business changes

- Public `$extends` operation observation plus transaction-local public callback context replaces removed `$use` only in the necessary seed/Queue/diagnostic observers. Registration of `$on` remains on the original public client. Queue actual bounded-retrieval assertions and the35-request diagnostic workload remain substantive and unchanged.
- Existing isolated migration/receipt/seed clients switch constructor seam only. Safe seed diagnostics recognize the public adapter's actual unknown-error classification; no failure outcome/assertion changed.
- Cold-upload safe P2028 diagnostic accepts the actual structured Prisma6 execution-expiry subtype (operation, timeout, timeTaken), still rejects bare/unknown P2028. Business expiry/rollback/compensation assertions remain unchanged. Natural23: PUT6028ms, engine6043ms at5000ms budget, HTTP500/one attempt/one compensation. Controlled expiry23: PUT5ms, engine5035ms, safe500/one compensation, separately labelled controlled. No cold-upload production modification or unconditional success claim.
- Public property descriptor forwarding corrects a demonstrated spy-restoration defect; actual scoped methods/extensions restore exactly. Native/public constraint and datetime type differences were corrected at the construction/transport seam, not by changing application outcomes.

Eight modified inherited test/helper files retain all254 original expect/expect.soft/expect.poll root-call expressions (AST/normalized-line-ending comparison) and their substantive chained assertions. The original application RED test is unchanged after fe566e0. All364 protected historical artifact/migration/client/E2E files match the starting byte hashes. Benchmark source, workload helper, samples and original diagnostic output are unchanged. Schema diff is generator-only; historical SQL files remain byte-identical. No client or E2E command ran.

## Isolation, cleanup, artifacts and warnings

Existing isolation guard and actual dedicated database/schema identity were checked before writes, distinct from operational. Only uniquely owned fixtures/schemas were touched. After failed run12's restoration issue, a bounded independent cleanup first used a Date-valued window probe that matched zero; explicit ISO UTC bounds then established exact run-window/marker ownership and zero external references. It removed54 owned users,33 Tickets,3 Categories and3 related systems in FK order and proved zero remains. That intervention is not evidence of successful automatic cleanup in12.

After30, independent guarded probes found zero owned schemas, Action fixture users/Tickets, fault triggers/functions/sequences, tagged diagnostic/adoption/race connections and idle transactions. Requests/coordination holders drained; spies/settings/clients/listeners closed; zero owned test/Seaweed processes and T31 directories remained. SeaweedFS4.51 executable/archive was explicitly provisioned for affected persistent-storage tests, checksum verified against the previously documented official archive, used only through scoped TOKTICKIT_RECOVERY_WEED_EXE, then removed from its marker-owned directory. It was absent in20; that failure was not hidden or called an application defect.

The unchanged comprehensive diagnosis test generated two new35-request redacted files with an inherited2026-11-01 filename despite actual2026-11-02 execution. Ownership, exact execution HEAD, actual startedAt, bounded-diagnosis mode and run windows were verified. Each was copied byte-for-byte to a private fresh-output archive, checksum verified, and only its proven new untracked generated file removed from the repository. Their redacted summaries/checksums are retained in the JSON ledger. No historical artifact was overwritten, replaced or relabelled; no broad reset/clean was used. Raw logs/reporters and private diagnostic output locations are not published.

Warnings retained: npm audit reports15 vulnerabilities (5moderate,7high,3critical); this batch does not establish their provenance or remediate them. Prisma CLI warns package.json#prisma config is deprecated for Prisma7. pg warns queuing queries on one client is deprecated for pg9; current public behavior/assertions pass, no queue internals patched. PowerShell may wrap expected stderr as NativeCommandError; actual process exit/reporters govern verdicts. Expected injected database/auth/storage errors remain labelled controlled; safe envelopes/log redaction pass. LF/CRLF checkout warnings do not constitute changed historical bytes.

## Remaining obligations / next action

The student-accepted failed-start bookkeeping limitation remains explicit and requires implementation peer review; it is not a memory-safety finding or release approval. Only actual structured native40001 can trigger at most3 fresh attempts; no generic-P2034 retry, private cleanup, client rotation or other version was added. Earlier5.22/6.19.3 failure/proof records and the original failed T-47 remain intact.

This candidate is ready for **one subsequent unchanged T-47 confirmation** at a clean published revision, preserving all5000 warm-ups/500 measured samples,50 users/concurrency, endpoint mix and thresholds. No performance improvement or T-47 GREEN has been measured here. Broader visual/accessibility gaps, fresh final integration, actual #49 peer review and #50 release remain separate; all55 scenarios, normative totals/decisions and Product DoD/Issue/PR metadata remain unchanged.
