---
name: analyze-pr-changes
description: Determine which changed source units in a pull request (or which untested units in the repo) need unit tests created, updated or skipped. Use first, before writing any test.
---

# Analyse changes

## 1. Get the facts from the script, not from guessing

```sh
node .claude/skills/analyze-pr-changes/scripts/changed-units.mjs
```

- Compares the working tree with the merge-base of `$BASE_SHA` (falls back to
  `origin/main`). Pass `--base <sha>` to override.
- `--all` lists every source unit in the repo with `test_exists`, for backfill.

It prints JSON:

| Field | Meaning |
|---|---|
| `units[]` | Testable source files: `path`, `package`, `status` (`added`/`modified`/`renamed`/`deleted`), `expected_tests`, `test_exists` |
| `excluded[]` | Changed files that are out of unit-test scope by project convention, with the `reason` |
| `changed_tests[]` | Test files the author already touched |
| `other[]` | Files outside `backend/src` and `frontend/src` |
| `summary.testable` | Number of units to consider |

The exclusion list mirrors the coverage `exclude` settings in both
`vitest` configs. Do not second-guess it.

## 2. Read the actual diff of each unit

```sh
git diff <merge_base> -- <path>
```

`merge_base` is in the script output. Read the full file as well; a diff
hunk alone hides branches.

## 3. Decide per unit

| Decision | When |
|---|---|
| `create` | No test file exists and the unit has behaviour: branches, transformations, validation, error handling, state transitions, side-effect orchestration |
| `update` | A test file exists and the diff adds or changes behaviour not asserted yet, or makes existing assertions wrong |
| `skip` | The change has no behavioural effect (comments, formatting, renames of locals, import reordering); or behaviour is already fully asserted (check `changed_tests` — the author may have done it); or the unit is pure wiring with no logic (for example a process entry point); or the file was deleted |

For a `deleted` or `renamed` unit, check whether an orphaned test still
imports the old path; fixing that import is an `update`.

Every decision needs a specific reason that names the behaviour, such as
"new 422 branch for malformed id is not asserted", not "changed file".

If `summary.testable` is 0, the decision for the run is `no_tests_needed`.
Go straight to the report.
