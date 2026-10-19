#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Defaults
REPO=""
BRANCH=""
TITLE=""
PROMPT=""
PROMPT_FILE=""
AUTOMATION_MODE="AUTO_CREATE_PR"
REQUIRE_PLAN_APPROVAL=false
DRY_RUN=true
SHOW_STATUS=true
API_KEY="${JULES_API_KEY:-}"

usage() {
	echo "Usage: $(basename "$0") [OPTIONS] [PROMPT]"
	echo ""
	echo "General-purpose tool to queue a task with Google Jules via the REST API."
	echo ""
	echo "Options:"
	echo "  --execute, -x               Execute Jules REST API (defaults to dry-run mode)"
	echo "  --dry-run                   Run in dry-run mode without invoking Jules (default)"
	echo "  --prompt, -p <text>         Task prompt for Jules"
	echo "  --prompt-file, -f <path>    Read task prompt from a file (or '-' for stdin)"
	echo "  --title, -t <title>         Session title (defaults to first line of prompt)"
	echo "  --repo, -r <owner/repo>     Target GitHub repo (e.g. TarasMazepa/monolib)"
	echo "                              (defaults to current directory's git remote origin)"
	echo "  --branch, -b <branch>       Starting branch (defaults to current git branch or 'main')"
	echo "  --auto-pr                   Automatically create PR upon completion (default)"
	echo "  --no-auto-pr                Do not automatically create PR"
	echo "  --require-plan-approval     Require manual plan approval before execution"
	echo "  --api-key <key>             Jules API Key (or set JULES_API_KEY, or save to ~/.jules_api_key)"
	echo "  --no-status                 Do not display Jules quota status after execution"
	echo "  -h, --help                  Show this help message"
	echo ""
	echo "Examples:"
	echo "  $(basename "$0") --dry-run \"Refactor logger to async\""
	echo "  $(basename "$0") -x -p \"Add tests for Flag parser\" -r TarasMazepa/monolib"
	echo "  cat prompt.txt | $(basename "$0") -x -r TarasMazepa/stax"
}

# Parse options
while [ $# -gt 0 ]; do
	case "$1" in
		--execute|-x)
			DRY_RUN=false
			shift
			;;
		--dry-run)
			DRY_RUN=true
			shift
			;;
		--prompt|-p)
			PROMPT="$2"
			shift 2
			;;
		--prompt-file|-f)
			PROMPT_FILE="$2"
			shift 2
			;;
		--title|-t)
			TITLE="$2"
			shift 2
			;;
		--repo|-r)
			REPO="$2"
			shift 2
			;;
		--branch|-b)
			BRANCH="$2"
			shift 2
			;;
		--auto-pr)
			AUTOMATION_MODE="AUTO_CREATE_PR"
			shift
			;;
		--no-auto-pr)
			AUTOMATION_MODE="MANUAL"
			shift
			;;
		--require-plan-approval)
			REQUIRE_PLAN_APPROVAL=true
			shift
			;;
		--no-plan-approval)
			REQUIRE_PLAN_APPROVAL=false
			shift
			;;
		--api-key)
			API_KEY="$2"
			shift 2
			;;
		--no-status)
			SHOW_STATUS=false
			shift
			;;
		-h|--help)
			usage
			exit 0
			;;
		--)
			shift
			break
			;;
		-*)
			echo "Error: Unknown option '$1'" >&2
			echo "Run '$(basename "$0") --help' for usage." >&2
			exit 1
			;;
		*)
			# Positional prompt if not already set
			if [ -z "$PROMPT" ]; then
				PROMPT="$1"
			else
				PROMPT="$PROMPT $1"
			fi
			shift
			;;
	esac
done

# Resolve prompt from file or stdin if needed
if [ -n "$PROMPT_FILE" ]; then
	if [ "$PROMPT_FILE" = "-" ]; then
		PROMPT="$(cat)"
	elif [ -f "$PROMPT_FILE" ]; then
		PROMPT="$(cat "$PROMPT_FILE")"
	else
		echo "Error: Prompt file '$PROMPT_FILE' not found." >&2
		exit 1
	fi
elif [ -z "$PROMPT" ] && [ ! -t 0 ]; then
	# Read piped stdin if prompt was not passed as argument
	PROMPT="$(cat)"
fi

if [ -z "$PROMPT" ]; then
	echo "Error: No prompt provided." >&2
	echo "Provide a prompt via --prompt, --prompt-file, stdin, or as a positional argument." >&2
	echo "Run '$(basename "$0") --help' for usage." >&2
	exit 1
fi

# Auto-detect target repository from current directory if not explicitly provided
if [ -z "$REPO" ]; then
	if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
		REMOTE_URL="$(git config --get remote.origin.url 2>/dev/null || true)"
		if [ -n "$REMOTE_URL" ]; then
			REPO="$(echo "$REMOTE_URL" | sed -E 's#(.*github\.com[:/])?([^/]+/[^/]+)#\2#' | sed 's/\.git$//')"
		fi
	fi
fi

if [ -z "$REPO" ]; then
	echo "Error: Could not determine GitHub repository." >&2
	echo "Please specify target repository using --repo <owner/repo> (e.g. --repo TarasMazepa/monolib)." >&2
	exit 1
fi

# Auto-detect starting branch from current repository if not explicitly provided
if [ -z "$BRANCH" ]; then
	if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
		BRANCH="$(git branch --show-current 2>/dev/null || true)"
	fi
	if [ -z "$BRANCH" ]; then
		BRANCH="main"
	fi
fi

# Derive title if not provided (first non-empty line of prompt, max 60 chars)
if [ -z "$TITLE" ]; then
	FIRST_LINE="$(echo "$PROMPT" | grep -v '^[[:space:]]*$' | head -n 1 | tr -d '\r\n')"
	if [ ${#FIRST_LINE} -gt 60 ]; then
		TITLE="$(echo "$FIRST_LINE" | awk '{print substr($0, 1, 57) "..."}')"
	else
		TITLE="$FIRST_LINE"
	fi
fi

# Resolve API Key
if [ -z "$API_KEY" ]; then
	if [ -f "$SCRIPT_DIR/.jules_api_key" ]; then
		API_KEY="$(tr -d '[:space:]' < "$SCRIPT_DIR/.jules_api_key")"
	elif [ -f "$HOME/.jules_api_key" ]; then
		API_KEY="$(tr -d '[:space:]' < "$HOME/.jules_api_key")"
	fi
fi

print_status_summary() {
	if [ "$SHOW_STATUS" = false ]; then
		return
	fi

	local status_cmd=""
	if [ -x "$SCRIPT_DIR/tbx-jules-quota.sh" ]; then
		status_cmd="$SCRIPT_DIR/tbx-jules-quota.sh"
	elif command -v tbx-jules-quota.sh >/dev/null 2>&1; then
		status_cmd="tbx-jules-quota.sh"
	fi

	if [ -n "$status_cmd" ]; then
		echo ""
		if [ -n "$API_KEY" ]; then
			"$status_cmd" --api-key "$API_KEY" 2>/dev/null || true
		else
			"$status_cmd" 2>/dev/null || true
		fi
	fi
}

echo "==================================================================="
echo "Google Jules Session Dispatcher"
echo "==================================================================="
echo "Repository     : $REPO"
echo "Branch         : $BRANCH"
echo "Title          : $TITLE"
echo "Automation Mode: $AUTOMATION_MODE"
echo "Plan Approval  : $REQUIRE_PLAN_APPROVAL"
echo "Mode           : $([ "$DRY_RUN" = true ] && echo "DRY-RUN (API will NOT be called)" || echo "EXECUTE")"
echo "==================================================================="
echo "Prompt:"
echo "-------------------------------------------------------------------"
echo "$PROMPT"
echo "-------------------------------------------------------------------"

if [ "$DRY_RUN" = true ]; then
	echo ""
	echo "Dry-run mode is active. Jules REST API was NOT invoked."
	echo "To execute this task with Jules, add --execute (-x):"
	echo "$0 --execute --repo \"$REPO\" --branch \"$BRANCH\" --title \"$TITLE\" --prompt \"$PROMPT\""
	print_status_summary
	exit 0
fi

if [ -z "$API_KEY" ]; then
	echo "Error: Jules API key is required when running with --execute." >&2
	echo "Set it via environment variable:" >&2
	echo "export JULES_API_KEY=\"your-api-key\"" >&2
	echo "Or save it to ~/.jules_api_key:" >&2
	echo "echo \"your-api-key\" > ~/.jules_api_key" >&2
	exit 1
fi

PAYLOAD=$(jq -n \
	--arg prompt "$PROMPT" \
	--arg title "$TITLE" \
	--arg source "sources/github/$REPO" \
	--arg branch "$BRANCH" \
	--arg auto_mode "$AUTOMATION_MODE" \
	--argjson plan_approval "$REQUIRE_PLAN_APPROVAL" \
	'{
		prompt: $prompt,
		title: $title,
		sourceContext: {
			source: $source,
			githubRepoContext: {
				startingBranch: $branch
			}
		},
		automationMode: $auto_mode,
		requirePlanApproval: $plan_approval
	}')

echo ""
echo "Calling Jules REST API (https://jules.googleapis.com/v1alpha/sessions)..."

set +e
HTTP_RESPONSE=$(curl -sS -w "\n%{http_code}" \
	-X POST "https://jules.googleapis.com/v1alpha/sessions" \
	-H "Content-Type: application/json" \
	-H "X-Goog-Api-Key: $API_KEY" \
	-d "$PAYLOAD" 2>&1)
CURL_STATUS=$?
set -e

HTTP_CODE=$(printf '%s\n' "$HTTP_RESPONSE" | tail -n 1)
RESPONSE_BODY=$(printf '%s\n' "$HTTP_RESPONSE" | sed '$d')

if [ $CURL_STATUS -eq 0 ] && [ "$HTTP_CODE" -ge 200 ] 2>/dev/null && [ "$HTTP_CODE" -lt 300 ] 2>/dev/null; then
	SESSION_ID=$(printf '%s\n' "$RESPONSE_BODY" | jq -r '.id // (.name // "" | sub("^sessions/"; ""))')
	SESSION_URL=$(printf '%s\n' "$RESPONSE_BODY" | jq -r '.url // ("https://jules.google.com/session/" + (.id // (.name // "" | sub("^sessions/"; ""))))')
	SESSION_STATE=$(printf '%s\n' "$RESPONSE_BODY" | jq -r '.state // "QUEUED"')

	if [ -n "$SESSION_ID" ] && [ "$SESSION_ID" != "null" ]; then
		echo "Jules session created successfully!"
		echo "ID   : $SESSION_ID"
		echo "State: $SESSION_STATE"
		echo "URL  : $SESSION_URL"
		print_status_summary
	else
		echo "Error: Received HTTP $HTTP_CODE but could not parse session ID from response:" >&2
		echo "$RESPONSE_BODY" >&2
		print_status_summary
		exit 1
	fi
else
	echo ""
	echo "Error: Jules REST API request failed (curl exit $CURL_STATUS, HTTP $HTTP_CODE):" >&2
	echo "$RESPONSE_BODY" >&2
	if printf '%s\n' "$RESPONSE_BODY" | grep -q "FAILED_PRECONDITION"; then
		echo "" >&2
		echo "Note: Jules returns HTTP 400 FAILED_PRECONDITION when you hit either the 15 concurrent session limit (including tearing-down/awaiting sessions) or the 100 rolling 24h limit (which also counts sessions deleted in the last 24h)." >&2
	fi
	print_status_summary
	exit 1
fi
