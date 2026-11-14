#!/usr/bin/env node

/**
 * tbx-terminal-deck.js
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
const fs = require('fs');
const path = require('path');
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
const NO_SLEEP_MP4_BASE64 = 'AAAAHGZ0eXBNNFYgAAACAGlzb21pc28yYXZjMQAAAAhmcmVlAAAGF21kYXTeBAAAbGliZmFhYyAxLjI4AABCAJMgBDIARwAAArEGBf//rdxF6b3m2Ui3lizYINkj7u94MjY0IC0gY29yZSAxNDIgcjIgOTU2YzhkOCAtIEguMjY0L01QRUctNCBBVkMgY29kZWMgLSBDb3B5bGVmdCAyMDAzLTIwMTQgLSBodHRwOi8vd3d3LnZpZGVvbGFuLm9yZy94MjY0Lmh0bWwgLSBvcHRpb25zOiBjYWJhYz0wIHJlZj0zIGRlYmxvY2s9MTowOjAgYW5hbHlzZT0weDE6MHgxMTEgbWU9aGV4IHN1Ym1lPTcgcHN5PTEgcHN5X3JkPTEuMDA6MC4wMCBtaXhlZF9yZWY9MSBtZV9yYW5nZT0xNiBjaHJvbWFfbWU9MSB0cmVsbGlzPTEgOHg4ZGN0PTAgY3FtPTAgZGVhZHpvbmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9LTIgdGhyZWFkcz02IGxvb2thaGVhZF90aHJlYWRzPTEgc2xpY2VkX3RocmVhZHM9MCBucj0wIGRlY2ltYXRlPTEgaW50ZXJsYWNlZD0wIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MCB3ZWlnaHRwPTAga2V5aW50PTI1MCBrZXlpbnRfbWluPTI1IHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCB2YnZfbWF4cmF0ZT03NjggdmJ2X2J1ZnNpemU9MzAwMCBjcmZfbWF4PTAuMCBuYWxfaHJkPW5vbmUgZmlsbGVyPTAgaXBfcmF0aW89MS40MCBhcT0xOjEuMDAAgAAAAFZliIQL8mKAAKvMnJycnJycnJycnXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXiEASZACGQAjgCEASZACGQAjgAAAAAdBmjgX4GSAIQBJkAIZACOAAAAAB0GaVAX4GSAhAEmQAhkAI4AhAEmQAhkAI4AAAAAGQZpgL8DJIQBJkAIZACOAIQBJkAIZACOAAAAABkGagC/AySEASZACGQAjgAAAAAZBmqAvwMkhAEmQAhkAI4AhAEmQAhkAI4AAAAAGQZrAL8DJIQBJkAIZACOAAAAABkGa4C/AySEASZACGQAjgCEASZACGQAjgAAAAAZBmwAvwMkhAEmQAhkAI4AAAAAGQZsgL8DJIQBJkAIZACOAIQBJkAIZACOAAAAABkGbQC/AySEASZACGQAjgCEASZACGQAjgAAAAAZBm2AvwMkhAEmQAhkAI4AAAAAGQZuAL8DJIQBJkAIZACOAIQBJkAIZACOAAAAABkGboC/AySEASZACGQAjgAAAAAZBm8AvwMkhAEmQAhkAI4AhAEmQAhkAI4AAAAAGQZvgL8DJIQBJkAIZACOAAAAABkGaAC/AySEASZACGQAjgCEASZACGQAjgAAAAAZBmiAvwMkhAEmQAhkAI4AhAEmQAhkAI4AAAAAGQZpAL8DJIQBJkAIZACOAAAAABkGaYC/AySEASZACGQAjgCEASZACGQAjgAAAAAZBmoAvwMkhAEmQAhkAI4AAAAAGQZqgL8DJIQBJkAIZACOAIQBJkAIZACOAAAAABkGawC/AySEASZACGQAjgAAAAAZBmuAvwMkhAEmQAhkAI4AhAEmQAhkAI4AAAAAGQZsAL8DJIQBJkAIZACOAAAAABkGbIC/AySEASZACGQAjgCEASZACGQAjgAAAAAZBm0AvwMkhAEmQAhkAI4AhAEmQAhkAI4AAAAAGQZtgL8DJIQBJkAIZACOAAAAABkGbgCvAySEASZACGQAjgCEASZACGQAjgAAAAAZBm6AnwMkhAEmQAhkAI4AhAEmQAhkAI4AhAEmQAhkAI4AhAEmQAhkAI4AAAAhubW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAABDcAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAzB0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAA+kAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAALAAAACQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAPpAAAAAAABAAAAAAKobWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAB1MAAAdU5VxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAACU21pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAhNzdGJsAAAAr3N0c2QAAAAAAAAAAQAAAJ9hdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAALAAkABIAAAASAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGP//AAAALWF2Y0MBQsAN/+EAFWdCwA3ZAsTsBEAAAPpAADqYA8UKkgEABWjLg8sgAAAAHHV1aWRraEDyXyRPxbo5pRvPAyPzAAAAAAAAABhzdHRzAAAAAAAAAAEAAAAeAAAD6QAAABRzdHNzAAAAAAAAAAEAAAABAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAABAAAAAQAAAIxzdHN6AAAAAAAAAAAAAAAeAAADDwAAAAsAAAALAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAAiHN0Y28AAAAAAAAAHgAAAEYAAANnAAADewAAA5gAAAO0AAADxwAAA+MAAAP2AAAEEgAABCUAAARBAAAEXQAABHAAAASMAAAEnwAABLsAAATOAAAE6gAABQYAAAUZAAAFNQAABUgAAAVkAAAFdwAABZMAAAWmAAAFwgAABd4AAAXxAAAGDQAABGh0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAACAAAAAAAABDcAAAAAAAAAAAAAAAEBAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAQkAAADcAABAAAAAAPgbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAC7gAAAykBVxAAAAAAALWhkbHIAAAAAAAAAAHNvdW4AAAAAAAAAAAAAAABTb3VuZEhhbmRsZXIAAAADi21pbmYAAAAQc21oZAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAADT3N0YmwAAABnc3RzZAAAAAAAAAABAAAAV21wNGEAAAAAAAAAAQAAAAAAAAAAAAIAEAAAAAC7gAAAAAAAM2VzZHMAAAAAA4CAgCIAAgAEgICAFEAVBbjYAAu4AAAADcoFgICAAhGQBoCAgAECAAAAIHN0dHMAAAAAAAAAAgAAADIAAAQAAAAAAQAAAkAAAAFUc3RzYwAAAAAAAAAbAAAAAQAAAAEAAAABAAAAAgAAAAIAAAABAAAAAwAAAAEAAAABAAAABAAAAAIAAAABAAAABgAAAAEAAAABAAAABwAAAAIAAAABAAAACAAAAAEAAAABAAAACQAAAAIAAAABAAAACgAAAAEAAAABAAAACwAAAAIAAAABAAAADQAAAAEAAAABAAAADgAAAAIAAAABAAAADwAAAAEAAAABAAAAEAAAAAIAAAABAAAAEQAAAAEAAAABAAAAEgAAAAIAAAABAAAAFAAAAAEAAAABAAAAFQAAAAIAAAABAAAAFgAAAAEAAAABAAAAFwAAAAIAAAABAAAAGAAAAAEAAAABAAAAGQAAAAIAAAABAAAAGgAAAAEAAAABAAAAGwAAAAIAAAABAAAAHQAAAAEAAAABAAAAHgAAAAIAAAABAAAAHwAAAAQAAAABAAAA4HN0c3oAAAAAAAAAAAAAADMAAAAaAAAACQAAAAkAAAAJAAAACQAAAAkAAAAJAAAACQAAAAkAAAAJAAAACQAAAAkAAAAJAAAACQAAAAkAAAAJAAAACQAAAAkAAAAJAAAACQAAAAkAAAAJAAAACQAAAAkAAAAJAAAACQAAAAkAAAAJAAAACQAAAAkAAAAJAAAACQAAAAkAAAAJAAAACQAAAAkAAAAJAAAACQAAAAkAAAAJAAAACQAAAAkAAAAJAAAACQAAAAkAAAAJAAAACQAAAAkAAAAJAAAACQAAAAkAAACMc3RjbwAAAAAAAAAfAAAALAAAA1UAAANyAAADhgAAA6IAAAO+AAAD0QAAA+0AAAQAAAAEHAAABC8AAARLAAAEZwAABHoAAASWAAAEqQAABMUAAATYAAAE9AAABRAAAAUjAAAFPwAABVIAAAVuAAAFgQAABZ0AAAWwAAAFzAAABegAAAX7AAAGFwAAAGJ1ZHRhAAAAWm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALWlsc3QAAAAlqXRvbwAAAB1kYXRhAAAAAQAAAABMYXZmNTUuMzMuMTAw';
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

  // Check for Antigravity's interactive navigation prompt in the last two meaningful lines,
  // excluding input autocomplete popups (e.g. "↑/↓ Navigate · enter Select · tab Complete")
  const isActionRequired = meaningful
    .slice(-2)
    .some(line => !line.includes('tab Complete') && line.includes('↑/↓ Navigate'));

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

    let focusConfirmed = false;
    ${code !== null ? `
    // 2. Poll until Terminal is frontmost and target window is index 1 (up to 500ms)
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        const curFront = sys.processes.whose({ frontmost: true })[0];
        const curFrontName = curFront ? curFront.name() : null;
        const targetWin = terminal.windows.byId(${windowId});
        if (curFrontName === "Terminal" && targetWin && targetWin.index() === 1) {
          focusConfirmed = true;
          break;
        }
        terminal.activate();
        targetWin.index = 1;
      } catch(e) {}
      delay(0.025);
    }

    if (focusConfirmed) {
      // Allow macOS Window Server to settle focus on target window before keystroke
      delay(0.12);

      // 3. Dispatch keystroke
      sys.keyCode(${code});

      // 4. Brief pause to ensure the key event is queued/consumed before focus switch
      delay(0.08);
    }
    ` : 'focusConfirmed = true;'}

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
      success: focusConfirmed,
      error: focusConfirmed ? null : "Target window did not gain focus before keystroke",
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

  const parsed = JSON.parse(out.trim());
  if (!parsed.success) {
    throw new Error(parsed.error || `Failed to focus window ${windowId}`);
  }
  return parsed;
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
    preview: w.name.includes('tbx-terminal-deck') ? '' : w.preview
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
const HTML_APP_PATH = path.join(__dirname, 'website', 'terminal-deck', 'index.html');
function getHtmlApp() {
  return fs.readFileSync(HTML_APP_PATH, 'utf8');
}

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
    res.end(getHtmlApp());
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

module.exports = {
  detectAgyState,
};

if (require.main === module) {
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
}
