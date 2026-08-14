# TokTickIT

TokTickIT is a full-stack IT service desk application created for CPE334 Lab 01.

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

## Security

The `.env` file and `node_modules` directories must never be committed to Git.
