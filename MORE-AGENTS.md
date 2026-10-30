# MORE AGENTS

## Daily Summary Workflow
When asked to give a daily summary, summarize daily changes, or prepare a Discord dev update:
1. Run `./tbx-daily-changes.sh [today|yesterday|YYYY-MM-DD]` (defaults to smart time mode: yesterday before 17:00, today at or after 17:00).
2. Follow the detailed workflow, instructions, and sample summaries in `daily-changes/AGENTS.md`.
3. Save the formatted Discord summary to `daily-changes/generated/daily-summary-latest.md`.
4. Copy the summary to the system clipboard: `pbcopy < daily-changes/generated/daily-summary-latest.md`.
5. Output the summary in your response and confirm that it has been copied to the clipboard.
