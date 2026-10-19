#!/bin/bash
set -e

SETTINGS_FILE="${SETTINGS_FILE:-$HOME/.gemini/antigravity-cli/settings.json}"

if [ ! -f "$SETTINGS_FILE" ]; then
	echo "Error: Settings file not found at $SETTINGS_FILE"
	exit 1
fi

echo "Sorting permissions.allow in $SETTINGS_FILE..."

# Use python to load JSON, sort permissions.allow array, and save it back
python3 -c "
import json
import sys

filepath = sys.argv[1]

try:
    with open(filepath, 'r') as f:
        data = json.load(f)
except json.JSONDecodeError as e:
    print(f'Error parsing JSON: {e}')
    sys.exit(1)
except Exception as e:
    print(f'Error reading file: {e}')
    sys.exit(1)

if 'permissions' in data and 'allow' in data['permissions']:
    data['permissions']['allow'] = sorted(data['permissions']['allow'])

    try:
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)
            f.write('\n') # Ensure trailing newline
    except Exception as e:
        print(f'Error writing file: {e}')
        sys.exit(1)

    print('Successfully sorted permissions.allow')
else:
    print('permissions.allow not found in settings file')
" "$SETTINGS_FILE"
