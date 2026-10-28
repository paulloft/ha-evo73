import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createWebserver } from '../src/Webserver.js';
import HttpException from '../src/Utils/HttpException.js';

process.env.APP_WEBSERVER_PORT = '0';
const web = createWebserver();
web.add('get', '/info', () => ({ authorized: false, number: '' }));
web.add('get', '/auth', params => {
  if (!params.get('code')) throw HttpException('Код подтверждения не был получен');
  return { authorized: true };
});
web.add('get', '/rejected', () => Promise.reject(HttpException('Требуется авторизация', 401)));
web.add('get', '/upstream', () => Promise.reject(new Response('', { status: 403 })));
web.add('get', '/stream', (_params, _request, response) => { response.redirect(302, 'https://example.com/video.m3u8'); });
web.add('get', '/snapshot', (_params, _request, response) => { response.type('image/jpeg').send(Buffer.from([255, 216, 255])); });
web.add('post', '/echo', params => ({ code: params.get('code') }));
const server = web.start();
await once(server, 'listening');
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));

test('HTTP JSON contracts and async errors survive the Express migration', async () => {
  assert.deepEqual(await (await fetch(`${base}/info`)).json(), { authorized: false, number: '' });
  const invalid = await fetch(`${base}/auth`);
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { code: 400, error: 'Код подтверждения не был получен', status: false });
  assert.deepEqual(await (await fetch(`${base}/auth?code=0123`)).json(), { authorized: true });
  for (const [path, status] of [['rejected', 401], ['upstream', 403]] as const) {
    const response = await fetch(`${base}/${path}`);
    assert.equal(response.status, status);
    assert.equal((await response.json() as { status: boolean }).status, false);
  }
});

test('stream redirects and binary snapshots are sent once', async () => {
  const stream = await fetch(`${base}/stream`, { redirect: 'manual' });
  assert.equal(stream.status, 302);
  assert.equal(stream.headers.get('location'), 'https://example.com/video.m3u8');
  const image = await fetch(`${base}/snapshot`);
  assert.equal(image.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), Buffer.from([255, 216, 255]));
});

test('JSON and form bodies are parsed and malformed JSON returns 400', async () => {
  for (const [contentType, body] of [['application/json', '{"code":"0123"}'], ['application/x-www-form-urlencoded', 'code=0123']]) {
    const response = await fetch(`${base}/echo`, { method: 'POST', headers: { 'Content-Type': contentType }, body });
    assert.deepEqual(await response.json(), { code: '0123' });
  }
  const response = await fetch(`${base}/echo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(response.status, 400);
});

test('unknown routes return JSON and static file traversal is rejected', async () => {
  for (const path of ['/missing', '/%2e%2e/package.json', '/%2e%2e/.env.local']) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 404);
    assert.equal((await response.json() as { code: number }).code, 404);
  }
});
