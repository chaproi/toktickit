# Reproduce the single-version 6.19.3 evaluation

Read [the prospective plan](plan.md) and [stop disposition](../prisma6193-evaluation-2026-11-02.md). This standalone diagnostic is outside test discovery and never imported by the application. It evaluates only matching prisma/@prisma/client/@prisma/adapter-pg **6.19.3**, public engineType="client"; no application upgrade, client rotation, private patch or benchmark is performed.

From server/, supply a **new** result filename:

```powershell
node --import tsx ../artifacts/lab-04/hardening/prisma6193-evaluation/run.mjs ../artifacts/lab-04/hardening/prisma6193-new-attempt.json
```

The runner refuses existing results, verifies the repository guard/live dedicated database and no other non-idle connection, then prepares a marker-owned ignored directory under server/node_modules/.cache/. It reuses the earlier runner's owned-schema/migration/cleanup structure and copies the actual application schema. Only the temporary generator output and engineType setting differ; no application schema or database DDL migration file changes.

Exact subprocesses (owned paths substituted internally):

```text
node <Node-install>/node_modules/npm/bin/npm-cli.js install --ignore-scripts --no-audit --no-fund --save-exact prisma@6.19.3 @prisma/client@6.19.3 @prisma/adapter-pg@6.19.3 @prisma/driver-adapter-utils@6.19.3 pg@8.23.0 typescript@5.7.2 tsx@4.19.2 @types/node@22.10.2 @types/pg@8.23.1
node <owned>/node_modules/prisma/build/index.js generate --schema <owned>/schema.prisma
node <owned>/node_modules/typescript/bin/tsc --project <owned>/tsconfig.json
node --expose-gc --import tsx <owned>/evaluate.ts
```

The runner records installed versions, package requirements, temporary-lock fingerprint, source-copy fingerprints, execution HEAD/time, phase durations and command exits. The source copies of the actor-lock/client/guard modules are byte-identical; they resolve the one temporary 6.19.3 generated client. Generated code, dependencies and temporary manifests/locks are not committed. Direct pins do not guarantee future transitive registry-resolution identity.

Two separate preliminary checks precede the transaction coordinator:

- A configuration-owned official adapter factory proves lazy connection startup, read-only local schema/timezone/TLS observation, disconnect pool disposal and reconnect with a fresh pool. These local observations do not complete general URL/SSL/acquisition-budget mapping.
- Two batches of 1,000 synthetic connect errors exercise the actual client engine's JavaScript exception path. WeakRefs and explicit diagnostic GC distinguish observed earlier-cohort reclamation from the current bounded debug tail. There is no strong diagnostic Error/Scope array in this component probe; no SQL or fabricated database outcome is sent. GC scheduling/heap-byte/production-rate claims are excluded. The retained attempt 2 records the invalid all-immediate-GC assumption; the corrected final probe requires earlier-cohort reclamation instead.

The real write-skew barrier/release coordinator is reused from the earlier COMMIT proof: two genuine SERIALIZABLE Prisma callbacks execute the actual inherited actor lock, read both Categories, update distinct rows and stage distinct RelatedSystems. Both finish their statements before either callback returns. Release/await winner, then release loser. Pass-through **public interface only** observations in observe.ts attribute backend/transaction IDs and native COMMIT errors; they neither fabricate results nor repair cleanup. The first failed essential gate stops further pairs.

On all paths, both pending promises drain before any owned leaked checkout is destroyed for cleanup. Such forced cleanup is reported as a failed lifecycle gate, never counted as normal release. The owned pool and native clients end, the exact owned schema is dropped and verified absent, and only the marker-proven temporary directory is removed. Child commands have finite bounds (install 120 seconds, others 60 seconds), and barrier waits are two seconds within unchanged transaction defaults. Credentials/connection values and raw errors remain unpublished.

The recorded final execution **fails**: a genuine COMMIT40001 reaches the correct attempt and rolls back, but leaves one real pg checkout unreleased. Do not treat rerunning this script as authorization to repeat until pass, modify internals or try another version. A later supported remedy needs an explicit next scope; production and full-regression checks remain behind that gate.
