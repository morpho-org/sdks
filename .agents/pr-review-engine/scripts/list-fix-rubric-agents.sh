#!/usr/bin/env bash
# list-fix-rubric-agents.sh — list agents that carry a `## Fix rubric` section.
#
# Used by pr-fix's confidence-gate rubric loop and by the bats invariant that
# pins the fix-applicable set. Single source of truth: walks the engine's
# agents/ directory and emits one path per line.
#
# Usage:
#   list-fix-rubric-agents.sh
#       Defaults to ${CLAUDE_PLUGIN_ROOT}/skills/pr-review-engine/agents/ if
#       CLAUDE_PLUGIN_ROOT is set; falls back to a path relative to the
#       script's own location otherwise.
#   list-fix-rubric-agents.sh <agents-dir>
#       Use the given directory.

set -euo pipefail

if [ $# -ge 1 ]; then
  AGENTS_DIR="$1"
elif [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
  AGENTS_DIR="${CLAUDE_PLUGIN_ROOT}/skills/pr-review-engine/agents"
else
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  AGENTS_DIR="${SCRIPT_DIR}/../agents"
fi

if [ ! -d "$AGENTS_DIR" ]; then
  echo "list-fix-rubric-agents.sh: agents directory not found: $AGENTS_DIR" >&2
  exit 1
fi

# grep -l exits 1 when no file matches; under `set -euo pipefail` that would
# propagate as a hard failure, which is wrong here — "no fix-applicable agents"
# is a valid result that callers (pr-fix, bats invariant) handle gracefully.
{ grep -l '^## Fix rubric$' "$AGENTS_DIR"/*.md 2>/dev/null || true; } | sort
