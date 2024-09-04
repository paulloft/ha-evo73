import { getDevices } from './Evo/DoorPhone.js';
import SipClient, { EVENT_INVITE } from './Sip/SipClient.js';
import { sendWebhook } from './Actions.js';

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
}

function start() {
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
