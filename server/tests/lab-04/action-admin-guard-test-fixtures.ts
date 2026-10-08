import { createHash, randomUUID } from "node:crypto";
import type { User } from "@prisma/client";
import request from "supertest";
import { expect } from "vitest";
import { app } from "../../src/app.js";
import { editableUser } from "../lab-03/issue35-test-helpers.js";
import { ActionPatchFixtures, type ActionCase } from "./action-patch-test-fixtures.js";
import type { CreateActor } from "./action-create-test-fixtures.js";
import { assertSafeEqual, assertSafeError } from "./action-read-test-fixtures.js";

export type AdminGuardChange = Partial<Pick<User, "name" | "email" | "role" | "isActive">>;
type GuardState = Awaited<ReturnType<ActionAdminGuardFixtures["capture"]>>;

// Sequential D-11 fixtures only. Existing real authentication/create/status
// helpers supply distinct owner, creator, worker and completing identities.
export class ActionAdminGuardFixtures {
  readonly patches = new ActionPatchFixtures();
  get prisma() { return this.patches.prisma; }
  get read() { return this.patches.read; }
  get operator() { return this.patches.administrator; }
  initialize() { return this.patches.initialize(); }

  async target(label: string, role: "IT_STAFF" | "ADMINISTRATOR" = "IT_STAFF") {
    const actor = await this.read.actor(`admin-guard-${label}-${randomUUID()}`, role);
    // Two real stored target sessions make deletion of all sessions observable.
    // Synthetic token material stays in memory and is never assertion output.
    await this.prisma.authSession.create({ data: {
      userId: actor.user.id,
      tokenHash: createHash("sha256").update(randomUUID()).digest("hex"),
      csrfTokenHash: createHash("sha256").update(randomUUID()).digest("hex"),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    } });
    return actor;
  }

  async assigned(target: CreateActor, status: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED") {
    const source = await this.patches.setup(status, { assigneeId: target.user.id });
    expect(source.action.assigneeId).toBe(target.user.id);
    expect(source.parent.ownerId).not.toBe(target.user.id);
    expect(source.action.createdById).not.toBe(target.user.id);
    if (source.action.performedById !== null) expect(source.action.performedById).not.toBe(target.user.id);
    return source;
  }

  async noNonterminalOwnership(target: CreateActor) {
    expect(await this.prisma.ticket.count({ where: {
      ownerId: target.user.id, currentStatus: { notIn: ["CLOSED", "CANCELLED"] },
    } }), "Action guard must not be masked by the inherited owner guard").toBe(0);
  }

  async capture(target: CreateActor, actor = this.operator) {
    const ticketScope = { ticketId: { in: this.read.ticketIds } };
    const [user, sessions, ...domain] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: target.user.id } }),
      this.prisma.authSession.findMany({ where: {
        userId: target.user.id === actor.user.id ? -1 : target.user.id,
      }, orderBy: { id: "asc" } }),
      this.prisma.user.findMany({ where: { id: { in: this.read.userIds, not: target.user.id } }, orderBy: { id: "asc" } }),
      this.prisma.authSession.findMany({ where: { userId: {
        in: this.read.userIds, notIn: [actor.user.id, target.user.id],
      } }, orderBy: { id: "asc" } }),
      this.prisma.ticket.findMany({ where: { id: { in: this.read.ticketIds } }, orderBy: { id: "asc" } }),
      this.prisma.action.findMany({ where: ticketScope, orderBy: { id: "asc" } }),
      this.prisma.actionHistory.findMany({ where: { action: ticketScope }, orderBy: { id: "asc" } }),
      this.prisma.mutationReceipt.findMany({ where: ticketScope, orderBy: { id: "asc" } }),
      this.prisma.ticketStatusHistory.findMany({ where: ticketScope, orderBy: { id: "asc" } }),
      this.prisma.publicComment.findMany({ where: ticketScope, orderBy: { id: "asc" } }),
      this.prisma.internalNote.findMany({ where: ticketScope, orderBy: { id: "asc" } }),
      this.prisma.attachment.findMany({ where: ticketScope, orderBy: { id: "asc" } }),
      this.prisma.category.findMany({ where: { id: this.read.referenceIds.categoryId }, orderBy: { id: "asc" } }),
      this.prisma.relatedSystem.findMany({ where: { id: this.read.referenceIds.relatedSystemId }, orderBy: { id: "asc" } }),
      this.prisma.seedFixture.findMany({ where: { OR: [
        { ticketId: { in: this.read.ticketIds } }, { userId: { in: this.read.userIds } },
      ] }, orderBy: { id: "asc" } }),
      this.prisma.ticketNumberSequence.findMany({ orderBy: { year: "asc" } }),
    ]);
    return { user, sessions, domainDigest: createHash("sha256").update(JSON.stringify(domain)).digest("hex") };
  }

  edit(target: CreateActor, state: GuardState, change: AdminGuardChange, actor = this.operator, token = state.user.updatedAt.toISOString()) {
    return this.patches.patch(`/api/admin/users/${target.user.id}`,
      editableUser(state.user, { ...change, expectedUpdatedAt: token }), actor);
  }

  async rejected(target: CreateActor, change: AdminGuardChange, code: string, actor = this.operator, token?: string) {
    const before = await this.capture(target, actor);
    expect(before.sessions.length, "Fresh non-self target has multiple sessions").toBe(actor.user.id === target.user.id ? 0 : 2);
    const response = await this.edit(target, before, change, actor, token);
    // Missing guard reaches this semantic HTTP assertion. Preservation checks
    // below are deliberately not claimed executed if the response is 200.
    assertSafeError(response, 409, code);
    const after = await this.capture(target, actor);
    assertSafeEqual(after.user, before.user, "Rejected User edit preserves the complete User including credentials/timestamps");
    assertSafeEqual(after.sessions, before.sessions, "Rejected edit preserves every target session; actor bookkeeping excluded");
    expect(after.domainDigest === before.domainDigest, "Rejected edit preserves all domain rows, references, versions, times, histories and receipts; digests redacted").toBe(true);
    expect(Object.keys(response.body.error).every((key) => ["code", "message", "requestId"].includes(key))).toBe(true);
    return response;
  }

  async successful(target: CreateActor, change: AdminGuardChange) {
    const before = await this.capture(target);
    expect(before.sessions.length, "Fresh target has multiple sessions; sensitive rows redacted").toBe(2);
    const response = await this.edit(target, before, change);
    expect(response.status).toBe(200);
    const after = await this.capture(target);
    assertSafeEqual({ ...after.user, updatedAt: before.user.updatedAt }, { ...before.user, ...change },
      "Success changes only requested editable User fields and updatedAt; credentials and historical identity retained");
    expect(after.user.updatedAt.getTime()).toBeGreaterThan(before.user.updatedAt.getTime());
    expect(Object.keys(response.body)).toEqual(["user"]);
    expect(Object.keys(response.body.user).sort()).toEqual([
      "createdAt", "email", "id", "isActive", "mustChangePassword", "name", "role", "updatedAt",
    ]);
    assertSafeEqual(response.body.user, {
      id: after.user.id, name: after.user.name, email: after.user.email, role: after.user.role,
      isActive: after.user.isActive, mustChangePassword: after.user.mustChangePassword,
      createdAt: after.user.createdAt.toISOString(), updatedAt: after.user.updatedAt.toISOString(),
    }, "Exact safe inherited UserManagementDTO");
    expect(after.domainDigest === before.domainDigest,
      "User edit never unassigns/cancels Actions or rewrites domain/history/receipt/owner references; digests redacted").toBe(true);
    const authorizationChanged = before.user.role !== after.user.role || before.user.isActive !== after.user.isActive;
    if (authorizationChanged) {
      expect(after.sessions.length, "Every target session is revoked; sensitive rows redacted").toBe(0);
      const revoked = await request(app).get("/api/auth/me").set("Cookie", target.cookie);
      assertSafeError(revoked, 401, "AUTHENTICATION_REQUIRED");
    } else assertSafeEqual(after.sessions, before.sessions, "Name/email-only edits preserve exact target sessions");
    return after.user;
  }

  async release(source: ActionCase, operation: "complete" | "cancel") {
    // Real API-06, separate authorized completing/cancelling actor. Existing
    // helper checks exact attribution, lifecycle, history/receipt and parent time.
    return this.patches.successful(source, operation);
  }

  async cleanup() {
    const ticketIds = [...this.read.ticketIds], userIds = [...this.read.userIds];
    await this.patches.cleanup(); // Exact owned IDs only, then client disconnect.
    console.info(`D-11 cleanup: ${ticketIds.length} owned Tickets and ${userIds.length} owned Users removed; no injections/environment overrides.`);
  }
}
