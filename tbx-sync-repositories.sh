#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOS_FILE="$SCRIPT_DIR/till/repositories.txt"
STATUS_SCRIPT="$SCRIPT_DIR/tbx-status-repositories.sh"
PULL_SCRIPT="$SCRIPT_DIR/tbx-pull-repositories.sh"

if [ ! -f "$REPOS_FILE" ]; then
	echo "Error: $REPOS_FILE does not exist. It needs to be created."
	echo "You can create it by running:"
	echo "mkdir -p \"$SCRIPT_DIR/till\" && touch \"$REPOS_FILE\""
	exit 1
fi

if [ ! -x "$STATUS_SCRIPT" ]; then
	echo "Error: Status script not found or not executable at $STATUS_SCRIPT"
	echo "You can make it executable by running:"
	echo "chmod +x \"$STATUS_SCRIPT\""
	exit 1
fi

if [ ! -x "$PULL_SCRIPT" ]; then
	echo "Error: Pull script not found or not executable at $PULL_SCRIPT"
	echo "You can make it executable by running:"
	echo "chmod +x \"$PULL_SCRIPT\""
	exit 1
fi

# Run status check first
"$STATUS_SCRIPT"
status_exit_code=$?

# If status is not blank (dirty / exit code != 0), pull only clean repositories
if [ $status_exit_code -ne 0 ]; then
	clean_dirs=()
	dirty_repos=()

	while IFS= read -r folder || [ -n "$folder" ]; do
		# Trim leading/trailing whitespace
		folder="$(echo "${folder}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"

		# Skip empty lines and comments
		if [[ -z "$folder" || "$folder" == \#* ]]; then
			continue
		fi

		target_dir="$HOME/$folder"

		if [ ! -d "$target_dir" ]; then
			continue
		fi

		if ! git -C "$target_dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
			continue
		fi

		repo_status="$(git -C "$target_dir" status --porcelain 2>/dev/null)"
		if [ -z "$repo_status" ]; then
			clean_dirs+=("$target_dir")
		else
			dirty_repos+=("$folder")
		fi
	done <"$REPOS_FILE"

	if [ "${#clean_dirs[@]}" -gt 0 ]; then
		echo ""
		echo "Pulling latest changes for ${#clean_dirs[@]} clean repositories (skipping ${#dirty_repos[@]} with uncommitted changes)..."
		for target_dir in "${clean_dirs[@]}"; do
			(
				start_time=$SECONDS
				echo "Processing $target_dir..."
				cd "$target_dir" || exit
				stax pull --force-delete --quiet --decline-all
				elapsed=$((SECONDS - start_time))
				echo "Done processing $target_dir in ${elapsed}s"
			) &
		done
		wait
	else
		echo ""
		echo "No clean repositories to pull."
	fi

	echo ""
	echo "Skipped repositories with uncommitted changes:"
	for folder in "${dirty_repos[@]}"; do
		echo "  - $folder"
	done
	echo ""
	echo "Once changes are resolved, you can sync again by running:"
	echo "\"$SCRIPT_DIR/tbx-sync-repositories.sh\""
	echo ""
	echo "Completed at $(date '+%Y-%m-%d %H:%M:%S')"
	exit "$status_exit_code"
fi

# If status is blank (all clean), run pull
echo ""
echo "All repositories are clean. Pulling latest changes..."
exec "$PULL_SCRIPT"
