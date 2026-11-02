# Lab4 Prisma6.19.3 candidate adoption ledger - 2026-11-02

## Prospective student decision and execution plan

Starting verified local/origin/upstream HEAD:cc137b47a033feeb956903527a989f3afae14fbf, feat/49-final-hardening, clean tree/index. No applicable AGENTS.md found.

Student decision,2026-11-02: accept failed-start transaction bookkeeping retention as a known limitation **only for the Lab4 candidate**. Failed-start records may accumulate until disconnect; no public per-record cleanup or memory-growth bound has been established. This accepts neither a fix nor production deployment or peer approval. The exact [real late-rejection observation](prisma6193-start-deadline-retention-2026-11-02.json) and [source/diagnostic limits](prisma6193-start-deadline-2026-11-02.md#essential-remaining-gate-waiting-start-bookkeeping) remain unchanged. No further retention exploration will be run.

Only that stop condition is removed. Preserve database resources, deadlines/no-late-callback behavior, authorization, receipt integrity, positive40001-only retry (maximum three fresh attempts), safe errors and the failed T-47 target. Reuse public release/deadline/configuration proof, without another version, private patch, rotation or timeout increase.

Prospective sequence: real authenticated independent CREATE/EDIT coordinated genuine COMMIT serialization regressions against unchanged5.22; commit semantic RED; pin matching6.19.3 and public compositions at the lazy guarded client seam; minimally correct demonstrated construction/type/public-observer incompatibilities without weakening business assertions; focused checks, affected mutation/concurrency/authentication/attachment/read-snapshot regressions, server build, then comprehensive server regression **excluding only tests/lab-04/performance-smoke.integration.test.ts**. Inspect actual discovery and report this as filtered comprehensive regression, never an unfiltered suite/benchmark pass. No T-47 workload/sample modification or rerun. All executions are sequential, with actual attempts and source state appended below.

The new SSI coordinator will use two otherwise independent real authorized HTTP commands and two owned read/write dependency rows. Both complete their actual domain bodies before controlled commit order; one genuine PostgreSQL COMMIT abort must roll back before its fresh retry. This is a coordinated real database failure, not the original50-user workload, fabricated SQLSTATE, or an uncontrolled production race.
