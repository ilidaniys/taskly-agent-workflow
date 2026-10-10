// The guard is the deterministic line between the agent's output and the repository.
// Every hostile patch here must be rejected and leave the working tree exactly as it was.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { SCRIPTS, makeRepo, makePatch, cleanup, git, node, write } from './helpers.mjs';

const GUARD = path.join(SCRIPTS, 'apply-patch.mjs');
let root;
before(() => { root = makeRepo(); });
after(() => cleanup(root));

const run = (patchFile) => {
  const result = node(root, GUARD, patchFile);
  const parsed = JSON.parse(result.stdout);
  return { ...result, ...parsed };
};
const treeIsClean = () => git(root, 'status', '--porcelain').trim() === '';

test('legitimate patch: new and modified test files are applied to the index', () => {
  const patch = makePatch(root, () => {
    write(root, 'backend/tests/validators.test.ts', "import { it } from 'vitest';\nit('v', () => {});\n");
    write(root, 'frontend/src/lib/http.test.ts', "import { it } from 'vitest'\nit('b', () => {})\nit('c', () => {})\n");
  });
  const result = run(patch);
  assert.equal(result.status, 0);
  assert.equal(result.ok, true);
  assert.deepEqual(result.files.map((f) => `${f.status}:${f.path}`).sort(), [
    'added:backend/tests/validators.test.ts',
    'modified:frontend/src/lib/http.test.ts',
  ]);
  assert.match(git(root, 'diff', '--cached', '--name-only'), /validators\.test\.ts/);
  git(root, 'reset', '-q', '--hard', 'HEAD'); git(root, 'clean', '-fdq');
});

test('empty patch is accepted as a no-op', () => {
  const file = path.join(tmpdir(), `empty-${process.pid}.patch`);
  writeFileSync(file, '');
  const result = run(file);
  assert.equal(result.ok, true);
  assert.equal(result.empty, true);
  unlinkSync(file);
});

const hostile = [
  ['edits source code', () => write(root, 'backend/src/features/todos/router.ts', 'export const a = 2;\n'), /outside the paths/],
  ['adds it.skip', () => write(root, 'backend/tests/router.test.ts', "import { it } from 'vitest';\nit.skip('a', () => {});\n"), /skips, focuses or inverts/],
  ['adds it.only', () => write(root, 'backend/tests/router.test.ts', "import { it } from 'vitest';\nit.only('a', () => {});\n"), /skips, focuses or inverts/],
  ['deletes a test file', () => unlinkSync(path.join(root, 'backend/tests/router.test.ts')), /status D is not allowed/],
  ['adds a symlink in the test tree', () => symlinkSync('/etc/passwd', path.join(root, 'backend/tests/link.test.ts')), /file mode 120000/],
  ['edits a workflow', () => write(root, '.github/workflows/ci.yml', 'name: pwned\n'), /outside the paths/],
  ['edits the test setup file', () => write(root, 'frontend/src/test/setup.ts', 'globalThis.fetch = () => {}\n'), /outside the paths/],
  ['dumps the whole environment', () => write(root, 'backend/tests/env.test.ts', "console.log(JSON.stringify(process.env));\n"), /whole process environment/],
  ['imports child_process', () => write(root, 'backend/tests/x.test.ts', "import { execSync } from 'node:child_process';\n"), /process or network module/],
  ['uses eval', () => write(root, 'backend/tests/x.test.ts', "eval('1');\n"), /dynamic code evaluation/],
  ['adds a coverage-ignore comment', () => write(root, 'backend/tests/x.test.ts', "/* istanbul ignore next */\n"), /coverage-ignore/],
  ['makes a test file executable', () => chmodSync(path.join(root, 'backend/tests/router.test.ts'), 0o755), /file mode 100755/],
];

for (const [name, mutate, reason] of hostile) {
  test(`hostile patch is rejected: ${name}`, () => {
    const patch = makePatch(root, mutate);
    const result = run(patch);
    assert.equal(result.status, 1, `exit code for: ${name}`);
    assert.equal(result.ok, false);
    assert.ok(result.violations.some((v) => reason.test(v)), `expected ${reason} in ${JSON.stringify(result.violations)}`);
    assert.ok(treeIsClean(), `working tree left dirty after: ${name}`);
  });
}

test('patch that does not apply is rejected without touching the tree', () => {
  const file = path.join(tmpdir(), `bad-${process.pid}.patch`);
  writeFileSync(file, 'diff --git a/backend/tests/router.test.ts b/backend/tests/router.test.ts\n--- a/backend/tests/router.test.ts\n+++ b/backend/tests/router.test.ts\n@@ -1,1 +1,1 @@\n-this line does not exist\n+replacement\n');
  const result = run(file);
  assert.equal(result.ok, false);
  assert.match(result.violations[0], /does not apply/);
  unlinkSync(file);
  assert.ok(treeIsClean());
});

test('dirty working tree is refused', () => {
  write(root, 'scratch.txt', 'x');
  const patch = makePatch(root, () => write(root, 'backend/tests/new.test.ts', "import { it } from 'vitest';\nit('n', () => {});\n"));
  write(root, 'scratch.txt', 'x');
  const result = run(patch);
  assert.equal(result.ok, false);
  assert.match(result.violations[0], /not clean/);
  unlinkSync(path.join(root, 'scratch.txt'));
});
