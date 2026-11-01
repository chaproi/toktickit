# Prisma 5.22 candidate compatibility gate - 2026-11-02

Starting HEAD: 4a8829c1e2ccfb1ffc824ab0d49b19740fb4df5b. Candidate adoption is authorized conditionally on compatibility; no application change precedes this assessment.

One bounded isolated execution will:

- Reuse the exact pinned 5.22 client/CLI/adapter/utils and pg 8.23 versions in a disposable ignored dependency/client directory; preserve root manifests/locks/schema and earlier proof files.
- Check the repository guard and dedicated live target before real PostgreSQL reads. Use uniquely tagged read-only connections; no business fixtures or schema writes are needed.
- Observe native pool startup size and native lazy initialization/disconnect/reconnect using byte-identical copies of the actual client/guard modules. Compare actual schema/timezone/SSL with an official-adapter client; explicitly separate untested deployment SSL policies from local observations. Do not copy the earlier proof's four-connection pool.
- Verify official-adapter disconnect/reconnect and explicit pool shutdown ownership using public APIs only.
- Quantify upstream registry retention through the public bindAdapter/errorRegistry.consumeError interface in two batches of 1,000 deliberately synthetic JavaScript exceptions. Consume every result immediately, then count still-retrievable original error records without any strong diagnostic error/scope array. This is a component retention assessment, not a fake database/serialization failure or memory-safety benchmark. No private property access, patching or heap-size guarantee.
- Stop before production RED/GREEN if the pinned long-lived client requires unsupported registry clearing or another unapproved lifetime/version design to bound retained errors. A successful technical transport proof does not establish safe long-lived adoption.

Record all subprocess exits, observations, source-copy fingerprints and cleanup. Drain operations, end owned pools/clients and delete only marker-verified temporary files. If blocked, publish this assessment and concrete decision choices; do not manufacture application RED, run a pointless full regression or broaden retry policy.
