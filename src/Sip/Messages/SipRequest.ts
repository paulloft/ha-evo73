import SipMessage from './SipMessage.js';
import { parseMessage } from '../Parser.js';
import { explode } from '../Utils.js';
import type { MessageOptions } from '../Types.js';

interface RequestOptions extends MessageOptions {
  method: string;
  requestUri: string;
}

export default class SipRequest extends SipMessage {
  readonly method: string;
  readonly requestUri: string;

  constructor({ method, requestUri, ...options }: RequestOptions) {
    super(options);
    this.method = method;
    this.requestUri = requestUri;
  }

  static parse(message: string): SipRequest {
    const [subject, headers, body] = parseMessage(message);
    const [method, requestUri, protocol] = explode(' ', subject, 3);
    return new SipRequest({ method, protocol, requestUri, headers, body });
  }

  override getSubject(): string {
    return `${this.method} ${this.requestUri} ${this.protocol}`;
  }
}
