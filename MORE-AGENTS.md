# MORE AGENTS

## General
- Always check `till/AGENTS.md` if present; instructions there take priority.

## Daily Summary Workflow
When asked to give a daily summary, summarize daily changes, or prepare a Discord dev update:
*(Note: On Sundays, skip the regular daily update and replace it with the weekly developer summary below to avoid posting two updates in one day).*
1. Check `till/AGENTS.md` if present.
2. Run `./tbx-daily-changes.sh [OPTIONS] [today|yesterday|YYYY-MM-DD] [output-dir]` (or pass `-o <dir>`, defaults to smart time mode: yesterday before 17:00, today at or after 17:00).
3. Follow the detailed workflow, instructions, and sample summaries in `daily-changes/AGENTS.md`.
4. Save the formatted Discord summary to `<output-dir>/daily-summary-<date>.md`, where `<output-dir>` is the target directory used by `tbx-daily-changes.sh` (defaulting to `daily-changes/generated`).
5. Copy the summary to the system clipboard: `pbcopy < <output-dir>/daily-summary-<date>.md`.
6. Output the summary in your response and confirm that it has been copied to the clipboard.

## Weekly Summary Workflow
When asked for a weekly summary, or on Sundays:
1. **Cadence & Scope**: Weekly reports cover Sunday morning through Saturday evening (`[Sun – Sat]`). This weekly summary replaces the regular Sunday daily dev update so only one update is published. Compiling on Sunday allows reviewing a completed week without racing the clock; Sunday's ongoing work rolls naturally into the next cycle.
2. Run `./tbx-weekly-changes.sh [OPTIONS] [SUNDAY_OR_SATURDAY_DATE] [OUTPUT_DIR]` (e.g. `./tbx-weekly-changes.sh`, defaults to the most recently completed `[Sun – Sat]` week and outputs diffs to `$HOME/personal/weekly-reports/diffs`).
3. Aggregate the 7 daily summaries across the `[Sun – Sat]` week from `personal/daily-reports/reports/daily-summary-<date>.md`.
4. Synthesize the weekly evolution, architecture changes, and milestones into `personal/weekly-reports/reports/weekly-summary-<Sunday-date>.md`.
5. Extract the punchy **"🎯 Highlights of the Week"** section and copy it to the system clipboard: `pbcopy < <highlights-snippet>`.
6. Output both the Highlights and full summary in your response, confirm the Highlights are copied to the clipboard, and publish Highlights to Discord via `personal/weekly-reports/publish-to-discord.sh` upon user confirmation.

## Coaching Changes Workflow
When asked for a coaching update, coaching summary, or progress report:
1. Check `till/AGENTS.md` if present for checkout-specific directives and destination paths.
2. Run `./tbx-coach-changes.sh [OPTIONS] [START_DATE] [OUTPUT_DIR]` (e.g. `./tbx-coach-changes.sh 2026-10-10`, defaults to `$HOME/change-reports`).
3. Save the formatted summary to the target directory or destination specified in `till/AGENTS.md`.
4. Copy the summary to the system clipboard: `pbcopy < <summary-file>`.
5. Output the summary in your response and confirm that it has been copied to the clipboard.
