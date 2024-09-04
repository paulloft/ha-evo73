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
      From: `<sip:${config.username}@${config.serverHost}>;tag=${generateBranch()}`,
      To: `<sip:${config.username}@${config.serverHost}>`,
      Contact: `<sip:${config.username}@${config.clientIp}:${config.clientPort}>`,
      CSeq: `${RequestBucket.getRequestNumber()} ${methodName}`,
      'User-Agent': USER_AGENT,
      'Max-Forwards': '70',
      ...headers,
    },
    body,
  });
}

export function createAuthRequest(config, method, requestUri, headers) {
  const isProxyAuth = typeof headers['WWW-Authenticate'] === 'undefined';
  const requestHeaderName = isProxyAuth ? 'Proxy-Authenticate' : 'WWW-Authenticate';
  const responseHeaderName = isProxyAuth ? 'Proxy-Authorization' : 'Authorization';

  const digestAuth = digest(
    method,
    requestUri,
    headers[requestHeaderName],
    `${config.username}:${config.password}`,
  );

  return createRequest(config, method, {
    'Call-ID': headers['Call-ID'] || generateCallId(),
    Expires: EXPIRES,
    [responseHeaderName]: digestAuth,
  });
}

export function createRegisterRequest(config) {
  return createRequest(config, 'REGISTER', {
    'Call-ID': generateCallId(),
  });
}
