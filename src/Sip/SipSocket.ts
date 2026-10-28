import EventEmitter from 'node:events';
import { createConnection, type Socket } from 'node:net';
import { CLIENT_PORT, CONNECT_TIMEOUT, REQUEST_TIMEOUT, SERVER_PORT } from './Constants.js';
import { FrameBuffer, SIP_PING, SIP_PONG } from './FrameBuffer.js';
import type SipMessage from './Messages/SipMessage.js';
import SipRequest from './Messages/SipRequest.js';
import SipResponse from './Messages/SipResponse.js';
import { getHeader } from './Types.js';

export const EVENT_CONNECTED = 'connected';
export const EVENT_REQUEST = 'request';
export const EVENT_MESSAGE = 'message';
export const EVENT_ERROR = 'error';
export const EVENT_CONNECT_ERROR = 'connectionError';
export const EVENT_CLOSE_CONNECTION = 'close';

interface SocketEvents {
  connected: [];
  request: [SipRequest];
  message: [string];
  error: [Error];
  connectionError: [Error];
  close: [];
}

interface PendingRequest {
  resolve: (response: SipResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export default class SipSocket {
  readonly host: string;
  readonly port: number;
  private readonly localIp?: string;
  private readonly localPort: number;
  private readonly requestTimeout: number;
  private socket: Socket | null = null;
  private connecting: Promise<void> | null = null;
  private generation = 0;
  private frames = new FrameBuffer();
  private readonly pending = new Map<string, PendingRequest>();
  private readonly event = new EventEmitter<SocketEvents>();

  constructor(
    host: string,
    port?: number | null,
    listenIp?: string | null,
    listenPort?: number | null,
    requestTimeout = REQUEST_TIMEOUT,
  ) {
    this.host = host;
    this.port = port ?? SERVER_PORT;
    this.localIp = listenIp || undefined;
    this.localPort = listenPort ?? CLIENT_PORT;
    this.requestTimeout = requestTimeout;
    this.event.on(EVENT_ERROR, () => {
    });
  }

  get listenIp(): string {
    return this.socket?.localAddress || this.localIp || '0.0.0.0';
  }

  get listenPort(): number {
    return this.socket?.localPort || this.localPort;
  }

  connect(): Promise<void> {
    if (this.connecting) {
      return this.connecting;
    }
    if (this.socket && !this.socket.destroyed) {
      return Promise.resolve();
    }
    const socket = createConnection({ host: this.host, port: this.port, localAddress: this.localIp, localPort: this.localPort });
    this.socket = socket;
    this.frames = new FrameBuffer();
    socket.setKeepAlive(true, 30000);
    socket.setNoDelay(true);
    socket.on('data', chunk => {
      if (this.socket === socket) {
        this.onData(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
    });
    socket.on('error', error => this.event.emit(EVENT_CONNECT_ERROR, error));
    socket.on('close', () => {
      if (this.socket !== socket) {
        return;
      }
      this.socket = null;
      this.generation++;
      this.rejectPending(new Error('SIP TCP connection closed'));
      this.event.emit(EVENT_CLOSE_CONNECTION);
    });
    const connection = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => socket.destroy(new Error('SIP TCP connection timeout')), CONNECT_TIMEOUT);
      const failed = (error: Error) => {
        cleanup();
        reject(error);
      };
      const closed = () => failed(new Error('SIP TCP connection closed before connecting'));
      const connected = () => {
        cleanup();
        this.event.emit(EVENT_CONNECTED);
        resolve();
      };
      const cleanup = () => {
        clearTimeout(timeout);
        socket.off('error', failed);
        socket.off('close', closed);
        socket.off('connect', connected);
      };
      socket.once('error', failed);
      socket.once('close', closed);
      socket.once('connect', connected);
    });
    this.connecting = connection.finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private key(message: SipMessage): string {
    return `${getHeader(message.headers, 'Call-ID')}\n${getHeader(message.headers, 'CSeq')}`;
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private onData(chunk: Buffer): void {
    this.frames.append(chunk);
    try {
      let message = this.frames.read();
      while (message !== null) {
        if (message === SIP_PING) {
          this.socket?.write(SIP_PONG);
        } else {
          this.handleMessage(message);
        }
        message = this.frames.read();
      }
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      this.event.emit(EVENT_ERROR, failure);
      this.socket?.destroy(failure);
    }
  }

  private handleMessage(message: string): void {
    this.event.emit(EVENT_MESSAGE, message);
    if (!message.startsWith('SIP/2.0 ')) {
      this.event.emit(EVENT_REQUEST, SipRequest.parse(message));
      return;
    }

    const response = SipResponse.parse(message);
    const key = this.key(response);
    const pending = this.pending.get(key);
    if (pending && response.statusCode >= 200) {
      clearTimeout(pending.timer);
      this.pending.delete(key);
      pending.resolve(response);
    }
  }

  async sendMessage(message: SipMessage): Promise<void> {
    const generation = this.generation;
    await this.connect();
    if (generation !== this.generation) {
      throw new Error('SIP TCP connection closed');
    }
    const socket = this.socket;
    if (!socket || socket.destroyed) {
      throw new Error('SIP TCP connection is not open');
    }
    await new Promise<void>((resolve, reject) => {
      socket.write(message.toString(), error => error ? reject(error) : resolve());
    });
  }

  close(): void {
    this.generation++;
    this.rejectPending(new Error('SIP TCP connection closed'));
    this.socket?.destroy();
  }

  async fetch(request: SipRequest): Promise<SipResponse> {
    const generation = this.generation;
    await this.connect();
    if (generation !== this.generation) {
      throw new Error('SIP TCP connection closed');
    }
    return new Promise((resolve, reject) => {
      const key = this.key(request);
      const timer = setTimeout(() => {
        this.pending.delete(key);
        reject(new Error('SIP response timeout'));
      }, this.requestTimeout);
      this.pending.set(key, { resolve, reject, timer });
      this.sendMessage(request).catch((error: unknown) => {
        if (!this.pending.has(key)) {
          return;
        }
        clearTimeout(timer);
        this.pending.delete(key);
        reject(error);
      });
    });
  }

  readonly on = this.event.on.bind(this.event);
}
