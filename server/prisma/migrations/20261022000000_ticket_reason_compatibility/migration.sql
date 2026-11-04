-- D-20 compatibility only. Preserve all historical values, including null
-- cancellation reasons; new cancellation requests remain API-validated.
BEGIN;

ALTER TABLE "TicketStatusHistory"
    DROP CONSTRAINT "TicketStatusHistory_reason_length_check",
    ADD CONSTRAINT "TicketStatusHistory_reason_length_check" CHECK (
        "reason" IS NULL
        OR ("toStatus" = 'CANCELLED' AND char_length("reason") BETWEEN 5 AND 500)
        OR ("toStatus" <> 'CANCELLED' AND char_length("reason") BETWEEN 0 AND 500)
    );

COMMIT;
