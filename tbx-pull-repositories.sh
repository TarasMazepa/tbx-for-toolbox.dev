#!/bin/bash

REPOS_FILE="$HOME/repositories.txt"

if [ ! -f "$REPOS_FILE" ]; then
    echo "Error: $REPOS_FILE does not exist."
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
        echo "Processing $target_dir..."
        (
            cd "$target_dir" || exit
            stax pull -f
        )
    else
        echo "Warning: Directory $target_dir does not exist. Skipping..."
    fi
done < "$REPOS_FILE"
