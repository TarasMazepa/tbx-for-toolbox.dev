#!/bin/bash
set -e

if [ $# -eq 0 ]; then
	echo "Usage: $0 <command>"
	exit 1
fi

COMMAND_ARG="$1"
SETTINGS_FILE="${SETTINGS_FILE:-$HOME/.gemini/antigravity-cli/settings.json}"

if [ ! -f "$SETTINGS_FILE" ]; then
	echo "Error: Settings file not found at $SETTINGS_FILE"
	exit 1
fi

echo "Adding 'command($COMMAND_ARG)' to permissions.allow in $SETTINGS_FILE..."

# Use python to load JSON, add the command to permissions.allow array, sort it, and save it back
python3 -c "
import json
import sys

filepath = sys.argv[1]
new_command = f'command({sys.argv[2]})'

try:
    with open(filepath, 'r') as f:
        data = json.load(f)
except json.JSONDecodeError as e:
    print(f'Error parsing JSON: {e}')
    sys.exit(1)
except Exception as e:
    print(f'Error reading file: {e}')
    sys.exit(1)

if 'permissions' not in data:
    data['permissions'] = {}
if 'allow' not in data['permissions']:
    data['permissions']['allow'] = []

if new_command not in data['permissions']['allow']:
    data['permissions']['allow'].append(new_command)
    data['permissions']['allow'] = sorted(data['permissions']['allow'])

    try:
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)
            f.write('\n') # Ensure trailing newline
    except Exception as e:
        print(f'Error writing file: {e}')
        sys.exit(1)

    print(f'Successfully added and sorted {new_command}')
else:
    print(f'{new_command} is already in permissions.allow')
" "$SETTINGS_FILE" "$COMMAND_ARG"
