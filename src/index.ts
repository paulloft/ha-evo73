import { initEnv } from './bootstrap.js';
import { registerRoutes } from './Routes.js';
import { isTokenProvided, startTokenRefresh } from './Evo/SecureApi.js';
import Webserver, { getServerUrl } from './Webserver.js';
import SipAgent from './SipAgent.js';
import Logger from './Logger.js';

initEnv();

if (!process.env.APP_PHONE_NUMBER) {
  Logger.warn('[ERROR] Номер телефона не указан в настройках окружения');
  Logger.info('[INFO] Создайте файл .env.local с содержимым APP_PHONE_NUMBER=79000000000');
  process.exit(1);
}

registerRoutes(Webserver);

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

startTokenRefresh();
SipAgent.start();
