#!/bin/bash

# Default to current directory if no argument is provided
TARGET_DIR="${1:-.}"

# Ensure the target directory exists
if [ ! -d "$TARGET_DIR" ]; then
	echo "Error: Directory '$TARGET_DIR' does not exist."
	exit 1
fi

OUTPUT_FILE=$(mktemp)
trap 'rm -f "$OUTPUT_FILE"' EXIT

# Find all files in the target directory and its subdirectories
# -type f: only files
# -not -name "tbx-combine-files.sh": exclude this script
find "$TARGET_DIR" -type f \
	-not -name "tbx-combine-files.sh" \
	-not -path "*/.git/*" |
	sort |
	while read -r file; do

		{
			echo "file: $file"
			echo ""
			cat "$file"
			echo ""
		} >>"$OUTPUT_FILE"
	done

pbcopy <"$OUTPUT_FILE"

echo "Combined files copied to clipboard"
