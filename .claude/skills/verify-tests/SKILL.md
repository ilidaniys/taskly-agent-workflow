---
name: verify-tests
description: Run unit tests, coverage, type checks and formatting for the backend or frontend package through one fixed script, and interpret the result. Use after writing or changing any test, before reporting.
---

# Verify tests

All execution goes through one script. Do not call `npm`, `npx` or `vitest`
directly.

```sh
bash .claude/skills/verify-tests/scripts/run-tests.sh frontend src/lib/http.test.ts
bash .claude/skills/verify-tests/scripts/run-tests.sh backend tests/factory.test.ts
bash .claude/skills/verify-tests/scripts/run-tests.sh frontend --format src/lib/http.test.ts
bash .claude/skills/verify-tests/scripts/run-tests.sh backend --typecheck
bash .claude/skills/verify-tests/scripts/run-tests.sh frontend --coverage
```

| Form | Does |
|---|---|
| `<package> <files...>` | Runs the given test files |
| `<package> --format <files...>` | Prettier on the given files (frontend only) |
| `<package> --typecheck` | `tsc --noEmit` for the package |
| `<package> --coverage` | Whole package with the coverage table |

**One command per Bash call, written out in full exactly as above.** No shell
variables, pipes, `;`, `&&`, redirects or `cd`: the permission system allows
only this literal command prefix and denies everything else.

Paths are relative to the package directory.

## Required sequence

1. Run each test file you touched. Red → read the failure, fix the **test**
   if the test is wrong, re-run. At most 3 attempts per file.
2. `--format` every frontend test file you touched.
3. `--typecheck` each package you touched. Type errors in tests count as
   failures.
4. `--coverage` for each package you touched. The whole suite must be green
   and the command must exit 0 (the backend enforces per-file thresholds).

## Reading the result

- A failure that shows the source disagrees with its evident intent is a
  **suspected bug**: remove that assertion, keep the rest, report it. Do not
  assert the buggy behaviour and do not edit source.
- In the coverage table check the rows of the units you worked on. Lines
  still listed under "Uncovered Line #s" for those units need either another
  test or an explicit reason in the report (for example unreachable guard).
- Flaky result (passes on re-run without changes) → find the cause: shared
  state, real timers, unawaited promises. Never report a flaky test as done.

Record every command's outcome for the report: package, mode, passed or
failed, number of tests.

A separate pipeline job re-runs everything from scratch and compares
coverage before and after; a claim that does not hold there is rejected.
