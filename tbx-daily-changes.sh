#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOS_FILE="$SCRIPT_DIR/till/repositories.txt"

if [ ! -f "$REPOS_FILE" ]; then
	echo "Error: $REPOS_FILE does not exist. It needs to be created."
	echo "You can create it by running:"
	echo "mkdir -p \"$SCRIPT_DIR/till\" && touch \"$REPOS_FILE\""
	exit 1
fi

if [[ "$OSTYPE" == "darwin"* ]]; then
	START_DATE=$(date -v-1d +"%Y-%m-%d 00:00:00")
else
	START_DATE=$(date -d "yesterday" +"%Y-%m-%d 00:00:00")
fi
END_DATE=$(date +"%Y-%m-%d 00:00:00")
EMPTY_TREE_HASH="4b825dc642cb6eb9a060e54bf8d69288fbee4904"

OUTPUT_FILE="$PWD/daily_changes.txt"
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
