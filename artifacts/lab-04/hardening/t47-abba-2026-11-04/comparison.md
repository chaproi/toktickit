# Finite T-47 A-B-B-A comparison - 4 November 2026

This prospective experiment compares A `169811dfde4a22f0ff7a9acf8e45f755e062597b` and B `84ef0ad91502a0c660998ddc13d0c7a163f1a169`, in exactly A-B-B-A order. The only production difference is the verified shared PATCH projection correction. The current candidate publication starts at23246c1. Existing branches, worktrees, uncommitted proposal, failed benchmarks and accepted candidate limitations are preserved.

[Predeclared machine-readable plan](plan.json) fixes four maximum unchanged executions, no replacements, 50 users / 5000 warm-up / 500 measured requests, original endpoint mix, pools, budgets, dependencies and strict aggregate/operation p95<500ms thresholds. Runs use two detached owned checkouts and identical ignored test settings/dependency installation. Existing benchmark observations are unchanged; no extra in-process diagnostic observer. Each request/sample/verdict is retained. Guarded independent cleanup is required between runs. Unsafe/incompatible conditions abort the sequence without substituting another execution.

Every run gets the same external one-second host/process CPU, available physical-memory and AC-line observations, plus before/after active power-scheme identity. Whole-command telemetry includes fixture setup and cleanup. These observations do not directly measure SQL execution, frequency, temperature, per-request CPU or a definitive environmental cause. No settings are changed. Two observations per version cannot establish broad confidence or production capacity. Actual results and limitations are appended after execution. D-12 remains proposed; no acceptance or Issue/DoD promotion.

Preparation observations: the first shell attempt to write the external runner failed PowerShell here-string parsing before execution; the runner was then written directly and parsed successfully. A read-only guard/version-probe validation initially hit ERR_PACKAGE_PATH_NOT_EXPORTED while reading adapter package metadata; it was corrected to read installed package manifests from the filesystem. No T-47 execution or business write occurred in either preparation mistake; native probe connections close in finally. The workload limit/order remains unconsumed and unchanged.

## Completed sequence and provenance

Prospective plan commit `4c73eba` precedes all four executions. All four workload invocations completed in the declared A-B-B-A order, without replacements, additional warm-up, HTTP retries, request exclusion, source/settings/dependency changes or an added in-process observer. Each runs from its detached checkout's server/:

```text
npm.cmd test -- tests/lab-04/performance-smoke.integration.test.ts
```

The inherited global setup and real authentication run normally. Sessions are provisioned outside measured traffic. Each disposable benchmark schema receives the unchanged indexed 2050-Ticket / 8000-Action / 24000-ActionHistory / 3800-Ticket-history fixture, 50 users and distinct targets, then 5000 warm-up followed by 500 measured requests. Actual concurrency peaks at 50, with sequential requests within each user. All 22000 samples remain, including slow responses.

| Run | Revision | UTC start - finish (3 November) | Bangkok local (4 November) | Workload exit | Files/cases collected/executed/passed/failed/skipped | Framework /outer seconds |
|---|---|---|---|---:|---|---|
|01-A|169811df|20:56:40-20:57:37|03:56:40-03:57:37|0|1file; 1/1/1/0/0|55.79s /56.938|
|02-B|84ef0ad9|20:58:48-20:59:44|03:58:48-03:59:44|0|1file; 1/1/1/0/0|55.30s /56.347|
|03-B|84ef0ad9|20:59:58-21:00:57|03:59:58-04:00:57|1|1file; 1/1/0/1/0|57.86s /58.977|
|04-A|169811df|21:01:08-21:02:19|04:01:08-04:02:19|1|1file; 1/1/0/1/0|69.54s /70.613|

The workload test verdicts are pass,pass,fail,fail. Each haszero skips. Run 1's *external runner* exits with a post-execution serialization error after the successful workload; that failure is distinct from its test exit0 and preserved in original execution.json. Its complete sample artifact is recovered without re-execution. No application run is attributed to this later evidence-publication HEAD.

## Matched checks and known telemetry gap

Across A/B, only `server/src/actions/action-patch-service.ts` differs in production. B additionally contains two new projection tests, which are not selected by this command. Benchmark/helper, package/lockfile, schema, Vitest configuration, connection/deadline/admission code and ignored fixture settings match; [exact hashes](plan.json) are recorded before execution. Both checkouts share the same installed/generated 6.19.3 dependency installation through owned junctions. No install/generation occurs between runs. Actual packages: Prisma CLI/client/adapter/driver-utils 6.19.3, pg 8.23.0, Vitest 2.1.9, TypeScript 5.9.3; Node 24.14, PostgreSQL 18.6. Native guard/live probes before/after each run independently verify the dedicated target differs from operational; identities/credentials are withheld.

Power is AC (GetSystemPowerStatus ACLineStatus 1); active profile is Acer (`98fb7a86-c837-41f4-930a-34fe7b6bb1a8`) before/after every run. Retained interval samples for runs 2/3/4 show only AC 1. Run 1's before/after observations also show AC 1 and matching profile, but its interval samples are unavailable. Profile is observed before/after, not continuously. No setting is changed. Actual pool mapping remains 17 connections (8 physical cores / 12 logical), connect 5 s / pool 10 s, maxWait 2 s / execution 5 s; the unchanged benchmark's historical textual pool metadata still says inherited default. PostgreSQL settings remain max_connections 100, shared_buffers 128 MB, work_mem 4 MB, effective_cache_size 4 GB, JIT on, track_io_timing off. Runtime is local Windows 10.0.26200 x64, Vite-transformed TypeScript Express, NODE_ENV=test, loopback HTTP without TLS, 34.049 GB physical RAM.

**Telemetry deviation:** run 1 used the same external one-second sampling mechanism as later runs, but PowerShell `@($samples)` generic-list conversion failed *after* the workload and before writing that array. Its before/after host CPU counters,power,profile,memory and full workload output were already retained. The interval array cannot be reconstructed. [Original failure](01-A/execution.json),[independent cleanup](01-A/independent-cleanup.json) and[post-execution recovery](01-A/post-execution-recovery.json) are immutable records. The post-execution serializer changes to `.ToArray()` and is validated without traffic; sampling mechanism/cadence and benchmark do not change. The continuation gate accepts separately proven cleanup/artifact/unchanged before-after conditions; no replacement A run occurs. Thus all four workloads complete, but the planned interval telemetry is incomplete. This reduces comparison confidence and must not be described as four fully observed matched host conditions.

The offline analyzer initially encountered null PostgreSQL process CPU fields; it was corrected to preserve them as unavailable, not zero. All three retained interval series have PostgreSQL CPU unavailable. Public node/powershell process CPU is retained, with unsampled exit CPU/population changes qualified. No query/application result is changed. Thermal, frequency, per-request scheduling and database-process CPU attribution are absent. Whole-command host CPU counters are available comparably for all four runs.

| Run | Available RAM before /after GB | Host busy CPU from before/after counters | Retained interval samples | Interval minimum available RAM GB | Process CPU |
|---|---|---:|---|---:|---|
|01-A|13.995 /14.425|28.597%|Unavailable|Unavailable|interval process CPU unavailable|
|02-B|14.430 /14.390|28.206%|52|13.731|node/powershell partial; PostgreSQL unavailable|
|03-B|14.393 /14.368|30.999%|53|13.647|node/powershell partial; PostgreSQL unavailable|
|04-A|14.400 /14.084|35.048%|61|13.445|node/powershell partial; PostgreSQL unavailable|

These are whole-command observations, including authentication/fixture setup and cleanup; not CPU specifically during warm-up, measurement or SQL. CPU rises in the later observations, but the workload itself contributes CPU and duration; the counters do not establish an environmental cause, throttling or saturation. No unobserved background activity or thermal explanation is invented. Competing repository node/test/build/seed/Seaweed workloads are absent before and after each run;that does not prove the whole host is idle.

## Workload distributions and verdicts

All error rates are 0% in both phases and every operation. Each phase's peak 50/final 0 is independently verified. Warm-up p95 is reported without inventing an extra acceptance threshold.

| Run | Warm-up p50 /p95 ms | Warm-up seconds /requests per second | Measured p50 /p95 ms | Measured seconds /requests per second | Measured operation p95 passes |
|---|---|---|---|---|---|
|01-A|235.446 /439.959|27.4895 /181.888|208.563 /390.214|2.4158 /206.973|18/18|
|02-B|228.073 /415.739|26.4404 /189.105|214.001 /401.518|2.3942 /208.838|18/18|
|03-B|237.990 /438.453|28.4178 /175.946|260.409 /441.080|2.8060 /178.188|17/18|
|04-A|313.541 /611.484|38.4714 /129.967|397.981 /963.614|4.8352 /103.409|8/18|

The full [independent analysis](analysis.json) retains aggregate and operation mean, min, p10, p25, p50, p75, p95, p99, max, counts and errors for both phases. [Reproducer](analyze.py) verifies all 22000 samples, per-user sequence/role/mix, nearest-rank calculations, concurrency, throughput and literal persistence independently; this is offline validation, without additional traffic or replacement of inline verdicts.

Measured operation p50 /p95,ms (all requests,including slow tails):

| Operation | A1 | B2 | B3 | A4 |
|---|---|---|---|---|
|action.cancel|300.370 /317.739|291.405 /331.824|300.326 /344.914|604.001 /909.050|
|action.complete|342.372 /407.872|332.851 /377.590|324.730 /404.435|734.311 /1072.287|
|action.create|285.950 /362.892|303.946 /388.861|475.039 /506.970|449.530 /645.609|
|action.detail|175.551 /219.392|155.827 /228.511|170.909 /217.754|317.182 /395.386|
|action.edit|316.965 /427.354|300.170 /418.559|296.044 /381.128|710.492 /864.719|
|action.history|108.174 /149.035|91.535 /161.077|103.056 /155.213|175.523 /326.231|
|action.start|388.744 /447.483|406.311 /450.508|401.040 /441.080|1133.498 /1258.657|
|comments.create|254.626 /309.637|266.282 /323.733|227.521 /299.993|802.978 /859.577|
|comments.list|204.812 /259.017|214.733 /242.236|260.409 /362.313|425.643 /737.614|
|requester.dashboard|147.231 /184.100|124.164 /208.669|130.745 /231.842|285.148 /497.054|
|requester.ticket.detail|171.325 /267.175|153.179 /289.178|185.851 /384.178|299.303 /433.446|
|requester.tickets.filtered-list|256.860 /283.949|272.259 /296.630|255.658 /283.235|503.755 /759.678|
|requester.tickets.list|222.628 /268.892|231.442 /284.466|278.587 /407.793|462.761 /611.850|
|staff.actions.list|193.507 /225.825|191.598 /226.921|322.618 /376.791|454.012 /514.823|
|staff.dashboard|196.525 /235.577|193.774 /247.715|202.218 /274.813|160.201 /268.684|
|staff.ticket.detail|137.252 /146.399|131.825 /142.521|160.106 /166.594|238.710 /249.545|
|staff.tickets.list|200.909 /245.568|179.569 /230.179|231.979 /313.037|378.396 /471.347|
|ticket.actions.list|156.597 /193.816|171.372 /198.156|292.155 /332.513|298.346 /404.405|

A1 and B2 pass all inline assertions, including aggregate and combined operation p95. B3 passes aggregate 441.080 ms but fails the executed combined operation assertion: CREATE 506.970 ms; the other 17 operation targets pass. A4 fails aggregate 963.614 ms; its following combined-operation assertion is unreached. Independently artifact-derived A4 results fail 10 operation targets: all five Action writes, comment creation/list, Requester filtered/plain lists and Staff Actions list. These calculations are distinct from executed inline assertions. No error or P2028 is retained in any transaction-failure array; historical unknown P2028 subtypes remain unclassified.

Each run independently passes exact persistence: 2050 Tickets, 8330 Actions, 25320 ActionHistory, 3800 TicketStatusHistory, 1320 receipts, 220 PublicComments, 50 Users/50 sessions, zero replay. This represents 330 new Actions, 1320 real Action mutations/history/receipt operations and 220 comments per run. These are four separate disposable schemas, not accumulated operational state. All cleanup flags are true; primaryFailure/cleanupFailure are null in every workload artifact.

## Interpretation and next action

The comparison does **not** demonstrate a consistent warmed performance improvement attributable to B. B aggregate p95 is 401.518/441.080 ms versus A 390.214/963.614 ms. Within A the range is 573.400 ms, ratio 2.469; within B the range is 39.563 ms, ratio 1.099. A1 passes before the correction. B's second run fails only the unchanged CREATE path. START p95 is 447.483/450.508/441.080/1258.657 ms across ABBA: B2 is slightly slower than A1, B3 slightly faster. EDIT, COMPLETE and other paths also differ by run, so the verified four-to-one projection query reduction cannot be converted into a universal latency claim.

Substantial run/time variability is established descriptively, especially between the two A observations and across unchanged CREATE/read/comment paths. Four observations and partial host telemetry cannot separate all period/order/cache/scheduling effects, prove the environment caused the variation, or provide broad statistical confidence. Both B results and every failed verdict remain. Historical failures are preserved alongside A1/B2 passes. T-47 is not accepted from this experiment.

Recommended next action: retain B as a correctness-verified query-reduction candidate, hold further production tuning, and establish a repeatable performance environment and observation protocol before using another latency result to justify code changes. Specifically, obtain reliable continuous power/clock/thermal and host-activity visibility, or document their absence, and predeclare a finite warmed control to assess repeatability. Do not assume a START-only defect or automatically repeat T-47. This batch adds no further execution, production correction, index, pool, budget, retry, dependency, queue or cache change.

## Artifacts, cleanup and status

- 01-A: [5500 raw samples](01-A/t47-performance-2026-11-04-measurement-a6f88a26.json), [execution](01-A/execution.json), [stdout](01-A/stdout.txt), [stderr](01-A/stderr.txt), [post-execution recovery and missing-telemetry qualification](01-A/post-execution-recovery.json)
- 02-B: [5500 raw samples](02-B/t47-performance-2026-11-04-measurement-73c82e0e.json), [execution](02-B/execution.json), [stdout](02-B/stdout.txt), [stderr](02-B/stderr.txt), [external samples](02-B/external-samples.json)
- 03-B: [5500 raw samples](03-B/t47-performance-2026-11-04-measurement-85b02ca4.json), [execution](03-B/execution.json), [stdout](03-B/stdout.txt), [stderr](03-B/stderr.txt), [external samples](03-B/external-samples.json)
- 04-A: [5500 raw samples](04-A/t47-performance-2026-11-04-measurement-6ed7bb21.json), [execution](04-A/execution.json), [stdout](04-A/stdout.txt), [stderr](04-A/stderr.txt), [external samples](04-A/external-samples.json)

[Environment baseline](condition-baseline.json), [external-clock interpretation](external-clock.json), [guard probe source](guard-probe.mjs), [exact external runner](run-comparison.ps1), [owned checkout cleanup](cleanup.json), [final native database cleanup](final-database-cleanup.json). Output streams retain expected seed-preservation and Prisma/pg warnings. No full server/client/E2E/build suite runs. No unhandled-error summary, credentials, connection strings or private contents are published.

Every run's cleanup is independently checked before the next. After run 4, all four raw artifacts are checksum-verified against the owned source copies before removal. Only the two owned detached checkouts, their ignored .env copies and junction links are removed; shared dependencies and original worktrees remain. The final native probe at 2026-11-03T21:05:43.966Z finds zero owned schemas, sessions, fixture Users, other connections, idle transactions, advisory locks and fault objects; owned repository processes are also zero. The scoped validation-only setting restores its prior absent state. The original 535a2e5 branch and uncommitted proposal remain intact. No existing historical artifact or production file changes.

D-12 remains proposed; accepted Lab-only metadata retention and untriaged dependency limitations remain. No merge, deployment, peer acceptance, Issue/scenario/Product DoD promotion or comprehensive-suite rerun occurs. Publication changes only comparison evidence and an audit link.

Publication checks: all four artifacts independently reproduce 22000 samples and literal persistence totals. UTF-8, JSON parsing, 157 local links, 10 Markdown tables, sensitive-content scans, source/configuration/test preservation and whitespace checks pass. The only harness correction changes post-execution serialization and the explicit recovery gate; its original failure remains. No fifth workload or additional application check is executed.

Published command-output text normalizes only trailing blank lines to satisfy repository whitespace checks. Original captured output bytes remain in the private execution archive and their SHA-256 values are recorded in the manifest. Workload sample artifacts, verdicts, error text and historical records are unchanged.
