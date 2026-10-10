#!/usr/bin/env node
// Guard, then apply the agent's patch to the index and working tree.
// The agent is untrusted: whatever it produced is accepted only if it is confined
// to test files and does not weaken the suite. Exit 0 = applied (or empty), 1 = rejected.
// Usage: apply-patch.mjs <patch file> [result.json]
import { execFileSync } from 'node:child_process';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [patchArgument, resultArgument] = process.argv.slice(2);
if (!patchArgument) {
  console.error('usage: apply-patch.mjs <patch file> [result.json]');
  process.exit(2);
}
const patchFile = path.resolve(patchArgument);
const resultFile = resultArgument && path.resolve(resultArgument);
const git = (...parameters) =>
  execFileSync('git', parameters, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
process.chdir(git('rev-parse', '--show-toplevel').trim());

const MAX_PATCH_BYTES = 400 * 1024;
const MAX_FILES = 40;
const ALLOWED = [
  /^frontend\/src\/.+\.test\.tsx?$/,
  /^frontend\/src\/test\/[A-Za-z0-9_.-]+\.tsx?$/,
  /^backend\/tests\/.+\.ts$/,
];
const FORBIDDEN = [/^frontend\/src\/test\/setup\.ts$/];
const BANNED_ADDITIONS = [
  [/\b(?:it|test|describe|suite)\.(?:skip|only|todo|skipIf|runIf|fails)\b/, 'skips, focuses or inverts tests'],
  [/\bx(?:it|test|describe)\s*\(/, 'skips tests'],
  [/(?:istanbul|v8|c8)\s+ignore/, 'coverage-ignore comment'],
  [/['"](?:node:)?(?:child_process|net|dgram|http|https|http2|tls|dns|worker_threads|vm)['"]/, 'imports a process or network module'],
  [/\beval\s*\(|\bnew\s+Function\s*\(/, 'dynamic code evaluation'],
  [/\bprocess\.env\b(?!\s*[.[])/, 'uses the whole process environment'],
];

const finish = (result) => {
  if (resultFile) writeFileSync(resultFile, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
};

if (!existsSync(patchFile) || statSync(patchFile).size === 0) {
  finish({ ok: true, empty: true, files: [], violations: [] });
}
const violations = [];
if (statSync(patchFile).size > MAX_PATCH_BYTES) {
  finish({ ok: false, empty: false, files: [], violations: [`patch is larger than ${MAX_PATCH_BYTES} bytes`] });
}
if (git('status', '--porcelain').trim()) {
  finish({ ok: false, empty: false, files: [], violations: ['working tree is not clean before applying the patch'] });
}
try {
  git('apply', '--index', '--whitespace=nowarn', patchFile);
} catch (error) {
  finish({ ok: false, empty: false, files: [], violations: [`patch does not apply: ${String(error.stderr || error.message).trim().slice(0, 500)}`] });
}

// Inspect what was actually staged rather than parsing patch text.
const files = [];
for (const line of git('diff', '--cached', '--raw', '--no-renames', '-z').split('\0:').filter(Boolean)) {
  const [meta, file] = line.replace(/^:/, '').split('\0');
  const [, newMode, , , status] = meta.trim().split(/\s+/);
  files.push({ path: file, status: status === 'A' ? 'added' : status === 'M' ? 'modified' : status });
  if (!ALLOWED.some((pattern) => pattern.test(file)) || FORBIDDEN.some((pattern) => pattern.test(file))) {
    violations.push(`${file}: outside the paths the agent may change`);
  }
  if (status !== 'A' && status !== 'M') violations.push(`${file}: status ${status} is not allowed (only add or modify)`);
  if (newMode !== '100644') violations.push(`${file}: file mode ${newMode} is not allowed`);
}
if (files.length > MAX_FILES) violations.push(`patch touches ${files.length} files (limit ${MAX_FILES})`);

let current = '';
for (const line of git('diff', '--cached', '--unified=0', '--no-color').split('\n')) {
  if (line.startsWith('+++ b/')) current = line.slice(6);
  else if (line.startsWith('+') && !line.startsWith('+++')) {
    for (const [pattern, reason] of BANNED_ADDITIONS) {
      if (pattern.test(line)) violations.push(`${current}: ${reason}: ${line.slice(1).trim().slice(0, 120)}`);
    }
  }
}

if (violations.length) {
  git('reset', '--hard', '--quiet', 'HEAD');
  git('clean', '-fdq', '--', 'frontend/src', 'backend/tests');
}
finish({ ok: violations.length === 0, empty: false, files, violations });
