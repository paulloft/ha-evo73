import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CourierMode } from '../src/CourierMode.js';

test('courier access is consumed before HTTP completes and is isolated per doorphone', async () => {
  const opened: number[] = [];
  let finish: (() => void) | undefined;
  const mode = new CourierMode(async id => {
    opened.push(id);
    await new Promise<void>(resolve => { finish = resolve; });
  });
  assert.equal(mode.isWaiting(1), false);
  mode.setWaiting(1, true);
  mode.setWaiting(2, true);
  const first = mode.handleCall(1);
  assert.equal(mode.isWaiting(1), false);
  assert.equal(mode.isWaiting(2), true);
  await mode.handleCall(1);
  await mode.handleCall(3);
  assert.deepEqual(opened, [1]);
  assert.ok(finish);
  finish();
  await first;
  mode.setWaiting(2, false);
  await mode.handleCall(2);
  assert.deepEqual(opened, [1]);
});

test('failed courier opening does not rearm; explicit rearming permits a new attempt', async () => {
  let attempts = 0;
  const mode = new CourierMode(async () => {
    attempts++;
    throw new Error('Mock opening failure');
  });
  mode.setWaiting(1, true);
  await assert.rejects(mode.handleCall(1), /Mock opening failure/);
  assert.equal(mode.isWaiting(1), false);
  await mode.handleCall(1);
  assert.equal(attempts, 1);
  mode.setWaiting(1, true);
  await assert.rejects(mode.handleCall(1));
  assert.equal(attempts, 2);
});
