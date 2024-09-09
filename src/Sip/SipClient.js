import EventEmitter from 'node:events';
import { getLocalIpAddress } from './Utils.js';
import { createAuthRequest, createRegisterRequest } from './Messages/RequestMessages.js';
import { CLIENT_PORT, SERVER_PORT } from './Constants.js';
import SipSocket, { EVENT_REQUEST } from './SipSocket.js';

export const EVENT_INVITE = 'invite';
export const EVENT_BYE = 'bye';
export default function SipClient({ username, password, serverHost, serverPort = null, clientIp = null, clientPort = null }) {
  const config = {
    username,
    password,
    serverHost,
    serverPort: serverPort || SERVER_PORT,
    clientIp: clientIp || getLocalIpAddress(), // current client IP address
    clientPort: clientPort || CLIENT_PORT, // random port for udp connection
  };

  const socket = new SipSocket(serverHost, serverPort, clientIp, clientPort);
  const eventBus = new EventEmitter();

  socket.on(EVENT_REQUEST, (SipRequest) => {
    switch (SipRequest.method) {
      case 'INVITE':
        eventBus.emit(EVENT_INVITE, SipRequest);
        break;

      case 'BYE':
        eventBus.emit(EVENT_BYE, SipRequest);
        break;

      default:
        console.log(`Unknown method ${SipRequest.method}`, SipRequest);
    }
  });

  const register = () => {
    const registerRequest = createRegisterRequest(config);
    return socket.fetch(registerRequest).then((response) => {
      const { statusCode, statusName, headers } = response;

      if (statusCode >= 200 && statusCode < 300) {
        return response;
      }

      if (response.statusCode === 401) {
        return socket
          .fetch(createAuthRequest(config, registerRequest.method, registerRequest.requestUri, headers))
          .then((response) => {
            if (response !== 200) {
              throw new Error('Failed to authenticate on SIP server', { cause: response });
            }
          });
      }

      throw new Error(`${statusName}`, { cause: response });
    });
  };

  return {
    register,
    socket,
    on: (event, callback) => {
      eventBus.on(event, callback);
    },
  };
}
