import SipMessage from './SipMessage.js';
import { RESPONSES } from '../Constants.js';
import { parseMessage } from '../Parser.js';
import { explode } from '../Utils.js';
import type { MessageOptions } from '../Types.js';

interface ResponseOptions extends MessageOptions {
  statusCode?: number;
  statusName?: string;
}

export default class SipResponse extends SipMessage {
  readonly statusCode: number;
  readonly statusName: string;

  constructor({ statusCode = 200, statusName, ...options }: ResponseOptions) {
    super(options);
    this.statusCode = statusCode;
    this.statusName = statusName || RESPONSES[statusCode] || 'Unknown';
  }

  static parse(message: string): SipResponse {
    const [subject, headers, body] = parseMessage(message);
    const [protocol, statusCode, statusName] = explode(' ', subject, 3);
    return new SipResponse({ protocol, statusName, statusCode: Number(statusCode), headers, body });
  }

  override getSubject(): string {
    return `${this.protocol} ${this.statusCode} ${this.statusName}`;
  }
}
