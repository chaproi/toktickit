# Prospective bounded write admission candidate - 2026-11-03

Starting local/upstream/live revision: fd651079d79b5fbfe18b33f96c5d4a75a3f4bfb4, feat/49-final-hardening, clean index/tree. Existing guard and live dedicated target must pass before writes. No AGENTS.md found. The student's new selection permits database-scoped serialization of affected commands only, superseding the prior global-gate prohibition prospectively. Every old failed result and the accepted Lab-only waiting-metadata retention remain unchanged.

## Tradeoff and concrete public-interface candidate

One database/schema advisory admission lane serializes the selected domain writers. This trades write parallelism for avoiding the demonstrated Ticket and receipt physical predicate sharing. It does not promise the unchanged T-47 p95/zero-error target will pass. Do not lower concurrency, enlarge budgets, change isolation, add attempts, relax replay precedence or count successful diagnostics as performance evidence.

Use the pinned6.19.3 official factory's declared public underlyingDriver() and pg.Pool.connect/PoolClient.query/release methods. Wrap that pool's public checkout for one transaction-local context. Acquire the schema-scoped session advisory lock on the SAME checked-out physical connection before forwarding it to official startTransaction/BEGIN. Namespace is a fixed signed32 application constant plus the live schema OID signed32, scoped by PostgreSQL database identity; no process-local mutex or cross-schema hash collision. An AsyncLocalStorage context supplies the already-owned client exactly once to the official public startTransaction. Other reads/checkouts delegate normally. No external pool ownership change, private engine hooks, client rotation or version change.

The existing public transaction boundary captures effective per-call/constructor/default maxWait and execution timeout. Its existing startup clock begins once at adapter startTransaction and includes pool checkout, admission wait and BEGIN/isolation setup. Compute REMAINING time for advisory acquisition; never start a second full allowance. Retain distinct connect5s/pool10s/start2s/execution5s defaults and overrides. A transaction-local/public session statement_timeout around admission is restored BEFORE BEGIN. Startup expiry invalidates any owned startup connection using public release(true), never runs a late business callback and drains late checkout/query results. A pool checkout not yet owned may finish within its existing separate pool budget; it must be immediately disposed after a caller deadline, not enter business.

Defer the driver's release request until its public transaction promise AND any entered callback are drained. Then defensively roll back any open transaction, unlock admission, and invoke the saved physical release once. Hold ownership through normal COMMIT, rollback, failed COMMIT and execution-timeout callback draining. Disconnect first drains attempts and owned late work, then the existing factory closes its pool; reconnect gets the factory's fresh lazy pool. No per-request pool closure. HTTP disconnect does not invent cancellation/retry semantics: existing server commands drain; startup deadline cancellation happens before business entry.

Connection loss is fail-closed: that SAME backend losing its session aborts its transaction and releases its advisory lock; it cannot continue database writes. Observe public error/end and never report success if ownership was lost. Drain the failed operation before resolving its caller. Preserve original primary errors and report secondary cleanup only by safe stage. No cleanup error becomes retryable40001. The prototype must test this rather than assume it.

## Explicit cooperating writer inventory

| Selected writer | Current seam and reason | Preserved policy |
| --- | --- | --- |
| Requester Ticket create | tickets/ticket-service.ts createTicketForRequester; writes Ticket and numbering/positive replay state | SERIALIZABLE, current User/year gates and replay |
| Staff Ticket claim/owner/priority/status | tickets/staff-ticket-service.ts four runSerializableMutation callers; writes Ticket, status history and cancellation cascade | Current User/Ticket/Action order, tokens, gates, D-20 |
| Requester resolution indication | tickets/resolution-indication-service.ts; writes Ticket advisory fields | Existing role/owner/state guards |
| Action create/edit/reassign/lifecycle | actions/action-create-service.ts and action-patch-service.ts | SERIALIZABLE, fresh auth/eligibility, receipt-before-stale/frozen, max3, separate defensive recovery |
| Administrator User create/edit/reset | users/admin-user-service.ts three shared-executor callers; writes User/AuthSession, reads Ticket/Action eligibility | Existing authorization, User ordering, last-Admin and ownership/open-assignment guards |
| Password change | auth/auth-router.ts existing interactive transaction; writes User and revokes/replaces sessions | Preserve original transaction isolation and password/token guards, no new retry |
| Registered seed mutation | prisma/seed.ts seedDatabase write transaction touches User/Ticket/Action | Preserve READ COMMITTED/15s seed execution budget; admission shares existing startup allowance |

Admission selection must be explicit at these seams, not every Prisma transaction or delegate. Comments/Notes and attachment add/remove write their own relations without updating Ticket/Action/User (source inspected); retain their existing User/Ticket gates and SERIALIZABLE behavior, outside this candidate's domain admission lane. Routine login/session creation, refresh, logout/expiry and throttle bookkeeping remain outside; existing session SHARE locking and fresh post-wait authorization stay essential. All Dashboard/list/detail/history/read-only snapshots and receipt recovery READ COMMITTED reads stay outside. Migrations/direct operational SQL require existing maintenance quiescence; test-only native participants may intentionally not cooperate to prove real SSI failure. Do not silently claim every external writer participates.

## Completion gates before adoption

1. Real public-pool proof: same database/schema processes serialize before first business snapshot; other schema/read operations remain independent.
2. Default and explicit startup budgets include admission wait, reject while holder remains, no callback-after-timeout, late checkout/acquisition/rejection drains, no double release/checkouts/idle transactions.
3. Hold admission through callback/query failure, successful commit and execution-timeout callback draining; primary error retained if cleanup also fails; ownership loss cannot return success.
4. Lazy/connect/disconnect/reconnect and concurrent deadlines/shutdown use supported APIs and unchanged settings. No retention exploration or adapter version evaluation.
5. After gates pass: adapt only coordination in old simultaneous-business-callback tests to overlapping HTTP/admission waiting. Preserve endpoint/domain assertions and old RED artifacts. Real COMMIT40001 uses an independent controlled PostgreSQL participant, not two cooperating admitted callbacks or synthetic faults.
6. All8 API commands succeed with exact state, plus T-42/T-51/T-52/auth/workflow checks. Run comprehensive server excluding only unchanged T-47, then build. Only after GREEN run that exact workload once alone and publish success/failure.

This is prospective design, not an executed gate, application GREEN, performance claim, peer/release approval or scenario/DoD update. Proof failures stop adoption with their concrete public-interface blocker. Exact attempts/source/cleanup and later decisions belong in a dated execution ledger.
