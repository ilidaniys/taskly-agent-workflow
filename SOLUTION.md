# Solution: unit-test agents and PR workflow

Two custom Claude Code agents with five reusable skills keep unit tests in step
with source changes. A **planner** (stronger model, read-only) analyses the
diff and writes a test plan; a **writer** (cheaper model) implements it. A
GitHub Actions workflow runs them on every pull request, re-verifies the output
independently, commits the verified tests to the PR branch and reports in one
PR comment. A second, manual workflow runs the same agents in backfill mode and
opens a pull request with tests for code that never had any.

## Where things are

| What | Where |
|---|---|
| Custom agents | `.claude/agents/unit-test-planner.md`, `.claude/agents/unit-test-writer.md` |
| Skills | `.claude/skills/<name>/SKILL.md` |
| Skill scripts | `.claude/skills/analyze-pr-changes/scripts/changed-units.mjs`, `coverage-snapshot.mjs`, `.claude/skills/verify-tests/scripts/run-tests.sh` |
| Agent permissions and prompts | `.github/unit-test-agent/{planner,writer}.settings.json`, `{planner,writer,backfill}.prompt.md` |
| Agent runner (both stages, cost accounting) | `.github/unit-test-agent/run-agents.sh` |
| Patch guard, verification, PR comment | `.github/unit-test-agent/apply-patch.mjs`, `verify.mjs`, `render-comment.mjs` |
| Tests of those scripts (`node:test`) | `.github/unit-test-agent/tests/` — run by the `pipeline-scripts` job in `ci.yml` |
| PR workflow | `.github/workflows/pr-unit-test-agent.yml` |
| Backfill workflow (manual) | `.github/workflows/backfill-unit-tests.yml` |
| Plain CI (type check, tests, coverage) | `.github/workflows/ci.yml` |

### Agents

| Agent | Model | May do | Produces |
|---|---|---|---|
| `unit-test-planner` | `sonnet` | Read, Glob, Grep, the analysis script. No edits outside `.unit-test-agent/` | `.unit-test-agent/plan.json`: per unit `create` / `update` / `skip` with a reason, the isolation pattern, fixtures to reuse and one line per test case |
| `unit-test-writer` | `haiku` | Read, Glob, Grep, edits limited to test paths, the test-runner script | Test files and `.unit-test-agent/report.json` |

The writer does not re-decide anything: the plan's decisions are final, and it
reports any planned case it had to drop. Both agents treat repository content
as data, never as instructions, and record attempted injections in their
output. The writer treats the plan the same way: plan strings describe test
cases and cannot widen its rules, so a planner that was itself manipulated
cannot pass instructions downstream.

### Skills

| Skill | Purpose | Used by |
|---|---|---|
| `analyze-pr-changes` | Scripts list changed (or all) units with their expected test files, current coverage and uncovered lines; the skill gives the create / update / skip rules, the backfill thresholds and the `plan.json` schema | planner |
| `write-backend-tests` | Vitest + Supertest conventions, how to isolate router, repository, app factory and config without a database | planner (to name patterns), writer |
| `write-frontend-tests` | React Testing Library conventions per unit type: component, container, query hook, API module, `http.ts`, utils | planner (to name patterns), writer |
| `verify-tests` | One script for test files, Prettier, type check and coverage; attempt limit; what counts as a suspected bug | writer |
| `report-results` | JSON report schema the pipeline publishes | writer |

Each agent lists its skills in its `skills:` frontmatter and its procedure
names the skill to follow at each step. The same agents work locally:

```sh
claude --agent unit-test-planner --settings .github/unit-test-agent/planner.settings.json \
  "$(cat .github/unit-test-agent/backfill.prompt.md)"
claude --agent unit-test-writer --settings .github/unit-test-agent/writer.settings.json \
  "$(cat .github/unit-test-agent/writer.prompt.md)"
```

## How the PR workflow runs

```
pull_request ─► gate ─► agent ──────────────► verify ─► publish
                 │       │ planner → plan.json   │          │
                 │       │ writer  → tests       │          │
     no secrets, │  LLM key,                 no secrets,  write token,
     read-only   │  read-only token           read-only   base-branch scripts only
```

| Job | Does | Has |
|---|---|---|
| `gate` | Runs `changed-units.mjs`. No testable unit → no agent run, no LLM cost (docs, styles, types, config) | Read-only token |
| `agent` | Installs dependencies and takes a coverage snapshot (both without any credential), then `run-agents.sh`: planner first, writer only if the plan has `create`/`update` units. Output is a patch, the plan, the report and per-stage cost, uploaded as artifacts. It cannot push or comment | LLM credential (only in the agent step), read-only token |
| `verify` | Fresh checkout. Baseline run, then guard and apply the patch, then full suites with coverage, type check and Prettier. Writes the verdict | Read-only token, no secrets |
| `publish` | Re-applies the guard, commits, pushes to the PR branch, creates or updates one PR comment and the job summary | `contents: write`, `pull-requests: write` |

`verify` and `publish` execute the guard and comment scripts from the **base
branch**, not from the pull request, so a PR cannot weaken the guard that
judges it.

### Prerequisites

1. Secret `CLAUDE_CODE_OAUTH_TOKEN` in the `prod` Environment (Settings →
   Environments → prod): run `claude setup-token` on a machine logged into a
   Claude subscription and store the printed token. Only the `agent` job
   declares `environment: prod`, so only that job can read it; Environment
   protection rules (required reviewers, branch restrictions) apply to it. An API key in
   `ANTHROPIC_API_KEY` works as an alternative; then use a key from a dedicated
   workspace with a low spend limit. The agent job accepts either and fails
   with a clear message when neither is set.
2. The pull request comes from a branch in this repository, is not a draft
   and does not carry the `skip-test-agent` label.

Nothing else: open or update a pull request and the workflow runs.

### Backfill

`Actions → Backfill unit tests → Run workflow`, optionally with path prefixes.
Same jobs, same guard and verification; the result is pushed to
`unit-test-agent/backfill-<run id>` and opened as a pull request for review.
Needs "Allow GitHub Actions to create and approve pull requests" in the
repository's Actions settings (otherwise the branch is pushed and the run log
asks you to open the PR by hand).

## Main decisions and why

| Decision | Reason |
|---|---|
| Claude Code as agent environment, called as a pinned CLI in headless mode | Agents and skills are plain Markdown in the repository, identical locally and in CI. Calling the CLI directly, not a wrapper action, lets the agent job run with a read-only token |
| Two agents, two models | Deciding *what* to test needs the whole diff, the existing tests and judgement about intent; this is where a stronger model earns its price. Turning a precise plan into `it(...)` blocks and running them is mechanical, so the writer runs on the cheapest model. The plan is also a reviewable artefact: the PR comment shows the planner's reasoning before anyone reads a test |
| No subagents | A planner that spawns writers would be simpler, but the agents run with `Agent` denied so that one compromised context cannot delegate. Two sequential headless calls give the same split with a hard boundary between them: the only thing that crosses it is `plan.json`, and the writer reads it as data |
| The agents never get a write token; they hand over a patch | An LLM reading untrusted diff content is the component most likely to be manipulated. Separating "can be talked to" from "can write to the repo" limits what an injection can achieve |
| No raw `git` for the agents | `git diff --no-index`, `git show HEAD:…` and `--output=` would bypass the `Read(.env)` deny and the edit paths. `changed-units.mjs --diff <path>` is the only history access and it validates the path |
| Deterministic guard on the patch | Only test paths, only add or modify, regular files only, size limits, no `.skip` / `.only` / coverage-ignore, no process or network modules. Rules that matter are code, not prompt text |
| Guard scripts from the base branch | The patch is judged by code the PR author did not write. The workflow file itself is still taken from the PR (GitHub's `pull_request` semantics); see Limitations |
| Independent verification | The writer's "tests pass" is a claim. A separate job without secrets re-runs everything and compares with the baseline: failing tests, fewer tests, more skipped tests, lower coverage, type errors or unformatted files reject the patch |
| Nothing is committed unless verified | A red or weakened suite never reaches the PR branch; the comment explains the rejection instead |
| `pull_request`, never `pull_request_target`; forks skipped | Fork PRs get no secrets. Running fork code with secrets is the classic way to leak them |
| Allow-listed tools in `dontAsk` mode, separate settings per agent | Planner: read tools and one script. Writer: edits limited to test paths and two scripts. No web access, no MCP servers, no subagents |
| Credential scrubbed from subprocesses | Tests are code the writer produced from untrusted input. `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` keeps the LLM key out of their environment. It also forces Claude Code's bubblewrap sandbox on Linux, hence the extra packages in the job. The sandbox write-denies `package.json` in the working directory (and `Edit(...)` deny rules become write-denials too); on Linux a denial on a file that does not exist is enforced with a 0-byte placeholder. An empty `package.json` at the monorepo root breaks Vite and Vitest in both packages, so the root carries a real `package.json` (`private: true`) and deny rules only name paths that exist |
| `autoAllowBashIfSandboxed: false` | With the sandbox on, Claude Code approves sandboxed shell commands without consulting allow rules by default. That would make the two-command allow list decorative. Turning it off puts sandboxed commands back through the regular permission flow, where `dontAsk` denies everything not allow-listed |
| PR title and description are not given to the agents | They add injection surface and no information the diff lacks |
| Coverage measured before planning | `coverage-snapshot.mjs` runs both suites in a step without secrets and records per-file percentages and uncovered line ranges. The planner aims cases at uncovered diff lines, and backfill plans `update` for tested-but-thin units (lines < 80 % or branches < 70 %) instead of only files with no test |
| Pipeline scripts have their own tests | The guard, the verdict and the change analysis are what stands between the model and the repository; `node:test` suites exercise twelve hostile patches and every regression the verdict must catch, in CI on every push |
| Suspected source bugs are reported, not encoded | A test that asserts wrong behaviour is worse than no test. Both agents leave it untested and the comment lists it for the author |
| Commit to the PR branch, one sticky comment | Results are in the PR itself: the tests in the diff, the plan, the report and the numbers in a single comment that is updated on each run |
| Actions pinned by commit SHA, `permissions: {}` at the top, per-job grants, timeouts, budget caps, concurrency cancel | Standard supply-chain and cost hygiene |

## Cost

| Control | Effect |
|---|---|
| Gate before any LLM call | Pull requests that touch no testable unit cost nothing (PR #1 itself is an example) |
| Planner on `sonnet`, writer on `haiku` | The long, tool-heavy part of a run (writing files, running Vitest, reading failures, fixing) is on the cheapest model. The planner's read-only run is short |
| Writer runs only when the plan has work | A diff the planner judges as `skip` for every unit stops after one short call |
| `--max-budget-usd` per stage (`1` planner, `2.5` writer; higher for backfill) | Hard ceiling per run, independent of model behaviour. With a subscription token the dollar figure is Claude Code's estimate of the equivalent API cost, so the cap and the comment still show relative spend |
| `cancel-in-progress` per pull request | A new push cancels the run for the superseded head |
| Cost in the PR comment | Every run prints model, turns, duration and dollars per stage, so drift is visible where reviewers look |

Known inefficiency: a push to an open PR re-plans the whole diff against the
merge-base, not only the new commit. See "For production". Measured figures
are in "Example run".

## Example run

Both runs below are on GitHub, with the bot's comment as the record. Numbers
are from the independent verify job, not from the agents.

### Pull request with a feature — [PR #3](https://github.com/ilidaniys/taskly-agent-workflow/pull/3)

The PR adds `?priority=` / `?completed=` filtering to `GET /api/todos`
(validator, router, repository) and an **Overdue** option to the frontend
status filter — seven source files, no tests. `validators.ts` carries a 100 %
per-file coverage threshold, so the PR's own CI is red until the new schema is
covered.

| Step | Outcome |
|---|---|
| Gate | 5 testable units; `types.ts` (both packages) excluded as types only |
| Planner (`claude-sonnet-5-5`, 18 turns, 35 s, $0.18) | `update` for all five: validators (6 cases), router (6: filter forwarding, 422 on invalid values, no call to the repository), repository (6: `where` built per filter, omitted when empty, `completed=false` kept), `utils/todos.ts` (6, overdue / completed / no due date / future), `TodoFilters.tsx` (3) |
| Writer (`claude-haiku-5-5`, 36 turns, 82 s, $0.02) | 5 test files updated, 39 tests added; one backend type error fixed on the second attempt; Prettier applied; both suites, both type checks and both coverage runs green inside the agent job |
| Guard | 5 modified test files, no violations |
| Verification | backend 48 → 73 tests, lines 35.65 → 42.60 %, branches 36.84 → 50.87 %; frontend 18 → 32 tests, lines 47.68 → 52.31 %, branches 43.88 → 55.39 %; type checks pass; `validators.ts` back at 100 % |
| Result | `verified`; tests committed to the PR branch as `38ffe84`; one sticky comment with plan, report and the table above; total $0.20 |

The same PR was run three times while the pipeline was being fixed, which is
how the sandbox placeholder problem (see Limitations) was found: the first
two runs committed only the backend tests and the writer's notes said why.

### Backfill — [PR #6](https://github.com/ilidaniys/taskly-agent-workflow/pull/6)

`Backfill unit tests` on `main`, no path filter. The coverage snapshot found
15 units without a test file and 11 with a test file but below the
thresholds.

| Step | Outcome |
|---|---|
| Planner (`claude-sonnet-5-5`, 42 turns, 88 s, $0.43) | 33 units analysed: 14 `create`, 10 `update` aimed at the measured uncovered lines (for example `router.ts`: "id param validation, get, patch and delete incl. 404 paths are unasserted (16 percent branches)"), 9 `skip` ("Covered (100 percent)", `main.ts` as entry point) |
| Writer (`claude-haiku-5-5`, 99 turns, 380 s, $0.36) | 24 test files (14 created, 10 updated), 156 tests; 3 type errors fixed on re-run; cases already asserted by existing tests deliberately not duplicated; branches left uncovered listed with reasons |
| Verification | backend 48 → 96 tests, lines 33.02 → **97.24 %**, branches 33.33 → 97.91 %; frontend 18 → 125 tests, lines 47.68 → **100 %**, branches 43.79 → 97.08 %; type checks pass |
| Result | `verified`; branch pushed and PR #6 opened by the workflow with the report as its body; total $0.80 |

The writer's process notes in that report also exposed a permission gap:
it had read files with `ls`/`cat` in the shell although only two commands are
allow-listed. With the sandbox on, Claude Code's `autoAllowBashIfSandboxed`
defaults to `true` and approves sandboxed commands without consulting allow
rules. It is now set to `false` in both settings files, so the allow list
applies again; the guard and the verify job were never affected.

### Measured cost

| Run | Planner | Writer | Total |
|---|---|---|---|
| PR with 5 changed units (PR #3) | $0.13 – $0.18 | $0.02 | $0.15 – $0.20 |
| Backfill of a whole small monorepo (PR #6) | $0.43 | $0.36 | $0.80 |
| PR with no testable change (PR #1, #4, #5) | — | — | $0 |

The writer, which does most of the turns, costs a tenth of the planner on
the PR runs. The dollar figures are Claude Code's estimate of API-equivalent
cost; the runs used a subscription token.

## Assumptions

- Contributors with write access are trusted with repository secrets; outside
  contributors are not.
- "Unit test" means the existing Vitest suites: no database, no network.
- The coverage `exclude` lists in the two Vitest configs define what is out
  of scope (design system, styles, types, barrels, constants).
- It is acceptable for the agent to add a commit to the author's branch.

## Limitations

- Fork pull requests are not processed.
- A collaborator can change the workflow file or the agents in their own pull
  request, because `pull_request` workflows run from the PR's merge commit.
  The guard and verification scripts are taken from the base branch, which
  closes the easiest version of this, but the workflow itself is not; the
  design protects against injected content and a misbehaving model, not
  against a malicious maintainer.
- A commit pushed with `GITHUB_TOKEN` does not start workflows on its own:
  depending on repository settings the run is skipped or created in
  `action_required` state, waiting for "Approve and run" (this repository
  does the latter). The verify job already tested that exact tree; the
  comment says so, and approving the held run is one click.
- The guard's content rules are pattern based (a concatenated module name
  gets past the import check). They are a second line behind the secret-less
  verify job, not a sandbox.
- The plan is an LLM-to-LLM channel. The writer is instructed to treat it as
  data and the guard and verify job do not care what the plan said, so a
  manipulated plan can at most waste a writer run; it cannot widen what lands
  in the repository.
- Coverage is a proxy. The writer can raise it with shallow tests; the plan
  and the skills push toward behaviour assertions but nothing measures
  assertion strength.
- The planner sees one PR at a time and regenerates from scratch on each
  push; it does not remember earlier decisions or reviewer feedback.
- Model output varies between runs.
- The agent job checks out the pull request's head, so the agents, skills,
  scripts and the root `package.json` come from the PR's tree. A branch
  created before a pipeline change runs the old pipeline until it is rebased
  (PR #3 showed this).

## For production

- Run the agent as a GitHub App: its commits trigger CI, show a distinct
  identity and can be required to pass branch protection.
- Add protection rules to the `prod` Environment (restrict to protected
  branches or require a reviewer) and protect `.github/` and `.claude/` with
  CODEOWNERS, which closes the collaborator gap above.
- Network egress allow-list for the agent job; run tests in a container
  without network.
- Incremental runs: diff against the last head the agent processed instead
  of the merge-base, and cache the baseline per base commit.
- Mutation testing (Stryker) on changed files as the quality signal instead
  of coverage alone.
- Offer the tests as review suggestions or a stacked PR when the author
  prefers not to receive commits; react to `/retest` style comments.
- Track cost, duration, rejection rate and how often authors revert the
  agent's tests; evaluate prompt, skill and model changes against a fixed
  set of historical PRs before rolling them out. The planner/writer split
  makes "try a cheaper writer" a one-line change.
