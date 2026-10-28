import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import SipAgent from '../src/SipAgent.js';
import SecureApi from '../src/Evo/SecureApi.js';
import Storage from '../src/Storage.js';
import Logger from '../src/Logger.js';
import SipRequest from '../src/Sip/Messages/SipRequest.js';
import SipResponse from '../src/Sip/Messages/SipResponse.js';
import { getHeader } from '../src/Sip/Types.js';
import type { Doorphone } from '../src/Types.js';
import { sipServer, responseFor, invite, waitUntil } from './sip-fixture.js';
import { callEvents } from '../src/HomeAssistant/CallEvents.js';
import { courierMode } from '../src/CourierMode.js';

const originalWebhook = process.env.APP_WEBHOOK_URL;
let errors: string[];
beforeEach(() => {
  process.env.APP_WEBHOOK_URL = 'http://webhook.invalid/notify';
  mock.method(Storage, 'get', (key: string) => key === 'doorphone_token' ? 'test-token' : null);
  mock.method(Logger, 'info', () => {});
  errors = [];
  mock.method(Logger, 'error', (...args: unknown[]) => { errors.push(String(args[0])); });
});
afterEach(() => {
  courierMode.setWaiting(123, false);
  SipAgent.stop();
  mock.restoreAll();
  if (originalWebhook === undefined) delete process.env.APP_WEBHOOK_URL;
  else process.env.APP_WEBHOOK_URL = originalWebhook;
});

test('SIP starts without a webhook and delivers one Home Assistant event per call', async context => {
  delete process.env.APP_WEBHOOK_URL;
  context.mock.method(globalThis, 'fetch', () => {
    throw new Error('No HTTP webhook should be sent');
  });
  let registrations = 0;
  let opens = 0;
  let finishOpening: (() => void) | undefined;
  context.mock.method(SecureApi, 'postJson', async (url: string) => {
    assert.equal(url, 'doorphone://doorphone/123/open-door/1');
    opens++;
    await new Promise<void>(resolve => { finishOpening = resolve; });
    return { status: true };
  });
  const server = await sipServer((message, peer) => {
    if (message instanceof SipRequest && message.method === 'REGISTER') {
      registrations++;
      peer.write(responseFor(message).toString());
    }
  });
  context.mock.method(SecureApi, 'getJson', async () => ({ doorphones: [{
    id: 123, address: 'Test', apartment_sip_settings: {
      login: 'user@account.domain', sip_password: 'test', sip_address: `127.0.0.1:${server.port}`,
    },
  }] }));
  try {
    const signal = new AbortController().signal;
    const initial = await callEvents.poll(null, signal);
    SipAgent.start();
    await waitUntil(() => registrations === 1);
    courierMode.setWaiting(123, true);
    const peer = [...server.connections][0];
    peer.write(invite('ha-call').toString() + invite('ha-call').toString());
    const batch = await callEvents.poll(initial.cursor, signal);
    assert.equal(batch.events.length, 1);
    assert.equal(batch.events[0].deviceId, 123);
    assert.equal(opens, 1);
    assert.equal(courierMode.isWaiting(123), false);
    // Rearming must not let retransmissions of the previous call consume permission.
    courierMode.setWaiting(123, true);
    peer.write(invite('ha-call').toString());
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal((await callEvents.poll(initial.cursor, signal)).events.length, 1);
    assert.equal(opens, 1);
    assert.equal(courierMode.isWaiting(123), true);
    finishOpening?.();
    courierMode.setWaiting(123, false);
    peer.write(invite('later-call').toString());
    const later = await callEvents.poll(batch.cursor, AbortSignal.timeout(2000));
    assert.equal(later.events.length, 1);
    assert.equal(opens, 1);
    assert.equal(errors.length, 0);
  } finally {
    finishOpening?.();
    SipAgent.stop();
    await server.close();
  }
});

test('failed initial device loading retries without another external start call', { timeout: 8000 }, async () => {
  let attempts = 0;
  mock.method(SecureApi, 'getJson', async () => {
    if (++attempts === 1) throw new Error('Temporary API outage');
    return { doorphones: [] };
  });
  SipAgent.start();
  await waitUntil(() => attempts === 2, 6500);
});

test('webhook rejection is caught, retransmissions do not duplicate it, and later calls still notify', async () => {
  let registrations = 0;
  let opens = 0;
  mock.method(SecureApi, 'postJson', async () => {
    opens++;
    throw new Error('Mock opening failure');
  });
  courierMode.setWaiting(123, true);
  const server = await sipServer((message, peer) => {
    if (message instanceof SipRequest && message.method === 'REGISTER') {
      registrations++;
      peer.write(responseFor(message).toString());
    }
  });
  const doorphone: Doorphone = { id: 123, address: 'Test address', apartment: 1, apartment_sip_settings: {
    login: 'user@account.domain', sip_password: 'test-only', sip_address: `127.0.0.1:${server.port}`,
  } };
  const notifications: unknown[] = [];
  mock.method(globalThis, 'fetch', async (request: Request) => {
    assert.equal(request.url, 'http://webhook.invalid/notify');
    notifications.push(await request.json());
    return new Response('{}', { status: notifications.length === 1 ? 503 : 200 });
  });
  try {
    SipAgent.connectSocket(doorphone);
    await waitUntil(() => registrations === 1);
    const peer = [...server.connections][0];
    peer.write(invite('first').toString() + invite('first').toString());
    await waitUntil(() => notifications.length === 1);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(notifications.length, 1);
    assert.equal(opens, 1);
    assert.equal(courierMode.isWaiting(123), false);
    assert.ok(errors.some(message => message.includes('webhook failed')));
    assert.ok(errors.some(message => message.includes('door opening failed')));
    peer.write(invite('second').toString());
    await waitUntil(() => notifications.length === 2);
    assert.equal(opens, 1);
    assert.equal((notifications[1] as { address: string }).address, 'Test address');
    assert.equal(registrations, 1);
  } finally { SipAgent.stop(); await server.close(); }
});

test('stopping while device loading is pending cannot create new SIP connections afterward', async () => {
  let resolveDevices: ((devices: { doorphones: Doorphone[] }) => void) | undefined;
  const pending = new Promise<{ doorphones: Doorphone[] }>(resolve => { resolveDevices = resolve; });
  mock.method(SecureApi, 'getJson', () => pending);
  let registrations = 0;
  const server = await sipServer(() => { registrations++; });
  try {
    SipAgent.start();
    SipAgent.stop();
    assert.ok(resolveDevices);
    resolveDevices({ doorphones: [{ id: 1, address: 'Test', apartment_sip_settings: {
      login: 'user@account.domain', sip_password: 'test-only', sip_address: `127.0.0.1:${server.port}`,
    } }] });
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(server.connections.size, 0);
    assert.equal(registrations, 0);
  } finally { await server.close(); }
});

test('one call sends one webhook even while HTTP is pending and after replacing the SIP client', async () => {
  let registrations = 0;
  const server = await sipServer((message, peer) => {
    if (message instanceof SipRequest && message.method === 'REGISTER') {
      registrations++;
      peer.write(responseFor(message).toString());
    }
  });
  const device: Doorphone = { id: 123, address: 'First doorphone', apartment_sip_settings: {
    login: 'user@account.domain', sip_password: 'first-password', sip_address: `127.0.0.1:${server.port}`,
  } };
  const notifications: unknown[] = [];
  const pending: (() => void)[] = [];
  mock.method(globalThis, 'fetch', async (request: Request) => {
    notifications.push(await request.json());
    await new Promise<void>(resolve => pending.push(resolve));
    return new Response('{}');
  });
  const ringingCount = () => server.messages.filter(message => message instanceof SipResponse
    && message.statusCode === 180 && getHeader(message.headers, 'Call-ID') === 'same-call').length;
  try {
    SipAgent.connectSocket(device);
    await waitUntil(() => registrations === 1);
    const firstPeer = [...server.connections][0];
    // Retransmissions and re-INVITEs can change CSeq/Via without starting a new call.
    firstPeer.write(Array.from({ length: 20 }, (_, index) => {
      const request = invite('same-call');
      request.headers.CSeq = `${index + 1} INVITE`;
      request.headers.Via = `SIP/2.0/TCP host;branch=z9hG4bK${index}`;
      return request.toString();
    }).join(''));
    await waitUntil(() => ringingCount() === 20 && notifications.length === 1);
    SipAgent.connectSocket({ ...device, apartment_sip_settings: { ...device.apartment_sip_settings!, sip_password: 'rotated-password' } });
    await waitUntil(() => registrations === 2);
    const replacement = [...server.connections].find(peer => peer !== firstPeer)!;
    replacement.write(invite('same-call').toString());
    await waitUntil(() => ringingCount() === 21);
    assert.equal(notifications.length, 1);
    // A separate call must notify even while the previous webhook is pending.
    replacement.write(invite('next-call').toString());
    await waitUntil(() => notifications.length === 2);
    // Call-ID deduplication must not silence another doorphone.
    const peers = new Set(server.connections);
    SipAgent.connectSocket({ ...device, id: 456, address: 'Second doorphone' });
    await waitUntil(() => registrations === 3);
    const otherPeer = [...server.connections].find(peer => !peers.has(peer))!;
    otherPeer.write(invite('same-call').toString());
    await waitUntil(() => notifications.length === 3);
    assert.equal((notifications[2] as { address: string }).address, 'Second doorphone');
  } finally {
    pending.forEach(resolve => resolve());
    SipAgent.stop();
    await server.close();
  }
});
