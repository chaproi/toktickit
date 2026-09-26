import type { TicketStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import * as validation from "../../src/tickets/ticket-validation.js";

type WorkflowContract = {
  allowedStatusTransitions?: (status: TicketStatus) => TicketStatus[];
  statusRequiresOwner?: (status: TicketStatus) => boolean;
  canUnassignTicket?: (status: TicketStatus) => boolean;
  validateStaffOwnerMutation?: (body: unknown) => unknown;
  validateStaffPriorityMutation?: (body: unknown) => unknown;
  validateStaffStatusMutation?: (body: unknown) => unknown;
};

const workflow = validation as WorkflowContract;

describe("UNIT-05 Staff Ticket workflow rules", () => {
  it("defines the complete transition matrix and terminal states", () => {
    const transitions = workflow.allowedStatusTransitions;
    expect(transitions).toBeTypeOf("function");
    expect(transitions?.("NEW")).toEqual(["OPEN", "CANCELLED"]);
    expect(transitions?.("OPEN")).toEqual(["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"]);
    expect(transitions?.("IN_PROGRESS")).toEqual(["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"]);
    expect(transitions?.("WAITING_FOR_REQUESTER")).toEqual(["IN_PROGRESS", "RESOLVED", "CANCELLED"]);
    expect(transitions?.("RESOLVED")).toEqual(["CLOSED", "REOPENED"]);
    expect(transitions?.("REOPENED")).toEqual(["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"]);
    expect(transitions?.("CLOSED")).toEqual([]);
    expect(transitions?.("CANCELLED")).toEqual([]);
  });

  it("keeps nullable storage separate from transition owner requirements and unassign rules", () => {
    expect(workflow.statusRequiresOwner).toBeTypeOf("function");
    for (const status of ["OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED"] as TicketStatus[]) {
      expect(workflow.statusRequiresOwner?.(status)).toBe(true);
    }
    expect(workflow.statusRequiresOwner?.("CANCELLED")).toBe(false);
    expect(workflow.canUnassignTicket).toBeTypeOf("function");
    expect(["NEW", "OPEN", "REOPENED"].filter((status) => workflow.canUnassignTicket?.(status as TicketStatus)))
      .toEqual(["NEW", "OPEN", "REOPENED"]);
    expect(["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "CANCELLED"]
      .some((status) => workflow.canUnassignTicket?.(status as TicketStatus))).toBe(false);
  });

  it("rejects unknown fields, malformed versions, priorities, confirmations, and cancellation reasons", () => {
    expect(workflow.validateStaffOwnerMutation).toBeTypeOf("function");
    expect(workflow.validateStaffPriorityMutation).toBeTypeOf("function");
    expect(workflow.validateStaffStatusMutation).toBeTypeOf("function");
    expect(workflow.validateStaffOwnerMutation?.({ ownerId: 1, expectedUpdatedAt: "bad", extra: true }))
      .toMatchObject({ success: false });
    expect(workflow.validateStaffPriorityMutation?.({ itPriority: "CRITICAL", expectedUpdatedAt: new Date().toISOString() }))
      .toMatchObject({ success: false });
    expect(workflow.validateStaffStatusMutation?.({ targetStatus: "CANCELLED", confirm: true, reason: "no", expectedUpdatedAt: new Date().toISOString() }))
      .toMatchObject({ success: false });
  });
});
