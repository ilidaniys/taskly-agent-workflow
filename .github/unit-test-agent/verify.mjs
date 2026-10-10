#!/usr/bin/env node
// Independent verification of the agent's work. Runs without any secret.
//   verify.mjs run <before|after> <out dir>   run both suites with coverage (+ type check and format after)
//   verify.mjs verdict <out dir>              compare before/after, write verify.json, exit 1 if rejected
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [command, ...rest] = process.argv.slice(2);
const PACKAGES = ['backend', 'frontend'];
const METRICS = ['lines', 'statements', 'functions', 'branches'];
const readJson = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);
const run = (cwd, program, parameters) =>
  spawnSync(program, parameters, { cwd, stdio: 'inherit', env: { ...process.env, CI: 'true' } }).status ?? 1;

if (command === 'run') {
  const [label, outArgument] = rest;
  if (!['before', 'after'].includes(label) || !outArgument) process.exit(2);
  const out = path.resolve(outArgument);
  mkdirSync(out, { recursive: true });
  const patch = readJson(path.join(out, 'patch.json'));
  const result = {};
  for (const name of PACKAGES) {
    const testsFile = path.join(out, `${label}-${name}-tests.json`);
    rmSync(path.join(name, 'coverage'), { recursive: true, force: true });
    console.log(`::group::${label}: ${name} tests with coverage`);
    const exit = run(name, 'npx', [
      '--no-install', 'vitest', 'run', '--coverage', '--coverage.reportOnFailure',
      '--reporter=default', '--reporter=json', `--outputFile.json=${testsFile}`,
    ]);
    console.log('::endgroup::');
    const tests = readJson(testsFile);
    const summary = readJson(path.join(name, 'coverage', 'coverage-summary.json'));
    const entry = {
      exit,
      tests: tests && {
        total: tests.numTotalTests, passed: tests.numPassedTests, failed: tests.numFailedTests,
        skipped: (tests.numPendingTests ?? 0) + (tests.numTodoTests ?? 0),
        failed_files: tests.numFailedTestSuites,
      },
      coverage: summary && Object.fromEntries(METRICS.map((metric) => [metric, summary.total[metric].pct])),
    };
    if (label === 'after') {
      console.log(`::group::after: ${name} type check`);
      entry.typecheck = run(name, 'npm', ['run', '--silent', 'typecheck']);
      console.log('::endgroup::');
      const touched = (patch?.files ?? []).map((file) => file.path)
        .filter((file) => file.startsWith(`${name}/`)).map((file) => file.slice(name.length + 1));
      if (name === 'frontend' && touched.length) {
        entry.format = run(name, 'npx', ['--no-install', 'prettier', '--check', ...touched]);
      }
    }
    result[name] = entry;
  }
  writeFileSync(path.join(out, `${label}.json`), `${JSON.stringify(result, null, 2)}\n`);
  process.exit(0);
}

if (command === 'verdict') {
  const out = path.resolve(rest[0] ?? '.');
  const patch = readJson(path.join(out, 'patch.json'));
  const before = readJson(path.join(out, 'before.json'));
  const after = readJson(path.join(out, 'after.json'));
  const failures = [];
  if (!patch) failures.push('patch guard did not run');
  else if (!patch.ok) failures.push(...patch.violations.map((violation) => `guard: ${violation}`));
  else if (!after) failures.push('test suites did not run after applying the patch');
  else {
    for (const name of PACKAGES) {
      const now = after[name];
      const then = before?.[name];
      if (!now.tests) { failures.push(`${name}: no test results were produced`); continue; }
      if (now.tests.failed > 0 || now.tests.failed_files > 0) failures.push(`${name}: ${now.tests.failed} failing tests, ${now.tests.failed_files} failing files`);
      else if (now.exit !== 0) failures.push(`${name}: test command exited ${now.exit} (coverage threshold or run error)`);
      if (now.typecheck !== 0) failures.push(`${name}: type check failed`);
      if (now.format !== undefined && now.format !== 0) failures.push(`${name}: changed test files are not Prettier-formatted`);
      if (!then?.tests) continue;
      if (now.tests.total < then.tests.total) failures.push(`${name}: number of tests fell from ${then.tests.total} to ${now.tests.total}`);
      if (now.tests.skipped > then.tests.skipped) failures.push(`${name}: skipped tests rose from ${then.tests.skipped} to ${now.tests.skipped}`);
      for (const metric of METRICS) {
        const was = then.coverage?.[metric];
        const is = now.coverage?.[metric];
        if (typeof was === 'number' && typeof is === 'number' && is < was - 0.01) failures.push(`${name}: ${metric} coverage fell from ${was}% to ${is}%`);
      }
    }
  }
  const verdict = { status: failures.length ? 'rejected' : 'verified', failures, files: patch?.files ?? [], before, after };
  writeFileSync(path.join(out, 'verify.json'), `${JSON.stringify(verdict, null, 2)}\n`);
  console.log(JSON.stringify({ status: verdict.status, failures }, null, 2));
  process.exit(failures.length ? 1 : 0);
}

console.error('usage: verify.mjs run <before|after> <out dir> | verdict <out dir>');
process.exit(2);
