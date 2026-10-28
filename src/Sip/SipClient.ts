import type { SipConfig, ClientOptions } from './Types.js';
import { getHeader, getHeaderValues } from './Types.js';
import type SipRequest from './Messages/SipRequest.js';
import type SipResponse from './Messages/SipResponse.js';
import EventEmitter from 'node:events';
import { generateBranch } from './Utils.js';
import { createAuthRequest, createRegisterRequest } from './Messages/RequestMessages.js';
import { createResponse } from './Messages/ResponseMessages.js';
import { KEEPALIVE_INTERVAL, RECONNECT_TIMEOUT, SERVER_PORT, REQUEST_TIMEOUT } from './Constants.js';
import SipSocket, { EVENT_CLOSE_CONNECTION, EVENT_CONNECT_ERROR, EVENT_REQUEST, EVENT_ERROR } from './SipSocket.js';

export const EVENT_INVITE = 'invite';
export const EVENT_BYE = 'bye';
export const EVENT_REGISTER = 'register';
export const EVENT_CLOSE = 'close';
export const EVENT_REGISTRATION_ERROR = 'registrationError';

const MAX_TRACKED_CALLS = 100;

interface IncomingCall {
  request: SipRequest;
  tag: string;
  status: 180 | 487 | 603;
}

interface ClientEvents {
  invite: [SipRequest];
  bye: [SipRequest];
  register: [SipResponse];
  close: [];
  registrationError: [Error];
}

export default function SipClient(options: ClientOptions) {
  const config: SipConfig = {
    username: options.username,
    password: options.password,
    login: options.login,
    serverHost: options.serverHost,
    serverPort: options.serverPort ?? SERVER_PORT,
    clientIp: options.clientIp || '0.0.0.0',
    clientPort: options.clientPort ?? 0,
  };
  const socket = new SipSocket(
    config.serverHost,
    config.serverPort,
    options.clientIp,
    options.clientPort,
    options.requestTimeoutMs ?? REQUEST_TIMEOUT,
  );
  const eventBus = new EventEmitter<ClientEvents>();
  const calls = new Map<string, IncomingCall>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<SipResponse> | null = null;
  let stopped = false;

  function clearTimer(): void {
    if (timer) {
      clearTimeout(timer);
    }
    timer = null;
  }

  function schedule(delay: number): void {
    if (stopped) {
      return;
    }
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void register().catch(() => {
        // register() reports failures and schedules its own retry.
      });
    }, delay);
  }

  function refreshDelay(response: SipResponse): number {
    const endpoint = `@${config.clientIp}:${config.clientPort}`;
    const contact = getHeaderValues(response.headers, 'Contact')
      .flatMap(value => value.split(/,(?=\s*<?sip:)/i))
      .find(value => value.includes(`${endpoint};`) || value.includes(`${endpoint}>`));
    const granted = contact ? /;\s*expires\s*=\s*(\d+)/i.exec(contact)?.[1] : undefined;
    const expires = granted ?? getHeader(response.headers, 'Expires');
    const interval = options.refreshIntervalMs ?? KEEPALIVE_INTERVAL;
    if (expires === '') {
      return interval;
    }
    const seconds = Number(expires);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      throw new Error('SIP registrar did not grant an active registration');
    }
    return Math.min(interval, seconds * 500);
  }

  async function performRegistration(): Promise<SipResponse> {
    await socket.connect();
    if (stopped) {
      throw new Error('SIP client is stopped');
    }
    // Advertise the actual TCP endpoint selected by the OS, not a guessed LAN IP.
    config.clientIp = socket.listenIp;
    config.clientPort = socket.listenPort;
    const request = createRegisterRequest(config);
    let response = await socket.fetch(request);
    if ([401, 407].includes(response.statusCode)) {
      response = await socket.fetch(createAuthRequest(config, request, response));
    }
    if (response.statusCode !== 200) {
      throw new Error(`SIP REGISTER failed: ${response.statusCode} ${response.statusName}`);
    }
    if (stopped) {
      throw new Error('SIP client is stopped');
    }
    schedule(refreshDelay(response));
    eventBus.emit(EVENT_REGISTER, response);
    return response;
  }

  function register(): Promise<SipResponse> {
    if (stopped) {
      return Promise.reject(new Error('SIP client is stopped'));
    }
    if (inFlight) {
      return inFlight;
    }
    clearTimer();
    inFlight = performRegistration().catch((error: unknown) => {
      reconnect(error);
      throw error;
    }).finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  function reconnect(error: unknown): void {
    if (stopped) {
      return;
    }
    const failure = error instanceof Error ? error : new Error(String(error));
    eventBus.emit(EVENT_REGISTRATION_ERROR, failure);
    socket.close();
    // Retry even if the failure left the transport open (e.g. 403/timeout).
    schedule(options.reconnectDelayMs ?? RECONNECT_TIMEOUT);
  }

  function reply(code: number, request: SipRequest, tag: string): void {
    void socket.sendMessage(createResponse(code, request, {}, '', tag)).catch(reconnect);
  }

  function declineCalls(): void {
    if (stopped) {
      return;
    }
    for (const call of calls.values()) {
      if (call.status === 180) {
        // A global rejection also stops other forked destinations ringing.
        call.status = 603;
        reply(603, call.request, call.tag);
      }
    }
  }

  socket.on(EVENT_REQUEST, request => {
    if (stopped) {
      return;
    }
    const id = getHeader(request.headers, 'Call-ID');
    const existing = calls.get(id);
    const tag = existing?.tag || generateBranch();
    switch (request.method) {
      case 'INVITE':
        // Observe the call. A 200 here would answer it and stop the phone ringing.
        reply(existing?.status ?? 180, request, tag);
        if (existing?.status === 180) {
          existing.request = request;
        }
        if (!existing) {
          calls.set(id, { request, tag, status: 180 });
          if (calls.size > MAX_TRACKED_CALLS) {
            const oldest = calls.keys().next().value;
            if (oldest !== undefined) {
              calls.delete(oldest);
            }
          }
          eventBus.emit(EVENT_INVITE, request);
        }
        break;
      case 'CANCEL':
        reply(200, request, tag);
        if (existing?.status === 180) {
          existing.status = 487;
          reply(487, existing.request, tag);
        }
        break;
      case 'BYE':
        if (existing?.status === 180) {
          existing.status = 487;
        }
        reply(200, request, tag);
        eventBus.emit(EVENT_BYE, request);
        break;
      case 'OPTIONS':
      case 'MESSAGE':
      case 'INFO':
      case 'NOTIFY':
        reply(200, request, tag);
        break;
      case 'ACK':
        break;
      default:
        reply(405, request, tag);
    }
  });

  socket.on(EVENT_CLOSE_CONNECTION, () => {
    clearTimer();
    if (!stopped) {
      schedule(options.reconnectDelayMs ?? RECONNECT_TIMEOUT);
    }
    eventBus.emit(EVENT_CLOSE);
  });
  socket.on(EVENT_CONNECT_ERROR, error => {
    if (!stopped) {
      eventBus.emit(EVENT_REGISTRATION_ERROR, error);
    }
  });
  socket.on(EVENT_ERROR, error => {
    if (!stopped) {
      eventBus.emit(EVENT_REGISTRATION_ERROR, error);
    }
  });

  function stop(): void {
    stopped = true;
    clearTimer();
    socket.close();
    calls.clear();
  }

  return { register, stop, declineCalls, socket, on: eventBus.on.bind(eventBus), once: eventBus.once.bind(eventBus) };
}
