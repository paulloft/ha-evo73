import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { registerRoutes } from '../src/Routes.js';
import { createWebserver } from '../src/Webserver.js';
import SecureApi from '../src/Evo/SecureApi.js';
import Storage from '../src/Storage.js';

test('registered application routes preserve device, stream and input validation contracts', async context => {
  const originalPort = process.env.APP_WEBSERVER_PORT;
  process.env.APP_WEBSERVER_PORT = '0';
  context.mock.method(Storage, 'get', () => null);
  let opens = 0;
  context.mock.method(SecureApi, 'getJson', async (url: string) => {
    if (url.endsWith('/camera')) {
      return { channel: { stream_url: 'https://camera.invalid/high', sub_stream_url: 'https://camera.invalid/low' } };
    }
    return { doorphones: [{ id: 123, address: 'Test doorphone' }] };
  });
  context.mock.method(SecureApi, 'postJson', async () => {
    opens++;
    return { status: true };
  });
  const webserver = createWebserver();
  registerRoutes(webserver);
  const server = webserver.start();
  try {
    await once(server, 'listening');
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const info = await (await fetch(`${base}/info`)).json() as { authorized: boolean };
    assert.equal(info.authorized, false);
    assert.equal((await fetch(`${base}/auth`)).status, 400);
    assert.deepEqual(await (await fetch(`${base}/devices`)).json(), { doorphones: [{ id: 123, address: 'Test doorphone', courierWaiting: false }] });
    for (const path of ['/open?deviceId=NaN', '/open?deviceId=123&doorNum=-1']) {
      assert.equal((await fetch(base + path)).status, 400);
    }
    assert.equal(opens, 0);
    assert.deepEqual(await (await fetch(`${base}/open?deviceId=123`)).json(), { status: true });
    assert.equal(opens, 1);
    const stream = await fetch(`${base}/stream?deviceId=123&high=0`, { redirect: 'manual' });
    assert.equal(stream.status, 302);
    assert.equal(stream.headers.get('Location'), 'https://camera.invalid/low');
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (originalPort === undefined) {
      delete process.env.APP_WEBSERVER_PORT;
    } else {
      process.env.APP_WEBSERVER_PORT = originalPort;
    }
  }
});

test('Home Assistant API has stable identity, sanitized devices, POST commands and resumable calls', async context => {
  const { callEvents } = await import('../src/HomeAssistant/CallEvents.js');
  const originalPort = process.env.APP_WEBSERVER_PORT;
  const originalWebhook = process.env.APP_WEBHOOK_URL;
  delete process.env.APP_WEBHOOK_URL;
  process.env.APP_WEBSERVER_PORT = '0';
  const values = new Map<string, string>();
  context.mock.method(Storage, 'get', (key: string) => values.get(key) ?? null);
  context.mock.method(Storage, 'save', (key: string, value: string) => values.set(key, value));
  context.mock.method(SecureApi, 'getJson', async (url: string) => {
    if (url.endsWith('/camera')) {
      return { channel: { stream_url: 'https://camera.invalid/live?token=test' } };
    }
    return { doorphones: [{ id: 123, address: 'Test', apartment: 42, apartment_sip_settings: {
      login: 'private', sip_password: 'secret', sip_address: 'private.invalid',
    } }] };
  });
  const opened: string[] = [];
  context.mock.method(SecureApi, 'postJson', async (url: string) => {
    opened.push(url);
    return { status: true };
  });
  const webserver = createWebserver();
  registerRoutes(webserver);
  const server = webserver.start();
  try {
    await once(server, 'listening');
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    assert.equal((await fetch(`${base}/ha/info`)).status, 401);
    assert.equal((await fetch(`${base}/ha/courier`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: '{"deviceId":123,"enabled":true}',
    })).status, 401);
    values.set('doorphone_token', 'test-only');
    const info = await (await fetch(`${base}/ha/info`)).json() as { instanceId: string; apiVersion: number };
    assert.equal(info.apiVersion, 1);
    assert.ok(info.instanceId);
    assert.deepEqual(await (await fetch(`${base}/ha/info`)).json(), info);
    const devices = await (await fetch(`${base}/ha/devices`)).json();
    assert.deepEqual(devices, { devices: [{ id: 123, address: 'Test', apartment: 42, courierWaiting: false }] });
    const courier = (path: string, body: object) => fetch(`${base}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal((await courier('/ha/courier', { deviceId: 123, enabled: 'false' })).status, 400);
    assert.equal((await courier('/ha/courier', { enabled: true })).status, 400);
    assert.equal((await courier('/ha/courier', { deviceId: 999, enabled: true })).status, 404);
    assert.deepEqual(await (await courier('/ha/courier', { deviceId: 123, enabled: true })).json(), { courierWaiting: true });
    const armed = await (await fetch(`${base}/devices`)).json() as { doorphones: { courierWaiting: boolean }[] };
    assert.equal(armed.doorphones[0].courierWaiting, true);
    const stream = await (await fetch(`${base}/ha/stream?deviceId=123`)).json();
    assert.deepEqual(stream, { url: 'https://camera.invalid/live?token=test' });
    const missing = await fetch(`${base}/ha/open`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(missing.status, 400);
    assert.equal(opened.length, 0);
    const command = await fetch(`${base}/ha/open`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"deviceId":123}' });
    assert.equal(command.status, 200);
    assert.deepEqual(opened, ['doorphone://doorphone/123/open-door/1']);
    const initial = await (await fetch(`${base}/ha/events`)).json() as { cursor: string; events: unknown[] };
    assert.deepEqual(initial.events, []);
    const waiting = fetch(`${base}/ha/events?cursor=${encodeURIComponent(initial.cursor)}`);
    const event = callEvents.publish(123);
    assert.deepEqual(await (await waiting).json(), { cursor: event.id, events: [event] });
    const simulated = await fetch(`${base}/test-webhook?deviceId=123`);
    assert.equal(simulated.status, 200);
    const simulatedEvents = await (await fetch(`${base}/ha/events?cursor=${encodeURIComponent(event.id)}`)).json() as { events: { deviceId: number }[] };
    assert.equal(simulatedEvents.events.length, 1);
    assert.equal(simulatedEvents.events[0].deviceId, 123);
    const afterSimulation = await (await fetch(`${base}/ha/devices`)).json() as { devices: { courierWaiting: boolean }[] };
    assert.equal(afterSimulation.devices[0].courierWaiting, true);
    assert.equal(opened.length, 1);
    assert.deepEqual(await (await courier('/courier', { deviceId: 123, enabled: false })).json(), { courierWaiting: false });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (originalPort === undefined) {
      delete process.env.APP_WEBSERVER_PORT;
    } else {
      process.env.APP_WEBSERVER_PORT = originalPort;
    }
    if (originalWebhook === undefined) {
      delete process.env.APP_WEBHOOK_URL;
    } else {
      process.env.APP_WEBHOOK_URL = originalWebhook;
    }
  }
});
