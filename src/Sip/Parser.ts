import { BR } from './Constants.js';
import type { SipHeaders } from './Types.js';
import { getHeaderValues } from './Types.js';
import { explode } from './Utils.js';

const HEADER_NAMES: Readonly<Record<string, string>> = {
  via: 'Via',
  v: 'Via',
  from: 'From',
  f: 'From',
  to: 'To',
  t: 'To',
  'call-id': 'Call-ID',
  i: 'Call-ID',
  cseq: 'CSeq',
  contact: 'Contact',
  m: 'Contact',
  'content-length': 'Content-Length',
  l: 'Content-Length',
  'record-route': 'Record-Route',
};

export function parseMessage(message: string): [string, SipHeaders, string] {
  const [headersString, body] = explode(BR + BR, message, 2);
  const [subject, ...lines] = headersString.replace(/\r\n[ \t]+/g, ' ').split(BR);
  if (!subject) {
    throw new Error('Empty SIP message');
  }
  const headers: SipHeaders = {};
  for (const line of lines) {
    const match = /^([^:]+):\s*(.*)$/.exec(line);
    if (!match) {
      throw new Error('Invalid SIP header');
    }
    const header = HEADER_NAMES[match[1].trim().toLowerCase()] || match[1].trim();
    const value = match[2].trim();
    if (header === 'Content-Length') {
      headers[header] = Number(value);
    } else if (['Via', 'Record-Route', 'Contact'].includes(header)) {
      headers[header] = [...getHeaderValues(headers, header), value];
    } else {
      headers[header] = value;
    }
  }
  return [subject, headers, body];
}
