import SipResponse from './SipResponse.js';
import { parseParams } from '../Parser.js';
import { EXPIRES } from '../Constants.js';
import { explode } from '../Utils.js';
import RequestBucket from '../RequestBucket.js';

export function createResponse(statusCode, request, headers = {}, body = '') {
  const { From, To, CSeq, Via } = request.headers;

  const [to, paramsString] = explode(';', To, 2);
  const { tag } = parseParams(paramsString);
  return new SipResponse({
    headers: {
      From,
      To: `${to};tag=${tag || RequestBucket.getRequestTag(request)}`,
      Via,
      CSeq,
      'Call-ID': request.headers['Call-ID'],
      Expires: EXPIRES,
      ...headers,
    },
    statusCode,
    body,
  });
}

export function createTryingResponse(request) {
  return createResponse(100, request);
}

export function createRingingResponse(request) {
  return createResponse(180, request);
}

export function createOkResponse(request, socket) {
  const Via = [...request.headers.Via];
  Via[0] = `${Via[0]};received=${socket.listenIp};rport=${socket.listenPort}`;

  return createResponse(200, request, {
    Via,
  });
}