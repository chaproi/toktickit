import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ActionReadFixtures, MISSING_ID, READ_OPERATIONS, assertSafeEqual, assertSafeError,
} from "./action-read-test-fixtures.js";

const fixtures = new ActionReadFixtures();
const sessionStates = ["missing", "absolute-expired", "idle-expired", "revoked", "inactive", "forced-change"] as const;
beforeAll(async () => {
  await fixtures.initialize();
  for (const state of sessionStates.filter((state) => state !== "missing")) {
    const actor = await fixtures.actor(state);
    const where = { userId: actor.user.id };
    if (state === "absolute-expired") await fixtures.prisma.authSession.updateMany({ where, data: { expiresAt: new Date("2000-01-01T00:00:00.000Z") } });
    if (state === "idle-expired") await fixtures.prisma.authSession.updateMany({ where, data: { lastSeenAt: new Date("2000-01-01T00:00:00.000Z") } });
    if (state === "revoked") await fixtures.prisma.authSession.deleteMany({ where });
    if (state === "inactive") await fixtures.prisma.user.update({ where: { id: actor.user.id }, data: { isActive: false } });
    if (state === "forced-change") await fixtures.prisma.user.update({ where: { id: actor.user.id }, data: { mustChangePassword: true } });
  }
});
afterAll(() => fixtures.cleanup());

describe("API-01/02/03 authorization (partial AC-01/02/03/12; T-01/02/03/12)", () => {
  it.each(READ_OPERATIONS.flatMap((operation) => ["requester", "coordinator", "completer"].map((role) => ({ operation, role }))))(
    "$role can read $operation on an accessible Ticket", async ({ operation, role }) => {
      const response = await fixtures.get(fixtures.path(operation), fixtures.who(role));
      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toMatch(/application\/json/u);
    },
  );

  it.each(READ_OPERATIONS)("%s hides foreign and missing Requester parents with identical TICKET_NOT_FOUND envelopes", async (operation) => {
    const foreign = await fixtures.get(fixtures.path(operation, fixtures.foreignTicket.id, fixtures.foreignAction.id), fixtures.who("requester"));
    const missing = await fixtures.get(fixtures.path(operation, MISSING_ID, fixtures.foreignAction.id), fixtures.who("requester"));
    assertSafeError(foreign, 404, "TICKET_NOT_FOUND");
    assertSafeError(missing, 404, "TICKET_NOT_FOUND");
    // requestId may be generated per request; protected code/message/fields must be indistinguishable.
    assertSafeEqual({ code: foreign.body.error.code, message: foreign.body.error.message, fields: foreign.body.error.fields },
      { code: missing.body.error.code, message: missing.body.error.message, fields: missing.body.error.fields }, "Ownership-safe parent errors");
    expect(/ticketNumber|description|requesterId|ownerId|createdBy|actor/u.test(JSON.stringify(foreign.body))).toBe(false);
  });

  it.each(["detail", "history"] as const)("%s hides foreign children and missing Actions on an accessible parent", async (operation) => {
    const wrongParent = await fixtures.get(fixtures.path(operation, fixtures.mainTicket.id, fixtures.foreignAction.id), fixtures.who("requester"));
    const missing = await fixtures.get(fixtures.path(operation, fixtures.mainTicket.id, MISSING_ID), fixtures.who("requester"));
    assertSafeError(wrongParent, 404, "ACTION_NOT_FOUND");
    assertSafeError(missing, 404, "ACTION_NOT_FOUND");
    assertSafeEqual({ code: wrongParent.body.error.code, message: wrongParent.body.error.message, fields: wrongParent.body.error.fields },
      { code: missing.body.error.code, message: missing.body.error.message, fields: missing.body.error.fields }, "Safe child mismatch errors");
  });

  it.each(READ_OPERATIONS.flatMap((operation) => sessionStates.map((state) => ({ operation, state }))))(
    "$operation preserves inherited $state session denial before protected lookup", async ({ operation, state }) => {
      const response = await fixtures.get(fixtures.path(operation), state === "missing" ? undefined : fixtures.who(state));
      const forced = state === "forced-change";
      assertSafeError(response, forced ? 403 : 401, forced ? "PASSWORD_CHANGE_REQUIRED" : "AUTHENTICATION_REQUIRED");
      expect(/ticketNumber|summary|description|actionId|requesterId/u.test(JSON.stringify(response.body))).toBe(false);
    },
  );

  it.each(READ_OPERATIONS.flatMap((operation) => ["requester", "coordinator", "completer"].map((role) => ({ operation, role }))))(
    "$role retains $operation access on RESOLVED/CLOSED/CANCELLED Tickets and terminal Actions", async ({ operation, role }) => {
      for (const { ticketId, action } of fixtures.frozen) {
        const response = await fixtures.get(fixtures.path(operation, ticketId, action.id), fixtures.who(role));
        expect(response.status).toBe(200);
        if (operation === "detail") fixtures.assertDTO(response.body.action, action);
        if (operation === "history") expect(response.body.items).toEqual([]);
      }
      const cancelled = await fixtures.get(fixtures.path(operation, fixtures.cancelled.ticketId, fixtures.cancelled.id), fixtures.who(role));
      expect(cancelled.status).toBe(200);
    },
  );

  it("does not reuse Requester-scoped data for another identity", async () => {
    const owner = await fixtures.get(fixtures.path("list"), fixtures.who("requester"));
    expect(owner.status).toBe(200);
    const stranger = await fixtures.get(fixtures.path("list"), fixtures.who("foreign"));
    assertSafeError(stranger, 404, "TICKET_NOT_FOUND");
    const ownForeign = await fixtures.get(fixtures.path("list", fixtures.foreignTicket.id), fixtures.who("foreign"));
    expect(ownForeign.status).toBe(200);
    expect(ownForeign.body.items.map((item: { id: number }) => item.id)).toEqual([fixtures.foreignAction.id]);
    // An absent cache header is safe; explicitly public/shared cache policy is not.
    expect(/(?:public|s-maxage)/iu.test(owner.headers["cache-control"] ?? "")).toBe(false);
  });
});
