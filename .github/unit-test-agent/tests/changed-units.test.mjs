// changed-units.mjs decides what the gate counts and what the planner sees.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';
import path from 'node:path';
import { SKILL_SCRIPTS, makeRepo, cleanup, git, node, write } from './helpers.mjs';

const SCRIPT = path.join(SKILL_SCRIPTS, 'changed-units.mjs');
let root;
before(() => {
  root = makeRepo();
  git(root, 'checkout', '-q', '-b', 'feature');
});
after(() => cleanup(root));

const units = (...parameters) => {
  const result = node(root, SCRIPT, ...parameters);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};
const reset = () => { git(root, 'reset', '-q', '--hard', 'HEAD'); git(root, 'clean', '-fdq'); };

test('an unchanged branch has nothing testable', () => {
  const out = units('--base', 'main');
  assert.equal(out.summary.testable, 0);
});

test('classifies source, excluded, test and other files; working tree changes count', () => {
  write(root, 'backend/src/features/todos/router.ts', 'export const a = 2;\n');       // modified source
  write(root, 'backend/src/features/todos/types.ts', 'export type A = 2;\n');          // excluded: types
  write(root, 'backend/src/core/config.ts', 'export const c = 1;\n');                  // added, untested
  write(root, 'frontend/src/design-system/Button.tsx', 'export const Button = 2\n');  // excluded: design system
  write(root, 'frontend/src/lib/http.test.ts', "import { it } from 'vitest'\nit('b', () => {})\nit('c', () => {})\n"); // test
  write(root, 'README.md', '# x\n');                                                   // other
  const out = units('--base', 'main');
  assert.deepEqual(out.units.map((u) => `${u.status}:${u.path}:${u.test_exists}`).sort(), [
    'added:backend/src/core/config.ts:false',
    'modified:backend/src/features/todos/router.ts:true',
  ]);
  assert.deepEqual(out.units.find((u) => u.path.endsWith('config.ts')).expected_tests, ['backend/tests/config.test.ts']);
  assert.deepEqual(out.excluded.map((e) => `${e.path}|${e.reason}`).sort(), [
    'backend/src/features/todos/types.ts|types only',
    'frontend/src/design-system/Button.tsx|design system: documented in Storybook, excluded from coverage',
  ]);
  assert.deepEqual(out.changed_tests.map((t) => t.path), ['frontend/src/lib/http.test.ts']);
  assert.deepEqual(out.other.map((o) => o.path), ['README.md']);
  assert.deepEqual(out.summary, { testable: 2, untested: 1, low_coverage: null, packages: ['backend'] });
  reset();
});

test('deleted and renamed units are reported with their status', () => {
  unlinkSync(path.join(root, 'frontend/src/lib/http.ts'));
  git(root, 'mv', 'backend/src/features/todos/router.ts', 'backend/src/features/todos/routes.ts');
  const out = units('--base', 'main');
  const byPath = Object.fromEntries(out.units.map((u) => [u.path, u]));
  assert.equal(byPath['frontend/src/lib/http.ts'].status, 'deleted');
  assert.equal(byPath['backend/src/features/todos/routes.ts'].status, 'renamed');
  assert.equal(byPath['backend/src/features/todos/routes.ts'].previous, 'backend/src/features/todos/router.ts');
  assert.equal(out.summary.untested, 1); // routes.ts has no test; the deleted unit is not counted
  reset();
});

test('--all lists every unit and attaches coverage when a snapshot exists', () => {
  const plain = units('--all');
  assert.equal(plain.summary.testable, 2);
  assert.equal(plain.coverage_available, false);
  write(root, '.unit-test-agent/coverage.json', JSON.stringify({ files: {
    'backend/src/features/todos/router.ts': { lines: 100, branches: 100, functions: 100, uncovered_lines: '' },
    'frontend/src/lib/http.ts': { lines: 40, branches: 90, functions: 50, uncovered_lines: '3-9' },
  } }));
  const out = units('--all');
  assert.equal(out.coverage_available, true);
  const byPath = Object.fromEntries(out.units.map((u) => [u.path, u]));
  assert.equal(byPath['backend/src/features/todos/router.ts'].low_coverage, false);
  assert.equal(byPath['frontend/src/lib/http.ts'].low_coverage, true);
  assert.equal(byPath['frontend/src/lib/http.ts'].coverage.uncovered_lines, '3-9');
  assert.equal(out.summary.low_coverage, 1);
  reset();
});

test('--diff prints the diff of one unit and refuses paths outside the packages', () => {
  write(root, 'backend/src/features/todos/router.ts', 'export const a = 3;\n');
  const diff = node(root, SCRIPT, '--base', 'main', '--diff', 'backend/src/features/todos/router.ts');
  assert.equal(diff.status, 0);
  assert.match(diff.stdout, /^-export const a = 1;$/m);
  assert.match(diff.stdout, /^\+export const a = 3;$/m);
  for (const bad of ['../x', '--no-index', '/etc/passwd', 'backend/../.env']) {
    assert.equal(node(root, SCRIPT, '--diff', bad).status, 2, bad);
  }
  reset();
});
