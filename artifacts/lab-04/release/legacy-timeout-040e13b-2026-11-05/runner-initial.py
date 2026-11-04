from pathlib import Path
import os,sys,json,subprocess,time,datetime,shutil,signal
P=Path(__file__).resolve().parent;R=Path((P/'root.txt').read_text('utf-8'));label=sys.argv[1]
if label not in ['types','legacy','full']:raise SystemExit('Unknown allowed command')
log=P/(label+'-raw.log');journal=P/(label+'-journal.json');result=P/(label+'-result.json');report=P/(label+'-vitest.json');directory=P/label;directory.mkdir(exist_ok=True)
if any(x.exists()for x in [log,journal,result,report]):raise SystemExit('Refuse execution/evidence overwrite')
base=['exec','--','tsc','--noEmit']if label=='types'else['test','--']+(['tests/lab-04/legacy-actions.integration.test.ts']if label=='legacy'else['--exclude','tests/lab-04/performance-smoke.integration.test.ts'])
args=base+([]if label=='types'else['--reporter=default','--reporter=json','--outputFile='+str(report)])
state={'label':label,'command':'npm.cmd '+' '.join(args),'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=R,text=True).strip(),'sourceState':'production unchanged; explicit test-only legacy diagnostic delta','runnerPid':os.getpid(),'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'outerSafetyBudgetSeconds':3600 if label=='full'else300,'signalsObserved':[],'outputMode':'binary direct file; no output buffer/maxBuffer','events':[]};start=time.monotonic();child=None
# Non-finite OS kill cannot execute Python finally; durable heartbeats/PIDs remain.
def save(kind,**extra):
 state['events'].append({'event':kind,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'atMs':(time.monotonic()-start)*1000,**extra});tmp=journal.with_suffix('.tmp');tmp.write_text(json.dumps(state,indent=2)+'\n',encoding='utf-8');os.replace(tmp,journal)
def terminate_owned():
 if child is not None and child.poll()is None:
  save('terminate-owned-child-tree',childPid=child.pid);subprocess.run(['taskkill','/PID',str(child.pid),'/T','/F'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=False);child.wait()
def on_signal(number,frame):
 state['signalsObserved'].append(number);save('runner-signal',number=number);terminate_owned();raise SystemExit(128+number)
for name in ['SIGINT','SIGTERM','SIGBREAK']:
 if hasattr(signal,name):signal.signal(getattr(signal,name),on_signal)
save('runner-start')
try:
 npm=shutil.which('npm.cmd');command='"'+os.environ['COMSPEC']+'" /d /s /c ""'+npm+'" '+' '.join(args)+'"';env=os.environ.copy();env['TOKTICKIT_LEGACY_DIAGNOSTIC_DIRECTORY']=str(directory)
 if label=='full':env['TOKTICKIT_RECOVERY_WEED_EXE']=str(P/'tools/weed.exe')
 with log.open('xb')as output:
  child=subprocess.Popen(command,cwd=R/'server',env=env,stdout=output,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW);state['childPid']=child.pid;save('spawned')
  while child.poll()is None:
   if time.monotonic()-start>=state['outerSafetyBudgetSeconds']:
    state['outerSafetyDeadlineTriggered']=True;save('outer-safety-deadline');terminate_owned();break
   time.sleep(5);save('heartbeat',logBytes=log.stat().st_size,childStillRunning=child.poll()is None)
  state['exitCode']=child.returncode;save('child-exit',exitCode=child.returncode,exitKind='Windows native process exit; no POSIX signal inference')
except BaseException as e:
 state['runnerException']={'name':type(e).__name__,'errno':getattr(e,'errno',None),'winerror':getattr(e,'winerror',None)};save('runner-exception',classification=state['runnerException']);terminate_owned()
finally:
 state['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();state['elapsedSeconds']=time.monotonic()-start;state['childStillRunning']=bool(child and child.poll()is None);save('runner-finished');result.write_text(json.dumps(state,indent=2)+'\n',encoding='utf-8')
