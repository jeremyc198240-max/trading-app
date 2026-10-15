import assert from 'node:assert/strict';
import { estimateZeroDtePremiumReturn } from '../server/historicalBacktest';

const favorableCall = estimateZeroDtePremiumReturn({
  entrySpot: 100,
  exitSpot: 100.5,
  strike: 100,
  entryMinutesToExpiry: 300,
  exitMinutesToExpiry: 270,
  annualizedVolatility: 0.3,
  direction: 'CALL',
});
const flatCall = estimateZeroDtePremiumReturn({
  entrySpot: 100,
  exitSpot: 100,
  strike: 100,
  entryMinutesToExpiry: 300,
  exitMinutesToExpiry: 120,
  annualizedVolatility: 0.3,
  direction: 'CALL',
});
const adversePut = estimateZeroDtePremiumReturn({
  entrySpot: 100,
  exitSpot: 100.5,
  strike: 100,
  entryMinutesToExpiry: 300,
  exitMinutesToExpiry: 270,
  annualizedVolatility: 0.3,
  direction: 'PUT',
});

assert.ok(favorableCall > 0, `Expected favorable call to profit, received ${favorableCall}`);
assert.ok(flatCall < 0, `Expected flat 0DTE call to lose from theta/friction, received ${flatCall}`);
assert.ok(adversePut < 0, `Expected adverse put to lose, received ${adversePut}`);

console.log(JSON.stringify({ favorableCall, flatCall, adversePut }, null, 2));