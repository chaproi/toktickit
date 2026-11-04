# Reproduce the public release remedy and remaining gate

Starting RED is the already committed [failed-COMMIT release observation](../prisma6193-attempt-3-2026-11-02.json). Do not rerun that unchanged baseline. This standalone sandbox tests the remedy through matching Prisma **6.19.3** public client-engine/adapter interfaces; it is not application adoption or T-47 execution.

From server/, use a **new** result path:

```powershell
node --import tsx ../artifacts/lab-04/hardening/prisma6193-release-remedy/run.mjs ../artifacts/lab-04/hardening/prisma6193-release-remedy-new-attempt.json
```

The runner reuses the prior exact-version installer, complete application schema, committed migrations, source-copy pattern, coordinator and ownership checks. It copies the **unchanged existing observer** from prisma6193-evaluation/observe.ts; only the public remedy wraps it. Downloaded dependencies, temporary manifests/locks and generated clients remain inside marker-owned ignored cache directories and are removed. Original application files and earlier evidence never change.

Subprocesses, sequentially with owned absolute paths substituted:

```text
node <Node-install>/node_modules/npm/bin/npm-cli.js install --ignore-scripts --no-audit --no-fund --save-exact prisma@6.19.3 @prisma/client@6.19.3 @prisma/adapter-pg@6.19.3 @prisma/driver-adapter-utils@6.19.3 pg@8.23.0 typescript@5.7.2 tsx@4.19.2 @types/node@22.10.2 @types/pg@8.23.1
node <owned>/node_modules/prisma/build/index.js generate --schema <owned>/schema.prisma
node <owned>/node_modules/typescript/bin/tsc --project <owned>/tsconfig.json
node --expose-gc --import tsx <owned>/evaluate.ts
```

The runner copies the actual existing native5.22 package path into the assessment-only acquisition control; that native client is not the proposed candidate or a new version evaluation. No shared application dependency is installed/changed. Source and dependency versions/digests, stage times, subprocess exits and redacted results are recorded. Finite child process limits and existing transaction defaults remain unchanged.

remedy.ts composes only public SqlDriverAdapterFactory/Transaction methods. When COMMIT execution rejects, it performs a public ROLLBACK statement and a public rollback completion/release, then rethrows the original exception object. One completion promise per transaction prevents duplicate commit/rollback release. Subsequent queries reject as closed. Secondary failures reach a stage-only diagnostic callback; they are not attached to the primary cause or used to infer retry eligibility. No private manager, registry, pool-wide close, last-error cache or message-based classifier is involved.

components.ts uses clearly labelled synthetic transactions: 12 report groups / 31 component instances, including negative error identity, repeated completions, secondary cleanup failures and 20 concurrent independent completions. They are not real database fault or HTTP/retry evidence. evaluate.ts separately uses the real PostgreSQL coordinator for four genuine COMMIT40001 pairs in alternating winning orders, exact state/release attribution, plus actual staged-write rollback for a callback exception and a real uniqueness violation. Existing lifecycle and two-batch WeakRef observation are retained with their prior limits.

budget.ts then checks the remaining acquisition budget under a held single connection. Native connect5s/pool-wait10s are explicitly retained; pg's public Client option separates connect5s from Pool checkout10s. Both clients retain default maxWait2s/transaction timeout5s. A declared2.5s timer observes whether the queued attempt has settled before releasing the holder; it is deadline coordination, not an increased application budget or sleep to make a business race pass. All promises drain afterward. Native rejects before release; the 6.19.3 candidate remains pending until release. That essential failure stops production adoption and is never fixed/retried by this script.

The original run's outer tagged-connection check used a narrower inherited prefix. Its independent guarded probe checked **all** issue49-release-* connections and found zero. The final runner changes only that cleanup-check prefix, with a passing syntax check and no database rerun. Recorded original source hashes/results are preserved; the substantive remedy/evaluation/component/budget source matches execution.

Finally, drain callbacks, disconnect native/candidate clients, end owned pools/observers, remove only exactly owned schemas/directories and verify resource absence. The passing remedy needed **zero** forced releases. A cleanup intervention cannot satisfy a release assertion. Credentials, connection values and unrestricted errors remain unpublished.
