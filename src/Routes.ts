import { getIntParam } from './Utils/Params.js';
import { getDevices, getDoorphone, getFirstDeviceId, getStreamUrl, openDoor } from './Evo/DoorPhone.js';
import { getInfo, getSnapshotImageResponse, sendWebhook } from './Actions.js';
import { createToken, sendSms, sendCall } from './Evo/SecureApi.js';
import type { createWebserver } from './Webserver.js';
import HttpException from './Utils/HttpException.js';
import SipAgent from './SipAgent.js';

export function registerRoutes(webserver: ReturnType<typeof createWebserver>): void {
  webserver.add('get', '/info', () => getInfo());
  webserver.add('get', '/sendsms', () => sendSms());
  webserver.add('get', '/sendcall', () => sendCall());
  webserver.add('get', '/auth', async (params) => {
    const code = params.get('code');
    if (!code) {
      throw HttpException('Код подтверждения не был получен');
    }

    const response = await createToken(code);
    SipAgent.start();
    return response;
  });

  webserver.add('get', '/devices', () => getDevices());
  webserver.add('get', '/open', (params) => openDoor(
    getIntParam(params, 'deviceId'),
    getIntParam(params, 'doorNum') ?? 1,
  ));
  webserver.add('get', '/stream', async (params, _request, response) => {
    const high = !['0', 'false'].includes(params.get('high') || '1');
    const streamUrl = await getStreamUrl(getIntParam(params, 'deviceId'), high);
    response.writeHead(302, { Location: streamUrl });
  });

  webserver.add('get', '/snapshot', getSnapshotImageResponse);
  webserver.add('get', '/test-webhook', async (params) => {
    const deviceId = getIntParam(params, 'deviceId') ?? await getFirstDeviceId();
    const doorphone = await getDoorphone(deviceId);

    const response = await sendWebhook(doorphone);
    return { status: true, response };
  });
}
