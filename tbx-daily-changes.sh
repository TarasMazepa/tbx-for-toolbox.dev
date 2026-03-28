#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOS_FILE="$SCRIPT_DIR/till/repositories.txt"

if [ ! -f "$REPOS_FILE" ]; then
	echo "Error: $REPOS_FILE does not exist. It needs to be created."
	echo "You can create it by running:"
	echo "mkdir -p \"$SCRIPT_DIR/till\" && touch \"$REPOS_FILE\""
	exit 1
fi

START_DATE=$(date -d "yesterday 00:00:00" +"%Y-%m-%d %H:%M:%S")
END_DATE=$(date -d "today 00:00:00" +"%Y-%m-%d %H:%M:%S")

OUTPUT_FILE="$PWD/daily_changes.txt"
true >"$OUTPUT_FILE" # Clear or create file

echo "Gathering changes from $START_DATE to $END_DATE..."

while IFS= read -r folder || [ -n "$folder" ]; do
	# Trim leading/trailing whitespace
	folder="$(echo -e "${folder}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"

	# Skip empty lines and comments
	if [[ -z "$folder" || "$folder" == \#* ]]; then
		continue
	fi

	target_dir="$HOME/$folder"

	if [ -d "$target_dir" ]; then
		(
			cd "$target_dir" || exit 1
			if [ -d ".git" ]; then
				CHANGES=$(git --no-pager log --since="$START_DATE" --until="$END_DATE" -p)
				if [ -n "$CHANGES" ]; then
					{
						echo "===== $folder ====="
						echo "$CHANGES"
						echo ""
					} >>"$OUTPUT_FILE"
				fi
			fi
		)
	else
		echo "Warning: Directory $target_dir does not exist. Skipping..."
	fi
done <"$REPOS_FILE"

echo "Changes combined into $OUTPUT_FILE"
