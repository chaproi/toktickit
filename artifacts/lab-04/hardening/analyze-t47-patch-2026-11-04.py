"""Offline checks only; does not execute HTTP, Prisma, PostgreSQL or the benchmark."""
import hashlib
import json
import math
import sys
from collections import Counter
from pathlib import Path


def analyze(path):
    raw = path.read_bytes()
    report = json.loads(raw)
    samples = report["samples"]
    mix = {
        "requester.ticket.detail": 40, "requester.dashboard": 40,
        "requester.tickets.list": 20, "requester.tickets.filtered-list": 20,
        "comments.list": 40, "ticket.actions.list": 20, "comments.create": 20,
        "staff.ticket.detail": 30, "staff.dashboard": 30, "staff.tickets.list": 30,
        "staff.actions.list": 30, "action.create": 30, "action.detail": 30,
        "action.edit": 30, "action.start": 30, "action.complete": 15,
        "action.cancel": 15, "action.history": 30,
    }
    assert len(samples) == 5500
    assert report["mode"] == "measurement"
    assert report["executionHead"] == "84ef0ad91502a0c660998ddc13d0c7a163f1a169"
    phases = {}
    for phase, count in [("warmup", 100), ("measured", 10)]:
        selected = [s for s in samples if s["phase"] == phase]
        assert len(selected) == count * 50
        for user in range(50):
            rows = sorted((s for s in selected if s["user"] == user), key=lambda s: s["sequence"])
            assert [s["sequence"] for s in rows] == list(range(count))
            role = "REQUESTER" if user < 20 else "IT_STAFF" if user < 40 else "ADMINISTRATOR"
            assert all(s["role"] == role for s in rows)
            assert all(a["startMs"] + a["durationMs"] <= b["startMs"] + 1e-7
                       for a, b in zip(rows, rows[1:]))
        assert Counter(s["operation"] for s in selected) == Counter({k: v * (count // 10) for k, v in mix.items()})
        groups = {"all": selected, **{k: [s for s in selected if s["operation"] == k] for k in mix}}
        stats = {}
        for operation, rows in groups.items():
            durations = sorted(s["durationMs"] for s in rows)
            errors = sum(s["status"] != s["expectedStatus"] or bool(s["transportError"]) or bool(s["semanticError"]) for s in rows)
            values = {"count": len(rows), "errors": errors,
                      "p50Ms": durations[math.ceil(0.5 * len(rows)) - 1],
                      "p95Ms": durations[math.ceil(0.95 * len(rows)) - 1]}
            stored = report[phase] if operation == "all" else report[phase]["operations"][operation]
            for key, value in values.items():
                assert math.isclose(value, stored[key], rel_tol=1e-12, abs_tol=1e-7)
            stats[operation] = values
        events = [(s["startMs"], 1) for s in selected] + [(s["startMs"] + s["durationMs"], -1) for s in selected]
        active = peak = 0
        for _, delta in sorted(events):
            active += delta
            peak = max(peak, active)
            assert active >= 0
        assert active == 0 and peak == 50 == report[phase]["peakHttpInFlight"]
        elapsed = max(s["startMs"] + s["durationMs"] for s in selected)
        throughput = len(selected) * 1000 / elapsed
        weighted = sum(s["durationMs"] for s in selected) / elapsed
        assert math.isclose(elapsed, report[phase]["elapsedMs"], abs_tol=1e-6)
        assert math.isclose(throughput, report[phase]["throughputPerSecond"], rel_tol=1e-10)
        assert math.isclose(weighted, report[phase]["timeWeightedHttpInFlight"], rel_tol=1e-10)
        phases[phase] = {"statistics": stats, "elapsedMs": elapsed, "throughputPerSecond": throughput,
                         "peakHttpInFlight": peak, "timeWeightedHttpInFlight": weighted,
                         "finalHttpInFlight": active,
                         "statuses": dict(sorted(Counter(str(s["status"]) for s in selected).items()))}
    expected = {"tickets": 2050, "actions": 8330, "actionHistory": 25320,
                "ticketHistory": 3800, "receipts": 1320, "comments": 220, "users": 50, "sessions": 50}
    assert report["fixtureAfter"] == report["expectedFixtureAfter"] == expected
    assert sum(s["replayed"] for s in samples) == report["receiptReplays"] == 0
    assert report["primaryFailure"] is None and report["cleanupFailure"] is None
    assert all(report["cleanup"].values())
    failed = {k: v["p95Ms"] for k, v in phases["measured"]["statistics"].items() if k != "all" and v["p95Ms"] >= 500}
    return {"artifact": path.name, "sha256": hashlib.sha256(raw).hexdigest(),
            "method": "Independent Python nearest-rank percentiles and sample interval sweep; no new traffic",
            "sampleCount": len(samples), "users": 50, "perUserSequential": True,
            "roleAndOperationMixVerified": True, "phases": phases,
            "expectedAndObservedPersistence": expected, "receiptReplays": 0,
            "retainedTransactionFailureCount": len(report["transactionFailures"]),
            "measuredOperationsFailingP95": failed,
            "overallMeasuredP95Below500": phases["measured"]["statistics"]["all"]["p95Ms"] < 500,
            "verdict": "FAIL: aggregate and six operation measured p95 targets", "inlineAssertionStatus": "Not established by this offline script; see execution log and ledger"}


if __name__ == "__main__":
    artifact = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name("t47-performance-2026-11-04-measurement-b4c6eade.json")
    result = analyze(artifact)
    Path(__file__).with_name("t47-patch-analysis-2026-11-04.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print({"samples": result["sampleCount"], "failingOperations": result["measuredOperationsFailingP95"], "verdict": result["verdict"]})
