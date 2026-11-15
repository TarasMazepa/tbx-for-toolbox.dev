#!/bin/bash

SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
	DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
	SOURCE="$(readlink "$SOURCE")"
	[[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done
SCRIPT_DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
REPO_ROOT="$(cd -P "$SCRIPT_DIR/.." && pwd)"
REPOS_FILE="$REPO_ROOT/till/repositories.txt"

if [ ! -f "$REPOS_FILE" ]; then
	echo "Error: $REPOS_FILE does not exist. It needs to be created."
	echo "You can create it by running:"
	echo "mkdir -p \"$REPO_ROOT/till\" && touch \"$REPOS_FILE\""
	exit 1
fi

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
			start_time=$SECONDS
			echo "Processing $target_dir..."
			cd "$target_dir" || exit
			stax pull --force-delete --quiet --decline-all
			elapsed=$((SECONDS - start_time))
			echo "Done processing $target_dir in ${elapsed}s"
		) &
	else
		echo "Warning: Directory $target_dir does not exist. Skipping..."
	fi
done <"$REPOS_FILE"

wait

echo ""
echo "Completed at $(date '+%Y-%m-%d %H:%M:%S')"
