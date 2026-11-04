-- Additive D-16 foundation only: no domain/fixture writes or historical changes.
BEGIN;

CREATE TYPE "ActionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ActionHistoryEvent" AS ENUM (
    'ACTION_CREATED', 'ACTION_EDITED', 'ACTION_REASSIGNED', 'ACTION_STARTED',
    'ACTION_COMPLETED', 'ACTION_CANCELLED', 'ACTION_CANCELLED_BY_TICKET'
);

CREATE TABLE "Action" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "assigneeId" INTEGER NOT NULL,
    "performedById" INTEGER,
    "description" TEXT NOT NULL,
    "result" TEXT,
    "status" "ActionStatus" NOT NULL DEFAULT 'PLANNED',
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "followUpNote" TEXT,
    "attachmentNotes" TEXT,
    -- Transaction-stable UTC defaults agree for all three initial timestamps.
    "actionAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "Action_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Action_version_positive_check" CHECK ("version" > 0),
    CONSTRAINT "Action_description_check" CHECK (
        char_length("description") BETWEEN 5 AND 2000
        AND "description" = btrim("description", E' \t\n\r\f\013')
    ),
    CONSTRAINT "Action_result_check" CHECK (
        "result" IS NULL OR (
            char_length("result") BETWEEN 1 AND 2000
            AND "result" = btrim("result", E' \t\n\r\f\013')
        )
    ),
    CONSTRAINT "Action_attachmentNotes_check" CHECK (
        "attachmentNotes" IS NULL OR (
            char_length("attachmentNotes") BETWEEN 1 AND 2000
            AND "attachmentNotes" = btrim("attachmentNotes", E' \t\n\r\f\013')
        )
    ),
    CONSTRAINT "Action_follow_up_check" CHECK (
        (NOT "followUpRequired" AND "followUpNote" IS NULL)
        OR ("followUpRequired" AND "followUpNote" IS NOT NULL
            AND char_length("followUpNote") BETWEEN 1 AND 2000
            AND "followUpNote" = btrim("followUpNote", E' \t\n\r\f\013'))
    ),
    CONSTRAINT "Action_cancellation_reason_check" CHECK (
        "cancellationReason" IS NULL OR (
            char_length("cancellationReason") BETWEEN 5 AND 500
            AND "cancellationReason" = btrim("cancellationReason", E' \t\n\r\f\013')
        )
    ),
    CONSTRAINT "Action_creation_time_check" CHECK ("actionAt" = "createdAt"),
    CONSTRAINT "Action_lifecycle_check" CHECK (
        ("status" IN ('PLANNED', 'IN_PROGRESS') AND "performedById" IS NULL
            AND "completedAt" IS NULL AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL)
        OR ("status" = 'COMPLETED' AND "performedById" IS NOT NULL AND "completedAt" IS NOT NULL
            AND "result" IS NOT NULL AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL)
        -- A cancelled Action may retain a valid optional draft result/follow-up.
        OR ("status" = 'CANCELLED' AND "performedById" IS NULL AND "completedAt" IS NULL
            AND "cancelledAt" IS NOT NULL AND "cancellationReason" IS NOT NULL)
    ),
    CONSTRAINT "Action_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Action_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Action_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Action_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ActionHistory" (
    "id" SERIAL NOT NULL,
    "actionId" INTEGER NOT NULL,
    "actorId" INTEGER NOT NULL,
    "event" "ActionHistoryEvent" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),
    "actionVersion" INTEGER NOT NULL,
    "before" JSONB,
    "after" JSONB NOT NULL,
    "sourceTicketStatusHistoryId" INTEGER,
    CONSTRAINT "ActionHistory_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ActionHistory_version_positive_check" CHECK ("actionVersion" > 0),
    CONSTRAINT "ActionHistory_after_object_check" CHECK (jsonb_typeof("after") = 'object'),
    CONSTRAINT "ActionHistory_before_event_check" CHECK (
        ("event" = 'ACTION_CREATED' AND "before" IS NULL AND "actionVersion" = 1)
        OR ("event" <> 'ACTION_CREATED' AND "before" IS NOT NULL
            AND jsonb_typeof("before") = 'object' AND "actionVersion" > 1)
    ),
    CONSTRAINT "ActionHistory_cascade_source_check" CHECK (
        ("event" = 'ACTION_CANCELLED_BY_TICKET' AND "sourceTicketStatusHistoryId" IS NOT NULL)
        OR ("event" <> 'ACTION_CANCELLED_BY_TICKET' AND "sourceTicketStatusHistoryId" IS NULL)
    ),
    CONSTRAINT "ActionHistory_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ActionHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ActionHistory_sourceTicketStatusHistoryId_fkey" FOREIGN KEY ("sourceTicketStatusHistoryId") REFERENCES "TicketStatusHistory"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Cross-row same-Ticket checks, exact snapshots and append-only mutation access
-- are enforced by later transactional services, not by rewriting old records.
CREATE TABLE "MutationReceipt" (
    "id" SERIAL NOT NULL,
    "actorId" INTEGER NOT NULL,
    "clientMutationId" UUID NOT NULL,
    "operation" TEXT NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "actionId" INTEGER NOT NULL,
    "inputFingerprint" CHAR(64) NOT NULL,
    "safeResponse" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),
    CONSTRAINT "MutationReceipt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MutationReceipt_operation_check" CHECK (
        char_length("operation") > 0 AND "operation" = btrim("operation", E' \t\n\r\f\013')
    ),
    CONSTRAINT "MutationReceipt_fingerprint_check" CHECK ("inputFingerprint" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "MutationReceipt_response_object_check" CHECK (jsonb_typeof("safeResponse") = 'object'),
    CONSTRAINT "MutationReceipt_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MutationReceipt_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MutationReceipt_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "SeedFixture" (
    "id" SERIAL NOT NULL,
    "fixtureKey" TEXT NOT NULL,
    "userId" INTEGER,
    "categoryId" INTEGER,
    "relatedSystemId" INTEGER,
    "ticketId" INTEGER,
    "actionId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),
    CONSTRAINT "SeedFixture_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SeedFixture_fixture_key_check" CHECK (
        char_length("fixtureKey") > 0 AND "fixtureKey" = btrim("fixtureKey", E' \t\n\r\f\013')
    ),
    CONSTRAINT "SeedFixture_exactly_one_target_check" CHECK (
        num_nonnulls("userId", "categoryId", "relatedSystemId", "ticketId", "actionId") = 1
    ),
    CONSTRAINT "SeedFixture_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SeedFixture_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SeedFixture_relatedSystemId_fkey" FOREIGN KEY ("relatedSystemId") REFERENCES "RelatedSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SeedFixture_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SeedFixture_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Action_ticketId_createdAt_id_idx" ON "Action"("ticketId", "createdAt", "id");
CREATE INDEX "Action_ticketId_status_idx" ON "Action"("ticketId", "status");
CREATE INDEX "Action_assigneeId_status_createdAt_id_idx" ON "Action"("assigneeId", "status", "createdAt", "id");
CREATE INDEX "ActionHistory_actionId_createdAt_id_idx" ON "ActionHistory"("actionId", "createdAt", "id");
CREATE UNIQUE INDEX "ActionHistory_actionId_actionVersion_key" ON "ActionHistory"("actionId", "actionVersion");
CREATE UNIQUE INDEX "MutationReceipt_actorId_clientMutationId_key" ON "MutationReceipt"("actorId", "clientMutationId");
CREATE UNIQUE INDEX "SeedFixture_fixtureKey_key" ON "SeedFixture"("fixtureKey");

COMMIT;
