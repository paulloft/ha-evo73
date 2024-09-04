import SipMessage from './SipMessage.js';
import { parseMessage } from '../Parser.js';
import { explode } from '../Utils.js';

export default class SipRequest extends SipMessage {
  constructor({ id, method, requestUri, protocol, headers, body }) {
    super({ id, protocol, headers, body });

    this.method = method;
    this.requestUri = requestUri;
  }

  static parse(message) {
    const [subject, headers, body] = parseMessage(message);
    const [method, requestUri, protocol] = explode(' ', subject, 3);

    return new SipRequest({ method, protocol, requestUri, headers, body });
  }

  getSubject() {
    return `${this.method} ${this.requestUri} ${this.protocol}`;
  }
}