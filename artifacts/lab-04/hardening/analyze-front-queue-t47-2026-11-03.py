"""Validate every retained benchmark sample offline, without repeating traffic."""
import hashlib
import json
import math
from collections import Counter
from pathlib import Path

directory = Path(__file__).resolve().parent
source = directory / "t47-performance-2026-11-03-measurement-e9510798.json"
r = json.loads(source.read_text(encoding="utf-8"))
assert r["executionHead"] == "3683daa5d28587e1d205246571619f8817288030"
assert r["trackedWorkingTreeCleanAtStart"] and r["mode"] == "measurement"
assert len(r["samples"]) == 5500


def summarize(samples):
    values = sorted(s["durationMs"] for s in samples)
    failed = [s for s in samples if s["status"] != s["expectedStatus"] or s["transportError"] or s["semanticError"]]
    return {"count": len(samples), "errors": len(failed), "errorRate": len(failed) / len(samples),
            "p50Ms": values[math.ceil(.5 * len(values)) - 1], "p95Ms": values[math.ceil(.95 * len(values)) - 1],
            "maxMs": values[-1], "statuses": dict(Counter(str(s["status"]) for s in samples))}


phases = {}
for phase, count in [("warmup", 100), ("measured", 10)]:
    samples = [s for s in r["samples"] if s["phase"] == phase]
    assert len(samples) == count * 50
    for user in range(50):
        ordered = sorted((s for s in samples if s["user"] == user), key=lambda s: s["sequence"])
        assert [s["sequence"] for s in ordered] == list(range(count))
        assert all(a["startMs"] + a["durationMs"] <= b["startMs"] for a, b in zip(ordered, ordered[1:]))
    summary = summarize(samples)
    for key in summary:
        assert summary[key] == r[phase][key], (phase, key)
    operations = {}
    for operation in sorted({s["operation"] for s in samples}):
        value = summarize([s for s in samples if s["operation"] == operation])
        for key in value:
            assert value[key] == r[phase]["operations"][operation][key], (phase, operation, key)
        operations[operation] = value
    throughput = len(samples) * 1000 / r[phase]["elapsedMs"]
    assert throughput == r[phase]["throughputPerSecond"]
    assert r[phase]["peakHttpInFlight"] == 50 and r[phase]["finalHttpInFlight"] == 0
    phases[phase] = {**summary, "elapsedMs": r[phase]["elapsedMs"], "throughputPerSecond": throughput,
                     "peakHttpInFlight": 50, "operations": operations}

expected_mix = {"requester.ticket.detail": 40, "requester.dashboard": 40, "requester.tickets.list": 20,
                "requester.tickets.filtered-list": 20, "comments.list": 40, "ticket.actions.list": 20,
                "comments.create": 20, "staff.ticket.detail": 30, "staff.dashboard": 30, "staff.tickets.list": 30,
                "staff.actions.list": 30, "action.create": 30, "action.detail": 30, "action.edit": 30,
                "action.start": 30, "action.complete": 15, "action.cancel": 15, "action.history": 30}
assert {op: value["count"] for op, value in phases["measured"]["operations"].items()} == expected_mix
assert r["expectedFixtureAfter"] == dict(tickets=2050, actions=8330, actionHistory=25320,
                                        ticketHistory=3800, receipts=1320, comments=220, users=50, sessions=50)
assert r["fixtureAfter"] == dict(tickets=2050, actions=8222, actionHistory=24880,
                                ticketHistory=3800, receipts=880, comments=220, users=50, sessions=50)
assert all(r["cleanup"].values()) and r["primaryFailure"] is None and r["cleanupFailure"] is None
assert r["receiptReplays"] == 0
failures = [s for s in r["samples"] if s["status"] != s["expectedStatus"] or s["transportError"] or s["semanticError"]]
assert all(s["phase"] == "warmup" and s["transportError"] is None and s["semanticError"] is None for s in failures)
first = []
for user in range(50):
    rows = sorted((s for s in failures if s["user"] == user), key=lambda s: s["sequence"])
    if rows:
        first.append({k: rows[0][k] for k in ["user", "sequence", "operation", "status", "errorCode"]})
assert len(first) == 30 and all(row["status"] == 500 for row in first)
assert len(r["transactionFailures"]) == 138
assert all(f["code"] == "P2028" and f["confirmedSqlStates"] == [] for f in r["transactionFailures"])
mutations = {"action.create", "action.edit", "action.start", "action.complete", "action.cancel"}
successful = sum(s["operation"] in mutations and s["status"] == s["expectedStatus"] for s in r["samples"])
assert successful == 880 == r["fixtureAfter"]["receipts"]
assert r["fixtureAfter"]["actionHistory"] - r["fixtureBefore"]["actionHistory"] == successful
analysis = {"source": source.name, "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "executionHead": r["executionHead"], "method": "Nearest rank ceil(p*n)-1; all5500 samples, failures and per-user sequences retained; no HTTP retries",
            "command": {"text": "server/: npm.cmd test -- tests/lab-04/performance-smoke.integration.test.ts",
                        "startedAt": "2026-11-03T05:25:59.8429526Z", "finishedAt": "2026-11-03T05:27:16.3828984Z",
                        "exitCode": 1, "files": 1, "collected": 1, "executed": 1, "passed": 0, "failed": 1, "skipped": 0,
                        "wallSeconds": 76.5429459, "frameworkSeconds": 75.47, "caseElapsedMs": r["totalCaseElapsedMs"]},
            "phases": phases, "perUserSequencesAndMeasuredMixValid": True,
            "failureClasses": [{"status": status, "code": code, "count": n} for (status, code), n in Counter((s["status"], s["errorCode"]) for s in failures).items()],
            "firstUnexpectedByStart": min(failures, key=lambda s: s["startMs"]), "firstUnexpectedPerUser": first,
            "http500Operations": dict(Counter(s["operation"] for s in failures if s["status"] == 500)),
            "transactionFailures": {"count": 138, "code": "P2028", "confirmedSqlStates": [],
                                    "transactionSubtypeRetained": False, "metaPhaseRetained": False,
                                    "classification": "Unclassified; duration is not proof of startup/admission versus execution expiry"},
            "expectedFixtureAfter": r["expectedFixtureAfter"], "observedFixtureAfter": r["fixtureAfter"],
            "successfulMutationSamples": successful, "persistedTotalsMatch": False, "receiptReplays": 0,
            "target": r["target"], "measuredOperationP95Failures": [op for op, v in phases["measured"]["operations"].items() if v["p95Ms"] >= 500],
            "inlineReached": ["primary/cleanup error assertions", "all cleanup flags", "persisted counts assertion (fails)"],
            "inlineUnreached": ["receipt replay assertion", "phase/per-user counts", "concurrency/mix", "warmup/measured zero-error assertions", "aggregate/per-operation p95 assertions"],
            "artifactDerivedOnly": ["all5500 counts/sequences/mix/concurrency/percentiles", "zero receipt replay", "target verdicts", "aggregate success-count reconciliation"],
            "cleanup": r["cleanup"],
            "verdict": "FAILED: warmup errors, missing expected domain writes, aggregate p95 and9/18 operation p95 targets fail despite zero measured errors",
            "limitations": ["One local Windows source-runtime measurement, not production capacity or controlled causal A/B",
                            "480 INVALID_ACTION_ID and14 terminal/status conflicts occur after earlier command failures; do not relabel all632 failures as independent primary faults",
                            "Aggregate mutation counts agree with880 successful samples, but do not prove every per-attempt rollback or request-to-error attribution",
                            "Historical P2028s remain unclassified; no new runtime phase diagnosis or tuning is executed",
                            "Accepted failed-start metadata retention and15 untriaged dependency findings remain"]}
destination = directory / "front-queue-t47-analysis-2026-11-03.json"
encoded = json.dumps(analysis, indent=2) + "\n"
if destination.exists():
    assert destination.read_text(encoding="utf-8") == encoded, "Refusing to overwrite evidence"
else:
    destination.write_text(encoded, encoding="utf-8")
print(json.dumps({"analysis": destination.name, "warmupErrors": phases["warmup"]["errors"],
                  "measuredErrors": phases["measured"]["errors"], "measuredP95Ms": phases["measured"]["p95Ms"],
                  "operationP95Failures": len(analysis["measuredOperationP95Failures"]), "successfulMutationSamples": successful}, indent=2))
