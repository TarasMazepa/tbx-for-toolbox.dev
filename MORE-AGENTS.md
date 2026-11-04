# MORE AGENTS

## General
- Always check `till/AGENTS.md` if present; instructions there take priority.

## Daily Summary Workflow
When asked to give a daily summary, summarize daily changes, or prepare a Discord dev update:
1. Check `till/AGENTS.md` if present.
2. Run `./tbx-daily-changes.sh [OPTIONS] [today|yesterday|YYYY-MM-DD] [output-dir]` (or pass `-o <dir>`, defaults to smart time mode: yesterday before 17:00, today at or after 17:00).
3. Follow the detailed workflow, instructions, and sample summaries in `daily-changes/AGENTS.md`.
4. Save the formatted Discord summary to `<output-dir>/daily-summary-<date>.md`, where `<output-dir>` is the target directory used by `tbx-daily-changes.sh` (defaulting to `daily-changes/generated`).
5. Copy the summary to the system clipboard: `pbcopy < <output-dir>/daily-summary-<date>.md`.
6. Output the summary in your response and confirm that it has been copied to the clipboard.

## Coaching Changes Workflow
When asked for a coaching update, coaching summary, or progress report:
1. Check `till/AGENTS.md` if present for checkout-specific directives and destination paths.
2. Run `./tbx-coach-changes.sh [OPTIONS] [START_DATE] [OUTPUT_DIR]` (e.g. `./tbx-coach-changes.sh 2026-10-10`, defaults to `$HOME/change-reports`).
3. Save the formatted summary to the target directory or destination specified in `till/AGENTS.md`.
4. Copy the summary to the system clipboard: `pbcopy < <summary-file>`.
5. Output the summary in your response and confirm that it has been copied to the clipboard.
