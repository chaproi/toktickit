import { describe, expect, it } from "vitest";
import * as receiptModule from "../../src/actions/action-receipt.js";

// Planned pure public interface: isReceiptKeyConflict(error: unknown): boolean.
// Namespace access to the EXISTING module preserves test collection when this
// new export is absent. No stub/fallback implements its production behavior.
const planned = receiptModule as typeof receiptModule & { isReceiptKeyConflict?: (error: unknown) => boolean };
const constraint = "MutationReceipt_actorId_clientMutationId_key";
const prisma = (meta?: unknown) => ({ code: "P2002", ...(meta === undefined ? {} : { meta }) });

describe("AC-42/T-51 positive receipt constraint classification (D-12/D-13)", () => {
  it.each([
    { label: "observed Prisma model and exact target array", error: prisma({ modelName: "MutationReceipt", target: ["actorId", "clientMutationId"] }) },
    { label: "Prisma model and exact physical target name", error: prisma({ modelName: "MutationReceipt", target: constraint }) },
    { label: "native PostgreSQL constraint identity", error: { code: "23505", constraint } },
    { label: "native PostgreSQL constraint plus correct table", error: { code: "23505", constraint, table: "MutationReceipt" } },
  ])("accepts $label", ({ error }) => {
    expect(typeof planned.isReceiptKeyConflict, "Planned receipt-key classifier export").toBe("function");
    expect(planned.isReceiptKeyConflict!(error)).toBe(true);
  });

  it.each([
    { label: "null", error: null }, { label: "undefined", error: undefined },
    { label: "string", error: constraint }, { label: "number", error: 23505 },
    { label: "bare P2002", error: prisma() }, { label: "bare 23505", error: { code: "23505" } },
    { label: "missing model", error: prisma({ target: ["actorId", "clientMutationId"] }) },
    { label: "other model", error: prisma({ modelName: "ActionHistory", target: ["actorId", "clientMutationId"] }) },
    { label: "other model with same physical name", error: prisma({ modelName: "User", target: constraint }) },
    { label: "missing target", error: prisma({ modelName: "MutationReceipt" }) },
    { label: "other target", error: prisma({ modelName: "MutationReceipt", target: ["id"] }) },
    { label: "incomplete composite target", error: prisma({ modelName: "MutationReceipt", target: ["actorId"] }) },
    { label: "extra target field", error: prisma({ modelName: "MutationReceipt", target: ["actorId", "clientMutationId", "ticketId"] }) },
    { label: "unrelated named constraint", error: prisma({ modelName: "MutationReceipt", target: "ActionHistory_actionId_actionVersion_key" }) },
    { label: "ambiguous comma string", error: prisma({ modelName: "MutationReceipt", target: "actorId,clientMutationId" }) },
    { label: "null metadata", error: prisma(null) },
    { label: "wrong-type target", error: prisma({ modelName: "MutationReceipt", target: 23505 }) },
    { label: "unrelated PostgreSQL constraint", error: { code: "23505", constraint: "User_email_key" } },
    { label: "conflicting PostgreSQL table", error: { code: "23505", constraint, table: "User" } },
    { label: "deadlock", error: { code: "40P01", constraint } },
    { label: "serialization error", error: { code: "40001", constraint } },
    { label: "ambiguous P2034", error: { code: "P2034", meta: { modelName: "MutationReceipt", target: ["actorId", "clientMutationId"] } } },
    { label: "P2002 message-only match", error: { code: "P2002", message: constraint } },
    { label: "23505 message-only match", error: { code: "23505", message: constraint } },
    { label: "ordinary Error message-only match", error: new Error(`P2002 23505 ${constraint}`) },
  ])("rejects $label", ({ error }) => {
    expect(typeof planned.isReceiptKeyConflict, "Planned receipt-key classifier export").toBe("function");
    expect(planned.isReceiptKeyConflict!(error)).toBe(false);
  });
});
