# tbx-for-toolbox.dev

**tbx is for toolbox**

Small tools, bookmarklets, and web experiments.

## Overview

This repository contains a collection of simple, static web tools and experiments deployed to [tbx-for-toolbox.dev](https://tbx-for-toolbox.dev).

### Structure

- **pages**: Standalone web applications and tools (e.g., Infinity Note).
- **bookmarklets**: Useful JavaScript snippets that can be saved as bookmarks to enhance browser functionality (e.g., Walmart Delivery Checklist).
- **scripts & tools**: Automation, multi-repository management, and Antigravity CLI tools.

## Website

All web tools, pages, and bookmarklets are hosted live at **[https://tbx-for-toolbox.dev/](https://tbx-for-toolbox.dev/)**.

## Scripts & CLI Tools

The root of the repository contains helper Bash scripts for workflow automation, git operations across multiple checkouts (configured in `till/repositories.txt`), and Antigravity CLI settings management.

### Multi-Repository & Git Management
Operates across all checked-out repositories defined in `till/repositories.txt`:
- `tbx-daily-changes.sh`: Gathers daily commit diffs across configured repositories into `daily-changes/generated/` with smart time defaults, date selection, origin auto-fetching, and canonical branch targeting (`origin/main`, `main`, etc.). Follows `daily-changes/AGENTS.md` for Discord summary generation.
- `tbx-sync-repositories.sh`: Audits status across configured repositories and automatically pulls updates for all clean repositories.
- `tbx-status-repositories.sh`: Scans configured repositories for uncommitted changes (staged, unstaged, untracked).
- `tbx-pull-repositories.sh`: Automatically pulls latest changes for all configured repositories.
- `tbx-coach-changes.sh`: Extracts changes from repositories and formats them (e.g., for coaching or LLM review).
- `tbx-sort-git-files.sh`: Sorts tracked files in a git repo based on their latest commit timestamp.
- `tbx-combine-files.sh`: Combines contents of files in a directory into a single consolidated output file.

### Antigravity CLI Tooling
Helpers for managing Antigravity CLI settings (`~/.gemini/antigravity-cli/settings.json`):
- `tbx-add-antigravity-cli-allow.sh`: Adds command patterns to `permissions.allow` in the Antigravity settings file if not already present.
- `tbx-sort-antigravity-cli-settings.sh`: Sorts `permissions.allow` in the settings file deterministically.
- `tbx-subl-edit-antigravity-cli-settings.sh`: Opens the Antigravity CLI settings file in Sublime Text.


