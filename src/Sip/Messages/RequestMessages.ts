import type { SipConfig, SipHeaders } from '../Types.js';
import { getHeader } from '../Types.js';
import type SipResponse from './SipResponse.js';
import { generateBranch, generateCallId } from '../Utils.js';
import { createDigestAuthorization } from '../Digest.js';
import SipRequest from './SipRequest.js';
import { EXPIRES, PROTOCOL, TRANSPORT, USER_AGENT } from '../Constants.js';

export function createRequest(config: SipConfig, method: string, headers: SipHeaders, body = ''): SipRequest {
  const methodName = method.toUpperCase();
  config.sequence = (config.sequence || 0) + 1;
  config.callId ||= generateCallId();
  config.fromTag ||= generateBranch();
  const login = config.login || `${config.username}@${config.serverHost}`;
  return new SipRequest({
    method: methodName,
    requestUri: `sip:${config.serverHost}:${config.serverPort}`,
    headers: {
      Via: `${PROTOCOL}/${TRANSPORT.toUpperCase()} ${config.clientIp}:${config.clientPort};branch=${generateBranch()};rport`,
      Contact: `<sip:${config.username}@${config.clientIp}:${config.clientPort};transport=${TRANSPORT}>`,
      From: `<sip:${login}>;tag=${config.fromTag}`,
      To: `<sip:${login}>`,
      'Call-ID': config.callId,
      'User-Agent': USER_AGENT,
      'Max-Forwards': '70',
      ...headers,
      CSeq: `${config.sequence} ${methodName}`,
    },
    body,
  });
}

export function copyRequest(request: SipRequest, headers: SipHeaders, sequence: number): SipRequest {
  const [via] = getHeader(request.headers, 'Via').split(';');
  return new SipRequest({
    method: request.method,
    requestUri: request.requestUri,
    headers: {
      ...request.headers,
      Via: `${via};branch=${generateBranch()};rport`,
      ...headers,
      CSeq: `${sequence} ${request.method}`,
    },
    body: request.body,
  });
}

export function createAuthRequest(config: SipConfig, request: SipRequest, response: SipResponse): SipRequest {
  const challenge = getHeader(response.headers, 'WWW-Authenticate');
  const isProxyAuth = !challenge;
  config.sequence = (config.sequence || 0) + 1;
  config.digest ||= { nonce: '', cnonce: '', count: 0 };
  return copyRequest(request, {
    [isProxyAuth ? 'Proxy-Authorization' : 'Authorization']: createDigestAuthorization(
      request.method,
      request.requestUri,
      challenge || getHeader(response.headers, 'Proxy-Authenticate'),
      config.username, config.password, config.digest, request.body,
    ),
  }, config.sequence);
}

export function createRegisterRequest(config: SipConfig): SipRequest {
  return createRequest(config, 'REGISTER', { Expires: EXPIRES });
}
