import { describe, expect, it } from "vitest";
import { rejectionEvidence } from "./create-contention-evidence.js";

describe("safe request-local CREATE rejection evidence (not retry policy)", () => {
  it("distinguishes an explicitly executed gate restart from completion failure", () => {
    const error = Object.assign(new Error("private SQL and credential values"), { code: "40001" });
    expect(rejectionEvidence(error, true, false)).toEqual({ sqlStates: ["40001"], prismaCodes: [], boundary: "explicit-gate-restart" });
    expect(rejectionEvidence(error, false, true)).toEqual({ sqlStates: ["40001"], prismaCodes: [], boundary: "transaction-completion" });
  });
  it("does not infer a SQLSTATE from an opaque P2034 or its message", () => {
    expect(rejectionEvidence({ code: "P2034", message: "40001 serialization failure" }, false, true))
      .toEqual({ sqlStates: [], prismaCodes: ["P2034"], boundary: "transaction-completion" });
  });
  it("retains a raw-query code separately from structured SQLSTATE", () => {
    expect(rejectionEvidence({ code: "P2010", meta: { code: "40001", query: "private" } }, false, false))
      .toEqual({ sqlStates: ["40001"], prismaCodes: ["P2010"], boundary: "callback-query" });
  });
  it("does not relabel deadlock, uniqueness or unknown failures as serialization", () => {
    for (const code of ["40P01", "23505", "P0001"]) {
      expect(rejectionEvidence({ cause: { code } }, false, false).sqlStates).toEqual([code]);
    }
    expect(rejectionEvidence(new Error("40001"), false, false).sqlStates).toEqual([]);
  });
  it("isolates concurrent projections and handles cyclic causes without exporting private data", async () => {
    const cyclic: { code: string; cause?: unknown; tokenHash: string } = { code: "40001", tokenHash: "private" };
    cyclic.cause = cyclic;
    const rows = await Promise.all([cyclic, { code: "40P01", meta: { passwordHash: "private" } }]
      .map(async error => rejectionEvidence(error, false, true)));
    expect(rows.map(row => row.sqlStates)).toEqual([["40001"], ["40P01"]]);
    expect(JSON.stringify(rows)).not.toMatch(/private|tokenHash|passwordHash|stack/u);
  });
});
