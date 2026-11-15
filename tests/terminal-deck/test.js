#!/usr/bin/env node

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {
  detectAgyState,
  isHostedUrlReachable,
  getDesktopOpenUrl,
} = require('../../tbx-terminal-deck.js');
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
