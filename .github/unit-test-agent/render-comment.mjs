#!/usr/bin/env node
// Builds the pull-request comment (or backfill PR body) from pipeline artifacts. Prints Markdown.
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
const backfill = env.BACKFILL === '1';
const units = readJson('unit-test-agent-gate', 'units.json');
const plan = readJson('unit-test-agent-output', 'plan.json');
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
else if (env.PATCH_EMPTY === 'true') state = plan?.decision === 'no_tests_needed' || report?.decision === 'no_tests_needed' ? 'no_tests_needed' : 'blocked';
else state = 'rejected';

const HEADLINE = {
  no_units: 'No testable source changes — agent not started.',
  agent_failed: 'The agent run failed. No tests were committed.',
  committed: `Tests committed in ${code(short(env.COMMIT_SHA))}. GitHub does not start workflows for a commit pushed with the workflow token on its own (depending on repository settings the run is skipped or waits for "Approve and run"); the verification below ran on exactly that tree.`,
  stale: 'Tests were verified but not pushed: the branch moved on during the run. A newer run covers the new head.',
  no_tests_needed: 'The planner decided no test changes are needed.',
  blocked: 'The writer could not produce passing tests. Nothing was committed.',
  rejected: 'The agent\'s tests were rejected by independent verification. Nothing was committed.',
};
if (backfill) {
  HEADLINE.committed = 'Backfill: the tests in this pull request were written by the agents and passed independent verification.';
  HEADLINE.no_tests_needed = 'Backfill: the planner found nothing worth testing in the requested scope.';
}

const lines = ['<!-- unit-test-agent -->', '## Unit-test agent', '', `**${HEADLINE[state]}**`, ''];
lines.push(`${backfill ? 'Base' : 'Head'} ${code(short(env.HEAD_SHA))} · [workflow run](${env.RUN_URL})`, '');

if (state === 'agent_failed') {
  const why = [];
  for (const stage of ['planner', 'writer']) {
    const run = usage?.[stage];
    if (run && !run.skipped && run.is_error) why.push(`${stage}: ${clean(run.result || 'error', 300)}`);
  }
  if (why.length) { lines.push('**Reason:**', ''); for (const item of why) lines.push(`- ${item}`); lines.push(''); }
  else lines.push('See the workflow log; the agents did not report a reason (budget cap, timeout or a crash).', '');
}

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

if (plan) {
  lines.push('### Planner decisions', '', backfill
    ? 'Written by the planning agent from the source, the existing tests and the measured coverage; not independently checked.'
    : 'Written by the planning agent from the diff alone; not independently checked.', '');
  if (plan.summary) lines.push(`> ${clean(plan.summary, 500)}`, '');
  const rows = list(plan.units);
  if (rows.length) {
    lines.push('| Unit | Action | Reason | Planned cases |', '|---|---|---|---|');
    for (const unit of rows) {
      const cases = Array.isArray(unit.cases) ? unit.cases.length : '';
      lines.push(`| ${code(unit.path)} | ${clean(unit.action, 10)} | ${clean(unit.reason)} | ${cases} |`);
    }
    lines.push('');
  }
  const detailed = rows.filter((unit) => Array.isArray(unit.cases) && unit.cases.length);
  if (detailed.length) {
    lines.push('<details><summary>Planned test cases</summary>', '');
    for (const unit of detailed) {
      lines.push(`**${code(unit.test_file || unit.path)}** — ${clean(unit.pattern, 160)}`, '');
      for (const item of list(unit.cases)) lines.push(`- ${clean(item, 200)}`);
      lines.push('');
    }
    lines.push('</details>', '');
  }
} else if (state !== 'no_units') {
  lines.push('The planner left no plan.', '');
}

if (report) {
  lines.push('### Writer report', '', 'Reported by the implementing agent; not independently checked.', '');
  if (report.summary) lines.push(`> ${clean(report.summary, 500)}`, '');
  const rows = list(report.units).filter((unit) => unit.action === 'create' || unit.action === 'update');
  if (rows.length) {
    lines.push('| Unit | Action | Test file | Tests added |', '|---|---|---|---|');
    for (const unit of rows) {
      lines.push(`| ${code(unit.path)} | ${clean(unit.action, 10)} | ${unit.test_file ? code(unit.test_file) : ''} | ${Number.isFinite(unit.tests_added) ? unit.tests_added : ''} |`);
    }
    lines.push('');
  }
  const notes = list(report.notes);
  if (notes.length) {
    lines.push('<details><summary>Writer notes</summary>', '');
    for (const note of notes) lines.push(`- ${clean(note, 300)}`);
    lines.push('', '</details>', '');
  }
} else if (plan && plan.decision !== 'no_tests_needed' && state !== 'agent_failed') {
  lines.push('The writer left no report.', '');
}

const bugs = [...list(plan?.suspected_bugs), ...list(report?.suspected_bugs)];
if (bugs.length) {
  lines.push('### Suspected bugs in source', '', 'The agents left these untested instead of asserting the current behaviour. Please review.', '');
  for (const bug of bugs) lines.push(`- ${code(bug.path)} — expected: ${clean(bug.expected)}; actual: ${clean(bug.actual)}`);
  lines.push('');
}
const injections = [...list(plan?.suspected_injection), ...list(report?.suspected_injection)];
if (injections.length) {
  lines.push('### Possible prompt injection', '', 'Content in the diff tried to instruct an agent. Review these files.', '');
  for (const item of injections) lines.push(`- ${clean(typeof item === 'string' ? item : JSON.stringify(item), 300)}`);
  lines.push('');
}
const skills = [...new Set([...list(plan?.skills_used), ...list(report?.skills_used)])].map((skill) => code(skill)).join(', ');
if (skills) lines.push(`Skills used: ${skills}`, '');

if (usage) {
  const stage = (name, label) => {
    const run = usage[name];
    if (!run || run.skipped) return null;
    const parts = [];
    if (Array.isArray(run.models) && run.models.length) parts.push(code(run.models.join(', ')));
    if (typeof run.turns === 'number') parts.push(`${run.turns} turns`);
    if (typeof run.duration_ms === 'number') parts.push(`${Math.round(run.duration_ms / 1000)} s`);
    if (typeof run.cost_usd === 'number') parts.push(`$${run.cost_usd.toFixed(2)}`);
    return parts.length ? `${label} ${parts.join(' · ')}` : null;
  };
  const parts = [stage('planner', 'planner:'), stage('writer', 'writer:')].filter(Boolean);
  if (typeof usage.total_cost_usd === 'number' && parts.length) parts.push(`total $${usage.total_cost_usd.toFixed(2)}`);
  if (parts.length) lines.push(`<sub>Agent run — ${parts.join(' · ')}</sub>`, '');
}
if (!backfill) lines.push('<sub>Add the `skip-test-agent` label to opt this pull request out.</sub>');
console.log(lines.join('\n'));
