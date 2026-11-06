import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSocket } from 'node:dgram';
import { once } from 'node:events';
import SipClient from '../src/Sip/SipClient.js';
import SipRequest from '../src/Sip/Messages/SipRequest.js';
import SipResponse from '../src/Sip/Messages/SipResponse.js';
import { createByeRequest } from '../src/Sip/Messages/DialogMessages.js';
import { createInactiveSession } from '../src/Sip/SessionDescription.js';
import { getHeader, getHeaderValues } from '../src/Sip/Types.js';
import { sipServer, invite, responseFor, ackFor, waitUntil } from './sip-fixture.js';

const audioOffer = [
  'v=0', 'o=panel 1 1 IN IP4 192.0.2.1', 's=Call', 'c=IN IP4 192.0.2.1', 't=0 0',
  'm=video 10000 RTP/AVP 96', 'a=rtpmap:96 H264/90000', 'a=sendrecv',
  'm=audio 10002 RTP/AVP 8 101', 'a=rtpmap:8 PCMA/8000', 'a=rtpmap:101 telephone-event/8000',
  'a=fmtp:101 0-16', 'a=sendrecv', '',
].join('\r\n');

test('inactive SDP preserves offered media order, rejects video and never enables audio', async () => {
  const session = await createInactiveSession(audioOffer, '127.0.0.1');
  try {
    assert.match(session.body, /m=video 0 RTP\/AVP 96\r\na=inactive\r\nm=audio [1-9]\d* RTP\/AVP 8 101/);
    assert.match(session.body, /a=rtpmap:8 PCMA\/8000\r\n/);
    assert.match(session.body, /a=fmtp:101 0-16\r\n/);
    assert.equal(session.body.match(/a=inactive/g)?.length, 2);
    assert.ok(!/a=(sendrecv|sendonly|recvonly)/.test(session.body));
    assert.ok(!session.body.includes('192.0.2.1'));
  } finally {
    session.close();
    session.close();
  }
  await assert.rejects(createInactiveSession(audioOffer.replaceAll('RTP/AVP', 'RTP/SAVP'), '127.0.0.1'), /No supported/);
});

test('dialog BYE supports strict routing and has independent local CSeq', () => {
  const request = invite('strict-route');
  request.headers['Record-Route'] = '<sip:strict.example>,<sip:loose.example;lr>';
  const config = { username: 'user', password: 'mock', serverHost: 'proxy', serverPort: 5060, clientIp: '127.0.0.1', clientPort: 5000 };
  const bye = createByeRequest(config, request, '<sip:user@localhost>;tag=local');
  assert.equal(bye.requestUri, 'sip:strict.example');
  assert.deepEqual(getHeaderValues(bye.headers, 'Route'), ['<sip:loose.example;lr>', '<sip:door@localhost;transport=tcp>']);
  assert.equal(getHeader(bye.headers, 'CSeq'), '1 BYE');
});

test('BYE handles its own Digest challenge without changing REGISTER authentication or sequence', async () => {
  const server = await sipServer((message, peer) => {
    if (message instanceof SipResponse) {
      if (message.statusCode === 200) {
        peer.write(ackFor(message).toString());
      }
      return;
    }
    if (message.method === 'REGISTER') {
      peer.write(responseFor(message, getHeader(message.headers, 'Authorization') ? 200 : 401, {
        'WWW-Authenticate': 'Digest realm="registration", nonce="register-nonce", algorithm=MD5, qop="auth"',
      }).toString());
    } else if (message.method === 'BYE') {
      peer.write(responseFor(message, getHeader(message.headers, 'Proxy-Authorization') ? 200 : 407, {
        'Proxy-Authenticate': 'Digest realm="calls", nonce="bye-nonce", algorithm=MD5, qop="auth"',
      }).toString());
    }
  });
  const client = SipClient({ username: 'user', password: 'mock', serverHost: '127.0.0.1', serverPort: server.port });
  const errors: Error[] = [];
  let ended = 0;
  client.on('callError', error => errors.push(error));
  client.on('callEnded', () => { ended++; });
  try {
    await client.register();
    const peer = [...server.connections][0];
    peer.write(invite('digest-call').toString());
    await waitUntil(() => server.messages.some(message => message instanceof SipResponse && message.statusCode === 180));
    client.endCalls();
    await waitUntil(() => ended === 1);
    await client.register();
    const requests = server.messages.filter((message): message is SipRequest => message instanceof SipRequest);
    const byes = requests.filter(request => request.method === 'BYE');
    assert.deepEqual(byes.map(request => getHeader(request.headers, 'CSeq')), ['1 BYE', '2 BYE']);
    assert.match(getHeader(byes[1].headers, 'Proxy-Authorization'), /nonce="bye-nonce"/);
    assert.match(getHeader(byes[1].headers, 'Proxy-Authorization'), /uri="sip:door@localhost;transport=tcp"/);
    const registers = requests.filter(request => request.method === 'REGISTER');
    assert.deepEqual(registers.map(request => getHeader(request.headers, 'CSeq')), ['1 REGISTER', '2 REGISTER', '3 REGISTER', '4 REGISTER']);
    assert.match(getHeader(registers[3].headers, 'Authorization'), /nonce="register-nonce"/);
    assert.ok(registers.every(request => getHeader(request.headers, 'Call-ID') !== 'digest-call'));
    assert.equal(errors.length, 0);
  } finally {
    client.stop();
    await server.close();
  }
});

test('lost ACK causes a bounded BYE attempt; a rejected BYE cannot disable later incoming calls', async () => {
  let byes = 0;
  const server = await sipServer((message, peer) => {
    if (message instanceof SipRequest && message.method === 'REGISTER') {
      peer.write(responseFor(message).toString());
    } else if (message instanceof SipRequest && message.method === 'BYE') {
      byes++;
      peer.write(responseFor(message, 403).toString());
    }
  });
  const client = SipClient({ username: 'user', password: 'mock', serverHost: '127.0.0.1', serverPort: server.port, callAckTimeoutMs: 40 });
  const errors: Error[] = [];
  let calls = 0;
  client.on('callError', error => errors.push(error));
  client.on('invite', () => { calls++; });
  try {
    await client.register();
    const peer = [...server.connections][0];
    peer.write(invite('no-ack').toString());
    await waitUntil(() => calls === 1);
    client.endCalls();
    await waitUntil(() => errors.length === 2);
    assert.equal(byes, 1);
    assert.match(errors[0].message, /ACK timeout/);
    assert.match(errors[1].message, /BYE failed: 403/);
    peer.write(invite('next-call').toString());
    await waitUntil(() => calls === 2);
    assert.equal(server.messages.filter(message => message instanceof SipRequest && message.method === 'REGISTER').length, 1);
  } finally {
    client.stop();
    await server.close();
  }
});

test('200 response is retransmitted until ACK, with the same SDP and one final BYE', async () => {
  const accepted: SipResponse[] = [];
  let byes = 0;
  const server = await sipServer((message, peer) => {
    if (message instanceof SipResponse && message.statusCode === 200) {
      accepted.push(message);
      if (accepted.length === 2) {
        peer.write(ackFor(message).toString());
      }
    } else if (message instanceof SipRequest && message.method === 'REGISTER') {
      peer.write(responseFor(message).toString());
    } else if (message instanceof SipRequest && message.method === 'BYE') {
      byes++;
      peer.write(responseFor(message).toString());
    }
  });
  const client = SipClient({ username: 'user', password: 'mock', serverHost: '127.0.0.1', serverPort: server.port });
  try {
    await client.register();
    [...server.connections][0].write(invite('lost-first-answer').toString());
    await waitUntil(() => server.messages.some(message => message instanceof SipResponse && message.statusCode === 180));
    client.endCalls();
    await waitUntil(() => byes === 1);
    assert.equal(accepted.length, 2);
    assert.equal(accepted[0].toString(), accepted[1].toString());
  } finally {
    client.stop();
    await server.close();
  }
});

test('stopping an answered call releases its media port and cancels the pending hangup timeout', async () => {
  let accepted: SipResponse | undefined;
  let byes = 0;
  const server = await sipServer((message, peer) => {
    if (message instanceof SipRequest && message.method === 'REGISTER') {
      peer.write(responseFor(message).toString());
    } else if (message instanceof SipRequest && message.method === 'BYE') {
      byes++;
    } else if (message instanceof SipResponse && message.statusCode === 200) {
      accepted = message;
    }
  });
  const client = SipClient({ username: 'user', password: 'mock', serverHost: '127.0.0.1', serverPort: server.port, callAckTimeoutMs: 80 });
  try {
    await client.register();
    [...server.connections][0].write(invite('stop-before-ack').toString());
    await waitUntil(() => server.messages.some(message => message instanceof SipResponse && message.statusCode === 180));
    client.endCalls();
    await waitUntil(() => accepted !== undefined);
    assert.ok(accepted);
    const port = Number(/m=audio (\d+)/.exec(accepted.body)?.[1]);
    client.stop();
    const probe = createSocket('udp4');
    probe.bind(port, '127.0.0.1');
    try {
      await once(probe, 'listening');
    } finally {
      probe.close();
    }
    await new Promise(resolve => setTimeout(resolve, 120));
    assert.equal(byes, 0);
  } finally {
    client.stop();
    await server.close();
  }
});

test('an accepted call resumes hangup after TCP reconnect without another opening or call notification', async () => {
  let registrations = 0;
  let answers = 0;
  let byes = 0;
  const errors: Error[] = [];
  const server = await sipServer((message, peer) => {
    if (message instanceof SipRequest && message.method === 'REGISTER') {
      registrations++;
      peer.write(responseFor(message).toString());
    } else if (message instanceof SipRequest && message.method === 'BYE') {
      byes++;
      peer.write(responseFor(message).toString());
    } else if (message instanceof SipResponse && message.statusCode === 200) {
      answers++;
      if (answers === 1) {
        peer.destroy();
      } else {
        peer.write(ackFor(message).toString());
      }
    }
  });
  const client = SipClient({ username: 'user', password: 'mock', serverHost: '127.0.0.1', serverPort: server.port, reconnectDelayMs: 15 });
  let calls = 0;
  client.on('invite', () => { calls++; });
  client.on('callError', error => errors.push(error));
  try {
    await client.register();
    [...server.connections][0].write(invite('reconnect-before-ack').toString());
    await waitUntil(() => calls === 1);
    client.endCalls();
    await waitUntil(() => byes === 1);
    assert.equal(answers, 2);
    assert.equal(registrations, 2);
    assert.equal(calls, 1);
    assert.equal(errors.length, 0);
  } finally {
    client.stop();
    await server.close();
  }
});
