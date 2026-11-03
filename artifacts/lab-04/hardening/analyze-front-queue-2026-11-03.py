"""Reproduce the bounded before/after comparison offline; never sends traffic."""
import hashlib
import json
import math
from collections import Counter
from pathlib import Path

directory = Path(__file__).resolve().parent


def stats(values):
    values = sorted(values)
    return {"count": len(values), "p50Ms": round(values[math.ceil(.5 * len(values)) - 1], 6),
            "p95Ms": round(values[math.ceil(.95 * len(values)) - 1], 6),
            "maxMs": round(values[-1], 6), "sumMs": round(sum(values), 6)}


def analyze(name):
    source = directory / name
    raw = json.loads(source.read_text(encoding="utf-8"))
    assert raw["phase"] == "verified" and raw["successfulWrites"] == 30
    assert raw["cleanup"] == {"listenerClosed": True, "checkedOut": 0, "ownedSchemaRemoved": True}
    assert Counter((r["operation"], r["status"]) for r in raw["preparationResponses"]) == {
        ("detail", 200): 30, ("create", 201): 30, ("start", 200): 30}
    assert len(raw["responses"]) == 54 and all(r["status"] == 200 and r["error"] is None for r in raw["responses"])
    assert len({r["id"] for r in raw["responses"]}) == 54
    assert raw["before"] == dict(tickets=2050, actions=8030, actionHistory=24060, ticketHistory=3800,
                               receipts=60, comments=0, users=50, sessions=30)
    assert raw["after"] == {**raw["before"], "actionHistory": 24090, "receipts": 90}
    phases = {"preCheckoutIncludingQueue": ("transaction-start", "checkout-start"),
              "checkout": ("checkout-start", "checkout-result"),
              "admissionWait": ("admission-wait-start", "admission-acquired"),
              "startup": ("transaction-start", "callback-entry"),
              "callback": ("callback-entry", "callback-exit"), "commit": ("commit-query-start", "commit-query-end"),
              "callbackDrainMarker": ("callback-exit", "callback-drained"),
              "callbackExitToRelease": ("callback-exit", "physical-release"),
              "admissionHold": ("admission-acquired", "unlock-query-end")}
    attempts = []
    for i in range(30):
        request = f"complete-{i}"
        events = [e for e in raw["events"] if e["request"] == request]
        starts = [e for e in events if e["stage"] == "transaction-start"]
        assert len(starts) == 1 and starts[0]["attempt"] == 1
        result = [e for e in events if e["stage"] == "transaction-result" and e["attempt"] == 1]
        assert len(result) == 1
        window = [e for e in events if e["attempt"] == 1 and starts[0]["atMs"] <= e["atMs"] <= result[0]["atMs"]]
        releases = [e for e in window if e["stage"] == "physical-release"]
        assert len(releases) == 1
        window = [e for e in window if e["atMs"] <= releases[0]["atMs"]]
        times = {}
        for stage in {s for pair in phases.values() for s in pair}:
            selected = [e["atMs"] for e in window if e["stage"] == stage]
            assert len(selected) == 1, (request, stage)
            times[stage] = selected[0]
        values = {key: times[b] - times[a] for key, (a, b) in phases.items()}
        assert all(v >= 0 for v in values.values())
        assert times["callback-drained"] <= times["commit-query-start"] <= times["physical-release"]
        attempts.append({"request": request, **{key: round(value, 6) for key, value in values.items()}})
    errors = [e for e in raw["events"] if e["stage"].endswith("-error")]
    assert errors == []
    return {"source": name, "sha256": hashlib.sha256(source.read_bytes()).hexdigest(), "executionHead": raw["executionHead"],
            "phase": raw["phase"], "before": raw["before"], "after": raw["after"],
            "http": {prefix: stats([r["elapsedMs"] for r in raw["responses"] if r["id"].startswith(prefix)]) for prefix in ["baseline-", "overlap-", "complete-"]},
            "phases": {key: stats([a[key] for a in attempts]) for key in phases}, "attempts": attempts,
            "poolAndDatabase": {"samples": len(raw["poolAndDatabaseSamples"]),
                                "maxima": {key: max(s[key] for s in raw["poolAndDatabaseSamples"]) for key in ["total", "idle", "waiting", "waiters", "owners"]}},
            "errors": errors, "cleanup": raw["cleanup"]}


analysis = {"method": "Offline nearest-rank ceil(p*n)-1; every response retained; no additional request or application execution",
            "before": analyze("complete-phases-2026-11-03-0c00b65a.json"),
            "candidate": analyze("complete-phases-2026-11-03-7dd92bd7.json"),
            "limitations": ["Candidate cohort passes inside failed command06; unrelated new cumulative-budget fixture fails, so its whole-command verdict stays failed.",
                            "Candidate executes at RED HEAD9f8523e with pending production/coordination bytes later committed, not exact-post-GREEN-commit execution.",
                            "Timing differences are local diagnostic observations, not controlled capacity/performance acceptance or exact causal latency deltas.",
                            "Pre-checkout includes local queue and other startup overhead; the unchanged instrumentation does not expose pure queue time.",
                            "Pool and native lock samples are non-atomic. Last-client-frame labels after physical release are excluded from phase pairing.",
                            "The synchronous callback-drained marker covers awaited business work, not arbitrary background tasks.",
                            "Both cohorts contain60 post-response validation reads on the application pool, in addition to the diagnostic HTTP reads.",
                            "No P2028 occurs in either natural cohort; historical benchmark P2028s remain unclassified.",
                            "Serial admission hold time remains; local queue changes occupancy rather than removing cross-process serialization."]}
assert analysis["before"]["poolAndDatabase"]["maxima"]["waiters"] == 16
assert analysis["candidate"]["poolAndDatabase"]["maxima"]["waiters"] == 0
path = directory / "front-queue-cohort-analysis-2026-11-03.json"
encoded = json.dumps(analysis, indent=2) + "\n"
if path.exists():
    assert path.read_text(encoding="utf-8") == encoded, "Refusing to overwrite different evidence"
else:
    path.write_text(encoded, encoding="utf-8")
print(json.dumps({"artifact": path.name, "before": analysis["before"]["poolAndDatabase"],
                  "candidate": analysis["candidate"]["poolAndDatabase"],
                  "candidateAdmissionHoldMs": analysis["candidate"]["phases"]["admissionHold"]}, indent=2))
