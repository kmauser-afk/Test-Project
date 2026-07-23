-- Row-Level Security scaffold (defense-in-depth for queue isolation).
--
-- Policies key off a per-request GUC `app.employee_id` that the app sets after
-- authentication. NOTE: the Prisma runtime currently connects as the database
-- OWNER, which BYPASSES RLS (Postgres owners are exempt unless FORCE is set),
-- so these policies do not yet gate queries — they are in place for when the
-- app connects via a dedicated non-owner role (planned Phase 1). Enabling RLS
-- now is non-breaking and lets us test policies incrementally.

-- Tickets: a row is visible if the caller requested it OR is a member of its queue.
ALTER TABLE "Ticket" ENABLE ROW LEVEL SECURITY;

CREATE POLICY ticket_requester_access ON "Ticket"
  USING ("requesterId" = current_setting('app.employee_id', true));

CREATE POLICY ticket_queue_member_access ON "Ticket"
  USING (
    EXISTS (
      SELECT 1 FROM "QueueMembership" qm
      WHERE qm."queueId" = "Ticket"."queueId"
        AND qm."employeeId" = current_setting('app.employee_id', true)
        AND (qm."expiresAt" IS NULL OR qm."expiresAt" > now())
    )
  );

-- Comments inherit their ticket's visibility.
ALTER TABLE "Comment" ENABLE ROW LEVEL SECURITY;

CREATE POLICY comment_ticket_access ON "Comment"
  USING (
    EXISTS (
      SELECT 1 FROM "Ticket" t
      WHERE t.id = "Comment"."ticketId"
    )
  );

-- Append-only audit trail is readable alongside its ticket.
ALTER TABLE "TicketEvent" ENABLE ROW LEVEL SECURITY;

CREATE POLICY ticket_event_access ON "TicketEvent"
  USING (
    EXISTS (
      SELECT 1 FROM "Ticket" t
      WHERE t.id = "TicketEvent"."ticketId"
    )
  );
