#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOS_FILE="$SCRIPT_DIR/till/repositories.txt"
EXCLUDES_FILE="$SCRIPT_DIR/till/diff-excludes.txt"

if [ ! -f "$REPOS_FILE" ]; then
	echo "Error: $REPOS_FILE does not exist. It needs to be created."
	echo "You can create it by running:"
	echo "mkdir -p \"$SCRIPT_DIR/till\" && touch \"$REPOS_FILE\""
	exit 1
fi

get_clipboard() {
	if command -v pbpaste >/dev/null 2>&1; then
		pbpaste
	elif command -v wl-paste >/dev/null 2>&1; then
		wl-paste
	elif command -v xclip >/dev/null 2>&1; then
		xclip -selection clipboard -o
	elif command -v xsel >/dev/null 2>&1; then
		xsel --clipboard --output
	elif command -v powershell.exe >/dev/null 2>&1; then
		powershell.exe Get-Clipboard | tr -d '\r'
	fi
}

FETCH=true
OUTPUT_DIR=""
START_ARG=""
END_ARG=""

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
		--since)
			START_ARG="$2"
			shift 2
			;;
		--until)
			END_ARG="$2"
			shift 2
			;;
		-h|--help)
			echo "Usage: $(basename "$0") [OPTIONS] [START_DATE] [OUTPUT_DIR]"
			echo "Gathers git diffs across all repositories listed in till/repositories.txt for coaching summaries."
			echo ""
			echo "Options:"
			echo "  -o, --output-dir DIR  Directory where changes report will be written"
			echo "  --since DATE          Start date (e.g. '2026-10-10' or 'Oct 10, 2026')"
			echo "  --until DATE          End date (defaults to today/now)"
			echo "  --no-fetch            Skip git fetch for repositories before diffing"
			echo "  --fetch               Fetch repositories from origin before diffing (default)"
			echo "  -h, --help            Show this help message"
			echo ""
			echo "Date Arguments:"
			echo "  START_DATE  Start date (e.g. '2026-10-10' or 'Oct 10, 2026'). If omitted,"
			echo "              checks clipboard for a date string."
			echo "  OUTPUT_DIR  Optional positional output directory (defaults to"
			echo "              \$HOME/change-reports)."
			exit 0
			;;
		*)
			if [ -z "$START_ARG" ]; then
				START_ARG="$1"
			elif [ -z "$OUTPUT_DIR" ]; then
				OUTPUT_DIR="$1"
			fi
			shift
			;;
	esac
done

# If no start date argument was provided, try extracting from clipboard
if [ -z "$START_ARG" ]; then
	CLIPBOARD_DATA=$(get_clipboard)

	# Try extracting YYYY-MM-DD or 'Mar 8, 2026'
	EXTRACTED_DATE=$(echo "$CLIPBOARD_DATA" | grep -oE "[0-9]{4}-[0-9]{2}-[0-9]{2}" | head -n 1)
	if [ -z "$EXTRACTED_DATE" ]; then
		EXTRACTED_DATE=$(echo "$CLIPBOARD_DATA" | grep -oE "[A-Z][a-z]{2} [0-9]{1,2}, [0-9]{4}" | head -n 1)
	fi

	if [ -z "$EXTRACTED_DATE" ]; then
		echo "Error: No start date provided and no valid date found in clipboard."
		echo "Usage: $(basename "$0") [START_DATE] [OUTPUT_DIR]"
		echo "Example: $(basename "$0") 2026-10-10"
		exit 1
	fi
	START_ARG="$EXTRACTED_DATE"
fi

# Resolve output directory default
OUTPUT_DIR="${OUTPUT_DIR:-$HOME/change-reports}"
mkdir -p "$OUTPUT_DIR"

# Parse the dates portably across GNU date and BSD date
parse_date_to_vars() {
	local raw_date="$1"
	local is_end="$2"

	if date --version >/dev/null 2>&1; then
		# GNU date
		if ! date -d "$raw_date" >/dev/null 2>&1; then
			echo "Error: Invalid date format '$raw_date'." >&2
			exit 1
		fi
		if [ "$is_end" = "true" ]; then
			PARSED_ISO=$(date -d "$raw_date" +"%Y-%m-%d 23:59:59")
			PARSED_FILE_LABEL=$(date -d "$raw_date" +"%b-%-d-%Y")
		else
			PARSED_ISO=$(date -d "$raw_date" +"%Y-%m-%d 00:00:00")
			PARSED_FILE_LABEL=$(date -d "$raw_date" +"%b-%-d-%Y")
		fi
	else
		# BSD date (macOS)
		if date -j -f "%Y-%m-%d" "$raw_date" >/dev/null 2>&1; then
			if [ "$is_end" = "true" ]; then
				PARSED_ISO=$(date -j -f "%Y-%m-%d" "$raw_date" +"%Y-%m-%d 23:59:59")
			else
				PARSED_ISO=$(date -j -f "%Y-%m-%d" "$raw_date" +"%Y-%m-%d 00:00:00")
			fi
			PARSED_FILE_LABEL=$(date -j -f "%Y-%m-%d" "$raw_date" +"%b-%e-%Y" | tr -d ' ')
		elif date -j -f "%b %e, %Y" "$raw_date" >/dev/null 2>&1; then
			if [ "$is_end" = "true" ]; then
				PARSED_ISO=$(date -j -f "%b %e, %Y" "$raw_date" +"%Y-%m-%d 23:59:59")
			else
				PARSED_ISO=$(date -j -f "%b %e, %Y" "$raw_date" +"%Y-%m-%d 00:00:00")
			fi
			PARSED_FILE_LABEL=$(date -j -f "%b %e, %Y" "$raw_date" +"%b-%e-%Y" | tr -d ' ')
		elif date -j -f "%b-%e-%Y" "$raw_date" >/dev/null 2>&1; then
			if [ "$is_end" = "true" ]; then
				PARSED_ISO=$(date -j -f "%b-%e-%Y" "$raw_date" +"%Y-%m-%d 23:59:59")
			else
				PARSED_ISO=$(date -j -f "%b-%e-%Y" "$raw_date" +"%Y-%m-%d 00:00:00")
			fi
			PARSED_FILE_LABEL=$(date -j -f "%b-%e-%Y" "$raw_date" +"%b-%e-%Y" | tr -d ' ')
		else
			echo "Error: Invalid date format '$raw_date'. Expected 'YYYY-MM-DD' or 'Mon Day, Year'." >&2
			exit 1
		fi
	fi
}

parse_date_to_vars "$START_ARG" "false"
START_DATE="$PARSED_ISO"
FILENAME_START_DATE="$PARSED_FILE_LABEL"

if [ -n "$END_ARG" ]; then
	parse_date_to_vars "$END_ARG" "true"
	END_DATE="$PARSED_ISO"
	CURRENT_DATE_FILENAME="$PARSED_FILE_LABEL"
else
	END_DATE=$(date +"%Y-%m-%d 23:59:59")
	if date --version >/dev/null 2>&1; then
		CURRENT_DATE_FILENAME=$(date +"%b-%-d-%Y")
	else
		CURRENT_DATE_FILENAME=$(date +"%b-%e-%Y" | tr -d ' ')
	fi
fi

EMPTY_TREE_HASH="4b825dc642cb6eb9a060e54bf8d69288fbee4904"
OUTPUT_FILE="$OUTPUT_DIR/for-coach-from-${FILENAME_START_DATE}-to-${CURRENT_DATE_FILENAME}.txt"
LATEST_FILE="$OUTPUT_DIR/for-coach-latest.txt"

# Clear or create output file
>"$OUTPUT_FILE"

echo "Gathering coaching diffs from $START_DATE to $END_DATE..."
echo "Output file: $OUTPUT_FILE"

TOTAL_REPOS=0
REPOS_WITH_CHANGES=0

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

	if [ -d "$target_dir" ]; then
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
			if [ -d ".git" ]; then
				if [ "$FETCH" = true ]; then
					git fetch --quiet origin 2>/dev/null || true
				fi

				# Resolve canonical default branch
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

				START_COMMIT=$(git rev-list -1 --before="$START_DATE" "$TARGET_REF" 2>/dev/null || true)
				END_COMMIT=$(git rev-list -1 --before="$END_DATE" "$TARGET_REF" 2>/dev/null || true)

				if [ -n "$START_COMMIT" ] && [ -n "$END_COMMIT" ] && [ "$START_COMMIT" != "$END_COMMIT" ]; then
					if [ "${#PATH_EXCLUDES[@]}" -gt 0 ]; then
						CHANGES=$(git diff "$START_COMMIT" "$END_COMMIT" -- . "${PATH_EXCLUDES[@]}")
					else
						CHANGES=$(git diff "$START_COMMIT" "$END_COMMIT")
					fi
					if [ -n "$CHANGES" ]; then
						{
							echo "===== $folder ====="
							echo "$CHANGES"
							echo ""
						} >>"$OUTPUT_FILE"
						exit 2 # Signal changes found
					fi
				elif [ -z "$START_COMMIT" ] && [ -n "$END_COMMIT" ]; then
					if [ "${#PATH_EXCLUDES[@]}" -gt 0 ]; then
						CHANGES=$(git diff "$EMPTY_TREE_HASH" "$END_COMMIT" -- . "${PATH_EXCLUDES[@]}")
					else
						CHANGES=$(git diff "$EMPTY_TREE_HASH" "$END_COMMIT")
					fi
					if [ -n "$CHANGES" ]; then
						{
							echo "===== $folder ====="
							echo "$CHANGES"
							echo ""
						} >>"$OUTPUT_FILE"
						exit 2 # Signal changes found
					fi
				fi
			fi
		) || STATUS=$?
		if [ "$STATUS" -eq 2 ]; then
			REPOS_WITH_CHANGES=$((REPOS_WITH_CHANGES + 1))
		fi
	else
		echo "Warning: Directory $target_dir does not exist. Skipping..."
	fi
done <"$REPOS_FILE"

# Refresh latest link/copy
cp -f "$OUTPUT_FILE" "$LATEST_FILE" 2>/dev/null || true

DIFF_LINES=$(wc -l < "$OUTPUT_FILE" | awk '{print $1}')
echo ""
echo "Done! Scanned $TOTAL_REPOS repositories ($REPOS_WITH_CHANGES with changes)."
echo "Total diff lines: $DIFF_LINES"
echo "Saved to: $OUTPUT_FILE"
echo "Refreshed: $LATEST_FILE"
echo "Completed at $(date '+%Y-%m-%d %H:%M:%S')"
