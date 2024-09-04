import { BR } from './Constants.js';
import { explode } from './Utils.js';

export function parseMessage(message) {
  const [headersString, body] = message.split(BR + BR);
  const headersLines = headersString.split(BR);
  const subject = headersLines.shift();

  const headers = {};

  headersLines.forEach((line) => {
    const [header, value] = explode(': ', line, 2);

    switch (header) {
      case 'Content-Length':
        headers[header] = parseInt(value, 10);
        break;

      case 'Via':
        if (!headers[header]) {
          headers[header] = [];
        }
        headers[header].push(value);
        break;

      default:
        headers[header] = value;
        break;
    }
  });

  return [subject, headers, body];
}

export function parseParams(string) {
  const result = {};

  string.split(';').forEach((paramValue) => {
    const [param, value] = paramValue.split('=');
    result[param] = value;
  });

  return result;
}

export function parseVia(via) {
  //Via: SIP/2.0/UDP 192.168.10.179:53478;received=109.195.195.191;rport=53478;branch=z9hG4bK6140842449809X2
  const [protocol, viaString] = via.split(' ');
  const [listenClient, params] = explode(';', viaString, 2);

  return {
    protocol,
    listenClient,
    ...parseParams(params),
  };
}