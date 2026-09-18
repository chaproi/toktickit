# TokTickIT

TokTickIT is a full-stack IT service desk application started for CPE334 Lab 01 and extended with the Requester ticketing workflow in Lab 2.

## Technology Stack

* React, TypeScript, Vite, and Bootstrap
* Node.js, Express, and TypeScript
* Prisma ORM with PostgreSQL-backed authentication sessions
* Argon2id password hashing
* PostgreSQL
* Vitest and Supertest

## Prerequisites

Install the following software before running the project:

* Node.js and npm
* PostgreSQL
* Git

## Database Setup

1. Create separate PostgreSQL databases named `toktickit` and `toktickit_test`.
2. Open the `server` directory.
3. Copy `.env.example` to `.env`.
4. Update `DATABASE_URL` and `TEST_DATABASE_URL` in `.env` with your local PostgreSQL username and password.

Example:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/toktickit?schema=public"
TEST_DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/toktickit_test?schema=public"
PORT=3000
```

`TEST_DATABASE_URL` must target a dedicated database whose name contains `test`. It must never identify the same normalized host, port, database, and schema as `DATABASE_URL`, and it must not point to a development or production database. Database integration and E2E tests fail before Prisma access when this isolation check is missing or unsafe.

### Initialize or Upgrade the Database

For a fresh Lab 1/Lab 2 database, first apply the existing pre-Lab-3 migrations as documented for those increments. To upgrade a populated Lab 2 database, configure these additional runtime-only values in the untracked `server/.env`:

```env
AUTH_ALLOWED_ORIGINS="http://localhost:5173"
LOGIN_THROTTLE_HMAC_SECRET="<RUNTIME_RANDOM_SECRET>"
LAB3_MIGRATION_INITIAL_CREDENTIALS='{"<USER_ID>":"<UNIQUE_RUNTIME_INITIAL_PASSWORD>"}'
LAB3_SEED_INITIAL_CREDENTIALS='{"<SEEDED_USER_EMAIL>":"<UNIQUE_RUNTIME_INITIAL_PASSWORD>"}'
```

The migration mapping must contain every existing Development Requester numeric ID and no other keys. The seed mapping must contain every deterministic seeded User email. Every value must be unique and satisfy the 12–128 character, three-category password policy. These complete mappings and their values must never be committed, printed, or shared in logs.

Run the guarded Lab 3 migration and then the idempotent seed:

```bash
cd server
npm run prisma:migrate:lab3
npm run prisma:seed
```

The guarded migration validates the entire credential mapping and legacy data before mutation, runs transactionally, verifies preserved counts/checksums and relationships, then records the migration with Prisma. The seed preserves existing password hashes and can be repeated without duplicating Users, Tickets, Comments, or Notes.

If migration fails before commit, confirm the database still has the Lab 2 schema and data before using `prisma migrate resolve --rolled-back 20260918060000_lab3_authentication_foundation`. Correct the runtime mapping or data problem and rerun the guarded command. Do not reset a populated database and do not mark the migration applied unless postflight verification actually succeeded.

Normal server integration setup validates `TEST_DATABASE_URL` and requires the two runtime credential mappings before upgrading a populated shared test schema. Issue #27 verification uses a disposable `issue27_*` schema in the dedicated test database, injects unique synthetic credentials in memory, and drops only that schema afterward. Neither path rewrites `server/.env` or migrates the development target.

Do not commit the `.env` file because it contains private credentials.

## Install Dependencies

### Client

```bash
cd client
npm install
```

### Server

```bash
cd server
npm install
```

### Lab 2 End-to-End Tooling

Install the root Playwright development dependency and its Chromium browser from the repository root:

```bash
npm install
npx playwright install chromium
```

## Run the Application

Start the server:

```bash
cd server
npm run dev
```

Start the client in another terminal:

```bash
cd client
npm run dev
```

The client runs at `http://localhost:5173` and the server runs at `http://localhost:3000`.

## Run Tests

Client tests:

```bash
cd client
npm test
```

Server tests:

```bash
cd server
npm test
```

Issue #27 isolated migration/authentication regression suite:

```bash
cd server
npm run test:issue27
```

## Lab 2 Verification and Operations

Before running the retained Lab 2 workflows on this branch, configure `server/.env` with both database URLs and the Lab 3 runtime-only values described above. Upgrade a populated application database only through the guarded Lab 3 command:

```bash
cd server
npm run prisma:migrate:lab3
npm run prisma:seed
```

Do not run a direct Prisma migration command for this populated Lab 2-to-Lab 3 upgrade; direct Prisma execution cannot inject or preflight the per-User credential mapping.

Run the complete Lab 2 browser workflow from the repository root:

```bash
npm run test:e2e
```

The server test and E2E harnesses fail fast unless the dedicated test target passes the central isolation guard. The E2E harness sets `NODE_ENV=test` only for the API server it starts and uses the existing in-memory Attachment storage adapter. This does not change normal production behavior: outside the test environment, database access continues to use `DATABASE_URL`, and Attachment storage continues to use the configured SeaweedFS S3-compatible endpoint and bucket. A live SeaweedFS service is therefore needed to exercise Attachment storage in normal application execution.

Run all client and server tests and production builds in their package directories:

```bash
cd client
npm test
npm run build
```

```bash
cd server
npm test
npm run build
```

After the server build succeeds, start the compiled API using its corrected package script:

```bash
cd server
npm start
```

Passing E2E runs retain review screenshots under `artifacts/lab-02/screenshots/`.

## Security

The `.env` file and `node_modules` directories must never be committed to Git.
