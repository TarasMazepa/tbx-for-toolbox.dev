#!/bin/bash
# ==============================================================================
# tbx-gh-status.sh: Unified GitHub Health audit (Open PRs + Failing Actions).
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRS_SCRIPT="$SCRIPT_DIR/tbx-gh-prs.sh"
ACTIONS_SCRIPT="$SCRIPT_DIR/tbx-gh-actions.sh"

if [ ! -x "$PRS_SCRIPT" ]; then
	echo "Error: $PRS_SCRIPT not found or not executable." >&2
	exit 1
fi

if [ ! -x "$ACTIONS_SCRIPT" ]; then
	echo "Error: $ACTIONS_SCRIPT not found or not executable." >&2
	exit 1
fi

TARGET_REPO=""

usage() {
	cat <<EOF
Usage: $(basename "$0") [OPTIONS] [REPO_NAME]

Runs a complete GitHub health audit across repositories in till/repositories.txt:
  1. Open Pull Requests (distinguishing Draft vs. Ready to review/merge)
  2. Failing GitHub Actions workflows (broken CI or failing scheduled crons)

Options:
      --repo <name>  Target a single repository
  -h, --help         Show this help message

Examples:
  $(basename "$0")
  $(basename "$0") --repo ai-todo
EOF
	exit 0
}

while [ $# -gt 0 ]; do
	case "$1" in
		--repo)
			TARGET_REPO="${2:-}"
			shift 2
			;;
		-h|--help)
			usage
			;;
		*)
			if [ -z "$TARGET_REPO" ]; then
				TARGET_REPO="$1"
				shift
			else
				echo "Error: Unknown argument '$1'" >&2
				usage
			fi
			;;
	esac
done

REPO_ARG=""
if [ -n "$TARGET_REPO" ]; then
	REPO_ARG="--repo $TARGET_REPO"
fi

echo "================================================================================"
echo "🐙 GLOBAL GITHUB HEALTH AUDIT ($(date '+%Y-%m-%d %H:%M:%S'))"
echo "================================================================================"
echo ""

# 1. Open PRs
# shellcheck disable=SC2086
"$PRS_SCRIPT" $REPO_ARG
echo ""

# 2. Broken Actions
# shellcheck disable=SC2086
"$ACTIONS_SCRIPT" $REPO_ARG
