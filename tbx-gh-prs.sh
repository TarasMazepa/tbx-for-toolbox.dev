#!/bin/bash
# ==============================================================================
# tbx-gh-prs.sh: Audits open pull requests across all repositories.
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOS_FILE="$SCRIPT_DIR/till/repositories.txt"

SHOW_ALL=false
FILTER_MODE="all" # all, ready, draft
PR_LIMIT=10
TARGET_REPO=""

usage() {
	cat <<EOF
Usage: $(basename "$0") [OPTIONS] [REPO_NAME]

Audits open pull requests across repositories configured in till/repositories.txt.

Options:
  -a, --all         Show all repositories, including those with 0 open PRs
  -r, --ready       Show only ready (non-draft) PRs
  -d, --draft       Show only draft PRs
  -l, --limit <n>   Maximum PRs to fetch per repository (default: 10)
      --repo <name> Target a single repository (overrides till/repositories.txt)
  -h, --help        Show this help message

Examples:
  $(basename "$0")
  $(basename "$0") --ready
  $(basename "$0") --repo ai-todo
EOF
	exit 0
}

while [ $# -gt 0 ]; do
	case "$1" in
		-a|--all)
			SHOW_ALL=true
			shift
			;;
		-r|--ready)
			FILTER_MODE="ready"
			shift
			;;
		-d|--draft)
			FILTER_MODE="draft"
			shift
			;;
		-l|--limit)
			PR_LIMIT="${2:-10}"
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
		prs="$(cd "$target_dir" && gh pr list --state open --limit "$PR_LIMIT" \
			--json number,title,isDraft,headRefName,url,author,updatedAt 2>/dev/null || echo "[]")"

		# Filter according to mode
		if [ "$FILTER_MODE" = "ready" ]; then
			prs="$(echo "$prs" | jq '[.[] | select(.isDraft == false)]')"
		elif [ "$FILTER_MODE" = "draft" ]; then
			prs="$(echo "$prs" | jq '[.[] | select(.isDraft == true)]')"
		fi

		total_prs="$(echo "$prs" | jq '. | length' 2>/dev/null || echo 0)"
		ready_prs="$(echo "$prs" | jq '[.[] | select(.isDraft == false)] | length' 2>/dev/null || echo 0)"
		draft_prs="$(echo "$prs" | jq '[.[] | select(.isDraft == true)] | length' 2>/dev/null || echo 0)"

		echo "$total_prs $ready_prs $draft_prs" > "$TMP_DIR/$idx_pad.meta"

		if [ "$total_prs" -gt 0 ]; then
			{
				echo "--------------------------------------------------------------------------------"
				echo "📦 $folder ($total_prs open: $ready_prs ready, $draft_prs draft)"
				echo "--------------------------------------------------------------------------------"
				echo "$prs" | jq -r '.[] | "  " + (if .isDraft then "📝 [Draft]" else "🟢 [Open]" end) + " #" + (.number|tostring) + ": " + .title + " (" + .headRefName + ")\n     " + .url'
				echo ""
			} > "$out_file"
		elif [ "$SHOW_ALL" = true ]; then
			{
				echo "--------------------------------------------------------------------------------"
				echo "📦 $folder (0 open PRs)"
				echo "--------------------------------------------------------------------------------"
				echo "  (No open pull requests)"
				echo ""
			} > "$out_file"
		fi
	) &
done

wait

total_open=0
total_ready=0
total_draft=0
repos_with_prs=0

for meta in "$TMP_DIR"/*.meta; do
	[ ! -f "$meta" ] && continue
	read -r c_total c_ready c_draft < "$meta"
	total_open=$((total_open + c_total))
	total_ready=$((total_ready + c_ready))
	total_draft=$((total_draft + c_draft))
	if [ "$c_total" -gt 0 ]; then
		repos_with_prs=$((repos_with_prs + 1))
	fi
done

echo "================================================================================"
echo "GitHub Pull Requests Audit ($(date '+%Y-%m-%d %H:%M:%S'))"
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
	echo "No open pull requests found matching criteria."
	echo ""
fi

echo "================================================================================"
echo "Summary: $total_open open PR(s) across $repos_with_prs repository/repositories ($total_ready ready for review, $total_draft drafts)."
echo "================================================================================"
