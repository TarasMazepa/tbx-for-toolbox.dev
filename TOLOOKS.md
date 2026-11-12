# ToLooks

Exploratory scratchpad for backlog ideas, investigative spikes, architectural inquiries, and future refactors.

---

## Active ToLooks

- [ ] **1. Remote Terminal Controller & Virtual Macro-Keyboard for macOS Terminal**
  - **Idea**: Create a lightweight macOS daemon and HTTP service that streams open `Terminal.app` windows and Antigravity CLI (`agy`) sessions as JSON (using window names/folders and spatial screen coordinates as anchors) and provides an API endpoint to remotely focus a window and dispatch keystrokes (Enter, Arrow Up, Arrow Down) from a mobile web app or macro-keyboard.
  - **Context**: When running multiple concurrent Antigravity CLI sessions across different project directories, the CLI frequently presents interactive prompts, selection options, and confirmation dialogues. Manually hunting for the right window, moving the mouse cursor, clicking to focus, and pressing Enter or arrow keys introduces significant friction. A mobile web app or dedicated hardware macro-keyboard showing the window title anchor with quick action buttons (`▲`, `▼`, `↵ Enter`) arranged in a spatial layout matching the user's actual screen setup allows rapid, muscle-memory responses without cursor context switching.
  - **Investigation**:
    - *Window Discovery & Spatial Geometry Streaming*:
      - Query `Terminal.app` via JavaScript for Automation (JXA) / AppleScript to extract:
        - `id`: Unique window identifier.
        - `name`: Window title (folder/repo anchor).
        - `bounds`: Screen coordinates `{ x, y, width, height }`.
        - `position`: Window top-left position `{ x, y }`.
        - `size`: Window dimensions `{ width, height }`.
        - `index`: Frontmost Z-order index.
        - `tty`: Terminal slave device (`/dev/ttysXXX`).
        - `busy`: Active command status.
      - Correlate with running `agy` processes via `ps` and `lsof -a -d cwd` to include the verified project folder and working directory.
      - Expose a `GET /terminals` snapshot endpoint and a `GET /events` Server-Sent Events (SSE) stream that pushes updates whenever windows are moved, resized, opened, closed, or change state.
    - *Spatial / Relative UI Positioning on Client*:
      - The client app (mobile web UI or macro-keyboard dashboard) can normalize absolute pixel coordinates `(x, y)` across the virtual canvas to arrange control buttons relative to each other (e.g. top-left vs bottom-left vs right half).
      - Renders an interactive mini-map or spatial flex grid mirroring the user's physical monitor layout so the physical button placement matches the user's visual perception of their screens.
    - *Remote Focus & Keystroke Dispatch*:
      - Focus target window deterministically by `windowId`:
        ```applescript
        tell application "Terminal"
            set index of window id <WINDOW_ID> to 1
            activate
        end tell
        ```
      - Dispatch keystrokes to the focused Terminal window via System Events:
        ```applescript
        tell application "System Events"
            tell process "Terminal"
                key code 36 -- Enter / Return
                -- key code 126: Arrow Up
                -- key code 125: Arrow Down
                -- key code 53: Escape
            end tell
        end tell
        ```
      - Evaluate direct TTY injection / IPC alternatives to verify if background keystroke submission without window stealing is feasible.
    - *Client & Remote Interface (Self-Contained Web App)*:
      - Embedded Single-Page App (SPA) served directly by the daemon at `GET /`; no external hosting, build step, or app store installation required.
      - **Zero-Config Relative Addressing**: Uses relative endpoints (`/events` for SSE streaming, `/api/key` for key submission), eliminating any need for the phone or client to configure or know the server's IP address.
      - **LAN Discovery & Terminal QR Code**: On startup, daemon discovers active network interfaces (`en0`), prints local access URLs (e.g., `http://192.168.1.50:8999` and `http://<hostname>.local:8999`), and outputs an ASCII QR code directly to the terminal for instant mobile scanning.
      - **Progressive Web App (PWA) Capabilities**:
        - "Add to Home Screen" support for a standalone, full-screen app experience without browser navigation bars.
        - Screen Wake Lock API (`navigator.wakeLock`) to keep the phone screen active while working.
        - Touch haptic feedback (`navigator.vibrate`) on button taps for tactile confirmation.
      - Renders interactive spatial cards / mini-map for each open terminal window displaying the folder anchor, active process, and virtual buttons (`▲`, `▼`, `↵ Enter`).
      - Compatible with smartphone browsers (over local Wi-Fi or tailscale) and programmable macro-keyboards (e.g., Stream Deck, QMK via HTTP webhook).
    - [ ] Prototype JXA script for window bounds, focusing, and keystroke dispatching by `windowId`.
    - [ ] Implement spatial relative layout computation (normalizing `x, y, w, h` to a responsive CSS grid or relative spatial slots).
    - [ ] Implement lightweight HTTP + SSE server in Node.js or Dart exposing `GET /terminals`, `GET /events`, and `POST /terminals/:id/key`.
    - [ ] Embed single-page mobile UI at `GET /` with relative endpoints, touch haptics, and wake lock.
    - [ ] Add LAN network interface detection and terminal ASCII QR code on daemon startup.
    - [ ] Test end-to-end against concurrent interactive `agy` CLI sessions.

---

## Resolved Architectural Decisions

*(None yet)*

---

## Related Documentation

- [AGENTS.md](AGENTS.md) — Agent guidelines and ToLooks rules.
- [docs/seeded/tolooks/README.md](docs/seeded/tolooks/README.md) — ToLooks concept and lifecycle guide.
