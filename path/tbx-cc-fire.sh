#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# tbx-cc-fire.sh — Trigger a Remote Claude Code Cloud Routine
# ==============================================================================
# What this does:
#   Sends an HTTP POST to Anthropic's Claude Code Cloud routines `/fire` API
#   endpoint to launch an autonomous cloud coding session on a GitHub repo.
#
# Payload format:
#   {"text": "Repo: <owner/repo>. Change: <prompt>"}
#   (If <repo> has no "/", it defaults to "TarasMazepa/<repo>".)
#
# Required HTTP headers:
#   - Authorization: Bearer <token>
#   - anthropic-beta: experimental-cc-routine-2026-04-01
#   - anthropic-version: 2023-06-01
#   - Content-Type: application/json
#
# Authentication resolution order:
#   1. Env vars: CLAUDE_CODE_ROUTINE_URL and CLAUDE_CODE_ROUTINE_TOKEN
#   2. Config file override: CLAUDE_CODE_ROUTINE_FILE (if set)
#   3. Default local config: $HOME/.claude-code-routine.json
#      Format: {"url": "https://api.anthropic.com/...", "token": "sk-ant-..."}
#
# Observability:
#   On success, the script prints the HTTP status line and raw JSON body:
#     HTTP 200
#     {"claude_code_session_id":"cse_...","claude_code_session_url":"https://claude.ai/code/cse_...","type":"routine_fire"}
#   Open `claude_code_session_url` in a browser to watch the live session.
#
# macOS Bash 3.2 compatible. Works when invoked from any directory.
# ==============================================================================

usage() {
  cat <<'EOF'
Usage:
  tbx-cc-fire.sh [--dry-run] <repo> <prompt>

Arguments:
  <repo>     Repository name (e.g. "TarasMazepa/stax" or "stax")
  <prompt>   Change description / task prompt

Options:
  --dry-run  Print the JSON payload and exit without sending the request
  -h, --help Show this help message

Auth Resolution Order:
  1. Env vars: CLAUDE_CODE_ROUTINE_URL and CLAUDE_CODE_ROUTINE_TOKEN
  2. File override: CLAUDE_CODE_ROUTINE_FILE (JSON with "url" and "token")
  3. Default file: $HOME/.claude-code-routine.json

Example Output:
  HTTP 200
  {"claude_code_session_id":"cse_...","claude_code_session_url":"https://claude.ai/code/cse_...","type":"routine_fire"}
EOF
}

dry_run=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run)
      dry_run=true
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
      printf 'Error: unknown option: %s\n' "$1" >&2
      usage >&2
      exit 1
      ;;
    *)
      break
      ;;
  esac
done

if [ "$#" -lt 2 ]; then
  usage >&2
  exit 1
fi

repo="$1"
shift
prompt="$*"

case "$repo" in
  */*) ;;
  *) repo="TarasMazepa/$repo" ;;
esac

text="Repo: ${repo}. Change: ${prompt}"

if command -v jq >/dev/null 2>&1; then
  payload="$(jq -nc --arg text "$text" '{text: $text}')"
elif command -v python3 >/dev/null 2>&1; then
  payload="$(python3 -c 'import json, sys; print(json.dumps({"text": sys.argv[1]}))' "$text")"
else
  printf 'Error: neither jq nor python3 is available to build JSON payload.\n' >&2
  exit 1
fi

if [ "$dry_run" = true ]; then
  printf 'Payload: %s\n' "$payload"
  exit 0
fi

routine_url="${CLAUDE_CODE_ROUTINE_URL:-}"
routine_token="${CLAUDE_CODE_ROUTINE_TOKEN:-}"
config_file="${CLAUDE_CODE_ROUTINE_FILE:-$HOME/.claude-code-routine.json}"

if { [ -z "$routine_url" ] || [ -z "$routine_token" ]; } && [ -f "$config_file" ]; then
  if command -v jq >/dev/null 2>&1; then
    [ -z "$routine_url" ] && routine_url="$(jq -r '.url // empty' "$config_file")"
    [ -z "$routine_token" ] && routine_token="$(jq -r '.token // empty' "$config_file")"
  elif command -v python3 >/dev/null 2>&1; then
    if [ -z "$routine_url" ]; then
      routine_url="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("url",""))' "$config_file")"
    fi
    if [ -z "$routine_token" ]; then
      routine_token="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("token",""))' "$config_file")"
    fi
  fi
fi

if [ -z "$routine_url" ] || [ -z "$routine_token" ]; then
  printf 'Error: routine URL and token must be set via CLAUDE_CODE_ROUTINE_URL/CLAUDE_CODE_ROUTINE_TOKEN or %s.\n' "$config_file" >&2
  exit 1
fi

response="$(curl -sS -w '\n%{http_code}' -X POST "$routine_url" \
  -H "Authorization: Bearer ${routine_token}" \
  -H "anthropic-beta: experimental-cc-routine-2026-04-01" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d "$payload")"

http_code="$(printf '%s\n' "$response" | tail -n 1)"
body="$(printf '%s\n' "$response" | sed '$d')"

printf 'HTTP %s\n' "$http_code"
if [ -n "$body" ]; then
  printf '%s\n' "$body"
fi

case "$http_code" in
  2??) exit 0 ;;
  *) exit 1 ;;
esac
