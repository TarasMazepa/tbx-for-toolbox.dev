#!/bin/bash
# ==============================================================================
# tbx-daily-changes.sh: Gathers git diffs & commit manifests across repositories.
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOS_FILE="$SCRIPT_DIR/till/repositories.txt"
EXCLUDES_FILE="$SCRIPT_DIR/till/diff-excludes.txt"

if [ ! -f "$REPOS_FILE" ]; then
	echo "Error: $REPOS_FILE does not exist. It needs to be created."
	echo "You can create it by running:"
	echo "mkdir -p \"$SCRIPT_DIR/till\" && touch \"$REPOS_FILE\""
	exit 1
fi

FETCH=true
TARGET=""
OUTPUT_DIR=""

while [ $# -gt 0 ]; do
	case "$1" in
		--no-fetch)
			FETCH=false
			shift
			;;
		--fetch)
			FETCH=true
			shift
			;;
		-o|--output-dir)
			OUTPUT_DIR="$2"
			shift 2
			;;
		-h|--help)
			echo "Usage: $(basename "$0") [OPTIONS] [today|yesterday|YYYY-MM-DD] [output-dir]"
			echo "Gathers git diffs and commit manifests across all repositories listed in till/repositories.txt."
			echo ""
			echo "Options:"
			echo "  -o, --output-dir DIR  Directory where changes report will be written"
			echo "  --no-fetch            Skip git fetch for repositories before diffing"
			echo "  --fetch               Fetch repositories from origin before diffing (default)"
			echo "  -h, --help            Show this help message"
			echo ""
			echo "Date Arguments:"
			echo "  today       Gather changes for today (00:00:00 to 23:59:59)"
			echo "  yesterday   Gather changes for yesterday (00:00:00 to 23:59:59)"
			echo "  YYYY-MM-DD  Gather changes for specific date (00:00:00 to 23:59:59)"
			echo "  (default)   Smart default: 'yesterday' before 17:00 (5 PM), 'today' at or after 17:00"
			exit 0
			;;
		*)
			if [ -z "$TARGET" ]; then
				TARGET="$1"
			elif [ -z "$OUTPUT_DIR" ]; then
				OUTPUT_DIR="$1"
			fi
			shift
			;;
	esac
done

if [ -z "$TARGET" ]; then
	CURRENT_HOUR=$(date +"%H" | awk '{print int($1)}')
	if [ "$CURRENT_HOUR" -ge 17 ]; then
		TARGET="today"
	else
		TARGET="yesterday"
	fi
fi

if [ "$TARGET" = "today" ]; then
	DATE_LABEL=$(date +"%Y-%m-%d")
	START_DATE="${DATE_LABEL} 00:00:00"
	END_DATE="${DATE_LABEL} 23:59:59"
elif [ "$TARGET" = "yesterday" ]; then
	if [[ "$OSTYPE" == "darwin"* ]]; then
		DATE_LABEL=$(date -v-1d +"%Y-%m-%d")
	else
		DATE_LABEL=$(date -d "yesterday" +"%Y-%m-%d")
	fi
	START_DATE="${DATE_LABEL} 00:00:00"
	END_DATE="${DATE_LABEL} 23:59:59"
else
	if [[ ! "$TARGET" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
		echo "Error: Invalid date or target '$TARGET'. Expected 'today', 'yesterday', or 'YYYY-MM-DD'."
		exit 1
	fi
	DATE_LABEL="$TARGET"
	START_DATE="${DATE_LABEL} 00:00:00"
	END_DATE="${DATE_LABEL} 23:59:59"
fi

EMPTY_TREE_HASH="4b825dc642cb6eb9a060e54bf8d69288fbee4904"

OUTPUT_DIR="${OUTPUT_DIR:-${DAILY_CHANGES_DIR:-$SCRIPT_DIR/daily-changes/generated}}"
mkdir -p "$OUTPUT_DIR"
OUTPUT_FILE="$OUTPUT_DIR/daily-changes-${DATE_LABEL}.txt"
LATEST_FILE="$OUTPUT_DIR/daily-changes-latest.txt"
MANIFEST_FILE="$OUTPUT_DIR/daily-manifest-${DATE_LABEL}.txt"
LATEST_MANIFEST="$OUTPUT_DIR/daily-manifest-latest.txt"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

TMP_MANIFEST="$TMP_DIR/manifest.txt"
TMP_DIFFS="$TMP_DIR/diffs.txt"
touch "$TMP_MANIFEST" "$TMP_DIFFS"

echo "Gathering changes for $DATE_LABEL ($START_DATE to $END_DATE)..."

TOTAL_REPOS=0
REPOS_WITH_CHANGES=0
TOTAL_COMMITS=0

while read -r folder || [ -n "$folder" ]; do
	# Trim leading/trailing whitespace
	folder="$(echo "${folder}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"

	# Skip empty lines and comments
	if [[ -z "$folder" || "$folder" == \#* ]]; then
		continue
	fi

	# Check repository blocklist / ignore
	if [ -f "$EXCLUDES_FILE" ] && grep -E "^[[:space:]]*${folder}[[:space:]]*:[[:space:]]*\*" "$EXCLUDES_FILE" >/dev/null 2>&1; then
		echo "Skipping $folder (blocklisted in $(basename "$EXCLUDES_FILE"))..."
		continue
	fi

	target_dir="$HOME/$folder"
	TOTAL_REPOS=$((TOTAL_REPOS + 1))

	if [ ! -d "$target_dir" ]; then
		echo "Warning: Directory $target_dir does not exist. Skipping..."
		continue
	fi

	if [ ! -d "$target_dir/.git" ]; then
		continue
	fi

	# Extract path excludes for this repo
	PATH_EXCLUDES=()
	if [ -f "$EXCLUDES_FILE" ]; then
		while IFS= read -r pat || [ -n "$pat" ]; do
			[ -n "$pat" ] && PATH_EXCLUDES+=(":(exclude)$pat")
		done < <(awk -F':' -v repo="$folder" '
			$1 ~ "^[[:space:]]*" repo "[[:space:]]*$" {
				sub(/^[[:space:]]*/, "", $2)
				sub(/[[:space:]]*$/, "", $2)
				if ($2 != "*") print $2
			}
		' "$EXCLUDES_FILE")
	fi

	STATUS=0
	(
		cd "$target_dir" || exit 1
		if [ "$FETCH" = true ]; then
			git fetch --quiet origin 2>/dev/null || true
		fi

		# Determine target branch (prefer origin/main, main, origin/master, master, falling back to HEAD)
		TARGET_REF=""
		for candidate in "origin/main" "main" "origin/master" "master"; do
			if git rev-parse --verify "$candidate" >/dev/null 2>&1; then
				TARGET_REF="$candidate"
				break
			fi
		done
		if [ -z "$TARGET_REF" ]; then
			TARGET_REF="HEAD"
		fi

		# Find the last commit BEFORE start date
		START_COMMIT=$(git rev-list -1 --before="$START_DATE" "$TARGET_REF" 2>/dev/null || true)
		# Find the last commit BEFORE end date
		END_COMMIT=$(git rev-list -1 --before="$END_DATE" "$TARGET_REF" 2>/dev/null || true)

		REPO_TMP_COMMITS="$TMP_DIR/commits_${folder}.txt"
		REPO_TMP_DIFFS="$TMP_DIR/diffs_${folder}.txt"

		if [ -n "$START_COMMIT" ] && [ -n "$END_COMMIT" ] && [ "$START_COMMIT" != "$END_COMMIT" ]; then
			if [ "${#PATH_EXCLUDES[@]}" -gt 0 ]; then
				git log "$START_COMMIT..$END_COMMIT" --pretty=format:"  * %h: %s (%an)" -- . "${PATH_EXCLUDES[@]}" > "$REPO_TMP_COMMITS" 2>/dev/null || true
				git diff "$START_COMMIT" "$END_COMMIT" --stat -- . "${PATH_EXCLUDES[@]}" > "$TMP_DIR/stat_${folder}.txt" 2>/dev/null || true
				git diff "$START_COMMIT" "$END_COMMIT" -- . "${PATH_EXCLUDES[@]}" > "$REPO_TMP_DIFFS" 2>/dev/null || true
			else
				git log "$START_COMMIT..$END_COMMIT" --pretty=format:"  * %h: %s (%an)" > "$REPO_TMP_COMMITS" 2>/dev/null || true
				git diff "$START_COMMIT" "$END_COMMIT" --stat > "$TMP_DIR/stat_${folder}.txt" 2>/dev/null || true
				git diff "$START_COMMIT" "$END_COMMIT" > "$REPO_TMP_DIFFS" 2>/dev/null || true
			fi
		elif [ -z "$START_COMMIT" ] && [ -n "$END_COMMIT" ]; then
			if [ "${#PATH_EXCLUDES[@]}" -gt 0 ]; then
				git log "$END_COMMIT" --pretty=format:"  * %h: %s (%an)" -- . "${PATH_EXCLUDES[@]}" > "$REPO_TMP_COMMITS" 2>/dev/null || true
				git diff "$EMPTY_TREE_HASH" "$END_COMMIT" --stat -- . "${PATH_EXCLUDES[@]}" > "$TMP_DIR/stat_${folder}.txt" 2>/dev/null || true
				git diff "$EMPTY_TREE_HASH" "$END_COMMIT" -- . "${PATH_EXCLUDES[@]}" > "$REPO_TMP_DIFFS" 2>/dev/null || true
			else
				git log "$END_COMMIT" --pretty=format:"  * %h: %s (%an)" > "$REPO_TMP_COMMITS" 2>/dev/null || true
				git diff "$EMPTY_TREE_HASH" "$END_COMMIT" --stat > "$TMP_DIR/stat_${folder}.txt" 2>/dev/null || true
				git diff "$EMPTY_TREE_HASH" "$END_COMMIT" > "$REPO_TMP_DIFFS" 2>/dev/null || true
			fi
		fi

		if [ -s "$REPO_TMP_COMMITS" ] || [ -s "$REPO_TMP_DIFFS" ]; then
			exit 2 # Signal changes found
		fi
		exit 0
	) || STATUS=$?

	if [ "$STATUS" -eq 2 ]; then
		REPO_TMP_COMMITS="$TMP_DIR/commits_${folder}.txt"
		REPO_TMP_DIFFS="$TMP_DIR/diffs_${folder}.txt"
		REPO_TMP_STAT="$TMP_DIR/stat_${folder}.txt"

		REPO_COMMIT_COUNT=0
		if [ -s "$REPO_TMP_COMMITS" ]; then
			REPO_COMMIT_COUNT=$(wc -l < "$REPO_TMP_COMMITS" | awk '{print $1}')
		fi

		TOTAL_COMMITS=$((TOTAL_COMMITS + REPO_COMMIT_COUNT))
		REPOS_WITH_CHANGES=$((REPOS_WITH_CHANGES + 1))

		{
			echo "📦 $folder ($REPO_COMMIT_COUNT commit(s)):"
			if [ -s "$REPO_TMP_COMMITS" ]; then
				cat "$REPO_TMP_COMMITS"
			else
				echo "  (No direct commit messages in scope)"
			fi
			echo ""
		} >> "$TMP_MANIFEST"

		{
			echo "================================================================================"
			echo "===== $folder ($REPO_COMMIT_COUNT commit(s)) ====="
			echo "================================================================================"
			if [ -s "$REPO_TMP_COMMITS" ]; then
				echo "Commits:"
				cat "$REPO_TMP_COMMITS"
				echo ""
			fi
			if [ -s "$REPO_TMP_STAT" ]; then
				echo "Diff Stat:"
				cat "$REPO_TMP_STAT"
				echo ""
			fi
			echo "Diff:"
			cat "$REPO_TMP_DIFFS"
			echo ""
			echo ""
		} >> "$TMP_DIFFS"
	fi
done < "$REPOS_FILE"

# Assemble the final files
{
	echo "================================================================================"
	echo "COMMITS MANIFEST: $DATE_LABEL ($TOTAL_COMMITS commit(s) across $REPOS_WITH_CHANGES repository/repositories)"
	echo "================================================================================"
	echo ""
	if [ -s "$TMP_MANIFEST" ]; then
		cat "$TMP_MANIFEST"
	else
		echo "No commits found for $DATE_LABEL."
		echo ""
	fi
	echo "================================================================================"
} > "$MANIFEST_FILE"

cp -f "$MANIFEST_FILE" "$LATEST_MANIFEST" 2>/dev/null || true

{
	cat "$MANIFEST_FILE"
	echo ""
	echo ""
	if [ -s "$TMP_DIFFS" ]; then
		cat "$TMP_DIFFS"
	else
		echo "No git diffs found for $DATE_LABEL."
	fi
} > "$OUTPUT_FILE"

cp -f "$OUTPUT_FILE" "$LATEST_FILE" 2>/dev/null || true

DIFF_LINES=$(wc -l < "$OUTPUT_FILE" | awk '{print $1}')

echo ""
cat "$MANIFEST_FILE"
echo ""
echo "Manifest saved to: $MANIFEST_FILE (and $LATEST_MANIFEST)"
echo "Combined diffs:    $OUTPUT_FILE ($DIFF_LINES lines, refreshed $LATEST_FILE)"
echo "Completed at $(date '+%Y-%m-%d %H:%M:%S')"
