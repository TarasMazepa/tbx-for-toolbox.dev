#!/usr/bin/env node

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {
  detectAgyState,
  generateQrSvg,
  getHostedPhoneUrl,
  isHostedUrlReachable,
  getDesktopOpenUrl,
} = require('../../path/tbx-terminal-deck.js');
const { SAMPLES } = require('./test-data.js');

for (const sample of SAMPLES) {
  const expectedLabel = sample.userChoice ? 'user choice' : 'not user choice';
  test(`${sample.name} (${expectedLabel})`, () => {
    const result = detectAgyState(
      sample.windowName ?? 'agy',
      sample.text,
      sample.cols
    );
    assert.equal(
      result.actionRequired,
      sample.userChoice,
      `Expected actionRequired=${sample.userChoice} (${expectedLabel}), got ${result.actionRequired} (status=${result.status})`
    );
  });
}

test('getDesktopOpenUrl selects hosted URL when reachable and not preferLocal', () => {
  assert.equal(
    getDesktopOpenUrl({ port: 9001, hostedUrl: 'https://tbx-for-toolbox.dev/terminal-deck/', hostedReachable: true }),
    'https://tbx-for-toolbox.dev/terminal-deck/?host=http%3A%2F%2Flocalhost%3A9001&qr=1'
  );
  assert.equal(
    getDesktopOpenUrl({ port: 9001, hostedUrl: 'https://tbx-for-toolbox.dev/terminal-deck/', hostedReachable: false }),
    'http://localhost:9001/?qr=1'
  );
  assert.equal(
    getDesktopOpenUrl({ port: 9001, hostedUrl: 'https://tbx-for-toolbox.dev/terminal-deck/', preferLocal: true, hostedReachable: true }),
    'http://localhost:9001/?qr=1&local=1'
  );
});

test('isHostedUrlReachable checks HTTP status and handles unreachable URLs', async () => {
  let statusToReturn = 200;
  const server = http.createServer((req, res) => {
    res.writeHead(statusToReturn);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/terminal-deck/`;

  try {
    assert.equal(await isHostedUrlReachable(baseUrl, 1000), true);
    statusToReturn = 404;
    assert.equal(await isHostedUrlReachable(baseUrl, 1000), false);
    assert.equal(await isHostedUrlReachable('http://127.0.0.1:1/unreachable', 300), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('getHostedPhoneUrl returns hosted URL with LAN host param for mobile QR', () => {
  assert.equal(
    getHostedPhoneUrl('192.168.1.50', 8999),
    'https://tbx-for-toolbox.dev/terminal-deck/?host=http%3A%2F%2F192.168.1.50%3A8999'
  );
  assert.equal(
    getHostedPhoneUrl('10.0.0.12', 9001),
    'https://tbx-for-toolbox.dev/terminal-deck/?host=http%3A%2F%2F10.0.0.12%3A9001'
  );
});

test('generateQrSvg renders a valid SVG QR code for hosted URL', () => {
  const svg = generateQrSvg('https://tbx-for-toolbox.dev/terminal-deck/?host=http%3A%2F%2F192.168.1.50%3A8999');
  assert.ok(svg && svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.includes('viewBox="0 0 '));
  assert.ok(svg.includes('<rect x="2" y="2" width="1" height="1"'));
  assert.ok(svg.endsWith('</svg>'));
});

test('detectAgyState detects navigation prompt within the last 3 meaningful lines', () => {
  const textWithTwoTrailingStatusLines = [
    'Requesting permission for:',
    '   stax status',
    'Run this command?',
    '> 1. Yes, run command',
    '  2. No, cancel',
    '',
    '  ↑/↓ Navigate · tab Amend · ctrl+g edit/expand command',
    'esc to cancel                                                                   auto · Gemini 4 Argon · low',
    '~/tbx-for-toolbox.dev (main)                                                                        context: 12%',
  ].join('\n');

  const result = detectAgyState('agy', textWithTwoTrailingStatusLines, 113);
  assert.equal(result.actionRequired, true);
  assert.equal(result.status, 'action_required');
});
