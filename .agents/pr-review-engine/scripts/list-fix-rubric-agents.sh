#!/usr/bin/env bash
# list-fix-rubric-agents.sh — list agents that carry a `## Fix rubric` section.
#
# Used by /pr-fix's confidence-gate rubric loop. Single source of truth: walks
# the engine's agents/ directory and emits one path per line.
#
# Usage:
#   list-fix-rubric-agents.sh
#       Resolves the engine's agents/ as a fixed sibling of this script's
#       scripts/ directory.
#   list-fix-rubric-agents.sh <agents-dir>
#       Use the given directory.

set -euo pipefail

if [ $# -ge 1 ]; then
  AGENTS_DIR="$1"
else
  # In-repo layout: the engine's agents/ is always a fixed sibling of scripts/.
  # Deliberately NO CLAUDE_PLUGIN_ROOT branch — that var points at the upstream
  # plugin-cache `skills/pr-review-engine/agents` path, which does not exist in
  # this repo; with the var set in a plugin host the script would resolve to a
  # missing dir and exit 1, silently breaking /pr-fix's rubric discovery.
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
