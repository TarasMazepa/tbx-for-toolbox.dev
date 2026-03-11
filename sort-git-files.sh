#!/bin/bash

# Ensure we are inside a git repository
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "Error: You must run this script inside a Git repository."
    exit 1
fi

echo "Sorting tracked files from newest to oldest (Git commit history)..."
echo "-------------------------------------------------------------------"

# Loop through tracked files, get the latest commit timestamp, sort, and format
git ls-files | while read -r file; do
    # Get the Unix timestamp of the last commit for the file
    timestamp=$(git log -1 --format="%ct" -- "$file")
    
    # Only process if a timestamp was found (handles edge cases)
    if [ -n "$timestamp" ]; then
        echo "$timestamp $file"
    fi
done | sort -nr | cut -d' ' -f2-

