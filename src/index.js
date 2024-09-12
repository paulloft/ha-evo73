import env from 'custom-env';
import { createToken, isTokenProvided, sendSms } from './Evo/SecureApi.js';
import { getDevices, getDoorphone, getFirstDeviceId, getStreamUrl, openDoor } from './Evo/DoorPhone.js';
import Webserver, { getServerUrl } from './Webserver.js';
import HttpException from './Utils/HttpException.js';
import { getInfo, getSnapshotImageResponse, sendWebhook } from './Actions.js';
import SipAgent from './SipAgent.js';

env.env('local').env();

if (!process.env.APP_PHONE_NUMBER) {
  console.warn('[ERROR] Номер телефона не указан в настройках окружения');
  console.info('[INFO] Создайте файл .env.local с содержимым APP_PHONE_NUMBER=79000000000');
  process.exit(1);
}

Webserver.add('get', '/info', () => getInfo());
Webserver.add('get', '/sendsms', () => sendSms());
Webserver.add('get', '/auth', (URLSearchParams) => {
  const code = URLSearchParams.get('code');
  if (!code || !code.length) {
    throw HttpException('Код подтверждения не был получен');
  }

  return createToken(code).then((response) => {
    SipAgent.start();
    return response;
  });
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
  const deviceId = params.get('deviceId') || await getFirstDeviceId();
  const doorphone = await getDoorphone(parseInt(deviceId, 10));

  return sendWebhook(doorphone).then((response) => ({ status: true, response }));
});

Webserver.start(() => {
  console.info('------------------------------------------------------------------------------------------');
  console.info(`  EVO 73 Управление домофоном. Web Сервер запущен по адресу: ${getServerUrl()}`);
  console.info('------------------------------------------------------------------------------------------');
  console.info('  Получить список устройств           /devices');
  console.info('  Получить ссылку на стрим с камеры   /stream?deviceId=<int|null>&high=<bool|true>');
  console.info('  Получить изображение с камеры       /snapshot?deviceId=<int|null>&compress=<bool|false>');
  console.info('  Открыть дверь                       /open?deviceId=<int|null>&doorNum=<int|null>');
  console.info('  Имитация события звонка в дверь     /test-webhook?deviceId=<int|null>');
  console.info('------------------------------------------------------------------------------------------');
  if (!isTokenProvided()) {
    console.warn('  [ВНИМАНИЕ] Токен авторизации отсутствует!');
    console.warn('  Откройте Web-интерфейс и пройдите процедуру первичной авторизации.');
    console.info('------------------------------------------------------------------------------------------');
  }
});

SipAgent.start();
