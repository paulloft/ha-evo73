import env from 'custom-env';
import { getDevices, getDoorphone, getFirstDeviceId, getStreamUrl, openDoor } from './Evo/DoorPhone.js';
import { getInfo, getSnapshotImageResponse, sendWebhook } from './Actions.js';
import { createToken, isTokenProvided, sendSms } from './Evo/SecureApi.js';
import Webserver, { getServerUrl } from './Webserver.js';
import HttpException from './Utils/HttpException.js';
import SipAgent from './SipAgent.js';
import Logger from './Logger.js';

env.env('local').env();

if (!process.env.APP_PHONE_NUMBER) {
  Logger.warn('[ERROR] Номер телефона не указан в настройках окружения');
  Logger.info('[INFO] Создайте файл .env.local с содержимым APP_PHONE_NUMBER=79000000000');
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
  const high = parseInt(params.get('high'), 10);
  const streamUrl = await getStreamUrl(params.get('deviceId'), !!high);
  response.writeHead(302, { Location: streamUrl });
});

Webserver.add('get', '/snapshot', getSnapshotImageResponse);
Webserver.add('get', '/test-webhook', async (params) => {
  const deviceId = params.get('deviceId') || await getFirstDeviceId();
  const doorphone = await getDoorphone(parseInt(deviceId, 10));

  return sendWebhook(doorphone).then((response) => ({ status: true, response }));
});

Webserver.start(() => {
  Logger.info('------------------------------------------------------------------------------------------');
  Logger.info(`  EVO 73 Управление домофоном. Web Сервер запущен по адресу: ${getServerUrl()}`);
  Logger.info('------------------------------------------------------------------------------------------');
  Logger.info('  Получить список устройств           /devices');
  Logger.info('  Получить ссылку на стрим с камеры   /stream?deviceId=<int|null>&high=<bool|true>');
  Logger.info('  Получить изображение с камеры       /snapshot?deviceId=<int|null>&compress=<bool|false>');
  Logger.info('  Открыть дверь                       /open?deviceId=<int|null>&doorNum=<int|null>');
  Logger.info('  Имитация события звонка в дверь     /test-webhook?deviceId=<int|null>');
  Logger.info('------------------------------------------------------------------------------------------');
  if (!isTokenProvided()) {
    Logger.warn('  [ВНИМАНИЕ] Токен авторизации отсутствует!');
    Logger.warn('  Откройте Web-интерфейс и пройдите процедуру первичной авторизации.');
    Logger.warn('------------------------------------------------------------------------------------------');
  }
});

SipAgent.start();
