# Prisma6.19.3 public startup deadline proof

Owned sandbox only; application dependencies, schema and retry behavior remain unchanged. Run from `server/` with an unused artifact name:

```powershell
node --import tsx ../artifacts/lab-04/hardening/prisma6193-start-deadline/run.mjs ../artifacts/lab-04/hardening/<new-result>.json
```

The runner verifies the existing guard and live dedicated database before creating a uniquely owned schema, copies committed migrations and the schema, installs exactly6.19.3 packages in an owned ignored directory, generates/types the temporary client and executes the finite proof. It reuses the previously verified public release remedy and genuine SSI coordinator. It drops only its schema and verified owned directory after child termination/draining. No T-47 workload is executed.

The prospective [completion checklist](checklist.md) distinguishes established evidence from conditional application adoption. Existing held-connection failure at a5e1ab4 is the deadline RED; it was not repeated.

## Recorded progression, 2026-11-02

- Attempt1 passed the startup tests and two genuine COMMIT-winning orders. Default2000ms rejected in2005.897ms with holder still acquired. Explicit70ms/80ms and concurrent60/120/180ms deadlines rejected without running business callbacks. Late acquisition/rejection drained, shutdown waited for pending work, reconnect worked, and observed releases were exactly once. A callback ran220.1984ms after successful startup with maxWait60ms and timeout5000ms. Zero unhandled rejections, pending starts, checkouts, idle transactions or forced cleanup. This version used a public outer Proxy.
- Attempts2/3 added actual configuration/scalar checks and changed to replaceable own public methods for inherited pass-through observers. Both failed at the first read. Their children required the declared60s termination; neither is a passing gate. Attempt3 narrowed the phase but did not classify it.
- One three-way configuration differential also failed (direct pg, official unwrapped Prisma and wrapped Prisma). The same retained error hash matches the public constant `SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string`. The new helper's object spread lost pg-pool's non-enumerable password option. Explicitly preserving that public property is a fixture/configuration correction. The PowerShell differential command reported shell exit0 because its `finally` restored an environment value; the recorded child timeout/failure remains the actual verdict.
- Attempt4 fixed that property and passed connection/read-only settings, then exposed semantic raw-type RED: expected `2026-11-01T12:34:56.789Z`, actual `2026-11-01T19:34:56.789Z`. The existing session is Asia/Bangkok; no timezone was changed. Later instrumentation/deadline/COMMIT checks in this attempt were unreached. This is a compatibility failure, not application GREEN.

All results record execution HEAD a5e1ab4 plus source digests of pending proof bytes. Earlier source variants were superseded before publication; those digests and the stated changes distinguish their provenance. Prior release, retention and held-connection results remain unchanged.

## Public interfaces and limits

- [6.19.3 transaction manager](https://github.com/prisma/prisma/blob/6.19.3/packages/client-engine-runtime/src/transaction-manager/transaction-manager.ts): startup and callback budgets are separate. The public wrapper tracks each underlying promise until settlement and refuses expired callbacks; disconnect drains first. Native failed starts can leave waiting bookkeeping until disconnect; this is distinct from the old exception registry and prevents any claim of general memory safety.
- [6.19.3 public adapter](https://github.com/prisma/prisma/blob/6.19.3/packages/adapter-pg/src/pg.ts) and [conversion](https://github.com/prisma/prisma/blob/6.19.3/packages/adapter-pg/src/conversion.ts): the next gate is timezone-preserving raw-result compatibility. No private member is patched.
- [pg per-query parsers](https://node-postgres.com/features/queries#types) are a possible public correction seam. No parser remedy is claimed by this checkpoint.

The candidate configuration maps only the repository's evaluated loopback/plaintext Windows setup, not arbitrary TLS deployments. It preserves physical-core pool sizing (8 cores ->17), connect5000ms, pool-wait10000ms, idle300000ms, unlimited lifetime and backend timezone. Unknown/repeated options, unmapped TLS/remote defaults and unsupported schema spellings reject explicitly. No pg defaults are silently substituted. Production adoption remains conditional on the entire checklist.

## Subsequent corrections and final disposition

- Attempt5 stopped at temporary TypeScript: the new parser's narrowed `getTypeParser` function was not retained across an object alias. Capturing the already narrowed function fixed only that typing defect. No database schema was created in this attempt.
- Attempt6 passed the exact raw scalar assertions through the documented pg per-query parser seam, then exposed a public-extension failure: query-extension calls inside a transaction were0 instead of1. The wrapper had bound the base public transaction method to the original client, dropping an extended receiver.
- Attempt7 retained that assertion and the original scalar/deadline/release expectations, preserving the public receiver. All gates in that script passed: eight deadline observation groups (including three concurrent callers), constructor/per-call/default precedence, a185.2542ms callback with maxWait60ms, two genuine COMMIT40001 winning orders, exact rollback/release, actual configuration and scalar types, public pass-through observation/query extension and disconnect/reconnect. No forced release or remaining checkout/idle transaction.
- A single separate real late-pool-rejection diagnostic then tested the outstanding source-backed bookkeeping risk. Caller rejected at74.0511ms with maxWait60ms; underlying pool rejection drained at10008.7836ms without running its callback. There were zero pending wrapper promises/checkouts after holder release. Public diagnostic events reported zero transaction closures after drain and **one closure only during explicit disconnect**. This matches the version-matched failed-start path retaining a waiting record until disconnect.

That waiting metadata is not the old5.22 exception registry or a checked-out database connection. Its source path has no per-failure bound/removal on rejection; no heap-byte or production leak-rate claim is made. No supported per-failed-start cleanup interface was identified. Periodically disconnecting/rotating clients or patching the manager is outside the authorized remedy. **Application adoption stops at this remaining lifecycle/retention gate.** No application CREATE/EDIT RED, dependency migration, application GREEN, affected/full regression or benchmark execution is claimed.

All results are diagnostic scripts, not invented Vitest case totals. [Attempt7](../prisma6193-start-deadline-attempt-7-2026-11-02.json) and [the retention observation](../prisma6193-start-deadline-retention-2026-11-02.json) record execution61be356 plus pending source fingerprints, not execution at a later publication commit. The later runner adds retention-only mode; core substantive sources match the successful run. The original `unsupportedOptionsRejected` summary lists both inspected and exercised rejections: unknown and unmapped TLS were executed, while repeated/remote/non-simple-schema rejection was assessed by code inspection.

For the single retention diagnostic, use a new result path and preserve the native process exit code:

```powershell
$env:EVAL_RETENTION_DIAGNOSTIC='1'
$proofExit=1
try {
  node --import tsx ../artifacts/lab-04/hardening/prisma6193-start-deadline/run.mjs ../artifacts/lab-04/hardening/<new-retention-result>.json
  $proofExit=$LASTEXITCODE
} finally { Remove-Item Env:EVAL_RETENTION_DIAGNOSTIC }
exit $proofExit
```

The child alone receives the narrow public DEBUG namespace. Only event counts enter the redacted JSON; log text is not a production error/retry mechanism. Neither mode raises existing application budgets or runs the T-47 workload.
