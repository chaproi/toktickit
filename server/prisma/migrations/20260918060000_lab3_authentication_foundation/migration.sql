BEGIN;

-- The migration runner validates plaintext policy, exact key coverage, and
-- duplicate values before invoking Prisma. It passes only independently
-- salted encoded Argon2id hashes through a connection-local PostgreSQL setting.
DO $$
DECLARE
    credential_hashes JSONB;
    unsupported_statuses TEXT[];
    missing_ids TEXT[];
    unexpected_keys TEXT[];
BEGIN
    credential_hashes := COALESCE(
        NULLIF(current_setting('toktickit.lab3_credential_hashes', true), ''),
        '{}'
    )::JSONB;

    IF jsonb_typeof(credential_hashes) <> 'object' THEN
        RAISE EXCEPTION 'LAB3 migration credential hashes must be an object';
    END IF;

    SELECT array_agg(DISTINCT "currentStatus"::TEXT ORDER BY "currentStatus"::TEXT)
    INTO unsupported_statuses
    FROM "Ticket"
    WHERE "currentStatus"::TEXT NOT IN (
        'NEW', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_REQUESTER',
        'RESOLVED', 'CLOSED', 'CANCELLED'
    );

    IF unsupported_statuses IS NOT NULL THEN
        RAISE EXCEPTION 'Unsupported legacy Ticket status values: %', unsupported_statuses;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "DevelopmentRequester" requester
        LEFT JOIN "Ticket" ticket ON ticket."requesterId" = requester."id"
        RIGHT JOIN "Ticket" orphan ON orphan."id" = ticket."id"
        WHERE requester."id" IS NULL
    ) OR EXISTS (
        SELECT 1
        FROM "Attachment" attachment
        LEFT JOIN "Ticket" ticket ON ticket."id" = attachment."ticketId"
        LEFT JOIN "DevelopmentRequester" uploader
          ON uploader."id" = attachment."uploadedByRequesterId"
        LEFT JOIN "DevelopmentRequester" remover
          ON remover."id" = attachment."removedByRequesterId"
        WHERE ticket."id" IS NULL
           OR uploader."id" IS NULL
           OR (attachment."removedByRequesterId" IS NOT NULL AND remover."id" IS NULL)
    ) THEN
        RAISE EXCEPTION 'Legacy Ticket or Attachment references are invalid';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "DevelopmentRequester"
        GROUP BY lower(trim("email"))
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Normalized legacy User emails are not unique';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "DevelopmentRequester"
        WHERE char_length(trim("name")) NOT BETWEEN 2 AND 120
           OR char_length(lower(trim("email"))) > 254
           OR lower(trim("email")) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ) THEN
        RAISE EXCEPTION 'Legacy User name or email data is invalid';
    END IF;

    SELECT array_agg(requester."id"::TEXT ORDER BY requester."id")
    INTO missing_ids
    FROM "DevelopmentRequester" requester
    WHERE NOT credential_hashes ? requester."id"::TEXT;

    IF missing_ids IS NOT NULL THEN
        RAISE EXCEPTION 'Missing migration credential hash ids: %', missing_ids;
    END IF;

    SELECT array_agg(key ORDER BY key)
    INTO unexpected_keys
    FROM jsonb_object_keys(credential_hashes) AS key
    WHERE key !~ '^[1-9][0-9]*$'
       OR NOT EXISTS (
          SELECT 1 FROM "DevelopmentRequester"
          WHERE "id"::TEXT = key
       );

    IF unexpected_keys IS NOT NULL THEN
        RAISE EXCEPTION 'Unexpected migration credential hash ids: %', unexpected_keys;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_each_text(credential_hashes)
        WHERE left(value, 10) <> '$argon2id$'
    ) THEN
        RAISE EXCEPTION 'Migration credential hashes do not use the approved Argon2id configuration';
    END IF;

    IF (
        SELECT count(DISTINCT value)
        FROM jsonb_each_text(credential_hashes)
    ) <> (
        SELECT count(*)
        FROM "DevelopmentRequester"
    ) THEN
        RAISE EXCEPTION 'Migration credential hashes must be unique per User';
    END IF;
END $$;

CREATE TYPE "UserRole" AS ENUM ('REQUESTER', 'IT_STAFF', 'ADMINISTRATOR');

ALTER TYPE "TicketStatus" RENAME VALUE 'ASSIGNED' TO 'OPEN';
ALTER TYPE "TicketStatus" RENAME VALUE 'PENDING_REQUESTER' TO 'WAITING_FOR_REQUESTER';
ALTER TYPE "TicketStatus" ADD VALUE 'REOPENED' AFTER 'CLOSED';

ALTER TABLE "DevelopmentRequester" RENAME TO "User";
ALTER TABLE "User" RENAME CONSTRAINT "DevelopmentRequester_pkey" TO "User_pkey";
ALTER INDEX "DevelopmentRequester_email_key" RENAME TO "User_email_key";
ALTER INDEX "DevelopmentRequester_isActive_name_idx" RENAME TO "User_isActive_name_idx";

ALTER TABLE "User"
    ALTER COLUMN "email" TYPE VARCHAR(254),
    ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'REQUESTER',
    ADD COLUMN "passwordHash" VARCHAR(255),
    ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

UPDATE "User"
SET "name" = trim("name"),
    "email" = lower(trim("email")),
    "passwordHash" = credential.value
FROM jsonb_each_text(
    current_setting('toktickit.lab3_credential_hashes', true)::JSONB
) AS credential(key, value)
WHERE "User"."id"::TEXT = credential.key;

ALTER TABLE "User"
    ALTER COLUMN "passwordHash" SET NOT NULL,
    ADD CONSTRAINT "User_name_length_check"
      CHECK (char_length("name") BETWEEN 2 AND 120),
    ADD CONSTRAINT "User_email_normalized_check"
      CHECK ("email" = lower(trim("email")) AND char_length("email") <= 254);

DROP INDEX "User_isActive_name_idx";
CREATE INDEX "User_role_isActive_name_idx" ON "User"("role", "isActive", "name");

ALTER TABLE "Attachment"
    RENAME COLUMN "uploadedByRequesterId" TO "uploadedByUserId";
ALTER TABLE "Attachment"
    RENAME COLUMN "removedByRequesterId" TO "removedByUserId";
ALTER TABLE "Attachment"
    RENAME CONSTRAINT "Attachment_uploadedByRequesterId_fkey"
    TO "Attachment_uploadedByUserId_fkey";
ALTER TABLE "Attachment"
    RENAME CONSTRAINT "Attachment_removedByRequesterId_fkey"
    TO "Attachment_removedByUserId_fkey";

ALTER TABLE "Ticket"
    ADD COLUMN "ownerId" INTEGER,
    ADD COLUMN "itPriority" "RequestedPriority",
    ADD COLUMN "requesterResolutionIndicatedAt" TIMESTAMP(3),
    ADD COLUMN "requesterResolutionIndicatedById" INTEGER;

UPDATE "Ticket"
SET "ownerId" = NULL,
    "itPriority" = "requestedPriority";

ALTER TABLE "Ticket"
    ALTER COLUMN "itPriority" SET NOT NULL,
    ADD CONSTRAINT "Ticket_resolution_indication_pair_check"
      CHECK (
        ("requesterResolutionIndicatedAt" IS NULL AND "requesterResolutionIndicatedById" IS NULL)
        OR
        ("requesterResolutionIndicatedAt" IS NOT NULL AND "requesterResolutionIndicatedById" IS NOT NULL)
      );

CREATE TABLE "AuthSession" (
    "id" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "csrfTokenHash" CHAR(64) NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AuthSession_token_hash_check" CHECK ("tokenHash" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "AuthSession_csrf_hash_check" CHECK ("csrfTokenHash" ~ '^[a-f0-9]{64}$')
);

CREATE TABLE "LoginThrottle" (
    "keyHash" CHAR(64) NOT NULL,
    "failureCount" INTEGER NOT NULL,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "blockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginThrottle_pkey" PRIMARY KEY ("keyHash"),
    CONSTRAINT "LoginThrottle_key_hash_check" CHECK ("keyHash" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "LoginThrottle_failure_count_check" CHECK ("failureCount" >= 0)
);

CREATE TABLE "PublicComment" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PublicComment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PublicComment_content_length_check"
      CHECK (char_length("content") BETWEEN 1 AND 2000)
);

CREATE TABLE "InternalNote" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InternalNote_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InternalNote_content_length_check"
      CHECK (char_length("content") BETWEEN 1 AND 5000)
);

CREATE TABLE "TicketStatusHistory" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "actorId" INTEGER NOT NULL,
    "fromStatus" "TicketStatus" NOT NULL,
    "toStatus" "TicketStatus" NOT NULL,
    "reason" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketStatusHistory_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TicketStatusHistory_reason_length_check"
      CHECK ("reason" IS NULL OR char_length("reason") BETWEEN 5 AND 500)
);

CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
CREATE INDEX "Ticket_updatedAt_id_idx" ON "Ticket"("updatedAt", "id");
CREATE INDEX "Ticket_ownerId_updatedAt_idx" ON "Ticket"("ownerId", "updatedAt");
CREATE INDEX "Ticket_currentStatus_updatedAt_idx" ON "Ticket"("currentStatus", "updatedAt");
CREATE INDEX "Ticket_itPriority_updatedAt_idx" ON "Ticket"("itPriority", "updatedAt");
CREATE INDEX "PublicComment_ticketId_createdAt_id_idx" ON "PublicComment"("ticketId", "createdAt", "id");
CREATE INDEX "InternalNote_ticketId_createdAt_id_idx" ON "InternalNote"("ticketId", "createdAt", "id");
CREATE INDEX "TicketStatusHistory_ticketId_createdAt_id_idx" ON "TicketStatusHistory"("ticketId", "createdAt", "id");

ALTER TABLE "AuthSession"
  ADD CONSTRAINT "AuthSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Ticket"
  ADD CONSTRAINT "Ticket_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Ticket"
  ADD CONSTRAINT "Ticket_requesterResolutionIndicatedById_fkey"
  FOREIGN KEY ("requesterResolutionIndicatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublicComment"
  ADD CONSTRAINT "PublicComment_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublicComment"
  ADD CONSTRAINT "PublicComment_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InternalNote"
  ADD CONSTRAINT "InternalNote_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InternalNote"
  ADD CONSTRAINT "InternalNote_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TicketStatusHistory"
  ADD CONSTRAINT "TicketStatusHistory_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TicketStatusHistory"
  ADD CONSTRAINT "TicketStatusHistory_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "User" WHERE "passwordHash" IS NULL) THEN
        RAISE EXCEPTION 'Postflight found a User without a password hash';
    END IF;
    IF EXISTS (SELECT 1 FROM "Ticket" WHERE "ownerId" IS NOT NULL) THEN
        RAISE EXCEPTION 'Postflight found a fabricated migrated Ticket owner';
    END IF;
    IF EXISTS (SELECT 1 FROM "Ticket" WHERE "itPriority" <> "requestedPriority") THEN
        RAISE EXCEPTION 'Postflight IT Priority backfill mismatch';
    END IF;
    IF EXISTS (
        SELECT 1 FROM "Attachment"
        WHERE "uploadedByUserId" IS NULL
           OR ("isRemoved" AND "removedByUserId" IS NULL)
    ) THEN
        RAISE EXCEPTION 'Postflight Attachment User reference mismatch';
    END IF;
    IF EXISTS (SELECT 1 FROM "TicketStatusHistory") THEN
        RAISE EXCEPTION 'Migration must not fabricate Ticket status history';
    END IF;
END $$;

COMMIT;
