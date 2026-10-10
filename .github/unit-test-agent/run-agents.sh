#!/usr/bin/env bash
# Runs the two-stage agent: unit-test-planner (stronger model, read-only) writes a plan,
# unit-test-writer (cheaper model) implements it. Collects patch, plan, report and usage
# into $OUT_DIR for the verify and publish jobs. Never pushes or comments.
#
# Env:  OUT_DIR              where artifacts go (required)
#       MODE                 pr (default) | backfill
#       BACKFILL_PATHS       optional, space-separated path prefixes for backfill mode
#       BASE_SHA             base commit (pr mode)
#       PLANNER_BUDGET_USD   default 1
#       WRITER_BUDGET_USD    default 2.5
#       CLAUDE_CODE_OAUTH_TOKEN (claude setup-token) or ANTHROPIC_API_KEY
set -uo pipefail
set -f # no glob expansion: BACKFILL_PATHS comes from a workflow input and is validated below

: "${OUT_DIR:?OUT_DIR is required}"
MODE="${MODE:-pr}"
PLANNER_BUDGET_USD="${PLANNER_BUDGET_USD:-1}"
WRITER_BUDGET_USD="${WRITER_BUDGET_USD:-2.5}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(git rev-parse --show-toplevel)"
cd "$root"
mkdir -p "$OUT_DIR" .unit-test-agent

[ -n "${ANTHROPIC_API_KEY:-}" ] || unset ANTHROPIC_API_KEY
[ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ] || unset CLAUDE_CODE_OAUTH_TOKEN
if [ -z "${ANTHROPIC_API_KEY:-}${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
  echo "::error::Set the CLAUDE_CODE_OAUTH_TOKEN (from \`claude setup-token\`) or ANTHROPIC_API_KEY repository secret."
  exit 1
fi

# ---- prompts -----------------------------------------------------------------------------
planner_prompt="$(cat "$here/planner.prompt.md")"
if [ "$MODE" = "backfill" ]; then
  planner_prompt="$(cat "$here/backfill.prompt.md")"
  if [ -n "${BACKFILL_PATHS:-}" ]; then
    # workflow_dispatch input: accept only plain repository paths, nothing that reads as text.
    read -ra backfill_paths <<< "$BACKFILL_PATHS"
    for p in "${backfill_paths[@]}"; do
      [[ "$p" =~ ^(backend|frontend)/[A-Za-z0-9_./-]+$ && "$p" != *..* ]] || { echo "::error::invalid backfill path: $p"; exit 1; }
    done
    planner_prompt="$planner_prompt"$'\n\n'"Restrict the plan to units under these paths: ${BACKFILL_PATHS}"
  fi
fi
writer_prompt="$(cat "$here/writer.prompt.md")"

run_agent() { # <name> <budget> <prompt> -> exit code; writes $OUT_DIR/<name>-run.json
  local name="$1" budget="$2" prompt="$3" status
  echo "::group::$name"
  claude --print "$prompt" \
    --agent "$name" \
    --settings "$here/${name#unit-test-}.settings.json" \
    --permission-mode dontAsk \
    --strict-mcp-config \
    --max-budget-usd "$budget" \
    --no-session-persistence \
    --output-format json < /dev/null > "$OUT_DIR/$name-raw.json"
  status=$?
  echo "::endgroup::"
  if [ -s "$OUT_DIR/$name-raw.json" ]; then
    jq '{turns: .num_turns, duration_ms, cost_usd: .total_cost_usd, is_error,
         models: ((.modelUsage // {}) | keys), result: ((.result // "") | .[0:600])}' \
      "$OUT_DIR/$name-raw.json" > "$OUT_DIR/$name-run.json" 2>/dev/null || echo '{}' > "$OUT_DIR/$name-run.json"
  else
    echo '{}' > "$OUT_DIR/$name-run.json"
  fi
  rm -f "$OUT_DIR/$name-raw.json"
  # A budget stop or an API error is reported in the JSON even when the exit code is 0.
  if [ "$status" -eq 0 ] && [ "$(jq -r '.is_error // false' "$OUT_DIR/$name-run.json")" = "true" ]; then status=1; fi
  echo "$name exit $status; $(cat "$OUT_DIR/$name-run.json")"
  return "$status"
}

# ---- stage 1: plan -----------------------------------------------------------------------
run_agent unit-test-planner "$PLANNER_BUDGET_USD" "$planner_prompt"
planner_status=$?
work=0
if [ -f .unit-test-agent/plan.json ] && [ "$(stat -c %s .unit-test-agent/plan.json)" -le 200000 ]; then
  if work="$(jq -r '[.units[]? | select(.action == "create" or .action == "update")] | length' .unit-test-agent/plan.json 2>/dev/null)"; then
    cp .unit-test-agent/plan.json "$OUT_DIR/plan.json"
  else
    echo "::error::plan.json is not valid JSON"; planner_status=1; work=0
  fi
else
  echo "::error::planner left no plan.json"; planner_status=1
fi
echo "planned units needing tests: $work"

# ---- stage 2: write ----------------------------------------------------------------------
writer_status=0
if [ "$planner_status" -eq 0 ] && [ "$work" -gt 0 ]; then
  run_agent unit-test-writer "$WRITER_BUDGET_USD" "$writer_prompt"
  writer_status=$?
  if [ -f .unit-test-agent/report.json ] && [ "$(stat -c %s .unit-test-agent/report.json)" -le 200000 ]; then
    cp .unit-test-agent/report.json "$OUT_DIR/report.json"
  fi
else
  echo '{"skipped": true}' > "$OUT_DIR/unit-test-writer-run.json"
fi

# ---- collect -----------------------------------------------------------------------------
# .unit-test-agent/ is git-ignored, so the patch holds only real changes.
git add --all
git diff --cached --binary --no-color > "$OUT_DIR/tests.patch"
git diff --cached --stat
jq -n --slurpfile p "$OUT_DIR/unit-test-planner-run.json" --slurpfile w "$OUT_DIR/unit-test-writer-run.json" \
  '{planner: $p[0], writer: $w[0],
    total_cost_usd: (($p[0].cost_usd // 0) + ($w[0].cost_usd // 0))}' > "$OUT_DIR/run.json"
rm -f "$OUT_DIR/unit-test-planner-run.json" "$OUT_DIR/unit-test-writer-run.json"
cat "$OUT_DIR/run.json"

[ "$planner_status" -eq 0 ] || { echo "::error::planner failed"; exit "$planner_status"; }
[ "$writer_status" -eq 0 ] || { echo "::error::writer failed"; exit "$writer_status"; }
exit 0
