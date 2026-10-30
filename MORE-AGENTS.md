# MORE AGENTS

## General
- Always check `till/AGENTS.md` if present; instructions there take priority.

## Daily Summary Workflow
When asked to give a daily summary, summarize daily changes, or prepare a Discord dev update:
1. Check `till/AGENTS.md` if present.
2. Run `./tbx-daily-changes.sh [today|yesterday|YYYY-MM-DD]` (defaults to smart time mode: yesterday before 17:00, today at or after 17:00).
3. Follow the detailed workflow, instructions, and sample summaries in `daily-changes/AGENTS.md`.
4. Save the formatted Discord summary to `daily-changes/generated/daily-summary-latest.md`.
5. Copy the summary to the system clipboard: `pbcopy < daily-changes/generated/daily-summary-latest.md`.
6. Output the summary in your response and confirm that it has been copied to the clipboard.
