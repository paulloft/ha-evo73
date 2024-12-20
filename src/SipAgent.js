import { getDevices } from './Evo/DoorPhone.js';
import SipClient, { EVENT_CLOSE, EVENT_INVITE } from './Sip/SipClient.js';
import { isTokenProvided } from './Evo/SecureApi.js';
import { sendWebhook } from './Actions.js';
import { RECONNECT_TIMEOUT } from './Sip/Constants.js';
import Logger from './Logger.js';

let started = false;

/**
 * @param {{
 *  id: int,
 *  door_open_url: string,
 *  address: string,
 *  apartment: int,
 *  apartment_sip_settings: {
 *    login: string,
 *    sip_address: string,
 *    sip_name: string,
 *    sip_password: string,
 *  },
 * }} doorphone
 */
function connectSocket(doorphone) {
  const config = doorphone.apartment_sip_settings;
  const [username] = config.login.split('@');
  const [serverHost, serverPort] = config.sip_address.split(':');

  const sipClient = SipClient({
    username,
    password: config.sip_password,
    serverHost,
    serverPort,
  });

  const register = () => {
    sipClient.register()
      .then(() => Logger.log('SIP Agent running'))
      .catch((error) => Logger.error('SIP Agent error: ', error));
  };

  sipClient.socket.on('message', (message) => Logger.debug('onMessage', message));

  sipClient.on(EVENT_INVITE, () => sendWebhook(doorphone));
  sipClient.on(EVENT_CLOSE, () => {
    Logger.log('SIP socket closed. Reconnecting...');
    setTimeout(() => register(), RECONNECT_TIMEOUT);
  });

  register();
}

function start() {
  if (started || !process.env.APP_WEBHOOK_URL || !isTokenProvided()) {
    Logger.warn('WEBHOOK_URL is not defined. SIP agent will not start');
    return;
  }

  started = true;

  Logger.log('Starting SIP agent ...');

  /**
   * @var {{doorphones: []}} response
   */
  getDevices().then((response) => {
    response.doorphones.forEach((doorphone) => connectSocket(doorphone));
  }).catch((error) => Logger.error(error));
}

export default {
  start,
  connectSocket,
};
