import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveTrainingLabelFromOutcome } from './compressionAiEngine.js';

test('derives a positive label from a hit outcome even when the raw outcome is pending', () => {
  const label = deriveTrainingLabelFromOutcome(
    {
      outcome: 'pending',
      prepareOutcome: 'hit',
      outcomeReason: 'target_reached',
      priceDeltaPct: 0.042,
      priceAtCapture: 100,
      targets: [102],
      stopLoss: 97,
      maxPriceSeen: 104,
      minPriceSeen: 99,
    },
    {
      priceDeltaPct: 0.042,
      priceAtCapture: 100,
      targets: [102],
      stopLoss: 97,
      maxPriceSeen: 104,
      minPriceSeen: 99,
    },
  );

  assert.equal(label, 1);
});

test('derives a negative label from a stop-out outcome even when the text is ambiguous', () => {
  const label = deriveTrainingLabelFromOutcome(
    {
      outcome: 'pending',
      prepareOutcome: 'missed',
      outcomeReason: 'stopped_out',
      priceDeltaPct: -0.035,
      priceAtCapture: 100,
      targets: [103],
      stopLoss: 98,
      maxPriceSeen: 101,
      minPriceSeen: 96,
    },
    {
      priceDeltaPct: -0.035,
      priceAtCapture: 100,
      targets: [103],
      stopLoss: 98,
      maxPriceSeen: 101,
      minPriceSeen: 96,
    },
  );

  assert.equal(label, 0);
});
