import { getDevices } from './Evo/DoorPhone.js';
import SipClient, { EVENT_INVITE } from './Sip/SipClient.js';
import { isTokenProvided } from './Evo/SecureApi.js';
import { sendWebhook } from './Actions.js';
import { EVENT_MESSAGE, EVENT_REQUEST } from './Sip/SipSocket.js';

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

  sipClient.register().then(() => {
    console.log('SIP Agent running');
  }).catch((error) => {
    console.error('SIP Agent error: ', error);
  });

  sipClient.on(EVENT_INVITE, () => sendWebhook(doorphone));
  sipClient.socket.on(EVENT_REQUEST, (message) => console.log(message));
}

function start() {
  if (started || !process.env.APP_WEBHOOK_URL || !isTokenProvided()) {
    console.log('WEBHOOK_URL is not defined. SIP agent will not start');
    return;
  }

  started = true;

  console.log('Starting SIP agent ...');

  /**
   * @var {{doorphones: []}} response
   */
  getDevices().then((response) => {
    response.doorphones.forEach((doorphone) => connectSocket(doorphone));
  }).catch((error) => {
    console.error(error);
  });
}

export default {
  start,
  connectSocket,
};
