import { randomUUID } from 'node:crypto';
import HttpException from '../Utils/HttpException.js';

export interface CallEvent {
  id: string;
  deviceId: number;
  timestamp: string;
}

export interface CallEventsResponse {
  cursor: string;
  events: CallEvent[];
}

export class CallEvents {
  private readonly instanceId = randomUUID();
  private sequence = 0;
  private readonly events: CallEvent[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(private readonly capacity = 256, private readonly timeoutMs = 25000) {}

  publish(deviceId: number): CallEvent {
    const event = { id: `${this.instanceId}:${++this.sequence}`, deviceId, timestamp: new Date().toISOString() };
    this.events.push(event);
    if (this.events.length > this.capacity) {
      this.events.shift();
    }
    for (const listener of this.listeners) {
      listener();
    }
    return event;
  }

  private read(cursor: string | null): CallEventsResponse {
    const result = { cursor: `${this.instanceId}:${this.sequence}`, events: [] as CallEvent[] };
    if (!cursor) {
      return result;
    }
    const match = /^([\da-f-]{36}):(\d+)$/.exec(cursor);
    if (!match) {
      throw HttpException('Некорректный курсор событий');
    }
    // A restarted server starts a new journal; never replay calls from an old one.
    if (match[1] === this.instanceId) {
      result.events = this.events.filter(event => Number(event.id.split(':')[1]) > Number(match[2]));
    }
    return result;
  }

  poll(cursor: string | null, signal: AbortSignal): Promise<CallEventsResponse> {
    const current = this.read(cursor);
    if (!cursor || current.events.length || !cursor.startsWith(`${this.instanceId}:`) || signal.aborted) {
      return Promise.resolve(current);
    }
    return new Promise(resolve => {
      const finish = () => {
        clearTimeout(timer);
        this.listeners.delete(finish);
        signal.removeEventListener('abort', finish);
        resolve(this.read(cursor));
      };
      const timer = setTimeout(finish, this.timeoutMs);
      this.listeners.add(finish);
      signal.addEventListener('abort', finish, { once: true });
    });
  }
}

export const callEvents = new CallEvents();
