# tbx-for-toolbox.dev

**tbx is for toolbox**

Small tools, bookmarklets, and web experiments.

## Overview

This repository contains a collection of simple, static web tools and experiments deployed to [tbx-for-toolbox.dev](https://tbx-for-toolbox.dev).

### Structure

- **pages**: Standalone web applications and tools (e.g., Infinity Note).
- **bookmarklets**: Useful JavaScript snippets that can be saved as bookmarks to enhance browser functionality (e.g., Walmart Delivery Checklist).

## Running Locally (Corporate Proxy Bypass)

If you're behind a corporate proxy and cannot access `tbx-for-toolbox.dev`, you can bypass it by launching the Infinity Note local fetcher as a standalone Chrome application directly from this repository. This uses a blobless clone (`--filter=blob:none`) so the repository remains fully updatable and can switch branches while executing incredibly fast.

**For macOS:**
```
git clone --filter=blob:none https://github.com/TarasMazepa/tbx-for-toolbox.dev.git && "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --app="file://$PWD/tbx-for-toolbox.dev/infinity-note-local/index.html"
```

**For Linux / Windows (WSL/Git Bash):**
```
git clone --filter=blob:none https://github.com/TarasMazepa/tbx-for-toolbox.dev.git && google-chrome --app="file://$PWD/tbx-for-toolbox.dev/infinity-note-local/index.html"
```

## Scripts

The root of the repository contains several helper Bash scripts for workflow and git management.
Many of these scripts operate across multiple repositories defined in a local `till/repositories.txt` file.

- `tbx-coach-changes.sh`: Extracts changes from repositories and formats them (e.g. for sharing with a coach or AI).
- `tbx-combine-files.sh`: Combines contents of files in a directory into a single output.
- `tbx-daily-changes.sh`: Retrieves your daily commit diffs across configured repositories.
- `tbx-pull-repositories.sh`: Automatically pulls latest changes for all configured repositories.
- `tbx-sort-git-files.sh`: Sorts tracked files in a git repo based on their latest commit timestamp.
