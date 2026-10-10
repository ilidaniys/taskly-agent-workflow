#!/usr/bin/env node
// Runs both Vitest suites with coverage and writes one per-file snapshot that
// changed-units.mjs attaches to each unit: line/branch/function percentages and the
// uncovered line ranges. Deterministic and LLM-free; the pipeline runs it in a step
// without secrets, before the agents start.
// Usage: coverage-snapshot.mjs [output file]   (default .unit-test-agent/coverage.json)
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
process.chdir(root);
const output = path.resolve(process.argv[2] ?? '.unit-test-agent/coverage.json');
const PACKAGES = ['backend', 'frontend'];

const ranges = (lines) => {
  const sorted = [...new Set(lines)].sort((a, b) => a - b);
  const parts = [];
  for (let index = 0; index < sorted.length; ) {
    let end = index;
    while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1) end += 1;
    parts.push(end === index ? `${sorted[index]}` : `${sorted[index]}-${sorted[end]}`);
    index = end + 1;
  }
  return parts.join(', ');
};

const files = {};
const packages = {};
for (const name of PACKAGES) {
  const dir = path.join(root, name);
  rmSync(path.join(dir, 'coverage'), { recursive: true, force: true });
  const run = spawnSync('npx', [
    '--no-install', 'vitest', 'run', '--coverage', '--coverage.reportOnFailure',
    '--coverage.reporter=json', '--coverage.reporter=json-summary', '--reporter=dot',
  ], { cwd: dir, stdio: 'inherit', env: { ...process.env, CI: 'true', GITHUB_ACTIONS: '' } });
  const summaryFile = path.join(dir, 'coverage', 'coverage-summary.json');
  const finalFile = path.join(dir, 'coverage', 'coverage-final.json');
  if (!existsSync(summaryFile) || !existsSync(finalFile)) {
    packages[name] = { exit: run.status ?? 1, error: 'no coverage report produced' };
    continue;
  }
  const summary = JSON.parse(readFileSync(summaryFile, 'utf8'));
  const detail = JSON.parse(readFileSync(finalFile, 'utf8'));
  packages[name] = { exit: run.status ?? 1, total: Object.fromEntries(
    ['lines', 'branches', 'functions'].map((metric) => [metric, summary.total[metric].pct]),
  ) };
  for (const [absolute, metrics] of Object.entries(summary)) {
    if (absolute === 'total') continue;
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    const coverage = detail[absolute];
    const uncovered = [];
    if (coverage) {
      for (const [id, count] of Object.entries(coverage.s ?? {})) {
        if (count > 0) continue;
        const location = coverage.statementMap[id];
        for (let line = location.start.line; line <= location.end.line; line += 1) uncovered.push(line);
      }
    }
    files[relative] = {
      lines: metrics.lines.pct, branches: metrics.branches.pct, functions: metrics.functions.pct,
      uncovered_lines: ranges(uncovered),
    };
  }
}

mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify({ generated_at: new Date().toISOString(), packages, files }, null, 2)}\n`);
console.log(JSON.stringify({ packages, files: Object.keys(files).length }, null, 2));
process.exit(0);
