# Public startup deadline remedy and remaining adoption gate - 2026-11-02

**Disposition: deadline/configuration proof passes; application adoption remains blocked by failed-start transaction bookkeeping retention.** No production, dependency, schema, retry or workload change was made. The existing release remedy is unchanged. No unsupported/private cleanup or client rotation was implemented.

## Scope and source provenance

The original branch/origin/local/upstream HEAD was a5e1ab4d78d24125050a3cb5be9ed0ccdcf75033 with a clean index/tree; repository identity and fetch were verified, no applicable AGENTS.md found. The prospective [single completion checklist](prisma6193-start-deadline/checklist.md) was written before implementation. Completed5.22/6.19.3 investigations and the committed held-connection failure were reused, not rerun as unchanged baselines. Only exact Prisma/client/adapter6.19.3 was evaluated in an owned sandbox.

Proof checkpoint **61be356757e1619425666d8aab2e20fc98586a23** retains startup proof and the timezone RED. Proof corrections/retention observation **1686cab523dcb5eef97c12e4df8ea3deadea295f** are separate. Attempts1-4 ran at a5e1ab4 plus source digests of pending proof files. Attempts5-7 and retention ran at61be356 plus pending proof bytes. Four core successful-run source digests (deadline, deadline checks, connection configuration, evaluator) match the later committed bytes. The runner subsequently adds retention-only mode. Neither1686cab nor the later evidence commit is claimed as a post-commit application execution.

Environment: Windows/Node24.14.0, PostgreSQL18.6, TypeScript5.7.2, pg8.23.0, tsx4.19.2; matching prisma/@prisma/client/@prisma/adapter-pg/@prisma/driver-adapter-utils6.19.3. Installed manifests retain Node>=18.18 and TypeScript peer>=5.1.0. This is local diagnostic execution, not hosted CI, release approval or general platform certification.

## Every execution and correction

All runs were sequential; no overlapping proof/test command. Times below are **Asia/Bangkok on2026-11-02**, converted from immutable JSON UTC timestamps. The exits column is temporary install/generate/type/proof-child in order. Last-stage elapsed uses the monotonic clock; setup phase timings remain in each original JSON. These are scripts, not fabricated Vitest collected/passed totals.

| Record | Local start | Subprocess exits | Outer verdict | Last-stage ms | Actual result |
| --- | --- | --- | --- | --- | --- |
| [attempt-1](prisma6193-start-deadline-attempt-1-2026-11-02.json) | 10:46:20.622 | 0/0/0/0 | 0 | 15220.116 | Initial public Proxy deadline/COMMIT proof passed. |
| [attempt-2](prisma6193-start-deadline-attempt-2-2026-11-02.json) | 10:48:58.161 | 0/0/0/terminated | 1 | 60022.297 | First configuration read failed; proof child terminated at60s. |
| [attempt-3](prisma6193-start-deadline-attempt-3-2026-11-02.json) | 10:51:12.750 | 0/0/0/terminated | 1 | 60017.780 | Redacted phase diagnosis: first read; child terminated at60s. |
| [differential](prisma6193-start-deadline-differential-2026-11-02.json) | 10:53:33.101 | 0/0/0/terminated | shell0; failed runner | 60035.541 | All three paths fail with the same password-type error; child terminated at60s. |
| [attempt-4](prisma6193-start-deadline-attempt-4-2026-11-02.json) | 10:55:22.968 | 0/0/0/1 | 1 | 3521.282 | Connection corrected; timestamptz instant shifted+7h. |
| [attempt-5](prisma6193-start-deadline-attempt-5-2026-11-02.json) | 10:58:00.651 | 0/0/2 | 1 | 1590.017 | Temporary TypeScript exit2; no business proof/schema writes. |
| [attempt-6](prisma6193-start-deadline-attempt-6-2026-11-02.json) | 10:58:52.219 | 0/0/0/1 | 1 | 3533.419 | Scalar fix passed; public query extension saw0 rather than1 call. |
| [attempt-7](prisma6193-start-deadline-attempt-7-2026-11-02.json) | 11:00:04.960 | 0/0/0/0 | 0 | 16580.385 | Corrected public receiver; complete combined script passed. |
| [retention](prisma6193-start-deadline-retention-2026-11-02.json) | 11:01:09.554 | 0/0/0/0 | 0 diagnostic | 11988.187 | One late real pool rejection; waiting record closes only at disconnect. |

The differential's PowerShell `finally` restored its scoped environment and masked the runner's failure with shell exit0. Its failure record and terminated child remain authoritative. Subsequent scoped command explicitly preserves `$LASTEXITCODE`. The first-read failures are not deadline or application GREEN evidence.

The three-way differential found the same redacted error digest in direct pg, unwrapped official Prisma and wrapped Prisma. It matches only the known public constant `SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string`. Inspection of installed pg-pool confirms it makes its password option non-enumerable; the new Client subclass's object spread dropped it. Explicitly copying `config.password` is the demonstrated helper correction. No credential value was retained, printed or compared in a published artifact. The failed children ended under the original finite process limit; cleanup then independently proved no remaining owned resources.

Attempt4 reached raw scalar assertions and retained meaningful timezone RED: an expected12:34:56.789Z instant became19:34:56.789Z under Asia/Bangkok. The proof correction composes pg's documented per-query `types.getTypeParser` through its public Client query method, only for text timestamptz OID1184; the original instant is normalized before adapter conversion discards the offset. Other parsers/queries delegate unchanged. No timezone, global parser, private adapter implementation or assertion was changed. Attempt5's TypeScript narrowing mistake was fixed by retaining the already narrowed parser function. Attempt6 exposed bound-receiver loss of public query extensions; the corrected public wrapper preserves the receiver rather than forcing every call onto the original client. Both failures remain in their original records.

Exact root commands were `node --check artifacts/lab-04/hardening/prisma6193-start-deadline/run.mjs` and, from server/, the following runner invocation with each listed result suffix:

```text
node --import tsx ../artifacts/lab-04/hardening/prisma6193-start-deadline/run.mjs ../artifacts/lab-04/hardening/prisma6193-start-deadline-<suffix>-2026-11-02.json
```

Suffixes in order: attempt-1, attempt-2, attempt-3, differential, attempt-4, attempt-5, attempt-6, attempt-7, retention. Differential sets child-scoped EVAL_CONFIGURATION_DIAGNOSTIC=1; retention sets EVAL_RETENTION_DIAGNOSTIC=1. [Reproduction instructions](prisma6193-start-deadline/README.md) preserve the scoped PowerShell command and actual exit handling. Expanded subprocesses in the runner are:

```text
node <npm-cli.js> install --ignore-scripts --no-audit --no-fund --save-exact prisma@6.19.3 @prisma/client@6.19.3 @prisma/adapter-pg@6.19.3 @prisma/driver-adapter-utils@6.19.3 pg@8.23.0 typescript@5.7.2 tsx@4.19.2 @types/node@22.10.2 @types/pg@8.23.1
node <owned-sandbox>/node_modules/prisma/build/index.js generate --schema <owned-sandbox>/schema.prisma
node <owned-sandbox>/node_modules/typescript/bin/tsc --project <owned-sandbox>/tsconfig.json
node --expose-gc --import tsx <owned-sandbox>/evaluate.ts
```

The final command uses diagnostic.ts or retention.ts for those two explicitly labelled modes. Generated/dependency directories are never committed. All install/generate stages exited0; type exited0 except attempt5's2. No application TypeScript/full server/build or T-47 run is implied by these temporary checks. No full suite was started because the adoption stop condition was reached.

## Verified deadline and release behavior

Attempt7's eight observation groups include ten deadline/execution commands when the three concurrent callers and two constructor/override observations are expanded; a further read checks inherited Serializable isolation. They are not ten independently collected Vitest tests.

| Requirement | Actual observation |
| --- | --- |
| Effective options | Public transaction boundary captures per-call > constructor > inherited defaults; maxWait2000ms, execution timeout5000ms; constructor180ms and explicit50ms observed independently |
| Prompt default rejection | P2028 at2009.3551ms while the sole holder remained acquired; callback calls0 |
| Per-call deadlines |70ms ->73.136ms;80ms ->93.7319ms; no callback-after-timeout |
| Separate execution budget | Successful startup with maxWait60ms; callback completed in185.2542ms with its separate5000ms timeout |
| Concurrent callers |60/120/180ms contexts settled separately at75.4934/135.6382/183.3137ms; all three late results drained |
| Late acquisition/rejection | Every underlying promise observed until completion; successful late starts rolled back/released once, actual pool rejection drained; no request-specific pool close |
| Shutdown | Disconnect waits for pending starts; new transaction refuses while draining; reconnect works; holder released before final pool shutdown |
| Database resources | Zero unhandled rejections, wrapper pending promises, checked-out connections or idle transactions after drain; every observed completed transaction releases exactly once |
| Continued native COMMIT transport | Two genuine SSI pairs, winning orders0/1: callbacks complete before coordinated commit, distinct backends/xids, exact40001 object reaches its attempt, independent winner persistence/loser rollback, each release1, zero forced cleanup |
| Other rollback controls | Real callback abort after staged writes and real23505/P2002 uniqueness failure each roll back and release once |

The public wrapper uses per-client AsyncLocalStorage and per-attempt timers/options. It arms only when adapter startup begins and clears before invoking user logic. An expired guarded callback never runs business code. The outer timeout does not abandon the underlying transaction promise; disconnect drains tracked promises. It adds no serialization retry or global last-error cache. Safe startup deadline classification carries phase/maxWait only and no40001 cause.

## Used configuration/result matrix

| Configuration/interface | Disposition and limit |
| --- | --- |
| Identity/credentials/schema | Explicit decoded URL fields, repository test guard before writes, unique simple owned schema/search_path; no connection strings/secrets in output |
| Pool size | Actual Windows physical-core probe8 -> inherited17; no four-connection proof pool or pg default10 substitution; explicit connection_limit supported |
| Connect/pool/execution | Separate connect5000ms and pool checkout10000ms via public PoolConfig.Client, idle300000ms/lifetime0; transaction startup2000ms/callback5000ms unchanged |
| Timezone | Actual backend Asia/Bangkok preserved; public timestamptz parser corrects the demonstrated raw offset loss; no UTC-session substitution |
| TLS/additional deployments | Evaluated repository loopback plaintext only; unmapped TLS and remote implicit defaults reject rather than weaken validation. No TLS deployment certification claimed |
| URL additions | Unknown and unmapped TLS rejection executed. Repeated/remote/non-simple-schema rejection inspected. The JSON's enumerated unsupported-options summary combines these two evidence kinds; it does not establish five executed negative cases |
| Lifecycle | Lazy first connection, configuration-owned pool disposal/fresh reconnect, public query-extension/pass-through instrumentation verified; external proof pool remains explicitly caller-owned |
| Raw values | Independent int/bigint/numeric/timestamptz/JSON/enum/byte assertions passed. Known unsupported native `name` projections still require explicit text casts if adoption proceeds; no application helper was changed here |
| Release/errors/retention carried evidence | Prior exact-primary/secondary-safe idempotent release and negative component evidence reused. Prior bounded error WeakRef observation is not a heap/leak-rate claim. Application-specific bridges/negative retry matrices remain unreached |

Default sizing's public Windows core query is candidate-local. Platforms without a proved physical-core mapping reject instead of silently using logical CPUs. Unused options/deployments are not invented certification obligations. Connection URL spelling, unsupported raw types, four inherited `$use` observers and constructor migrations remain documented integration work, not silently altered application behavior.

## Essential remaining gate: waiting-start bookkeeping

The one [retention diagnostic](prisma6193-start-deadline-retention-2026-11-02.json) deliberately retains the original connect5s/pool-wait10s settings. One real queued start exceeds explicit maxWait60ms: caller rejects safely at74.0511ms; the underlying pool rejection is observed/drained at10008.7836ms. Its business callback never runs, pending wrapper count is0, and the held connection is released. A subsequent real raw read succeeds. Narrow public transaction-manager debug events record **0 closures after drain, then1 closure during public disconnect**. The debug output is only a diagnostic observation, never production attribution/retry logic.

Version-matched [transaction-manager source](https://github.com/prisma/prisma/blob/6.19.3/packages/client-engine-runtime/src/transaction-manager/transaction-manager.ts#L94) places a waiting wrapper in its active map before awaiting adapter startup. Rejection exits before the later close/removal path. [ClientEngine transaction handling](https://github.com/prisma/prisma/blob/6.19.3/packages/client/src/runtime/core/engines/client/ClientEngine.ts#L389) propagates that error; normal disconnect cancels records. Thus one observed rejected start leaves one wrapper until disconnect, and this path has no source-level per-failure bound. This is **waiting metadata, not retained original exception objects, a live SQL transaction or the old5.22 registry**. No heap bytes or production growth rate was measured. Diagnostic arrays holding selected errors are separate from upstream storage.

No public per-failed-start handle/disposal was identified: the public caller never receives a transaction ID on failed start. The deadline wrapper cannot remove that upstream record through the approved lifecycle methods without disconnecting the live client. Per-request whole-pool shutdown, client rotation and private-manager cleanup are expressly excluded. This bounded observation/source analysis leaves the singleton lifecycle/retention gate unresolved, so **stop before application adoption**. The successful deadline/resource proof is not permission to claim all compatibility gates passed.

Concrete next action: establish a supported per-failed-start cleanup design for this exact version, or make an explicit scope decision about this precisely qualified metadata-retention risk. Do not silently accept it, alter budgets/retries, choose another version or turn disconnect/rotation into the remedy. Real authorized Action CREATE/EDIT RED, candidate dependency/engine adoption, fresh-auth/eligibility/token retries, three-attempt exhaustion, HTTP redaction, T-51/T-52 and affected/full-server/build remain blocked/unexecuted. Their existing evidence remains historical; no application GREEN is claimed.

## Cleanup and preservation

Every runner checked the existing guard/live dedicated database against operational identity before owned writes, with no overlapping job. Temporary complete migrations were applied only in collision-protected disposable schemas. Pending operations drained or the declared failed child was terminated before exact owned schema/directory removal. Final independent guard probes: **0 owned schemas,0 proof connections,0 idle transactions,0 default-schema proof users,0 owned sandbox directories/processes**; observer/client/pool sessions ended and scoped environment settings restored.

All539 files tracked at the starting revision remained byte-identical through proof execution, including the original release remedy/observer, production/schema/manifests/locks/tests and historical failed T-47 samples. Only hardening-audit.md is updated afterward among those originals. No benchmark or application suite was run, no performance improvement asserted, and no Issue/PR/checklist/scenario/Product DoD metadata changed. T-47 remains failed; implementation acceptance/release remain pending.

Final documentation/proof validation:20 UTF-8 files without BOM/replacement characters,9 valid JSON records,65 resolved local links,10 consistent Markdown tables,55 preserved scenario/contract/execution/classification cells and unchanged checkbox lines. All539 starting tracked-file byte hashes match except the intended hardening audit update. Full/staged scope and whitespace checks pass; normal Git LF-to-CRLF warnings do not change the execution verdict.
