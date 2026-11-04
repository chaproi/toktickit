// Run from server/: node --import tsx ../artifacts/lab-04/hardening/prisma6193-evaluation/run.mjs <new-result.json>
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, readdir, rm, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../../../..'), server = join(root, 'server');
const require = createRequire(join(server, 'package.json'));
const { Client } = require('pg');
const { configureTestDatabaseEnvironment } = await import(pathToFileURL(join(server, 'src/testing/test-database.ts')).href);
const resultPath = resolve(process.argv[2] ?? '');
assert.ok(process.argv[2], 'Supply a new redacted result path.');
assert.ok(resultPath.startsWith(resolve(root, 'artifacts/lab-04/hardening') + sep));
await assert.rejects(access(resultPath), 'Never overwrite an earlier attempt.');
const environment = { ...process.env };
const identity = configureTestDatabaseEnvironment({ environment, environmentFilePath: join(server, '.env') });
assert.notEqual(new URL(environment.TOKTICKIT_DEVELOPMENT_DATABASE_URL).pathname,
  new URL(environment.TEST_DATABASE_URL).pathname, 'Dedicated database distinct from operational required.');
const executionHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const report = { baselineHead: 'ed5cecaf2f8a6a2fa9ca2383dda1eb15e3b3471a', executionHead,
  startedAt: new Date().toISOString(),
  sourceDigests: Object.fromEntries(await Promise.all(['observe.ts', 'evaluate.ts', 'run.mjs', 'plan.md'].map(async name =>
    [name, createHash('sha256').update(await readFile(join(here, name))).digest('hex')]))),
  executedSourceState: 'recorded execution HEAD plus any source bytes identified by sourceDigests; application unchanged',
  node: process.version, platform: process.platform, stages: [], evaluatedPrismaVersion: '6.19.3', proof: null, cleanup: null };
let phase = 'guard', temp, schemaCreated = false, connected = false;
const schema = `issue49_6193_${randomUUID().replaceAll('-', '')}`;
const client = new Client({ connectionString: environment.TEST_DATABASE_URL });
const cache = resolve(server, 'node_modules/.cache');
const privateLogs = join(process.env.TEMP ?? process.env.TMPDIR ?? '/tmp', 'toktickit49-prisma6193-20261102');
await mkdir(privateLogs, { recursive: true });
const runLabel = new URL(pathToFileURL(resultPath)).pathname.split('/').pop().replace('.json', '');
async function stage(label, operation) {
  phase = label; const start = performance.now();
  try {
    const result = await operation();
    report.stages.push({ phase: label, elapsedMs: performance.now() - start, passed: true });
    return result;
  } catch (error) {
    report.stages.push({ phase: label, elapsedMs: performance.now() - start, passed: false });
    throw error;
  }
}
async function command(label, executable, args, cwd, env = environment) {
  return stage(label, () => new Promise((accept, reject) => {
    const child = spawn(executable, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
    const timer = setTimeout(() => child.kill(), label === 'install-exact-temporary-dependencies' ? 120000 : 60000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', async code => {
      clearTimeout(timer);
      await writeFile(join(privateLogs, `${runLabel}-${label}.log`), output);
      const entry = { phase: label, exit: code }; (report.commands ??= []).push(entry);
      if (code !== 0) reject(new Error(`Proof command failed at ${label}.`)); else accept(undefined);
    });
  }));
}
try {
  await stage('live-target-verification', async () => {
    await client.connect(); connected = true;
    const live = await client.query('SELECT current_database() AS db,current_schema() AS schema,version() AS version');
    assert.equal(live.rows[0].db, identity.databaseName); assert.equal(live.rows[0].schema, identity.schema);
    const active = await client.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND state<>'idle'");
    assert.equal(active.rows[0].n, 0, 'Run alone on dedicated target.');
    report.database = { guard: true, liveIdentityMatches: true, distinctOperationalDatabase: true,
      postgresVersion: live.rows[0].version.split(' on ')[0], otherNonIdleConnections: 0 };
  });
  await stage('prepare-owned-directory-and-client-schema', async () => {
    await mkdir(cache, { recursive: true }); temp = await mkdtemp(join(cache, 'issue49-6193-'));
    await writeFile(join(temp, 'owned-by-issue49'), schema);
    await writeFile(join(temp, 'package.json'), JSON.stringify({ name: 'issue49-6193-feasibility', private: true, type: 'module' }));
    const original = await readFile(join(server, 'prisma/schema.prisma'), 'utf8');
    const source = original.replace(/generator client \{[\s\S]*?\}/, 'generator client {\n  provider = "prisma-client-js"\n  engineType = "client"\n  output = "./node_modules/.prisma/client"\n}');
    assert.notEqual(source, original);
    await writeFile(join(temp, 'schema.prisma'), source);
    // An actual deployment resolves ONE generated client. Compile byte-identical
    // application helper sources in that layout, not two nominal type families.
    report.applicationSourceCopies = [];
    for (const path of ['auth/eligibility-transaction.ts', 'prisma.ts', 'testing/test-database.ts']) {
      const bytes = await readFile(join(server, 'src', path)), destination = join(temp, 'appsrc', path);
      await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, bytes);
      report.applicationSourceCopies.push({ path: `server/src/${path}`, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    await writeFile(join(temp, 'evaluate.ts'), await readFile(join(here, 'evaluate.ts')));
    await writeFile(join(temp, 'observe.ts'), await readFile(join(here, 'observe.ts')));
    await writeFile(join(temp, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ES2022',
      moduleResolution: 'bundler', esModuleInterop: true, strict: true, skipLibCheck: true, noEmit: true,
      allowImportingTsExtensions: true, types: ['node'] }, include: ['evaluate.ts', 'observe.ts'] }));
  });
  const packages = ['prisma@6.19.3', '@prisma/client@6.19.3', '@prisma/adapter-pg@6.19.3', '@prisma/driver-adapter-utils@6.19.3',
    'pg@8.23.0', 'typescript@5.7.2', 'tsx@4.19.2', '@types/node@22.10.2', '@types/pg@8.23.1'];
  const childEnvironment = { ...environment, PRISMA_SKIP_POSTINSTALL_GENERATE: 'true', DATABASE_URL: environment.TEST_DATABASE_URL };
  const npm = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  await command('install-exact-temporary-dependencies', process.execPath,
    [npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', ...packages], temp, childEnvironment);
  report.versions = Object.fromEntries(await Promise.all(packages.map(async spec => {
    const name = spec.slice(0, spec.lastIndexOf('@'));
    return [name, JSON.parse(await readFile(join(temp, 'node_modules', name, 'package.json'), 'utf8')).version];
  })));
  report.prismaCli = JSON.parse(await readFile(join(temp, 'node_modules/prisma/package.json'), 'utf8')).version; assert.equal(report.prismaCli, '6.19.3');
  report.packageRequirements = Object.fromEntries(await Promise.all(['prisma', '@prisma/client', '@prisma/adapter-pg'].map(async name => { const p = JSON.parse(await readFile(join(temp, 'node_modules', name, 'package.json'), 'utf8')); return [name, { version: p.version, engines: p.engines ?? {}, peerDependencies: p.peerDependencies ?? {} }]; })));
  report.temporaryLockSha256 = createHash('sha256').update(await readFile(join(temp, 'package-lock.json'))).digest('hex');
  await command('generate-temporary-client', process.execPath,
    [join(temp, 'node_modules/prisma/build/index.js'), 'generate', '--schema', join(temp, 'schema.prisma')], temp, childEnvironment);
  await command('typecheck-public-adapter-and-application-callback', process.execPath,
    [join(temp, 'node_modules/typescript/bin/tsc'), '--project', join(temp, 'tsconfig.json')], temp, childEnvironment);
  await stage('owned-schema-and-committed-migrations', async () => {
    assert.match(schema, /^issue49_6193_[a-f0-9]{32}$/);
    await client.query(`CREATE SCHEMA "${schema}"`); schemaCreated = true;
    await client.query("SELECT set_config('search_path',$1,false)", [schema]);
    await client.query("SELECT set_config('toktickit.lab3_credential_hashes','{}',false)");
    const path = join(server, 'prisma/migrations');
    const migrations = (await readdir(path, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    for (const migration of migrations) await client.query(await readFile(join(path, migration, 'migration.sql'), 'utf8'));
    report.migrationsApplied = migrations.length;
  });
  const proofResult = join(temp, 'proof-result.json');
  try {
    await command('bounded-client-engine-gates', process.execPath,
      ['--expose-gc', '--import', 'tsx', join(temp, 'evaluate.ts')], temp,
      { ...childEnvironment, EVAL_DATABASE_URL: environment.TEST_DATABASE_URL, EVAL_SCHEMA: schema, EVAL_RESULT: proofResult });
  } finally { try { report.proof = JSON.parse(await readFile(proofResult, 'utf8')); } catch {} }
} catch (error) {
  const code = typeof error?.code === 'string' && /^[A-Z0-9]{5}$/.test(error.code) ? error.code : null;
  report.failure = { phase, code, assertion: error instanceof assert.AssertionError ? error.message : null };
  process.exitCode = 1;
} finally {
  const cleanup = {};
  try {
    if (connected && schemaCreated) {
      await client.query('ROLLBACK'); await client.query(`DROP SCHEMA "${schema}" CASCADE`);
      const remaining = await client.query('SELECT count(*)::int AS n FROM pg_namespace WHERE nspname=$1', [schema]);
      cleanup.schemasRemaining = remaining.rows[0].n; assert.equal(cleanup.schemasRemaining, 0);
    } else cleanup.schemaCreated = false;
    if (connected) {
      const activity = await client.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name LIKE 'issue49-6193-proof%' AND pid<>pg_backend_pid()");
      cleanup.proofConnectionsRemaining = activity.rows[0].n; assert.equal(activity.rows[0].n, 0);
    }
  } catch { cleanup.databaseCleanupFailed = true; process.exitCode = 1; }
  finally { await client.end(); cleanup.nativeClientEnded = true; }
  if (temp) {
    const owned = resolve(temp);
    assert.equal(dirname(owned), cache); assert.ok(owned.startsWith(join(cache, 'issue49-6193-')));
    assert.equal(await readFile(join(owned, 'owned-by-issue49'), 'utf8'), schema);
    await rm(owned, { recursive: true });
    cleanup.temporaryDirectoryRemoved = true;
  }
  report.cleanup = cleanup;
  await writeFile(resultPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ result: relative(root, resultPath).replaceAll('\\', '/'),
    stages: report.stages, failure: report.failure ?? null, proof: report.proof, cleanup: report.cleanup }));
}
