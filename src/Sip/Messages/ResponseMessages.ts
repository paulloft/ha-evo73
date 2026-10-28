import type SipRequest from './SipRequest.js';
import type { SipHeaders } from '../Types.js';
import { getHeader, getHeaderValues } from '../Types.js';
import SipResponse from './SipResponse.js';
import { generateBranch } from '../Utils.js';

export function createResponse(
  statusCode: number,
  request: SipRequest,
  headers: SipHeaders = {},
  body = '',
  tag = generateBranch(),
): SipResponse {
  const to = getHeader(request.headers, 'To');
  const route = getHeaderValues(request.headers, 'Record-Route');
  return new SipResponse({
    headers: {
      From: getHeader(request.headers, 'From'),
      To: /;\s*tag=/i.test(to) ? to : `${to};tag=${tag}`,
      Via: getHeaderValues(request.headers, 'Via'),
      CSeq: getHeader(request.headers, 'CSeq'),
      'Call-ID': getHeader(request.headers, 'Call-ID'),
      ...(route.length ? { 'Record-Route': route } : {}),
      ...headers,
    },
    statusCode,
    body,
  });
}

export function createTryingResponse(request: SipRequest): SipResponse {
  return createResponse(100, request);
}

export function createRingingResponse(request: SipRequest, tag?: string): SipResponse {
  return createResponse(180, request, {}, '', tag);
}

export function createOkResponse(request: SipRequest, tag?: string): SipResponse {
  return createResponse(200, request, {}, '', tag);
}
