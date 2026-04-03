#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOS_FILE="$SCRIPT_DIR/till/repositories.txt"

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

if [ -n "$1" ]; then
	EXTRACTED_DATE="$1"
else
	CLIPBOARD_DATA=$(get_clipboard)

	# Try to extract a date like "Mar 8, 2026"
	EXTRACTED_DATE=$(echo "$CLIPBOARD_DATA" | grep -oE "[A-Z][a-z]{2} [0-9]{1,2}, [0-9]{4}" | head -n 1)

	if [ -z "$EXTRACTED_DATE" ]; then
		echo "Error: No valid date found in clipboard."
		echo "Please copy the data containing a date (e.g. 'Mar 8, 2026') into your clipboard and run this script again."
		exit 1
	fi
fi

# Parse the extracted date
if date --version >/dev/null 2>&1; then
	# GNU date
	if ! date -d "$EXTRACTED_DATE" >/dev/null 2>&1; then
		echo "Error: Invalid date format '$EXTRACTED_DATE'."
		exit 1
	fi
	START_DATE=$(date -d "$EXTRACTED_DATE" +"%Y-%m-%d 00:00:00")
	FILENAME_START_DATE=$(date -d "$EXTRACTED_DATE" +"%b-%-d-%Y")
	CURRENT_DATE_FILENAME=$(date +"%b-%-d-%Y")
	END_DATE=$(date +"%Y-%m-%d 23:59:59")
else
	# BSD date
	if ! date -j -f "%b %e, %Y" "$EXTRACTED_DATE" >/dev/null 2>&1; then
		echo "Error: Invalid date format '$EXTRACTED_DATE'."
		exit 1
	fi
	START_DATE=$(date -j -f "%b %e, %Y" "$EXTRACTED_DATE" +"%Y-%m-%d 00:00:00")
	FILENAME_START_DATE=$(date -j -f "%b %e, %Y" "$EXTRACTED_DATE" +"%b-%e-%Y" | tr -d ' ')
	CURRENT_DATE_FILENAME=$(date +"%b-%e-%Y" | tr -d ' ')
	END_DATE=$(date +"%Y-%m-%d 23:59:59")
fi

EMPTY_TREE_HASH="4b825dc642cb6eb9a060e54bf8d69288fbee4904"

# Ensure output directory exists
mkdir -p "$HOME/change-reports"
OUTPUT_FILE="$HOME/change-reports/for-coach-from-${FILENAME_START_DATE}-to-${CURRENT_DATE_FILENAME}.txt"

# shellcheck disable=SC2188
>"$OUTPUT_FILE" # Clear or create file

echo "Gathering changes from $START_DATE to $END_DATE..."

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
				# Find the last commit BEFORE start date
				START_COMMIT=$(git rev-list -1 --before="$START_DATE" HEAD 2>/dev/null)
				# Find the last commit BEFORE end date
				END_COMMIT=$(git rev-list -1 --before="$END_DATE" HEAD 2>/dev/null)

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

echo "Changes combined into $OUTPUT_FILE"
