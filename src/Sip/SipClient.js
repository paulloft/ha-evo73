import EventEmitter from 'node:events';
import { getLocalIpAddress } from './Utils.js';
import { createAuthRequest, createRegisterRequest } from './Messages/RequestMessages.js';
import { CLIENT_PORT, KEEPALIVE_INTERVAL, SERVER_PORT } from './Constants.js';
import SipSocket, { EVENT_CLOSE_CONNECTION, EVENT_CONNECT_ERROR, EVENT_REQUEST } from './SipSocket.js';
import Logger from '../Logger.js';

export const EVENT_INVITE = 'invite';
export const EVENT_BYE = 'bye';
export const EVENT_REGISTER = 'register';
export const EVENT_CLOSE = 'close';

function sendRequest(socket, config, SipRequest) {
  return socket.fetch(SipRequest).then((response) => {
    const { statusCode, statusName } = response;

    if (statusCode >= 200 && statusCode < 300) {
      return response;
    }

    if (response.statusCode === 401 || response.statusCode === 407) {
      return socket
        .fetch(createAuthRequest(config, SipRequest, response))
        .then((response) => {
          if (response.statusCode !== 200) {
            throw new Error('Failed to authenticate on SIP server', { cause: response });
          }

          return response;
        });
    }

    throw new Error(`${statusName}`, { cause: response });
  });
}

export default function SipClient({ username, password, serverHost, serverPort = null, clientIp = null, clientPort = null }) {
  const config = {
    username,
    password,
    serverHost,
    serverPort: serverPort || SERVER_PORT,
    clientPort: clientPort || CLIENT_PORT, // random port for udp connection
    clientIp: clientIp || getLocalIpAddress(), // current client IP address
  };

  const socket = new SipSocket(serverHost, serverPort, clientIp, clientPort);
  const eventBus = new EventEmitter();
  let keepAliveTimer = null;

  function stopKeepAlive() {
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
  }

  function startKeepAlive() {
    if (keepAliveTimer) {
      return;
    }

    keepAliveTimer = setInterval(() => {
      sendRequest(socket, config, createRegisterRequest(config)).catch(() => {
        socket.close();
        stopKeepAlive();
      });
    }, KEEPALIVE_INTERVAL);
  }

  const register = () => {
    return sendRequest(socket, config, createRegisterRequest(config)).then((response) => {
      eventBus.emit(EVENT_REGISTER);
      startKeepAlive();

      return response;
    });
  };

  socket.on(EVENT_REQUEST, (SipRequest) => {
    switch (SipRequest.method) {
      case 'INVITE':
        eventBus.emit(EVENT_INVITE, SipRequest);
        break;

      case 'BYE':
        eventBus.emit(EVENT_BYE, SipRequest);
        break;

      default:
        Logger.warn(`Unknown method ${SipRequest.method}`);
        Logger.debug('Unknown method request', SipRequest);
    }
  });

  socket.on(EVENT_CLOSE_CONNECTION, () => {
    stopKeepAlive();
    eventBus.emit(EVENT_CLOSE);
  });

  socket.on(EVENT_CONNECT_ERROR, (error) => {
    Logger.error('UDP socket closed unexpectedly', error);
  });

  return {
    register,
    socket,
    on: (event, callback) => {
      eventBus.on(event, callback);
    },
  };
}
