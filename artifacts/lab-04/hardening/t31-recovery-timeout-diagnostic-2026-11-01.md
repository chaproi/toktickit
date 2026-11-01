# T-31 persistent recovery timeout diagnostic - 2026-11-01

Issue #49 only. **One isolated confirmation passed without a corrective change: 1 collected/executed/passed, zero failed/skipped, at the unchanged 30,000 ms case budget.** The earlier R2 failure remains a failed historical attempt and its cause remains unestablished. This is current bounded recovery confirmation, not a proven timeout fix, comprehensive regression GREEN or whole-scenario acceptance.

## Provenance and isolation

Preflight verified chaproi/toktickit, clean feat/49-final-hardening at published 538422d7afecc0823e58fcd05133c806ce01a5e3. Fetch and live ls-remote agreed with local/upstream, ahead/behind 0/0. No applicable AGENTS.md was found in the repository or ancestors. Read-only process inspection found no competing repository test/build/seed process; unrelated tool runtimes were left untouched.

The actual repository isolation guard executed before writes. A live PostgreSQL probe matched its dedicated database/schema and verified that the operational database is distinct; no connection values are published. Before execution there were zero recovery schemas, idle transactions or owned recovery directories. The test independently rechecks its exact owned application schema and fresh storage namespace before business writes.

Local Windows PowerShell, PostgreSQL/native tools 18.6, Vitest 2.1.9, real on-disk SeaweedFS 4.51 and the production SeaweedFsS3Storage adapter. The same official release ZIP was checksum-verified (SHA-256 08866a53e1bdd5378ee9880f8ee30d981d1bbb6ae22ee1897deb17ff87f8d2fb). The executable override was scoped to this command and restored. No shared install/PATH, configuration or service was changed.

Execution began 2026-11-01T13:09:34.9264373+07:00 (Asia/Bangkok); Vitest start was 13:09:38. Tested source was published 538422d7afecc0823e58fcd05133c806ce01a5e3 with pending two-file diagnostic instrumentation, committed unchanged as [4a0ad1e4f67dba03e683eb77f877a5dca1b699ee](https://github.com/chaproi/toktickit/commit/4a0ad1e4f67dba03e683eb77f877a5dca1b699ee). No post-commit/publication-HEAD or hosted-CI execution is claimed.

## Instrumentation and retained history

Read the retained R2 output and the recovery/native/storage helpers before execution. R2 hit the existing 30-second case timeout after write readiness consumed 18,173 ms; its only later marker was the completed production migration path. It did not retain enough phase evidence to identify a hung operation or prove an aggregate-budget cause. Its two schemas and directory required independently ownership-proven cleanup, as retained in the [prior classification ledger](cold-upload-classification-2026-11-01.md). Earlier R1 passed in 28,129 ms but overlapped another command and does not replace R2. All those records remain byte-identical.

The [recovery test](https://github.com/chaproi/toktickit/blob/4a0ad1e4f67dba03e683eb77f877a5dca1b699ee/server/tests/lab-04/attachment-recovery.integration.test.ts#L26) now logs fixed phase labels, start/end offsets and elapsed milliseconds from performance.now(), a monotonic clock. Its failure hook retains the last completed and in-flight phases/durations if a test fails. That hook was not exercised by this successful run. No error objects, SQL, credentials, keys, hashes of credentials or private fixture content are logged by the observer. Small rounding differences between offsets and elapsed columns are expected.

The [storage helper](https://github.com/chaproi/toktickit/blob/4a0ad1e4f67dba03e683eb77f877a5dca1b699ee/server/tests/lab-04/persistent-recovery-test-helpers.ts#L24) adds only optional diagnostic callbacks around existing startup, namespace, readiness and cleanup operations. Removing those callbacks/type addition reproduces its previous text exactly. No operation moved outside the timed case; no assertions, retries, transaction settings, readiness behavior or 30-second limit changed. Cold-upload assertions remain byte-identical and still explicitly use writeReady:false. This batch does not reopen the separately classified cold expiry/compensation finding or add production code.

## Measured phases

Offsets are milliseconds from the beginning of the timed case; these are case phases, not global-setup/command durations. The command ran alone. All 24 phases ended; last completed was settings-and-directory-cleanup at 22,922 ms, with no in-flight phase.

| Phase | Start ms | End ms | Elapsed ms |
| --- | --- | --- | --- |
| prerequisites | 0 | 267 | 267 |
| service-startup-and-listening | 269 | 2923 | 2654 |
| storage-namespace-creation | 2923 | 2931 | 8 |
| storage-write-readiness | 2932 | 15775 | 12843 |
| source-schema-create | 15775 | 15877 | 102 |
| migrations | 15877 | 16413 | 536 |
| application-target-and-import | 16413 | 18991 | 2578 |
| authentication | 18991 | 20226 | 1235 |
| reference-and-ticket-fixtures | 20226 | 20247 | 20 |
| uploads-and-removal | 20247 | 20335 | 88 |
| snapshot-and-archive-export | 20335 | 21257 | 922 |
| source-invalidation-and-disconnect | 21257 | 21278 | 21 |
| restore-schema-create | 21278 | 21368 | 89 |
| database-restore-and-checksums | 21368 | 22063 | 695 |
| restored-bucket-put | 22063 | 22284 | 221 |
| restored-application-target | 22284 | 22436 | 152 |
| authorized-reads | 22436 | 22604 | 168 |
| denied-reads-and-preservation | 22604 | 22643 | 39 |
| restored-client-disconnect | 22643 | 22660 | 17 |
| restored-schema-cleanup | 22660 | 22752 | 92 |
| source-schema-cleanup | 22752 | 22819 | 67 |
| final-client-disconnect | 22820 | 22820 | 0 |
| storage-and-process-cleanup | 22820 | 22914 | 94 |
| settings-and-directory-cleanup | 22914 | 22922 | 8 |

Write readiness was the largest observed phase (12,843 ms); startup/listening took 2,654 ms and application connection/import took 2,578 ms. Authentication, native archive/restore, restored-bucket PUT, authorized/denied reads and cleanup all progressed and completed. This run shows **no hung operation and no aggregate case-budget overrun**. Readiness was 5,330 ms shorter than R2, but that difference alone does not explain R2; the remaining R2 phases were unmeasured. No machine-load, locking, service or coordination cause is inferred from this passing attempt.

## Commands and reached assertions

Exactly one recovery execution, followed sequentially by TypeScript:

```text
server/: npm.cmd test -- tests/lab-04/attachment-recovery.integration.test.ts
server/: npm.cmd exec -- tsc --noEmit
```

| Check | Exit and actual counts | Duration |
| --- | --- | --- |
| Instrumented recovery | Exit 0; 1 file, 1 collected/executed/passed, 0 failed/skipped | Case 22,923 ms; file 22,924 ms; framework 33.73s; command wall 37,734 ms |
| Server TypeScript | Exit 0; no diagnostics; no test collection | Command wall 11,775 ms |

All existing recovery assertions executed: real uploads/removal; quiesced paired database/binary backup; 15 table checksums; independent restored schema OID and bucket; exact active binary length/digest; removed object absent/410; owner/Staff/Admin safe reads; foreign-Requester denial; exact domain preservation excluding legitimate session bookkeeping. No successful responses or storage/business results were fabricated. The observers do not replace assertions with phase-completion messages.

Existing create-only seed ambiguity/frozen-fixture warnings and PowerShell's NativeCommandError rendering of stderr were retained; actual command exit was 0. No unexpected application error was observed. Raw logs remain private; this record publishes only bounded safe observations. No full suite, build, cold suite, performance workload or unrelated regression ran. Other helper consumers were not rerun because the only helper changes are optional callbacks, unused by those consumers; their existing paths and settings are textually unchanged.

## Cleanup, verdict and next action

Normal cleanup completed inside the timed case: both exact owned schemas verified remaining=0; owned buckets/objects removed; storage process awaited after termination; clients disconnected; all scoped environment values restored; absolute owned directory identity checked and removed. Every observed HTTP/native operation completed before cleanup. No timeout worker or pending operation needed external interruption in this run; primary-failure/cleanup-failure handling was not newly exercised.

Independent post-run probes again executed the actual guard and confirmed the live dedicated identity, zero recovery schemas, zero unexpected recovery users/Tickets in the default schema, zero idle transactions, zero SeaweedFS/pg_dump/pg_restore processes and zero owned recovery directories. No operational/shared resources were removed. The owned downloaded executable/ZIP were removed from their explicitly constructed diagnostic paths after ZIP-digest and stopped-process checks; private logs were retained. An additional PowerShell parent-path check emitted a non-terminating Split-Path parameter-binding error; a separate read-only .NET parent-path/absence check then passed. No recovery assertion or cleanup failed, and no other resources were removed. Historical artifacts remained unchanged.

**Disposition:** current focused recovery confirmation passes without a fixture or production correction. R2 is preserved as failed, with cause still unestablished; no diagnosis is promoted to a proven fix. If the timeout recurs, use the retained last/in-flight phase observations before choosing a bounded remedy; do not raise budgets, move setup outside the timed case, repeatedly rerun or weaken checks. The next originally planned missing batch is T-47's specified 50-user performance workload and measurements, which was not started here. Final integrated acceptance/review and #50 production deployment/recovery remain separate. T-31 still uses a local logical S3 export, not a production SeaweedFS volume/IAM/TLS disaster-recovery certification. All normative scenarios remain Planned and Product DoD/Issue metadata are unchanged.
