import { test } from 'node:test';
import assert from 'node:assert/strict';
import SipRequest from '../src/Sip/Messages/SipRequest.js';
import SipResponse from '../src/Sip/Messages/SipResponse.js';
import SipSocket from '../src/Sip/SipSocket.js';
import SipClient from '../src/Sip/SipClient.js';
import { createAuthRequest, createRegisterRequest } from '../src/Sip/Messages/RequestMessages.js';
import { createOkResponse } from '../src/Sip/Messages/ResponseMessages.js';
import { getHeader, getHeaderValues } from '../src/Sip/Types.js';
import type { SipConfig, ClientOptions } from '../src/Sip/Types.js';
import { sipServer, responseFor, invite, waitUntil } from './sip-fixture.js';

const config = (): SipConfig => ({ username: 'user', password: 'test-only', serverHost: '127.0.0.1', serverPort: 5070, clientIp: '127.0.0.1', clientPort: 1234 });
const options = (port: number): ClientOptions => ({ username: 'user', password: 'test-only', login: 'user@account.domain', serverHost: '127.0.0.1', serverPort: port, reconnectDelayMs: 15, requestTimeoutMs: 80, refreshIntervalMs: 10000 });

test('SIP messages preserve Via headers, CSeq, compact header names and UTF-8 body length', () => {
  const body = 'Привет\r\n\r\nмир';
  const request = new SipRequest({ method: 'INVITE', requestUri: 'sip:user@localhost', headers: { Via: ['SIP/2.0/TCP first', 'SIP/2.0/TCP second'], CSeq: '42 INVITE', From: 'sip:first', To: 'sip:second' }, body });
  const wire = request.toString();
  assert.equal(wire.match(/^Via:/gm)?.length, 2);
  assert.ok(wire.includes(`Content-Length: ${Buffer.byteLength(body)}`));
  const parsed = SipRequest.parse(wire);
  assert.equal(parsed.id, '42 INVITE');
  assert.equal(parsed.body, body);
  assert.deepEqual(getHeaderValues(parsed.headers, 'Via'), ['SIP/2.0/TCP first', 'SIP/2.0/TCP second']);
  assert.equal(SipResponse.parse(createOkResponse(parsed).toString()).statusCode, 200);
  const compact = SipRequest.parse('INVITE sip:user SIP/2.0\r\nv:SIP/2.0/TCP host\r\ni:call\r\ncseq:1 INVITE\r\nf:<sip:door>\r\nt:<sip:user>\r\nl:0\r\n\r\n');
  assert.equal(getHeader(compact.headers, 'Call-ID'), 'call');
  assert.equal(getHeader(compact.headers, 'From'), '<sip:door>');
});

test('REGISTER refreshes keep one Call-ID and From tag and increase CSeq through digest authentication', () => {
  const settings = config();
  const first = createRegisterRequest(settings);
  const challenge = responseFor(first, 401, { 'WWW-Authenticate': 'Digest realm="test", nonce="abc", algorithm=MD5' });
  const authenticated = createAuthRequest(settings, first, challenge);
  const refreshed = createRegisterRequest(settings);
  for (const request of [authenticated, refreshed]) {
    assert.equal(request.headers['Call-ID'], first.headers['Call-ID']);
    assert.equal(request.headers.From, first.headers.From);
    assert.match(String(request.headers.Contact), /;transport=tcp>/);
    assert.equal(request.headers.Expires, 300);
  }
  assert.equal(first.id, '1 REGISTER');
  assert.equal(authenticated.id, '2 REGISTER');
  assert.equal(refreshed.id, '3 REGISTER');
  assert.match(String(authenticated.headers.Authorization), /^Digest /);
});

test('TCP transport assembles fragmented UTF-8 bodies and coalesced frames and ignores unrelated responses', async () => {
  const server = await sipServer((message, peer) => {
    if (!(message instanceof SipRequest)) return;
    const response = responseFor(message);
    const wrong = new SipResponse({ headers: { CSeq: message.id, 'Call-ID': 'wrong-call' }, statusCode: 403 });
    const incoming = new SipRequest({ method: 'MESSAGE', requestUri: 'sip:user', headers: { CSeq: '9 MESSAGE', 'Call-ID': 'message' }, body: 'Привет' });
    const frames = Buffer.from(incoming.toString() + invite('options', 'OPTIONS').toString() + response.toString());
    peer.write(wrong.toString());
    const split = frames.indexOf(Buffer.from('Привет')) + 1;
    peer.write(frames.subarray(0, split));
    setTimeout(() => peer.write(frames.subarray(split)), 5);
  });
  const socket = new SipSocket('127.0.0.1', server.port, '127.0.0.1', 0);
  const requests: SipRequest[] = [];
  socket.on('request', request => requests.push(request));
  try {
    const response = await socket.fetch(createRegisterRequest(config()));
    assert.equal(response.statusCode, 200);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].body, 'Привет');
    assert.equal(requests[1].method, 'OPTIONS');
  } finally { socket.close(); await server.close(); }
});

test('a rejected initial REGISTER retries automatically even without a remote close', async () => {
  let attempts = 0;
  let registered = 0;
  const server = await sipServer((message, peer) => {
    if (message instanceof SipRequest && message.method === 'REGISTER') peer.write(responseFor(message, ++attempts === 1 ? 403 : 200).toString());
  });
  const client = SipClient(options(server.port));
  client.on('register', () => registered++);
  try {
    await assert.rejects(client.register(), /403/);
    await waitUntil(() => registered === 1);
    assert.equal(attempts, 2);
    const requests = server.messages.filter(message => message instanceof SipRequest);
    assert.equal(getHeader(requests[0].headers, 'Call-ID'), getHeader(requests[1].headers, 'Call-ID'));
    assert.match(getHeader(requests[0].headers, 'From'), /^<sip:user@account\.domain>;tag=.+$/);
    assert.ok(!String(requests[1].headers.Contact).includes(':0;'));
  } finally { client.stop(); await server.close(); }
});

test('a refresh timeout reconnects and re-registers, and concurrent register calls share one transaction', async () => {
  let attempts = 0;
  let registered = 0;
  const server = await sipServer((message, peer) => {
    if (message instanceof SipRequest && message.method === 'REGISTER' && ++attempts !== 2) peer.write(responseFor(message).toString());
  });
  const client = SipClient({ ...options(server.port), refreshIntervalMs: 60 });
  client.on('register', () => registered++);
  try {
    const first = client.register();
    assert.equal(client.register(), first);
    await first;
    await waitUntil(() => registered === 2);
    assert.equal(attempts, 3);
    client.stop();
    const stoppedAt = attempts;
    await new Promise(resolve => setTimeout(resolve, 120));
    assert.equal(attempts, stoppedAt);
  } finally { client.stop(); await server.close(); }
});

test('remote TCP disconnects trigger recovery and simultaneous clients use separate OS-selected ports', async () => {
  const ports = new Set<number>();
  const server = await sipServer((message, peer) => {
    if (message instanceof SipRequest && message.method === 'REGISTER') {
      ports.add(peer.remotePort!);
      peer.write(responseFor(message).toString());
    }
  });
  const first = SipClient(options(server.port));
  const second = SipClient(options(server.port));
  let registrations = 0;
  first.on('register', () => registrations++);
  second.on('register', () => registrations++);
  try {
    await Promise.all([first.register(), second.register()]);
    assert.equal(ports.size, 2);
    for (const peer of server.connections) peer.destroy();
    await waitUntil(() => registrations === 4);
    assert.equal(server.connections.size, 2);
  } finally { first.stop(); second.stop(); await server.close(); }
});

test('INVITE during digest registration rings without answering, deduplicates notifications, and handles CANCEL/ACK', async () => {
  const outgoing: SipResponse[] = [];
  const server = await sipServer((message, peer) => {
    if (message instanceof SipResponse) { outgoing.push(message); return; }
    if (message.method !== 'REGISTER') return;
    if (!getHeader(message.headers, 'Authorization')) {
      const challenge = responseFor(message, 401, { 'WWW-Authenticate': 'Digest realm="test", nonce="abc", algorithm=MD5' });
      peer.write(challenge.toString() + invite('incoming').toString() + invite('incoming').toString() + invite('probe', 'OPTIONS').toString());
    } else peer.write(responseFor(message).toString());
  });
  const client = SipClient(options(server.port));
  let notifications = 0;
  client.on('invite', () => notifications++);
  try {
    await client.register();
    await waitUntil(() => outgoing.length === 3);
    assert.equal(notifications, 1);
    const ringing = outgoing.filter(response => response.statusCode === 180);
    assert.equal(ringing.length, 2);
    assert.equal(getHeader(ringing[0].headers, 'To'), getHeader(ringing[1].headers, 'To'));
    assert.deepEqual(getHeaderValues(ringing[0].headers, 'Record-Route'), ['<sip:proxy1;lr>', '<sip:proxy2;lr>']);
    assert.ok(!outgoing.some(response => response.statusCode === 200 && getHeader(response.headers, 'CSeq').endsWith('INVITE')));
    const peer = [...server.connections][0];
    peer.write(invite('incoming', 'CANCEL').toString());
    await waitUntil(() => outgoing.length === 5);
    assert.ok(outgoing.some(response => response.statusCode === 487 && getHeader(response.headers, 'CSeq') === '42 INVITE'));
    peer.write(invite('incoming', 'ACK').toString());
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(outgoing.length, 5);
  } finally { client.stop(); await server.close(); }
});

test('registration renews before the server-granted expiry instead of waiting a fixed interval', async () => {
  let attempts = 0;
  const server = await sipServer((message, peer) => {
    if (message instanceof SipRequest && message.method === 'REGISTER') {
      attempts++;
      peer.write(responseFor(message, 200, {
        Expires: '300',
        Contact: ['<sip:other@127.0.0.1:9999;transport=tcp>;expires=3600', `${getHeader(message.headers, 'Contact')};expires=1`],
      }).toString());
    }
  });
  const client = SipClient(options(server.port));
  try {
    await client.register();
    await waitUntil(() => attempts === 2, 1000);
  } finally { client.stop(); await server.close(); }
});


test('stop during TCP connection establishment cancels registration and all retries', async () => {
  let registrations = 0;
  const server = await sipServer(message => {
    if (message instanceof SipRequest && message.method === 'REGISTER') registrations++;
  });
  const client = SipClient(options(server.port));
  try {
    const attempt = client.register();
    client.stop();
    await assert.rejects(attempt);
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(registrations, 0);
    assert.equal(server.connections.size, 0);
  } finally { client.stop(); await server.close(); }
});
