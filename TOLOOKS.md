# ToLooks

Exploratory scratchpad for backlog ideas, investigative spikes, architectural inquiries, and future refactors.

---

## Active ToLooks

*(None currently active)*

---

## Resolved Architectural Decisions

- [x] **3. Screen Sleep & Dimming Prevention in Remote Terminal**
  - **Status**: Implemented in [`tbx-remote-terminal.js`](tbx-remote-terminal.js).
  - **Resolution**:
    1. **Eliminated UI Darkening**: Removed aggressive idle/running dimming (`opacity: 0.35`, `grayscale(85%)`) from the button pad CSS so controls and the webpage remain crisp, vibrant, and readable at all times instead of fading to dark.
    2. **HTTP LAN NoSleep Engine**: Solved the restriction where mobile browsers silently block `navigator.wakeLock` on non-HTTPS LAN connections (`http://<ip>:8999`). Embedded an in-memory seamless looping MP4 video served at `/nosleep.mp4` with inline loop enforcement, keeping iOS Safari and Android Chrome displays awake over plain Wi-Fi HTTP.
    3. **Persistent Client Wake Lock**: Supported dual-layer keep-awake (native `navigator.wakeLock` when available + HTML5 media loop fallback) with automatic re-arming on load, SSE connect, `visibilitychange` (unlocking phone/returning to tab), and touch/click interactions.
    4. **Interactive Wake Status Header Badge**: Added a `☀️ Awake` indicator badge in the web controller header reflecting real-time wake lock status with tap-to-reacquire support.
    5. **macOS Host Sleep Preserved**: Kept macOS host power management untouched without running `caffeinate`, ensuring the Mac can sleep normally according to system preferences.

- [x] **2. Multi-Monitor True Y-Coordinate Layout Detection in Remote Terminal**
  - **Status**: Implemented in [`tbx-remote-terminal.js`](tbx-remote-terminal.js).
  - **Resolution**:
    1. **Root Cause Analysis**: Fixed an upstream macOS `Terminal.app` AppleScript bug where `terminal.windows.position()` clamped/moduloed the Y coordinate to the local screen menu bar offset (`y ≈ 30–33`), discarding global multi-monitor vertical offsets and collapsing 2×2 multi-monitor grids into a single overlapping row.
    2. **True Coordinate Resolution**: Augmented the atomic batch JXA script (`JXA_FETCH_SCRIPT`) to query `System Events` (`sys.processes.byName("Terminal").windows.position()`), which reliably returns global desktop coordinates across multi-monitor layouts matching windows by name and index.
    3. **Physical Display Geometry**: Integrated `NSScreen.screens` to extract physical monitor boundaries, allowing the spatial viewport to anchor the global desktop bounding box cleanly and render subtle monitor boundary guidelines behind window cards.
    4. **Responsive Card Scaling**: Updated preview buffers and button pad dimensions with CSS `clamp(...)` and `flex: 1 1 0` so 4-monitor 2×2 grids scale smoothly without vertical container overflow on mobile displays.

- [x] **1. Remote Terminal Controller & Virtual Macro-Keyboard for macOS Terminal**
  - **Status**: Implemented in [`tbx-remote-terminal.js`](tbx-remote-terminal.js).
  - **Resolution**:
    1. **Architecture & Transport**: Standalone zero-dependency Node.js HTTP daemon on port 8999 serving Server-Sent Events (`/events`) and key injection (`/api/key`). Uses atomic batch JXA querying (`Terminal.app` `wins.id()`, `wins.name()`, `wins.position()`, `wins.size()`, `wins.index()`) avoiding index-shifting race conditions.
    2. **Multi-Monitor Spatial Containment**: Direct spatial normalization across multi-display desktop coordinate spaces with CSS `contain` mode, `height: 100dvh`, and Z-index inversion (`1000 - w.index`), ensuring windows on all monitors render in exact visual layout without vertical drift.
    3. **Ambient Action Required Lighting**: Extracts terminal column width (`cols`) using `tab.numberOfColumns()` and window title regex `(\d+)[×x](\d+)` to properly segment rows. Detects interactive Antigravity CLI prompts (`↑/↓ Navigate · tab Amend · ctrl+g edit/expand command`) in the last two meaningful screen strings. Cards remain muted when idle/running and light up with glowing amber borders and vibrant tactile buttons only when user input is needed.
    4. **Focus Settlement & Auto-Restoration**: Keystroke dispatching switches to the target window, waits 80ms for macOS Window Server focus settlement, fires the key code via System Events, pauses 60ms for event consumption, and automatically restores focus back to the previous application or window. DOM reconciliation on client by window ID prevents window disappearance or flashing during focus changes.
    5. **Terminal ASCII QR Code**: Added embedded zero-dependency QR code generator [`tbx-qr-terminal.js`](tbx-qr-terminal.js) rendering a compact Unicode half-block QR code directly into stdout on daemon startup, allowing instant phone camera scanning without typing LAN IPs.
    6. **Auto-Accept Mode**: Added client-side toggle switch in the web controller header (persisted in `localStorage`). When active, automatically detects `action_required` states on incoming SSE updates, flashes visual button feedback (`⚡ ACCEPTING...`), waits 350ms for prompt settlement, and automatically dispatches `Enter` to confirm Antigravity CLI actions without spamming repeated keys.

---

## Related Documentation

- [AGENTS.md](AGENTS.md) — Agent guidelines and ToLooks rules.
- [docs/seeded/tolooks/README.md](docs/seeded/tolooks/README.md) — ToLooks concept and lifecycle guide.
