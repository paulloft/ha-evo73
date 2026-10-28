import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FrameBuffer, SIP_PING, SIP_PONG } from '../src/Sip/FrameBuffer.js';
import { invite } from './sip-fixture.js';

test('fragmented TCP keepalive and SIP frames are read without consuming the next message', () => {
  const frames = new FrameBuffer();
  const message = invite('incoming').toString();
  frames.append(Buffer.from(SIP_PONG));
  assert.equal(frames.read(), null);
  frames.append(Buffer.from(SIP_PONG + SIP_PONG + message + message));
  assert.equal(frames.read(), SIP_PING);
  assert.equal(frames.read(), message);
  assert.equal(frames.read(), message);
  assert.equal(frames.read(), null);
});

test('SIP framing rejects malformed lengths and oversized messages before buffering their bodies', () => {
  for (const length of ['-1', 'abc', '1048577']) {
    const frames = new FrameBuffer();
    frames.append(Buffer.from(`MESSAGE sip:user SIP/2.0\r\nContent-Length: ${length}\r\n\r\n`));
    assert.throws(() => frames.read(), /Content-Length|maximum size/);
  }
  const headers = new FrameBuffer();
  headers.append(Buffer.alloc(1048577, 'x'));
  assert.throws(() => headers.read(), /headers exceed maximum size/);
});
