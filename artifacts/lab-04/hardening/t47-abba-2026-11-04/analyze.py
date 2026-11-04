"""Offline ABBA checks only: no HTTP, database, application import or workload."""
import collections
import hashlib
import json
import math
from pathlib import Path

ROOT=Path(__file__).parent
MIX={"requester.ticket.detail":40,"requester.dashboard":40,"requester.tickets.list":20,"requester.tickets.filtered-list":20,"comments.list":40,"ticket.actions.list":20,"comments.create":20,"staff.ticket.detail":30,"staff.dashboard":30,"staff.tickets.list":30,"staff.actions.list":30,"action.create":30,"action.detail":30,"action.edit":30,"action.start":30,"action.complete":15,"action.cancel":15,"action.history":30}
EXPECTED={"tickets":2050,"actions":8330,"actionHistory":25320,"ticketHistory":3800,"receipts":1320,"comments":220,"users":50,"sessions":50}

def stats(values):
    s=sorted(values)
    return {"count":len(s),"mean":sum(s)/len(s),**{key:s[math.ceil(q*len(s))-1] for key,q in [("p10",.1),("p25",.25),("p50",.5),("p75",.75),("p95",.95),("p99",.99)]},"minimum":s[0],"maximum":s[-1]}

def telemetry(label,execution):
    path=ROOT/label/"external-samples.json"
    base={"before":{k:execution["externalBefore"][k] for k in ["atUtc","acLine","availableRamBytes","totalRamBytes","cpuAvailable"]},"after":{k:execution["externalAfter"][k] for k in ["atUtc","acLine","availableRamBytes","totalRamBytes","cpuAvailable"]},"powerSchemeBefore":execution["powerSchemeBefore"],"powerSchemeAfter":execution["powerSchemeAfter"]}
    a,b=execution["externalBefore"],execution["externalAfter"]
    total=(b["kernel100ns"]+b["user100ns"])-(a["kernel100ns"]+a["user100ns"]);idle=b["idle100ns"]-a["idle100ns"]
    base["wholeCommandHostBusyPercentFromEndpoints"]=100*(total-idle)/total if total>0 else None
    if not path.exists():
        return {**base,"intervalSamplesAvailable":False,"reason":"Run1 sampling applied, but post-execution serializer failed; samples unavailable and not reconstructed."}
    samples=json.loads(path.read_text(encoding="utf-8"));frequency=json.loads((ROOT/"external-clock.json").read_text(encoding="utf-8-sig"))["stopwatchFrequency"]
    intervals=[]
    for a,b in zip(samples,samples[1:]):
        total=(b["kernel100ns"]+b["user100ns"])-(a["kernel100ns"]+a["user100ns"]);idle=b["idle100ns"]-a["idle100ns"]
        elapsed=(b["monotonicTicks"]-a["monotonicTicks"])/frequency
        if total<=0 or elapsed<=0:continue
        before={p["id"]:p for p in a["processes"]};after={p["id"]:p for p in b["processes"]}
        cpu={}
        for kind in ["node","postgres","powershell"]:
            # Exited processes' final unsampled CPU is unavailable. Newly
            # observed processes contribute cumulative CPU since process start.
            values=[];unavailable=0
            for pid,p in after.items():
                if p["kind"]!=kind:continue
                prior=before.get(pid,{"cpuMs":0})["cpuMs"]
                if p["cpuMs"] is None or prior is None:unavailable+=1;continue
                values.append(max(0,p["cpuMs"]-prior))
            delta=sum(values) if values else None
            cpu[kind]={"observedCpuMs":delta,"unavailableProcesses":unavailable,"availableProcesses":len(values),"oneCoreEquivalentPercent":delta/(elapsed*1000)*100 if delta is not None else None}
        intervals.append({"fromUtc":a["atUtc"],"beforeMonotonicTicks":a["monotonicTicks"],"elapsedSeconds":elapsed,"hostBusyPercent":100*(total-idle)/total,"processCpu":cpu,"newProcessCount":len(after.keys()-before.keys()),"disappearedProcessCount":len(before.keys()-after.keys())})
    weight=sum(i["elapsedSeconds"] for i in intervals)
    return {**base,"intervalSamplesAvailable":True,"samples":len(samples),"hostBusyPercent":stats([i["hostBusyPercent"] for i in intervals]),"timeWeightedHostBusyPercent":sum(i["hostBusyPercent"]*i["elapsedSeconds"] for i in intervals)/weight,"minimumAvailableRamBytes":min(s["availableRamBytes"] for s in samples),"acLineValues":sorted(set(s["acLine"] for s in samples)),"processCpuObservedMs":{kind:sum(i["processCpu"][kind]["observedCpuMs"] for i in intervals if i["processCpu"][kind]["observedCpuMs"] is not None) if any(i["processCpu"][kind]["observedCpuMs"] is not None for i in intervals) else None for kind in ["node","postgres","powershell"]},"intervals":intervals,"limitations":"Whole command, including setup/cleanup; process populations include host processes of those names. Exited-process unsampled CPU is missing. Not per-route or SQL CPU. No thermal/frequency/cross-process background attribution."}

def main():
    plan=json.loads((ROOT/"plan.json").read_text());runs=[]
    for item in plan["order"]:
        label=f"{item['run']:02}-{item['version']}";folder=ROOT/label;e=json.loads((folder/"execution.json").read_text())
        recovery=folder/"post-execution-recovery.json";final=json.loads(recovery.read_text()) if recovery.exists() else e
        p=folder/final["artifact"];d=json.loads(p.read_text());assert hashlib.sha256(p.read_bytes()).hexdigest()==final["artifactSha256"]
        assert d["executionHead"]==plan["versions"][item["version"]] and d["trackedWorkingTreeCleanAtStart"]
        assert final["safeToContinue"] and len(d["samples"])==5500
        phases={}
        for phase,count in [("warmup",100),("measured",10)]:
            selected=[s for s in d["samples"] if s["phase"]==phase];assert len(selected)==50*count
            for user in range(50):
                rows=sorted((s for s in selected if s["user"]==user),key=lambda s:s["sequence"])
                assert [s["sequence"] for s in rows]==list(range(count))
                assert all(a["startMs"]+a["durationMs"]<=b["startMs"]+1e-7 for a,b in zip(rows,rows[1:]))
                role="REQUESTER" if user<20 else "IT_STAFF" if user<40 else "ADMINISTRATOR"
                assert all(s["role"]==role for s in rows)
            assert collections.Counter(s["operation"] for s in selected)==collections.Counter({k:v*(count//10) for k,v in MIX.items()})
            groups={"aggregate":selected,**{op:[s for s in selected if s["operation"]==op] for op in MIX}}
            results={}
            for op,rows in groups.items():
                calculated=stats([s["durationMs"] for s in rows]);expected=d[phase] if op=="aggregate" else d[phase]["operations"][op]
                errors=sum(s["status"]!=s["expectedStatus"] or bool(s["transportError"]) or bool(s["semanticError"]) for s in rows)
                assert math.isclose(calculated["p50"],expected["p50Ms"],abs_tol=1e-8) and math.isclose(calculated["p95"],expected["p95Ms"],abs_tol=1e-8) and errors==expected["errors"]
                results[op]={**calculated,"errors":errors,"p95Below500":calculated["p95"]<500}
            events=[(s["startMs"],1) for s in selected]+[(s["startMs"]+s["durationMs"],-1) for s in selected]
            active=peak=0
            for _,delta in sorted(events):active+=delta;peak=max(peak,active);assert active>=0
            assert peak==50 and active==0
            elapsed=max(s["startMs"]+s["durationMs"] for s in selected)
            throughput=len(selected)*1000/elapsed;weighted=sum(s["durationMs"] for s in selected)/elapsed
            assert math.isclose(elapsed,d[phase]["elapsedMs"],abs_tol=1e-6) and math.isclose(throughput,d[phase]["throughputPerSecond"],rel_tol=1e-9) and math.isclose(weighted,d[phase]["timeWeightedHttpInFlight"],rel_tol=1e-9)
            phases[phase]={"operations":results,"elapsedMs":elapsed,"throughputPerSecond":throughput,"peak":peak,"final":active,"weightedConcurrency":weighted,"statuses":dict(collections.Counter(str(s["status"]) for s in selected))}
        assert d["fixtureAfter"]==d["expectedFixtureAfter"]==EXPECTED
        assert sum(s["replayed"] for s in d["samples"])==d["receiptReplays"]==0
        assert all(d["cleanup"].values()) and d["primaryFailure"] is None and d["cleanupFailure"] is None
        failed={op:x["p95"] for op,x in phases["measured"]["operations"].items() if op!="aggregate" and not x["p95Below500"]}
        expectedExit=0 if phases["measured"]["operations"]["aggregate"]["p95Below500"] and not failed else 1
        assert e["exit"]==expectedExit
        runs.append({"label":label,"version":item["version"],"executionHead":d["executionHead"],"artifact":str(p.relative_to(ROOT)),"sha256":hashlib.sha256(p.read_bytes()).hexdigest(),"startedAtUtc":e["startedAtUtc"],"finishedAtUtc":e["finishedAtUtc"],"exit":e["exit"],"commandSeconds":e["seconds"],"testSummary":e["testSummary"],"phases":phases,"failedMeasuredOperations":failed,"expectedAndObservedPersistence":EXPECTED,"retainedTransactionFailures":d["transactionFailures"],"inlineAssertions":{"beforeAggregate":"executed/passed","aggregate":"passed" if phases["measured"]["operations"]["aggregate"]["p95Below500"] else "executed/failed","combinedPerOperation":"unreached" if not phases["measured"]["operations"]["aggregate"]["p95Below500"] else ("executed/failed" if failed else "passed")},"external":telemetry(label,e)})
    versions={}
    for v in ["A","B"]:
        rows=[r for r in runs if r["version"]==v];vals=[r["phases"]["measured"]["operations"]["aggregate"]["p95"] for r in rows]
        versions[v]={"aggregateMeasuredP95Observations":vals,"withinVersionRangeMs":max(vals)-min(vals),"withinVersionMaxMinRatio":max(vals)/min(vals),"passCount":sum(r["exit"]==0 for r in rows),"observations":2}
    output={"method":"Independent all-sample nearest-rank distributions, role/mix/sequences, interval concurrency/throughput and literal persisted-state checks; no new traffic","runs":runs,"versionDescriptions":versions,"totalWarmup":20000,"totalMeasured":2000,"comparisonLimitations":["Only two observations/version; no broad statistical confidence or definitive environmental cause","Run1 external one-second samples lost after completion; before/after telemetry retained and original serializer failure preserved","ABBA order fixed, but wall-clock conditions/cache/scheduling are not fully controlled; observer CPU is whole-command","All outcomes retained; no replacement workload or production/settings change"]}
    (ROOT/"analysis.json").write_text(json.dumps(output,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"runs":4,"samples":22000,"versions":versions}))

if __name__=="__main__":main()
