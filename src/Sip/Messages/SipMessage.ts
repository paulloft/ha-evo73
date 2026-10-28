import { BR, PROTOCOL } from '../Constants.js';
import type { MessageOptions, SipHeaders } from '../Types.js';
import { getHeader } from '../Types.js';

export default class SipMessage {
  readonly id: string;
  readonly protocol: string;
  readonly headers: SipHeaders;
  readonly body: string;

  constructor({ id, protocol, headers, body = '' }: MessageOptions) {
    this.id = id || getHeader(headers, 'CSeq');
    this.protocol = protocol || PROTOCOL;
    this.headers = { ...headers, 'Content-Length': Buffer.byteLength(body) };
    this.body = body;
  }

  getSubject(): string {
    return this.protocol;
  }

  toString(): string {
    const headers = Object.entries(this.headers).flatMap(([header, value]) => {
      if (value === undefined) {
        return [];
      }
      return (Array.isArray(value) ? value : [value]).map(item => `${header}: ${item}`);
    });
    return [this.getSubject(), ...headers, '', this.body].join(BR);
  }
}
