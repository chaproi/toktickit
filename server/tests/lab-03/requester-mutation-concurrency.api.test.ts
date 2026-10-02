import { randomUUID } from "node:crypto";
import { Client } from "pg";
import request, { type Response } from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { setAttachmentStorageForTests } from "../../src/attachments/attachment-storage.js";
import { getPrisma } from "../../src/prisma.js";
import {
  authenticatedFixture,
  authenticatedUnsafe,
  cleanupIssue29Fixtures,
  createTicketFixture,
  referenceIds,
  type AuthenticatedFixture,
} from "./issue29-test-helpers.js";

type EligibilityChange = "deactivate" | "role";

type RaceScenario = {
  actor: AuthenticatedFixture;
  ticketId: number | null;
  protectedMarkers: string[];
  mutate: () => Promise<Response>;
  lockDependency: (client: Client) => Promise<void>;
  assertCommitted: () => Promise<void>;
  assertNotCommitted: () => Promise<void>;
};

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 10));

async function connectClient(label: string): Promise<Client> {
  getPrisma();
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    application_name: `issue29-${label}-${randomUUID()}`,
  });
  await client.connect();
  return client;
}

async function backendPid(client: Client): Promise<number> {
  const result = await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
  return result.rows[0]!.pid;
}

async function waitForBlockedBy(
  observer: Client,
  blockerPids: number[],
  settled?: () => boolean,
): Promise<boolean> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const result = await observer.query<{ blocked: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM pg_stat_activity
         WHERE pid <> pg_backend_pid()
           AND pg_blocking_pids(pid) && $1::integer[]
       ) AS blocked`,
      [blockerPids],
    );
    if (result.rows[0]!.blocked) return true;
    if (settled?.()) return false;
    await pause();
  }
  return false;
}

async function waitForClientBlocked(observer: Client, pid: number): Promise<boolean> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const result = await observer.query<{ blocked: boolean }>(
      "SELECT cardinality(pg_blocking_pids($1)) > 0 AS blocked",
      [pid],
    );
    if (result.rows[0]!.blocked) return true;
    await pause();
  }
  return false;
}

async function begin(client: Client): Promise<void> {
  await client.query("BEGIN");
}

async function changeEligibility(
  client: Client,
  actor: AuthenticatedFixture,
  change: EligibilityChange,
): Promise<void> {
  if (change === "deactivate") {
    await client.query(
      'UPDATE "User" SET "isActive" = false, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1',
      [actor.user.id],
    );
    return;
  }
  const nextRole = actor.user.role === "REQUESTER" ? "IT_STAFF" : "REQUESTER";
  await client.query(
    'UPDATE "User" SET "role" = $2::"UserRole", "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1',
    [actor.user.id, nextRole],
  );
}

async function expectEligibilityChanged(
  actor: AuthenticatedFixture,
  change: EligibilityChange,
): Promise<void> {
  const user = await getPrisma().user.findUniqueOrThrow({ where: { id: actor.user.id } });
  if (change === "deactivate") {
    expect(user.isActive).toBe(false);
  } else {
    expect(user.role).not.toBe(actor.user.role);
  }
}

async function ticketLock(client: Client, ticketId: number): Promise<void> {
  await client.query('SELECT "id" FROM "Ticket" WHERE "id" = $1 FOR UPDATE', [ticketId]);
}

async function createScenario(kind: string): Promise<RaceScenario> {
  const prisma = getPrisma();
  if (kind === "ticket") {
    const actor = await authenticatedFixture({ label: "race-ticket" });
    const refs = await referenceIds();
    const clientSubmissionId = randomUUID();
    const year = new Date().getUTCFullYear();
    await prisma.ticketNumberSequence.upsert({
      where: { year },
      create: { year, lastValue: 0 },
      update: {},
    });
    return {
      actor,
      ticketId: null,
      protectedMarkers: [actor.user.email, "Race-created Ticket"],
      mutate: () => authenticatedUnsafe(request(app).post("/api/tickets"), actor).send({
        clientSubmissionId,
        ...refs,
        requestedPriority: "HIGH",
        summary: "Race-created Ticket",
        description: "Eligibility must remain current until Ticket creation commits.",
      }),
      lockDependency: async (client) => {
        await client.query(
          'SELECT "year" FROM "TicketNumberSequence" WHERE "year" = $1 FOR UPDATE',
          [year],
        );
      },
      assertCommitted: async () => {
        expect(await prisma.ticket.count({ where: { requesterId: actor.user.id, clientSubmissionId } })).toBe(1);
      },
      assertNotCommitted: async () => {
        expect(await prisma.ticket.count({ where: { requesterId: actor.user.id, clientSubmissionId } })).toBe(0);
      },
    };
  }

  if (kind === "comment") {
    const owner = await authenticatedFixture({ label: "race-comment-owner" });
    const actor = await authenticatedFixture({ role: "IT_STAFF", label: "race-comment-actor" });
    const ticket = await createTicketFixture(owner.user.id, "OPEN");
    const content = `Race Comment ${randomUUID()}`;
    return {
      actor,
      ticketId: ticket.id,
      protectedMarkers: [owner.user.email, ticket.ticketNumber, ticket.summary],
      mutate: () => authenticatedUnsafe(
        request(app).post(`/api/tickets/${ticket.id}/comments`),
        actor,
      ).send({ content }),
      lockDependency: (client) => ticketLock(client, ticket.id),
      assertCommitted: async () => {
        expect(await prisma.publicComment.count({ where: { ticketId: ticket.id, content } })).toBe(1);
      },
      assertNotCommitted: async () => {
        expect(await prisma.publicComment.count({ where: { ticketId: ticket.id, content } })).toBe(0);
      },
    };
  }

  const actor = await authenticatedFixture({ label: `race-${kind}` });
  const ticket = await createTicketFixture(actor.user.id, "OPEN");

  if (kind === "resolution") {
    return {
      actor,
      ticketId: ticket.id,
      protectedMarkers: [actor.user.email, ticket.ticketNumber, ticket.summary],
      mutate: () => authenticatedUnsafe(
        request(app).post(`/api/tickets/${ticket.id}/resolution-indication`),
        actor,
      ).send({ confirm: true }),
      lockDependency: (client) => ticketLock(client, ticket.id),
      assertCommitted: async () => {
        const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
        expect(stored.requesterResolutionIndicatedById).toBe(actor.user.id);
        expect(stored.currentStatus).toBe("OPEN");
        expect(await prisma.ticketStatusHistory.count({ where: { ticketId: ticket.id } })).toBe(0);
      },
      assertNotCommitted: async () => {
        const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
        expect(stored.requesterResolutionIndicatedAt).toBeNull();
        expect(stored.requesterResolutionIndicatedById).toBeNull();
        expect(await prisma.ticketStatusHistory.count({ where: { ticketId: ticket.id } })).toBe(0);
      },
    };
  }

  if (kind === "upload") {
    const filename = `race-upload-${randomUUID()}.png`;
    setAttachmentStorageForTests({
      async store() {},
      async remove() {},
      async read() { return Buffer.from("synthetic"); },
    });
    return {
      actor,
      ticketId: ticket.id,
      protectedMarkers: [actor.user.email, ticket.ticketNumber, ticket.summary],
      mutate: () => authenticatedUnsafe(
        request(app).post(`/api/tickets/${ticket.id}/attachments`),
        actor,
      ).attach(
        "file",
        Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nFQAAAAASUVORK5CYII=", "base64"),
        { filename, contentType: "image/png" },
      ),
      lockDependency: (client) => ticketLock(client, ticket.id),
      assertCommitted: async () => {
        expect(await prisma.attachment.count({ where: { ticketId: ticket.id, originalFilename: filename } })).toBe(1);
      },
      assertNotCommitted: async () => {
        expect(await prisma.attachment.count({ where: { ticketId: ticket.id, originalFilename: filename } })).toBe(0);
      },
    };
  }

  const attachment = await prisma.attachment.create({
    data: {
      ticketId: ticket.id,
      originalFilename: "race-removal.txt",
      storageKey: `race-removal-${randomUUID()}`,
      mimeType: "text/plain",
      sizeBytes: 9,
      uploadedByUserId: actor.user.id,
    },
  });
  setAttachmentStorageForTests({
    async store() {},
    async remove() {},
    async read() { return Buffer.from("synthetic"); },
  });
  return {
    actor,
    ticketId: ticket.id,
    protectedMarkers: [actor.user.email, ticket.ticketNumber, ticket.summary],
    mutate: () => authenticatedUnsafe(
      request(app).delete(`/api/tickets/${ticket.id}/attachments/${attachment.id}`),
      actor,
    ).send({ removalReason: "Race-safe removal reason." }),
    lockDependency: (client) => ticketLock(client, ticket.id),
    assertCommitted: async () => {
      const stored = await prisma.attachment.findUniqueOrThrow({ where: { id: attachment.id } });
      expect(stored.isRemoved).toBe(true);
      expect(stored.removedByUserId).toBe(actor.user.id);
    },
    assertNotCommitted: async () => {
      const stored = await prisma.attachment.findUniqueOrThrow({ where: { id: attachment.id } });
      expect(stored.isRemoved).toBe(false);
      expect(stored.removedByUserId).toBeNull();
    },
  };
}

afterEach(async () => {
  setAttachmentStorageForTests(null);
  await cleanupIssue29Fixtures();
});

describe("Issue 29 atomic requester mutation eligibility", () => {
  it.each([
    "ticket",
    "comment",
    "resolution",
    "upload",
    "remove",
  ])("serializes %s before deactivation and role changes", async (kind) => {
    for (const change of ["deactivate", "role"] as const) {
      const scenario = await createScenario(kind);
      const barrier = await connectClient(`${kind}-${change}-barrier`);
      const editor = await connectClient(`${kind}-${change}-editor`);
      const observer = await connectClient(`${kind}-${change}-observer`);
      let barrierOpen = false;
      let editorOpen = false;
      try {
        await begin(barrier);
        barrierOpen = true;
        await scenario.lockDependency(barrier);
        const barrierPid = await backendPid(barrier);
        let mutationSettled = false;
        const mutationPromise = scenario.mutate();
        void mutationPromise.then(
          () => { mutationSettled = true; },
          () => { mutationSettled = true; },
        );
        const mutationBlocked = await waitForBlockedBy(
          observer,
          [barrierPid],
          () => mutationSettled,
        );

        await begin(editor);
        editorOpen = true;
        const editorPid = await backendPid(editor);
        let editSettled = false;
        const editPromise = changeEligibility(editor, scenario.actor, change);
        void editPromise.then(
          () => { editSettled = true; },
          () => { editSettled = true; },
        );
        const editBlocked = await Promise.race([
          waitForClientBlocked(observer, editorPid),
          (async () => {
            while (!editSettled) await pause();
            return false;
          })(),
        ]);

        if (!editBlocked) {
          await editPromise;
          await editor.query("COMMIT");
          editorOpen = false;
        }
        await barrier.query("COMMIT");
        barrierOpen = false;
        const mutation = await mutationPromise;
        if (editBlocked) {
          await editPromise;
          await editor.query("COMMIT");
          editorOpen = false;
        }

        expect(mutationBlocked).toBe(true);
        expect(editBlocked).toBe(true);
        expect([200, 201]).toContain(mutation.status);
        await scenario.assertCommitted();
        await expectEligibilityChanged(scenario.actor, change);
      } finally {
        if (barrierOpen) await barrier.query("ROLLBACK");
        if (editorOpen) await editor.query("ROLLBACK");
        await Promise.all([barrier.end(), editor.end(), observer.end()]);
      }
    }
  }, 60_000);

  it.each([
    "ticket",
    "comment",
    "resolution",
    "upload",
    "remove",
  ])("rejects %s after deactivation or role change commits first", async (kind) => {
    for (const change of ["deactivate", "role"] as const) {
      const scenario = await createScenario(kind);
      const barrier = await connectClient(`${kind}-${change}-barrier-first-edit`);
      const editor = await connectClient(`${kind}-${change}-first-editor`);
      const observer = await connectClient(`${kind}-${change}-first-observer`);
      let barrierOpen = false;
      let editorOpen = false;
      try {
        await begin(barrier);
        barrierOpen = true;
        await scenario.lockDependency(barrier);
        const barrierPid = await backendPid(barrier);
        await begin(editor);
        editorOpen = true;
        await changeEligibility(editor, scenario.actor, change);
        const editorPid = await backendPid(editor);

        let mutationSettled = false;
        const mutationPromise = scenario.mutate();
        void mutationPromise.then(
          () => { mutationSettled = true; },
          () => { mutationSettled = true; },
        );
        await waitForBlockedBy(
          observer,
          [barrierPid, editorPid],
          () => mutationSettled,
        );

        await editor.query("COMMIT");
        editorOpen = false;
        await barrier.query("COMMIT");
        barrierOpen = false;
        const mutation = await mutationPromise;

        expect(mutation.status).toBe(409);
        expect(mutation.body).toEqual({
          error: {
            code: "CONCURRENT_UPDATE",
            message: "Your account eligibility changed. Reload and try again.",
          },
        });
        const serialized = JSON.stringify(mutation.body);
        for (const marker of scenario.protectedMarkers) {
          expect(serialized).not.toContain(marker);
        }
        await scenario.assertNotCommitted();
        await expectEligibilityChanged(scenario.actor, change);
      } finally {
        if (barrierOpen) await barrier.query("ROLLBACK");
        if (editorOpen) await editor.query("ROLLBACK");
        await Promise.all([barrier.end(), editor.end(), observer.end()]);
      }
    }
  }, 60_000);
});
