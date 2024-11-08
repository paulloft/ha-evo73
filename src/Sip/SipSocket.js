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
export const EVENT_CLOSE_CONNECTION = 'close';

export default class SipSocket {
  constructor(host, port = null, listenIp = null, listenPort = null) {
    this.host = host;
    this.port = port || SERVER_PORT;
    this.listenIp = listenIp || getLocalIpAddress();
    this.listenPort = listenPort || CLIENT_PORT;

    this.socket = null;
    this.event = new EventEmitter();
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

      if (response.statusCode >= 200) {
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
    if (this.socket) {
      return;
    }

    this.socket = createSocket('udp4');
    this.socket.bind(this.listenPort, this.listenIp);

    this.socket.on('error', (error) => {
      this.event.emit(EVENT_CONNECT_ERROR, error);
      this.socket.close();
    });

    this.socket.on('connect', () => {
      this.event.emit(EVENT_CONNECTED);
    });

    this.socket.on('close', () => {
      this.event.emit(EVENT_CLOSE_CONNECTION);
      this.socket = null;
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

  close() {
    if (this.socket) {
      this.socket.close();
    }
  }

  fetch(SipRequest) {
    return new Promise((resolve, reject) => {
      this.sendMessage(SipRequest)
        .then(() => RequestBucket.addResponseResolver(SipRequest.id, resolve, reject))
        .catch((error) => reject(error));
    });
  };

  on(event, callback) {
    this.event.on(event, callback);
  }
}