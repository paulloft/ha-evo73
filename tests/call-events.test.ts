import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CallEvents } from '../src/HomeAssistant/CallEvents.js';

test('call polling skips historical calls at first connection and resumes a bounded journal', async () => {
  const journal = new CallEvents(2, 10);
  const signal = new AbortController().signal;
  journal.publish(1);
  const initial = await journal.poll(null, signal);
  assert.deepEqual(initial.events, []);
  const second = journal.publish(2);
  const third = journal.publish(3);
  const batch = await journal.poll(initial.cursor, signal);
  assert.deepEqual(batch.events, [second, third]);
  assert.equal(batch.cursor, third.id);
  const restarted = await new CallEvents().poll(batch.cursor, signal);
  assert.deepEqual(restarted.events, []);
  assert.notEqual(restarted.cursor, batch.cursor);
});

test('call polling wakes all subscribers once and releases requests on abort or timeout', async () => {
  const journal = new CallEvents(2, 10);
  const controller = new AbortController();
  const initial = await journal.poll(null, controller.signal);
  const first = journal.poll(initial.cursor, controller.signal);
  const second = journal.poll(initial.cursor, controller.signal);
  const event = journal.publish(123);
  for (const pending of [first, second]) {
    assert.deepEqual((await pending).events, [event]);
  }
  const waiting = journal.poll(event.id, controller.signal);
  controller.abort();
  assert.deepEqual((await waiting).events, []);
  const timedOut = await journal.poll(event.id, new AbortController().signal);
  assert.deepEqual(timedOut, { cursor: event.id, events: [] });
  assert.throws(() => journal.poll('invalid', controller.signal), /курсор/);
});
