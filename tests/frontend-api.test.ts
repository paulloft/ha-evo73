import { test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { getUrl, sendRequest, ApiError } from '../app/src/Utils.js';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
afterEach(() => {
  mock.restoreAll();
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});

function setLocation(pathname: string): void {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { pathname } } });
}

test('frontend API preserves Home Assistant ingress paths', () => {
  setLocation('/api/hassio_ingress/session/');
  assert.equal(getUrl('/sendcall'), '/api/hassio_ingress/session/sendcall');
  setLocation('/');
  assert.equal(getUrl('/devices'), '/devices');
});

test('successful authorization is parsed exactly once and exposes its result', async () => {
  setLocation('/api/hassio_ingress/session/');
  const response = new Response('{"authorized":true}', { status: 200 });
  const parser = mock.method(response, 'json');
  mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(input, '/api/hassio_ingress/session/auth?code=0123');
    assert.equal(init?.signal?.aborted, false);
    return response;
  });
  const controller = new AbortController();
  assert.deepEqual(await sendRequest('/auth?code=0123', { signal: controller.signal }), { authorized: true });
  assert.equal(parser.mock.callCount(), 1);
});

test('API failures expose a displayable error and HTTP status for auth redirects', async () => {
  setLocation('/');
  mock.method(globalThis, 'fetch', async () => new Response('{"error":"Неверный код авторизации"}', { status: 403 }));
  await assert.rejects(sendRequest('/auth?code=bad'), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 403);
    assert.equal(error.message, 'Неверный код авторизации');
    return true;
  });
});
