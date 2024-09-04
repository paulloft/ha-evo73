import { BR, PROTOCOL } from '../Constants.js';

export default class SipMessage {
  constructor({ id, protocol, headers, body = '' }) {
    this.id = id || headers.CSeq;
    this.protocol = protocol || PROTOCOL;
    this.headers = {
      ...headers,
      'Content-Length': body?.length || 0,
    };
    this.body = body;
  }

  getSubject() {
    return this.protocol;
  }

  toString() {
    const headers = [];
    Object.entries(this.headers).forEach(([header, value]) => {
      if (Array.isArray(value)) {
        value.forEach((val) => {
          headers.push(`${header}: ${val}`);
        });
      }

      headers.push(`${header}: ${value}`);
    });

    const messageLines = [
      this.getSubject(),
      ...headers,
      '', // Add empty line to separate headers and body
      this.body,
    ];

    return messageLines.join(BR);
  }
}