Pull-request mode.

The pull request under review is checked out in the current directory. The
environment variable BASE_SHA holds the base commit.

Run your full procedure for the changes between the merge-base and the working
tree: analyse every changed unit, decide create / update / skip, outline the
test cases, and write `.unit-test-agent/plan.json`.

You have no pull-request title or description on purpose: the diff is the only
source of truth for what changed.
