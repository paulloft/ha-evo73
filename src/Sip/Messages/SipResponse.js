import SipMessage from './SipMessage.js';
import { RESPONSES } from '../Constants.js';
import { parseMessage } from '../Parser.js';
import { explode } from '../Utils.js';

export default class SipResponse extends SipMessage {
  constructor({ id, protocol, statusCode, statusName, headers, body }) {
    super({ id, protocol, headers, body });
    this.statusCode = statusCode || 200;
    this.statusName = statusName || RESPONSES[statusCode] || 'Unknown';
  }

  static parse(message) {
    const [subject, headers, body] = parseMessage(message);
    const [protocol, statusCode, statusName] = explode(' ', subject, 3);

    return new SipResponse({
      protocol,
      statusName,
      statusCode: parseInt(statusCode, 10),
      headers,
      body,
    });
  }

  getSubject() {
    return `${this.protocol} ${this.statusCode} ${this.statusName}`;
  }
}