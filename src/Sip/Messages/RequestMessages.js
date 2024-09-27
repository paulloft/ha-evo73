import { generateBranch, generateCallId } from '../Utils.js';
import digest from 'digest-header';
import SipRequest from './SipRequest.js';
import { EXPIRES, PROTOCOL, TRANSPORT, USER_AGENT } from '../Constants.js';
import RequestBucket from '../RequestBucket.js';

export function createRequest(config, method, headers, body = '') {
  const methodName = method.toUpperCase();
  return new SipRequest({
    method: methodName,
    requestUri: `sip:${config.serverHost}:${config.serverPort}`,
    headers: {
      Via: `${PROTOCOL}/${TRANSPORT.toUpperCase()} ${config.clientIp}:${config.clientPort};branch=${generateBranch()}`,
      Contact: `<sip:${config.username}@${config.clientIp}:${config.clientPort}>`,
      From: `<sip:${config.username}@${config.serverHost}>;tag=${generateBranch()}`,
      To: `<sip:${config.username}@${config.serverHost}>`,
      'User-Agent': USER_AGENT,
      'Max-Forwards': '70',
      ...headers,
      CSeq: `${RequestBucket.getRequestNumber()} ${methodName}`,
    },
    body,
  });
}

export function copyRequest(request, headers) {
  const [via] = request.headers.Via.split(';');
  return new SipRequest({
    method: request.method,
    requestUri: request.requestUri,
    headers: {
      ...request.headers,
      Via: `${via};branch=${generateBranch()}`,
      ...headers,
      CSeq: `${RequestBucket.getRequestNumber()} ${request.method}`,
    },
    body: request.body,
  });
}

export function createAuthRequest(config, request, response) {
  const { headers } = response;
  const isProxyAuth = typeof headers['WWW-Authenticate'] === 'undefined';
  const requestHeaderName = isProxyAuth ? 'Proxy-Authenticate' : 'WWW-Authenticate';
  const responseHeaderName = isProxyAuth ? 'Proxy-Authorization' : 'Authorization';

  const { method, requestUri } = request;

  const digestAuth = digest(
    method,
    requestUri,
    headers[requestHeaderName],
    `${config.username}:${config.password}`,
  );

  return copyRequest(request, {
    'Call-ID': headers['Call-ID'] || generateCallId(),
    [responseHeaderName]: digestAuth,
    Expires: EXPIRES,
  });
}

export function createRegisterRequest(config) {
  return createRequest(config, 'REGISTER', {
    'Call-ID': generateCallId(),
  });
}
