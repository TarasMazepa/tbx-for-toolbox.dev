#!/bin/bash
# ==============================================================================
# tbx-tolooks.sh: Audits open (and optionally resolved) ToLooks across all repos.
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOS_FILE="$SCRIPT_DIR/till/repositories.txt"

SHOW_ALL=false
SHOW_RESOLVED=false
TARGET_REPO=""

usage() {
	cat <<EOF
Usage: $(basename "$0") [OPTIONS] [REPO_NAME]

Pulls and summarizes ToLooks (TOLOOKS.md / tolooks.md) across repositories in
till/repositories.txt.

Options:
  -a, --all         Show all repositories, including those with 0 open ToLooks
  -r, --resolved    Include resolved ([x]) ToLook items in output
      --repo <name> Target a single repository (overrides till/repositories.txt)
  -h, --help        Show this help message

Examples:
  $(basename "$0")
  $(basename "$0") --all
  $(basename "$0") --resolved --repo personal
EOF
	exit 0
}

while [ $# -gt 0 ]; do
	case "$1" in
		-a|--all)
			SHOW_ALL=true
			shift
			;;
		-r|--resolved)
			SHOW_RESOLVED=true
			shift
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

repos_list=""
if [ -n "$TARGET_REPO" ]; then
	repos_list="$TARGET_REPO"
else
	if [ ! -f "$REPOS_FILE" ]; then
		echo "Error: $REPOS_FILE not found." >&2
		exit 1
	fi
	repos_list="$(grep -vE '^[[:space:]]*(#|$)' "$REPOS_FILE" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
fi

echo "================================================================================"
echo "🔭 GLOBAL TOLOOKS AUDIT ($(date '+%Y-%m-%d %H:%M:%S'))"
echo "================================================================================"
echo ""

repos_scanned=0
repos_with_tolooks=0
total_open=0
total_resolved=0

while IFS= read -r repo; do
	[ -z "$repo" ] && continue
	repo_dir="$HOME/$repo"
	if [ ! -d "$repo_dir" ]; then
		continue
	fi
	repos_scanned=$((repos_scanned + 1))

	tolooks_file=""
	if [ -f "$repo_dir/TOLOOKS.md" ]; then
		tolooks_file="$repo_dir/TOLOOKS.md"
	elif [ -f "$repo_dir/tolooks.md" ]; then
		tolooks_file="$repo_dir/tolooks.md"
	fi

	if [ -z "$tolooks_file" ]; then
		if [ "$SHOW_ALL" = true ]; then
			echo "--------------------------------------------------------------------------------"
			echo "📦 $repo (no TOLOOKS.md)"
			echo "--------------------------------------------------------------------------------"
			echo ""
		fi
		continue
	fi

	repos_with_tolooks=$((repos_with_tolooks + 1))

	counts="$(awk '
		/^- \[ \] / { open++ }
		/^- \[[xX]\] / { resolved++ }
		END { printf "%d %d\n", open + 0, resolved + 0 }
	' "$tolooks_file")"
	open_count="${counts%% *}"
	resolved_count="${counts##* }"

	total_open=$((total_open + open_count))
	total_resolved=$((total_resolved + resolved_count))

	if [ "$open_count" -eq 0 ] && { [ "$SHOW_RESOLVED" = false ] || [ "$resolved_count" -eq 0 ]; } && [ "$SHOW_ALL" = false ]; then
		continue
	fi

	echo "--------------------------------------------------------------------------------"
	echo "📦 $repo ($open_count open, $resolved_count resolved) — $tolooks_file"
	echo "--------------------------------------------------------------------------------"

	awk -v show_resolved="$SHOW_RESOLVED" '
		/^- \[ \] / {
			title = substr($0, 7)
			gsub(/\*\*/, "", title)
			printf "  ☐ %s\n", title
			in_open = 1
			in_resolved = 0
			next
		}
		/^- \[[xX]\] / {
			in_open = 0
			if (show_resolved == "true") {
				title = substr($0, 7)
				gsub(/\*\*/, "", title)
				printf "  ☑ %s\n", title
				in_resolved = 1
			} else {
				in_resolved = 0
			}
			next
		}
		/^  - \*\*Idea\*\*: / && (in_open || in_resolved) {
			idea = substr($0, 15)
			printf "    Idea: %s\n", idea
			next
		}
		/^[^ ]/ {
			in_open = 0
			in_resolved = 0
		}
	' "$tolooks_file"

	echo ""
done <<EOF
$repos_list
EOF

echo "================================================================================"
echo "Summary: $total_open open ToLook(s) ($total_resolved resolved) across $repos_with_tolooks repo(s) with TOLOOKS.md ($repos_scanned scanned)."
echo "================================================================================"
