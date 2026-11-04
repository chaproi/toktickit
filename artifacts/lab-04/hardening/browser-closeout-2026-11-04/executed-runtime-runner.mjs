import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
const root=process.cwd(); const priv=join(process.env.TEMP,'toktickit49-browser-closeout-20261104');
const req=createRequire(resolve(root,'server/package.json')); const {Client}=req('pg');
const {configureTestDatabaseEnvironment}=await import(pathToFileURL(resolve(root,'server/src/testing/test-database.ts')).href);
process.env.NODE_ENV='test'; const identity=configureTestDatabaseEnvironment({environmentFilePath:resolve(root,'server/.env')});
const client=new Client({connectionString:process.env.TEST_DATABASE_URL}); await client.connect();
let schema;
try {
 const live=(await client.query('SELECT current_database() AS database')).rows[0];
 if(live.database!==identity.databaseName) throw Error('Live dedicated target mismatch');
 const names=(await client.query("SELECT nspname FROM pg_namespace WHERE nspname ~ '^issue27_suite_[a-f0-9]{32}$'")).rows;
 const candidates=[];
 for(const {nspname} of names){
  const table=(await client.query('SELECT to_regclass($1) AS present',[`"${nspname}"."AuthSession"`])).rows[0]; if(!table.present)continue;
  const result=await client.query(`SELECT max(s."lastSeenAt") AS last FROM "${nspname}"."AuthSession" s JOIN "${nspname}"."User" u ON u.id=s."userId" WHERE u.email=$1`,['mina.patel@example.com']);
  if(result.rows[0].last)candidates.push({schema:nspname,last:new Date(result.rows[0].last).getTime()});
 }
 candidates.sort((a,b)=>b.last-a.last);
 if(!candidates.length || Date.now()-candidates[0].last>86400000)throw Error('No recent owned review runtime identity');
 if(candidates[1]?.last===candidates[0].last)throw Error('Ambiguous runtime target'); schema=candidates[0].schema;
 console.log(JSON.stringify({guardPassed:true,liveDedicatedDatabaseMatches:true,distinctFromOperational:true,preparedSchemaPattern:true,recentReviewSession:true,schemaValuesWithheld:true}));
} finally {await client.end();}
const url=new URL(process.env.TEST_DATABASE_URL); url.searchParams.set('schema',schema);
process.env.DATABASE_URL=url.href;process.env.TEST_DATABASE_URL=url.href;process.env.TOKTICKIT_ISSUE27_TEST_SCHEMA=schema;
const attempt=process.argv[2]??'attempt-1'; if(!/^attempt-[0-9]+$/.test(attempt))throw Error('Invalid attempt');process.env.TOKTICKIT_CLOSEOUT_ATTEMPT=attempt;
const config=join(priv,'playwright.config.mjs');
writeFileSync(config,'export default '+JSON.stringify({testDir:resolve(root,'e2e'),testMatch:'lab-04/review-closeout.spec.ts',fullyParallel:false,workers:1,retries:0,timeout:60000,expect:{timeout:10000},reporter:'line',outputDir:join(priv,attempt+'-results'),use:{baseURL:'http://127.0.0.1:4173',viewport:{width:1440,height:900},screenshot:'off',trace:'off',video:'off'}},null,2)+';\n');
const start=new Date(); const clock=performance.now();
const run=spawnSync(process.execPath,[resolve(root,'node_modules/@playwright/test/cli.js'),'test','--config',config],{env:process.env,cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:10000000});
writeFileSync(join(priv,attempt+'.log'),(run.stdout??'')+'\n'+(run.stderr??''));
const result={attempt,command:'node --env-file=server/.env --import tsx <private guarded runner> '+attempt,executionHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),startedAt:start.toISOString(),finishedAt:new Date().toISOString(),elapsedMs:performance.now()-clock,exitCode:run.status,signal:run.signal,workers:1,retries:0,caseBudgetMs:60000,expectBudgetMs:10000,reusedExistingRuntime:true};
writeFileSync(join(priv,attempt+'.json'),JSON.stringify(result,null,2)+'\n');
console.log(run.stdout);console.log(run.stderr);console.log(JSON.stringify(result));process.exitCode=run.status??1;
