import { Prisma } from "@prisma/client";
import { DriverAdapterError } from "@prisma/driver-adapter-utils";
import { describe, expect, it, vi } from "vitest";
import { deadlineClient } from "../../src/database/transaction-deadline.js";
import { transactionError } from "../../src/database/driver-errors.js";
import { connectionConfiguration } from "../../src/database/connection-configuration.js";

describe("public candidate client boundary compatibility", () => {
  it("maps the exact inherited migration search_path option without changing its schema", () => {
    const url = new URL("postgresql://localhost/candidate_test?schema=owned_schema&connection_limit=1");
    url.searchParams.set("options", "-c search_path=owned_schema");
    const result = connectionConfiguration(url.href);
    expect(result.schema).toBe("owned_schema"); expect(result.pool.options).toBe("-c search_path=owned_schema");
  });
  it.each(["-c search_path=another_schema", "-c search_path=owned_schema -c TimeZone=UTC"])(
    "rejects conflicting/additional startup directives: %s", option => {
      const url = new URL("postgresql://localhost/candidate_test?schema=owned_schema&connection_limit=1");
      url.searchParams.set("options", option);
      expect(() => connectionConfiguration(url.href)).toThrow();
    });
  it("restores the exact public transaction method after pass-through instrumentation", async () => {
    const wrapper = deadlineClient({ adapter: { provider: "postgres", adapterName: "no-connect-component",
      connect: async () => { throw new Error("This property-only component must not connect."); } } });
    const client = wrapper.client, original = client.$transaction;
    const spy = vi.spyOn(client, "$transaction"); spy.mockRestore();
    expect(typeof client.$transaction).toBe("function");
    expect(client.$transaction).toBe(original);
    expect(wrapper.pendingCount()).toBe(0); await client.$disconnect();
  });
  it("sanitizes only a trusted structured native40001 COMMIT error", () => {
    const original = new DriverAdapterError({ kind: "TransactionWriteConflict", originalCode: "40001",
      originalMessage: "Synthetic private payload must not be copied" });
    const result = transactionError(original);
    expect(result).toMatchObject({ code: "40001" });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(result).not.toBe(original);
  });
  it("preserves confirmed query40001 transport without treating generic P2034 as proof", () => {
    const native = new DriverAdapterError({ kind: "TransactionWriteConflict", originalCode: "40001" });
    const wrapped = new Prisma.PrismaClientKnownRequestError("Synthetic private query context", {
      code: "P2034", clientVersion: "6.19.3", meta: { driverAdapterError: native },
    });
    expect(transactionError(wrapped)).toMatchObject({ code: "40001" });
    expect(JSON.stringify(transactionError(wrapped))).not.toContain("private");
  });
  it.each([
    new DriverAdapterError({ kind: "TransactionWriteConflict", originalCode: "40P01" }),
    new DriverAdapterError({ kind: "UniqueConstraintViolation", originalCode: "23505", constraint: { fields: ["id"] } }),
    new Prisma.PrismaClientKnownRequestError("Synthetic40001 message", { code: "P2034", clientVersion: "6.19.3" }),
    new Prisma.PrismaClientKnownRequestError("Synthetic40001 message", { code: "P2002", clientVersion: "6.19.3" }),
    new Error("Synthetic message-only40001"),
    { name: "DriverAdapterError", cause: { kind: "TransactionWriteConflict", originalCode: "40001" } },
  ])("retains non-authoritative/nonserialization classification unchanged: %#", original => {
    expect(transactionError(original)).toBe(original);
  });
});
