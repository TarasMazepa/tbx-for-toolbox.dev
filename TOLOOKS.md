# ToLooks

Exploratory scratchpad for backlog ideas, investigative spikes, architectural inquiries, and future refactors.

---

## Active ToLooks

*(None currently active)*

---

## Resolved Architectural Decisions

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
