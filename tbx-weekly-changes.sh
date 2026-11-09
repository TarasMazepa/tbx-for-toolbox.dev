#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COACH_SCRIPT="$SCRIPT_DIR/tbx-coach-changes.sh"
DEFAULT_OUTPUT="$HOME/personal/weekly-reports/diffs"

FETCH=true
OUTPUT_DIR=""
SINCE=""
UNTIL=""
TARGET_DATE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --no-fetch)
      FETCH=false
      shift
      ;;
    --fetch)
      FETCH=true
      shift
      ;;
    -o|--output-dir)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --since)
      SINCE="$2"
      shift 2
      ;;
    --until)
      UNTIL="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $(basename "$0") [OPTIONS] [SUNDAY_OR_SATURDAY_DATE] [OUTPUT_DIR]"
      echo "Gathers git diffs for a completed 7-day week (Sunday morning through Saturday evening: [Sun - Sat])."
      echo ""
      echo "Options:"
      echo "  -o, --output-dir DIR  Directory where changes will be written (defaults to ~/personal/weekly-reports/diffs)"
      echo "  --since DATE          Start date of the week (Sunday)"
      echo "  --until DATE          End date of the week (Saturday)"
      echo "  --no-fetch            Skip git fetch before diffing"
      echo "  --fetch               Fetch remote default branches before diffing (default)"
      echo "  -h, --help            Show this help message"
      exit 0
      ;;
    *)
      if [ -z "$TARGET_DATE" ]; then
        TARGET_DATE="$1"
      elif [ -z "$OUTPUT_DIR" ]; then
        OUTPUT_DIR="$1"
      fi
      shift
      ;;
  esac
done

OUTPUT_DIR="${OUTPUT_DIR:-$DEFAULT_OUTPUT}"
mkdir -p "$OUTPUT_DIR"

# Compute default [Sun - Sat] range if not explicitly provided
if [ -z "$SINCE" ] || [ -z "$UNTIL" ]; then
  if [ -n "$TARGET_DATE" ]; then
    # Parse explicit target date
    if date --version >/dev/null 2>&1; then
      # GNU date
      TDOW=$(date -d "$TARGET_DATE" +"%u")
      if [ "$TDOW" -eq 6 ]; then
        UNTIL="${UNTIL:-$TARGET_DATE}"
        SINCE="${SINCE:-$(date -d "$TARGET_DATE - 6 days" +"%Y-%m-%d")}"
      else
        DAYS_TO_SAT=$(( (TDOW % 7) + 1 ))
        DAYS_TO_SUN=$(( DAYS_TO_SAT + 6 ))
        UNTIL="${UNTIL:-$(date -d "$TARGET_DATE - ${DAYS_TO_SAT} days" +"%Y-%m-%d")}"
        SINCE="${SINCE:-$(date -d "$TARGET_DATE - ${DAYS_TO_SUN} days" +"%Y-%m-%d")}"
      fi
    else
      # BSD date (macOS)
      TDOW=$(date -j -f "%Y-%m-%d" "$TARGET_DATE" +"%u")
      if [ "$TDOW" -eq 6 ]; then
        UNTIL="${UNTIL:-$TARGET_DATE}"
        SINCE="${SINCE:-$(date -j -f "%Y-%m-%d" -v-6d "$TARGET_DATE" +"%Y-%m-%d")}"
      else
        DAYS_TO_SAT=$(( (TDOW % 7) + 1 ))
        DAYS_TO_SUN=$(( DAYS_TO_SAT + 6 ))
        UNTIL="${UNTIL:-$(date -j -f "%Y-%m-%d" -v-"${DAYS_TO_SAT}"d "$TARGET_DATE" +"%Y-%m-%d")}"
        SINCE="${SINCE:-$(date -j -f "%Y-%m-%d" -v-"${DAYS_TO_SUN}"d "$TARGET_DATE" +"%Y-%m-%d")}"
      fi
    fi
  else
    # Current date context: resolve the most recently completed [Sun - Sat] week
    DOW=$(date +"%u")
    DAYS_TO_SAT=$(( (DOW % 7) + 1 ))
    DAYS_TO_SUN=$(( DAYS_TO_SAT + 6 ))
    if date -v-1d >/dev/null 2>&1; then
      UNTIL="${UNTIL:-$(date -v-"${DAYS_TO_SAT}"d +"%Y-%m-%d")}"
      SINCE="${SINCE:-$(date -v-"${DAYS_TO_SUN}"d +"%Y-%m-%d")}"
    else
      UNTIL="${UNTIL:-$(date -d "${DAYS_TO_SAT} days ago" +"%Y-%m-%d")}"
      SINCE="${SINCE:-$(date -d "${DAYS_TO_SUN} days ago" +"%Y-%m-%d")}"
    fi
  fi
fi

FETCH_FLAG="--fetch"
if [ "$FETCH" = "false" ]; then
  FETCH_FLAG="--no-fetch"
fi

echo "Gathering weekly changes for [Sun - Sat]: $SINCE (Sunday) to $UNTIL (Saturday)..."
"$COACH_SCRIPT" "$FETCH_FLAG" --since "$SINCE" --until "$UNTIL" -o "$OUTPUT_DIR"

if [ -f "$OUTPUT_DIR/for-coach-latest.txt" ]; then
  cp "$OUTPUT_DIR/for-coach-latest.txt" "$OUTPUT_DIR/weekly-changes-latest.txt"
fi
LATEST_DATED="$(ls -t "$OUTPUT_DIR"/for-coach-from-*.txt 2>/dev/null | head -n 1 || true)"
if [ -n "$LATEST_DATED" ]; then
  cp "$LATEST_DATED" "$OUTPUT_DIR/weekly-changes-$UNTIL.txt"
fi

echo "Weekly changes ready in $OUTPUT_DIR/weekly-changes-$UNTIL.txt"
