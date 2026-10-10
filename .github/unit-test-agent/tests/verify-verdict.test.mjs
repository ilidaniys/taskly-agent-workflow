// The verdict compares the suite before and after the agent's patch. Each regression it is
// meant to catch has a case here; the "verified" case pins the happy path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SCRIPTS, node } from './helpers.mjs';

const VERIFY = path.join(SCRIPTS, 'verify.mjs');

const pkg = (overrides = {}) => ({
  exit: 0, typecheck: 0,
  tests: { total: 10, passed: 10, failed: 0, skipped: 0, failed_files: 0 },
  coverage: { lines: 50, statements: 50, functions: 50, branches: 40 },
  ...overrides,
});
const both = (b = {}, f = {}) => ({ backend: pkg(b), frontend: pkg(f) });

function verdict({ patch, before, after }) {
  const out = mkdtempSync(path.join(tmpdir(), 'verdict-'));
  if (patch) writeFileSync(path.join(out, 'patch.json'), JSON.stringify(patch));
  if (before) writeFileSync(path.join(out, 'before.json'), JSON.stringify(before));
  if (after) writeFileSync(path.join(out, 'after.json'), JSON.stringify(after));
  const result = node(out, VERIFY, 'verdict', out);
  const written = JSON.parse(readFileSync(path.join(out, 'verify.json'), 'utf8'));
  return { exit: result.status, ...written };
}

const okPatch = { ok: true, files: [{ path: 'backend/tests/x.test.ts', status: 'added' }], violations: [] };

test('verified when tests, coverage and type check hold or improve', () => {
  const v = verdict({ patch: okPatch, before: both(), after: both({ tests: { total: 12, passed: 12, failed: 0, skipped: 0, failed_files: 0 }, coverage: { lines: 60, statements: 60, functions: 55, branches: 45 } }) });
  assert.equal(v.exit, 0);
  assert.equal(v.status, 'verified');
  assert.deepEqual(v.failures, []);
});

test('rejected when the guard rejected the patch, with the guard reasons', () => {
  const v = verdict({ patch: { ok: false, files: [], violations: ['backend/src/a.ts: outside the paths the agent may change'] }, before: both() });
  assert.equal(v.exit, 1);
  assert.match(v.failures[0], /^guard: backend\/src\/a\.ts/);
});

test('rejected when a test fails after the patch', () => {
  const v = verdict({ patch: okPatch, before: both(), after: both({ tests: { total: 11, passed: 10, failed: 1, skipped: 0, failed_files: 1 } }) });
  assert.equal(v.exit, 1);
  assert.ok(v.failures.some((f) => /backend: 1 failing tests/.test(f)));
});

test('rejected when the number of tests falls', () => {
  const v = verdict({ patch: okPatch, before: both(), after: both({}, { tests: { total: 9, passed: 9, failed: 0, skipped: 0, failed_files: 0 } }) });
  assert.equal(v.exit, 1);
  assert.ok(v.failures.some((f) => /frontend: number of tests fell from 10 to 9/.test(f)));
});

test('rejected when skipped tests rise', () => {
  const v = verdict({ patch: okPatch, before: both(), after: both({ tests: { total: 10, passed: 9, failed: 0, skipped: 1, failed_files: 0 } }) });
  assert.equal(v.exit, 1);
  assert.ok(v.failures.some((f) => /skipped tests rose from 0 to 1/.test(f)));
});

test('rejected when coverage falls, tolerant of rounding noise', () => {
  const noise = verdict({ patch: okPatch, before: both(), after: both({ coverage: { lines: 49.995, statements: 50, functions: 50, branches: 40 } }) });
  assert.equal(noise.exit, 0);
  const fall = verdict({ patch: okPatch, before: both(), after: both({ coverage: { lines: 48, statements: 50, functions: 50, branches: 40 } }) });
  assert.equal(fall.exit, 1);
  assert.ok(fall.failures.some((f) => /backend: lines coverage fell from 50% to 48%/.test(f)));
});

test('rejected on type errors, coverage-threshold exit and unformatted files', () => {
  const types = verdict({ patch: okPatch, before: both(), after: both({ typecheck: 2 }) });
  assert.ok(types.failures.some((f) => /backend: type check failed/.test(f)));
  const threshold = verdict({ patch: okPatch, before: both(), after: both({ exit: 1 }) });
  assert.ok(threshold.failures.some((f) => /backend: test command exited 1/.test(f)));
  const format = verdict({ patch: okPatch, before: both(), after: both({}, { format: 1 }) });
  assert.ok(format.failures.some((f) => /frontend: changed test files are not Prettier-formatted/.test(f)));
});

test('rejected when the after run is missing or produced no results', () => {
  const missing = verdict({ patch: okPatch, before: both() });
  assert.equal(missing.exit, 1);
  assert.match(missing.failures[0], /did not run after applying/);
  const noResults = verdict({ patch: okPatch, before: both(), after: { backend: { exit: 1, tests: null }, frontend: pkg() } });
  assert.ok(noResults.failures.some((f) => /backend: no test results were produced/.test(f)));
});

test('rejected when the guard never ran', () => {
  const v = verdict({ before: both(), after: both() });
  assert.equal(v.exit, 1);
  assert.match(v.failures[0], /patch guard did not run/);
});
