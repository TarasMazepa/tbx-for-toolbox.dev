#!/usr/bin/env node

/**
 * tbx-remote-terminal.js
 *
 * All-in-one macOS Terminal Remote Controller & Reactive Daemon.
 * - Focus settlement delay (80ms before key, 60ms before focus restore)
 *   to ensure keystrokes reliably hit the target window without focus racing.
 * - Detects Antigravity interactive prompt snippets:
 *   "↑/↓ Navigate · tab Amend · ctrl+g edit/expand command" / [y/n] / options.
 * - Ambient lighting UX: Buttons are muted when idle/running; screen LIGHTS UP
 *   with colorful vibrant buttons only when action is required!
 * - Auto-restores focus to previous window/app after dispatching keystrokes.
 * - Explicit "Focus" button focuses and keeps focus on target window.
 * - Atomic batch JXA querying (immune to window index-shifting race conditions).
 * - Client-side DOM reconciliation by window ID (zero disappearing/flashing windows).
 * - Extracts Terminal.app windows, names, spatial geometry, and live screen preview text.
 * - Serves a 100% spatial multi-monitor layout with large tactile touch buttons.
 * - Correct Z-indexing and exact "contain" dynamic viewport mode.
 * - Instant shutdown on Ctrl+C.
 */

const http = require('http');
const os = require('os');
const { execFileSync } = require('child_process');
const crypto = require('crypto');

let qrGenerator = null;
try {
  qrGenerator = require('./tbx-qr-terminal.js');
} catch (e) {}

/**
 * Print compact ASCII QR code to terminal stdout
 */
function printQrCode(url) {
  if (qrGenerator && typeof qrGenerator.generate === 'function') {
    try {
      qrGenerator.generate(url, { small: true }, ascii => {
        console.log(ascii);
      });
      return;
    } catch (e) {}
  }
}

const PORT = parseInt(process.env.PORT || '8999', 10);
const POLL_INTERVAL_MS = 600;

// Key code mapping for macOS System Events
const KEY_CODES = {
  enter: 36,
  return: 36,
  up: 126,
  down: 125,
  left: 123,
  right: 124,
  esc: 53,
  escape: 53,
  space: 49,
  tab: 48,
  y: 16,
  n: 45
};

// Connected SSE clients
const sseClients = new Set();
let lastStateJson = '';
let lastStateHash = '';
let lastKnownGoodState = [];

/**
 * Detect Antigravity CLI state from window name, terminal buffer text, and terminal column width.
 * Specifically checks for "Navigate" (e.g. "↑/↓ Navigate · tab Amend · ctrl+g edit/expand command")
 * within the last two strings of the terminal screen, using terminal width from window name / tab
 * to cleanly segment lines.
 */
function detectAgyState(windowName, analysisText, cols) {
  if (!analysisText && !windowName) {
    return { status: 'idle', label: '', color: 'gray', actionRequired: false };
  }

  const isAgy = windowName.includes('agy') ||
                analysisText.includes('accept-edits') ||
                analysisText.includes('shortcuts') ||
                analysisText.includes('esc to cancel') ||
                analysisText.includes('Navigate') ||
                analysisText.includes('ctrl+g');

  if (!isAgy) {
    return { status: 'normal', label: '', color: 'gray', actionRequired: false };
  }

  // 1. Split lines by newline and wrap lines longer than cols if cols is known
  let lines = [];
  const rawSplit = analysisText.split(/\r?\n/);
  if (rawSplit.length > 1) {
    for (const line of rawSplit) {
      if (cols && cols > 0 && line.length > cols) {
        for (let c = 0; c < line.length; c += cols) {
          lines.push(line.slice(c, c + cols));
        }
      } else {
        lines.push(line);
      }
    }
  } else if (cols && cols > 0 && analysisText.length > cols) {
    // Single continuous buffer without newlines: segment by terminal width
    for (let c = 0; c < analysisText.length; c += cols) {
      lines.push(analysisText.slice(c, c + cols));
    }
  } else {
    lines = rawSplit;
  }

  const trimmed = lines.map(l => l.trim()).filter(l => l.length > 0);
  // Meaningful lines exclude horizontal rules (e.g. ───────, -------, =======)
  const meaningful = trimmed.filter(l => !/^[─\-_=*]+$/.test(l));

  // Check specifically for Antigravity's interactive navigation prompt in the last two strings
  const lastTwoMeaningful = meaningful.slice(-2);
  const lastTwoTrimmed = trimmed.slice(-2);
  const lastThreeTrimmed = trimmed.slice(-3);

  const containsNavigate = str =>
    str.includes('Navigate') ||
    str.includes('↑/↓') ||
    (str.includes('↑') && str.includes('↓'));

  const isActionRequired =
    lastTwoMeaningful.some(containsNavigate) ||
    lastTwoTrimmed.some(containsNavigate) ||
    lastThreeTrimmed.some(containsNavigate);

  if (isActionRequired) {
    return { status: 'action_required', label: '⚠️ ACTION REQUIRED', color: 'amber', actionRequired: true };
  }

  // 2. Is agy actively running / generating / executing commands?
  const hasSpinner = /[\u2800-\u28FF]/.test(analysisText); // Braille characters ⣾⣽⣻...
  const isRunning = hasSpinner ||
                    analysisText.includes('Running command') ||
                    analysisText.includes('esc to cancel') ||
                    analysisText.includes('Thinking...') ||
                    analysisText.includes('Running (');

  if (isRunning) {
    return { status: 'running', label: 'RUNNING', color: 'blue', actionRequired: false };
  }

  // 3. Is agy sitting at the main prompt ready for next instruction?
  const isWaitingInput =
    analysisText.includes('? for shortcuts') ||
    analysisText.includes('Accept-edits mode');

  if (isWaitingInput) {
    return { status: 'needs_input', label: 'READY', color: 'green', actionRequired: false };
  }

  return { status: 'idle', label: 'IDLE', color: 'gray', actionRequired: false };
}

// Atomic Batch JXA Script to query Terminal.app windows, geometry, and preview
const JXA_FETCH_SCRIPT = `
(() => {
  const terminal = Application("Terminal");
  if (!terminal.running()) return JSON.stringify([]);
  
  const wins = terminal.windows;
  let ids = [], names = [], positions = [], sizes = [], indices = [];
  try {
    ids = wins.id();
    names = wins.name();
    positions = wins.position();
    sizes = wins.size();
    indices = wins.index();
  } catch(e) {
    return JSON.stringify([]);
  }
  
  if (!ids || !ids.length) return JSON.stringify([]);
  
  const results = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const name = names[i];
    if (!id || !name) continue;
    
    let preview = "";
    let analysis = "";
    let busy = false;
    let tty = null;
    let cols = null;
    let rows = null;
    try {
      const w = terminal.windows.byId(id);
      const tab = w.selectedTab();
      busy = tab.busy();
      tty = tab.tty();
      try {
        cols = tab.numberOfColumns();
        rows = tab.numberOfRows();
      } catch (e) {}

      // Fallback: extract terminal width and height from window name (e.g. "— 98×28")
      if (!cols || !rows) {
        const m = name.match(/(\\d+)\\s*[\\u00d7xX]\\s*(\\d+)/);
        if (m) {
          cols = parseInt(m[1], 10);
          rows = parseInt(m[2], 10);
        }
      }

      const raw = tab.contents();
      if (raw) {
        let lines = [];
        const rawSplit = raw.split("\\n");
        if (rawSplit.length > 1) {
          for (let k = 0; k < rawSplit.length; k++) {
            const line = rawSplit[k];
            if (cols && cols > 0 && line.length > cols) {
              for (let c = 0; c < line.length; c += cols) {
                lines.push(line.slice(c, c + cols));
              }
            } else {
              lines.push(line);
            }
          }
        } else if (cols && cols > 0 && raw.length > cols) {
          for (let c = 0; c < raw.length; c += cols) {
            lines.push(raw.slice(c, c + cols));
          }
        } else {
          lines = rawSplit;
        }

        const nonEmpty = lines.map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; });
        analysis = nonEmpty.slice(-14).join("\\n");
        preview = nonEmpty.slice(-6).join("\\n");
      }
    } catch (e) {}
    
    results.push({
      id: id,
      name: name,
      index: indices[i],
      position: { x: Math.round(positions[i].x), y: Math.round(positions[i].y) },
      size: { width: Math.round(sizes[i].x), height: Math.round(sizes[i].y) },
      cols: cols,
      rows: rows,
      tty: tty,
      busy: busy,
      preview: preview,
      analysis: analysis
    });
  }
  return JSON.stringify(results);
})()
`.trim();

/**
 * Query current Terminal.app window state (with fallback to last known good state on blip)
 */
function fetchTerminalState() {
  try {
    const raw = execFileSync('osascript', ['-l', 'JavaScript', '-e', JXA_FETCH_SCRIPT], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2500
    });
    const parsed = JSON.parse(raw.trim());
    if (Array.isArray(parsed) && parsed.length > 0) {
      const enriched = parsed.map(w => {
        const agyState = detectAgyState(w.name, w.analysis || w.preview, w.cols);
        return {
          id: w.id,
          name: w.name,
          index: w.index,
          position: w.position,
          size: w.size,
          cols: w.cols,
          rows: w.rows,
          tty: w.tty,
          busy: w.busy,
          preview: w.preview,
          agyState: agyState
        };
      });
      lastKnownGoodState = enriched;
      return enriched;
    }
    return lastKnownGoodState.length ? lastKnownGoodState : [];
  } catch (err) {
    return lastKnownGoodState;
  }
}

/**
 * Focus window, inject keystroke with settlement delay, and automatically restore previous focus
 */
function injectKey(windowId, key) {
  const normalizedKey = key ? key.toLowerCase().trim() : 'focus';
  const code = normalizedKey === 'focus' ? null : KEY_CODES[normalizedKey];

  if (code === undefined && normalizedKey !== 'focus') {
    throw new Error(`Unsupported key: "${key}". Supported: ${Object.keys(KEY_CODES).join(', ')}, focus`);
  }

  const isExplicitFocus = normalizedKey === 'focus';

  const jxa = `
    const terminal = Application("Terminal");
    const sys = Application("System Events");

    // Capture current frontmost application and window
    let frontAppName = null;
    let prevWindowId = null;
    try {
      const frontApp = sys.processes.whose({ frontmost: true })[0];
      frontAppName = frontApp ? frontApp.name() : null;
      if (terminal.running() && terminal.windows.length > 0) {
        prevWindowId = terminal.windows[0].id();
      }
    } catch(e) {}

    // 1. Focus target window
    terminal.activate();
    try {
      terminal.windows.byId(${windowId}).index = 1;
    } catch(e) {}

    ${code !== null ? `
    // 2. Allow macOS Window Server to settle focus on target window before keystroke
    delay(0.08);

    // 3. Dispatch keystroke
    sys.keyCode(${code});

    // 4. Brief pause to ensure the key event is queued/consumed before focus switch
    delay(0.06);
    ` : ''}

    // 5. Automatically restore focus back if this was a keystroke (not an explicit focus request)
    ${!isExplicitFocus ? `
    try {
      if (frontAppName && frontAppName !== "Terminal") {
        Application(frontAppName).activate();
      } else if (prevWindowId && prevWindowId !== ${windowId}) {
        terminal.windows.byId(prevWindowId).index = 1;
        terminal.activate();
      }
    } catch(e) {}
    ` : ''}

    JSON.stringify({
      success: true,
      windowId: ${windowId},
      key: "${normalizedKey}",
      frontAppName: frontAppName,
      prevWindowId: prevWindowId,
      restoredFocus: ${!isExplicitFocus}
    });
  `;

  const out = execFileSync('osascript', ['-l', 'JavaScript', '-e', jxa], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 3000
  });

  return JSON.parse(out.trim());
}

/**
 * Compute SHA-256 hash of window state without self-feedback loop
 */
function computeStateHash(windows) {
  const normalized = windows.map(w => ({
    id: w.id,
    name: w.name,
    index: w.index,
    position: w.position,
    size: w.size,
    status: w.agyState ? w.agyState.status : 'idle',
    actionRequired: w.agyState ? w.agyState.actionRequired : false,
    preview: w.name.includes('tbx-remote-terminal') ? '' : w.preview
  }));
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

/**
 * Discover local LAN IPv4 address
 */
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

/**
 * Broadcast event to all connected SSE clients
 */
function broadcast(data) {
  const payload = `data: ${data}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch (err) {
      sseClients.delete(res);
    }
  }
}

/**
 * Read request body as JSON
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e5) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Embedded 100% Spatial Multi-Monitor Web App HTML with Ambient Lighting & Muted/Lit Controls
const HTML_APP = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>Terminal Spatial Controller</title>
  <style>
    :root {
      --bg: #040711;
      --card-bg: #0c1427;
      --card-border: #1e293b;
      --card-active-border: #38bdf8;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
      --enter-btn: #16a34a;
      --enter-btn-active: #15803d;
      --action-btn: #1e293b;
      --action-btn-active: #334155;
      --safe-top: env(safe-area-inset-top, 0px);
      --safe-bottom: env(safe-area-inset-bottom, 0px);
    }
    * {
      box-sizing: border-box;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
      -webkit-user-select: none;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      height: 100dvh;
      max-height: 100dvh;
      overflow: hidden;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      flex-direction: column;
    }
    header {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: calc(var(--safe-top) + 4px) 12px 4px 12px;
      background: #090e1a;
      border-bottom: 1px solid var(--card-border);
      z-index: 2000;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    h1 {
      margin: 0;
      font-size: 0.9rem;
      font-weight: 700;
      letter-spacing: -0.01em;
    }
    .header-info {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .status-badge {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 0.7rem;
      padding: 2px 7px;
      border-radius: 9999px;
      background: #1e293b;
      color: var(--text-muted);
    }
    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #ef4444;
    }
    .status-dot.online {
      background: #22c55e;
      box-shadow: 0 0 6px #22c55e;
    }

    /* Auto-Accept Toggle Switch */
    .auto-accept-container {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      padding: 3px 8px;
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 9999px;
      transition: border-color 0.2s, background 0.2s;
    }
    .auto-accept-container:has(input:checked) {
      border-color: #f59e0b;
      background: #1c1808;
    }
    .auto-accept-label {
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #94a3b8;
    }
    .auto-accept-container:has(input:checked) .auto-accept-label {
      color: #fbbf24;
    }
    .auto-accept-container input {
      display: none;
    }
    .auto-accept-switch {
      position: relative;
      width: 28px;
      height: 16px;
      background: #334155;
      border-radius: 9999px;
      transition: background 0.2s;
      flex-shrink: 0;
    }
    .auto-accept-switch::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 12px;
      height: 12px;
      background: #ffffff;
      border-radius: 50%;
      transition: transform 0.2s;
    }
    .auto-accept-container input:checked + .auto-accept-switch {
      background: #f59e0b;
    }
    .auto-accept-container input:checked + .auto-accept-switch::after {
      transform: translateX(12px);
    }

    /* Spatial Viewport */
    .viewport-container {
      flex: 1 1 0;
      min-height: 0;
      min-width: 0;
      width: 100%;
      padding: 6px 6px calc(var(--safe-bottom) + 6px) 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      position: relative;
    }
    .spatial-stage {
      position: relative;
      background: #070c18;
      border: 1px solid #1a253c;
      border-radius: 10px;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.7);
      flex-shrink: 0;
      overflow: hidden;
    }

    /* Individual Spatial Terminal Window Box */
    .spatial-window {
      position: absolute;
      padding: 3px;
      transition: left 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
                  top 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
                  width 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
                  height 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .window-card {
      width: 100%;
      height: 100%;
      background: var(--card-bg);
      border: 2px solid var(--card-border);
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 8px 10px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
      transition: border-color 0.25s, box-shadow 0.25s, background 0.25s;
      overflow: hidden;
    }

    /* Focused Window State */
    .spatial-window.active .window-card {
      border-color: var(--card-active-border);
      box-shadow: 0 0 18px rgba(56, 189, 248, 0.35);
    }

    /* ACTION REQUIRED STATE (LIT UP! Colorful & Glowing Amber Pulse) */
    @keyframes pulse-amber {
      0%, 100% {
        box-shadow: 0 0 16px rgba(245, 158, 11, 0.55), inset 0 0 14px rgba(245, 158, 11, 0.15);
        border-color: #f59e0b;
      }
      50% {
        box-shadow: 0 0 32px rgba(245, 158, 11, 0.95), inset 0 0 22px rgba(245, 158, 11, 0.3);
        border-color: #fbbf24;
      }
    }
    .spatial-window.action-required .window-card {
      border-color: #f59e0b !important;
      background: #141320;
      animation: pulse-amber 1.8s infinite ease-in-out;
    }

    /* Card Header */
    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      margin-bottom: 4px;
      cursor: pointer;
      flex-shrink: 0;
    }
    .window-title {
      font-size: clamp(0.92rem, 1.9vw, 1.25rem);
      font-weight: 700;
      color: #ffffff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      letter-spacing: -0.01em;
    }
    .header-badges {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    .state-badge {
      font-size: 0.6rem;
      font-weight: 800;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 4px;
      letter-spacing: 0.04em;
    }
    .state-badge.badge-amber {
      background: #b45309;
      color: #fef3c7;
      border: 1px solid #f59e0b;
    }
    .state-badge.badge-blue {
      background: #0369a1;
      color: #e0f2fe;
    }
    .state-badge.badge-green {
      background: #15803d;
      color: #dcfce7;
    }
    .active-badge {
      font-size: 0.6rem;
      font-weight: 800;
      text-transform: uppercase;
      padding: 2px 5px;
      border-radius: 4px;
      background: #0284c7;
      color: #ffffff;
      letter-spacing: 0.04em;
    }

    /* Terminal Live Text Buffer Preview */
    .terminal-preview {
      margin: 2px 0 6px 0;
      padding: 6px 8px;
      background: #050814;
      border: 1px solid #1a253c;
      border-radius: 8px;
      font-family: ui-monospace, "SF Mono", "Fira Code", Menlo, monospace;
      font-size: clamp(0.62rem, 1.15vw, 0.78rem);
      line-height: 1.28;
      color: #a5f3fc;
      overflow: hidden;
      white-space: pre-wrap;
      word-break: break-all;
      flex: 1;
      min-height: 40px;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
    }
    .spatial-window.action-required .terminal-preview {
      border-color: rgba(245, 158, 11, 0.5);
      background: #0a0a16;
      color: #fef08a;
    }

    /* BUTTON PAD: MUTED BY DEFAULT, LIGHTS UP WHEN ACTION IS REQUIRED! */
    .button-pad {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: auto;
      flex-shrink: 0;
      transition: opacity 0.3s ease, filter 0.3s ease;
    }

    /* Muted State (when no action is required) */
    .spatial-window:not(.action-required) .button-pad {
      opacity: 0.35;
      filter: grayscale(85%);
    }
    .spatial-window:not(.action-required).active .button-pad {
      opacity: 0.72;
      filter: grayscale(25%);
    }
    /* Quick interaction on hover/touch keeps buttons responsive */
    .spatial-window:not(.action-required):hover .button-pad,
    .spatial-window:not(.action-required):active .button-pad {
      opacity: 0.85;
      filter: none;
    }

    /* LIT UP State (when action IS required - full colorful & vibrant!) */
    .spatial-window.action-required .button-pad {
      opacity: 1 !important;
      filter: none !important;
    }

    .button-row {
      display: flex;
      gap: 6px;
      width: 100%;
    }
    button {
      touch-action: manipulation;
      font-family: inherit;
      border: none;
      border-radius: 9px;
      color: #ffffff;
      background: var(--action-btn);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.08s, background 0.1s, box-shadow 0.2s;
      outline: none;
      font-weight: 700;
      padding: 10px 4px;
      font-size: clamp(0.85rem, 1.8vw, 1.15rem);
      flex: 1;
      min-height: 42px;
    }
    button:active {
      transform: scale(0.93);
      background: var(--action-btn-active);
    }

    /* Button Colors */
    button.btn-enter {
      background: var(--enter-btn);
      font-size: clamp(0.95rem, 2.1vw, 1.3rem);
      font-weight: 800;
      flex: 1.8;
      min-height: 44px;
    }
    button.btn-enter:active {
      background: var(--enter-btn-active);
    }
    /* Glowing pulsing Enter button on action required */
    @keyframes pulse-enter {
      0%, 100% {
        box-shadow: 0 0 12px rgba(22, 163, 74, 0.6);
        transform: scale(1);
      }
      50% {
        box-shadow: 0 0 24px rgba(22, 163, 74, 0.95);
        transform: scale(1.02);
      }
    }
    .spatial-window.action-required button.btn-enter {
      box-shadow: 0 0 16px rgba(22, 163, 74, 0.8);
      animation: pulse-enter 1.6s infinite ease-in-out;
    }

    button.btn-esc {
      background: #334155;
      color: #cbd5e1;
      flex: 0.8;
      font-size: clamp(0.75rem, 1.5vw, 0.95rem);
    }
    button.btn-focus {
      background: #1e293b;
      border: 1px solid #334155;
      color: var(--accent);
      font-size: clamp(0.75rem, 1.5vw, 0.95rem);
      flex: 1;
    }

    /* Empty state */
    .empty-state {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-muted);
      font-size: 0.95rem;
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <span>🖥️</span>
      <h1>Terminal Spatial Remote</h1>
    </div>
    <div class="header-info">
      <label class="auto-accept-container" title="Automatically dispatch Enter when an action is required">
        <span class="auto-accept-label">Auto-Accept</span>
        <input type="checkbox" id="autoAcceptToggle">
        <span class="auto-accept-switch"></span>
      </label>
      <div class="status-badge">
        <div class="status-dot" id="statusDot"></div>
        <span id="statusText">Connecting</span>
      </div>
      <div class="status-badge" id="windowCount">0 windows</div>
    </div>
  </header>

  <div class="viewport-container" id="viewportContainer">
    <div class="spatial-stage" id="spatialStage">
      <div class="empty-state">Looking for Terminal.app windows...</div>
    </div>
  </div>

  <script>
    let currentWindows = [];
    let isActionInProgress = false;
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const windowCount = document.getElementById('windowCount');
    const viewportContainer = document.getElementById('viewportContainer');
    const spatialStage = document.getElementById('spatialStage');
    const autoAcceptToggle = document.getElementById('autoAcceptToggle');

    // Auto-Accept toggle and execution state
    let autoAcceptEnabled = localStorage.getItem('tbx_auto_accept') === 'true';
    const activeAutoAccepts = new Set();

    if (autoAcceptToggle) {
      autoAcceptToggle.checked = autoAcceptEnabled;
      autoAcceptToggle.addEventListener('change', () => {
        autoAcceptEnabled = autoAcceptToggle.checked;
        localStorage.setItem('tbx_auto_accept', autoAcceptEnabled ? 'true' : 'false');
        triggerHaptic(30);
        if (!autoAcceptEnabled) {
          activeAutoAccepts.clear();
        } else if (currentWindows.length) {
          checkAutoAccept(currentWindows);
        }
      });
    }

    function checkAutoAccept(windows) {
      if (!autoAcceptEnabled) return;

      windows.forEach(w => {
        const isActionRequired = w.agyState && w.agyState.actionRequired;
        if (isActionRequired) {
          if (!activeAutoAccepts.has(w.id)) {
            activeAutoAccepts.add(w.id);
            console.log('[⚡ Auto-Accept] Action required on window ' + w.id + ' (' + w.name + '). Scheduling Enter...');

            // Flash visual status on the button
            const card = document.querySelector('.spatial-window[data-id="' + w.id + '"]');
            const enterBtn = card ? card.querySelector('.btn-enter') : null;
            if (enterBtn) {
              enterBtn.textContent = '⚡ ACCEPTING...';
              enterBtn.style.background = '#d97706';
            }

            // Settlement delay before auto-confirming (350ms)
            setTimeout(() => {
              if (!autoAcceptEnabled) return;
              console.log('[⚡ Auto-Accept] Dispatched Enter to window ' + w.id);
              sendAction(w.id, 'enter');
            }, 350);
          }
        } else {
          activeAutoAccepts.delete(w.id);
        }
      });
    }

    // Haptics & Screen Wake Lock
    function triggerHaptic(duration = 15) {
      if (navigator.vibrate) {
        try { navigator.vibrate(duration); } catch(e) {}
      }
    }

    async function requestWakeLock() {
      if ('wakeLock' in navigator) {
        try { await navigator.wakeLock.request('screen'); } catch (err) {}
      }
    }
    document.addEventListener('click', requestWakeLock, { once: true });

    // HTML Escape Helper
    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    // Send Key or Focus Action (with settlement debounce)
    async function sendAction(windowId, key) {
      if (isActionInProgress) return;
      isActionInProgress = true;
      triggerHaptic(key === 'enter' ? 24 : 12);
      try {
        await fetch('/api/key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ windowId: parseInt(windowId, 10), key })
        });
      } catch (err) {
        console.error('Failed to send key:', err);
      } finally {
        setTimeout(() => { isActionInProgress = false; }, 160);
      }
    }

    // Render Full Spatial Desktop Layout with Ambient Lighting (Muted vs Lit)
    function renderSpatialLayout(windows) {
      windowCount.textContent = windows.length + ' window' + (windows.length === 1 ? '' : 's');
      if (!windows.length) {
        spatialStage.innerHTML = '<div class="empty-state">No open Terminal.app windows found</div>';
        return;
      }

      // Remove empty state message if present
      const emptyState = spatialStage.querySelector('.empty-state');
      if (emptyState) emptyState.remove();

      // Compute global desktop bounding box
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      windows.forEach(w => {
        minX = Math.min(minX, w.position.x);
        minY = Math.min(minY, w.position.y);
        maxX = Math.max(maxX, w.position.x + w.size.width);
        maxY = Math.max(maxY, w.position.y + w.size.height);
      });

      const spanX = Math.max(maxX - minX, 100);
      const spanY = Math.max(maxY - minY, 100);

      // Measure exact available pixel dimensions inside viewportContainer
      const rect = viewportContainer.getBoundingClientRect();
      const padding = 8;
      const viewW = Math.max(rect.width - padding * 2, 40);
      const viewH = Math.max(rect.height - padding * 2, 40);

      // Pure "contain" mode: fit desktop aspect ratio cleanly inside available viewport
      const desktopAspect = spanX / spanY;
      const viewAspect = viewW / viewH;

      let stageW, stageH;
      if (viewAspect > desktopAspect) {
        stageH = viewH;
        stageW = viewH * desktopAspect;
      } else {
        stageW = viewW;
        stageH = viewW / desktopAspect;
      }

      spatialStage.style.width = Math.round(stageW) + 'px';
      spatialStage.style.height = Math.round(stageH) + 'px';

      // Index existing DOM cards by window ID
      const existingCards = new Map();
      spatialStage.querySelectorAll('.spatial-window').forEach(el => {
        const id = parseInt(el.getAttribute('data-id'), 10);
        existingCards.set(id, el);
      });

      const currentIds = new Set(windows.map(w => w.id));

      // Remove only cards for windows that truly closed
      for (const [id, el] of existingCards) {
        if (!currentIds.has(id)) {
          el.remove();
          existingCards.delete(id);
        }
      }

      // Reconcile and update cards in place
      windows.forEach(w => {
        const leftPercent = ((w.position.x - minX) / spanX) * 100;
        const topPercent = ((w.position.y - minY) / spanY) * 100;
        const widthPercent = (w.size.width / spanX) * 100;
        const heightPercent = (w.size.height / spanY) * 100;
        const zIndex = 1000 - w.index;
        const isActive = w.index === 1;

        // Action detection state
        const agyStatus = w.agyState ? w.agyState.status : 'idle';
        const agyLabel = w.agyState ? w.agyState.label : '';
        const agyColor = w.agyState ? w.agyState.color : '';
        const isActionRequired = w.agyState && w.agyState.actionRequired;

        let card = existingCards.get(w.id);
        if (!card) {
          card = document.createElement('div');
          card.setAttribute('data-id', w.id);
          card.className = 'spatial-window';
          card.innerHTML = \`
            <div class="window-card">
              <div class="card-header" onclick="sendAction(\${w.id}, 'focus')">
                <div class="window-title" title="\${escapeHtml(w.name)}">\${escapeHtml(w.name)}</div>
                <div class="header-badges">
                  <span class="state-badge" style="display: none"></span>
                  <span class="active-badge" style="display: \${isActive ? 'inline-block' : 'none'}">ACTIVE</span>
                </div>
              </div>

              <pre class="terminal-preview">\${escapeHtml(w.preview || '')}</pre>

              <div class="button-pad">
                <div class="button-row">
                  <button onclick="sendAction(\${w.id}, 'up')">▲ Up</button>
                  <button onclick="sendAction(\${w.id}, 'down')">▼ Down</button>
                  <button class="btn-esc" onclick="sendAction(\${w.id}, 'esc')">Esc</button>
                </div>
                <div class="button-row">
                  <button class="btn-enter" onclick="sendAction(\${w.id}, 'enter')">↵ Enter</button>
                  <button class="btn-focus" onclick="sendAction(\${w.id}, 'focus')">Focus</button>
                </div>
              </div>
            </div>
          \`;
          spatialStage.appendChild(card);
        } else {
          // Update in-place without tearing down DOM
          const titleEl = card.querySelector('.window-title');
          if (titleEl && titleEl.textContent !== w.name) {
            titleEl.textContent = w.name;
            titleEl.title = w.name;
          }

          const activeBadge = card.querySelector('.active-badge');
          if (activeBadge) {
            activeBadge.style.display = isActive ? 'inline-block' : 'none';
          }

          const previewEl = card.querySelector('.terminal-preview');
          if (previewEl && previewEl.textContent !== (w.preview || '')) {
            previewEl.textContent = w.preview || '';
          }

          const enterBtn = card.querySelector('.btn-enter');
          if (enterBtn) {
            const isAccepting = activeAutoAccepts.has(w.id);
            enterBtn.textContent = isAccepting ? '⚡ ACCEPTING...' : '↵ Enter';
            if (isAccepting) enterBtn.style.background = '#d97706';
            else enterBtn.style.background = '';
          }
        }

        // Update State Badge
        const stateBadge = card.querySelector('.state-badge');
        if (stateBadge) {
          if (agyLabel) {
            stateBadge.textContent = agyLabel;
            stateBadge.className = 'state-badge badge-' + agyColor;
            stateBadge.style.display = 'inline-block';
          } else {
            stateBadge.style.display = 'none';
          }
        }

        // Update card classes (adds .action-required when snippet matches)
        let classNames = 'spatial-window';
        if (isActive) classNames += ' active';
        if (isActionRequired) classNames += ' action-required';
        card.className = classNames;

        card.style.left = leftPercent + '%';
        card.style.top = topPercent + '%';
        card.style.width = widthPercent + '%';
        card.style.height = heightPercent + '%';
        card.style.zIndex = isActionRequired ? 1001 : zIndex;
      });
    }

    // Re-render on resize, orientation change, or fold/unfold
    function handleResize() {
      if (currentWindows.length) renderSpatialLayout(currentWindows);
    }
    window.addEventListener('resize', handleResize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
    }

    // Connect Server-Sent Events (SSE)
    function connectSSE() {
      const evtSource = new EventSource('/events');

      evtSource.onopen = () => {
        statusDot.className = 'status-dot online';
        statusText.textContent = 'Live';
      };

      evtSource.onmessage = (event) => {
        try {
          currentWindows = JSON.parse(event.data);
          renderSpatialLayout(currentWindows);
          checkAutoAccept(currentWindows);
        } catch (e) {
          console.error('Error parsing SSE data', e);
        }
      };

      evtSource.onerror = () => {
        statusDot.className = 'status-dot';
        statusText.textContent = 'Reconnecting';
        evtSource.close();
        setTimeout(connectSSE, 2000);
      };
    }

    connectSSE();
  </script>
</body>
</html>
`;

// HTTP Server
const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // Endpoint: GET / (Serve 100% Spatial Web App)
  if (url.pathname === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML_APP);
    return;
  }

  // Endpoint: GET /terminals (JSON snapshot)
  if (url.pathname === '/terminals' && req.method === 'GET') {
    const terminals = fetchTerminalState();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(terminals, null, 2));
    return;
  }

  // Endpoint: GET /events (Server-Sent Events reactive stream)
  if (url.pathname === '/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    // Send immediate initial state
    const current = fetchTerminalState();
    res.write(`data: ${JSON.stringify(current)}\n\n`);

    sseClients.add(res);
    console.log(`[+] Client connected to /events (${sseClients.size} active)`);

    req.on('close', () => {
      sseClients.delete(res);
      console.log(`[-] Client disconnected from /events (${sseClients.size} active)`);
    });
    return;
  }

  // Endpoint: POST /api/key (Dispatch Keystroke & Restore Focus)
  if (url.pathname === '/api/key' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const { windowId, key } = body;

      if (!windowId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing windowId in request body' }));
        return;
      }

      const result = injectKey(windowId, key);
      const restored = result.restoredFocus ? ` (restored focus to ${result.frontAppName || 'window ' + result.prevWindowId})` : '';
      console.log(`[⌨️] Dispatched key "${key || 'focus'}" to window ${windowId}${restored}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error(`[!] Key dispatch error:`, err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Fallback 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found', routes: ['/', '/terminals', '/events', '/api/key'] }));
});

// Periodic background change detection
const checkTimer = setInterval(() => {
  const current = fetchTerminalState();
  const hash = computeStateHash(current);

  if (hash !== lastStateHash) {
    lastStateHash = hash;
    lastStateJson = JSON.stringify(current);

    if (sseClients.size > 0) {
      console.log(`[⚡] Window update detected (${current.length} window(s)) -> Broadcasting to ${sseClients.size} client(s)`);
      broadcast(lastStateJson);
    }
  }
}, POLL_INTERVAL_MS);

// Heartbeat keep-alive every 15s to keep connections healthy
const heartbeatTimer = setInterval(() => {
  for (const res of sseClients) {
    try {
      res.write(': keepalive\n\n');
    } catch (e) {
      sseClients.delete(res);
    }
  }
}, 15000);

// Start server
server.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIp();
  const hostname = os.hostname();
  const phoneUrl = `http://${localIp}:${PORT}`;

  console.log(`\n======================================================`);
  console.log(`🚀 macOS Terminal Spatial Remote running on port ${PORT}`);
  console.log(`======================================================`);
  console.log(`Local Web App:    http://localhost:${PORT}`);
  console.log(`Phone (LAN Wi-Fi): ${phoneUrl}`);
  console.log(`mDNS Link:        http://${hostname}:${PORT}`);
  console.log(`\nScan with Phone Camera to Open Spatial Controller:`);
  printQrCode(phoneUrl);
  console.log(`======================================================`);
  console.log(`Endpoints:`);
  console.log(`  • GET  /          -> 100% Spatial Multi-Monitor Controller`);
  console.log(`  • GET  /terminals -> JSON snapshot of open windows`);
  console.log(`  • GET  /events    -> Real-time SSE reactive stream`);
  console.log(`  • POST /api/key   -> Focus window & inject keystroke`);
  console.log(`======================================================\n`);
});

// Clean and instant shutdown on Ctrl+C (SIGINT) or SIGTERM
function shutdown() {
  console.log('\nShutting down server...');
  clearInterval(checkTimer);
  clearInterval(heartbeatTimer);

  for (const res of sseClients) {
    try {
      res.end();
      res.destroy();
    } catch (e) {}
  }
  sseClients.clear();

  try {
    server.closeAllConnections?.();
    server.close();
  } catch (e) {}

  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGHUP', shutdown);
