// T-47 diagnosis only. Fixture bodies copied unchanged from 8053570's private
// builder/count helpers so the committed benchmark need not be edited/imported.
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { query } from "./migration-test-fixtures.js";
import type { Actor } from "./performance-test-helpers.js";

export async function seedBusinessRows(client: Client, actors: Actor[], categoryIds: number[], systemIds: number[]) {
  const requesterIds = actors.slice(0, 20).map(actor => actor.id);
  const workerIds = actors.slice(20).map(actor => actor.id);
  // Literal fixture distribution, using the actual committed constraints/indexes.
  await query(client, `INSERT INTO "Ticket" (id,"ticketNumber","clientSubmissionId","requesterId","ownerId","categoryId","relatedSystemId",
      summary,description,"requestedPriority","itPriority","currentStatus","ticketDate","createdAt","updatedAt")
    SELECT g,'P47-'||lpad(g::text,6,'0'),('47000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,
      ($1::int[])[((g-1)/8)%20+1],CASE WHEN g%4=0 THEN null ELSE ($2::int[])[((g-1)/8)%30+1] END,
      ($3::int[])[((g-1)/160)%4+1],($4::int[])[((g-1)/40)%4+1],
      'Synthetic indexed Ticket '||g,repeat('Representative literal diagnostic context. ',24),
      (ARRAY['LOW','MEDIUM','HIGH','URGENT'])[(g-1)%4+1]::"RequestedPriority",
      (ARRAY['URGENT','HIGH','MEDIUM','LOW'])[(g-1)%4+1]::"RequestedPriority",
      (ARRAY['NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','RESOLVED','CLOSED','REOPENED','CANCELLED'])[(g-1)%8+1]::"TicketStatus",
      timezone('UTC',CURRENT_TIMESTAMP)-interval '30 days',timezone('UTC',CURRENT_TIMESTAMP)-interval '30 days',
      timezone('UTC',CURRENT_TIMESTAMP)-((g-1)%14)*interval '1 day'-interval '1 hour'
    FROM generate_series(1,2000) g`, [requesterIds, workerIds, categoryIds, systemIds]);
  for (const actor of actors) {
    const id = 2001 + actor.ordinal;
    const row = await query<{ updatedAt: Date }>(client, `INSERT INTO "Ticket" (id,"ticketNumber","clientSubmissionId","requesterId","ownerId","categoryId","relatedSystemId",
        summary,description,"requestedPriority","itPriority","currentStatus","ticketDate","createdAt","updatedAt")
      VALUES ($1,$2,$3::uuid,$4,$5,$6,$7,'Independent benchmark mutation Ticket','Synthetic mutation context','HIGH','MEDIUM','OPEN',
        timezone('UTC',CURRENT_TIMESTAMP)-interval '20 days',timezone('UTC',CURRENT_TIMESTAMP)-interval '20 days',timezone('UTC',CURRENT_TIMESTAMP)-interval '2 hours') RETURNING "updatedAt"`,
      [id, `P47-W-${actor.ordinal}`, randomUUID(), actor.role === "REQUESTER" ? actor.id : requesterIds[actor.ordinal % 20],
        actor.role === "REQUESTER" ? workerIds[actor.ordinal % 30] : actor.id, categoryIds[actor.ordinal % 4], systemIds[actor.ordinal % 4]]);
    actor.writeTicketId = id; actor.ticketToken = row.rows[0]!.updatedAt.toISOString();
    const selected = await query<{ id: number }>(client, 'SELECT id FROM "Ticket" WHERE id<=2000 AND "requesterId"=$1 AND "currentStatus"=\'OPEN\' ORDER BY id LIMIT 1',
      [actor.role === "REQUESTER" ? actor.id : requesterIds[actor.ordinal % 20]]);
    actor.readTicketId = selected.rows[0]!.id;
  }
  await query(client, `INSERT INTO "TicketStatusHistory" ("ticketId","actorId","fromStatus","toStatus",reason,"createdAt")
    SELECT t.id,$1,e.f::"TicketStatus",e.t::"TicketStatus",'Synthetic historical transition',t."updatedAt"-(3-e.n)*interval '1 millisecond'
    FROM "Ticket" t CROSS JOIN LATERAL (
      SELECT 1 AS n,'NEW' AS f,'OPEN' AS t WHERE t."currentStatus"<>'NEW'
      UNION ALL SELECT 2,'OPEN',CASE WHEN t."currentStatus" IN ('CLOSED','REOPENED') THEN 'RESOLVED' ELSE t."currentStatus"::text END
        WHERE t."currentStatus" NOT IN ('NEW','OPEN')
      UNION ALL SELECT 3,'RESOLVED',t."currentStatus"::text WHERE t."currentStatus" IN ('CLOSED','REOPENED')
    ) e`, [workerIds[0]]);
  await query(client, `INSERT INTO "Action" (id,"ticketId","createdById","assigneeId","performedById",description,result,status,
      "followUpRequired","followUpNote","attachmentNotes","actionAt","createdAt","updatedAt","completedAt","cancelledAt","cancellationReason",version)
    SELECT g,t.id,($1::int[])[g%30+1],($1::int[])[(g-1)%30+1],CASE WHEN s.status='COMPLETED' THEN ($1::int[])[(g+1)%30+1] ELSE null END,
      btrim(repeat('Representative literal Action context. ',14)),CASE WHEN s.status='COMPLETED' THEN btrim(repeat('Verified result. ',16)) ELSE 'Retained draft result' END,s.status::"ActionStatus",
      g%3=0,CASE WHEN g%3=0 THEN 'Valid retained follow-up work note.' ELSE null END,'Literal attachment notes; no binary upload.',
      t."createdAt"+g*interval '1 millisecond',t."createdAt"+g*interval '1 millisecond',t."updatedAt"-interval '1 second'+(g%4)*interval '1 millisecond',
      CASE WHEN s.status='COMPLETED' THEN t."updatedAt"-interval '1 second'+(g%4)*interval '1 millisecond' ELSE null END,
      CASE WHEN s.status='CANCELLED' THEN t."updatedAt"-interval '1 second'+(g%4)*interval '1 millisecond' ELSE null END,
      CASE WHEN s.status='CANCELLED' THEN 'Synthetic historical cancellation.' ELSE null END,3
    FROM generate_series(1,8000) g JOIN "Ticket" t ON t.id=1+(g-1)/4 CROSS JOIN LATERAL (
      SELECT CASE WHEN t."currentStatus" IN ('RESOLVED','CLOSED','CANCELLED')
        THEN CASE WHEN g%2=0 THEN 'COMPLETED' ELSE 'CANCELLED' END
        ELSE (ARRAY['PLANNED','IN_PROGRESS','COMPLETED','CANCELLED'])[(g-1)%4+1] END AS status
    ) s`, [workerIds]);
  await query(client, `WITH snapshots AS (
    SELECT a.id,a."createdById",a.status,v,CASE WHEN v=1 THEN 'ACTION_CREATED'
      WHEN v=2 AND a.status IN ('COMPLETED','CANCELLED') THEN 'ACTION_STARTED'
      WHEN v=3 AND a.status='IN_PROGRESS' THEN 'ACTION_STARTED'
      WHEN v=3 AND a.status='COMPLETED' THEN 'ACTION_COMPLETED'
      WHEN v=3 AND a.status='CANCELLED' THEN 'ACTION_CANCELLED' ELSE 'ACTION_EDITED' END AS event,
      CASE WHEN v=3 THEN a."updatedAt" ELSE a."createdAt"+(v-1)*interval '1 millisecond' END AS time,
      to_jsonb(a)||jsonb_build_object('version',v,
        'status',CASE WHEN v=1 OR a.status='PLANNED' OR (v=2 AND a.status='IN_PROGRESS') THEN 'PLANNED' WHEN v=2 THEN 'IN_PROGRESS' ELSE a.status::text END,
        'description',CASE WHEN v=1 THEN 'Initial representative Action description' WHEN v=2 THEN 'Intermediate representative Action description' ELSE a.description END,
        'actionAt',to_char(a."actionAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'createdAt',to_char(a."createdAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'updatedAt',to_char(CASE WHEN v=3 THEN a."updatedAt" ELSE a."createdAt"+(v-1)*interval '1 millisecond' END,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'performedById',CASE WHEN v=3 THEN a."performedById" ELSE null END,
        'completedAt',CASE WHEN v=3 AND a."completedAt" IS NOT NULL THEN to_char(a."completedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') ELSE null END,
        'cancelledAt',CASE WHEN v=3 AND a."cancelledAt" IS NOT NULL THEN to_char(a."cancelledAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') ELSE null END,
        'cancellationReason',CASE WHEN v=3 THEN a."cancellationReason" ELSE null END) AS value FROM "Action" a CROSS JOIN generate_series(1,3) v
    ), events AS (SELECT *,lag(value) OVER (PARTITION BY id ORDER BY v) AS previous FROM snapshots)
    INSERT INTO "ActionHistory" ("actionId","actorId",event,"actionVersion","before","after","createdAt")
      SELECT id,"createdById",event::"ActionHistoryEvent",v,previous,value,time FROM events`);
  for (const table of ["Ticket", "Action"]) await query(client, `SELECT setval(pg_get_serial_sequence($1,'id'),(SELECT max(id) FROM "${table}"))`, [`"${table}"`]);
  for (const table of ["User", "AuthSession", "Ticket", "Action", "ActionHistory", "TicketStatusHistory", "MutationReceipt"]) await query(client, `ANALYZE "${table}"`);
}

export async function counts(client: Client) {
  return (await query<{ tickets: number; actions: number; actionHistory: number; ticketHistory: number; receipts: number; comments: number; users: number; sessions: number }>(client,
    `SELECT (SELECT count(*)::int FROM "Ticket") AS tickets,(SELECT count(*)::int FROM "Action") AS actions,
      (SELECT count(*)::int FROM "ActionHistory") AS "actionHistory",(SELECT count(*)::int FROM "TicketStatusHistory") AS "ticketHistory",
      (SELECT count(*)::int FROM "MutationReceipt") AS receipts,(SELECT count(*)::int FROM "PublicComment") AS comments,
      (SELECT count(*)::int FROM "User") AS users,(SELECT count(*)::int FROM "AuthSession") AS sessions`)).rows[0]!;
}
