#!/bin/bash

# Default to current directory if no argument is provided
TARGET_DIR="${1:-.}"

# Ensure the target directory exists
if [ ! -d "$TARGET_DIR" ]; then
    echo "Error: Directory '$TARGET_DIR' does not exist."
    exit 1
fi

OUTPUT_FILE="combined.txt"

# Clear or create the output file
> "$OUTPUT_FILE"

# Find all files in the target directory and its subdirectories
# -type f: only files
# -not -name "$OUTPUT_FILE": exclude the output file itself
# -not -name "tbx-combine-files.sh": exclude this script
find "$TARGET_DIR" -type f \
    -not -name "$OUTPUT_FILE" \
    -not -name "tbx-combine-files.sh" \
    -not -path "*/.git/*" \
    | sort \
    | while read -r file; do

    # Write the header
    echo "file: $file" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"

    # Write the file content
    cat "$file" >> "$OUTPUT_FILE"

    # If the file is not empty and doesn't end with a newline, add one
    if [ -s "$file" ] && [ "$(tail -c 1 "$file" | wc -l)" -eq 0 ]; then
        echo "" >> "$OUTPUT_FILE"
    fi

    # Add an empty line after the file content
    echo "" >> "$OUTPUT_FILE"
done

echo "Combined files into $OUTPUT_FILE"
