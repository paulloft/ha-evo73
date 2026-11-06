import type { SipConfig } from '../Types.js';
import { getHeader, getHeaderValues } from '../Types.js';
import SipRequest from './SipRequest.js';
import { createRequest } from './RequestMessages.js';

export function getSipUri(value: string): string {
  const uri = /<(sips?:[^>]+)>/i.exec(value)?.[1] ?? /^(sips?:[^\s,]+)/i.exec(value)?.[1];
  if (!uri) {
    throw new Error('Missing SIP dialog target');
  }
  return uri;
}

export function getTag(value: string): string {
  return /;\s*tag=([^;\s>]+)/i.exec(value)?.[1] ?? '';
}

export function createByeRequest(config: SipConfig, invite: SipRequest, localTo: string): SipRequest {
  const remoteTarget = getSipUri(getHeader(invite.headers, 'Contact'));
  const routes = getHeaderValues(invite.headers, 'Record-Route').flatMap(value => value.split(/,(?=\s*<?sips?:)/i));
  let target = remoteTarget;
  // UAS keeps Record-Route order; strict routers become the Request-URI.
  if (routes.length && !/;lr(?:[;>]|$)/i.test(routes[0])) {
    target = getSipUri(routes.shift()!);
    routes.push(`<${remoteTarget}>`);
  }
  const request = createRequest(config, 'BYE', {
    From: localTo,
    To: getHeader(invite.headers, 'From'),
    'Call-ID': getHeader(invite.headers, 'Call-ID'),
    ...(routes.length ? { Route: routes } : {}),
  });
  return new SipRequest({ method: 'BYE', requestUri: target, headers: request.headers });
}
