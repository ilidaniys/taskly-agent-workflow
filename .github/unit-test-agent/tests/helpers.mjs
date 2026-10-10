// Test helpers: a throw-away git repository that mirrors the layout the scripts expect.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const SCRIPTS = path.resolve(import.meta.dirname, '..');
export const SKILL_SCRIPTS = path.resolve(import.meta.dirname, '../../../.claude/skills/analyze-pr-changes/scripts');

export function git(cwd, ...parameters) {
  return execFileSync('git', parameters, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

export function node(cwd, script, ...parameters) {
  try {
    const stdout = execFileSync(process.execPath, [script, ...parameters], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { status: 0, stdout };
  } catch (error) {
    return { status: error.status, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

export function write(root, file, content) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), content);
}

/** A committed repository with one backend unit + test and one frontend unit + test. */
export function makeRepo() {
  const root = mkdtempSync(path.join(tmpdir(), 'unit-test-agent-'));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'test');
  write(root, '.gitignore', '.unit-test-agent/\nnode_modules/\n');
  write(root, 'backend/src/features/todos/router.ts', 'export const a = 1;\n');
  write(root, 'backend/src/features/todos/types.ts', 'export type A = 1;\n');
  write(root, 'backend/tests/router.test.ts', "import { it } from 'vitest';\nit('a', () => {});\n");
  write(root, 'frontend/src/lib/http.ts', 'export const b = 1;\n');
  write(root, 'frontend/src/lib/http.test.ts', "import { it } from 'vitest'\nit('b', () => {})\n");
  write(root, 'frontend/src/test/setup.ts', '// setup\n');
  write(root, 'frontend/src/design-system/Button.tsx', 'export const Button = 1\n');
  write(root, '.github/workflows/ci.yml', 'name: CI\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  return root;
}

/** Apply `mutate` to a clean repo, return the resulting patch file and reset the tree. */
export function makePatch(root, mutate) {
  mutate();
  git(root, 'add', '-A');
  const patch = git(root, 'diff', '--cached', '--binary', '--no-color');
  git(root, 'reset', '-q', '--hard', 'HEAD');
  git(root, 'clean', '-fdq');
  const file = path.join(tmpdir(), `patch-${process.pid}-${Math.random().toString(36).slice(2)}.patch`);
  writeFileSync(file, patch);
  return file;
}

export function cleanup(root) {
  rmSync(root, { recursive: true, force: true });
}
