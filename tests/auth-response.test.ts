import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAuthResponse, readAuthResponse } from '../src/Evo/AuthResponse.js';

test('auth response accepts supported token envelopes without trusting field types', () => {
  for (const value of [
    { token: 'token' }, { data: { token: 'token' } }, { data: { saToken: 'token' } },
    { saToken: 'token' }, { access_token: 'token' },
  ]) {
    assert.equal(parseAuthResponse(value).token, 'token');
  }
  for (const value of [null, [], 42, 'token', { token: 42 }, { data: { token: {} } }]) {
    assert.equal(parseAuthResponse(value).token, undefined);
  }
  assert.equal(parseAuthResponse({ token: 42, data: { token: 'valid' } }).token, 'valid');
});

test('auth response extracts status and error messages and tolerates non-JSON failures', async () => {
  assert.equal(parseAuthResponse({ data: { status: 'ok' } }).status, 'ok');
  assert.equal(parseAuthResponse({ error: { message: 'WRONG_CODE' } }).message, 'WRONG_CODE');
  assert.equal(parseAuthResponse({ message: 'Operations is blocked' }).message, 'Operations is blocked');
  assert.equal(parseAuthResponse({ error: 'Invalid code' }).message, 'Invalid code');
  assert.equal(parseAuthResponse({ error: { message: 42 } }).message, undefined);
  assert.deepEqual(await readAuthResponse(new Response('<html>Bad gateway</html>', { status: 502 })), {
    token: undefined, status: undefined, message: undefined,
  });
});
