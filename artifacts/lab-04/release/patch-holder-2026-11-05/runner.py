from pathlib import Path
import os,sys,json,subprocess,time,datetime,shutil,traceback
P=Path(__file__).resolve().parent;R=Path((P/'root.txt').read_text('utf-8'));label=sys.argv[1];tests={'patch':'tests/lab-04/action-patch-projection.integration.test.ts'}
if label not in tests:raise SystemExit('Unknown diagnostic')
result=P/(label+'-result.json');journal=P/(label+'-journal.json');log=P/(label+'-raw.log');report=P/(label+'-vitest.json')
if any(x.exists()for x in [result,journal,log,report]):raise SystemExit('Refusing evidence overwrite')
args=['test','--',tests[label],'--reporter=default','--reporter=json','--outputFile='+str(report)];npm=shutil.which('npm.cmd');comspec=os.environ['COMSPEC'];start=time.monotonic();events=[];child=None;state={'label':label,'command':'npm.cmd '+' '.join(args),'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=R,text=True).strip(),'runnerPid':os.getpid(),'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'outerSafetyBudgetSeconds':300,'noTestOrTransactionBudgetChanges':True,'outputMode':'binary direct-to-file; no buffered communicate/maxBuffer','events':events}
def save(event,**extra):
 events.append({'event':event,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'elapsedSeconds':time.monotonic()-start,**extra});tmp=journal.with_suffix('.tmp');tmp.write_text(json.dumps(state,indent=2)+'\n',encoding='utf-8');os.replace(tmp,journal)
save('runner-start')
try:
 command='"'+comspec+'" /d /s /c ""'+npm+'" '+' '.join(args)+'"'
 with log.open('xb')as stream:
  child=subprocess.Popen(command,cwd=R/'server',stdout=stream,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW)
  state['childPid']=child.pid;save('spawned')
  while child.poll()is None:
   if time.monotonic()-start>=300:
    save('outer-safety-deadline',childStillRunning=True)
    subprocess.run(['taskkill','/PID',str(child.pid),'/T','/F'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=False);child.wait();state['outerDeadlineTriggered']=True;break
   time.sleep(5);save('heartbeat',logBytes=log.stat().st_size,childStillRunning=child.poll()is None)
  state['exitCode']=child.returncode;save('child-exit',exitCode=child.returncode)
except BaseException as e:
 state['runnerException']={'name':type(e).__name__,'errno':getattr(e,'errno',None),'winerror':getattr(e,'winerror',None)};save('runner-exception',classification=state['runnerException'])
finally:
 state['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();state['elapsedSeconds']=time.monotonic()-start;state['childStillRunning']=bool(child and child.poll()is None);save('runner-finished');result.write_text(json.dumps(state,indent=2)+'\n',encoding='utf-8')
