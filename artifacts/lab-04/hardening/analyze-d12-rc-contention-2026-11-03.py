"""Offline, redacted D-12 candidate analysis; no database/network/business calls.

Run from the repository root with Python3. Uses exact retained diagnostic files,
not T-47 samples. Every response contributes to its group. Intervals are matched
by request and attempt; overlapping interval percentiles must never be summed.
"""
import collections
import json
import math
from pathlib import Path

BASE = Path(__file__).resolve().parent


def quantiles(values):
    ordered = sorted(values)
    if not ordered:
        return {"n": 0}
    return {"n": len(ordered), "p50Ms": ordered[math.ceil(.5 * len(ordered)) - 1],
            "p95Ms": ordered[math.ceil(.95 * len(ordered)) - 1], "maximumMs": ordered[-1]}


def analyze(filename, hot=False):
    data = json.loads((BASE / filename).read_text(encoding="utf-8"))
    rows = data["results" if hot else "responses"]
    events = data["events"]
    writes = {row["request"] for row in rows if
              (row["request"].startswith("hot-write") if hot else row["operation"] == "create")}
    result = {"artifact": filename, "notT47": True,
              "statuses": dict(collections.Counter(str(row["status"]) for row in rows)),
              "cleanup": data["cleanup"],
              "writes": quantiles([row["elapsedMs"] for row in rows if row["request"] in writes]),
              "reads": quantiles([row["elapsedMs"] for row in rows if row["request"] not in writes])}
    phases = collections.defaultdict(list)
    query_counts = []
    for request in sorted(writes):
        selected = [event for event in events if event.get("request") == request and event.get("attempt") == 1]
        for start, end, label in [("checkout-start", "checkout-result", "checkout"),
                                  ("callback-entry", "callback-exit", "callback"),
                                  ("finish-before-cleanup", "finish-drained", "drain"),
                                  ("begin-start", "begin-result", "begin")]:
            starts = [event["atMs"] for event in selected if event["stage"] == start]
            ends = [event["atMs"] for event in selected if event["stage"] == end]
            if len(starts) == len(ends) == 1:
                phases[label].append(ends[0] - starts[0])
        queries = {event["queryId"]: event for event in selected if event["stage"] == "query-start"}
        for event in selected:
            if event["stage"] == "query-end" and event["queryId"] in queries and event.get("kind", "").startswith("resource-"):
                phases[event["kind"]].append(event["atMs"] - queries[event["queryId"]]["atMs"])
        starts = [event["atMs"] for event in selected if event["stage"] == "callback-entry"]
        ends = [event["atMs"] for event in selected if event["stage"] == "callback-exit"]
        if starts and ends:
            query_counts.append(sum(event["stage"] == "query-start" and starts[0] <= event["atMs"] <= ends[-1] for event in selected))
    result["matchedAttemptPhaseIntervals"] = {key: quantiles(values) for key, values in phases.items()}
    result["callbackQueryCounts"] = {"minimum": min(query_counts), "maximum": max(query_counts), "n": len(query_counts)}
    result["intervalQualification"] = "Matched request-local/attempt-local intervals only; overlapping phases are not summed. Diagnostic observation adds cost; not performance acceptance."
    if hot:
        result.update(observedHotWaiters=data["hotWaiters"], heldPool=data["heldPool"], exactPersistence=data["exactPersistence"])
    return result


if __name__ == "__main__":
    recorded = json.loads((BASE / "d12-rc-contention-analysis-2026-11-03.json").read_text(encoding="utf-8"))
    actual = [analyze("create-critical-path-2026-11-03-df2a866c.json"),
              analyze("command-hot-resource-2026-11-03-77faf7cf.json", True)]
    assert actual == recorded["cohorts"], "Recorded phase/count/percentile analysis differs from raw evidence"
    print(json.dumps({"cohortsVerified": len(actual), "allResponsesRetained": True, "T47Executed": False}))
