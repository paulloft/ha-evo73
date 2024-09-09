import env from 'custom-env';
import { createToken, isTokenProvided, sendSms } from './Evo/SecureApi.js';
import { getDevices, getDoorphone, getFirstDeviceId, getStreamUrl, openDoor } from './Evo/DoorPhone.js';
import Webserver, { getServerUrl } from './Webserver.js';
import HttpException from './HttpException.js';
import { getSnapshotImageResponse, renderWebPage, sendWebhook } from './Actions.js';
import SipAgent from './SipAgent.js';

env.env('local').env();

if (!process.env.APP_PHONE_NUMBER) {
  console.warn('[ERROR] Номер телефона не указан в настройках окружения');
  console.info('[INFO] Создайте файл .env.local с содержимым APP_PHONE_NUMBER=79000000000');
  process.exit(1);
}
Webserver.add('get', '/', () => renderWebPage());
Webserver.add('get', '/sendsms', () => sendSms());
Webserver.add('get', '/auth', (URLSearchParams) => {
  const code = URLSearchParams.get('code');
  if (!code || !code.length) {
    throw HttpException('Код подтверждения не был получен');
  }

  return createToken(code);
});

Webserver.add('get', '/devices', getDevices);
Webserver.add('get', '/open', (params) => openDoor(
  params.get('deviceId'),
  params.get('doorNum'),
));
Webserver.add('get', '/stream', async (params, request, response) => {
  const high = params.get('high');
  const streamUrl = await getStreamUrl(params.get('deviceId'), high === undefined ? true : high);
  response.writeHead(302, { Location: streamUrl });
});

Webserver.add('get', '/snapshot', getSnapshotImageResponse);
Webserver.add('get', '/test-webhook', async (params) => {
  const doorphoneID = params.get('deviceId') || await getFirstDeviceId();
  const doorphone = await getDoorphone(doorphoneID);

  return sendWebhook(doorphone).then((response) => ({ status: true, response }));
});

const serverUrl = getServerUrl();

Webserver.start(() => {
  console.info('------------------------------------------------------------------------------------------');
  console.info(`  EVO 73 Управление домофонами. Web Сервер запущен по адресу: ${serverUrl}`);
  console.info('------------------------------------------------------------------------------------------');
  console.info('  Получить список устройств           /devices');
  console.info('  Получить ссылку на стрим с камеры   /stream?deviceId=<int|null>&high=<bool|true>');
  console.info('  Получить изображение с камеры       /snapshot?deviceId=<int|null>&compress=<bool|false>');
  console.info('  Открыть дверь                       /open?deviceId=<int|null>&doorNum=<int|null>');
  console.info('  Имитация события звонка в дверь     /test-webhook?deviceId=<int|null>');
  console.info('------------------------------------------------------------------------------------------');
});

if (!isTokenProvided()) {
  console.warn('------------------------------------------------------------------------------------------');
  console.warn('  Токен авторизации отсутствует!');
  console.warn(`  Запросите СМС с кодом авторизации перейдя по ссылке ${serverUrl}/sendsms`);
  console.warn(`  Затем введите полученный код ${serverUrl}/auth?code=<your_code>`);
  console.warn('------------------------------------------------------------------------------------------');
} else if (process.env.APP_WEBHOOK_URL) {
  SipAgent.start();
}


