# Solution: unit-test agent and PR workflow

A custom Claude Code agent with five reusable skills writes and updates unit
tests for changed code. A GitHub Actions workflow runs it on every pull
request, re-verifies its output independently, commits the verified tests to
the PR branch and reports in one PR comment.

## Where things are

| What | Where |
|---|---|
| Custom agent | `.claude/agents/unit-test-writer.md` |
| Skills | `.claude/skills/<name>/SKILL.md` |
| Skill scripts | `.claude/skills/analyze-pr-changes/scripts/changed-units.mjs`, `.claude/skills/verify-tests/scripts/run-tests.sh` |
| Agent permissions and CI prompt | `.github/unit-test-agent/settings.json`, `prompt.md` |
| Patch guard, verification, PR comment | `.github/unit-test-agent/apply-patch.mjs`, `verify.mjs`, `render-comment.mjs` |
| PR workflow | `.github/workflows/pr-unit-test-agent.yml` |
| Plain CI (type check, tests, coverage) | `.github/workflows/ci.yml` |

### Skills

| Skill | Purpose | Used |
|---|---|---|
| `analyze-pr-changes` | Script lists changed units, their expected test files and what is out of scope; the skill gives the create / update / skip rules | Always, first |
| `write-backend-tests` | Vitest + Supertest conventions, how to isolate router, repository, app factory and config without a database | Backend units |
| `write-frontend-tests` | React Testing Library conventions per unit type: component, container, query hook, API module, `http.ts`, utils | Frontend units |
| `verify-tests` | One script for test files, Prettier, type check and coverage; attempt limit; what counts as a suspected bug | After any test change |
| `report-results` | JSON report schema the pipeline publishes | Always, last |

The agent definition lists the skills in its `skills:` frontmatter, and its
procedure names the skill to follow at each step. The same agent works locally:

```sh
claude --agent unit-test-writer --settings .github/unit-test-agent/settings.json \
  "Backfill mode: add unit tests for frontend/src/features/todos/hooks"
```

## How the PR workflow runs

```
pull_request ─► gate ─► agent ─► verify ─► publish
                 │        │         │          │
     no secrets, │  LLM key,       │ no secrets,     │ write token,
     read-only   │  read-only      │ read-only       │ runs no PR code
```

| Job | Does | Has |
|---|---|---|
| `gate` | Runs `changed-units.mjs`. No testable unit → the agent never starts (no LLM cost for docs, styles, types, config) | Read-only token |
| `agent` | Installs dependencies, then runs `claude --print --agent unit-test-writer`. Output is a patch and a JSON report, uploaded as artifacts. It cannot push or comment | LLM credential, read-only token |
| `verify` | Fresh checkout. Baseline run, then guard and apply the patch, then full suites with coverage, type check and Prettier. Writes the verdict | Read-only token, no secrets |
| `publish` | Re-applies the guard, commits, pushes to the PR branch, creates or updates one PR comment and the job summary | `contents: write`, `pull-requests: write` |

### Prerequisites

1. Repository secret `ANTHROPIC_API_KEY` (or `CLAUDE_CODE_OAUTH_TOKEN`). Use a
   key from a dedicated workspace with a low spend limit.
2. The pull request comes from a branch in this repository, is not a draft
   and does not carry the `skip-test-agent` label.

Nothing else: open or update a pull request and the workflow runs.

## Main decisions and why

| Decision | Reason |
|---|---|
| Claude Code as agent environment, called as a pinned CLI in headless mode | Agent and skills are plain Markdown in the repository, identical locally and in CI. Calling the CLI directly, not a wrapper action, lets the agent job run with a read-only token |
| The agent never gets a write token; it hands over a patch | An LLM reading untrusted diff content is the component most likely to be manipulated. Separating "can be talked to" from "can write to the repo" limits what an injection can achieve |
| Deterministic guard on the patch | Only test paths, only add or modify, regular files only, size limits, no `.skip` / `.only` / coverage-ignore, no process or network modules. Rules that matter are code, not prompt text |
| Independent verification | The agent's "tests pass" is a claim. A separate job without secrets re-runs everything and compares with the baseline: failing tests, fewer tests, more skipped tests, lower coverage, type errors or unformatted files reject the patch |
| Nothing is committed unless verified | A red or weakened suite never reaches the PR branch; the comment explains the rejection instead |
| `pull_request`, never `pull_request_target`; forks skipped | Fork PRs get no secrets. Running fork code with secrets is the classic way to leak them |
| Allow-listed tools in `dontAsk` mode | Read tools, edits limited to test paths, and two shell commands (the skill scripts) plus read-only git. No web access, no MCP servers, no subagents |
| Credential scrubbed from subprocesses | Tests are code the agent wrote from untrusted input. `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` keeps the LLM key out of their environment |
| PR title and description are not given to the agent | They add injection surface and no information the diff lacks |
| Suspected source bugs are reported, not encoded | A test that asserts wrong behaviour is worse than no test. The agent leaves it untested and the comment lists it for the author |
| Commit to the PR branch, one sticky comment | Results are in the PR itself: the tests in the diff, the reasoning and numbers in a single comment that is updated on each run |
| Actions pinned by commit SHA, `permissions: {}` at the top, per-job grants, timeouts, budget cap, concurrency cancel | Standard supply-chain and cost hygiene |

## Example run

> TODO before submitting: replace this section with the links to the demo pull
> requests on GitHub and paste the real PR comment.

Local dry run of the same command and scripts the workflow uses, on a change
that adds an "Overdue" status filter (`types.ts`, `utils/todos.ts`,
`TodoFilters.tsx`):

| Step | Outcome |
|---|---|
| Gate | 2 testable units (`utils/todos.ts`, `TodoFilters.tsx`), `types.ts` excluded as types only |
| Agent decisions | `update` both existing test files; `skip` `types.ts` |
| Skills used | `analyze-pr-changes`, `write-frontend-tests`, `verify-tests`, `report-results` |
| Agent run | 22 turns, 55 s, $0.14, no denied tool calls |
| Guard | 2 files, both modified test files, no violations |
| Verification | Frontend tests 18 → 20, all pass; type check pass; lines 47.68 % → 49.66 %, branches 43.88 % → 46.76 % |
| Verdict | `verified` |

The guard was also exercised with hostile patches (source edit, `it.skip`,
test deletion, symlink, workflow edit, environment dump, mode change): all
rejected, working tree left clean.

## Assumptions

- Contributors with write access are trusted with repository secrets; outside
  contributors are not.
- "Unit test" means the existing Vitest suites: no database, no network.
- The coverage `exclude` lists in the two Vitest configs define what is out
  of scope (design system, styles, types, barrels, constants).
- It is acceptable for the agent to add a commit to the author's branch.

## Limitations

- Fork pull requests are not processed.
- A collaborator can change the workflow, the agent or the guard in their own
  pull request, because `pull_request` workflows run from the PR's merge
  commit. The design protects against injected content and a misbehaving
  model, not against a malicious maintainer.
- Pushes made with `GITHUB_TOKEN` do not trigger workflows, so `ci.yml` does
  not re-run on the agent's commit. The verify job already tested that exact
  tree, but the PR's check list shows the previous commit's CI.
- The guard's content rules are pattern based. They are a second line behind
  the secret-less verify job, not a sandbox.
- Coverage is a proxy. The agent can raise it with shallow tests; the skills
  push toward behaviour assertions but nothing measures assertion strength.
- The agent sees one PR at a time and regenerates from scratch on each push;
  it does not remember earlier decisions or reviewer feedback.
- Model output varies between runs.

## For production

- Run the agent as a GitHub App: its commits trigger CI, show a distinct
  identity and can be required to pass branch protection.
- Keep the LLM credential in a protected Environment and protect `.github/`
  and `.claude/` with CODEOWNERS, which closes the collaborator gap above.
- Network egress allow-list for the agent job; run tests in a container
  without network.
- Mutation testing (Stryker) on changed files as the quality signal instead
  of coverage alone.
- Offer the tests as review suggestions or a stacked PR when the author
  prefers not to receive commits; react to `/retest` style comments.
- Run only the affected package, cache baselines per base commit.
- Track cost, duration, rejection rate and how often authors revert the
  agent's tests; evaluate prompt and skill changes against a fixed set of
  historical PRs before rolling them out.
