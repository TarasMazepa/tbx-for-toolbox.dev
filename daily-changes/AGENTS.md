# Daily Changes & Discord Summary Agent Guide

Instructions for AI agents when asked to produce a daily summary, daily changes report, or Discord dev update.

## Workflow Execution Steps

When the user asks for a daily summary (e.g. *"give me a daily summary"*, *"summarize today's changes"*, *"prepare discord update"*):

### 1. Run the Changes Collector Script
Run `tbx-daily-changes.sh` from the repository root (or `../tbx-daily-changes.sh` if currently inside `daily-changes/`):
```bash
./tbx-daily-changes.sh [today|yesterday|YYYY-MM-DD]
```
- **Smart default**: If invoked without arguments, it automatically gathers **yesterday** before 17:00 (5 PM), and **today** at or after 17:00 (5 PM).
- Pass `today` to force today's commits.
- Pass `yesterday` to force yesterday's commits.
- Pass a specific date (e.g. `2026-10-18`) to gather commits for that date.

The script writes to `daily-changes/generated/daily-changes-<date>.txt` and refreshes `daily-changes/generated/daily-changes-latest.txt`.

### 2. Read the Diffs
Read the generated diff file:
- `daily-changes/generated/daily-changes-latest.txt` (or the specific date file `daily-changes/generated/daily-changes-<date>.txt`).
- Review the diffs grouped under `===== <repository> =====`.

### 3. Analyze and Summarize
- **Group by repository**: Keep updates clustered by project.
- **Focus on value & impact**: Highlight new features, enhancements, bug fixes, refactoring, and releases.
- **Filter noise**: Omit minor lockfile updates, trivial whitespace/formatting fixes, and internal noise unless significant.
- **Tone**: Professional, concise, engaging developer voice.

### 4. Format for Discord
- **Character limit**: Keep the summary under Discord's 2,000 character message limit (ideally 1,000–1,800 characters).
- **Discord Markdown**:
  - Date title: `📅 **Daily Dev Update — <Date>**`
  - Repo titles with emojis: `🚀 **<repo-name>**`, `✨ **<repo-name>**`, `🛠️ **<repo-name>**`
  - Bullet points: `- Bullet describing change`
  - Inline code: Use backticks for CLI commands, function names, flags, and version numbers (e.g. `0.0.18`, `mna`, `pbcopy`).

### 5. Save Summary & Copy to Clipboard
Write the Discord summary to `daily-changes/generated/daily-summary-latest.md` (and `daily-changes/generated/daily-summary-<date>.md`).
Then copy it to the clipboard using the appropriate platform command:

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
- Explicitly confirm to the user that the summary has been copied to their clipboard and is ready to paste into Discord (`Cmd+V` / `Ctrl+V`).

---

## Sample Summaries

### Sample 1: Repo-Grouped Update (Recommended)

```markdown
📅 **Daily Dev Update — Oct 18, 2026**

🚀 **homebrew-monoapp**
- Released `mna` formula `0.0.18` with verified SHA-256 checksums for macOS ARM & Linux x64
- Added versioned formula `mna@0.0.18.rb` for pinned installations

🛠️ **monoapp**
- Bumped version to `0.0.18`
- Added automatic `docker image prune --force` after pulling practice reading containers to keep disk space clean

🧹 **monolib**
- Refactored CLI `Flag` specification architecture with cleaner mutating argument parsing
- Modernized flag finding and doc comments

✨ **tbx-for-toolbox.dev**
- Added `tbx-subl-edit-antigravity-cli-settings.sh` for one-command editing of Antigravity CLI configuration in Sublime Text
- Enhanced `tbx-daily-changes.sh` with smart time defaults and Discord workflow
```

---

### Sample 2: Categorized Highlights

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

### Sample 3: Compact Daily Pulse

```markdown
**Dev Pulse — Oct 18, 2026** ⚡
- **Tooling**: Added Sublime Text helper for Antigravity CLI configuration in `tbx-for-toolbox.dev`
- **Monoapp (v0.0.18)**: Released updated CLI build; automated Docker image cleanup on reading fetches
- **Packaging**: Updated Homebrew tap formulas with SHA-256 hashes for macOS and Linux
- **Monolib**: Refactored command-line flag parser architecture
```
