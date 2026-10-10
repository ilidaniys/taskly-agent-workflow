Backfill mode.

The repository is checked out in the current directory. There is no pull
request: run the analysis script with `--all`, consider every source unit
whose `test_exists` is false, and plan tests for the ones that have behaviour
worth asserting. Units that already have a test file are out of scope for this
run unless they are listed below.

Write `.unit-test-agent/plan.json`.
