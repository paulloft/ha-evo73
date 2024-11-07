export const BR = '\r\n';
export const PROTOCOL = 'SIP/2.0';
export const TRANSPORT = 'udp';
export const USER_AGENT = 'Node.js';

export const SERVER_PORT = 5060;
export const CLIENT_PORT = 53478;

export const RECONNECT_TIMEOUT = 5000;
export const REQUEST_TIMEOUT = 3000;
export const KEEPALIVE_INTERVAL = 60000;

export const EXPIRES = 300;


export const RESPONSES = {
  100: 'Trying',
  180: 'Ringing',
  200: 'OK',
  302: 'Moved Temporarily',
  401: 'Unauthorized',
  404: 'Not Found',
  407: 'Proxy Authentication Required',
  408: 'Request Timeout',
  480: 'Temporarily Unavailable',
  486: 'Busy Here',
  487: 'Request Terminated',
  488: 'Not Acceptable Here',
  500: 'Server Internal Error',
  503: 'Service Unavailable',
  504: 'Server Time-out',
};