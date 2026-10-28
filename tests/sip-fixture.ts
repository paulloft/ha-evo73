import { createServer, type Socket } from 'node:net';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import SipRequest from '../src/Sip/Messages/SipRequest.js';
import SipResponse from '../src/Sip/Messages/SipResponse.js';
import { getHeader, type SipHeaders } from '../src/Sip/Types.js';

export async function waitUntil(condition: () => boolean, timeout = 1500): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!condition()) {
    assert.ok(Date.now() < deadline, 'Timed out waiting for SIP test condition');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

export function responseFor(request: SipRequest, status = 200, headers: SipHeaders = {}): SipResponse {
  return new SipResponse({ statusCode: status, headers: {
    'Call-ID': getHeader(request.headers, 'Call-ID'),
    CSeq: getHeader(request.headers, 'CSeq'),
    ...headers,
  } });
}

export function invite(id: string, method = 'INVITE'): SipRequest {
  return new SipRequest({ method, requestUri: 'sip:user@localhost', headers: {
    'Call-ID': id, CSeq: `42 ${method}`, Via: ['SIP/2.0/TCP localhost;branch=branch'],
    From: '<sip:door@localhost>;tag=door', To: '<sip:user@localhost>',
    'Record-Route': ['<sip:proxy1;lr>', '<sip:proxy2;lr>'],
  } });
}

export async function sipServer(handle: (message: SipRequest | SipResponse, socket: Socket) => void) {
  const connections = new Set<Socket>();
  const messages: (SipRequest | SipResponse)[] = [];
  const server = createServer(socket => {
    connections.add(socket);
    socket.setNoDelay(true);
    socket.on('close', () => connections.delete(socket));
    socket.on('error', () => {});
    let buffer = Buffer.alloc(0);
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, typeof chunk === 'string' ? Buffer.from(chunk) : chunk]);
      while (buffer.length) {
        if (buffer.subarray(0, 2).toString() === '\r\n') { buffer = buffer.subarray(2); continue; }
        const separator = buffer.indexOf('\r\n\r\n');
        if (separator < 0) return;
        const length = Number(/^(?:Content-Length|l):\s*(\d+)/im.exec(buffer.subarray(0, separator).toString())?.[1] || 0);
        const end = separator + 4 + length;
        if (buffer.length < end) return;
        const raw = buffer.subarray(0, end).toString();
        buffer = buffer.subarray(end);
        const message = raw.startsWith('SIP/2.0 ') ? SipResponse.parse(raw) : SipRequest.parse(raw);
        messages.push(message);
        handle(message, socket);
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return {
    port: address.port,
    connections,
    messages,
    close: async () => {
      for (const socket of connections) socket.destroy();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}
