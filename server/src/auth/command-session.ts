import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma } from "@prisma/client";
import { evaluateSessionLifetime } from "./session.js";

type Context = { actorId: number; sessionId: string; tokenHash: string; csrfTokenHash: string };
const requests = new AsyncLocalStorage<{ current?: Context }>();
export function commandRequest<T>(work: () => T) { return requests.run({}, work); }
export function resolvedCommandSession(userId: number, session: { id: string; tokenHash: string; csrfTokenHash: string }) {
  const request = requests.getStore();
  if (request) request.current = { actorId: userId, sessionId: session.id, tokenHash: session.tokenHash, csrfTokenHash: session.csrfTokenHash };
}
export class CommandSessionError extends Error {
  constructor(readonly code: "AUTHENTICATION_REQUIRED" | "PASSWORD_CHANGE_REQUIRED" | "CSRF_INVALID") { super("Current command authorization failed."); }
}
// Internal/system callers retain their explicit context contracts. Every HTTP
// request has its own envelope; no identity comes from mutation body fields.
export async function validateCommandSession(tx: Prisma.TransactionClient, actorId: number,
  eligible: boolean, mustChangePassword: boolean, revokeUsers: readonly number[] = [], allowPasswordChange = false) {
  const envelope = requests.getStore(); if (!envelope) return;
  const context = envelope.current;
  if (!context || context.actorId !== actorId) throw new CommandSessionError("AUTHENTICATION_REQUIRED");
  // Preserve inherited actor-conflict precedence at legacy call sites.
  if (!eligible) return;
  type Session = { id: string; userId: number; tokenHash: string; csrfTokenHash: string; createdAt: Date; lastSeenAt: Date; expiresAt: Date };
  const fields = Prisma.sql`"id","userId","tokenHash","csrfTokenHash","createdAt","lastSeenAt","expiresAt"`;
  const sessions = revokeUsers.length ? await tx.$queryRaw<Session[]>(Prisma.sql`
    SELECT ${fields} FROM "AuthSession" WHERE "id"=${context.sessionId}::uuid OR "userId" IN (${Prisma.join(revokeUsers)}) ORDER BY "id" FOR UPDATE`)
    : await tx.$queryRaw<Session[]>(Prisma.sql`SELECT ${fields} FROM "AuthSession" WHERE "id"=${context.sessionId}::uuid FOR SHARE`);
  const session = sessions.find(s => s.id === context.sessionId);
  if (!session || session.userId !== actorId || session.tokenHash !== context.tokenHash || !evaluateSessionLifetime(session, new Date()).live) {
    throw new CommandSessionError("AUTHENTICATION_REQUIRED");
  }
  if (mustChangePassword && !allowPasswordChange) throw new CommandSessionError("PASSWORD_CHANGE_REQUIRED");
  if (session.csrfTokenHash !== context.csrfTokenHash) throw new CommandSessionError("CSRF_INVALID");
}
