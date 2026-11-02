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
