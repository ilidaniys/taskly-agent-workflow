#!/usr/bin/env bash
# Single entry point for running tests. Keeps the agent's shell permission to one command.
# Usage: run-tests.sh <backend|frontend> [--coverage|--typecheck|--format] [test files...]
set -euo pipefail

usage() {
  echo "usage: run-tests.sh <backend|frontend> [--coverage|--typecheck|--format] [files...]" >&2
  exit 2
}

package="${1:-}"
[[ "$package" == "backend" || "$package" == "frontend" ]] || usage
shift

mode="test"
files=()
for argument in "$@"; do
  case "$argument" in
    --coverage) mode="coverage" ;;
    --typecheck) mode="typecheck" ;;
    --format) mode="format" ;;
    -*) echo "unsupported option: $argument" >&2; exit 2 ;;
    *)
      [[ "$argument" =~ ^[A-Za-z0-9_./-]+$ && "$argument" != *..* ]] || { echo "invalid path: $argument" >&2; exit 2; }
      argument="${argument#"$package"/}"
      if [[ "$package" == "frontend" ]]; then
        [[ "$argument" =~ ^src/.+\.test\.tsx?$ || "$argument" =~ ^src/test/[A-Za-z0-9_.-]+$ ]] || { echo "not a frontend test path: $argument" >&2; exit 2; }
      else
        [[ "$argument" =~ ^tests/.+\.ts$ ]] || { echo "not a backend test path: $argument" >&2; exit 2; }
      fi
      files+=("$argument")
      ;;
  esac
done

cd "$(git rev-parse --show-toplevel)/$package"

# Inside the agent's sandbox $GITHUB_STEP_SUMMARY is read-only; Vitest's GitHub reporter
# would print EROFS on every run. The pipeline's own verify job writes the summary.
unset GITHUB_ACTIONS GITHUB_STEP_SUMMARY

case "$mode" in
  typecheck) exec npm run --silent typecheck ;;
  format)
    [[ "$package" == "frontend" ]] || { echo "--format is frontend only" >&2; exit 2; }
    (( ${#files[@]} > 0 )) || { echo "--format needs at least one file" >&2; exit 2; }
    exec npx --no-install prettier --write "${files[@]}"
    ;;
  coverage) exec npx --no-install vitest run --coverage ;;
  test) exec npx --no-install vitest run "${files[@]}" ;;
esac
