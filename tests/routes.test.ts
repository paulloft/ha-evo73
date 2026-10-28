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
    assert.deepEqual(await (await fetch(`${base}/devices`)).json(), { doorphones: [{ id: 123, address: 'Test doorphone' }] });
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
