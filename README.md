# TokTickIT

TokTickIT is a full-stack IT service desk application started for CPE334 Lab 01 and extended with the Requester ticketing workflow in Lab 2.

## Technology Stack

* React, TypeScript, Vite, and Bootstrap
* Node.js, Express, and TypeScript
* Prisma ORM
* PostgreSQL
* Vitest and Supertest

## Prerequisites

Install the following software before running the project:

* Node.js and npm
* PostgreSQL
* Git

## Database Setup

1. Create a PostgreSQL database named `toktickit`.
2. Open the `server` directory.
3. Copy `.env.example` to `.env`.
4. Update `DATABASE_URL` in `.env` with your local PostgreSQL username and password.

Example:

```env
DATABASE_URL="postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/toktickit?schema=public"
PORT=3000
```
### Initialize the Database

After configuring `.env`, run the migration and seed commands:

```bash
cd server
npx prisma migrate dev --name init
npm run prisma:seed
```
The migration creates the required database tables. The seed command adds the four initial IT request categories and can be run repeatedly without creating duplicates.

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

## Lab 2 Verification and Operations

Before running Lab 2 tests or the application, configure `server/.env` with a local PostgreSQL `DATABASE_URL`, apply the repository migrations, and load the required reference data:

```bash
cd server
npm run prisma:migrate
npm run prisma:seed
```

Run the complete Lab 2 browser workflow from the repository root:

```bash
npm run test:e2e
```

The E2E harness sets `NODE_ENV=test` only for the API server it starts and uses the existing in-memory Attachment storage adapter. This does not change normal production behavior: outside the test environment, Attachment storage continues to use the configured SeaweedFS S3-compatible endpoint and bucket. A live SeaweedFS service is therefore needed to exercise Attachment storage in normal application execution.

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
