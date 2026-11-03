import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
const require=createRequire(resolve('package.json')), {Client}=require('pg');
const {configureTestDatabaseEnvironment}=await import(pathToFileURL(resolve('src/testing/test-database.ts')).href);
const e={...process.env},identity=configureTestDatabaseEnvironment({environment:e,environmentFilePath:resolve('.env')});
if(new URL(e.TOKTICKIT_DEVELOPMENT_DATABASE_URL).pathname===new URL(e.TEST_DATABASE_URL).pathname)throw new Error('Distinct dedicated database required; values withheld');
const c=new Client({connectionString:e.TEST_DATABASE_URL});
try {await c.connect(); const live=(await c.query('SELECT current_database() AS db,current_schema() AS schema')).rows[0];
if(live.db!==identity.databaseName || live.schema!==identity.schema)throw new Error('Live isolation guard mismatch; values withheld');
const row=(await c.query(`SELECT
(SELECT count(*)::int FROM pg_namespace WHERE nspname LIKE 'issue44_lab4_%' OR nspname LIKE 'issue49_%') AS owned_schemas,
(SELECT count(*)::int FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()) AS other_connections,
(SELECT count(*)::int FROM pg_stat_activity WHERE datname=current_database() AND state='idle in transaction') AS idle_transactions,
(SELECT count(*)::int FROM pg_locks WHERE database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND locktype='advisory') AS advisory_locks,
(SELECT count(*)::int FROM "AuthSession") AS sessions,
(SELECT count(*)::int FROM "User" WHERE email LIKE 'issue49-read-%' OR email LIKE 'issue49-t47-%') AS read_and_benchmark_users,
(SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND (c.relname LIKE 'issue49_%' OR c.relname LIKE 'issue44_%' OR c.relname LIKE 'workflow46_cascade_%')) AS owned_relations,
(SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=current_schema() AND (p.proname LIKE 'issue49_%' OR p.proname LIKE 'issue44_%' OR p.proname LIKE 'workflow46_cascade_%')) AS owned_functions,
(SELECT count(*)::int FROM pg_trigger WHERE tgname LIKE 'workflow46_cascade_%') AS owned_triggers,
(SELECT count(*)::int FROM "User" WHERE email LIKE 'issue44-read-%' OR email LIKE 'issue29-%' OR email LIKE 'issue35-%' OR email LIKE 'issue27-auth-%') AS owned_fixture_users
`)).rows[0];
const versions=(await c.query("SELECT current_setting('server_version') AS postgres, current_setting('max_connections') AS max_connections, current_setting('shared_buffers') AS shared_buffers, current_setting('work_mem') AS work_mem, current_setting('effective_cache_size') AS effective_cache_size, current_setting('jit') AS jit, current_setting('track_io_timing') AS track_io_timing")).rows[0];
const packages={};for(const name of ['prisma','@prisma/client','@prisma/adapter-pg','@prisma/driver-adapter-utils','pg','vitest','typescript'])packages[name]=JSON.parse(readFileSync(resolve('node_modules',name,'package.json'),'utf8')).version;
console.log(JSON.stringify({at:new Date().toISOString(),guardVerified:true,liveIdentityMatches:true,distinctOperationalDatabase:true,identityValuesWithheld:true,counts:row,versions,packages,node:process.version,generatedClient:require('@prisma/client').Prisma.prismaVersion.client}));
if(Object.values(row).some(v=>v!==0))process.exitCode=1;
} finally {await c.end();}

