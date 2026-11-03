"""Reconstruct public-boundary observations without executing application work."""
import json
from pathlib import Path

ROOT = Path(__file__).parent
SOURCES = ["ccee6927", "9b6401dc", "02734303", "a2ebf9b6"]
result = []
for suffix in SOURCES:
    source = ROOT / f"write-admission-feasibility-2026-11-03-{suffix}.json"
    data = json.loads(source.read_text(encoding="utf-8"))
    for observation in data["observations"]:
        if not observation["check"].startswith("nested"):
            continue
        request = "nested-read" if observation["check"] == "nested-unrelated-read" else "deadline-read"
        events = [e for e in observation["events"] if e["request"] == request]
        def at(stage):
            return next((e["atMs"] for e in events if e["stage"] == stage), None)
        def elapsed(start, end):
            a, b = at(start), at(end)
            return None if a is None or b is None else b - a
        begin = next((e["atMs"] for e in events if e["stage"] == "query-start" and e["operation"] == "BEGIN"), None)
        callback = at("callback-entry")
        error = next((e for e in events if e["stage"] == "transaction-error-before-test-cleanup"), None)
        observed_deadline = next((e for e in events if e["stage"] == "observed-deadline-while-checkout-pending"), None)
        selection = [e for e in events if e["stage"] in ["attempt-selected", "fifo-enqueue", "admission-acquired"]]
        row = {"source": source.name, "recordedAt": data["recordedAt"], "check": observation["check"],
               "passed": observation.get("passed"), "failure": observation.get("failure"),
               "primary": observation.get("primary"), "selectionOrAdmissionEvents": len(selection),
               "transactionCallToCallbackMs": elapsed("transaction-start", "callback-entry"),
               "checkoutMs": elapsed("pool-checkout-start", "pool-checkout-result"),
               "physicalConnectMs": elapsed("physical-connect-start", "physical-connect-result"),
               "beginToCallbackMs": None if begin is None or callback is None else callback - begin,
               "callbackMs": elapsed("callback-entry", "callback-exit"),
               "rejectionFromTransactionCallMs": elapsed("transaction-start", "transaction-error-before-test-cleanup"),
               "poolCheckoutCompletedAfterRejection": None if error is None else at("pool-checkout-result") > error["atMs"],
               "beginAfterRejection": None if error is None or begin is None else begin > error["atMs"],
               "observedActiveStageAtRejection": "pool-checkout" if observed_deadline else None,
               "observedPoolWaitingAtDeadline": observed_deadline.get("poolWaiting") if observed_deadline else None,
               "engineProvidedSubtype": error["error"]["engineProvidedSubtype"] if error else None,
               "driverQueryOperations": [e["operation"] for e in events if e["stage"] == "query-start"],
               "callbackEntries": sum(e["stage"] == "callback-entry" for e in events),
               "cleanup": observation["cleanup"], "cleanupErrors": observation.get("cleanupErrors", [])}
        assert not selection
        assert observation["cleanup"]["pending"] == observation["cleanup"]["admissionOwners"] == observation["cleanup"]["admissionWaiters"] == 0
        if request == "deadline-read":
            assert row["callbackEntries"] == 0
            assert row["poolCheckoutCompletedAfterRejection"] and row["beginAfterRejection"]
            assert row["driverQueryOperations"] == ["BEGIN", "SET", "ROLLBACK"]
        result.append(row)

destination = ROOT / "nested-read-analysis-2026-11-03.json"
with destination.open("x", encoding="utf-8", newline="\n") as output:
    json.dump({"method": "Consecutive public monotonic boundaries, not sum of overlapping phases; no server-only attribution",
               "historicalTimeouts": "Unclassified; neither elapsed time nor current successful startup reclassifies old failures",
               "initialObserverLimit": "ccee6927 missed proof-instance pool checkout; no checkout inference is made for that artifact",
               "cases": result}, output, indent=2)
    output.write("\n")
print(json.dumps(result, indent=2))
