import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createDigestAuthorization } from '../src/Sip/Digest.js';

test('digest authentication matches the RFC 2617 reference vector', () => {
  const nonce = 'dcd98b7102dd2f0e8b11d0f600bfb0c093';
  const header = createDigestAuthorization('GET', '/dir/index.html',
    `Digest realm="testrealm@host.com", qop="auth,auth-int", nonce="${nonce}", opaque="5ccc069c403ebaf9f0171e9517f40e41"`,
    'Mufasa', 'Circle Of Life', { nonce, cnonce: '0a4f113b', count: 0 });
  assert.ok(header.includes('response="6629fae49393a05397450978507c4ef1"'));
  assert.ok(header.includes('nc=00000001'));
});

test('long-lived clients use hexadecimal nonce counters and reset only their own nonce state', () => {
  const state = { nonce: '', cnonce: '', count: 0 };
  const another = { nonce: '', cnonce: '', count: 0 };
  const challenge = 'Digest realm="sip", nonce="one", qop="auth"';
  for (let i = 0; i < 9; i++) {
    createDigestAuthorization('REGISTER', 'sip:host', challenge, 'user', 'password', state);
  }
  const tenth = createDigestAuthorization('REGISTER', 'sip:host', challenge, 'user', 'password', state);
  assert.ok(tenth.includes('nc=0000000a'));
  const independent = createDigestAuthorization('REGISTER', 'sip:host', challenge, 'user', 'password', another);
  assert.ok(independent.includes('nc=00000001'));
  const changed = createDigestAuthorization('REGISTER', 'sip:host', challenge.replace('"one"', '"two"'), 'user', 'password', state);
  assert.ok(changed.includes('nc=00000001'));
});

test('session algorithms, auth-int and SHA-512-256 keep their authorization responses', () => {
  const cases = [
    { algorithm: 'SHA-256-sess', qop: 'auth-int', response: '38207ed673fceb677e41e9e0d4b022ea3b1be9093ae5bbb4f46a88a927843803' },
    { algorithm: 'MD5-sess', qop: undefined, response: 'fdd36404e3154d9f99ac43c970d7b3d7' },
    { algorithm: 'SHA-512-256', qop: 'auth', response: 'ce8c69e97e7da953a0952bc61b5b4a8e172897b5ed5e44458b1ef8f9c88ccd6a' },
  ];
  for (const { algorithm, qop, response } of cases) {
    let challenge = `Digest realm="sip", nonce="nonce", algorithm=${algorithm}`;
    if (qop) {
      challenge += `, qop="${qop}"`;
    }
    const header = createDigestAuthorization('REGISTER', 'sip:host', challenge, 'user', 'pass:word',
      { nonce: 'nonce', cnonce: 'fixed-client-nonce', count: 0 }, 'Привет');
    assert.ok(header.includes(`response="${response}"`), algorithm);
    assert.ok(header.includes('cnonce="fixed-client-nonce"'));
    assert.equal(header.includes('nc=00000001'), qop !== undefined);
  }
});

test('invalid or unsupported challenges do not consume the nonce counter', () => {
  const state = { nonce: 'nonce', cnonce: 'fixed', count: 4 };
  const challenges = [
    'Basic realm="sip"',
    'Digest realm="sip"',
    'Digest realm="sip", nonce="nonce", algorithm=unknown',
    'Digest realm="sip", nonce="nonce", qop="unknown"',
  ];
  for (const challenge of challenges) {
    assert.throws(() => createDigestAuthorization('REGISTER', 'sip:host', challenge, 'user', 'password', state));
    assert.deepEqual(state, { nonce: 'nonce', cnonce: 'fixed', count: 4 });
  }
});

test('passwords containing colons are hashed in full and legacy no-qop challenges work', () => {
  const hash = (value: string) => createHash('md5').update(value).digest('hex');
  const header = createDigestAuthorization('REGISTER', 'sip:host', 'Digest realm="sip", nonce="nonce"', 'user', 'pass:word', { nonce: '', cnonce: '', count: 0 });
  const expected = hash(`${hash('user:sip:pass:word')}:nonce:${hash('REGISTER:sip:host')}`);
  assert.ok(header.includes(`response="${expected}"`));
  assert.ok(!header.includes('qop='));
});
