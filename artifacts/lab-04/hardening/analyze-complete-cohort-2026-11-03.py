"""Offline checks only; no application imports, requests or database access."""
import hashlib
import json
import math
from collections import Counter
from pathlib import Path

directory = Path(__file__).resolve().parent
source = directory / "complete-phases-2026-11-03-0c00b65a.json"
raw = json.loads(source.read_text(encoding="utf-8"))
assert raw["executionHead"] == "99dc50cc6b49b930691d68bc0d8f23b2d3f6ff65"
assert raw["phase"] == "verified" and raw["successfulWrites"] == 30
assert raw["cleanup"] == {"listenerClosed": True, "checkedOut": 0, "ownedSchemaRemoved": True}
assert Counter((r["operation"], r["status"]) for r in raw["preparationResponses"]) == {
    ("detail", 200): 30, ("create", 201): 30, ("start", 200): 30}
for ordinal in range(30):
    assert [r["operation"] for r in raw["preparationResponses"] if r["ordinal"] == ordinal] == ["detail", "create", "start"]
assert len(raw["responses"]) == 54
assert {r["id"] for r in raw["responses"]} == {
    *[f"baseline-{i}" for i in range(4)], *[f"overlap-{i}" for i in range(20)], *[f"complete-{i}" for i in range(30)]}
assert all(r["status"] == 200 and r["error"] is None for r in raw["responses"])
assert raw["before"] == dict(tickets=2050, actions=8030, actionHistory=24060, ticketHistory=3800,
                           receipts=60, comments=0, users=50, sessions=30)
assert raw["after"] == {**raw["before"], "actionHistory": 24090, "receipts": 90}


def stats(values):
    values = sorted(values)
    assert values
    return {"count": len(values), "minMs": round(values[0], 6),
            "p50Ms": round(values[math.ceil(.5 * len(values)) - 1], 6),
            "p95Ms": round(values[math.ceil(.95 * len(values)) - 1], 6),
            "maxMs": round(values[-1], 6), "sumMs": round(sum(values), 6)}


phase_pairs = {
    "poolCheckout": ("checkout-start", "checkout-result"),
    "admissionWait": ("admission-wait-start", "admission-acquired"),
    "startupToCallback": ("transaction-start", "callback-entry"),
    "adapterBegin": ("begin-start", "begin-result"),
    "callback": ("callback-entry", "callback-exit"),
    "commit": ("commit-query-start", "commit-query-end"),
    "callbackDrainMarker": ("callback-exit", "callback-drained"),
    "callbackExitToPhysicalRelease": ("callback-exit", "physical-release"),
    "admissionHeldClientObserved": ("admission-acquired", "unlock-query-end"),
    "publicTransaction": ("transaction-start", "transaction-result"),
}
attempts = []
outside_release_events = 0
after_release_checkouts = 0
for i in range(30):
    request = f"complete-{i}"
    all_events = [e for e in raw["events"] if e["request"] == request]
    starts = [e for e in all_events if e["stage"] == "transaction-start"]
    assert len(starts) == 1 and starts[0]["attempt"] == 1
    end = [e for e in all_events if e["stage"] == "transaction-result" and e["attempt"] == 1]
    assert len(end) == 1
    public_window = [e for e in all_events if e["attempt"] == 1 and starts[0]["atMs"] <= e["atMs"] <= end[0]["atMs"]]
    release = [e for e in public_window if e["stage"] == "physical-release"]
    assert len(release) == 1
    window = [e for e in public_window if e["atMs"] <= release[0]["atMs"]]
    outside_release_events += sum(e["stage"] == "physical-release" and e not in public_window for e in all_events if e["attempt"] == 1)
    after_release_checkouts += sum(e["stage"] == "checkout-result" and e["atMs"] > release[0]["atMs"] for e in public_window)
    stages = {stage for pair in phase_pairs.values() for stage in pair}
    times = {"transaction-result": end[0]["atMs"]}
    for stage in stages:
        if stage == "transaction-result":
            continue
        selected = [e["atMs"] for e in window if e["stage"] == stage]
        assert len(selected) == 1, (request, stage, len(selected))
        times[stage] = selected[0]
    deltas = {key: times[b] - times[a] for key, (a, b) in phase_pairs.items()}
    assert all(v >= 0 for v in deltas.values())
    assert times["callback-drained"] <= times["commit-query-start"] <= times["unlock-query-end"] <= times["physical-release"]
    attempts.append({"request": request, "attempt": 1,
                     "startMs": times["transaction-start"], "endMs": times["transaction-result"],
                     "phaseMs": {key: round(value, 6) for key, value in deltas.items()}})

samples = raw["poolAndDatabaseSamples"]
saturated = [s for s in samples if s["total"] == 17 and s["idle"] == 0 and s["waiters"] == 16 and s["owners"] == 1 and s["waiting"] > 0]
assert saturated
read_checkouts = []
for request in sorted({e["request"] for e in raw["events"] if e["request"].startswith(("baseline-", "overlap-"))}):
    for attempt in sorted({e["attempt"] for e in raw["events"] if e["request"] == request}):
        frame = [e for e in raw["events"] if e["request"] == request and e["attempt"] == attempt]
        starts = [e["atMs"] for e in frame if e["stage"] == "checkout-start"]
        ends = [e["atMs"] for e in frame if e["stage"] == "checkout-result"]
        assert len(starts) == len(ends)
        for start, end in zip(starts, ends):
            assert end >= start
            read_checkouts.append({"request": request, "attempt": attempt, "fromMs": start, "beforeMs": end,
                                   "durationMs": round(end - start, 6),
                                   "saturatedSampleCount": sum(start <= s["atMs"] <= end for s in saturated)})

representative = next(c for c in read_checkouts if c["request"] == "overlap-12" and c["saturatedSampleCount"])
preceding_release = max((e for e in raw["events"] if e["stage"] == "physical-release"
                        and e["request"].startswith("complete-") and e["attempt"] == 1
                        and representative["fromMs"] <= e["atMs"] <= representative["beforeMs"]), key=lambda e: e["atMs"])
errors = [e for e in raw["events"] if e["stage"].endswith("-error")]
assert errors == []
http = {prefix: stats([r["elapsedMs"] for r in raw["responses"] if r["id"].startswith(prefix)])
        for prefix in ["baseline-", "overlap-", "complete-"]}
by_operation = {op: {prefix: stats([r["elapsedMs"] for r in raw["responses"]
                                   if r["operation"] == op and r["id"].startswith(prefix)])
                     for prefix in ["baseline-", "overlap-"]} for op in ["detail", "dashboard", "tickets", "actions"]}
analysis = {
    "source": source.name, "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    "executionHead": raw["executionHead"], "method": "Offline only; nearest rank ceil(p*n)-1; all diagnostic responses retained; no latency filtering",
    "command": {"from": "server/", "text": "npm.cmd test -- tests/lab-04/complete-contention.integration.test.ts",
                "startedAt": "2026-11-03T04:30:55.7417770Z", "finishedAt": "2026-11-03T04:31:25.6910929Z",
                "exitCode": 0, "files": 1, "collected": 1, "executed": 1, "passed": 1, "failed": 0, "skipped": 0,
                "wallSeconds": 29.951943, "frameworkSeconds": 28.71, "caseSeconds": 23.551},
    "preparation": {"identities": 50, "realSessions": 30, "detail200": 30, "create201": 30, "start200": 30},
    "observedHttp": {"complete200": 30, "baselineRead200": 4, "overlapRead200": 20, "unexpected": 0},
    "before": raw["before"], "after": raw["after"], "httpMs": http, "readOperationsMs": by_operation,
    "completePhasesMs": {key: stats([a["phaseMs"][key] for a in attempts]) for key in phase_pairs},
    "attempts": attempts, "readCheckouts": read_checkouts,
    "readCheckoutMs": {prefix: stats([c["durationMs"] for c in read_checkouts if c["request"].startswith(prefix)])
                       for prefix in ["baseline-", "overlap-"]},
    "poolAndDatabase": {"sampleCount": len(samples), "maxima": {key: max(s[key] for s in samples) for key in ["total", "idle", "waiting", "waiters", "owners"]},
                        "saturatedSampleCount": len(saturated), "firstSaturated": saturated[0], "lastSaturated": saturated[-1]},
    "representativeRead": {**representative, "precedingRelease": preceding_release,
                           "releaseToCheckoutMs": round(representative["beforeMs"] - preceding_release["atMs"], 6)},
    "errorEvents": errors, "observedP2028": 0,
    "attribution": {"exactlyOneReleaseInEachCompleteTransactionWindow": True,
                    "outsideCompleteWindowReleaseEventsExcluded": outside_release_events,
                    "checkoutResultsAfterPhysicalReleaseExcluded": after_release_checkouts,
                    "limitation": "Last-client-frame fallback can retain labels for later unscoped validation reads; do not count all globally labelled releases as transaction releases. Pair COMPLETE adapter phases only between public start and the single physical release; public result closes the outer window. Read checkout pairs use FIFO inside matching request/attempt frames."},
    "samplingLimitation": "Pool counters precede the separate native lock query; snapshots are not atomic and 10ms scheduling is approximate. Client lock-hold intervals include round trips, not exact server execution time.",
    "callbackDrainLimitation": "The synchronous finally marker follows the awaited business callback; it does not independently measure arbitrary external background work.",
    "stateLimitation": "Per-Action status/version/performer and parent advancement plus aggregate history/receipt deltas are inline assertions; this is not a per-receipt fingerprint/full-history-snapshot audit.",
    "cleanup": raw["cleanup"], "independentCleanup": {"probeExitCode": 0, "ownedDisposableSchemas": 0, "otherConnections": 0, "idleTransactions": 0, "advisoryLocks": 0},
    "conclusion": "Pool-slot occupation while waiting for database admission demonstrably delays reads; serial admission hold time also contributes. No P2028 observed; historical failures remain unclassified. Front queue is a next candidate only, not implemented or performance GREEN.",
    "offlineAnalysisAttempts": [{"exitCode": 1, "cause": "Initial analyzer expected one checkout-result through public result; two frames also label a later checkout after physical release."},
                                {"exitCode": 0, "correction": "Bound adapter phases at physical release; retain public result separately. No raw events, business assertions or application source changed."}],
}
destination = directory / "complete-cohort-analysis-2026-11-03.json"
encoded = json.dumps(analysis, indent=2) + "\n"
if destination.exists():
    assert destination.read_text(encoding="utf-8") == encoded, "Refusing to overwrite different evidence"
else:
    destination.write_text(encoded, encoding="utf-8")
print(json.dumps({"analysis": destination.name, "complete": 30, "reads": 24,
                  "completeHttpMs": http["complete-"], "overlapReadHttpMs": http["overlap-"],
                  "saturatedSamples": len(saturated), "outsideWindowReleasesExcluded": outside_release_events}, indent=2))
