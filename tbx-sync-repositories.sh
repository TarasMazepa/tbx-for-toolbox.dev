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

# If status is not blank (dirty / exit code != 0), stop
if [ $status_exit_code -ne 0 ]; then
	echo ""
	echo "Aborting pull: repositories have uncommitted changes or errors."
	echo "Once changes are resolved, you can sync again by running:"
	echo "\"$SCRIPT_DIR/tbx-sync-repositories.sh\""
	exit "$status_exit_code"
fi

# If status is blank (all clean), run pull
echo ""
echo "All repositories are clean. Pulling latest changes..."
"$PULL_SCRIPT"
