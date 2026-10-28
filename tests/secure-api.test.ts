import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { getErrorStatus } from '../src/Utils/HttpException.js';
import Storage from '../src/Storage.js';
import SecureApi, { sendCall, sendSms, createToken, isTokenProvided, startTokenRefresh } from '../src/Evo/SecureApi.js';

interface CapturedCall { url: string; method: string; body: Record<string, unknown>; headers: Headers }
let values: Map<string, string>;
let calls: CapturedCall[];
let replies: (Response | ((request: Request) => Response))[];
const single = 'https://id.evo73.ru';
const main = 'https://api.app.evo73.ru/api';
const dp = 'https://doorphone.app.evo73.ru/api';
const json = (body: unknown, status = 200, headers: HeadersInit = {}) => new Response(JSON.stringify(body), { status, headers });

beforeEach(() => {
  values = new Map();
  calls = [];
  replies = [];
  mock.method(Storage, 'get', (key: string) => values.get(key) ?? null);
  mock.method(Storage, 'save', (key: string, value: string) => values.set(key, value));
  process.env.APP_PHONE_NUMBER = '+7 (900) 000-00-00';
  mock.method(globalThis, 'fetch', async (request: Request) => {
    const body = request.method === 'GET' ? {} : JSON.parse(await request.text()) as Record<string, unknown>;
    calls.push({ url: request.url, method: request.method, body, headers: request.headers });
    assert.ok(replies.length, `Unexpected request: ${request.url}`);
    const reply = replies.shift()!;
    return typeof reply === 'function' ? reply(request) : reply;
  });
});
afterEach(() => mock.restoreAll());

function expectHeaders() {
  const uuids = new Set();
  for (const call of calls) {
    assert.equal(call.headers.get('Origin'), 'capacitor://localhost');
    assert.equal(call.headers.get('Referer'), 'capacitor://localhost/');
    assert.equal(call.headers.get('X-Device-Platform'), 'android');
    assert.equal(call.headers.get('X-Device-Version'), '4.0.33');
    assert.equal(call.headers.get('Content-Type'), 'application/json');
    assert.ok(call.headers.get('User-Agent')?.includes('Mozilla'));
    uuids.add(call.headers.get('X-Device-UUID'));
  }
  assert.equal(uuids.size, 1);
}

test('keepalive renews token every 20 minutes without keeping the process alive', async () => {
  let tick: (() => void) | undefined;
  let unref = false;
  mock.method(globalThis, 'setInterval', (callback: () => void, delay: number) => {
    assert.equal(delay, 20 * 60 * 1000);
    tick = callback;
    return { unref() { unref = true; } };
  });
  startTokenRefresh();
  assert.ok(unref);
  values.set('doorphone_token', 'old');
  replies.push(json({}, 200, { Authorization: 'Bearer renewed' }));
  assert.ok(tick);
  tick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(values.get('doorphone_token'), 'renewed');
  assert.equal(calls[0].url, `${dp}/auth/refresh`);
});

test('call login exchanges SingleAuth, main and doorphone tokens before reporting success', async () => {
  replies.push(json({ data: { status: 'ok' } }), json({ data: { token: 'single' } }), json({ token: 'main' }), json({ token: 'doorphone' }));
  await sendCall();
  assert.deepEqual(await createToken('0123'), { authorized: true });
  assert.deepEqual(calls.map(c => c.url), [`${single}/auth/login`, `${single}/auth/code-confirm`, `${main}/v2/single-auth/main-token`, `${main}/v1/authIntercom`]);
  assert.deepEqual(calls[0].body, { phone: '79000000000', isSms: false });
  assert.deepEqual(calls[1].body, { phone: '79000000000', code: '0123', isSms: false });
  assert.deepEqual(calls[2].body, { token: 'single' });
  assert.equal(calls[3].headers.get('Authorization'), 'Bearer main');
  assert.equal(values.get('single_token'), 'single');
  assert.equal(values.get('token'), 'main');
  assert.equal(values.get('doorphone_token'), 'doorphone');
  assert.ok(isTokenProvided());
  expectHeaders();
});

test('SMS mode persists and supports alternate token envelopes from Python fork', async () => {
  replies.push(json({ data: { status: 'ok' } }), json({ data: { saToken: 'sa' } }), json({ data: { token: 'main' } }), json({ token: 'dp' }));
  await sendSms();
  await createToken('123456');
  assert.equal(calls[0].body.isSms, true);
  assert.equal(calls[1].body.isSms, true);
  assert.equal(values.get('single_token'), 'sa');
});

test('failed code request does not change last successful mode', async () => {
  values.set('auth_is_sms', 'false');
  replies.push(json({ message: 'rate limit' }, 429));
  await assert.rejects(sendSms(), (error: unknown) => getErrorStatus(error) === 429);
  assert.equal(values.get('auth_is_sms'), 'false');
});

test('missing token and invalid codes fail without performing token exchange', async () => {
  replies.push(json({ data: {} }));
  await assert.rejects(createToken('1234'), (error: unknown) => getErrorStatus(error) === 502);
  assert.equal(calls.length, 1);
  assert.equal(isTokenProvided(), false);
  replies.push(json({ message: 'WRONG_CODE' }, 403));
  await assert.rejects(createToken('1234'), /Неверный код/);
  replies.push(new Response('<html>upstream unavailable</html>', { status: 503 }));
  await assert.rejects(createToken('1234'), (error: unknown) => getErrorStatus(error) === 503);
});

test('exchange failure cannot report successful authorization', async () => {
  replies.push(json({ token: 'sa' }), json({ message: 'unavailable' }, 503));
  await assert.rejects(createToken('1234'), /Не удалось получить токен домофона/);
  assert.equal(values.get('doorphone_token'), undefined);
});

test('doorphone 401 renews directly using Authorization response header and retries once', async () => {
  values.set('doorphone_token', 'old');
  replies.push(json({}, 401), json({ status: true }, 200, { Authorization: 'Bearer new' }), json({ doorphones: [] }));
  assert.deepEqual(await SecureApi.getJson('doorphone://client/doorphone'), { doorphones: [] });
  assert.equal(calls[1].url, `${dp}/auth/refresh`);
  assert.equal(calls[2].headers.get('Authorization'), 'Bearer new');
  assert.equal(values.get('doorphone_token'), 'new');
});

test('expired doorphone falls back to SingleAuth exchange and refreshes SingleAuth if needed', async () => {
  values.set('doorphone_token', 'expired');
  values.set('single_token', 'old-sa');
  replies.push(json({}, 403), json({}, 401), json({}, 401), json({ data: { token: 'new-sa' } }), json({ token: 'main' }), json({ token: 'new-dp' }), json({ ok: true }));
  assert.deepEqual(await SecureApi.getJson('doorphone://client/doorphone'), { ok: true });
  assert.equal(calls[3].url, `${single}/auth/refresh`);
  assert.equal(calls[3].method, 'POST');
  assert.equal(calls[3].headers.get('Authorization'), 'Bearer old-sa');
  assert.deepEqual(calls[4].body, { token: 'new-sa' });
  assert.equal(calls.at(-1)!.headers.get('Authorization'), 'Bearer new-dp');
});

test('parallel 401 requests rotate the invalidated token only once', async () => {
  values.set('doorphone_token', 'old');
  replies.push(json({}, 401), json({}, 401), json({}, 200, { Authorization: 'Bearer new' }), json({ ok: 1 }), json({ ok: 2 }));
  await Promise.all([SecureApi.getJson('doorphone://client/doorphone'), SecureApi.getJson('doorphone://client/profile')]);
  assert.equal(calls.filter(c => c.url.endsWith('/auth/refresh')).length, 1);
  assert.equal(values.get('doorphone_token'), 'new');
});

test('failed recovery stops, clears unusable token and does not continue to authIntercom', async () => {
  values.set('doorphone_token', 'expired');
  replies.push(json({}, 401), json({}, 401));
  await assert.rejects(SecureApi.getJson('doorphone://client/doorphone'), (error: unknown) => getErrorStatus(error) === 401);
  assert.equal(calls.length, 2);
  assert.equal(isTokenProvided(), false);
});

test('non-auth and network errors do not attempt token refresh', async () => {
  replies.push(json({}, 500));
  await assert.rejects(SecureApi.getJson('doorphone://client/doorphone'), (error: unknown) => getErrorStatus(error) === 500);
  replies.push(() => { throw new TypeError('network down'); });
  await assert.rejects(SecureApi.getJson('doorphone://client/doorphone'), /Не удалось выполнить запрос/);
  assert.equal(calls.length, 2);
});

test('a rejected retry cannot loop or leave authorization marked as valid', async () => {
  values.set('doorphone_token', 'old');
  replies.push(json({}, 401), json({}, 200, { Authorization: 'Bearer new' }), json({}, 401));
  await assert.rejects(SecureApi.getJson('doorphone://client/doorphone'), (error: unknown) => getErrorStatus(error) === 401);
  assert.equal(calls.length, 3);
  assert.equal(isTokenProvided(), false);
});
