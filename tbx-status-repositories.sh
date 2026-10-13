#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOS_FILE="$SCRIPT_DIR/till/repositories.txt"

if [ ! -f "$REPOS_FILE" ]; then
	echo "Error: $REPOS_FILE does not exist. It needs to be created."
	echo "You can create it by running:"
	echo "mkdir -p \"$SCRIPT_DIR/till\" && touch \"$REPOS_FILE\""
	exit 1
fi

total_checked=0
clean_count=0
dirty_count=0
skipped_count=0
dirty_repos=()

echo "Checking repositories for uncommitted changes (staged, unstaged, untracked)..."
echo ""

while IFS= read -r folder || [ -n "$folder" ]; do
	# Trim leading/trailing whitespace
	folder="$(echo "${folder}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"

	# Skip empty lines and comments
	if [[ -z "$folder" || "$folder" == \#* ]]; then
		continue
	fi

	target_dir="$HOME/$folder"

	if [ ! -d "$target_dir" ]; then
		echo "Warning: Directory $target_dir does not exist. Skipping..."
		skipped_count=$((skipped_count + 1))
		continue
	fi

	if ! git -C "$target_dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
		echo "Warning: $target_dir is not a Git repository. Skipping..."
		skipped_count=$((skipped_count + 1))
		continue
	fi

	total_checked=$((total_checked + 1))

	# Get git status porcelain output
	repo_status="$(git -C "$target_dir" status --porcelain 2>/dev/null)"

	if [ -n "$repo_status" ]; then
		dirty_count=$((dirty_count + 1))

		# Parse staged, unstaged, untracked, unmerged using awk (macOS / Bash 3.2 compatible)
		read -r staged unstaged untracked unmerged < <(printf "%s\n" "$repo_status" | awk '
BEGIN { staged = 0; unstaged = 0; untracked = 0; unmerged = 0 }
/^(\?\?)/ { untracked++; next }
/^!!/ { next }
/^(UU|AA|DD|AU|UD|UA|DU)/ { unmerged++; next }
{
	x = substr($0, 1, 1)
	y = substr($0, 2, 1)
	if (x ~ /[MADRC]/) staged++
	if (y ~ /[MDA]/) unstaged++
}
END {
	printf "%d %d %d %d\n", staged, unstaged, untracked, unmerged
}')

		parts=()
		[ "$staged" -gt 0 ] && parts+=("$staged staged")
		[ "$unstaged" -gt 0 ] && parts+=("$unstaged unstaged")
		[ "$untracked" -gt 0 ] && parts+=("$untracked untracked")
		[ "$unmerged" -gt 0 ] && parts+=("$unmerged unmerged (conflict)")

		summary_desc=""
		for part in "${parts[@]}"; do
			if [ -z "$summary_desc" ]; then
				summary_desc="$part"
			else
				summary_desc="$summary_desc, $part"
			fi
		done

		current_branch="$(git -C "$target_dir" branch --show-current 2>/dev/null)"
		if [ -z "$current_branch" ]; then
			current_branch="$(git -C "$target_dir" rev-parse --short HEAD 2>/dev/null)"
			[ -n "$current_branch" ] && current_branch="detached at $current_branch"
		fi

		branch_display=""
		if [ -n "$current_branch" ]; then
			branch_display=" ($current_branch)"
		fi

		dirty_repos+=("$folder$branch_display: $summary_desc")

		echo "--------------------------------------------------------------------------------"
		echo "Repository: $folder$branch_display"
		echo "Path: $target_dir"
		echo "Changes: $summary_desc"
		echo ""
		echo "Details:"
		echo "$repo_status"
		echo ""
		echo "To inspect or resolve this repository, run:"
		echo "cd \"$target_dir\""
		echo "--------------------------------------------------------------------------------"
		echo ""
	else
		clean_count=$((clean_count + 1))
	fi
done <"$REPOS_FILE"

echo "================================================================================"
if [ "$dirty_count" -gt 0 ]; then
	echo "Status Summary:"
	echo "  Checked: $total_checked"
	echo "  Clean:   $clean_count"
	echo "  Dirty:   $dirty_count"
	if [ "$skipped_count" -gt 0 ]; then
		echo "  Skipped: $skipped_count"
	fi
	echo ""
	echo "Repositories needing attention:"
	for item in "${dirty_repos[@]}"; do
		echo "  - $item"
	done
	echo ""
	echo "Resolve or stash changes before pulling."
	echo "Once changes are resolved, you can pull all repositories by running:"
	echo "\"$SCRIPT_DIR/tbx-pull-repositories.sh\""
	exit 1
else
	echo "All $total_checked repositories are clean (no staged, unstaged, or untracked changes)."
	if [ "$skipped_count" -gt 0 ]; then
		echo "  Skipped: $skipped_count"
	fi
	echo ""
	echo "To pull all repositories, run:"
	echo "\"$SCRIPT_DIR/tbx-pull-repositories.sh\""
	exit 0
fi
