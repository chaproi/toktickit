"""Offline allowlisted phase analysis. Intervals overlap and must not be added."""
import json, math, collections
from pathlib import Path
ROOT = Path(__file__).parent

def stats(values):
    values = sorted(values)
    return {"n": len(values), "p50": values[math.ceil(len(values)*.5)-1], "p95": values[math.ceil(len(values)*.95)-1], "max": values[-1]} if values else None

def analyze(path):
    d = json.loads(path.read_text(encoding="utf-8")); grouped = collections.defaultdict(list)
    for event in d["events"]: grouped[event["request"]].append(event)
    rows = []
    for response in d["responses"]:
        events = grouped[response["id"]]
        def first(stage): return next((e["atMs"] for e in events if e["stage"] == stage), None)
        def span(a,b):
            a,b=first(a),first(b)
            return b-a if a is not None and b is not None else None
        starts={e["queryId"]:e for e in events if e["stage"]=="query-start"}
        pairs=[(starts[e["queryId"]],e) for e in events if e["stage"]=="query-end" and e["queryId"] in starts]
        callback, end=first("callback-entry"),first("callback-exit")
        query_pairs=[(s,e) for s,e in pairs if callback is not None and callback<=s["atMs"] and e["atMs"]<=end]
        updated=next((e["atMs"] for s,e in pairs if s["operation"]=="UPDATE" and s["kind"]=="Action"),None)
        receipt=next((s["atMs"] for s,e in pairs if s["operation"]=="INSERT" and s["kind"]=="MutationReceipt"),None)
        projection=[(s,e) for s,e in query_pairs if updated is not None and receipt is not None and updated<s["atMs"]<receipt and s["operation"]=="SELECT"]
        intervals={"dispatchToHttpEntry":span("http-dispatch","http-entry"), "httpEntryToTransactionCall":span("http-entry","transaction-start"),
          "transactionStartup":span("transaction-start","callback-entry"), "callback":span("callback-entry","callback-exit"),
          "callbackExitToTransactionResult":span("callback-exit","transaction-result"),
          "transactionResultToHttpResult":span("transaction-result","http-result"),
          "projectionSpan":max((e["atMs"] for s,e in projection),default=0)-min((s["atMs"] for s,e in projection),default=0) if projection else None}
        checkout_intervals=[]
        waiting=[]
        for event in events:
            if event["stage"]=="checkout-start": waiting.append(event["atMs"])
            elif event["stage"]=="checkout-result" and waiting: checkout_intervals.append(event["atMs"]-waiting.pop(0))
        rows.append({**response,"intervalsMs":intervals,
          "pretransactionQueries":dict(collections.Counter(s["kind"]+"."+s["operation"] for s,e in pairs if s["attempt"]==0)),
          "callbackQueries":len(query_pairs),"projectionSelects":[s["kind"] for s,e in projection],
          "resourceWaitsMs":[e["atMs"]-s["atMs"] for s,e in pairs if s["kind"].startswith("resource-")],
          "checkoutIntervalsMs":checkout_intervals,
          "commitObservedMs":[e["atMs"]-s["atMs"] for s,e in pairs if s["kind"]=="commit"],
          "errorEvents":[e for e in events if e["stage"]=="transaction-error-before-test-cleanup"]})
    return {"source":path.name,"executionHead":d["executionHead"],"phase":d["phase"],"plan":d.get("plan"),
      "statusCounts":dict(collections.Counter(str(r["status"]) for r in rows)),"runtime":d.get("runtime"),"cleanup":d["cleanup"],
      "phaseDistributions":{op:{field:stats([r["intervalsMs"][field] for r in rows if r["operation"]==op and r["intervalsMs"][field] is not None]) for field in rows[0]["intervalsMs"]} for op in sorted(set(r["operation"] for r in rows))},
      "warning":"Observed client intervals include scheduling/network/driver work; nested intervals overlap. No SQL-only attribution or causal benchmark estimate.","requests":rows}

if __name__ == "__main__":
    results=[analyze(p) for p in sorted(ROOT.glob("patch-chain-phases-*.json"))]
    original=json.loads((ROOT/"t47-performance-2026-11-04-measurement-2e8762bf.json").read_text())
    measured=[s for s in original["samples"] if s["phase"]=="measured"]
    slow=[s for s in measured if s["durationMs"]>=500]
    assert len(slow)==26 and all(s["operation"]=="action.start" for s in slow)
    chains=[[{k:s[k] for k in ["user","sequence","operation","startMs","durationMs","status"]} for s in measured if s["user"]==u and s["operation"] in ["action.edit","action.start","action.complete","action.cancel"]] for u in range(20,50)]
    output={"originalSlowCount":26,"originalMeasuredChains":chains,"diagnostics":results}
    (ROOT/"patch-chain-analysis-2026-11-04.json").write_text(json.dumps(output,indent=2)+"\n",encoding="utf-8")
    print({"diagnostics":len(results),"requests":[len(r["requests"]) for r in results]})
