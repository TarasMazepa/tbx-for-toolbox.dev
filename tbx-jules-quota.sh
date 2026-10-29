#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_KEY="${JULES_API_KEY:-}"
CONCURRENCY_LIMIT=15
DAILY_LIMIT=100

CLEAN_DANGLING=false

usage() {
	echo "Usage: $(basename "$0") [OPTIONS]"
	echo ""
	echo "Checks Jules active concurrency (limit: $CONCURRENCY_LIMIT) and rolling 24-hour usage (limit: $DAILY_LIMIT)"
	echo "via the Jules REST API so you know whether you can enqueue more work."
	echo ""
	echo "Options:"
	echo "  --clean, -c           Delete any non-COMPLETED sessions that are FAILED, PAUSED, AWAITING_*, or stuck > 2h"
	echo "  --api-key <key>       Jules API Key (or set JULES_API_KEY, or save to ~/.jules_api_key)"
	echo "  -h, --help            Show this help message"
	echo ""
	echo "Example command:"
	echo "$0"
}

while [ $# -gt 0 ]; do
	case "$1" in
	--clean | -c)
		CLEAN_DANGLING=true
		shift
		;;
	--api-key)
		API_KEY="$2"
		shift 2
		;;
	-h | --help)
		usage
		exit 0
		;;
	*)
		echo "Error: Unknown argument '$1'" >&2
		echo "Run with --help to see usage:" >&2
		echo "$0 --help" >&2
		exit 1
		;;
	esac
done

if [ -z "$API_KEY" ]; then
	if [ -f "$SCRIPT_DIR/.jules_api_key" ]; then
		API_KEY="$(tr -d '[:space:]' <"$SCRIPT_DIR/.jules_api_key")"
	elif [ -f "$HOME/.jules_api_key" ]; then
		API_KEY="$(tr -d '[:space:]' <"$HOME/.jules_api_key")"
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

if [ "$CLEAN_DANGLING" = true ]; then
	echo "Scanning all pages for non-COMPLETED sessions (FAILED, PAUSED, AWAITING_*, or stuck > 2h)..."
	TOKEN=""
	PAGE=1
	DELETED_COUNT=0
	while [ $PAGE -le 20 ]; do
		URL="https://jules.googleapis.com/v1alpha/sessions?pageSize=100&filter=archived%20%3D%20true%20OR%20archived%20%3D%20false"
		[ -n "$TOKEN" ] && URL="${URL}&pageToken=${TOKEN}"
		PAGE_RESP=$(curl -sS -H "X-Goog-Api-Key: $API_KEY" "$URL")
		CANDIDATES=$(printf '%s\n' "$PAGE_RESP" | jq -r '
			def parse_ts(s): (s | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601);
			(.sessions // [])[] |
			select(.state != "COMPLETED") |
			select(
				(.state != "IN_PROGRESS" and .state != "QUEUED" and .state != "PLANNING") or
				((now - parse_ts(.createTime)) > 7200)
			) |
			"\(.id)\t\(.state)\t\(.title // .prompt // "" | gsub("[\\r\\n\\t]+"; " ") | .[0:60])"
		')
		if [ -n "$CANDIDATES" ]; then
			while IFS=$'\t' read -r cid cstate ctitle || [ -n "$cid" ]; do
				[ -z "$cid" ] && continue
				del_code=$(curl -sS -o /dev/null -w "%{http_code}" -X DELETE \
					-H "X-Goog-Api-Key: $API_KEY" \
					"https://jules.googleapis.com/v1alpha/sessions/$cid")
				echo "Deleted [$cstate] $cid ($ctitle) -> HTTP $del_code"
				DELETED_COUNT=$((DELETED_COUNT + 1))
			done <<EOF
$CANDIDATES
EOF
		fi
		TOKEN=$(printf '%s\n' "$PAGE_RESP" | jq -r '.nextPageToken // empty')
		[ -z "$TOKEN" ] && break
		PAGE=$((PAGE + 1))
	done
	echo "Clean complete: deleted $DELETED_COUNT dangling session(s)."
	echo ""
fi

RESPONSE=$(curl -sS -H "X-Goog-Api-Key: $API_KEY" \
	"https://jules.googleapis.com/v1alpha/sessions?pageSize=100&filter=archived%20%3D%20true%20OR%20archived%20%3D%20false")

if printf '%s\n' "$RESPONSE" | jq -e '.error' >/dev/null 2>&1; then
	echo "Error from Jules REST API:" >&2
	printf '%s\n' "$RESPONSE" | jq '.error' >&2
	exit 1
fi

printf '%s\n' "$RESPONSE" | jq -r \
	--argjson conc_limit "$CONCURRENCY_LIMIT" \
	--argjson daily_limit "$DAILY_LIMIT" '
	def parse_ts(s): (s | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601);
	def fmt_dur(secs):
		if secs <= 0 then "now"
		elif secs < 60 then "\(secs | floor)s"
		elif secs < 3600 then "\((secs / 60) | floor)m \((secs % 60) | floor)s"
		else "\((secs / 3600) | floor)h \(((secs % 3600) / 60) | floor)m"
		end;

	(now - 86400) as $cutoff |
	(.sessions // []) as $all |
	($all | map(select(parse_ts(.createTime) >= $cutoff))) as $last24h |
	($all | map(select(.state != "COMPLETED"))) as $non_terminal |
	($non_terminal | map(select(.state == "IN_PROGRESS"))) as $in_prog |
	($non_terminal | map(select(.state == "QUEUED" or .state == "PLANNING"))) as $queued |
	($non_terminal | map(select(.state != "IN_PROGRESS" and .state != "QUEUED" and .state != "PLANNING"))) as $other_active |

	($non_terminal | length) as $active_count |
	($last24h | length) as $daily_count |
	([$conc_limit - $active_count, 0] | max) as $conc_avail |
	([$daily_limit - $daily_count, 0] | max) as $daily_avail |
	([$conc_avail, $daily_avail] | min) as $can_enqueue |

	"================================================================================",
	"Jules Quota & Concurrency Status",
	"================================================================================",
	"Active Concurrency : \($active_count) / \($conc_limit)  (\($in_prog | length) in progress, \($queued | length) queued" +
		(if ($other_active | length) > 0 then ", \($other_active | length) failed/awaiting/paused" else "" end) +
		") -> \($conc_avail) slot(s) free",
	"Rolling 24h Usage  : \($daily_count) / \($daily_limit) + any deleted in 24h -> up to \($daily_avail) slot(s) free",
	(if $daily_count > 0 then
		(parse_ts($last24h[-1].createTime) + 86400 - now) as $next_sec |
		($last24h | map(select((parse_ts(.createTime) + 86400 - now) <= 3600)) | length) as $roll_1h |
		"Next 24h Rollover  : in \(fmt_dur($next_sec)) (\($roll_1h) session(s) expiring within the next 1h)"
	else
		"Next 24h Rollover  : N/A (0 sessions in last 24h)"
	end),
	"--------------------------------------------------------------------------------",
	(if $active_count > 0 then
		"Currently Active Sessions (\($active_count)):",
		($non_terminal[] |
			(now - parse_ts(.createTime)) as $age |
			((.sourceContext.source // "unknown") | sub("^sources/github/"; "")) as $repo |
			((.title // .prompt // "") | gsub("[\\r\\n]+"; " ") | .[0:55]) as $title |
			"  - [\(.state)] \(fmt_dur($age)) old | \($repo) | \($title)\n    \(.url // ("https://jules.google.com/session/" + .id))"
		),
		"--------------------------------------------------------------------------------"
	else
		empty
	end),
	(if $can_enqueue > 0 then
		"Status             : READY — you can enqueue up to \($can_enqueue) session(s) right now."
	else
		"Status             : AT CAPACITY — wait for active sessions to finish or 24h quota to roll over."
	end),
	"",
	"Jules usage — Active concurrency: \($active_count)/\($conc_limit) (\($in_prog | length) in progress, \($queued | length) queued) | Rolling 24h: \($daily_count)/\($daily_limit) + deleted" +
	(if $daily_count > 0 then
		" (next rollover in \(fmt_dur(parse_ts($last24h[-1].createTime) + 86400 - now)))"
	else "" end)
'
