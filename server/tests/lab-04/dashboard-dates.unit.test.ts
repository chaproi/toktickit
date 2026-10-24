import { afterEach, describe, expect, it, vi } from "vitest";
import { getRequesterDashboard } from "../../src/dashboards/requester-dashboard-service.js";

// File-isolated clock/business-result simulation through the existing public
// service. This is calendar evidence for partial AC-27/T-27, not PostgreSQL
// snapshot, timestamp-predicate or authentication-clock evidence.
const boundary = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("../../src/prisma.js", () => ({
  getPrisma: () => ({ $transaction: boundary.transaction }),
}));

afterEach(() => { vi.resetAllMocks(); });

const cases = [
  {
    label: "ordinary day: immediately before Bangkok midnight",
    asOf: "2026-05-13T16:59:59.999Z",
    from: "2026-05-06T17:00:00.000Z", before: "2026-05-13T17:00:00.000Z",
  },
  {
    label: "ordinary day: at Bangkok midnight",
    asOf: "2026-05-13T17:00:00.000Z",
    from: "2026-05-07T17:00:00.000Z", before: "2026-05-14T17:00:00.000Z",
  },
  {
    label: "June to July: immediately before Bangkok midnight",
    asOf: "2026-06-30T16:59:59.999Z",
    from: "2026-06-23T17:00:00.000Z", before: "2026-06-30T17:00:00.000Z",
  },
  {
    label: "June to July: at Bangkok midnight",
    asOf: "2026-06-30T17:00:00.000Z",
    from: "2026-06-24T17:00:00.000Z", before: "2026-07-01T17:00:00.000Z",
  },
  {
    label: "2025 to 2026: immediately before Bangkok midnight",
    asOf: "2025-12-31T16:59:59.999Z",
    from: "2025-12-24T17:00:00.000Z", before: "2025-12-31T17:00:00.000Z",
  },
  {
    label: "2025 to 2026: at Bangkok midnight",
    asOf: "2025-12-31T17:00:00.000Z",
    from: "2025-12-25T17:00:00.000Z", before: "2026-01-01T17:00:00.000Z",
  },
  {
    label: "leap February 28 to 29: immediately before Bangkok midnight",
    asOf: "2024-02-28T16:59:59.999Z",
    from: "2024-02-21T17:00:00.000Z", before: "2024-02-28T17:00:00.000Z",
  },
  {
    label: "leap February 28 to 29: at Bangkok midnight",
    asOf: "2024-02-28T17:00:00.000Z",
    from: "2024-02-22T17:00:00.000Z", before: "2024-02-29T17:00:00.000Z",
  },
  {
    label: "leap February 29 to March 1: immediately before Bangkok midnight",
    asOf: "2024-02-29T16:59:59.999Z",
    from: "2024-02-22T17:00:00.000Z", before: "2024-02-29T17:00:00.000Z",
  },
  {
    label: "leap February 29 to March 1: at Bangkok midnight",
    asOf: "2024-02-29T17:00:00.000Z",
    from: "2024-02-23T17:00:00.000Z", before: "2024-03-01T17:00:00.000Z",
  },
  {
    label: "non-leap February 28 to March 1: immediately before Bangkok midnight",
    asOf: "2025-02-28T16:59:59.999Z",
    from: "2025-02-21T17:00:00.000Z", before: "2025-02-28T17:00:00.000Z",
  },
  {
    label: "non-leap February 28 to March 1: at Bangkok midnight",
    asOf: "2025-02-28T17:00:00.000Z",
    from: "2025-02-22T17:00:00.000Z", before: "2025-03-01T17:00:00.000Z",
  },
] as const;

describe("API-08 seven Bangkok calendar days through the public Dashboard service", () => {
  it.each(cases)("$label", async ({ asOf, from, before }) => {
    const clock = new Date(asOf);
    const originalInstant = clock.getTime();
    const transaction = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      $queryRaw: vi.fn().mockResolvedValue([{ asOf: clock }]),
      ticket: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
      ticketStatusHistory: { groupBy: vi.fn().mockResolvedValue([]) },
    };
    boundary.transaction.mockImplementation(async (read: (value: typeof transaction) => Promise<unknown>) =>
      read(transaction));

    const result = await getRequesterDashboard(47, {
      search: "", categoryId: null, relatedSystemId: null,
      requestedPriority: null, itPriority: null, currentStatus: null,
    });

    expect(result.timezone).toBe("Asia/Bangkok");
    expect(result.asOf).toBe(asOf);
    expect(result.recentWindow).toEqual({ from, before });
    expect(clock.getTime()).toBe(originalInstant);
    expect(clock.toISOString()).toBe(asOf);
    expect(Date.parse(result.recentWindow.before) - Date.parse(result.recentWindow.from)).toBe(604_800_000);
    expect(result.recentWindow.before).not.toBe(asOf);
    expect(Date.parse(result.recentWindow.from)).not.toBe(originalInstant - 604_800_000);
  });
});
