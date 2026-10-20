#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOS_FILE="$SCRIPT_DIR/till/repositories.txt"

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
		-h|--help)
			echo "Usage: $(basename "$0") [OPTIONS] [today|yesterday|YYYY-MM-DD] [output-dir]"
			echo "Gathers git diffs across all repositories listed in till/repositories.txt."
			echo ""
			echo "Options:"
			echo "  --no-fetch  Skip git fetch for repositories before diffing"
			echo "  --fetch     Fetch repositories from origin before diffing (default)"
			echo "  -h, --help  Show this help message"
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

# shellcheck disable=SC2188
>"$OUTPUT_FILE" # Clear or create file

echo "Gathering changes for $DATE_LABEL ($START_DATE to $END_DATE)..."

while read -r folder || [ -n "$folder" ]; do
	# Skip empty lines and comments
	if [[ -z "$folder" || "$folder" == \#* ]]; then
		continue
	fi

	target_dir="$HOME/$folder"

	if [ -d "$target_dir" ]; then
		(
			cd "$target_dir" || exit 1 # Exits the subshell, skipping to next repo
			if [ -d ".git" ]; then
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
				START_COMMIT=$(git rev-list -1 --before="$START_DATE" "$TARGET_REF" 2>/dev/null)
				# Find the last commit BEFORE end date
				END_COMMIT=$(git rev-list -1 --before="$END_DATE" "$TARGET_REF" 2>/dev/null)

				if [ -n "$START_COMMIT" ] && [ -n "$END_COMMIT" ] && [ "$START_COMMIT" != "$END_COMMIT" ]; then
					CHANGES=$(git diff "$START_COMMIT" "$END_COMMIT")
					if [ -n "$CHANGES" ]; then
						{
							echo "===== $folder ====="
							echo "$CHANGES"
							echo ""
						} >>"$OUTPUT_FILE"
					fi
				elif [ -z "$START_COMMIT" ] && [ -n "$END_COMMIT" ]; then
					# If there's no commit before start date, but there's a commit before end date,
					# we can use the empty tree to show all additions.
					CHANGES=$(git diff "$EMPTY_TREE_HASH" "$END_COMMIT")
					if [ -n "$CHANGES" ]; then
						{
							echo "===== $folder ====="
							echo "$CHANGES"
							echo ""
						} >>"$OUTPUT_FILE"
					fi
				fi
			fi
		)
	else
		echo "Warning: Directory $target_dir does not exist. Skipping..."
	fi
done <"$REPOS_FILE"

cp "$OUTPUT_FILE" "$LATEST_FILE"

if [ -s "$OUTPUT_FILE" ]; then
	echo "Changes combined into $OUTPUT_FILE"
	echo "Latest copy updated at $LATEST_FILE"
else
	echo "No changes found for $DATE_LABEL."
	echo "Empty report created at $OUTPUT_FILE"
	echo "Latest copy updated at $LATEST_FILE"
fi

