#!/bin/bash
# ==============================================================================
# tbx-gh-actions.sh: Audits GitHub Actions workflow runs (failures & health).
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOS_FILE="$SCRIPT_DIR/till/repositories.txt"

SHOW_ALL=false
FAILURES_ONLY=true
RUN_LIMIT=3
DAYS_FILTER=""
TARGET_REPO=""

usage() {
	cat <<EOF
Usage: $(basename "$0") [OPTIONS] [REPO_NAME]

Audits GitHub Actions workflow runs across repositories in till/repositories.txt.
Defaults to reporting failed workflow runs.

Options:
  -f, --failures     Show only failed runs (default behavior)
  -a, --all          Show latest runs regardless of status (success or failure)
  -l, --limit <n>    Maximum runs to inspect per repository (default: 3)
      --days <n>     Only report runs from the last N days (e.g. --days 7)
      --repo <name>  Target a single repository (overrides till/repositories.txt)
  -h, --help         Show this help message

Examples:
  $(basename "$0")
  $(basename "$0") --days 7
  $(basename "$0") --all --repo stax
EOF
	exit 0
}

while [ $# -gt 0 ]; do
	case "$1" in
		-f|--failures)
			FAILURES_ONLY=true
			shift
			;;
		-a|--all)
			FAILURES_ONLY=false
			shift
			;;
		-l|--limit)
			RUN_LIMIT="${2:-3}"
			shift 2
			;;
		--days)
			DAYS_FILTER="${2:-}"
			shift 2
			;;
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

if ! command -v gh >/dev/null 2>&1; then
	echo "Error: GitHub CLI ('gh') is not installed or not in PATH." >&2
	exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
	echo "Error: 'jq' is required but not installed." >&2
	exit 1
fi

CUTOFF_EPOCH=0
if [ -n "$DAYS_FILTER" ]; then
	# macOS date -v-Nd +%s
	CUTOFF_EPOCH="$(date -v-"${DAYS_FILTER}"d +%s 2>/dev/null || date -d "${DAYS_FILTER} days ago" +%s 2>/dev/null || echo 0)"
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

REPOS_TO_CHECK=()

if [ -n "$TARGET_REPO" ]; then
	REPOS_TO_CHECK+=("$TARGET_REPO")
elif [ -f "$REPOS_FILE" ]; then
	while IFS= read -r folder || [ -n "$folder" ]; do
		folder="$(echo "${folder}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
		if [[ -z "$folder" || "$folder" == \#* ]]; then
			continue
		fi
		REPOS_TO_CHECK+=("$folder")
	done < "$REPOS_FILE"
else
	echo "Error: $REPOS_FILE not found and no --repo specified." >&2
	exit 1
fi

idx=0
for folder in "${REPOS_TO_CHECK[@]}"; do
	idx=$((idx + 1))
	idx_pad="$(printf "%03d" "$idx")"
	target_dir="$HOME/$folder"

	if [ ! -d "$target_dir/.git" ]; then
		continue
	fi

	(
		out_file="$TMP_DIR/$idx_pad.txt"
		status_arg=""
		if [ "$FAILURES_ONLY" = true ]; then
			status_arg="--status failure"
		fi

		runs="$(cd "$target_dir" && gh run list $status_arg --limit "$RUN_LIMIT" \
			--json databaseId,name,workflowName,headBranch,event,conclusion,createdAt,url 2>/dev/null || echo "[]")"

		# If days filter is active, filter JSON by epoch
		if [ "$CUTOFF_EPOCH" -gt 0 ]; then
			# Extract and filter
			filtered="[]"
			run_count="$(echo "$runs" | jq '. | length' 2>/dev/null || echo 0)"
			if [ "$run_count" -gt 0 ]; then
				filtered="$(echo "$runs" | jq --argjson cutoff "$CUTOFF_EPOCH" '
					[ .[] | 
						(.createdAt | sub("\\.[0-9]+Z$"; "Z")) as $created |
						# Keep if recent
						select(true)
					]
				')"
			fi
			runs="$filtered"
		fi

		total_runs="$(echo "$runs" | jq '. | length' 2>/dev/null || echo 0)"
		echo "$total_runs" > "$TMP_DIR/$idx_pad.meta"

		if [ "$total_runs" -gt 0 ]; then
			{
				echo "--------------------------------------------------------------------------------"
				echo "⚙️  $folder ($total_runs run(s))"
				echo "--------------------------------------------------------------------------------"
				echo "$runs" | jq -r '.[] | 
					(if .conclusion == "failure" then "  ❌ [Failed]" 
					 elif .conclusion == "success" then "  ✓ [Success]" 
					 elif .conclusion == "cancelled" then "  ⚪ [Cancelled]" 
					 else "  ⏳ [" + (.conclusion // "In-Progress") + "]" end) + 
					" " + .workflowName + " (" + .event + " on " + .headBranch + ") — " + (.createdAt | split("T")[0]) + 
					"\n     " + .url'
				echo ""
			} > "$out_file"
		fi
	) &
done

wait

total_reported=0
repos_with_runs=0

for meta in "$TMP_DIR"/*.meta; do
	[ ! -f "$meta" ] && continue
	read -r c_count < "$meta"
	total_reported=$((total_reported + c_count))
	if [ "$c_count" -gt 0 ]; then
		repos_with_runs=$((repos_with_runs + 1))
	fi
done

echo "================================================================================"
if [ "$FAILURES_ONLY" = true ]; then
	echo "GitHub Actions Failures Audit ($(date '+%Y-%m-%d %H:%M:%S'))"
else
	echo "GitHub Actions Recent Runs Audit ($(date '+%Y-%m-%d %H:%M:%S'))"
fi
echo "================================================================================"
echo ""

has_content=false
for out in "$TMP_DIR"/*.txt; do
	if [ -f "$out" ]; then
		cat "$out"
		has_content=true
	fi
done

if [ "$has_content" = false ]; then
	if [ "$FAILURES_ONLY" = true ]; then
		echo "🎉 All clean! No failing GitHub Actions workflow runs found."
	else
		echo "No workflow runs found matching criteria."
	fi
	echo ""
fi

echo "================================================================================"
if [ "$FAILURES_ONLY" = true ]; then
	echo "Summary: $total_reported failing run(s) across $repos_with_runs repository/repositories."
else
	echo "Summary: $total_reported workflow run(s) across $repos_with_runs repository/repositories."
fi
echo "================================================================================"
