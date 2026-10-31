# T-31 paired PostgreSQL / persistent attachment recovery — 2026-10-31

Scoped Issue #49 / partial AC-31/T-31 verification. The bounded **write-ready** recovery rehearsal passed with real persistent SeaweedFS and the actual production S3 adapter. Cold-start upload failure remains separately recorded below; readiness preparation is not a production fix. No whole-scenario, Product DoD, deployment recovery or release acceptance is claimed.

## Source, prerequisites and provenance

Preflight: clean `feat/49-final-hardening`, local/live origin aligned at `d4f50241ac8575e87885e972f21487ce93fe76a8`; no applicable AGENTS.md. All attempts ran locally on 2026-10-31, Asia/Bangkok, using Windows PowerShell, Vitest 2.1.9, PostgreSQL/native tools 18.6. No hosted CI or full-suite refresh.

The configured local S3 listener was unavailable; weed/Docker/Podman were absent and WSL was not installed. Native PostgreSQL tools were installed outside PATH. The official [SeaweedFS 4.51 release](https://github.com/seaweedfs/seaweedfs/releases/tag/4.51) Windows amd64 ZIP was downloaded only into an owned temporary directory. Its SHA-256 matched the GitHub asset digest `08866a53e1bdd5378ee9880f8ee30d981d1bbb6ae22ee1897deb17ff87f8d2fb`; the executable reported 4.51, commit `153ab668c99731a6d29492bf6c61d0b4fa701101`. No repository dependency or shared service was installed/changed.

The test starts its own loopback-only master/volume/filer/S3 process with eight allocated ports, fresh on-disk data and two UUID-owned buckets. It verifies an initially empty service identity before bucket/object writes. The actual `SeaweedFsS3Storage` is selected synchronously through the existing getter, with only its construction temporarily using NODE_ENV=production; NODE_ENV is immediately restored before real authentication/HTTP. There is no custom file adapter, in-memory map copy, mocked S3 response or replacement business query. The test-only helper verifies the actual bucket selection and disposes underlying S3 clients.

[Tests-only failure evidence e5596a8](https://github.com/chaproi/toktickit/commit/e5596a8090f7acfa0639a63b37ee134f6a7d8d4a) preserves the cold-upload failure. Successful execution used that HEAD with pending readiness/capacity corrections, subsequently committed unchanged as [2dc845b](https://github.com/chaproi/toktickit/commit/2dc845bd7f78aeccb089ff7ef89cb6f37a9513c1). It is not a post-commit/publication-HEAD run or a production GREEN correction. Existing native-tool functions were extracted unchanged for reuse; all existing recovery assertion bodies remain byte-identical.

## Every application-command attempt

Commands below ran sequentially from `server/`. For F, the command-local `TOKTICKIT_RECOVERY_WEED_EXE` pointed to the verified owned executable and was restored afterward. No assertion, existing retry or timeout was weakened. The new multistep case had a finite **30,000 ms budget from its first execution**, matching the existing native recovery case; it was never increased. The fixed 10-second service-listener readiness observation was also unchanged. The owned S3 probe/client has one attempt; application SDK/transaction policy remains inherited.

| Attempt | Files / collected / executed / passed / failed / skipped; exit | Vitest duration; command wall | Outcome |
| --- | --- | --- | --- |
| F1 | 1 / 1 / 1 / 0 / 1 / 0; 1 | 18.20s; 21.3617784s | Service startup blocked before business writes. A bounded separate startup diagnostic exited 2 in the child: inherited DEBUG=release is not Boolean. Removed DEBUG only from the Seaweed child environment. Diagnostic wrapper exit 0; owned process/directory cleaned. |
| F2 | 1 / 1 / 1 / 0 / 1 / 0; 1 | 6.57s; 7.6877766s | New fixture omitted required Ticket.itPriority; Prisma validation rejected setup. Corrected the new fixture only. |
| F3 | 1 / 1 / 1 / 0 / 1 / 0; 1 | 19.79s; 20.9895077s | Real first upload returned HTTP 500, before recovery assertions. |
| F4 diagnostic | 1 / 1 / 1 / 0 / 1 / 0; 1 | 17.41s; 18.5430831s | Pass-through timing/code-only diagnostics measured real S3 PUT 10,826 ms, transaction rejection P2028 at 10,847 ms and HTTP 500. Diagnostics removed before commit. |
| F5 | 1 / 1 / 1 / 0 / 1 / 0; 1 | 26.00s; 27.101263s | With observed PUT/HEAD/DELETE readiness, uploads/removal and DB restore progressed, but restored-bucket PUT returned InternalError. A one-volume fixture cap was insufficient for the two bucket collections. Only owned service capacity was corrected to 16 small, non-preallocated volumes. |
| F6 | 1 / 1 / 1 / 1 / 0 / 0; 0 | 26.91s; 28.3636128s | Complete recovery assertions passed. Write-readiness probe took 18,148 ms before application transactions; the test itself took 25,040 ms. |
| M | 1 / 21 / 21 / 21 / 0 / 0; 0 | 19.01s; 20.1137351s | Existing affected native recovery/constraint/index suite passed after helper extraction. No duplicate constraint/index cases added. |
| A | 2 / 45 / 45 / 45 / 0 / 0; 0 | 8.51s; 9.5752475s | Unchanged Lab 2 Attachments 42 and Lab 3 Attachments 3 passed; their existing in-memory/stub limitations remain separate. |
| T | Not a test collection; exit 0 | Command wall 16.1052278s | Server TypeScript passed without diagnostics. |

```text
F: npm.cmd test -- tests/lab-04/attachment-recovery.integration.test.ts
M: npm.cmd test -- tests/lab-04/migration-recovery.integration.test.ts
A: npm.cmd test -- tests/lab-02/attachments.api.test.ts tests/lab-03/attachments.api.test.ts
T: npm.cmd exec -- tsc --noEmit
```

Existing create-only seed warnings about ambiguous legacy identities/references and frozen/ineligible Action cohorts remained. PowerShell rendered stderr as NativeCommandError text; actual command exits are recorded above. No failed attempt is replaced by a passing diagnostic. No full server/client/E2E suite, build or performance workload ran.

## Consistent boundary and reached assertions

The [new rehearsal](https://github.com/chaproi/toktickit/blob/2dc845bd7f78aeccb089ff7ef89cb6f37a9513c1/server/tests/lab-04/attachment-recovery.integration.test.ts) uses real logins for an owning Requester, Staff, Administrator and foreign Requester, one fresh Ticket and owned reference data. Real authenticated Origin/CSRF uploads produce an active PNG and a PDF removed through the approved DELETE endpoint. Independently authored expected binary values are:

- Active PNG: 68 bytes; SHA-256 `15671d6715a3bb032b954ab94af9aedad9a7e0148253891238ff983a56641b12`.
- Removed PDF: 52 bytes; SHA-256 `d9324fdc1155ac356fb0f705f0b56b24183d7e4d26922adf8a95ec384cc3c8ea`.

After completed writes/removal, only this test owns the writers and they remain quiesced through sealing the pair. A real read-only REPEATABLE READ transaction exports its PostgreSQL snapshot; `pg_dump --format=custom --snapshot=… --schema=… --no-owner --no-privileges` uses that snapshot. The real active S3 object is exported to an on-disk binary; listing proves the removed object is excluded. A private paired manifest links the database archive SHA-256, all 15 table counts/canonical checksums, binary length/digest/MIME/key and removal state. The snapshot transaction stays open until both exports/manifest are sealed; a fresh post-commit source observation still matches. No storage keys, credential rows or private contents are published.

The source object is then deliberately deleted **after** backup sealing to prove target separation. The source database schema is retained under a second owned name. Standard `pg_restore --single-transaction --exit-on-error --no-owner --no-privileges` creates a new schema/OID under the original now-vacant name; no operational/shared schema is restored over. All 15 table checksums/counts match both the archive and retained source immediately. The separate empty restored bucket receives only the checksum-verified exported active object, never live source content.

The real application client reconnects to the new restored schema/OID and the production S3 adapter selects the restored bucket. Source object HEAD remains 404, so retained source data cannot satisfy the following successful reads:

- Owner Requester, Staff and Administrator receive exact inherited safe list/detail metadata and matching active binary length/digest, image MIME and nosniff.
- Removed metadata, attribution/time/reason remain exact; removed binary is absent and each authorized content request returns 410 ATTACHMENT_REMOVED.
- Foreign Requester list/detail/content requests receive inherited safe 404 envelopes without filenames or storage/private fields.
- Domain-table checksums remain unchanged around reads/denials. Only legitimate AuthSession/LoginThrottle bookkeeping is excluded after authentication; their full restored rows were included in the initial 15-table match.

## Repeatable runbook and #50 handoff

1. Run the actual test-target guard and live identity probe; require a dedicated database distinct from operational. Provision a verified standalone Seaweed executable externally, set `TOKTICKIT_RECOVERY_WEED_EXE` for this command only and run F. Missing executable fails explicitly BLOCKED, never skips or falls back to memory. The helper creates fresh namespaces/processes itself; it does not use the configured shared bucket.
2. Establish healthy **write readiness before application traffic**. The helper's owned PUT/HEAD/DELETE is outside application transactions and removed before fixture uploads. Seaweed's [bucket-per-collection model](https://github.com/seaweedfs/seaweedfs) requires capacity for both targets. Listener reachability alone was insufficient in the observed fresh service.
3. For a real deployment rehearsal, quiesce **all** deployment writers, seal a versioned DB/binary pair with the manifest relationship, then restore to isolated database/storage destinations. Keep application traffic disabled until both sides and object integrity/removal exclusions are verified. Do not pair unrelated DB and object backups.
4. Restore database then storage, point the application at the restored destinations, run access/removal/integrity checks and verify no unintended domain changes. The schema-rename technique is only this owned test harness's solution to pg_restore retaining names, not instructions to rename/drop an operational schema.
5. #50 must own deployment-specific paths/credentials, retention, encryption/access policies, release recovery procedures and actual deployment validation. This run uses local single-node logical S3 export with synthetic data; it is not a native Seaweed volume/filer metadata disaster restore, replicated recovery, IAM/TLS/ACL/version-history backup, live production recovery or abrupt-kill exercise. S3-object absence/410 does not certify secure erasure of old physical volume extents. No operational data was touched.

**Open finding:** real cold-service upload returned P2028/HTTP 500 after the measured 10,826 ms S3 PUT. The installed Prisma runtime defaults interactive transactions to 5,000 ms, and the unchanged SERIALIZABLE helper supplies only isolationLevel. This is consistent with transaction expiry, but the P2028 subtype was not retained; confirm that classification before choosing a production correction. The observed failure evidence and failing commit remain. Write readiness made this recovery rehearsal meaningful but does not prove slow-storage application behavior is repaired. Keep a separate bounded #49 follow-up for startup/readiness and slow-storage handling; do not increase transaction timeouts, weaken assertions or silently call the cold case GREEN. This is separate from T-47, whose specified workload excludes uploads.

## Cleanup and scope

Every attempt removed only owned schemas/buckets/objects/directories/processes and restored settings; native schema helpers asserted remaining=0. Source/restored S3 clients and Prisma/pg clients disconnected. Independent final probes found zero recovery schemas, idle transactions and Seaweed processes; no owned rehearsal directories remained. The downloaded executable/archive were removed after verification; private execution logs were retained separately. There is no binary/archive/credential payload in Git.

Production, schema/migrations, seed, dependencies/configuration and existing Attachment assertions are unchanged. The only existing test edit extracts byte-identical native helper bodies without altering any recovery assertions. UTF-8, protected-file hashes, helper/assertion preservation, links, complete/staged diff and whitespace checks passed. Historical artifacts and failures remain untouched. Remaining work: the cold-store finding, exact T-47 workload, visual/accessibility breadth, final integrated verification/peer review and #50 release; no broad scenario/DoD promotion.
