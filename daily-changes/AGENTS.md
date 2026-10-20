# Daily Changes & Discord Summary Agent Guide

Instructions for AI agents when asked to produce a daily summary, daily changes report, or Discord dev update.

## Workflow Execution Steps

When the user asks for a daily summary (e.g. *"give me a daily summary"*, *"summarize today's changes"*, *"prepare discord update"*):

### 1. Run the Changes Collector Script
Run `tbx-daily-changes.sh` from the repository root (or `../tbx-daily-changes.sh` if currently inside `daily-changes/`):
```bash
./tbx-daily-changes.sh [--no-fetch] [today|yesterday|YYYY-MM-DD]
```
- **Smart branch resolution**: Automatically fetches and targets the canonical default branch (`origin/main`, `main`, `master`) across all repositories, ignoring local unmerged feature branches.
- **Auto-fetch**: Fetches latest refs from `origin` by default before inspecting diffs (pass `--no-fetch` to skip).
- **Smart default**: If invoked without arguments, it automatically gathers **yesterday** before 17:00 (5 PM), and **today** at or after 17:00 (5 PM).
- Pass `today` to force today's commits.
- Pass `yesterday` to force yesterday's commits.
- Pass a specific date (e.g. `2026-10-18`) to gather commits for that date.

The script writes to `daily-changes/generated/daily-changes-<date>.txt` and refreshes `daily-changes/generated/daily-changes-latest.txt`.

### 2. Read the Diffs
Read the generated diff file:
- `daily-changes/generated/daily-changes-latest.txt` (or the specific date file `daily-changes/generated/daily-changes-<date>.txt`).
- Review the diffs grouped under `===== <repository> =====`.

### 3. Analyze and Summarize (Primary Style: Categorized Highlights)

The standard and preferred Discord format groups changes by **impact category** across all repositories:

#### Header Pattern
```markdown
🚀 **Dev Summary — <Month Day, Year>**
```
*(or `🚀 **Dev Summary — <Day of week>, <Month Day, Year>**`)*

#### Standard Category Sections
Include only the categories that have changes for that day:
- `**✨ New Features & Tooling**`
  New capabilities, tools, scripts, CLI flags, APIs, UI widgets, workflows.
- `**🛠️ Improvements & Fixes**`
  Bug fixes, performance optimizations, error handling, refactors, cleanup.
- `**📦 Releases & Packaging**`
  Version bumps, releases, Homebrew formulas, package dependency updates.
- `**⚙️ Global Standards & Tooling**` (or `**📚 Documentation & Standards**`)
  Rule updates across `AGENTS.md`, guides, or workflow standards.

#### Bullet Writing Style
- **Prefix with repo**: `- **<repo-name>**: <Action verb> <description>`
- **Active past-tense verbs**: `Added...`, `Created...`, `Implemented...`, `Refactored...`, `Published...`, `Bumped...`, `Overhauled...`.
- **Code formatting**: Always use backticks for CLI commands, function/class names, flags, and version numbers (e.g. `mna@0.0.18`, `docker image prune --force`, `Flag`).
- **High signal**: Keep bullets punchy, clear, and focused on value and impact.

### 4. Format & Length
- Keep the summary under Discord's 2,000 character limit (aim for 800–1,600 characters).
- Separate categories with a single blank line.

### 5. Save Summary & Copy to Clipboard
Write the Discord summary to `daily-changes/generated/daily-summary-latest.md` (and `daily-changes/generated/daily-summary-<date>.md`).
Then copy it to the clipboard:

**macOS:**
```bash
pbcopy < daily-changes/generated/daily-summary-latest.md
```

**Linux (Wayland / X11 fallback):**
```bash
if command -v wl-copy >/dev/null 2>&1; then
	wl-copy < daily-changes/generated/daily-summary-latest.md
elif command -v xclip >/dev/null 2>&1; then
	xclip -selection clipboard < daily-changes/generated/daily-summary-latest.md
fi
```

### 6. Present Response to User
- Display the generated Discord summary in your response.
- Explicitly confirm that the summary has been copied to the clipboard and is ready to paste into Discord (`Cmd+V` / `Ctrl+V`).

---

## Primary Style Reference Example

### Categorized Highlights (Standard Default)

```markdown
🚀 **Dev Summary — Oct 18, 2026**

**✨ New Features & Tooling**
- **tbx-for-toolbox.dev**: Added `tbx-subl-edit-antigravity-cli-settings.sh` for fast Antigravity CLI settings management in Sublime Text
- **homebrew-monoapp**: Published `mna@0.0.18` formula for Homebrew tap

**🛠️ Improvements & Fixes**
- **monoapp**: Added automatic container image pruning after reading practice session pulls
- **monolib**: Overhauled CLI flag parsing utilities and updated docstrings

**📦 Releases**
- Promoted `monoapp` CLI suite to `v0.0.18`
```

---

## Alternative Style Reference Examples

### Alternative 1: Repository-Grouped Update

```text
🚀 Dev Update | Sunday, March 29, 2026

🛠️ stax
Created Stax Workflows Guide and integrated it into the web documentation.
Refactored internal commands and context to support asynchronous execution for Git operations.
Migrated file I/O retry logic to monolib_dart.

🤖 ai-todo
Converted CLI and prompt setup to asynchronous execution.
Refactored item processing to use asynchronous JSONL encoding.
Bumped monolib_dart dependency to 0.0.12.

📚 monolib
Released monolib_dart 0.0.12.
Implemented jsonlEncodeAsync for non-blocking JSONL output.
```

### Alternative 2: Cross-Repo Standards & Maintenance

```text
🚀 Dev Update | Wednesday, April 1, 2026

🤖 ai-todo
Implemented Batcher for optimized asynchronous logging and tracing.
Bumped monolib_dart dependency to 0.0.17.

📚 monolib
Released monolib_dart 0.0.17 with enhanced Batcher and OnStreamOfListOfInt extension.

🛠️ stax
Integrated mainButcher for lifecycle management of asynchronous batch operations.

⚙️ General Updates
Updated AGENTS.md across all projects to mandate avoiding stdin.readLineSync() refactors to async.
```
