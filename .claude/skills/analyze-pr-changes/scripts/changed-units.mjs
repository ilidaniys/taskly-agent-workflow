#!/usr/bin/env node
// Lists changed source units and maps each to the test file that should cover it.
// Deterministic: used by the agent (skill) and by the workflow gate job.
// Usage: changed-units.mjs [--base <sha|ref>] [--all]
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const git = (...parameters) =>
  execFileSync('git', parameters, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

process.chdir(git('rev-parse', '--show-toplevel').trim());

const FRONTEND_EXCLUDED = [
  [/^frontend\/src\/design-system\//, 'design system: documented in Storybook, excluded from coverage'],
  [/\.stories\.tsx$/, 'Storybook story'],
  [/\.styles\.ts$/, 'styles only'],
  [/\.css$/, 'styles only'],
  [/\.d\.ts$/, 'type declarations only'],
  [/(^|\/)types\.ts$|\.types\.ts$/, 'types only'],
  [/(^|\/)index\.ts$/, 'barrel file'],
  [/(^|\/)constants\.tsx?$|\.constants\.ts$/, 'constants only'],
  [/^frontend\/src\/main\.tsx$/, 'application entry point'],
  [/^frontend\/src\/features\/todos\/api\/queryKeys\.ts$/, 'static query keys'],
  [/^frontend\/src\/lib\/queryClient\.ts$/, 'static client configuration'],
];
const BACKEND_EXCLUDED = [
  [/^backend\/src\/generated\//, 'generated Prisma client'],
  [/(^|\/)types\.ts$/, 'types only'],
];

function classify(file) {
  if (file.startsWith('frontend/src/')) {
    if (/\.test\.tsx?$/.test(file)) return { kind: 'test', package: 'frontend' };
    if (file.startsWith('frontend/src/test/')) return { kind: 'test', package: 'frontend' };
    const excluded = FRONTEND_EXCLUDED.find(([pattern]) => pattern.test(file));
    if (excluded) return { kind: 'excluded', package: 'frontend', reason: excluded[1] };
    if (!/\.tsx?$/.test(file)) return { kind: 'excluded', package: 'frontend', reason: 'not TypeScript source' };
    const stem = file.replace(/\.tsx?$/, '');
    return { kind: 'source', package: 'frontend', expected_tests: [`${stem}.test.tsx`, `${stem}.test.ts`] };
  }
  if (file.startsWith('backend/tests/')) return { kind: 'test', package: 'backend' };
  if (file.startsWith('backend/src/')) {
    const excluded = BACKEND_EXCLUDED.find(([pattern]) => pattern.test(file));
    if (excluded) return { kind: 'excluded', package: 'backend', reason: excluded[1] };
    if (!file.endsWith('.ts')) return { kind: 'excluded', package: 'backend', reason: 'not TypeScript source' };
    return { kind: 'source', package: 'backend', expected_tests: [`backend/tests/${path.basename(file, '.ts')}.test.ts`] };
  }
  return { kind: 'other' };
}

const STATUS = { A: 'added', M: 'modified', D: 'deleted', R: 'renamed', C: 'added', T: 'modified' };
let mergeBase = null;
let entries;

if (args.includes('--all')) {
  entries = git('ls-files', '-z', 'backend/src', 'frontend/src').split('\0').filter(Boolean)
    .map((file) => ({ file, status: 'existing' }));
} else {
  const base = option('--base') || process.env.BASE_SHA || 'origin/main';
  try {
    mergeBase = git('merge-base', base, 'HEAD').trim();
  } catch {
    console.error(`Cannot resolve merge-base with "${base}". Fetch full history or pass --base.`);
    process.exit(2);
  }
  // Working tree against merge-base: covers committed and not yet committed changes.
  const fields = git('diff', '--name-status', '-z', '-M', mergeBase).split('\0').filter(Boolean);
  const untracked = git('ls-files', '-z', '--others', '--exclude-standard').split('\0').filter(Boolean);
  entries = untracked.map((file) => ({ file, status: 'added' }));
  for (let index = 0; index < fields.length; ) {
    const code = fields[index][0];
    if (code === 'R' || code === 'C') {
      entries.push({ file: fields[index + 2], status: STATUS[code], previous: fields[index + 1] });
      index += 3;
    } else {
      entries.push({ file: fields[index + 1], status: STATUS[code] ?? 'modified' });
      index += 2;
    }
  }
}

const result = { merge_base: mergeBase, units: [], excluded: [], changed_tests: [], other: [] };
for (const { file, status, previous } of entries) {
  const info = classify(file);
  if (info.kind === 'source') {
    result.units.push({
      path: file, package: info.package, status, ...(previous ? { previous } : {}),
      expected_tests: info.expected_tests,
      test_exists: info.expected_tests.some((candidate) => existsSync(candidate)),
    });
  } else if (info.kind === 'excluded') {
    result.excluded.push({ path: file, package: info.package, status, reason: info.reason });
  } else if (info.kind === 'test') {
    result.changed_tests.push({ path: file, package: info.package, status });
  } else {
    result.other.push({ path: file, status });
  }
}
if (args.includes('--all')) {
  result.changed_tests = [];
  result.other = [];
}
const live = result.units.filter((unit) => unit.status !== 'deleted');
result.summary = {
  testable: result.units.length,
  untested: live.filter((unit) => !unit.test_exists).length,
  packages: [...new Set(result.units.map((unit) => unit.package))].sort(),
};
console.log(JSON.stringify(result, null, 2));
