#!/bin/bash
set -euo pipefail

usage() {
	cat <<EOF
Usage: $(basename "$0") [FLAGS] <branch>...

Run 'stax pull --force-delete' once, then run 'stax get --skip-pull [FLAGS] <branch>' for each branch.

Any argument starting with '-' (other than -h/--help) is treated as a flag and
forwarded to every 'stax get' invocation.

Options:
  -h, --help    Show this help message
EOF
}

FLAGS=()
BRANCHES=()
PARSE_FLAGS=1

for arg in "$@"; do
	if [ "$PARSE_FLAGS" -eq 1 ] && [ "$arg" = "--" ]; then
		PARSE_FLAGS=0
		continue
	fi

	if [ "$PARSE_FLAGS" -eq 1 ]; then
		case "$arg" in
			-h|--help)
				usage
				exit 0
				;;
			-*)
				FLAGS+=("$arg")
				continue
				;;
		esac
	fi

	BRANCHES+=("$arg")
done

if [ ${#BRANCHES[@]} -eq 0 ]; then
	echo "Error: At least one branch argument is required." >&2
	usage >&2
	exit 1
fi

echo "stax pull --force-delete"
stax pull --force-delete

for branch in "${BRANCHES[@]}"; do
	if [ ${#FLAGS[@]} -gt 0 ]; then
		echo "stax get --skip-pull ${FLAGS[*]} $branch"
		stax get --skip-pull "${FLAGS[@]}" "$branch"
	else
		echo "stax get --skip-pull $branch"
		stax get --skip-pull "$branch"
	fi
done
