import { describe, expect, it } from "vitest";
import { formatTicketNumber } from "../../src/tickets/ticket-number.js";

describe("Ticket Number generation", () => {
  it("UNIT-01 formats the annual sequence as TKT-YYYY-NNNNN", () => {
    expect(formatTicketNumber(2026, 1)).toBe(
      "TKT-2026-00001",
    );

    expect(formatTicketNumber(2026, 42)).toBe(
      "TKT-2026-00042",
    );

    expect(formatTicketNumber(2026, 99999)).toBe(
      "TKT-2026-99999",
    );
  });

  it("starts the displayed sequence at 00001 for a new year", () => {
    expect(formatTicketNumber(2026, 1)).toBe(
      "TKT-2026-00001",
    );

    expect(formatTicketNumber(2027, 1)).toBe(
      "TKT-2027-00001",
    );
  });

  it("produces different numbers for consecutive sequences", () => {
    const first = formatTicketNumber(2026, 1);
    const second = formatTicketNumber(2026, 2);

    expect(first).not.toBe(second);
    expect(second).toBe("TKT-2026-00002");
  });
});