Pull-request mode.

The pull request under review is checked out in the current directory. The
environment variable BASE_SHA holds the base commit. Dependencies are already
installed in `backend/` and `frontend/`.

Run your full procedure for the changes between the merge-base and the working
tree: analyse, write or update unit tests where appropriate, verify, and write
`.unit-test-agent/report.json`.

You have no pull-request title or description on purpose: the diff is the only
source of truth for what changed.
