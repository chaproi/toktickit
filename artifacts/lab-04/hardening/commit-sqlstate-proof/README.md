# Reproduce the bounded Prisma 5.22 COMMIT proof

This standalone diagnostic is excluded from normal test discovery. It changes no application dependency, generated application client, schema/migration or retry executor. It is not an HTTP/authentication regression, application GREEN or a replacement performance benchmark. Read [the prospective scope](plan.md) first.

Prerequisites: the repository's locked server dependencies/client are already installed at Prisma/CLI 5.22.0; Node can run its installed tsx loader; the existing dedicated PostgreSQL test target and operational identity are configured for the repository guard; npm can download the exact temporary packages. The exercised environment was Windows, Node 24.14.0 and PostgreSQL 18.6.

From server/, choose a **new** result filename under artifacts/lab-04/hardening/:

```powershell
node --import tsx ../artifacts/lab-04/hardening/commit-sqlstate-proof/run.mjs ../artifacts/lab-04/hardening/commit-sqlstate-feasibility-my-new-attempt.json
```

The runner refuses to overwrite an existing result. It checks live identity and exclusive non-idle use before fixture writes. A uniquely owned directory under the ignored server/node_modules/.cache/ holds its own package/lock, dependencies and generated client. Nothing downloaded/generated is committed.

The runner sequentially executes these commands, with owned absolute paths substituted internally (connection values are supplied only through scoped child environments):

```text
node <Node-install>/node_modules/npm/bin/npm-cli.js install --ignore-scripts --no-audit --no-fund --save-exact @prisma/client@5.22.0 @prisma/adapter-pg@5.22.0 @prisma/driver-adapter-utils@5.22.0 pg@8.23.0 typescript@5.7.2 tsx@4.19.2 @types/node@22.10.2 @types/pg@8.23.1
node <server>/node_modules/prisma/build/index.js generate --schema <owned-temp>/schema.prisma
node <owned-temp>/node_modules/typescript/bin/tsc --project <owned-temp>/tsconfig.json
node <owned-temp>/node_modules/tsx/dist/cli.mjs <owned-temp>/proof.ts
```

Installation has a finite 120-second process budget; other child commands have 60 seconds. Both in-transaction coordination waits have a two-second diagnostic deadline, below the unchanged Prisma five-second default. There are no transaction retries or application/test timeout changes. The proof-only pg pool permits four connections; it is not a proposal to change the application's pool.

The temporary schema is a copy of the complete application model with only the temporary generator's output and driverAdapters preview setting changed. Byte-identical copies of eligibility-transaction.ts, prisma.ts and test-database.ts resolve one temporary generated @prisma/client, matching a deployment's single-client layout. Their source digests and exact direct package versions are recorded. The first retained attempt demonstrates why mixing two independently generated type families was an invalid proof setup; no callback compatibility cast is used in the corrected proof.

Six unchanged committed migrations create one owned disposable schema. Each pair creates fresh users/reference rows. The users are synthetic actor-lock fixtures with no HTTP sessions; full authentication/eligibility retry behavior is outside this proof. Two real SERIALIZABLE callbacks lock different actors with the inherited helper, read both Category rows, update different rows and stage separate RelatedSystem inserts. Both finish their writes before either callback is allowed to return. Winner COMMIT is awaited before loser release, producing a real SSI COMMIT failure rather than a raised/fabricated SQL fault. Pairs reverse the winning order.

The public adapter composition observes transaction-local backend/transaction identity and command results. On an actual failed COMMIT only, the experimental preserving variant throws an Error whose cause is the real Postgres Result error. It never parses error text or accesses/modifies engine internals. The official binder's per-error ID machinery transports that exact object. A control retains the official adapter result unchanged. Independent native reads assert loser rollback and winner persistence. The test checks both same-connection ORM/raw operations and typed application-helper compatibility.

Every path drains the two promises before disconnecting. It ends the owned pool/observer, drops only the exactly owned schema, verifies zero tagged connections and removes only its marker-verified owned temporary directory. Forced release is cleanup for an unexpected leak and is recorded; the passing execution needed none. Stage timings, exit codes, classifications and state booleans are retained in redacted JSON. Raw child output is private diagnostic material, not a published credential/SQL log.

Direct dependencies are exact-version pinned. The temporary resolution lock digest is recorded, but the disposable lock and downloaded transitive packages are not published; a future registry resolution can differ transitively. A production decision must assess preview API stability, connection/pool/URL configuration and error-registry lifecycle. Do not copy this diagnostic adapter into production without separately authorized tests-first integration.
