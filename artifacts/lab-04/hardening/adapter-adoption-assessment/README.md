# Reproduce the candidate compatibility assessment

This standalone assessment is deliberately outside normal server test discovery. It does not implement the adapter candidate, create application RED/GREEN, run the benchmark or change the application's dependencies/client/schema. See [the prospective plan](plan.md) and [disposition ledger](../adapter-adoption-compatibility-2026-11-02.md).

From server/, with existing locked dependencies and dedicated test configuration available, choose a **new** result path:

```powershell
node --import tsx ../artifacts/lab-04/hardening/adapter-adoption-assessment/run.mjs ../artifacts/lab-04/hardening/adapter-adoption-assessment-new-attempt.json
```

The runner refuses an existing result filename. It verifies the guard/live target and lack of another non-idle test operation, then creates a marker-owned ignored directory under server/node_modules/.cache/. Only there it installs:

```text
node <Node-install>/node_modules/npm/bin/npm-cli.js install --ignore-scripts --no-audit --no-fund --save-exact @prisma/client@5.22.0 @prisma/adapter-pg@5.22.0 @prisma/driver-adapter-utils@5.22.0 pg@8.23.0 typescript@5.7.2 tsx@4.19.2 @types/node@22.10.2 @types/pg@8.23.1
node <server>/node_modules/prisma/build/index.js generate --schema <owned>/schema.prisma
node <owned>/node_modules/typescript/bin/tsc --project <owned>/tsconfig.json
node <owned>/node_modules/tsx/dist/cli.mjs <owned>/assessment.ts
```

The installed Prisma CLI must be exactly 5.22.0. The copied application schema receives only temporary generator output/preview settings; **no DDL/migration or fixture write executes**. Byte-identical copies of prisma.ts and testing/test-database.ts exercise the existing singleton and guard against the one temporary generated client. Their fingerprints, exact direct versions, temporary lock fingerprint, executed source hashes, starting HEAD and timestamps are recorded. Downloaded/generated packages and temporary manifests/locks are deleted and excluded from Git.

All children run sequentially with finite process bounds (120 seconds for install, 60 seconds otherwise). Raw child logs stay private; JSON contains redacted classifications, timings and counts. The assessment refuses unreviewed URL option names or ambient PG environment overrides; it only verifies the current local non-TLS configuration. It is not a general connection-string adapter implementation. The assessment-owned pg pool uses the actual native startup max, not the earlier proof's four connections. Other assessment pool values are explicit; no claim of native/pg timeout equivalence is made.

Lifecycle reads use real PostgreSQL and explicit read-only transactions. The first failure exposed a diagnostic listener generic type mistake. The next failure occurred at an incompletely classified settings query. Final source adds safe phase/code recording and explicit text projections, while separately retaining an actual public-adapter capability observation for PostgreSQL's unsupported name result type. Neither correction changes a production/business expectation.

The retention portion calls **public bindAdapter and errorRegistry.consumeError**, not engine/private fields. Two batches each generate 1,000 labelled synthetic JavaScript exceptions on a diagnostic adapter that sends no SQL to PostgreSQL. Every result is consumed immediately; subsequent integer-ID scans check the still-retrievable Error/cause identity. No strong Error or Scope array is retained by diagnostic code; only two numeric batch summaries survive. These are component probes, never claimed as real serialization/database failures. No heap-byte, GC lifetime, production error-rate or memory-safety conclusion is inferred from them.

Finally all awaited operations drain, native clients disconnect, the external pool explicitly ends, the observer ends and only the marker-verified temporary directory is deleted. The local source URLs/credentials remain in child environment/memory and are never published. The runner verifies zero tagged connections afterward; an independent guarded cleanup probe is separately recorded in the ledger. Both earlier failed attempts are retained. The assessment's passing exit means its measurements/assertions completed; its **adoption disposition is blocked**, not GREEN.
