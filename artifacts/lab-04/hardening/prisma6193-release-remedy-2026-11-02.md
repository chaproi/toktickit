# Prisma 6.19.3 public release remedy; acquisition gate failed - 2026-11-02

**Release correction verified; candidate adoption remains blocked by the unchanged transaction acquisition budget.** The public remedy passes genuine failed-COMMIT cleanup in both winning orders, with zero forced cleanup. The subsequent native-versus-candidate test demonstrates deferred maxWait enforcement. Per the explicit stop condition, no application RED/GREEN, dependency upgrade, private patch, client rotation, alternate version or benchmark run followed.

## Provenance and bounded scope

Preflight verified chaproi/toktickit, clean feat/49-final-hardening, local/upstream/live origin **3a3a953a5af3db8ce355c1827e2ee6bfeadc9650**, ahead/behind 0/0 and no applicable AGENTS.md or overlapping repository test/proof/generation process. All **530 existing tracked files** were fingerprinted and remained byte-identical during execution. The [prospective plan](prisma6193-release-remedy/plan.md) identifies the release remedy and remaining acquisition comparison before running either.

Starting RED is [d0ca9f9's original failed-COMMIT record](prisma6193-attempt-3-2026-11-02.json): native 40001 reached its attempt, exact state held, but loser releaseCalls=0/checkout=1. That unchanged baseline was **not rerun**. The [new exact-version runner](prisma6193-release-remedy/run.mjs) reused the earlier complete schema, six immutable migrations, source-copy layout, observer and genuine write-skew coordinator; downloaded packages/generated clients remained sandbox-only.

The sole run used starting HEAD 3a3a953 with pending new standalone files. Actual versions: prisma/@prisma/client/@prisma/adapter-pg/@prisma/driver-adapter-utils **6.19.3**; pg **8.23.0**; TypeScript **5.7.2**; tsx **4.19.2**; @types/node **22.10.2**; @types/pg **8.23.1**. Environment: Windows, Node **24.14.0**, PostgreSQL **18.6**. The installed native client **5.22.0** served only as the existing-budget control, not another candidate evaluation. All temporary direct pins, actual manifest requirements, lock/source/copy fingerprints are in the original [machine-readable result](prisma6193-release-remedy-attempt-1-2026-11-02.json). Proof correction and new failed-gate evidence are committed separately as [924f21edeb4182ed032d39de9d5e31c534fe027e](https://github.com/chaproi/toktickit/commit/924f21edeb4182ed032d39de9d5e31c534fe027e). No post-publication-HEAD or hosted-CI execution is claimed.

After execution, run.mjs's inherited cleanup-query prefix was widened from issue49-release-proof* to issue49-release-*; `node --check` passed. This is a cleanup-observation-only refinement, not a change to the executed remedy, acquisition test or business assertions. The original result/source hashes stay untouched, and no failed gate was rerun. An independent actual guarded probe already verified the broader prefix and all resources absent.

## Supported public cleanup composition

[remedy.ts](prisma6193-release-remedy/remedy.ts) uses the published [6.19.3 Transaction/adapter types](https://github.com/prisma/prisma/blob/6.19.3/packages/driver-adapter-utils/src/types.ts), official [pg transaction completion methods](https://github.com/prisma/prisma/blob/6.19.3/packages/adapter-pg/src/pg.ts#L137) and [COMMIT/release sequence](https://github.com/prisma/prisma/blob/6.19.3/packages/client-engine-runtime/src/transaction-manager/transaction-manager.ts#L229). It never reads/patches engine or registry internals.

When public COMMIT execution rejects, the wrapper awaits an explicit public ROLLBACK query, then public transaction.rollback completion to return the connection, and rethrows the **exact original object**. One transaction-local completion promise makes later commit/rollback callbacks idempotent. It rejects use after completion rather than touching a released connection. Cleanup also covers a rejected ROLLBACK command. No pool-wide shutdown or global error cache compensates for a single failed transaction.

If rollback execution or completion itself fails, an optional reporter receives only a whitelisted cleanup-stage name. The primary error is retained unchanged, without secondary errors attached to its cause/classification. Reporting failures cannot replace it. This preserves the distinction between cleanup and retry eligibility; it is not a promise of physical release in every possible infrastructure failure. Those secondary cases are component simulations, not actual network-outage tests.

## What passed

| Contribution | Actual executed checks | Result |
| --- | --- | --- |
| Genuine COMMIT40001 | Four real SERIALIZABLE pairs, winner order 0/1/0/1; eight callback bodies completed before release | **4/4 pairs passed**. Each winner/loser released exactly once; exact adapter exception object and backend/xid attribution; original40001; independent winner persistence/loser rollback; zero checked-out connections and idle transactions |
| Normal/completion/idempotence | Synthetic public Transaction success, ordinary engine-style rollback, repeated/concurrent commit/rollback and closed-query rejection | Passed with one release per transaction; no production API mocked |
| Negative primary identity | Synthetic typed 40001, 40P01, 23505, unknown P2034, P2002, message-only 40001 and unexpected Error | Every primary object preserved exactly after cleanup. No conversion to 40001 or message/log heuristic; full application retry matrix remains unexecuted |
| Secondary cleanup faults | Synthetic rollback-query failure, and rollback-query plus release failure whose error itself contains 40001 | Original unknown primary/cause preserved; only stage names reported; release invoked once. Secondary 40001 does not contaminate the primary |
| Concurrent component failures | 20 independent simultaneous synthetic completions | 20/20 exact primary identities and one release each; separate from natural database pairs |
| Actual callback/query rollback | Real staged RelatedSystem write then a labelled callback exception; real staged write then actual duplicate Category insertion | Both rolled back with one release and zero checkouts. Actual uniqueness returned P2002/23505; callback exception identity preserved |
| Ordinary factory lifecycle | Configuration-owned public factory: lazy startup, disconnect removes connections, reconnect with a fresh pool | Passed; local owned schema, read-only mode, timezone Asia/Bangkok, TLS false |
| Bounded retention observation | Existing 2x1,000 actual client-engine synthetic connect errors, WeakRefs/diagnostic GC | Earlier 1,000 cohort entirely reclaimed; current tail 34 and cumulative 1,966 reclaimed. No permanent per-error-ID registry on this path demonstrated; no heap/GC/production-rate guarantee |

The component file reports **12 groups covering 31 synthetic transaction instances** (11 individual instances plus one 20-concurrent group). These are not 31 real SQL failures, Vitest totals or HTTP authentication tests. The four native pairs contain one real 40001 each and a successful concurrent peer; they do not claim two native serialization aborts were forced simultaneously. Real actor-lock/ORM/raw callback connection compatibility is inherited from the coordinator; full live-session/Action authorization is still behind adoption gates.

All four native pair observations record callback completion, distinct backends/transactions, same-connection ORM/raw/inherited-lock behavior, application error state 40001/kind TransactionWriteConflict, exactAdapterErrorObjectReachesAttempt=true, loserBackendAndXidAttributed=true, winnerReleaseCalls=1, loserReleaseCalls=1, checkedOutConnections=0, idleTransactions=0 and independentExactState=true. Final checkedOutBeforeForcedCleanup=0 and destroyReleasedOnlyOwnedClients=0. The remedy's pass is ordinary supported cleanup, not an emergency cleanup intervention.

## Essential remaining acquisition failure

[budget.ts](prisma6193-release-remedy/budget.ts) compares the actual installed native 5.22 baseline with the 6.19.3 candidate using the remedy. Both use one connection; a held transaction executes a real read and retains that connection while the second interactive transaction queues. Both retain default **maxWait 2,000ms** and transaction timeout 5,000ms. No application option is raised/overridden.

Native connect_timeout 5s and pool_timeout 10s are explicit. On the candidate, pg's **public PoolConfig.Client option** supplies a Client subclass retaining connect 5s, while the Pool checkout limit remains10s. This avoids the earlier proof's combined5s substitution and is an assessment-only mapping; no application pool changes. The held-connection comparison is about transaction maxWait, not changing the pool wait to 2s or timing a full performance workload.

| Actual client | Settled before holder released at declared 2.5s observation? | Queued attempt outcome | User callback executed? |
| --- | --- | --- | --- |
| Installed native 5.22 control | **Yes** | P2028 at **2,012.665ms** | No |
| 6.19.3 public release-remedy candidate | **No** | P2028 at **2,508.221ms**, only after holder release | No |

The 2.5s timer is declared diagnostic deadline coordination with 500ms tolerance, not an increased 2s application budget or an arbitrary sleep to make a race pass. Native rejects while the connection is still held. Candidate remains pending past the unchanged maxWait and settles only when released; both requests/holders then drain. No additional slow run was performed to estimate a worst case. The exact failure assertion is **default maxWait must reject before releasing the held connection: false !== true**.

Version-matched [transaction-manager startup source](https://github.com/prisma/prisma/blob/6.19.3/packages/client-engine-runtime/src/transaction-manager/transaction-manager.ts#L94) explains the observation: the maxWait timer sets a flag, then startup still awaits driverAdapter.startTransaction; that flag is checked only after acquisition resolves. It does not promptly reject the caller at the deadline. The public adapter startTransaction receives isolation level, not per-call maxWait; merely wrapping COMMIT release cannot enforce the missing start deadline. The observed budget failure is not pool exhaustion, CPU-pressure speculation, a business-state/token failure or a generic classification of every P2028.

**Stop disposition:** the authorized release remedy is supported and verified for this failure, but not all essential compatibility gates pass. Do not silently set pool wait to 2s, raise maxWait, rotate clients, patch the private timer or retry until favourable. A further narrowly reviewed public transaction-start deadline design would need to preserve each call's options, cancel/drain late acquisitions and release exactly once; the adapter-only public interface lacks that per-call option. No such design is implemented or assumed safe here.

## Commands, provenance and limits

One run, sequentially from server/:

```text
node --import tsx ../artifacts/lab-04/hardening/prisma6193-release-remedy/run.mjs ../artifacts/lab-04/hardening/prisma6193-release-remedy-attempt-1-2026-11-02.json
```

Start **2026-11-02 02:42:59.110 Asia/Bangkok** (original JSON stores UTC). Temporary install exited 0, generate 0, TypeScript 0, proof child 1, outer runner 1. Exact expanded npm/generate/tsc/node commands and finite process limits are in the [README](prisma6193-release-remedy/README.md). Monotonic phases: live guard 194.171ms; sandbox preparation 24.757ms; install 11,105.943ms; generation 2,095.185ms; type 1,755.768ms; owned schema/migrations 588.863ms; all component/real/lifecycle/retention/acquisition gates **10,421.108ms**. No setup/type failure or test correction preceded this actual run.

`node --check artifacts/lab-04/hardening/prisma6193-release-remedy/run.mjs` passed before execution and again after the cleanup-prefix-only refinement. No application TypeScript/build, affected regression or full suite is implied by the temporary proof's type check. The failed budget gate was not rerun. Only the authorized 6.19.3 candidate was evaluated; the native control is the unchanged installed baseline.

Complete URL/SSL/raw-result compatibility, live authorized Action CREATE/EDIT RED, candidate production GREEN, fresh auth/token/eligibility retries, max-three exhaustion, full T-42/T-51/T-52 and affected/full-server/build checks remain **unreached**. They are not waived or counted as passing. No public release success alone authorizes production adoption while another essential gate fails. The original T-47 workload and all failed samples remain untouched; no measured latency improvement or performance GREEN.

## Cleanup and next action

The repository guard/live dedicated target was verified before writes, operational identity distinct and no other test/proof job active. Only the collision-protected owned schema and immediately tracked sandbox resources were used. All callbacks, native/candidate held-connection attempts and real transactions drained before client/pool shutdown. Zero forced releases were needed; exact owned schema/directory/dependencies/generated clients were removed and scoped child settings ended. Independent guarded probes found **zero owned schemas, all broadly tagged remedy connections, default-schema actor pollution and idle transactions**. No owned process remained. The final runner broadens the inherited prefix check for future reproduction; the actual independent check already covered it.

**Concrete next action:** decide whether to authorize a bounded public client/adapter transaction-start coordination remedy for exactly 6.19.3, with a real held-pool deadline/late-acquisition cleanup RED, preserving maxWait 2s, timeout 5s and the distinct connect 5s/pool-wait 10s behavior. If the public interface cannot support that without private access or changed semantics, keep adoption blocked. No other version or client rotation is proposed or authorized. Only after all remaining gates pass may the previously authorized real Action RED→GREEN adoption resume.

All 530 original files stayed byte-identical during execution, including the existing observer, old failed proofs, production/schema/manifests/locks and every benchmark artifact; only the audit is later updated. Historical decisions/IDs/statuses/checkboxes remain unchanged. No PR, merge, Issue metadata, scenario/Product DoD promotion or release claim is made.

Final validation passed for ten UTF-8 files without BOM/replacement characters, 51 local links, consistent Markdown tables and the original valid JSON. Substantive executed-source/copy fingerprints match; the sole runner difference is the documented cleanup-prefix refinement. All 55 matrix IDs/dependencies/execution/status cells and checkbox lines match the starting audit. Complete/staged scope and whitespace checks passed; normal Git LF-to-CRLF warnings were retained. None of these checks changes the failed compatibility verdict.
