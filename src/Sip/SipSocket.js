import EventEmitter from 'node:events';
import { createSocket } from 'dgram';
import { CLIENT_PORT, SERVER_PORT } from './Constants.js';
import { createOkResponse } from './Messages/ResponseMessages.js';
import SipResponse from './Messages/SipResponse.js';
import SipRequest from './Messages/SipRequest.js';
import RequestBucket from './RequestBucket.js';
import { getLocalIpAddress } from './Utils.js';

export const EVENT_CONNECTED = 'connected';
export const EVENT_REQUEST = 'request';
export const EVENT_MESSAGE = 'message';
export const EVENT_ERROR = 'error';
export const EVENT_CONNECT_ERROR = 'connectionError';

export default class SipSocket {
  constructor(host, port = null, listenIp = null, listenPort = null) {
    this.host = host;
    this.port = port || SERVER_PORT;
    this.listenIp = listenIp || getLocalIpAddress();
    this.listenPort = listenPort || CLIENT_PORT;

    this.socket = createSocket('udp4');
    this.event = new EventEmitter();

    this.isBinded = false;
  }

  confirmRequest(request) {
    RequestBucket.storeRequest(request);
    this
      .sendMessage(createOkResponse(request, this))
      // .sendMessage(createTryingResponse(request))
      // .then(() => this.sendMessage(createRingingResponse(request)))
      // .then(() => this.sendMessage(createOkResponse(request, this)))
      .then(() => RequestBucket.completeRequest(request));
  }

  __onMessage(message) {
    this.event.emit(EVENT_MESSAGE, message);
    if (message.length < 4) {
      return;
    }

    if (message.startsWith('SIP')) { // is response
      const response = SipResponse.parse(message);

      if (response.statusCode > 200) {
        RequestBucket.resolveResponse(response);
      }
    } else { // is new request
      const request = SipRequest.parse(message);

      if (!RequestBucket.getStoredRequest(request.id)) {
        this.confirmRequest(request);
        this.event.emit(EVENT_REQUEST, request);
      }
    }
  }

  bind() {
    if (this.isBinded) {
      return;
    }

    this.isBinded = true;
    this.socket.bind(this.listenPort, this.listenIp);

    this.socket.on('error', (error) => {
      console.error('UDP socket closed unexpectedly', error);
      this.socket.close();
      this.event.emit(EVENT_CONNECT_ERROR, error);
    });

    this.socket.on('connect', () => {
      this.event.emit(EVENT_CONNECTED);
    });

    this.socket.on('message', (buffer) => {
      this.__onMessage(buffer.toString());
    });
  }

  sendMessage(SipMessage) {
    this.bind();
    const message = SipMessage.toString();

    return new Promise((resolve, reject) => {
      this.socket.send(message, 0, message.length, Number(this.port), this.host, (error) => {
        if (error) {
          this.event.emit(EVENT_ERROR, error);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  };

  fetch(SipRequest) {
    return new Promise((resolve, reject) => {
      this.sendMessage(SipRequest)
        .then(() => RequestBucket.addResponseResolver(SipRequest.id, resolve))
        .catch((error) => reject(error));
    });
  };

  on(event, callback) {
    this.event.on(event, callback);
  }
}