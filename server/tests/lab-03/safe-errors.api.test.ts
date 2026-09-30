import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../../src/app.js";
import {
  setAttachmentStorageForTests,
  StorageUnavailableError,
} from "../../src/attachments/attachment-storage.js";
import { getPrisma } from "../../src/prisma.js";
import {
  authenticatedFixture,
  authenticatedUnsafe,
  cleanupIssue29Fixtures,
  createTicketFixture,
} from "./issue29-test-helpers.js";

const passwordFailure = vi.hoisted(() => ({ nextHashFails: false }));

vi.mock("../../src/auth/password.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/auth/password.js")>();
  return {
    ...actual,
    async hashPassword(password: string) {
      if (passwordFailure.nextHashFails) {
        passwordFailure.nextHashFails = false;
        throw new actual.PasswordHashingUnavailableError();
      }
      return actual.hashPassword(password);
    },
  };
});

const SECRET_MARKERS =
  /password|passwordHash|token|cookie|csrf|DATABASE_URL|postgres(?:ql)?:\/\/|SQL|stack|storageKey|private-hash-detail/iu;

afterEach(async () => {
  setAttachmentStorageForTests(null);
  await cleanupIssue29Fixtures();
  vi.clearAllMocks();
  passwordFailure.nextHashFails = false;
});

function expectSafeFailure(
  response: request.Response,
  status: 500 | 503,
  code: "INTERNAL_ERROR" | "SERVICE_UNAVAILABLE" | "STORAGE_UNAVAILABLE",
) {
  expect(response.status).toBe(status);
  expect(response.body).toEqual({
    error: {
      code,
      message: status === 500
        ? "Something went wrong. Please try again."
        : code === "STORAGE_UNAVAILABLE"
          ? "Attachment storage is temporarily unavailable. Please try again."
          : "Service is temporarily unavailable. Please try again.",
    },
  });
  expect(JSON.stringify(response.body)).not.toMatch(SECRET_MARKERS);
}

describe("API-21 safe dependency failures and redaction", () => {
  it("returns redacted 500 and 503 responses without logging protected database details", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const unavailable = new Prisma.PrismaClientInitializationError(
      "postgresql://private-user:private-password@private-host/toktickit_test",
      Prisma.prismaVersion.client,
      "P1001",
    );
    expect(unavailable).toBeInstanceOf(Prisma.PrismaClientInitializationError);
    const delegate = getPrisma().category;
    const originalFindMany = delegate.findMany.bind(delegate);
    const findManySpy = vi.spyOn(delegate, "findMany")
      .mockRejectedValueOnce(new Error("SQL failed with DATABASE_URL and private token"))
      .mockRejectedValueOnce(unavailable);
    try {
      const unexpected = await request(app).get("/api/categories");
      const dependency = await request(app).get("/api/categories");

      expectSafeFailure(unexpected, 500, "INTERNAL_ERROR");
      expectSafeFailure(dependency, 503, "SERVICE_UNAVAILABLE");
      expect(errorSpy).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(errorSpy.mock.calls)).not.toMatch(SECRET_MARKERS);
    } finally {
      findManySpy.mockImplementation(originalFindMany);
    }
  });

  it("returns a redacted 503 when Attachment storage is unavailable and leaves no metadata row", async () => {
    const requester = await authenticatedFixture({ label: "issue37-safe-storage" });
    const ticket = await createTicketFixture(requester.user.id);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    setAttachmentStorageForTests({
      async store() {
        throw new StorageUnavailableError("private storage endpoint and token");
      },
      async remove() {},
    });

    const response = await authenticatedUnsafe(
      request(app).post(`/api/tickets/${ticket.id}/attachments`),
      requester,
    ).attach("file", Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nFQAAAAASUVORK5CYII=",
      "base64",
    ), { filename: "safe.png", contentType: "image/png" });

    expectSafeFailure(response, 503, "STORAGE_UNAVAILABLE");
    expect(await getPrisma().attachment.count({ where: { ticketId: ticket.id } })).toBe(0);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toMatch(SECRET_MARKERS);
  });

  it("treats an Argon2 hashing outage as a redacted service dependency failure", async () => {
    const administrator = await authenticatedFixture({
      role: "ADMINISTRATOR",
      label: "issue37-safe-hash-admin",
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    passwordFailure.nextHashFails = true;
    const email = `issue29-issue37-hash-${randomUUID()}@example.test`;

    const response = await authenticatedUnsafe(
      request(app).post("/api/admin/users"),
      administrator,
    ).send({
      name: "Issue 37 Hash Failure",
      email,
      role: "REQUESTER",
      isActive: true,
      initialPassword: "Issue37 Hash! 123",
      confirmPassword: "Issue37 Hash! 123",
    });

    expectSafeFailure(response, 503, "SERVICE_UNAVAILABLE");
    expect(await getPrisma().user.count({ where: { email } })).toBe(0);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toMatch(SECRET_MARKERS);
  });

  it("keeps User and session DTOs free of credential, hash, cookie, token, and throttle fields", async () => {
    const administrator = await authenticatedFixture({
      role: "ADMINISTRATOR",
      label: "issue37-redaction-admin",
    });
    const [current, users] = await Promise.all([
      request(app).get("/api/auth/me").set("Cookie", administrator.cookie),
      request(app).get("/api/admin/users").set("Cookie", administrator.cookie),
    ]);

    expect(current.status).toBe(200);
    expect(users.status).toBe(200);
    expect(JSON.stringify({ current: current.body, users: users.body })).not.toMatch(
      /passwordHash|passwordChangedAt|failedLoginAttempts|lockedUntil|tokenHash|csrfTokenHash|toktickit_session|toktickit_csrf/iu,
    );
  });
});
