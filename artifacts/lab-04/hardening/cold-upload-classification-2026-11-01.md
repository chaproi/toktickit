# Cold upload finding: classification and contract disposition — 2026-11-01

Issue #49 only. **The new natural reproduction confirms interactive-transaction expiry after a successful cold S3 PUT. Rollback, compensation and the inherited safe response conform to the accepted upload failure contract; no application defect requiring a production correction was demonstrated.** Cold/slow storage can still cause an upload to fail. Write readiness remains a deployment prerequisite, not an application success guarantee.

The required sequential recovery confirmation later timed out at its unchanged 30-second budget. This batch is **not regression GREEN**. That failure, the initial setup error and an accidental command overlap are retained below; earlier passing runs do not replace the failed sequential verdict.

## Provenance and boundary

Preflight verified chaproi/toktickit, clean `feat/49-final-hardening`, local/live remote `6417fc1ac91053263e3fbdd8e442028f52a6873e`, ahead/behind 0/0; no applicable AGENTS.md. The actual guard/live database probe verified the dedicated target distinct from operational. Owned fixtures rechecked their exact schema and fresh persistent-storage identity before writes.

Local Windows PowerShell, PostgreSQL/native tools 18.6, Vitest 2.1.9, the same official checksum-verified SeaweedFS 4.51 executable and actual production `SeaweedFsS3Storage`. The ZIP SHA-256 matched `08866a53e1bdd5378ee9880f8ee30d981d1bbb6ae22ee1897deb17ff87f8d2fb` from the [pinned official release](https://github.com/seaweedfs/seaweedfs/releases/tag/4.51). No in-memory binary substitute or fabricated business response was used.

Executions ran on 2026-11-01, Asia/Bangkok, at the published baseline with pending tests/helper changes subsequently committed unchanged as [de246a3d7755c176cd835f3ce14beb40b8334c91](https://github.com/chaproi/toktickit/commit/de246a3d7755c176cd835f3ce14beb40b8334c91). No exact later publication-HEAD or hosted-CI execution is claimed. The original October 31 attempts and their unretained subtype evidence remain untouched; this new reproduction does not retroactively recover those missing details.

## Causal evidence and accepted requirement

The [inherited Upload Compensation contract](https://github.com/chaproi/toktickit/blob/6417fc1ac91053263e3fbdd8e442028f52a6873e/docs/lab-02/api-spec.md#L677) requires validation/ownership/count checks before storage, then metadata creation. Failed storage creates no metadata; successful storage followed by failed metadata creation requires attempted deletion and a safe error. It allows 500 INTERNAL_ERROR for unexpected failure, 503 STORAGE_UNAVAILABLE for storage failure and 503 SERVICE_UNAVAILABLE for database unavailability. It does not require unconditional cold-upload success or classify every P2028 identically.

The [new suite](https://github.com/chaproi/toktickit/blob/de246a3d7755c176cd835f3ce14beb40b8334c91/server/tests/lab-04/attachment-cold-upload.integration.test.ts) performs **one natural cold upload**, without prewarming. Pass-through observers retain only validated error code, an expiry Boolean, numeric engine timings, storage timing and bounded state observations. Expiry is accepted only when P2028's specific `meta.error` contains the expired-transaction marker; bare P2028 or message-only matches are insufficient. Raw engine text, queries, session material, storage keys and private rows are not retained in the report.

| Observation | Natural cold request | Controlled expiry request |
| --- | --- | --- |
| Real S3 PUT | Succeeded; 8,442 ms | Succeeded; 8 ms |
| Engine classification | P2028; expired=true | P2028; expired=true |
| Engine-reported timeout / elapsed | 5,000 / 8,477 ms | 5,000 / 5,005 ms |
| Observed transaction rejection | 8,495 ms | 5,008 ms |
| HTTP | Exact inherited safe 500 INTERNAL_ERROR | Exact inherited safe 500 INTERNAL_ERROR |
| Attempts / compensation | One transaction attempt; one exact-object removal | One transaction attempt; one exact-object removal |

Both cases prove zero failed-upload metadata, exact domain/Ticket timestamp/history/receipt preservation, no persistent-store orphan by independent listing and HEAD 404, preservation of other committed objects, User/Ticket gates held at store entry and available after rollback/compensation. Only legitimate authentication bookkeeping is excluded from domain comparison. A deliberate **new** write-ready upload after the natural failure returns 201 with one metadata row and a new storage key; no automatic retry or replay is added.

The controlled case uses a real successful persistent PUT, then holds its return until an independent PostgreSQL observer sees that transaction leave the active state. It uses no arbitrary sleep or fake error/result. It proves the deterministic expiry/compensation path separately from the naturally slow cold PUT. It is not a natural outage/race. Current User-before-Ticket gates, ownership/file validation, five-active limit and maximum-three confirmed-40001 policy remain unchanged; P2028 receives one attempt, not serialization retry.

**Disposition:** no production code, error mapping, timeout, retry or storage-I/O transaction boundary changed. There is therefore no invented semantic RED or production GREEN commit. Storage failure versus expired database transaction remains distinct. The new cases are verification of an existing failure contract. The operational mitigation is write readiness before traffic, as in the existing recovery fixture; it does not claim to repair arbitrary slow storage or guarantee first-request availability. Compensation remains best effort by contract; these cases prove its successful cleanup, not every possible cleanup-outage combination. Existing inherited storage-unavailable/security/concurrency regressions provide their separately qualified coverage.

## Every command attempt

All application commands ran from `server/`; the tool override was command-scoped and restored. Two new cases use initial finite 30,000 ms budgets; existing budgets/retries were not changed. Counts overlap and are not distinct totals.

| Attempt | Actual counts / exit | Framework duration; command wall | Qualification |
| --- | --- | --- | --- |
| C1 | 1 failed suite; 2 collected, 0 executed, 0 passed, 2 skipped/not run; exit 1 | 10.00s; 13.7259524s | New setup used expect.poll inside beforeAll, which Vitest disallows. No business upload ran. Moved initialization into the first test context, preserving assertions and budgets. This is setup failure, not semantic RED. |
| C2 | 1 file; 2 collected/executed/passed; 0 failed/skipped; exit 0 | 26.43s; 28.1430189s | One natural request and one controlled case reached all assertions. Natural case 17,911 ms including setup; controlled case 5,156 ms. |
| A1 | 4 files; 54 collected/executed/passed; 0 failed/skipped; exit 0 | 46.88s; 50.4146215s | The recovery command was mistakenly started before this process exited. Retained as overlapping evidence, not credited as the required sequential pair. |
| R1 | 1 file; 1 collected/executed/passed; 0 failed/skipped; exit 0 | 33.92s; 37.1565396s | Started 12:38:58 while A1 (start 12:38:16) was still ending. Recovery case itself took 28,129 ms. Does not replace R2. |
| A2 | 4 files; 54 collected/executed/passed; 0 failed/skipped; exit 0 | 40.94s; 43.6847554s | Repeated alone after both processes ended to satisfy sequential verification. Includes Attachments 42+3, authorization 5, safe errors 4 and concurrent five-active-limit checks. |
| R2 | 1 file; 1 collected/executed/failed; 0 passed/skipped; exit 1 | 34.99s; 37.685034s | Strictly after A2. Unchanged recovery case hit 30,000 ms timeout. Write-readiness took 18,173 ms; final assertions/normal cleanup were not credited. No budget change or lucky rerun followed. Timeout cause remains unestablished. |
| T | No test collection; exit 0, no diagnostics | Command wall 33.2742171s | Independent TypeScript check after owned-resource cleanup. |

```text
C: npm.cmd test -- tests/lab-04/attachment-cold-upload.integration.test.ts
A: npm.cmd test -- tests/lab-02/attachments.api.test.ts tests/lab-03/attachments.api.test.ts tests/lab-03/authorization.api.test.ts tests/lab-03/safe-errors.api.test.ts
R: npm.cmd test -- tests/lab-04/attachment-recovery.integration.test.ts
T: npm.cmd exec -- tsc --noEmit
```

For C/R, `TOKTICKIT_RECOVERY_WEED_EXE` pointed only to the owned checksum-verified executable. Expected sanitized database-error logs appeared for the two expired requests; create-only seed warnings and PowerShell's NativeCommandError rendering of stderr remain recorded. No raw error objects or sensitive settings were published. No full suite, build, T-47 or GitHub metadata operation occurred.

## Recovery-mode preservation and cleanup

The existing recovery test file is byte-identical. The helper adds only an explicit `writeReady:false` option for this new cold suite; its original readiness block remains byte-identical and is still the default. The natural observation was not repeatedly rerun: C1 failed before business setup; C2 contains the single valid natural observation. Repeated A/R commands corrected a sequencing mistake, not a failing-result search.

C2 cleaned its owned schema, bucket/objects, process, directory, clients, spies and settings. R2's timed-out worker left two schemas and one temporary recovery directory, with no Seaweed process and no idle transaction. Cleanup proved ownership using the directory's creation window, sealed database archive digest and both opaque attachment identities matching the two schema targets. Only those exact targets were dropped and that exact directory removed. This cleanup proof does not establish that the timed-out test's assertions completed. No broad reset/drop/clean was used.

Final independent guarded probes confirmed zero recovery schemas, idle transactions, Seaweed processes and owned cold/recovery directories. Downloaded executable/archive were removed; private logs were retained separately. No operational/shared target was used. Production, all existing tests, schema/migrations, seed/dependencies/configuration and historical evidence remain byte-identical. UTF-8, protected-file hashes, default-mode preservation, links, full/staged diffs and whitespace were checked.

## Remaining gate and #50 handoff

The cold finding is classified and its documented failure/compensation behavior verified; no source correction is justified by these observations. #50 retains healthy persistent-store readiness, safe retry guidance and deployment recovery ownership. A fresh slow request may still fail safely, and permanent cleanup failure remains a separate operational limitation.

**Concrete blocker:** diagnose the latest unchanged recovery-case timeout in a separate bounded batch before claiming required verification GREEN. Do not substitute R1 or historical T-31 passes, infer CPU/load causes, raise budgets or weaken assertions. T-47 remains the next originally planned unmeasured gap, but was not started here. Final integration, peer review and Product DoD remain outstanding; all scenario/checkbox states are unchanged.
