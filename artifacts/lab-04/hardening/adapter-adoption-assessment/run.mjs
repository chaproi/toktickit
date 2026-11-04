// Run from server/: node --import tsx ../artifacts/lab-04/hardening/adapter-adoption-assessment/run.mjs <new-result.json>
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../../../..'), server = join(root, 'server');
const require = createRequire(join(server, 'package.json'));
const { Client } = require('pg');
const { configureTestDatabaseEnvironment } = await import(pathToFileURL(join(server, 'src/testing/test-database.ts')).href);
assert.ok(process.argv[2], 'Supply a new redacted result path.');
const output = resolve(process.argv[2]);
assert.ok(output.startsWith(resolve(root, 'artifacts/lab-04/hardening') + sep));
await assert.rejects(access(output), 'Never overwrite a previous attempt.');
const env = { ...process.env };
const identity = configureTestDatabaseEnvironment({ environment: env, environmentFilePath: join(server, '.env') });
assert.notEqual(new URL(env.TOKTICKIT_DEVELOPMENT_DATABASE_URL).pathname, new URL(env.TEST_DATABASE_URL).pathname);
const report = { executionHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(),
  startedAt: new Date().toISOString(), stages: [], commands: [],
  sourceDigests: Object.fromEntries(await Promise.all(['assessment.ts', 'run.mjs', 'plan.md'].map(async name =>
    [name, createHash('sha256').update(await readFile(join(here, name))).digest('hex')]))),
  applicationChanged: false, node: process.version, platform: process.platform };
const cache = resolve(server, 'node_modules/.cache');
const logs = join(process.env.TEMP ?? process.env.TMPDIR ?? '/tmp', 'toktickit49-adoption-assessment-20261102');
await mkdir(logs, { recursive: true });
const label = output.split(sep).pop().replace('.json', '');
const token = randomUUID(); let temp, phase = 'guard', connected = false;
const observer = new Client({ connectionString: env.TEST_DATABASE_URL });
async function stage(name, operation) {
  phase = name; const begin = performance.now();
  try { const result = await operation(); report.stages.push({ name, elapsedMs: performance.now() - begin, passed: true }); return result; }
  catch (error) { report.stages.push({ name, elapsedMs: performance.now() - begin, passed: false }); throw error; }
}
async function command(name, executable, args, cwd, environment) {
  return stage(name, () => new Promise((accept, reject) => {
    const child = spawn(executable, args, { cwd, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = ''; child.stdout.on('data', data => { text += data; }); child.stderr.on('data', data => { text += data; });
    const timer = setTimeout(() => child.kill(), name === 'install-pinned-temporary-dependencies' ? 120000 : 60000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', async code => {
      clearTimeout(timer); await writeFile(join(logs, `${label}-${name}.log`), text);
      report.commands.push({ name, exit: code });
      code === 0 ? accept(undefined) : reject(new Error(`Assessment command failed at ${name}.`));
    });
  }));
}
try {
  await stage('guarded-live-target-verification', async () => {
    await observer.connect(); connected = true;
    const live = await observer.query('SELECT current_database() AS database,current_schema() AS schema,version() AS version');
    assert.equal(live.rows[0].database, identity.databaseName); assert.equal(live.rows[0].schema, identity.schema);
    const activity = await observer.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND state<>'idle'");
    assert.equal(activity.rows[0].n, 0);
    report.isolation = { liveTargetMatchesGuard: true, distinctOperationalDatabase: true, otherNonIdleConnections: 0,
      postgresVersion: live.rows[0].version.split(' on ')[0] };
    const sourceUrl = new URL(env.TEST_DATABASE_URL);
    report.localUrlOptionNames = [...sourceUrl.searchParams.keys()].sort();
    report.ambientPgEnvironmentNames = Object.keys(env).filter(key => key.startsWith('PG') && env[key]).sort();
    assert.equal(report.ambientPgEnvironmentNames.length, 0, 'No unreviewed pg environment overrides.');
  });
  await stage('prepare-owned-directory', async () => {
    await mkdir(cache, { recursive: true }); temp = await mkdtemp(join(cache, 'issue49-adoption-'));
    await writeFile(join(temp, 'owned-by-issue49'), token);
    await writeFile(join(temp, 'package.json'), JSON.stringify({ name: 'issue49-adoption-assessment', private: true, type: 'module' }));
    const original = await readFile(join(server, 'prisma/schema.prisma'), 'utf8');
    await writeFile(join(temp, 'schema.prisma'), original.replace(/generator client \{[\s\S]*?\}/,
      'generator client {\n provider = "prisma-client-js"\n previewFeatures = ["driverAdapters"]\n output = "./node_modules/.prisma/client"\n}'));
    report.sourceCopies = [];
    for (const path of ['prisma.ts', 'testing/test-database.ts']) {
      const bytes = await readFile(join(server, 'src', path)), dest = join(temp, 'appsrc', path);
      await mkdir(dirname(dest), { recursive: true }); await writeFile(dest, bytes);
      report.sourceCopies.push({ path: `server/src/${path}`, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    await writeFile(join(temp, 'assessment.ts'), await readFile(join(here, 'assessment.ts')));
    await writeFile(join(temp, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ES2022',
      moduleResolution: 'bundler', esModuleInterop: true, strict: true, skipLibCheck: true, noEmit: true, types: ['node'] }, include: ['assessment.ts'] }));
  });
  const dependencies = ['@prisma/client@5.22.0', '@prisma/adapter-pg@5.22.0', '@prisma/driver-adapter-utils@5.22.0',
    'pg@8.23.0', 'typescript@5.7.2', 'tsx@4.19.2', '@types/node@22.10.2', '@types/pg@8.23.1'];
  const childEnv = { ...env, PRISMA_SKIP_POSTINSTALL_GENERATE: 'true' };
  await command('install-pinned-temporary-dependencies', process.execPath,
    [join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', ...dependencies], temp, childEnv);
  report.versions = Object.fromEntries(await Promise.all(dependencies.map(async spec => {
    const name = spec.slice(0, spec.lastIndexOf('@'));
    return [name, JSON.parse(await readFile(join(temp, 'node_modules', name, 'package.json'), 'utf8')).version];
  })));
  report.temporaryLockSha256 = createHash('sha256').update(await readFile(join(temp, 'package-lock.json'))).digest('hex');
  const cli = require('prisma/package.json').version; assert.equal(cli, '5.22.0'); report.prismaCli = cli;
  await command('generate-temporary-client', process.execPath,
    [join(server, 'node_modules/prisma/build/index.js'), 'generate', '--schema', join(temp, 'schema.prisma')], temp, childEnv);
  await command('typecheck-assessment', process.execPath,
    [join(temp, 'node_modules/typescript/bin/tsc'), '--project', join(temp, 'tsconfig.json')], temp, childEnv);
  const marked = new URL(env.TEST_DATABASE_URL); marked.searchParams.set('application_name', 'issue49-adoption-native');
  const detail = join(temp, 'detail.json');
  try {
    await command('bounded-lifecycle-and-retention', process.execPath,
      [join(temp, 'node_modules/tsx/dist/cli.mjs'), join(temp, 'assessment.ts')], temp,
      { ...childEnv, NODE_ENV: 'test', DATABASE_URL: marked.href, TEST_DATABASE_URL: marked.href,
        ASSESS_DATABASE_URL: marked.href, ASSESS_RESULT: detail });
  } finally { try { report.assessment = JSON.parse(await readFile(detail, 'utf8')); } catch {} }
} catch (error) {
  report.failure = { phase, assertion: error instanceof assert.AssertionError ? error.message : null };
  process.exitCode = 1;
} finally {
  const cleanup = {};
  try {
    if (connected) {
      const remaining = await observer.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name LIKE 'issue49-adoption-%' AND pid<>pg_backend_pid()");
      cleanup.taggedConnections = remaining.rows[0].n; assert.equal(remaining.rows[0].n, 0);
    }
  } catch { cleanup.failed = true; process.exitCode = 1; }
  await observer.end(); cleanup.observerEnded = true;
  if (temp) {
    assert.equal(dirname(resolve(temp)), cache); assert.ok(resolve(temp).startsWith(join(cache, 'issue49-adoption-')));
    assert.equal(await readFile(join(temp, 'owned-by-issue49'), 'utf8'), token);
    await rm(temp, { recursive: true }); cleanup.ownedDirectoryRemoved = true;
  }
  report.cleanup = cleanup; report.finishedAt = new Date().toISOString();
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ result: relative(root, output).replaceAll('\\', '/'), stages: report.stages,
    failure: report.failure ?? null, assessment: report.assessment ?? null, cleanup }));
}
