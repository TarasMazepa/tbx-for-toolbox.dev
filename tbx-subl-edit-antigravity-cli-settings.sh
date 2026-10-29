#!/bin/bash
set -e

usage() {
	echo "Usage: $(basename "$0") [subl arguments]"
	echo ""
	echo "Opens the Antigravity CLI settings file (~/.gemini/antigravity-cli/settings.json) in Sublime Text."
	echo ""
	echo "Options:"
	echo "  -h, --help            Show this help message"
	echo ""
	echo "Any additional arguments are forwarded directly to 'subl'."
	echo ""
	echo "Example command:"
	basename "$0"
}

if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
	usage
	exit 0
fi

SETTINGS_FILE="$HOME/.gemini/antigravity-cli/settings.json"

SUBL_BIN=""
if command -v subl >/dev/null 2>&1; then
	SUBL_BIN="subl"
elif [ -x "/Applications/Sublime Text.app/Contents/SharedSupport/bin/subl" ]; then
	SUBL_BIN="/Applications/Sublime Text.app/Contents/SharedSupport/bin/subl"
fi

if [ -z "$SUBL_BIN" ]; then
	echo "Error: Sublime Text CLI 'subl' was not found in PATH or standard macOS location."
	echo "To install Sublime Text via Homebrew, run:"
	echo "brew install --cask sublime-text"
	exit 1
fi

SETTINGS_DIR="$(dirname "$SETTINGS_FILE")"
if [ ! -d "$SETTINGS_DIR" ]; then
	mkdir -p "$SETTINGS_DIR"
fi

if [ ! -f "$SETTINGS_FILE" ]; then
	echo "{}" >"$SETTINGS_FILE"
	echo "Initialized settings file at $SETTINGS_FILE"
fi

echo "Opening $SETTINGS_FILE in Sublime Text..."
"$SUBL_BIN" "$@" "$SETTINGS_FILE"
