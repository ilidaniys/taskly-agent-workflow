#!/usr/bin/env node
// Builds the pull-request comment from pipeline artifacts. Prints Markdown to stdout.
// Agent-written text is untrusted: it is length-limited and neutralised before rendering.
// Usage: render-comment.mjs <artifacts dir>   (state comes from environment variables)
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'artifacts');
const readJson = (...parts) => {
  const file = path.join(root, ...parts);
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
};
const env = process.env;
const units = readJson('unit-test-agent-gate', 'units.json');
const report = readJson('unit-test-agent-output', 'report.json');
const usage = readJson('unit-test-agent-output', 'run.json');
const verify = readJson('unit-test-agent-verify', 'verify.json');

const clean = (value, limit = 240) => {
  const text = String(value ?? '')
    .replace(/<!--[\s\S]*?-->/g, '').replace(/[\r\n\t]+/g, ' ')
    .replace(/[<>]/g, (character) => (character === '<' ? '&lt;' : '&gt;'))
    .replace(/[|`*_[\]()!#~]/g, '\\$&').replace(/@/g, '@\u200b').replace(/https?:\/\//gi, '').trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
};
const code = (value) => `\`${String(value ?? '').replace(/[`\r\n|]/g, '').slice(0, 160)}\``;
const list = (value) => (Array.isArray(value) ? value.slice(0, 30) : []);
const short = (sha) => String(sha ?? '').slice(0, 7);

let state;
if (env.GATE_TESTABLE === '0') state = 'no_units';
else if (env.AGENT_RESULT !== 'success') state = 'agent_failed';
else if (env.PUSH_OUTCOME === 'pushed') state = 'committed';
else if (env.PUSH_OUTCOME === 'stale') state = 'stale';
else if (env.PATCH_EMPTY === 'true') state = report?.decision === 'no_tests_needed' ? 'no_tests_needed' : 'blocked';
else state = 'rejected';

const HEADLINE = {
  no_units: 'No testable source changes — agent not started.',
  agent_failed: 'The agent run failed. No tests were committed.',
  committed: `Tests committed in ${code(short(env.COMMIT_SHA))}.`,
  stale: 'Tests were verified but not pushed: the branch moved on during the run. A newer run covers the new head.',
  no_tests_needed: 'The agent decided no test changes are needed.',
  blocked: 'The agent could not produce passing tests. Nothing was committed.',
  rejected: 'The agent\'s tests were rejected by independent verification. Nothing was committed.',
};

const lines = ['<!-- unit-test-agent -->', '## Unit-test agent', '', `**${HEADLINE[state]}**`, ''];
lines.push(`Head ${code(short(env.HEAD_SHA))} · [workflow run](${env.RUN_URL})`, '');

if (state === 'no_units' && units) {
  const skipped = list(units.excluded);
  if (skipped.length) {
    lines.push('<details><summary>Changed files outside unit-test scope</summary>', '', '| File | Why |', '|---|---|');
    for (const file of skipped) lines.push(`| ${code(file.path)} | ${clean(file.reason)} |`);
    lines.push('', '</details>', '');
  }
}

if (verify) {
  lines.push('### Verification', '', 'Independent re-run in a job without secrets. This table is authoritative.', '');
  if (verify.failures?.length) {
    lines.push('**Rejected because:**', '');
    for (const failure of list(verify.failures)) lines.push(`- ${clean(failure, 300)}`);
    lines.push('');
  }
  if (verify.after) {
    const delta = (name, metric) => {
      const was = verify.before?.[name]?.coverage?.[metric];
      const is = verify.after?.[name]?.coverage?.[metric];
      if (typeof is !== 'number') return 'n/a';
      if (typeof was !== 'number') return `${is}%`;
      const change = is - was;
      return `${was}% → ${is}%${Math.abs(change) >= 0.01 ? ` (${change > 0 ? '+' : ''}${change.toFixed(2)})` : ''}`;
    };
    lines.push('| Package | Tests | Result | Type check | Lines | Branches | Functions |', '|---|---|---|---|---|---|---|');
    for (const name of ['backend', 'frontend']) {
      const now = verify.after[name];
      const then = verify.before?.[name];
      if (!now) continue;
      const passed = now.tests && now.tests.failed === 0 && now.tests.failed_files === 0 && now.exit === 0;
      lines.push(`| ${name} | ${then?.tests?.total ?? '?'} → ${now.tests?.total ?? '?'} | ${passed ? 'pass' : 'FAIL'} | ${now.typecheck === 0 ? 'pass' : 'FAIL'} | ${delta(name, 'lines')} | ${delta(name, 'branches')} | ${delta(name, 'functions')} |`);
    }
    lines.push('');
  }
  if (verify.files?.length) {
    lines.push('<details><summary>Test files in the patch</summary>', '');
    for (const file of list(verify.files)) lines.push(`- ${code(file.path)} (${clean(file.status, 12)})`);
    lines.push('', '</details>', '');
  }
}

if (report) {
  lines.push('### Agent decisions', '', 'Reported by the agent; not independently checked.', '');
  if (report.summary) lines.push(`> ${clean(report.summary, 500)}`, '');
  const rows = list(report.units);
  if (rows.length) {
    lines.push('| Unit | Action | Reason | Test file |', '|---|---|---|---|');
    for (const unit of rows) {
      lines.push(`| ${code(unit.path)} | ${clean(unit.action, 10)} | ${clean(unit.reason)} | ${unit.test_file ? code(unit.test_file) : ''} |`);
    }
    lines.push('');
  }
  const bugs = list(report.suspected_bugs);
  if (bugs.length) {
    lines.push('### Suspected bugs in source', '', 'The agent left these untested instead of asserting the current behaviour. Please review.', '');
    for (const bug of bugs) lines.push(`- ${code(bug.path)} — expected: ${clean(bug.expected)}; actual: ${clean(bug.actual)}`);
    lines.push('');
  }
  const injections = list(report.suspected_injection);
  if (injections.length) {
    lines.push('### Possible prompt injection', '', 'Content in the diff tried to instruct the agent. Review these files.', '');
    for (const item of injections) lines.push(`- ${clean(typeof item === 'string' ? item : JSON.stringify(item), 300)}`);
    lines.push('');
  }
  const notes = list(report.notes);
  if (notes.length) {
    lines.push('<details><summary>Agent notes</summary>', '');
    for (const note of notes) lines.push(`- ${clean(note, 300)}`);
    lines.push('', '</details>', '');
  }
  const skills = list(report.skills_used).map((skill) => code(skill)).join(', ');
  if (skills) lines.push(`Skills used: ${skills}`, '');
} else if (state !== 'no_units') {
  lines.push('The agent left no report.', '');
}

if (usage) {
  const parts = [];
  if (typeof usage.turns === 'number') parts.push(`${usage.turns} turns`);
  if (typeof usage.duration_ms === 'number') parts.push(`${Math.round(usage.duration_ms / 1000)} s`);
  if (typeof usage.cost_usd === 'number') parts.push(`$${usage.cost_usd.toFixed(2)}`);
  if (parts.length) lines.push(`<sub>Agent run: ${parts.join(' · ')}</sub>`, '');
}
lines.push('<sub>Add the `skip-test-agent` label to opt this pull request out.</sub>');
console.log(lines.join('\n'));
