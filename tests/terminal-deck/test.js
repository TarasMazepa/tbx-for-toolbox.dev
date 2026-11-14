#!/usr/bin/env node

const test = require('node:test');
const assert = require('node:assert/strict');
const { detectAgyState } = require('../../tbx-terminal-deck.js');
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
