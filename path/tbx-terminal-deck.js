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
const https = require('https');
const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, execFile } = require('child_process');
const crypto = require('crypto');
const { StringDecoder } = require('string_decoder');


/**
 * Minimal self-contained QR Code (EC Level L, Byte Mode, Versions 1-10) SVG generator for /qr.svg.
 */
function generateQrSvg(text) {
  const bytes = Buffer.from(String(text), 'utf8');
  // EC Level L RS specs: [version, [[count, dataBytes], ...], ecBytesPerBlock, alignCenters]
  const QR_SPECS = [
    [1, [[1, 19]], 7, []],
    [2, [[1, 34]], 10, [6, 18]],
    [3, [[1, 55]], 15, [6, 22]],
    [4, [[1, 80]], 20, [6, 26]],
    [5, [[1, 108]], 26, [6, 30]],
    [6, [[2, 68]], 18, [6, 34]],
    [7, [[2, 78]], 20, [6, 22, 38]],
    [8, [[2, 97]], 24, [6, 24, 42]],
    [9, [[2, 116]], 30, [6, 26, 46]],
    [10, [[2, 68], [2, 69]], 18, [6, 28, 50]],
  ];

  let spec = null;
  for (const s of QR_SPECS) {
    const totalData = s[1].reduce((sum, [cnt, d]) => sum + cnt * d, 0);
    const headerBits = 4 + (s[0] <= 9 ? 8 : 16);
    if (headerBits + bytes.length * 8 <= totalData * 8) {
      spec = s;
      break;
    }
  }
  if (!spec) return null;

  const [version, groupDefs, ecLen, alignCenters] = spec;
  const totalDataBytes = groupDefs.reduce((sum, [cnt, d]) => sum + cnt * d, 0);

  // Build bit stream: Byte mode (0100) + length + payload + terminator + padding
  const bits = [];
  const pushBits = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  pushBits(0b0100, 4);
  pushBits(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) pushBits(b, 8);
  for (let i = 0; i < 4 && bits.length < totalDataBytes * 8; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);
  const dataBytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    dataBytes.push(v);
  }
  const padBytes = [0xec, 0x11];
  for (let i = 0; dataBytes.length < totalDataBytes; i++) {
    dataBytes.push(padBytes[i % 2]);
  }

  // GF(256) arithmetic for Reed-Solomon
  const exp = new Uint8Array(512);
  const log = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) {
    exp[i] = x;
    log[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) exp[i] = exp[i - 255];

  const rsPoly = (degree) => {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(poly.length + 1).fill(0);
      const factor = exp[i];
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= poly[j] === 0 ? 0 : exp[(log[poly[j]] + log[factor]) % 255];
      }
      poly = next;
    }
    return poly;
  };

  const rsCompute = (data, gen) => {
    const res = new Uint8Array(data.length + gen.length - 1);
    res.set(data);
    for (let i = 0; i < data.length; i++) {
      const coef = res[i];
      if (coef !== 0) {
        for (let j = 0; j < gen.length; j++) {
          if (gen[j] !== 0) {
            res[i + j] ^= exp[(log[coef] + log[gen[j]]) % 255];
          }
        }
      }
    }
    return res.slice(data.length);
  };

  const gen = rsPoly(ecLen);
  const dataBlocks = [];
  const ecBlocks = [];
  let offset = 0;
  for (const [cnt, dLen] of groupDefs) {
    for (let i = 0; i < cnt; i++) {
      const block = dataBytes.slice(offset, offset + dLen);
      offset += dLen;
      dataBlocks.push(block);
      ecBlocks.push(rsCompute(block, gen));
    }
  }

  // Interleave data and EC codewords
  const codewords = [];
  const maxDataLen = Math.max(...dataBlocks.map(b => b.length));
  for (let i = 0; i < maxDataLen; i++) {
    for (const b of dataBlocks) if (i < b.length) codewords.push(b[i]);
  }
  for (let i = 0; i < ecLen; i++) {
    for (const b of ecBlocks) codewords.push(b[i]);
  }

  const size = version * 4 + 17;
  const createGrid = () => Array.from({ length: size }, () => new Int8Array(size).fill(-1));
  const placeFinder = (grid, r0, c0) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = r0 + dr;
        const c = c0 + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const onEdge = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const inCore = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        const inFrame = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        grid[r][c] = inFrame && (onEdge || inCore) ? 1 : 0;
      }
    }
  };

  const setupBase = () => {
    const grid = createGrid();
    placeFinder(grid, 0, 0);
    placeFinder(grid, 0, size - 7);
    placeFinder(grid, size - 7, 0);
    for (const r of alignCenters) {
      for (const c of alignCenters) {
        if (grid[r][c] !== -1) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            grid[r + dr][c + dc] =
              Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0) ? 1 : 0;
          }
        }
      }
    }
    for (let i = 8; i < size - 8; i++) {
      if (grid[i][6] === -1) grid[i][6] = i % 2 === 0 ? 1 : 0;
      if (grid[6][i] === -1) grid[6][i] = i % 2 === 0 ? 1 : 0;
    }
    grid[size - 8][8] = 1;
    // Reserve format info cells
    for (let i = 0; i < 9; i++) {
      if (i !== 6) {
        if (grid[8][i] === -1) grid[8][i] = 0;
        if (grid[i][8] === -1) grid[i][8] = 0;
      }
    }
    for (let i = 0; i < 8; i++) {
      if (grid[8][size - 1 - i] === -1) grid[8][size - 1 - i] = 0;
      if (i < 7 && grid[size - 1 - i][8] === -1) grid[size - 1 - i][8] = 0;
    }
    // Version info for >= 7
    if (version >= 7) {
      let rem = version << 12;
      for (let i = 5; i >= 0; i--) {
        if ((rem >>> (i + 12)) & 1) rem ^= 0x1f25 << i;
      }
      const vBits = (version << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const bit = (vBits >>> i) & 1;
        const a = Math.floor(i / 3);
        const b = size - 11 + (i % 3);
        grid[a][b] = bit;
        grid[b][a] = bit;
      }
    }
    return grid;
  };

  const baseGrid = setupBase();
  const isDataCell = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (__, c) => baseGrid[r][c] === -1)
  );

  // Place data bits in zigzag
  let bitIdx = 0;
  let dir = -1;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let step = 0; step < size; step++) {
      const row = dir === -1 ? size - 1 - step : step;
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc;
        if (isDataCell[row][c]) {
          const byteIdx = bitIdx >>> 3;
          const bit = byteIdx < codewords.length ? (codewords[byteIdx] >>> (7 - (bitIdx & 7))) & 1 : 0;
          baseGrid[row][c] = bit;
          bitIdx++;
        }
      }
    }
    dir = -dir;
  }

  const maskFns = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (_, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];

  const applyMaskAndFormat = (maskIdx) => {
    const grid = baseGrid.map(row => new Int8Array(row));
    const fn = maskFns[maskIdx];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (isDataCell[r][c] && fn(r, c)) grid[r][c] ^= 1;
      }
    }
    const fmtData = (0b01 << 3) | maskIdx; // EC level L = 01
    let rem = fmtData << 10;
    for (let i = 4; i >= 0; i--) {
      if ((rem >>> (i + 10)) & 1) rem ^= 0x537 << i;
    }
    const fmt = ((fmtData << 10) | rem) ^ 0x5412;
    for (let i = 0; i < 15; i++) {
      const bit = (fmt >>> i) & 1;
      if (i < 6) grid[i][8] = bit;
      else if (i < 8) grid[i + 1][8] = bit;
      else grid[size - 15 + i][8] = bit;

      if (i < 8) grid[8][size - 1 - i] = bit;
      else if (i < 9) grid[8][15 - i] = bit;
      else grid[8][14 - i] = bit;
    }
    return grid;
  };

  const penalty = (grid) => {
    let score = 0;
    for (let r = 0; r < size; r++) {
      let run = 1;
      for (let c = 1; c < size; c++) {
        if (grid[r][c] === grid[r][c - 1]) {
          run++;
          if (run === 5) score += 3;
          else if (run > 5) score += 1;
        } else {
          run = 1;
        }
      }
    }
    for (let c = 0; c < size; c++) {
      let run = 1;
      for (let r = 1; r < size; r++) {
        if (grid[r][c] === grid[r - 1][c]) {
          run++;
          if (run === 5) score += 3;
          else if (run > 5) score += 1;
        } else {
          run = 1;
        }
      }
    }
    for (let r = 0; r < size - 1; r++) {
      for (let c = 0; c < size - 1; c++) {
        const v = grid[r][c];
        if (v === grid[r][c + 1] && v === grid[r + 1][c] && v === grid[r + 1][c + 1]) score += 3;
      }
    }
    return score;
  };

  let bestGrid = null;
  let bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    const g = applyMaskAndFormat(m);
    const s = penalty(g);
    if (s < bestScore) {
      bestScore = s;
      bestGrid = g;
    }
  }

  const quiet = 2;
  const viewSize = size + quiet * 2;
  const rects = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (bestGrid[r][c]) {
        rects.push(`<rect x="${c + quiet}" y="${r + quiet}" width="1" height="1" fill="#0f172a"/>`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}" shape-rendering="crispEdges"><rect width="${viewSize}" height="${viewSize}" fill="#ffffff"/>${rects.join('')}</svg>`;
}

const PORT = parseInt(process.env.PORT || '8999', 10);
const POLL_INTERVAL_MS = 120;
const JXA_POLL_INTERVAL_MS = 1200;
const HOSTED_URL = 'https://tbx-for-toolbox.dev/terminal-deck/';
const API_VERSION = 1;

function getServerCommitInfo() {
  try {
    const out = execFileSync('git', ['-C', __dirname, 'show', '-s', '--format=%ct:%h', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1000
    }).trim();
    const [tsStr, shortSha] = out.split(':');
    const ts = /^\d+$/.test(tsStr) ? parseInt(tsStr, 10) : null;
    return { timestamp: ts, short: shortSha || null };
  } catch (_) {
    return { timestamp: null, short: null };
  }
}
const SERVER_COMMIT_INFO = getServerCommitInfo();
let latestRepoCommitInfo = { ...SERVER_COMMIT_INFO };
const REPO_COMMIT_CHECK_INTERVAL_MS = 30000;

function refreshRepoCommitInfo() {
  const next = getServerCommitInfo();
  const changed = next.timestamp !== latestRepoCommitInfo.timestamp || next.short !== latestRepoCommitInfo.short;
  if (changed) {
    latestRepoCommitInfo = next;
  }
  return changed;
}

/**
 * Build the hosted Terminal Deck URL with the ?host= parameter pointing to this daemon's LAN address.
 */
function getHostedPhoneUrl(localIp = getLocalIp(), port = PORT) {
  const hostUrl = `http://${localIp}:${port}`;
  return `${HOSTED_URL}?host=${encodeURIComponent(hostUrl)}`;
}

/**
 * Check whether the hosted Terminal Deck URL responds with 2xx/3xx within timeoutMs.
 */
function isHostedUrlReachable(targetUrl = HOSTED_URL, timeoutMs = 1500) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    try {
      const parsed = new URL(targetUrl);
      const client = parsed.protocol === 'https:' ? https : http;
      const req = client.request(
        parsed,
        { method: 'HEAD', timeout: timeoutMs },
        (res) => {
          res.resume();
          finish(res.statusCode >= 200 && res.statusCode < 400);
        }
      );
      req.on('timeout', () => {
        req.destroy();
        finish(false);
      });
      req.on('error', () => finish(false));
      req.end();
    } catch (e) {
      finish(false);
    }
  });
}

/**
 * Build the desktop browser URL to open on startup.
 */
function getDesktopOpenUrl({ port = PORT, hostedUrl = HOSTED_URL, preferLocal = false, hostedReachable = false } = {}) {
  const localOrigin = `http://localhost:${port}`;
  if (preferLocal) {
    return `${localOrigin}/?qr=1&local=1`;
  }
  if (hostedReachable) {
    return `${hostedUrl}?host=${encodeURIComponent(localOrigin)}&qr=1`;
  }
  return `${localOrigin}/?qr=1`;
}

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

const KITTY_KEYS = {
  enter: 'enter',
  return: 'enter',
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
  esc: 'escape',
  escape: 'escape',
  space: 'space',
  tab: 'tab',
  y: 'y',
  n: 'n'
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

  // 1b. Query CoreGraphics window list for Kitty OS window geometry keyed by CGWindowID (fast & exact)
  const kittyCGWindows = [];
  try {
    ObjC.import("CoreGraphics");
    const ref = $.CGWindowListCopyWindowInfo($.kCGWindowListOptionAll, $.kCGNullWindowID);
    const cgList = ObjC.deepUnwrap(ObjC.castRefToObject(ref));
    if (Array.isArray(cgList)) {
      for (let i = 0; i < cgList.length; i++) {
        const w = cgList[i];
        if (w.kCGWindowOwnerName !== "kitty" || w.kCGWindowLayer !== 0) continue;
        const b = w.kCGWindowBounds;
        if (!b || !(b.Width > 0) || !(b.Height > 0)) continue;
        kittyCGWindows.push({
          id: w.kCGWindowNumber,
          position: { x: Math.round(b.X), y: Math.round(b.Y) },
          size: { width: Math.round(b.Width), height: Math.round(b.Height) },
          onScreen: Boolean(w.kCGWindowIsOnscreen)
        });
      }
    }
  } catch(e) {}

  const terminal = Application("Terminal");
  if (!terminal.running()) return JSON.stringify({ windows: [], displays: displays, kittyWindows: kittyCGWindows });
  
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
    return JSON.stringify({ windows: [], displays: displays, kittyWindows: kittyCGWindows });
  }
  
  if (!ids || !ids.length) return JSON.stringify({ windows: [], displays: displays, kittyWindows: kittyCGWindows });

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
        preview = nonEmpty.slice(-60).join("\\n");
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
  return JSON.stringify({ windows: results, displays: displays, kittyWindows: kittyCGWindows });
})()
`.trim();

/**
 * Clean terminal preview text by removing runs of 2+ '-' or '─' characters,
 * collapsing consecutive whitespace into a single space, and keeping the last 50 non-empty lines.
 */
function formatPreviewText(text) {
  if (!text) return '';
  return text
    .split(/\r?\n/)
    .map(line => line.replace(/[-─]{2,}/g, '').replace(/[^\S\n]{2,}/g, ' ').trim())
    .filter(line => line.length > 0)
    .slice(-50)
    .join('\n');
}

const kittySocketByName = new Map();

/**
 * Discover active Kitty remote-control Unix sockets in /tmp (e.g. /tmp/kitty-sock-<pid>).
 */
function getKittySockets() {
  const sockets = [];
  const seen = new Set();

  const envSock = process.env.KITTY_LISTEN_ON;
  if (envSock && envSock.startsWith('unix:')) {
    const sockPath = envSock.slice(5);
    if (fs.existsSync(sockPath)) {
      seen.add(sockPath);
      sockets.push(envSock);
      kittySocketByName.set(path.basename(sockPath), envSock);
    }
  }

  try {
    for (const entry of fs.readdirSync('/tmp')) {
      if (!entry.startsWith('kitty-sock')) continue;
      const fullPath = path.join('/tmp', entry);
      if (seen.has(fullPath)) continue;
      try {
        if (fs.statSync(fullPath).isSocket()) {
          seen.add(fullPath);
          const sock = `unix:${fullPath}`;
          sockets.push(sock);
          kittySocketByName.set(entry, sock);
        }
      } catch (_) {}
    }
  } catch (_) {}

  return sockets;
}

const KITTY_DCS_PREFIX = '\x1bP@kitty-cmd';
const KITTY_DCS_SUFFIX = '\x1b\\';

/**
 * Send a remote-control command directly to a Kitty Unix socket without spawning `kitten`.
 */
function kittySocketCommand(sock, cmd, payload = {}, timeoutMs = 800) {
  const sockPath = sock.startsWith('unix:') ? sock.slice(5) : sock;
  return new Promise((resolve, reject) => {
    let settled = false;
    const client = net.createConnection(sockPath);
    const decoder = new StringDecoder('utf8');
    let buf = '';

    const finish = (err, data) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.destroy();
      if (err) reject(err);
      else resolve(data);
    };

    const timer = setTimeout(() => finish(new Error(`Kitty socket timeout (${cmd})`)), timeoutMs);

    client.on('connect', () => {
      const msg = JSON.stringify({ cmd, version: [0, 35, 0], no_response: false, payload });
      client.write(`${KITTY_DCS_PREFIX}${msg}${KITTY_DCS_SUFFIX}`);
    });

    client.on('data', (chunk) => {
      buf += decoder.write(chunk);
      const start = buf.indexOf(KITTY_DCS_PREFIX);
      if (start === -1) return;
      const end = buf.indexOf(KITTY_DCS_SUFFIX, start + KITTY_DCS_PREFIX.length);
      if (end === -1) return;

      try {
        const json = JSON.parse(buf.slice(start + KITTY_DCS_PREFIX.length, end));
        if (!json.ok) {
          finish(new Error(json.error || `Kitty command failed: ${cmd}`));
        } else {
          finish(null, json.data);
        }
      } catch (err) {
        finish(err);
      }
    });

    client.on('error', (err) => finish(err));
    client.on('end', () => finish(new Error(`Kitty socket closed before response (${cmd})`)));
  });
}

/**
 * Query Kitty windows, active tab panes, and screen text directly over Kitty Unix sockets,
 * matching each OS window to its macOS CoreGraphics window geometry by platform_window_id.
 */
async function fetchKittyWindows(kittyCGWindows = []) {
  const sockets = getKittySockets();
  if (!sockets.length) return [];

  const cgById = new Map();
  for (const w of kittyCGWindows) {
    if (typeof w.id === 'number') cgById.set(w.id, w);
  }

  const shellNames = new Set(['zsh', 'bash', 'fish', 'sh', '-zsh', '-bash', '-fish', 'login']);
  const socketResults = await Promise.all(sockets.map(async (sock) => {
    const sockName = path.basename(sock.replace(/^unix:/, ''));
    let osWindows = [];
    try {
      const raw = await kittySocketCommand(sock, 'ls', {}, 1000);
      osWindows = JSON.parse(String(raw).trim());
    } catch (_) {
      return [];
    }

    if (!Array.isArray(osWindows)) return [];

    const paneTasks = [];
    for (let osIdx = 0; osIdx < osWindows.length; osIdx++) {
      const osWin = osWindows[osIdx];
      const tabs = Array.isArray(osWin.tabs) ? osWin.tabs : [];
      const activeTab = tabs.find(t => t.is_focused || t.is_active) || tabs[0] || null;
      const panes = activeTab && Array.isArray(activeTab.windows) ? activeTab.windows : [];
      if (!panes.length) continue;

      const cgWin = typeof osWin.platform_window_id === 'number' ? cgById.get(osWin.platform_window_id) : null;
      if (cgById.size > 0 && (!cgWin || !cgWin.onScreen)) {
        continue;
      }

      const basePos = cgWin ? cgWin.position : { x: 0, y: 0 };
      const baseSize = cgWin ? cgWin.size : { width: 800, height: 600 };
      const paneWidth = Math.max(100, Math.round(baseSize.width / panes.length));

      for (let pIdx = 0; pIdx < panes.length; pIdx++) {
        const pane = panes[pIdx];
        paneTasks.push((async () => {
          let preview = '';
          let analysis = '';
          try {
            const text = await kittySocketCommand(sock, 'get-text', {
              match: `id:${pane.id}`,
              extent: 'screen'
            }, 800);
            if (text) {
              const nonEmpty = String(text).split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
              analysis = nonEmpty.slice(-14).join('\n');
              preview = nonEmpty.slice(-60).join('\n');
            }
          } catch (_) {}

          const fgProcs = Array.isArray(pane.foreground_processes) ? pane.foreground_processes : [];
          const busy = fgProcs.some(p => {
            const cmd = Array.isArray(p.cmdline) && p.cmdline[0] ? path.basename(p.cmdline[0]) : '';
            return cmd && !shellNames.has(cmd);
          });
          const paneCwd = (fgProcs.find(p => p && p.cwd) || {}).cwd || pane.cwd || '';
          const folderName = paneCwd ? (path.basename(paneCwd) || paneCwd) : '';
          const titlePart = pane.title || activeTab.title || `kitty #${pane.id}`;
          const sizePart = pane.columns && pane.lines ? `${pane.columns}×${pane.lines}` : '';
          const nameParts = [];
          if (folderName) nameParts.push(folderName);
          if (titlePart && titlePart !== folderName) nameParts.push(titlePart);
          if (sizePart) nameParts.push(sizePart);

          return {
            id: `kitty:${sockName}:${pane.id}`,
            name: nameParts.join(' — ') || `kitty #${pane.id}`,
            index: osWin.is_focused && pane.is_focused ? 1 : osIdx + 2,
            position: {
              x: basePos.x + (pIdx * paneWidth),
              y: basePos.y
            },
            size: {
              width: panes.length === 1 ? baseSize.width : paneWidth,
              height: baseSize.height
            },
            cols: pane.columns || null,
            rows: pane.lines || null,
            tty: null,
            busy,
            preview,
            analysis
          };
        })());
      }
    }

    return Promise.all(paneTasks);
  }));

  return socketResults.flat();
}

let lastJxaResult = { rawTerminalWindows: [], displays: [], sysKittyWindows: [] };
let lastJxaFetchAt = 0;

/**
 * Query Terminal.app windows, displays, and Kitty CoreGraphics bounds asynchronously via JXA,
 * caching results for JXA_POLL_INTERVAL_MS so fast Kitty socket polling isn't bottlenecked.
 */
function fetchJxaState(force = false) {
  const now = Date.now();
  if (!force && lastJxaFetchAt > 0 && (now - lastJxaFetchAt) < JXA_POLL_INTERVAL_MS) {
    return Promise.resolve(lastJxaResult);
  }

  return new Promise((resolve, reject) => {
    execFile('osascript', ['-l', 'JavaScript', '-e', JXA_FETCH_SCRIPT], {
      encoding: 'utf8',
      timeout: 2500
    }, (err, stdout) => {
      if (err) {
        if (lastJxaFetchAt > 0) return resolve(lastJxaResult);
        return reject(err);
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        lastJxaResult = {
          rawTerminalWindows: Array.isArray(parsed) ? parsed : (parsed && parsed.windows ? parsed.windows : []),
          displays: Array.isArray(parsed) ? [] : (parsed && parsed.displays ? parsed.displays : []),
          sysKittyWindows: Array.isArray(parsed) ? [] : (parsed && parsed.kittyWindows ? parsed.kittyWindows : [])
        };
        lastJxaFetchAt = Date.now();
        resolve(lastJxaResult);
      } catch (parseErr) {
        if (lastJxaFetchAt > 0) return resolve(lastJxaResult);
        reject(parseErr);
      }
    });
  });
}

/**
 * Query current Terminal.app & Kitty windows and multi-monitor display state
 */
async function fetchTerminalState({ forceJxa = false } = {}) {
  try {
    const { rawTerminalWindows, displays, sysKittyWindows } = await fetchJxaState(forceJxa);
    const rawKittyWindows = await fetchKittyWindows(sysKittyWindows);
    const rawWindows = [...rawTerminalWindows, ...rawKittyWindows];

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
      const state = {
        apiVersion: API_VERSION,
        commitTimestamp: SERVER_COMMIT_INFO.timestamp,
        commitShort: SERVER_COMMIT_INFO.short,
        repoCommitTimestamp: latestRepoCommitInfo.timestamp,
        repoCommitShort: latestRepoCommitInfo.short,
        windows: enriched,
        displays: displays
      };
      lastKnownGoodState = state;
      return state;
    }
    return lastKnownGoodState && lastKnownGoodState.windows && lastKnownGoodState.windows.length
      ? lastKnownGoodState
      : { apiVersion: API_VERSION, commitTimestamp: SERVER_COMMIT_INFO.timestamp, commitShort: SERVER_COMMIT_INFO.short, repoCommitTimestamp: latestRepoCommitInfo.timestamp, repoCommitShort: latestRepoCommitInfo.short, windows: [], displays: displays };
  } catch (err) {
    return lastKnownGoodState && lastKnownGoodState.windows
      ? lastKnownGoodState
      : { apiVersion: API_VERSION, commitTimestamp: SERVER_COMMIT_INFO.timestamp, commitShort: SERVER_COMMIT_INFO.short, repoCommitTimestamp: latestRepoCommitInfo.timestamp, repoCommitShort: latestRepoCommitInfo.short, windows: [], displays: [] };
  }
}

/**
 * Focus or send a key directly to a Kitty window via `kitten @` without stealing OS focus.
 */
function injectKittyKey(windowId, key) {
  const normalizedKey = key ? key.toLowerCase().trim() : 'focus';
  const parts = String(windowId).split(':');
  // Expected format: kitty:<sockName>:<paneId>
  if (parts.length !== 3 || parts[0] !== 'kitty') {
    throw new Error(`Invalid Kitty windowId: "${windowId}"`);
  }
  const sock = kittySocketByName.get(parts[1]) || `unix:/tmp/${parts[1]}`;
  const paneId = parts[2];

  if (normalizedKey === 'focus') {
    execFileSync('kitten', ['@', '--to', sock, 'focus-window', '--match', `id:${paneId}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1500
    });
    execFileSync('osascript', ['-e', 'tell application "kitty" to activate'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1500
    });
    return {
      success: true,
      focusLost: false,
      focusConfirmed: true,
      windowId,
      key: 'focus',
      restoredFocus: false
    };
  }

  const kittyKey = KITTY_KEYS[normalizedKey];
  if (!kittyKey) {
    throw new Error(`Unsupported key: "${key}". Supported: ${Object.keys(KITTY_KEYS).join(', ')}, focus`);
  }

  execFileSync('kitten', ['@', '--to', sock, 'send-key', '--match', `id:${paneId}`, kittyKey], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 1500
  });

  return {
    success: true,
    focusLost: false,
    focusConfirmed: true,
    windowId,
    key: normalizedKey,
    restoredFocus: false
  };
}

/**
 * Focus window, inject keystroke with settlement delay, and automatically restore previous focus
 */
function injectKey(windowId, key) {
  if (typeof windowId === 'string' && windowId.startsWith('kitty:')) {
    return injectKittyKey(windowId, key);
  }

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

    const alreadyFocused = frontAppName === "Terminal" && prevWindowId === ${windowId};

    // 1. Focus target window (skip if already focused)
    if (!alreadyFocused) {
      terminal.activate();
      try {
        terminal.windows.byId(${windowId}).index = 1;
      } catch(e) {}
    }

    let focusConfirmed = alreadyFocused;
    ${code !== null ? `
    if (!alreadyFocused) {
      // 2. Wait for Terminal to become frontmost and target window to reach index 1 (up to 400ms)
      for (let attempt = 0; attempt < 16; attempt++) {
        try {
          const isTerminalFront = terminal.frontmost();
          const targetWin = terminal.windows.byId(${windowId});
          if (isTerminalFront && targetWin && targetWin.index() === 1) {
            focusConfirmed = true;
            break;
          }
        } catch(e) {}
        delay(0.025);
      }

      // Allow macOS Window Server to settle focus on target window before keystroke
      delay(0.15);
    }

    // Re-verify target window still has focus right before dispatching keystroke
    let stillFocused = false;
    try {
      const isTerminalFront = terminal.frontmost();
      const targetWin = terminal.windows.byId(${windowId});
      stillFocused = !!(isTerminalFront && targetWin && targetWin.index() === 1);
    } catch(e) {}

    let keyDispatched = false;
    if (stillFocused) {
      // 3. Dispatch keystroke
      sys.keyCode(${code});
      keyDispatched = true;

      if (!alreadyFocused) {
        // 4. Brief pause to ensure the key event is queued/consumed before focus switch
        delay(0.08);
      }
    } else {
      focusConfirmed = false;
    }
    ` : 'focusConfirmed = true; const keyDispatched = true;'}

    // 5. Automatically restore focus back if this was a keystroke and focus changed
    ${!isExplicitFocus ? `
    if (!alreadyFocused && keyDispatched) {
      try {
        if (frontAppName && frontAppName !== "Terminal") {
          Application(frontAppName).activate();
        } else if (prevWindowId && prevWindowId !== ${windowId}) {
          terminal.windows.byId(prevWindowId).index = 1;
          terminal.activate();
        }
      } catch(e) {}
    }
    ` : ''}

    JSON.stringify({
      success: keyDispatched,
      focusLost: !keyDispatched,
      focusConfirmed: focusConfirmed,
      windowId: ${windowId},
      key: "${normalizedKey}",
      frontAppName: frontAppName,
      prevWindowId: prevWindowId,
      restoredFocus: ${!isExplicitFocus} && keyDispatched
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
    preview: w.name.includes('tbx-terminal-deck') ? '' : w.preview
  }));
  const payload = {
    windows: normalized,
    repoCommitTimestamp: state && state.repoCommitTimestamp ? state.repoCommitTimestamp : null,
    repoCommitShort: state && state.repoCommitShort ? state.repoCommitShort : null
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
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
const HTML_APP_PATH = path.join(__dirname, '..', 'website', 'terminal-deck', 'index.html');
function getHtmlApp() {
  let html = fs.readFileSync(HTML_APP_PATH, 'utf8');
  if (SERVER_COMMIT_INFO.timestamp !== null) {
    html = html
      .replace(/__COMMIT_TIMESTAMP__/g, String(SERVER_COMMIT_INFO.timestamp))
      .replace(/__COMMIT_SHORT__/g, SERVER_COMMIT_INFO.short || '');
  }
  return html;
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

  // Endpoint: GET /info (Daemon connection URLs & API version for QR onboarding and host switching)
  if (url.pathname === '/info' && req.method === 'GET') {
    const localIp = getLocalIp();
    const hostname = os.hostname();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      apiVersion: API_VERSION,
      commitTimestamp: SERVER_COMMIT_INFO.timestamp,
      commitShort: SERVER_COMMIT_INFO.short,
      repoCommitTimestamp: latestRepoCommitInfo.timestamp,
      repoCommitShort: latestRepoCommitInfo.short,
      hostname,
      port: PORT,
      localUrl: `http://localhost:${PORT}`,
      phoneUrl: getHostedPhoneUrl(localIp),
      lanUrl: `http://${localIp}:${PORT}`,
      mdnsUrl: `http://${hostname}:${PORT}`,
    }));
    return;
  }

  // Endpoint: GET /qr.svg (SVG QR code pointing to hosted Terminal Deck with LAN host param)
  if (url.pathname === '/qr.svg' && req.method === 'GET') {
    const svg = generateQrSvg(getHostedPhoneUrl());
    if (!svg) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('QR generator unavailable');
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
    res.end(svg);
    return;
  }

  // Endpoint: GET /terminals (JSON snapshot)
  if (url.pathname === '/terminals' && req.method === 'GET') {
    const terminals = await fetchTerminalState({ forceJxa: true });
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

    sseClients.add(res);
    console.log(`[+] Client connected to /events (${sseClients.size} active)`);
    ensurePolling();

    // Send immediate initial state
    const current = await fetchTerminalState({ forceJxa: true });
    if (!res.destroyed && sseClients.has(res)) {
      res.write(`data: ${JSON.stringify(current)}\n\n`);
    }

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

      targetWindowId = typeof windowId === 'number'
        ? windowId
        : (/^\d+$/.test(String(windowId)) ? parseInt(windowId, 10) : String(windowId));
      targetKey = key || 'focus';
      if (sseClients.size > 0) {
        broadcast(JSON.stringify({ type: 'key_status', windowId: targetWindowId, key: targetKey, stage: 'started' }));
      }

      const result = injectKey(windowId, key);
      if (!result.success) {
        console.log(`[⚠️] Focus lost before dispatching key "${key || 'focus'}" to window ${windowId}`);
        if (sseClients.size > 0) {
          broadcast(JSON.stringify({ type: 'key_status', windowId: targetWindowId, key: targetKey, stage: 'error', error: 'Focus lost before keystroke' }));
        }
        setTimeout(() => pollAndBroadcast({ forceJxa: true }), 150);
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      const restored = result.restoredFocus ? ` (restored focus to ${result.frontAppName || 'window ' + result.prevWindowId})` : '';
      console.log(`[⌨️] Dispatched key "${key || 'focus'}" to window ${windowId}${restored}`);

      if (sseClients.size > 0) {
        broadcast(JSON.stringify({ type: 'key_status', windowId: targetWindowId, key: targetKey, stage: 'completed' }));
      }
      setTimeout(() => pollAndBroadcast({ forceJxa: true }), 150);

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

let pollTimer = null;
let pollInFlight = false;

async function pollAndBroadcast({ forceJxa = false } = {}) {
  if (pollInFlight) return;
  pollInFlight = true;
  try {
    const current = await fetchTerminalState({ forceJxa });
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
  } finally {
    pollInFlight = false;
  }
}

async function pollLoop() {
  pollTimer = null;
  if (sseClients.size === 0) return;
  await pollAndBroadcast();
  if (sseClients.size > 0) {
    pollTimer = setTimeout(pollLoop, POLL_INTERVAL_MS);
  }
}

function ensurePolling() {
  if (pollTimer === null && sseClients.size > 0) {
    pollTimer = setTimeout(pollLoop, POLL_INTERVAL_MS);
  }
}

module.exports = {
  API_VERSION,
  detectAgyState,
  generateQrSvg,
  getHostedPhoneUrl,
  isHostedUrlReachable,
  getDesktopOpenUrl,
  kittySocketCommand,
};

if (require.main === module) {
  // Periodic background repo commit check (only broadcasts when SSE clients are connected)
  const repoCommitTimer = setInterval(() => {
    if (refreshRepoCommitInfo() && sseClients.size > 0) {
      pollAndBroadcast();
    }
  }, REPO_COMMIT_CHECK_INTERVAL_MS);

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
    const phoneUrl = getHostedPhoneUrl(localIp);

    console.log(`\n======================================================`);
    console.log(`🚀 macOS Terminal Spatial Remote running on port ${PORT}`);
    console.log(`======================================================`);
    console.log(`Local Web App:    http://localhost:${PORT}`);
    console.log(`Phone (QR URL):   ${phoneUrl}`);
    console.log(`Direct LAN URL:   http://${localIp}:${PORT}`);
    console.log(`mDNS Link:        http://${hostname}:${PORT}`);
    console.log(`======================================================`);
    console.log(`Keep-Awake:`);
    console.log(`  • Web Controller: Screen Wake Lock API + Auto Re-arm Active`);
    console.log(`======================================================`);
    console.log(`Endpoints:`);
    console.log(`  • GET  /          -> 100% Spatial Multi-Monitor Controller`);
    console.log(`  • GET  /info      -> Local & LAN connection URLs`);
    console.log(`  • GET  /qr.svg    -> Mobile QR code SVG`);
    console.log(`  • GET  /terminals -> JSON snapshot of open windows`);
    console.log(`  • GET  /events    -> Real-time SSE reactive stream`);
    console.log(`  • POST /api/key   -> Focus window & inject keystroke`);
    console.log(`======================================================\n`);

    const shouldOpen = !process.argv.includes('--no-open') && process.env.TBX_NO_OPEN !== '1';
    if (shouldOpen) {
      const preferLocal = process.argv.includes('--local') || process.env.TBX_LOCAL === '1';
      (async () => {
        const hostedReachable = preferLocal ? false : await isHostedUrlReachable(HOSTED_URL, 1500);
        const desktopUrl = getDesktopOpenUrl({
          port: PORT,
          hostedUrl: HOSTED_URL,
          preferLocal,
          hostedReachable,
        });
        execFile('open', [desktopUrl], () => {});
      })();
    }
  });

  // Clean and instant shutdown on Ctrl+C (SIGINT) or SIGTERM
  function shutdown() {
    console.log('\nShutting down server...');
    if (pollTimer !== null) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    clearInterval(repoCommitTimer);
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
