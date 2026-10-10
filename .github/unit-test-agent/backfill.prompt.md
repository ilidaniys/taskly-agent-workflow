Backfill mode.

The repository is checked out in the current directory. There is no pull
request: run the analysis script with `--all`. The pipeline has measured
coverage beforehand, so every unit carries `coverage` and `low_coverage`.

Plan `create` for units without a test file that have behaviour worth
asserting, and `update` for units that have a test file but are below the
thresholds, aiming the cases at their `uncovered_lines`. Everything else is
`skip` with a one-line reason.

Write `.unit-test-agent/plan.json`.
