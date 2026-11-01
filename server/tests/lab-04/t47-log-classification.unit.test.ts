import { expect, it } from "vitest";
import { classifyDiagnosticLog } from "./t47-log-classification.js";

it("classifies an explicit server SQLSTATE for the exact known backend without exporting SQL", () => {
  const result = classifyDiagnosticLog("2026-11-01 21:05:23 [123] ERROR:  40001: could not serialize access due to read/write dependencies among transactions\n2026-11-01 21:05:23 [123] STATEMENT: COMMIT", new Map([[123, "B1"]]));
  expect(result).toEqual([{ backend: "B1", correlation: "owned-backend-pid", sqlState: "40001", category: "read-write-dependencies", statementKind: "COMMIT" }]);
});
it("retains the time-only prefix attribution limitation rather than inventing a PID match", () => {
  const result = classifyDiagnosticLog("2026-11-01 21:05:23 +07 ERROR:  40001: could not serialize access due to read/write dependencies among transactions\n2026-11-01 21:05:23 +07 DETAIL:  Reason code: Canceled on identification as a pivot, during commit attempt.\n2026-11-01 21:05:23 +07 LOCATION:  PreCommit_CheckForSerializationFailure, predicate.c:000\n2026-11-01 21:05:23 +07 STATEMENT:  COMMIT", new Map([[123, "B1"]]));
  expect(result).toEqual([{ backend: null, correlation: "bounded-log-window-no-pid", sqlState: "40001", category: "read-write-dependencies", reason: "pivot-during-commit", location: "PreCommit_CheckForSerializationFailure", statementKind: "COMMIT" }]);
});
it("excludes another backend and refuses message-only/error-code guesses", () => {
  expect(classifyDiagnosticLog("[999] ERROR:  40001: other backend\n[123] LOG: P2034; message mentions 40001", new Map([[123, "B1"]]))).toEqual([]);
});
