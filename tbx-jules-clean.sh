#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTO_CONFIRM=false
API_KEY="${JULES_API_KEY:-}"

usage() {
	echo "Usage: $(basename "$0") [OPTIONS]"
	echo ""
	echo "Scans all Google Jules sessions and cleans up dangling sessions that are"
	echo "in FAILED, PAUSED, or AWAITING_* states (which leak concurrency slots)."
	echo ""
	echo "Options:"
	echo "  -y, --yes       Confirm deletion automatically without prompting"
	echo "  --api-key <key> Jules API Key (or set JULES_API_KEY, or save to ~/.jules_api_key)"
	echo "  -h, --help      Show this help message"
	echo ""
	echo "Example:"
	echo "  $(basename "$0")"
}

while [ $# -gt 0 ]; do
	case "$1" in
		-y|--yes)
			AUTO_CONFIRM=true
			shift
			;;
		--api-key)
			API_KEY="$2"
			shift 2
			;;
		-h|--help)
			usage
			exit 0
			;;
		*)
			echo "Error: Unknown option '$1'" >&2
			echo "Run '$(basename "$0") --help' for usage." >&2
			exit 1
			;;
	esac
done

if [ -z "$API_KEY" ]; then
	if [ -f "$SCRIPT_DIR/.jules_api_key" ]; then
		API_KEY="$(tr -d '[:space:]' < "$SCRIPT_DIR/.jules_api_key")"
	elif [ -f "$HOME/.jules_api_key" ]; then
		API_KEY="$(tr -d '[:space:]' < "$HOME/.jules_api_key")"
	fi
fi

if [ -z "$API_KEY" ]; then
	echo "Error: Jules API key not found." >&2
	echo "Set it via environment variable:" >&2
	echo "export JULES_API_KEY=\"your-api-key\"" >&2
	echo "Or save it to ~/.jules_api_key:" >&2
	echo "echo \"your-api-key\" > ~/.jules_api_key" >&2
	exit 1
fi

python3 - "$API_KEY" "$AUTO_CONFIRM" <<'EOF'
import sys, os, urllib.request, json
from concurrent.futures import ThreadPoolExecutor, as_completed

api_key = sys.argv[1]
auto_confirm = sys.argv[2].lower() == 'true'

print("Scanning Jules sessions across all pages...")

page_token = ""
page = 1
candidates = []
total_scanned = 0

while True:
    url = "https://jules.googleapis.com/v1alpha/sessions?pageSize=100&filter=archived%20%3D%20true%20OR%20archived%20%3D%20false"
    if page_token:
        url += f"&pageToken={page_token}"
    req = urllib.request.Request(url, headers={"X-Goog-Api-Key": api_key})
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            sessions = data.get('sessions', [])
            total_scanned += len(sessions)
            for s in sessions:
                state = s.get('state', '')
                # Only target failed, paused, and awaiting states
                if state in ('FAILED', 'PAUSED') or state.startswith('AWAITING'):
                    candidates.append(s)
            page_token = data.get('nextPageToken', '')
            if not page_token or len(sessions) == 0:
                break
            page += 1
    except Exception as e:
        print(f"Error fetching sessions from Jules REST API: {e}", file=sys.stderr)
        sys.exit(1)

if not candidates:
    print(f"Scanned {total_scanned} session(s) across {page} page(s).")
    print("No failed, paused, or awaiting sessions found. Everything is clean!")
    sys.exit(0)

print(f"\nFound {len(candidates)} dangling session(s) (out of {total_scanned} scanned):")
for s in candidates:
    sid = s.get('id', '')
    state = s.get('state', 'UNKNOWN')
    repo = (s.get('sourceContext', {}).get('source', '')).replace('sources/github/', '')
    title = (s.get('title') or s.get('prompt') or '').replace('\n', ' ').strip()[:50]
    repo_info = f" ({repo})" if repo else ""
    print(f"  [{state}] {sid}{repo_info} - {title}")

if not auto_confirm:
    try:
        confirm = input(f"\nDelete these {len(candidates)} session(s)? [y/N]: ").strip().lower()
        if confirm not in ('y', 'yes'):
            print("Aborted.")
            sys.exit(0)
    except (KeyboardInterrupt, EOFError):
        print("\nAborted.")
        sys.exit(1)

print(f"\nDeleting {len(candidates)} session(s)...")

def delete_session(s):
    sid = s.get('id', '')
    state = s.get('state', '')
    del_url = f"https://jules.googleapis.com/v1alpha/sessions/{sid}"
    del_req = urllib.request.Request(del_url, method="DELETE", headers={"X-Goog-Api-Key": api_key})
    try:
        with urllib.request.urlopen(del_req) as resp:
            return sid, state, resp.status, None
    except urllib.error.HTTPError as e:
        return sid, state, e.code, str(e)
    except Exception as e:
        return sid, state, 0, str(e)

deleted_count = 0
failed_count = 0

with ThreadPoolExecutor(max_workers=10) as executor:
    futures = [executor.submit(delete_session, s) for s in candidates]
    for future in as_completed(futures):
        sid, state, code, err = future.result()
        if code in (200, 204):
            deleted_count += 1
            print(f"  Deleted [{state}] {sid}")
        else:
            failed_count += 1
            print(f"  FAILED to delete [{state}] {sid}: HTTP {code} ({err})", file=sys.stderr)

print(f"\nDone: {deleted_count} deleted, {failed_count} failed.")
EOF
