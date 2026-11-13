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

// Embedded minimal seamless looping MP4 video to prevent mobile screen sleep over LAN HTTP
const NO_SLEEP_MP4_BASE64 = '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';
const NO_SLEEP_MP4_BUF = Buffer.from(NO_SLEEP_MP4_BASE64, 'base64');

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
let lastKnownGoodState = { windows: [], displays: [] };

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

// Atomic Batch JXA Script to query physical displays, Terminal.app windows, geometry, and preview
const JXA_FETCH_SCRIPT = `
(() => {
  // 1. Fetch physical display geometry via NSScreen
  const displays = [];
  try {
    ObjC.import("AppKit");
    const screens = $.NSScreen.screens;
    const primaryHeight = screens.objectAtIndex(0).frame.size.height;
    for (let i = 0; i < screens.count; i++) {
      const f = screens.objectAtIndex(i).frame;
      displays.push({
        x: Math.round(f.origin.x),
        y: Math.round(primaryHeight - (f.origin.y + f.size.height)),
        width: Math.round(f.size.width),
        height: Math.round(f.size.height)
      });
    }
  } catch(e) {}

  const terminal = Application("Terminal");
  if (!terminal.running()) return JSON.stringify({ windows: [], displays: displays });
  
  const wins = terminal.windows;
  let ids = [], names = [], positions = [], sizes = [], indices = [], miniaturized = [];
  try {
    ids = wins.id();
    names = wins.name();
    positions = wins.position();
    sizes = wins.size();
    indices = wins.index();
    try { miniaturized = wins.miniaturized(); } catch(e) {}
  } catch(e) {
    return JSON.stringify({ windows: [], displays: displays });
  }
  
  if (!ids || !ids.length) return JSON.stringify({ windows: [], displays: displays });

  // 2. Query System Events for true global desktop coordinates across multi-monitor setups.
  // Note: Terminal.app's internal AppleScript dictionary has an upstream bug where positions[i].y
  // is clamped to the local screen menu bar offset (y ≈ 30-33) instead of global desktop Y.
  let sysPositions = [], sysSizes = [], sysNames = [], sysMinimized = [];
  try {
    const sys = Application("System Events");
    const termProc = sys.processes.byName("Terminal");
    if (termProc.exists()) {
      sysNames = termProc.windows.name();
      sysPositions = termProc.windows.position();
      sysSizes = termProc.windows.size();
      try {
        sysMinimized = termProc.windows.attributes.byName("AXMinimized").value();
      } catch(e) {}
    }
  } catch(e) {}

  const sysVisible = [];
  if (sysNames && sysNames.length) {
    for (let k = 0; k < sysNames.length; k++) {
      if (sysMinimized && sysMinimized[k] === true) continue;
      sysVisible.push({
        name: sysNames[k],
        pos: sysPositions[k],
        size: sysSizes[k],
        used: false
      });
    }
  }
  
  const results = [];
  for (let i = 0; i < ids.length; i++) {
    if (miniaturized && miniaturized[i] === true) continue;
    const id = ids[i];
    const name = names[i];
    if (!id || !name) continue;

    let posX = Math.round(positions[i].x);
    let posY = Math.round(positions[i].y);
    let sizeW = Math.round(sizes[i].x);
    let sizeH = Math.round(sizes[i].y);

    if (sysVisible.length) {
      let sysMatch = sysVisible.find(s => !s.used && s.name === name);
      if (sysMatch) {
        sysMatch.used = true;
        if (sysMatch.pos && Array.isArray(sysMatch.pos)) {
          posX = Math.round(sysMatch.pos[0]);
          posY = Math.round(sysMatch.pos[1]);
        }
        if (sysMatch.size && Array.isArray(sysMatch.size)) {
          sizeW = Math.round(sysMatch.size[0]);
          sizeH = Math.round(sysMatch.size[1]);
        }
      }
    }
    
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
        preview = nonEmpty.slice(-25).join("\\n");
      }
    } catch (e) {}
    
    results.push({
      id: id,
      name: name,
      index: indices[i],
      position: { x: posX, y: posY },
      size: { width: sizeW, height: sizeH },
      cols: cols,
      rows: rows,
      tty: tty,
      busy: busy,
      preview: preview,
      analysis: analysis
    });
  }
  return JSON.stringify({ windows: results, displays: displays });
})()
`.trim();

/**
 * Clean terminal preview text by removing runs of 2+ '-' or '─' characters,
 * collapsing consecutive whitespace into a single space, and keeping the last 15 non-empty lines.
 */
function formatPreviewText(text) {
  if (!text) return '';
  return text
    .split(/\r?\n/)
    .map(line => line.replace(/[-─]{2,}/g, '').replace(/[^\S\n]{2,}/g, ' ').trim())
    .filter(line => line.length > 0)
    .slice(-15)
    .join('\n');
}

/**
 * Query current Terminal.app window and multi-monitor display state
 */
function fetchTerminalState() {
  try {
    const raw = execFileSync('osascript', ['-l', 'JavaScript', '-e', JXA_FETCH_SCRIPT], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2500
    });
    const parsed = JSON.parse(raw.trim());
    const rawWindows = Array.isArray(parsed) ? parsed : (parsed && parsed.windows ? parsed.windows : []);
    const displays = Array.isArray(parsed) ? [] : (parsed && parsed.displays ? parsed.displays : []);

    if (Array.isArray(rawWindows)) {
      const enriched = rawWindows.map(w => {
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
          preview: formatPreviewText(w.preview || w.analysis),
          agyState: agyState
        };
      });
      const state = { windows: enriched, displays: displays };
      lastKnownGoodState = state;
      return state;
    }
    return lastKnownGoodState && lastKnownGoodState.windows && lastKnownGoodState.windows.length ? lastKnownGoodState : { windows: [], displays: displays };
  } catch (err) {
    return lastKnownGoodState && lastKnownGoodState.windows ? lastKnownGoodState : { windows: [], displays: [] };
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
        const visibleWins = terminal.windows.whose({ miniaturized: false });
        if (visibleWins.length > 0) {
          prevWindowId = visibleWins[0].id();
        }
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
function computeStateHash(state) {
  const windows = Array.isArray(state) ? state : (state && state.windows ? state.windows : []);
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

    /* Header Pill Button (overrides global keypad button sizing) */
    button.header-btn {
      flex: 0 0 auto;
      min-height: 0;
      padding: 3px 8px;
      font-size: 0.68rem;
      font-weight: 700;
      border-radius: 9999px;
      background: #0f172a;
      border: 1px solid #334155;
      color: var(--text);
      gap: 4px;
    }
    button.header-btn.active {
      border-color: var(--accent);
      color: var(--accent);
      background: #082f49;
    }
    body.immersive header {
      display: none;
    }
    .immersive-exit-btn {
      display: none;
      position: fixed;
      top: calc(var(--safe-top) + 6px);
      right: 8px;
      z-index: 3000;
      opacity: 0.75;
    }
    body.immersive .immersive-exit-btn {
      display: flex;
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

    /* Multi-Monitor Background Guides */
    .monitors-layer {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 0;
    }
    .monitor-panel {
      position: absolute;
      border: 1px dashed rgba(56, 189, 248, 0.25);
      border-radius: 8px;
      box-sizing: border-box;
      pointer-events: none;
      background: rgba(12, 20, 39, 0.2);
    }
    .monitor-label {
      position: absolute;
      top: 6px;
      left: 8px;
      font-size: 0.62rem;
      font-weight: 800;
      color: rgba(148, 163, 184, 0.4);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    /* Individual Spatial Terminal Window Box */
    .spatial-window {
      position: absolute;
      padding: 3px;
      transition: left 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
                  top 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
                  width 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
                  height 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
      z-index: 10;
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
      flex: 1 1 0;
      min-height: 20px;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
    }
    .spatial-window.action-required .terminal-preview {
      border-color: rgba(245, 158, 11, 0.5);
      background: #0a0a16;
      color: #fef08a;
    }

    /* BUTTON PAD: CRISP, VIBRANT & READABLE AT ALL TIMES */
    .button-pad {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: auto;
      flex-shrink: 0;
      opacity: 0.95;
      transition: opacity 0.2s ease, filter 0.2s ease;
    }

    .spatial-window.active .button-pad {
      opacity: 1;
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
      padding: clamp(6px, 1vh, 10px) 4px;
      font-size: clamp(0.72rem, 1.5vw, 1.15rem);
      flex: 1;
      min-height: clamp(32px, 4vh, 42px);
    }
    button:active {
      transform: scale(0.93);
      background: var(--action-btn-active);
    }

    /* Button Colors */
    button.btn-enter {
      background: var(--enter-btn);
      font-size: clamp(0.85rem, 1.8vw, 1.3rem);
      font-weight: 800;
      flex: 1.8;
      min-height: clamp(34px, 4.2vh, 44px);
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

    /* Empty state */
    .empty-state {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-muted);
      font-size: 0.95rem;
    }

    /* Workspace & Movable Enter Dock */
    .workspace-main {
      flex: 1 1 0;
      min-height: 0;
      min-width: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .workspace-main[data-dock="top"] {
      flex-direction: column;
    }
    .workspace-main[data-dock="left"],
    .workspace-main[data-dock="right"] {
      flex-direction: row;
    }
    .workspace-main .viewport-container {
      order: 1;
    }
    .enter-dock {
      flex: 0 0 auto;
      order: 2;
      display: flex;
      align-items: stretch;
      gap: 6px;
      padding: 6px 8px calc(var(--safe-bottom) + 6px) 8px;
      background: #090e1a;
      border-top: 1px solid var(--card-border);
      z-index: 2000;
    }
    .workspace-main[data-dock="top"] .enter-dock {
      order: 0;
      padding: 6px 8px;
      border-top: none;
      border-bottom: 1px solid var(--card-border);
    }
    .workspace-main[data-dock="left"] .enter-dock,
    .workspace-main[data-dock="right"] .enter-dock {
      flex-direction: column;
      width: clamp(56px, 11vw, 86px);
      padding: 4px;
      gap: 4px;
      border-top: none;
    }
    .workspace-main[data-dock="inline"] .enter-dock {
      display: none;
    }
    .workspace-main[data-dock="left"] .enter-dock {
      order: 0;
      border-right: 1px solid var(--card-border);
    }
    .workspace-main[data-dock="right"] .enter-dock {
      order: 2;
      border-left: 1px solid var(--card-border);
    }
    .enter-dock:empty {
      display: none;
    }
    button.dock-enter-btn {
      flex: 1 1 0;
      min-width: 0;
      min-height: clamp(42px, 5.5vh, 54px);
      padding: 6px 8px;
      border-radius: 10px;
      background: #111c33;
      border: 1px solid #1e293b;
      border-top: 3px solid var(--win-color, var(--enter-btn));
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      color: #ffffff;
    }
    .workspace-main[data-dock="top"] button.dock-enter-btn {
      border-top: 1px solid #1e293b;
      border-bottom: 3px solid var(--win-color, var(--enter-btn));
    }
    .workspace-main[data-dock="left"] button.dock-enter-btn {
      border-top: 1px solid #1e293b;
      border-right: 3px solid var(--win-color, var(--enter-btn));
      min-height: 0;
      padding: 4px 3px;
    }
    .workspace-main[data-dock="right"] button.dock-enter-btn {
      border-top: 1px solid #1e293b;
      border-left: 3px solid var(--win-color, var(--enter-btn));
      min-height: 0;
      padding: 4px 3px;
    }
    .workspace-main[data-dock="left"] .dock-btn-label,
    .workspace-main[data-dock="right"] .dock-btn-label {
      font-size: clamp(0.56rem, 1.05vw, 0.7rem);
      white-space: normal;
      overflow-wrap: anywhere;
      line-height: 1.15;
    }
    button.inline-enter-btn {
      display: none;
      flex: 0 0 auto;
      width: 100%;
      margin-top: 4px;
      background: #111c33;
      border: 1px solid #1e293b;
      border-top: 3px solid var(--win-color, var(--enter-btn));
      color: #cbd5e1;
      font-size: clamp(0.8rem, 1.6vw, 1.15rem);
      font-weight: 800;
      min-height: clamp(32px, 4vh, 42px);
    }
    .workspace-main[data-dock="inline"] button.inline-enter-btn {
      display: flex;
    }
    .spatial-window.action-required button.inline-enter-btn {
      background: var(--enter-btn);
      border-color: #4ade80;
      border-top-color: #fbbf24;
      color: #ffffff;
      box-shadow: 0 0 16px rgba(22, 163, 74, 0.8);
      animation: pulse-enter 1.6s infinite ease-in-out;
    }
    button.inline-enter-btn.is-sending {
      background: #0369a1;
      animation: none;
    }
    button.inline-enter-btn.is-sent {
      background: #15803d;
      animation: none;
    }
    button.inline-enter-btn.is-error {
      background: #b91c1c;
      animation: none;
    }
    button.dock-enter-btn:active {
      transform: scale(0.95);
      background: #1e293b;
    }
    button.dock-enter-btn.action-required {
      background: var(--enter-btn);
      border-color: #4ade80;
      border-top-color: #fbbf24;
      box-shadow: 0 0 16px rgba(22, 163, 74, 0.8);
      animation: pulse-enter 1.6s infinite ease-in-out;
    }
    .dock-btn-label {
      width: 100%;
      font-size: clamp(0.65rem, 1.3vw, 0.8rem);
      font-weight: 700;
      color: #cbd5e1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: center;
    }
    button.dock-enter-btn.action-required .dock-btn-label {
      color: #fef08a;
    }
    .dock-btn-action {
      font-size: clamp(0.82rem, 1.6vw, 1.1rem);
      font-weight: 800;
      color: #ffffff;
    }
    .window-color-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--win-color, var(--accent));
      flex-shrink: 0;
    }

    /* Visual SVG Connector Overlay */
    .connector-layer {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1500;
    }
    @keyframes connector-flow {
      from { stroke-dashoffset: 0; }
      to { stroke-dashoffset: 24; }
    }
    .connector-path-sending {
      stroke-dasharray: 7 5;
      animation: connector-flow 0.45s linear infinite;
    }
    button.dock-enter-btn.is-sending {
      background: #0369a1;
      border-color: #38bdf8;
      box-shadow: 0 0 14px rgba(56, 189, 248, 0.7);
      animation: none;
    }
    button.dock-enter-btn.is-sent {
      background: #15803d;
      border-color: #4ade80;
      box-shadow: 0 0 18px rgba(74, 222, 128, 0.85);
      animation: none;
    }
    button.dock-enter-btn.is-error {
      background: #b91c1c;
      border-color: #f87171;
      box-shadow: 0 0 16px rgba(248, 113, 113, 0.85);
      animation: none;
    }
    .spatial-window.is-sending .window-card {
      border-color: #38bdf8 !important;
      box-shadow: 0 0 18px rgba(56, 189, 248, 0.55);
    }
    .spatial-window.is-sent .window-card {
      border-color: #4ade80 !important;
      box-shadow: 0 0 22px rgba(74, 222, 128, 0.7);
    }
    .spatial-window.is-error .window-card {
      border-color: #f87171 !important;
      box-shadow: 0 0 18px rgba(248, 113, 113, 0.65);
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
      <div class="status-badge" id="wakeLockBadge" title="Screen Wake Lock status (prevents screen dimming)">
        <div class="status-dot online" id="wakeDot"></div>
        <span id="wakeText">Awake</span>
      </div>
      <div class="status-badge">
        <div class="status-dot" id="statusDot"></div>
        <span id="statusText">Connecting</span>
      </div>
      <div class="status-badge" id="windowCount">0 windows</div>
      <button type="button" class="header-btn" id="dockPosBtn" title="Move Enter dock (Bottom / Top / Left / Right)">⬇ Bottom</button>
      <button type="button" class="header-btn" id="fullscreenBtn" title="Toggle fullscreen">⛶ Full</button>
    </div>
  </header>

  <button type="button" class="header-btn immersive-exit-btn" id="immersiveExitBtn" title="Exit fullscreen">✕ Exit</button>

  <main class="workspace-main" id="workspaceMain" data-dock="bottom">
    <div class="viewport-container" id="viewportContainer">
      <div class="spatial-stage" id="spatialStage">
        <div class="empty-state">Looking for Terminal.app windows...</div>
      </div>
    </div>

    <div class="enter-dock" id="enterDock"></div>
  </main>
  <svg class="connector-layer" id="connectorLayer"></svg>

  <script>
    let currentWindows = [];
    let currentDisplays = [];
    let isActionInProgress = false;
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const windowCount = document.getElementById('windowCount');
    const viewportContainer = document.getElementById('viewportContainer');
    const spatialStage = document.getElementById('spatialStage');
    const enterDock = document.getElementById('enterDock');
    const connectorLayer = document.getElementById('connectorLayer');
    const WINDOW_COLORS = ['#38bdf8', '#a78bfa', '#f472b6', '#34d399', '#fb923c', '#facc15', '#818cf8', '#2dd4bf'];
    let connectorTimer = null;
    const autoAcceptToggle = document.getElementById('autoAcceptToggle');
    const workspaceMain = document.getElementById('workspaceMain');
    const dockPosBtn = document.getElementById('dockPosBtn');
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const immersiveExitBtn = document.getElementById('immersiveExitBtn');

    const DOCK_POSITIONS = ['bottom', 'top', 'left', 'right', 'inline'];
    const DOCK_LABELS = { bottom: '⬇ Bottom', top: '⬆ Top', left: '⬅ Left', right: '➡ Right', inline: '▣ Inline' };
    let dockPos = localStorage.getItem('tbx_dock_pos');
    if (!DOCK_POSITIONS.includes(dockPos)) dockPos = 'bottom';

    function applyDockPosition() {
      if (workspaceMain) workspaceMain.setAttribute('data-dock', dockPos);
      if (dockPosBtn) dockPosBtn.textContent = DOCK_LABELS[dockPos];
      if (typeof handleResize === 'function') {
        requestAnimationFrame(handleResize);
      }
    }
    applyDockPosition();

    if (dockPosBtn) {
      dockPosBtn.addEventListener('click', () => {
        triggerHaptic(20);
        dockPos = DOCK_POSITIONS[(DOCK_POSITIONS.indexOf(dockPos) + 1) % DOCK_POSITIONS.length];
        localStorage.setItem('tbx_dock_pos', dockPos);
        applyDockPosition();
      });
    }

    function isNativeFullscreen() {
      return !!(document.fullscreenElement || document.webkitFullscreenElement);
    }

    function updateFullscreenUI() {
      const active = isNativeFullscreen() || document.body.classList.contains('immersive');
      if (fullscreenBtn) {
        fullscreenBtn.classList.toggle('active', active);
        fullscreenBtn.textContent = active ? '✕ Exit' : '⛶ Full';
      }
      if (typeof handleResize === 'function') {
        requestAnimationFrame(handleResize);
      }
    }

    async function toggleFullscreen() {
      triggerHaptic(20);
      const root = document.documentElement;
      if (isNativeFullscreen()) {
        try {
          if (document.exitFullscreen) await document.exitFullscreen();
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        } catch (e) {}
        document.body.classList.remove('immersive');
        updateFullscreenUI();
        return;
      }

      if (document.body.classList.contains('immersive')) {
        document.body.classList.remove('immersive');
        updateFullscreenUI();
        return;
      }

      if (root.requestFullscreen || root.webkitRequestFullscreen) {
        try {
          if (root.requestFullscreen) await root.requestFullscreen();
          else root.webkitRequestFullscreen();
          updateFullscreenUI();
          return;
        } catch (e) {}
      }

      // Fallback for browsers without Fullscreen API (e.g. iOS Safari)
      document.body.classList.add('immersive');
      updateFullscreenUI();
    }

    if (fullscreenBtn) fullscreenBtn.addEventListener('click', toggleFullscreen);
    if (immersiveExitBtn) immersiveExitBtn.addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', updateFullscreenUI);
    document.addEventListener('webkitfullscreenchange', updateFullscreenUI);

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

            // Flash visual status on the dock Enter button
            const enterBtn = enterDock ? enterDock.querySelector('.dock-enter-btn[data-id="' + w.id + '"] .dock-btn-action') : null;
            if (enterBtn) {
              enterBtn.textContent = '⚡ ACCEPTING...';
              enterBtn.parentElement.style.background = '#d97706';
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

    // Haptics Helper
    function triggerHaptic(duration = 15) {
      if (navigator.vibrate) {
        try { navigator.vibrate(duration); } catch(e) {}
      }
    }

    // Robust Keep-Awake Engine (Screen Wake Lock API + NoSleep HTML5 Media Loop)
    let wakeLockSentinel = null;
    let isVideoAwakePlaying = false;
    const wakeDot = document.getElementById('wakeDot');
    const wakeText = document.getElementById('wakeText');
    const wakeBadge = document.getElementById('wakeLockBadge');

    // Create invisible looping video element
    const noSleepVideo = document.createElement('video');
    noSleepVideo.setAttribute('title', 'NoSleep');
    noSleepVideo.setAttribute('playsinline', '');
    noSleepVideo.setAttribute('webkit-playsinline', '');
    noSleepVideo.setAttribute('muted', '');
    noSleepVideo.muted = true;
    noSleepVideo.loop = true;
    noSleepVideo.style.position = 'fixed';
    noSleepVideo.style.width = '1px';
    noSleepVideo.style.height = '1px';
    noSleepVideo.style.opacity = '0.001';
    noSleepVideo.style.pointerEvents = 'none';
    noSleepVideo.style.bottom = '0';
    noSleepVideo.style.right = '0';

    const videoSource = document.createElement('source');
    videoSource.src = '/nosleep.mp4';
    videoSource.type = 'video/mp4';
    noSleepVideo.appendChild(videoSource);
    document.body.appendChild(noSleepVideo);

    // iOS Safari continuous loop enforcement
    noSleepVideo.addEventListener('timeupdate', () => {
      if (noSleepVideo.currentTime > 0.5) {
        noSleepVideo.currentTime = Math.random() * 0.3;
      }
    });

    function updateWakeLockUI() {
      if (!wakeDot || !wakeText) return;
      const isActive = !!wakeLockSentinel || isVideoAwakePlaying;
      if (isActive) {
        wakeDot.className = 'status-dot online';
        wakeText.textContent = 'Awake';
        if (wakeBadge) wakeBadge.title = 'Screen Keep-Awake active (screen will not go dark)';
      } else {
        wakeDot.className = 'status-dot';
        wakeText.textContent = 'Tap for Awake';
        if (wakeBadge) wakeBadge.title = 'Screen Keep-Awake inactive. Tap anywhere or tap this badge.';
      }
    }

    async function enableKeepAwake() {
      // 1. Try native Screen Wake Lock API (works on HTTPS / localhost)
      if ('wakeLock' in navigator) {
        try {
          if (!wakeLockSentinel || wakeLockSentinel.released) {
            wakeLockSentinel = await navigator.wakeLock.request('screen');
            wakeLockSentinel.addEventListener('release', () => {
              wakeLockSentinel = null;
              updateWakeLockUI();
              if (document.visibilityState === 'visible') {
                setTimeout(enableKeepAwake, 600);
              }
            });
          }
        } catch(e) {}
      }

      // 2. Play HTML5 Keep-Awake video (works over HTTP LAN on iOS Safari & Android)
      try {
        if (noSleepVideo.paused) {
          const p = noSleepVideo.play();
          if (p && typeof p.then === 'function') {
            await p;
          }
        }
        isVideoAwakePlaying = true;
      } catch(e) {
        isVideoAwakePlaying = !noSleepVideo.paused;
      }

      updateWakeLockUI();
    }

    // Try immediately on script run
    enableKeepAwake();

    // Re-arm on visibilitychange (e.g. phone wake up or switching back to browser)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        enableKeepAwake();
      }
    });

    // Re-arm on any user touch/tap anywhere on the screen
    ['click', 'touchstart', 'touchend', 'pointerdown'].forEach(evtType => {
      document.addEventListener(evtType, () => {
        enableKeepAwake();
      }, { passive: true });
    });

    if (wakeBadge) {
      wakeBadge.style.cursor = 'pointer';
      wakeBadge.addEventListener('click', () => {
        triggerHaptic(20);
        enableKeepAwake();
      });
    }

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

    const keyDispatchState = new Map();

    function applyKeyDispatchUI(windowId) {
      const stage = keyDispatchState.get(windowId)?.stage || null;
      const card = spatialStage ? spatialStage.querySelector('.spatial-window[data-id="' + windowId + '"]') : null;
      if (card) {
        card.classList.remove('is-sending', 'is-sent', 'is-error');
        if (stage === 'sending' || stage === 'started') card.classList.add('is-sending');
        else if (stage === 'completed') card.classList.add('is-sent');
        else if (stage === 'error') card.classList.add('is-error');

        const inlineBtn = card.querySelector('.inline-enter-btn');
        if (inlineBtn) {
          inlineBtn.classList.remove('is-sending', 'is-sent', 'is-error');
          if (stage === 'sending' || stage === 'started') {
            inlineBtn.classList.add('is-sending');
            inlineBtn.textContent = stage === 'started' ? '⚡ Running...' : '⏳ Sending...';
          } else if (stage === 'completed') {
            inlineBtn.classList.add('is-sent');
            inlineBtn.textContent = '✓ Sent';
          } else if (stage === 'error') {
            inlineBtn.classList.add('is-error');
            inlineBtn.textContent = '✕ Failed';
          } else {
            inlineBtn.textContent = activeAutoAccepts.has(windowId) ? '⚡ ACCEPTING...' : '↵ Enter';
          }
        }
      }

      const btn = enterDock ? enterDock.querySelector('.dock-enter-btn[data-id="' + windowId + '"]') : null;
      if (btn) {
        btn.classList.remove('is-sending', 'is-sent', 'is-error');
        const actionEl = btn.querySelector('.dock-btn-action');
        if (stage === 'sending' || stage === 'started') {
          btn.classList.add('is-sending');
          if (actionEl) actionEl.textContent = stage === 'started' ? '⚡ Running...' : '⏳ Sending...';
        } else if (stage === 'completed') {
          btn.classList.add('is-sent');
          if (actionEl) actionEl.textContent = '✓ Sent';
        } else if (stage === 'error') {
          btn.classList.add('is-error');
          if (actionEl) actionEl.textContent = '✕ Failed';
        } else if (actionEl) {
          actionEl.textContent = activeAutoAccepts.has(windowId) ? '⚡ ACCEPTING...' : '↵';
        }
      }

      const path = connectorLayer ? connectorLayer.querySelector('path[data-id="' + windowId + '"]') : null;
      const dots = connectorLayer ? connectorLayer.querySelectorAll('circle[data-id="' + windowId + '"]') : [];
      if (path) {
        path.classList.toggle('connector-path-sending', stage === 'sending' || stage === 'started');
        let overrideColor = null;
        if (stage === 'sending' || stage === 'started') overrideColor = '#38bdf8';
        else if (stage === 'completed') overrideColor = '#4ade80';
        else if (stage === 'error') overrideColor = '#f87171';
        if (overrideColor) {
          path.setAttribute('stroke', overrideColor);
          path.setAttribute('stroke-width', '3');
          path.setAttribute('stroke-opacity', '1');
          dots.forEach(d => {
            d.setAttribute('fill', overrideColor);
            d.setAttribute('fill-opacity', '1');
          });
        }
      }
    }

    function setKeyDispatchStage(windowId, stage) {
      const id = parseInt(windowId, 10);
      const prev = keyDispatchState.get(id);
      if (prev && prev.timer) clearTimeout(prev.timer);

      if (!stage) {
        keyDispatchState.delete(id);
        applyKeyDispatchUI(id);
        return;
      }

      let timer = null;
      if (stage === 'completed' || stage === 'error') {
        if (stage === 'completed') {
          const win = currentWindows.find(w => w.id === id);
          if (win && win.agyState && win.agyState.actionRequired) {
            win.agyState.actionRequired = false;
            win.agyState.status = 'running';
            win.agyState.label = 'RUNNING';
            win.agyState.color = 'blue';
          }
        }
        timer = setTimeout(() => {
          keyDispatchState.delete(id);
          if (currentWindows.length) renderSpatialLayout(currentWindows, currentDisplays);
        }, stage === 'completed' ? 750 : 1200);
      } else {
        // Safety timeout in case server response/SSE is lost
        timer = setTimeout(() => {
          keyDispatchState.delete(id);
          if (currentWindows.length) renderSpatialLayout(currentWindows, currentDisplays);
        }, 4000);
      }

      keyDispatchState.set(id, { stage, timer });
      applyKeyDispatchUI(id);
    }

    // Send Key or Focus Action (with settlement debounce)
    async function sendAction(windowId, key) {
      if (isActionInProgress) return;
      isActionInProgress = true;
      const id = parseInt(windowId, 10);
      triggerHaptic(key === 'enter' ? 24 : 12);
      setKeyDispatchStage(id, 'sending');
      try {
        const res = await fetch('/api/key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ windowId: id, key })
        });
        if (res.ok) {
          setKeyDispatchStage(id, 'completed');
        } else {
          setKeyDispatchStage(id, 'error');
        }
      } catch (err) {
        console.error('Failed to send key:', err);
        setKeyDispatchStage(id, 'error');
      } finally {
        setTimeout(() => { isActionInProgress = false; }, 160);
      }
    }

    function getShortWindowLabel(name) {
      if (!name) return 'Terminal';
      return name.split('—')[0].trim() || name;
    }

    function drawConnectors(windows, colorById) {
      if (!connectorLayer) return;
      connectorLayer.innerHTML = '';
      if (!windows || !windows.length || dockPos === 'inline') return;

      const ns = 'http://www.w3.org/2000/svg';
      windows.forEach(w => {
        const card = spatialStage.querySelector('.spatial-window[data-id="' + w.id + '"] .window-card');
        const btn = enterDock ? enterDock.querySelector('.dock-enter-btn[data-id="' + w.id + '"]') : null;
        if (!card || !btn) return;

        const cRect = card.getBoundingClientRect();
        const bRect = btn.getBoundingClientRect();
        if (!cRect.width || !bRect.width) return;

        let x1, y1, x2, y2, cx1, cy1, cx2, cy2;
        if (dockPos === 'top') {
          x1 = cRect.left + cRect.width / 2;
          y1 = cRect.top;
          x2 = bRect.left + bRect.width / 2;
          y2 = bRect.bottom;
          const dy = Math.max(Math.abs(y1 - y2) * 0.5, 24);
          cx1 = x1; cy1 = y1 - dy; cx2 = x2; cy2 = y2 + dy;
        } else if (dockPos === 'left') {
          x1 = cRect.left;
          y1 = cRect.top + cRect.height / 2;
          x2 = bRect.right;
          y2 = bRect.top + bRect.height / 2;
          const dx = Math.max(Math.abs(x1 - x2) * 0.5, 24);
          cx1 = x1 - dx; cy1 = y1; cx2 = x2 + dx; cy2 = y2;
        } else if (dockPos === 'right') {
          x1 = cRect.right;
          y1 = cRect.top + cRect.height / 2;
          x2 = bRect.left;
          y2 = bRect.top + bRect.height / 2;
          const dx = Math.max(Math.abs(x2 - x1) * 0.5, 24);
          cx1 = x1 + dx; cy1 = y1; cx2 = x2 - dx; cy2 = y2;
        } else {
          x1 = cRect.left + cRect.width / 2;
          y1 = cRect.bottom;
          x2 = bRect.left + bRect.width / 2;
          y2 = bRect.top;
          const dy = Math.max(Math.abs(y2 - y1) * 0.5, 24);
          cx1 = x1; cy1 = y1 + dy; cx2 = x2; cy2 = y2 - dy;
        }
        const dispatchStage = keyDispatchState.get(w.id)?.stage || null;
        const isSending = dispatchStage === 'sending' || dispatchStage === 'started';
        const isActionRequired = w.agyState && w.agyState.actionRequired;
        let color = isActionRequired ? '#fbbf24' : (colorById.get(w.id) || '#38bdf8');
        if (isSending) color = '#38bdf8';
        else if (dispatchStage === 'completed') color = '#4ade80';
        else if (dispatchStage === 'error') color = '#f87171';

        const path = document.createElementNS(ns, 'path');
        path.setAttribute('data-id', w.id);
        path.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' C ' + cx1 + ' ' + cy1 + ', ' + cx2 + ' ' + cy2 + ', ' + x2 + ' ' + y2);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', color);
        path.setAttribute('stroke-width', (isActionRequired || dispatchStage) ? '3' : '1.5');
        path.setAttribute('stroke-opacity', (isActionRequired || dispatchStage) ? '0.95' : '0.45');
        if (isSending) path.setAttribute('class', 'connector-path-sending');
        connectorLayer.appendChild(path);

        [[x1, y1], [x2, y2]].forEach(([cx, cy]) => {
          const dot = document.createElementNS(ns, 'circle');
          dot.setAttribute('data-id', w.id);
          dot.setAttribute('cx', cx);
          dot.setAttribute('cy', cy);
          dot.setAttribute('r', (isActionRequired || dispatchStage) ? '4' : '3');
          dot.setAttribute('fill', color);
          dot.setAttribute('fill-opacity', (isActionRequired || dispatchStage) ? '1' : '0.75');
          connectorLayer.appendChild(dot);
        });
      });
    }

    function scheduleConnectors(windows, colorById) {
      requestAnimationFrame(() => drawConnectors(windows, colorById));
      if (connectorTimer) clearTimeout(connectorTimer);
      connectorTimer = setTimeout(() => drawConnectors(windows, colorById), 320);
    }

    function renderEnterDock(sortedWindows, colorById) {
      if (!enterDock) return;
      if (!sortedWindows.length || dockPos === 'inline') {
        enterDock.innerHTML = '';
        return;
      }

      const existingBtns = new Map();
      enterDock.querySelectorAll('.dock-enter-btn').forEach(el => {
        existingBtns.set(parseInt(el.getAttribute('data-id'), 10), el);
      });
      const currentIds = new Set(sortedWindows.map(w => w.id));
      for (const [id, el] of existingBtns) {
        if (!currentIds.has(id)) {
          el.remove();
          existingBtns.delete(id);
        }
      }

      sortedWindows.forEach(w => {
        const shortName = getShortWindowLabel(w.name);
        const isActionRequired = !!(w.agyState && w.agyState.actionRequired);
        const isAccepting = activeAutoAccepts.has(w.id);
        const color = colorById.get(w.id) || '#38bdf8';

        let btn = existingBtns.get(w.id);
        if (!btn) {
          btn = document.createElement('button');
          btn.type = 'button';
          btn.setAttribute('data-id', w.id);
          btn.className = 'dock-enter-btn';
          btn.innerHTML = '<span class="dock-btn-label"></span><span class="dock-btn-action">↵ Enter</span>';
          btn.addEventListener('click', () => sendAction(w.id, 'enter'));
          enterDock.appendChild(btn);
        } else {
          enterDock.appendChild(btn);
        }

        btn.style.setProperty('--win-color', color);
        const dispatchStage = keyDispatchState.get(w.id)?.stage || null;
        let btnClasses = 'dock-enter-btn';
        if (isActionRequired) btnClasses += ' action-required';
        if (dispatchStage === 'sending' || dispatchStage === 'started') btnClasses += ' is-sending';
        else if (dispatchStage === 'completed') btnClasses += ' is-sent';
        else if (dispatchStage === 'error') btnClasses += ' is-error';
        btn.className = btnClasses;
        btn.title = w.name;
        const labelEl = btn.querySelector('.dock-btn-label');
        if (labelEl && labelEl.textContent !== shortName) {
          labelEl.textContent = shortName;
        }
        const actionEl = btn.querySelector('.dock-btn-action');
        if (actionEl) {
          if (dispatchStage === 'sending') actionEl.textContent = '⏳ Sending...';
          else if (dispatchStage === 'started') actionEl.textContent = '⚡ Running...';
          else if (dispatchStage === 'completed') actionEl.textContent = '✓ Sent';
          else if (dispatchStage === 'error') actionEl.textContent = '✕ Failed';
          else actionEl.textContent = isAccepting ? '⚡ ACCEPTING...' : '↵';
          btn.style.background = (!dispatchStage && isAccepting) ? '#d97706' : '';
        }
      });
    }

    // Render Full Spatial Desktop Layout with Ambient Lighting (Muted vs Lit)
    function renderSpatialLayout(windows, displays = []) {
      windowCount.textContent = windows.length + ' window' + (windows.length === 1 ? '' : 's');
      if (!windows.length) {
        spatialStage.innerHTML = '<div class="empty-state">No open Terminal.app windows found</div>';
        renderEnterDock([], new Map());
        drawConnectors([], new Map());
        return;
      }

      const isVerticalDock = dockPos === 'left' || dockPos === 'right';
      const sortedWindows = [...windows].sort((a, b) => {
        const ax = a.position.x + a.size.width / 2;
        const bx = b.position.x + b.size.width / 2;
        const ay = a.position.y + a.size.height / 2;
        const by = b.position.y + b.size.height / 2;
        if (isVerticalDock) {
          if (Math.abs(ay - by) > 40) return ay - by;
          return ax - bx;
        }
        if (Math.abs(ax - bx) > 40) return ax - bx;
        return ay - by;
      });
      const colorById = new Map();
      sortedWindows.forEach((w, idx) => {
        colorById.set(w.id, WINDOW_COLORS[idx % WINDOW_COLORS.length]);
      });

      // Remove empty state message if present
      const emptyState = spatialStage.querySelector('.empty-state');
      if (emptyState) emptyState.remove();

      // Compute global desktop bounding box from physical displays (if available) and windows
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      if (displays && displays.length > 0) {
        displays.forEach(d => {
          minX = Math.min(minX, d.x);
          minY = Math.min(minY, d.y);
          maxX = Math.max(maxX, d.x + d.width);
          maxY = Math.max(maxY, d.y + d.height);
        });
      }
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

      // Stretch to fill the entire available viewport for maximum text readability
      spatialStage.style.width = Math.round(viewW) + 'px';
      spatialStage.style.height = Math.round(viewH) + 'px';

      // Render monitor outline layer behind windows when multiple displays exist
      let monitorsLayer = spatialStage.querySelector('.monitors-layer');
      if (!monitorsLayer) {
        monitorsLayer = document.createElement('div');
        monitorsLayer.className = 'monitors-layer';
        spatialStage.prepend(monitorsLayer);
      }
      monitorsLayer.innerHTML = '';
      if (displays && displays.length > 1) {
        displays.forEach((d, idx) => {
          const mLeft = ((d.x - minX) / spanX) * 100;
          const mTop = ((d.y - minY) / spanY) * 100;
          const mWidth = (d.width / spanX) * 100;
          const mHeight = (d.height / spanY) * 100;

          const panel = document.createElement('div');
          panel.className = 'monitor-panel';
          panel.style.left = mLeft + '%';
          panel.style.top = mTop + '%';
          panel.style.width = mWidth + '%';
          panel.style.height = mHeight + '%';
          panel.innerHTML = '<span class="monitor-label">Display ' + (idx + 1) + '</span>';
          monitorsLayer.appendChild(panel);
        });
      }

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
                <span class="window-color-dot"></span>
                <div class="window-title" title="\${escapeHtml(w.name)}">\${escapeHtml(w.name)}</div>
                <div class="header-badges">
                  <span class="state-badge" style="display: none"></span>
                  <span class="active-badge" style="display: \${isActive ? 'inline-block' : 'none'}">ACTIVE</span>
                </div>
              </div>

              <pre class="terminal-preview">\${escapeHtml(w.preview || '')}</pre>
              <button type="button" class="inline-enter-btn" onclick="sendAction(\${w.id}, 'enter')">↵ Enter</button>
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

          const inlineBtn = card.querySelector('.inline-enter-btn');
          if (inlineBtn) {
            const stage = keyDispatchState.get(w.id)?.stage || null;
            inlineBtn.classList.remove('is-sending', 'is-sent', 'is-error');
            if (stage === 'sending' || stage === 'started') {
              inlineBtn.classList.add('is-sending');
              inlineBtn.textContent = stage === 'started' ? '⚡ Running...' : '⏳ Sending...';
            } else if (stage === 'completed') {
              inlineBtn.classList.add('is-sent');
              inlineBtn.textContent = '✓ Sent';
            } else if (stage === 'error') {
              inlineBtn.classList.add('is-error');
              inlineBtn.textContent = '✕ Failed';
            } else {
              const isAccepting = activeAutoAccepts.has(w.id);
              inlineBtn.textContent = isAccepting ? '⚡ ACCEPTING...' : '↵ Enter';
              inlineBtn.style.background = isAccepting ? '#d97706' : '';
            }
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

        // Update card classes (adds .action-required when snippet matches + key dispatch state)
        const dispatchStage = keyDispatchState.get(w.id)?.stage || null;
        let classNames = 'spatial-window';
        if (isActive) classNames += ' active';
        if (isActionRequired) classNames += ' action-required';
        if (dispatchStage === 'sending' || dispatchStage === 'started') classNames += ' is-sending';
        else if (dispatchStage === 'completed') classNames += ' is-sent';
        else if (dispatchStage === 'error') classNames += ' is-error';
        card.className = classNames;

        card.style.setProperty('--win-color', colorById.get(w.id) || '#38bdf8');
        card.style.left = leftPercent + '%';
        card.style.top = topPercent + '%';
        card.style.width = widthPercent + '%';
        card.style.height = heightPercent + '%';
        card.style.zIndex = isActionRequired ? 1001 : zIndex;
      });

      renderEnterDock(sortedWindows, colorById);
      scheduleConnectors(sortedWindows, colorById);
    }

    // Re-render on resize, orientation change, or fold/unfold
    function handleResize() {
      if (currentWindows.length) renderSpatialLayout(currentWindows, currentDisplays);
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
        enableKeepAwake();
      };

      evtSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.type === 'key_status') {
            setKeyDispatchStage(data.windowId, data.stage);
            return;
          }
          currentWindows = Array.isArray(data) ? data : (data && data.windows ? data.windows : []);
          currentDisplays = Array.isArray(data) ? [] : (data && data.displays ? data.displays : []);
          renderSpatialLayout(currentWindows, currentDisplays);
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

  // Endpoint: GET /nosleep.mp4 (Minimal seamless looping video to keep mobile screens awake over LAN HTTP)
  if (url.pathname === '/nosleep.mp4' && (req.method === 'GET' || req.method === 'HEAD')) {
    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Length': NO_SLEEP_MP4_BUF.length,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=86400'
    });
    if (req.method === 'HEAD') {
      res.end();
    } else {
      res.end(NO_SLEEP_MP4_BUF);
    }
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
    let targetWindowId = null;
    let targetKey = 'focus';
    try {
      const body = await readJsonBody(req);
      const { windowId, key } = body;

      if (!windowId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing windowId in request body' }));
        return;
      }

      targetWindowId = parseInt(windowId, 10);
      targetKey = key || 'focus';
      if (sseClients.size > 0) {
        broadcast(JSON.stringify({ type: 'key_status', windowId: targetWindowId, key: targetKey, stage: 'started' }));
      }

      const result = injectKey(windowId, key);
      const restored = result.restoredFocus ? ` (restored focus to ${result.frontAppName || 'window ' + result.prevWindowId})` : '';
      console.log(`[⌨️] Dispatched key "${key || 'focus'}" to window ${windowId}${restored}`);

      if (sseClients.size > 0) {
        broadcast(JSON.stringify({ type: 'key_status', windowId: targetWindowId, key: targetKey, stage: 'completed' }));
      }
      setTimeout(pollAndBroadcast, 150);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      if (targetWindowId && sseClients.size > 0) {
        broadcast(JSON.stringify({ type: 'key_status', windowId: targetWindowId, key: targetKey, stage: 'error', error: err.message }));
      }
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

function pollAndBroadcast() {
  const current = fetchTerminalState();
  const hash = computeStateHash(current);

  if (hash !== lastStateHash) {
    lastStateHash = hash;
    lastStateJson = JSON.stringify(current);

    if (sseClients.size > 0) {
      const winCount = current.windows ? current.windows.length : (Array.isArray(current) ? current.length : 0);
      console.log(`[⚡] Window update detected (${winCount} window(s)) -> Broadcasting to ${sseClients.size} client(s)`);
      broadcast(lastStateJson);
    }
  }
}

// Periodic background change detection
const checkTimer = setInterval(pollAndBroadcast, POLL_INTERVAL_MS);

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
  console.log(`Keep-Awake:`);
  console.log(`  • Web Controller: Screen Wake Lock API + Auto Re-arm Active`);
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
