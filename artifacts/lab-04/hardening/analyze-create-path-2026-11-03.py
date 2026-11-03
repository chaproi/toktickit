"""Offline, non-overlapping critical paths; no database or HTTP activity."""
import json
import math
import sys
from collections import Counter
from pathlib import Path


def union(intervals):
    merged = []
    for start, end in sorted(intervals):
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(end, merged[-1][1])
        else:
            merged.append([start, end])
    return sum(end - start for start, end in merged)


def stats(values):
    ordered = sorted(values)
    return {"count": len(values), "sumMs": sum(values),
            "p50Ms": ordered[math.ceil(len(values) * .50) - 1],
            "p95Ms": ordered[math.ceil(len(values) * .95) - 1], "maxMs": ordered[-1]}


def analyze(source):
    data = json.loads(source.read_text(encoding="utf-8-sig"))
    creates = [r for r in data["responses"] if r["operation"] == "create"]
    # The label in the committed diagnostic is action-create.
    if not creates:
        creates = [r for r in data["responses"] if r["step"] == 4 and r["role"] != "REQUESTER"]
    events = data["events"]
    holders = []
    for grant in (e for e in events if e["stage"] == "fifo-grant"):
        release = next(e for e in events if e["stage"] == "fifo-release-start"
                       and e["request"] == grant["request"] and e["attempt"] == grant["attempt"])
        holders.append({"request": grant["request"], "attempt": grant["attempt"],
                        "fromMs": grant["atMs"], "beforeMs": release["atMs"],
                        "holdMs": release["atMs"] - grant["atMs"]})
    holders.sort(key=lambda h: h["fromMs"])
    rows = []
    for response in creates:
        own = [e for e in events if e["request"] == response["request"] and e["attempt"] == 1]
        def event(stage):
            return next(e for e in own if e["stage"] == stage)
        names = ["transaction-start", "fifo-enqueue", "fifo-grant", "checkout-start", "checkout-result",
                 "admission-acquired", "begin-start", "begin-result", "callback-entry", "callback-exit",
                 "finish-before-cleanup", "physical-release", "fifo-release-start", "fifo-release-end", "transaction-result"]
        points = [("http-start", response["startedMs"])] + [(n, event(n)["atMs"]) for n in names]
        points.append(("http-end", response["startedMs"] + response["elapsedMs"]))
        assert all(b[1] >= a[1] for a, b in zip(points, points[1:])), response["request"]
        partitions = [{"from": a[0], "to": b[0], "elapsedMs": b[1] - a[1]}
                      for a, b in zip(points, points[1:])]
        assert abs(sum(p["elapsedMs"] for p in partitions) - response["elapsedMs"]) < 1e-6
        enqueue, grant = event("fifo-enqueue")["atMs"], event("fifo-grant")["atMs"]
        predecessors = [{**h, "overlapWithThisWaitMs": min(h["beforeMs"], grant) - max(h["fromMs"], enqueue)}
                        for h in holders if h["request"] != response["request"]
                        and min(h["beforeMs"], grant) > max(h["fromMs"], enqueue)]
        covered = union([(max(h["fromMs"], enqueue), min(h["beforeMs"], grant)) for h in predecessors])
        queries = []
        for start in (e for e in own if e["stage"] == "query-start"):
            end = next(e for e in own if e["stage"] == "query-end" and e["queryId"] == start["queryId"])
            queries.append({"queryId": start["queryId"], "kind": start["kind"], "operation": start["operation"],
                            "stage": start["inStage"], "fromMs": start["atMs"], "beforeMs": end["atMs"],
                            "elapsedMs": end["atMs"] - start["atMs"], "error": end["error"]})
        callback_queries = [q for q in queries if q["stage"] == "callback"]
        inserted = next(q for q in callback_queries if q["kind"] == "Action" and q["operation"] == "INSERT")
        projection = [q for q in callback_queries if q["fromMs"] > inserted["fromMs"]
                      and q["operation"] == "SELECT" and q["kind"] in ["Action", "User"]]
        projection_union = union([(q["fromMs"], q["beforeMs"]) for q in projection])
        pretransaction = []
        for start in (e for e in events if e["request"] == response["request"] and e["attempt"] == 0
                      and e["stage"] == "query-start" and e["atMs"] < points[1][1]):
            end = next(e for e in events if e["stage"] == "query-end" and e["queryId"] == start["queryId"])
            pretransaction.append({"queryId": start["queryId"], "kind": start["kind"], "operation": start["operation"],
                                   "fromMs": start["atMs"], "beforeMs": end["atMs"],
                                   "elapsedMs": end["atMs"] - start["atMs"]})
        rows.append({"request": response["request"], "status": response["status"], "elapsedMs": response["elapsedMs"],
                     "points": dict(points), "nonOverlappingPartitions": partitions,
                     "fifoWaitMs": grant - enqueue, "precedingHolderIntervals": predecessors,
                     "waitCoveredByHoldersMs": covered, "waitOutsideHolderIntervalsMs": grant - enqueue - covered,
                     "callbackQueryCount": len(callback_queries), "callbackQueries": callback_queries,
                     "callbackQueryIntervalUnionMs": union([(q["fromMs"], q["beforeMs"]) for q in callback_queries]),
                     "postInsertProjectionQueryCount": len(projection), "projectionQueryIntervalUnionMs": projection_union,
                     "preTransactionQueries": pretransaction,
                     "preTransactionQueryIntervalUnionMs": union([(q["fromMs"], q["beforeMs"]) for q in pretransaction]),
                     "allAttemptQueries": queries})
    return {"source": source.name, "executionHead": data["executionHead"],
            "percentile": "nearest rank ceil(n*p), all CREATE responses retained",
            "responseCounts": dict(Counter(f'{r["operation"]}:{r["status"]}' for r in data["responses"])),
            "httpCreate": stats([r["elapsedMs"] for r in rows]),
            "fifoWait": stats([r["fifoWaitMs"] for r in rows]), "holder": stats([h["holdMs"] for h in holders]),
            "callback": stats([r["points"]["callback-exit"] - r["points"]["callback-entry"] for r in rows]),
            "driverCalls": dict(Counter(e["stage"] for e in events)), "holders": holders, "creates": rows,
            "errors": [e for e in events if "error" in e and e["error"] is not None],
            "cleanup": data["cleanup"],
            "limitations": ["Observer adds Promise/ALS/sampling overhead; local first wave, not T-47.",
                            "Query intervals include client queue/network/server/scheduling; no server-only allocation.",
                            "Parallel query durations use interval union, never summed into wall time.",
                            "Caller waits overlap; aggregate wait sums are not elapsed wall time.",
                            "No expiry/P2028 in this cohort; historical benchmark P2028 remains unclassified."]}


if __name__ == "__main__":
    source = Path(sys.argv[1])
    result = analyze(source)
    destination = Path(sys.argv[2])
    with destination.open("x", encoding="utf-8", newline="\n") as output:
        json.dump(result, output, indent=2)
        output.write("\n")
    print(json.dumps({k: result[k] for k in ["httpCreate", "fifoWait", "holder", "callback", "responseCounts", "cleanup"]}))
